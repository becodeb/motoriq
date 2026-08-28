import csv
import io
import secrets
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select

from app.api.deps import (
    DB,
    CurrentOrg,
    CurrentUser,
    ManagerUser,
    Pagination,
    is_manager,
)
from app.core.config import get_settings
from app.core.constants import VEHICLE_STATUSES
from app.core.errors import ApiError, not_found
from app.core.events import DomainEvent, publish
from app.core.utils import utcnow
from app.models import (
    Customer,
    Opportunity,
    Vehicle,
    VehicleImage,
    VehicleStatusHistory,
)
from app.schemas.common import CustomerBrief, Msg, Page
from app.schemas.vehicle import (
    VehicleCreate,
    VehicleOut,
    VehicleStatsOut,
    VehicleStatusChange,
    VehicleStatusHistoryOut,
    VehicleUpdate,
)
from app.services import audit, stock_intel

router = APIRouter(prefix="/vehicles", tags=["vehicles"])

ALLOWED_IMAGE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}

SORTABLE = {
    "created_at": Vehicle.created_at,
    "price": Vehicle.price,
    "year": Vehicle.year,
    "km": Vehicle.km,
    "entry_date": Vehicle.entry_date,
    "brand": Vehicle.brand,
}


def _serialize(vehicle: Vehicle, user) -> VehicleOut:
    out = VehicleOut.model_validate(vehicle)
    if not is_manager(user):
        out.cost = None  # §37: costos y márgenes solo para gerencia
    return out


def _get_vehicle(db, org, vehicle_id: str) -> Vehicle:
    vehicle = db.get(Vehicle, vehicle_id)
    if not vehicle or vehicle.organization_id != org.id or vehicle.deleted_at:
        raise not_found("vehículo", "VEHICLE_NOT_FOUND")
    return vehicle


@router.get("", response_model=Page[VehicleOut])
def list_vehicles(
    db: DB,
    user: CurrentUser,
    org: CurrentOrg,
    pagination: Pagination,
    q: str | None = None,
    status: str | None = None,
    brand: str | None = None,
    body_type: str | None = None,
    transmission: str | None = None,
    fuel: str | None = None,
    price_min: Annotated[float | None, Query(ge=0)] = None,
    price_max: Annotated[float | None, Query(ge=0)] = None,
    year_min: int | None = None,
    year_max: int | None = None,
    order_by: str = "-created_at",
):
    query = select(Vehicle).where(Vehicle.organization_id == org.id, Vehicle.deleted_at.is_(None))
    if q:
        like = f"%{q.strip()}%"
        query = query.where(
            or_(
                (Vehicle.brand + " " + Vehicle.model).ilike(like),
                Vehicle.version.ilike(like),
                Vehicle.plate.ilike(like),
            )
        )
    if status:
        query = query.where(Vehicle.status == status)
    if brand:
        query = query.where(Vehicle.brand == brand)
    if body_type:
        query = query.where(Vehicle.body_type == body_type)
    if transmission:
        query = query.where(Vehicle.transmission == transmission)
    if fuel:
        query = query.where(Vehicle.fuel == fuel)
    if price_min is not None:
        query = query.where(Vehicle.price >= price_min)
    if price_max is not None:
        query = query.where(Vehicle.price <= price_max)
    if year_min is not None:
        query = query.where(Vehicle.year >= year_min)
    if year_max is not None:
        query = query.where(Vehicle.year <= year_max)

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    descending = order_by.startswith("-")
    column = SORTABLE.get(order_by.lstrip("-"), Vehicle.created_at)
    query = query.order_by(column.desc() if descending else column.asc())
    items = db.scalars(query.offset(pagination.offset).limit(pagination.page_size)).all()
    return {
        "items": [_serialize(v, user) for v in items],
        "total": total,
        "page": pagination.page,
        "page_size": pagination.page_size,
    }


@router.get("/brands", response_model=list[str])
def list_brands(db: DB, user: CurrentUser, org: CurrentOrg):
    rows = db.scalars(
        select(Vehicle.brand)
        .where(Vehicle.organization_id == org.id, Vehicle.deleted_at.is_(None))
        .distinct()
        .order_by(Vehicle.brand)
    ).all()
    return rows


@router.get("/export")
def export_vehicles(db: DB, user: CurrentUser, org: CurrentOrg):
    vehicles = db.scalars(
        select(Vehicle).where(Vehicle.organization_id == org.id, Vehicle.deleted_at.is_(None))
    ).all()
    manager = is_manager(user)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    header = ["marca", "modelo", "version", "año", "km", "precio", "patente", "combustible",
              "transmision", "color", "carroceria", "estado", "dias_en_stock", "fecha_ingreso"]
    if manager:
        header.insert(6, "costo")
    writer.writerow(header)
    for v in vehicles:
        row = [v.brand, v.model, v.version or "", v.year, v.km, v.price, v.plate or "", v.fuel,
               v.transmission, v.color or "", v.body_type, v.status, v.days_in_stock, v.entry_date.date()]
        if manager:
            row.insert(6, v.cost or "")
        writer.writerow(row)
    audit.log(db, org.id, "exportacion", "vehicle", None, user.id, {"filas": len(vehicles)})
    db.commit()
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=vehiculos.csv"},
    )


@router.post("", response_model=VehicleOut, status_code=201)
def create_vehicle(data: VehicleCreate, db: DB, manager: ManagerUser, org: CurrentOrg):
    vehicle = Vehicle(organization_id=org.id, **data.model_dump())
    db.add(vehicle)
    db.flush()
    db.add(
        VehicleStatusHistory(
            organization_id=org.id, vehicle_id=vehicle.id, from_status=None,
            to_status=vehicle.status, user_id=manager.id,
        )
    )
    audit.log(db, org.id, "vehiculo_creado", "vehicle", vehicle.id, manager.id, {"titulo": vehicle.title})
    publish(
        db,
        DomainEvent(
            name="vehicle.created", organization_id=org.id, entity_type="vehicle",
            entity_id=vehicle.id, actor_user_id=manager.id,
        ),
    )
    db.commit()
    db.refresh(vehicle)
    return _serialize(vehicle, manager)


@router.get("/{vehicle_id}", response_model=VehicleOut)
def get_vehicle(vehicle_id: str, db: DB, user: CurrentUser, org: CurrentOrg):
    return _serialize(_get_vehicle(db, org, vehicle_id), user)


@router.patch("/{vehicle_id}", response_model=VehicleOut)
def update_vehicle(vehicle_id: str, data: VehicleUpdate, db: DB, manager: ManagerUser, org: CurrentOrg):
    vehicle = _get_vehicle(db, org, vehicle_id)
    updates = data.model_dump(exclude_unset=True)
    price_before = vehicle.price
    for field, value in updates.items():
        setattr(vehicle, field, value)
    meta = {"cambios": list(updates.keys())}
    if "price" in updates and updates["price"] != price_before:
        meta["precio_anterior"] = price_before
        meta["precio_nuevo"] = updates["price"]
        audit.log(db, org.id, "vehiculo_precio", "vehicle", vehicle.id, manager.id, meta)
    else:
        audit.log(db, org.id, "vehiculo_editado", "vehicle", vehicle.id, manager.id, meta)
    publish(
        db,
        DomainEvent(name="vehicle.updated", organization_id=org.id, entity_type="vehicle", entity_id=vehicle.id),
    )
    db.commit()
    db.refresh(vehicle)
    return _serialize(vehicle, manager)


@router.delete("/{vehicle_id}", response_model=Msg)
def delete_vehicle(vehicle_id: str, db: DB, manager: ManagerUser, org: CurrentOrg):
    vehicle = _get_vehicle(db, org, vehicle_id)
    open_opps = db.scalar(
        select(func.count(Opportunity.id)).where(
            Opportunity.vehicle_id == vehicle.id, Opportunity.status == "abierta"
        )
    )
    if open_opps:
        raise ApiError("VEHICLE_IN_USE", f"Hay {open_opps} oportunidades abiertas sobre este vehículo", 409)
    vehicle.deleted_at = utcnow()
    audit.log(db, org.id, "vehiculo_eliminado", "vehicle", vehicle.id, manager.id, {"titulo": vehicle.title})
    db.commit()
    return Msg(message=f"{vehicle.title} eliminado")


@router.post("/{vehicle_id}/status", response_model=VehicleOut)
def change_status(vehicle_id: str, data: VehicleStatusChange, db: DB, manager: ManagerUser, org: CurrentOrg):
    vehicle = _get_vehicle(db, org, vehicle_id)
    if data.status not in VEHICLE_STATUSES:
        raise ApiError("INVALID_STATUS", f"Estado inválido: {data.status}", 400)
    if data.status == vehicle.status:
        return _serialize(vehicle, manager)
    db.add(
        VehicleStatusHistory(
            organization_id=org.id, vehicle_id=vehicle.id,
            from_status=vehicle.status, to_status=data.status, user_id=manager.id,
        )
    )
    vehicle.status = data.status
    if data.status == "vendido":
        vehicle.sold_at = utcnow()
        vehicle.sold_price = data.sold_price or vehicle.price
        vehicle.buyer_customer_id = data.buyer_customer_id
        publish(
            db,
            DomainEvent(
                name="vehicle.sold", organization_id=org.id, entity_type="vehicle",
                entity_id=vehicle.id, actor_user_id=manager.id,
            ),
        )
    audit.log(db, org.id, "vehiculo_estado", "vehicle", vehicle.id, manager.id, {"estado": data.status})
    db.commit()
    db.refresh(vehicle)
    return _serialize(vehicle, manager)


@router.get("/{vehicle_id}/status-history", response_model=list[VehicleStatusHistoryOut])
def status_history(vehicle_id: str, db: DB, user: CurrentUser, org: CurrentOrg):
    vehicle = _get_vehicle(db, org, vehicle_id)
    return db.scalars(
        select(VehicleStatusHistory)
        .where(VehicleStatusHistory.vehicle_id == vehicle.id)
        .order_by(VehicleStatusHistory.created_at.desc())
    ).all()


@router.get("/{vehicle_id}/stats", response_model=VehicleStatsOut)
def vehicle_stats(vehicle_id: str, db: DB, user: CurrentUser, org: CurrentOrg):
    vehicle = _get_vehicle(db, org, vehicle_id)
    customers_map = stock_intel.vehicle_inquiry_customers(db, org.id)
    interested_ids = customers_map.get(vehicle.id, set())
    interested = (
        db.scalars(
            select(Customer).where(Customer.id.in_(interested_ids)).order_by(Customer.lead_score.desc()).limit(12)
        ).all()
        if interested_ids
        else []
    )
    opportunities_count = db.scalar(
        select(func.count(Opportunity.id)).where(Opportunity.vehicle_id == vehicle.id)
    ) or 0
    won = db.scalar(
        select(func.count(Opportunity.id)).where(
            Opportunity.vehicle_id == vehicle.id, Opportunity.status == "ganada"
        )
    ) or 0

    from app.models import Appointment, Quote

    quotes_count = db.scalar(select(func.count(Quote.id)).where(Quote.vehicle_id == vehicle.id)) or 0
    appointments_count = db.scalar(
        select(func.count(Appointment.id)).where(Appointment.vehicle_id == vehicle.id)
    ) or 0

    inquiries = len(interested_ids)
    all_inquiries = stock_intel.inquiries_map(db, org.id)
    fleet = db.scalars(
        select(Vehicle).where(
            Vehicle.organization_id == org.id, Vehicle.deleted_at.is_(None),
            Vehicle.status.in_(("disponible", "reservado", "preparacion")),
        )
    ).all()
    avg_inquiries = (sum(all_inquiries.get(v.id, 0) for v in fleet) / len(fleet)) if fleet else 0
    avg_days = (sum(v.days_in_stock for v in fleet) / len(fleet)) if fleet else None

    demand_index = round(inquiries / avg_inquiries, 2) if avg_inquiries else None
    if demand_index is not None and demand_index >= 1.3:
        demand_text = f"Este vehículo recibe {demand_index:.1f}× más consultas que el promedio del stock."
    elif vehicle.status == "disponible" and vehicle.days_in_stock >= 60 and (demand_index or 0) < 1:
        demand_text = f"Lleva {vehicle.days_in_stock} días publicado y presenta menor demanda que vehículos similares."
    elif demand_index is not None:
        demand_text = f"Demanda en línea con el promedio del stock ({inquiries} consultas)."
    else:
        demand_text = None

    manager = is_manager(user)
    margin = (vehicle.price - vehicle.cost) if (manager and vehicle.cost) else None
    return {
        "inquiries": inquiries,
        "interested_customers": [CustomerBrief.model_validate(c) for c in interested],
        "opportunities_count": opportunities_count,
        "quotes_count": quotes_count,
        "appointments_count": appointments_count,
        "conversion_rate": round(won / inquiries, 3) if inquiries else None,
        "margin": margin,
        "margin_percent": round(margin / vehicle.cost * 100, 1) if (margin is not None and vehicle.cost) else None,
        "demand_index": demand_index,
        "demand_text": demand_text,
        "avg_days_fleet": round(avg_days, 1) if avg_days is not None else None,
    }


@router.post("/{vehicle_id}/images", response_model=VehicleOut, status_code=201)
def upload_image(vehicle_id: str, file: UploadFile, db: DB, manager: ManagerUser, org: CurrentOrg):
    vehicle = _get_vehicle(db, org, vehicle_id)
    settings = get_settings()
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise ApiError("INVALID_FILE_TYPE", "Solo se aceptan imágenes JPG, PNG o WebP", 400)
    content = file.file.read(settings.max_upload_mb * 1024 * 1024 + 1)
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise ApiError("FILE_TOO_LARGE", f"La imagen supera el máximo de {settings.max_upload_mb} MB", 400)

    ext = ALLOWED_IMAGE_TYPES[file.content_type]
    relative = Path(org.id) / "vehicles" / vehicle.id / f"{secrets.token_hex(8)}{ext}"
    target = Path(settings.upload_dir) / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)

    position = (
        db.scalar(select(func.max(VehicleImage.position)).where(VehicleImage.vehicle_id == vehicle.id)) or 0
    ) + 1
    db.add(
        VehicleImage(
            organization_id=org.id,
            vehicle_id=vehicle.id,
            url=f"/uploads/{relative.as_posix()}",
            position=position,
        )
    )
    db.commit()
    db.refresh(vehicle)
    return _serialize(vehicle, manager)


@router.delete("/{vehicle_id}/images/{image_id}", response_model=Msg)
def delete_image(vehicle_id: str, image_id: str, db: DB, manager: ManagerUser, org: CurrentOrg):
    vehicle = _get_vehicle(db, org, vehicle_id)
    image = db.get(VehicleImage, image_id)
    if not image or image.vehicle_id != vehicle.id:
        raise not_found("imagen", "IMAGE_NOT_FOUND")
    settings = get_settings()
    if image.url.startswith("/uploads/"):
        path = Path(settings.upload_dir) / image.url.removeprefix("/uploads/")
        path.unlink(missing_ok=True)
    db.delete(image)
    db.commit()
    return Msg(message="Imagen eliminada")
