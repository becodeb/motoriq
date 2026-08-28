"""Búsqueda global (§45): clientes, vehículos, teléfonos, patentes.

El matching se hace en Python sobre texto normalizado (sin acentos, minúsculas)
para que «Sebastian» encuentre «Sebastián». A escala de agencia (miles de filas)
esto es instantáneo y portable entre SQLite y PostgreSQL; con volúmenes mayores
se reemplaza por una columna normalizada indexada o FTS.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.utils import normalize
from app.models import Customer, Opportunity, Vehicle


def global_search(db: Session, organization_id: str, query: str, limit: int = 12) -> list[dict]:
    q = normalize(query.strip())
    if len(q) < 2:
        return []

    results: list[dict] = []

    customers = db.scalars(
        select(Customer).where(Customer.organization_id == organization_id, Customer.deleted_at.is_(None))
    ).all()
    matched_customer_ids: list[str] = []
    for c in customers:
        haystack = normalize(f"{c.full_name} {c.phone or ''} {c.whatsapp or ''} {c.email or ''}")
        if q in haystack:
            matched_customer_ids.append(c.id)
            results.append(
                {
                    "kind": "customer",
                    "id": c.id,
                    "title": c.full_name,
                    "subtitle": c.phone or c.email,
                    "extra": f"{c.lead_score}/100 · {c.status}",
                }
            )
            if len(results) >= limit:
                break

    vehicles = db.scalars(
        select(Vehicle).where(Vehicle.organization_id == organization_id, Vehicle.deleted_at.is_(None))
    ).all()
    vehicle_hits = 0
    for v in vehicles:
        haystack = normalize(f"{v.brand} {v.model} {v.version or ''} {v.plate or ''} {v.year}")
        if q in haystack:
            vehicle_hits += 1
            results.append(
                {
                    "kind": "vehicle",
                    "id": v.id,
                    "title": f"{v.title} {v.year}",
                    "subtitle": f"{v.price:,.0f} · {v.km:,} km",
                    "extra": v.status,
                }
            )
            if vehicle_hits >= limit:
                break

    if matched_customer_ids:
        opportunities = db.scalars(
            select(Opportunity)
            .where(
                Opportunity.organization_id == organization_id,
                Opportunity.status == "abierta",
                Opportunity.customer_id.in_(matched_customer_ids[:5]),
            )
            .limit(5)
        ).all()
        for o in opportunities:
            results.append(
                {
                    "kind": "opportunity",
                    "id": o.id,
                    "title": f"{o.customer.full_name} — {o.vehicle.title if o.vehicle else 'sin vehículo'}",
                    "subtitle": o.stage.name if o.stage else None,
                    "extra": f"{o.expected_value:,.0f}" if o.expected_value else None,
                }
            )

    return results[: limit + 8]
