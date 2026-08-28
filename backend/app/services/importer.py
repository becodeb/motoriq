"""Importación CSV con preview y mapeo de columnas (§70)."""

import csv
import io
import secrets
from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.core.utils import normalize
from app.models import Organization, User
from app.schemas.customer import CustomerCreate
from app.schemas.vehicle import VehicleCreate
from app.services import audit
from app.services import customers as customers_service

# Previews pendientes en memoria (token → data). Suficiente para una instancia.
_pending: dict[str, dict] = {}
MAX_ROWS = 2000

CUSTOMER_FIELDS = {
    "first_name": ("nombre", "first name", "firstname"),
    "last_name": ("apellido", "last name", "lastname"),
    "phone": ("telefono", "phone", "tel", "celular"),
    "whatsapp": ("whatsapp", "wsp"),
    "email": ("email", "mail", "correo"),
    "source": ("origen", "fuente", "source"),
    "budget": ("presupuesto", "budget"),
    "interest_brand": ("marca", "marca interes", "brand"),
    "interest_model": ("modelo", "modelo interes", "model"),
    "notes": ("notas", "observaciones", "notes"),
}

VEHICLE_FIELDS = {
    "brand": ("marca", "brand"),
    "model": ("modelo", "model"),
    "version": ("version", "trim"),
    "year": ("año", "ano", "year"),
    "km": ("km", "kilometraje", "kms", "kilometros"),
    "price": ("precio", "price"),
    "cost": ("costo", "cost"),
    "plate": ("patente", "dominio", "plate"),
    "fuel": ("combustible", "fuel"),
    "transmission": ("transmision", "caja", "transmission"),
    "color": ("color",),
    "body_type": ("carroceria", "tipo", "body"),
    "description": ("descripcion", "description"),
}


def preview(entity: str, content: bytes) -> dict:
    fields = CUSTOMER_FIELDS if entity == "customers" else VEHICLE_FIELDS
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    sample = text[:4096]
    delimiter = ";" if sample.count(";") > sample.count(",") else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    if not reader.fieldnames:
        raise ApiError("IMPORT_EMPTY", "El archivo no tiene encabezados", 400)

    rows = []
    for i, row in enumerate(reader):
        if i >= MAX_ROWS:
            break
        rows.append({k: (v or "").strip() for k, v in row.items() if k})

    suggested: dict[str, str] = {}
    for column in reader.fieldnames:
        normalized = normalize(column)
        for field, aliases in fields.items():
            if normalized in aliases or normalized == field:
                suggested[column] = field
                break
        else:
            suggested[column] = ""

    token = secrets.token_hex(12)
    _pending[token] = {"entity": entity, "rows": rows}
    if len(_pending) > 20:
        _pending.pop(next(iter(_pending)))

    return {
        "token": token,
        "columns": list(reader.fieldnames),
        "suggested_mapping": suggested,
        "sample_rows": rows[:5],
        "total_rows": len(rows),
    }


def commit(db: Session, org: Organization, actor: User, token: str, mapping: dict[str, str]) -> dict:
    data = _pending.pop(token, None)
    if not data:
        raise ApiError("IMPORT_TOKEN_INVALID", "El preview expiró, volvé a subir el archivo", 400)

    created, skipped = 0, 0
    errors: list[str] = []
    for index, row in enumerate(data["rows"], start=2):
        record: dict[str, Any] = {}
        for column, field in mapping.items():
            if field and column in row and row[column] != "":
                record[field] = row[column]
        try:
            # Savepoint por fila: una fila inválida no arruina la sesión ni el resto del lote.
            with db.begin_nested():
                if data["entity"] == "customers":
                    _import_customer(db, org, actor, record)
                else:
                    _import_vehicle(db, org, actor, record)
            created += 1
        except ApiError as exc:
            skipped += 1
            if len(errors) < 20:
                errors.append(f"Fila {index}: {exc.message}")
        except Exception as exc:
            skipped += 1
            if len(errors) < 20:
                errors.append(f"Fila {index}: {exc}")

    audit.log(
        db, org.id, "importacion", data["entity"], None, actor.id,
        {"creados": created, "salteados": skipped},
    )
    return {"created": created, "skipped": skipped, "errors": errors}


def _import_customer(db: Session, org: Organization, actor: User, record: dict) -> None:
    if not record.get("first_name"):
        raise ApiError("IMPORT_ROW_INVALID", "falta el nombre", 400)
    if record.get("budget"):
        record["budget"] = _to_float(record["budget"])
    # force=False: los duplicados se saltean y quedan reportados como errores de fila.
    payload = CustomerCreate(**record, create_opportunity=True)
    customers_service.create_customer(db, org, actor, payload)


def _import_vehicle(db: Session, org: Organization, actor: User, record: dict) -> None:
    from app.models import Vehicle  # import local para evitar ciclos

    for field in ("year", "km"):
        if record.get(field):
            record[field] = int(_to_float(record[field]))
    for field in ("price", "cost"):
        if record.get(field):
            record[field] = _to_float(record[field])
    payload = VehicleCreate(**record)
    vehicle = Vehicle(organization_id=org.id, **payload.model_dump())
    db.add(vehicle)
    db.flush()


def _to_float(value: str) -> float:
    cleaned = str(value).replace("$", "").replace(".", "").replace(",", ".").strip()
    try:
        return float(cleaned)
    except ValueError:
        # tal vez usaba punto decimal
        try:
            return float(str(value).replace("$", "").replace(",", "").strip())
        except ValueError as exc:
            raise ApiError("IMPORT_ROW_INVALID", f"número inválido: {value}", 400) from exc
