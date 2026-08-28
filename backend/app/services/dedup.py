"""Detección de clientes duplicados (§80): teléfono, email o nombre."""

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.utils import normalize
from app.models import Customer


def normalize_phone(phone: str | None) -> str:
    if not phone:
        return ""
    digits = re.sub(r"\D", "", phone)
    return digits[-10:] if len(digits) > 10 else digits


def find_duplicates(
    db: Session,
    organization_id: str,
    phone: str | None = None,
    email: str | None = None,
    first_name: str | None = None,
    last_name: str | None = None,
    exclude_id: str | None = None,
) -> list[dict]:
    candidates = db.scalars(
        select(Customer).where(
            Customer.organization_id == organization_id,
            Customer.deleted_at.is_(None),
        )
    ).all()

    target_phone = normalize_phone(phone)
    target_email = (email or "").strip().lower()
    target_name = normalize(f"{first_name or ''} {last_name or ''}")

    results: list[dict] = []
    seen: set[str] = set()
    for c in candidates:
        if c.id == exclude_id or c.id in seen:
            continue
        matched_by = None
        if target_phone and target_phone in (normalize_phone(c.phone), normalize_phone(c.whatsapp)):
            matched_by = "telefono"
        elif target_email and target_email == (c.email or "").strip().lower():
            matched_by = "email"
        elif target_name and len(target_name) > 5 and target_name == normalize(c.full_name):
            matched_by = "nombre"
        if matched_by:
            seen.add(c.id)
            results.append(
                {
                    "id": c.id,
                    "full_name": c.full_name,
                    "phone": c.phone,
                    "email": c.email,
                    "matched_by": matched_by,
                }
            )
    return results[:5]
