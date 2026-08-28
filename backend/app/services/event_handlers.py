"""Suscripciones del bus de eventos (§77): acá se conecta todo sin acoplar módulos."""

from sqlalchemy.orm import Session

from app.core.events import DomainEvent, subscribe
from app.models import Customer, Vehicle
from app.services import automations, matching
from app.services.notify import notify, notify_managers


def _on_vehicle_created(db: Session, event: DomainEvent) -> None:
    vehicle = db.get(Vehicle, event.entity_id)
    if vehicle:
        matching.run_matching_for_vehicle(db, vehicle)


def _on_lead_created(db: Session, event: DomainEvent) -> None:
    customer = db.get(Customer, event.entity_id)
    if not customer:
        return
    if customer.assigned_user_id and customer.assigned_user_id != event.actor_user_id:
        notify(
            db,
            event.organization_id,
            customer.assigned_user_id,
            "lead_nuevo",
            f"Nuevo lead: {customer.full_name}",
            f"Origen: {customer.source}",
            "customer",
            customer.id,
        )
    notify_managers(
        db,
        event.organization_id,
        "lead_nuevo",
        f"Nuevo lead: {customer.full_name}",
        f"Origen: {customer.source}",
        "customer",
        customer.id,
        dedup_key=f"lead:{customer.id}",
        exclude_user_id=event.actor_user_id,
    )


def _on_vehicle_sold(db: Session, event: DomainEvent) -> None:
    vehicle = db.get(Vehicle, event.entity_id)
    if vehicle:
        notify_managers(
            db,
            event.organization_id,
            "sistema",
            f"🎉 Vendido: {vehicle.title}",
            f"Precio final: {vehicle.sold_price:,.0f}" if vehicle.sold_price else None,
            "vehicle",
            vehicle.id,
            dedup_key=f"sold:{vehicle.id}",
        )


_registered = False


def register_all() -> None:
    global _registered
    if _registered:
        return
    _registered = True
    subscribe("vehicle.created", _on_vehicle_created)
    subscribe("lead.created", _on_lead_created)
    subscribe("vehicle.sold", _on_vehicle_sold)
    # Las automatizaciones configurables escuchan todos los eventos.
    subscribe("*", automations.handle_event)
