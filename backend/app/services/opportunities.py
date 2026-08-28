"""Oportunidades: movimientos de etapa, cierre ganado/perdido y salud (§10, §27, §79)."""

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError, not_found
from app.core.events import DomainEvent, publish
from app.core.utils import utcnow
from app.models import (
    Customer,
    Followup,
    Opportunity,
    OpportunityStageHistory,
    PipelineStage,
    User,
    Vehicle,
    VehicleStatusHistory,
)
from app.services import audit, scoring


def compute_health(db: Session, opportunity: Opportunity) -> str:
    """green: activo y caliente · red: abandonado o en caída · yellow: el resto."""
    if opportunity.status != "abierta":
        return "green" if opportunity.status == "ganada" else "red"
    now = utcnow()
    customer = opportunity.customer
    last_activity = customer.last_contact_at or opportunity.created_at
    days_inactive = (now - last_activity).days

    overdue = db.scalar(
        select(Followup.id).where(
            Followup.opportunity_id == opportunity.id,
            Followup.status == "pendiente",
            Followup.due_at < now - timedelta(days=2),
        )
    )
    if days_inactive > 7 or overdue:
        return "red"
    if days_inactive < 3 and customer.lead_score >= 60:
        return "green"
    return "yellow"


def refresh_health(db: Session, opportunity: Opportunity) -> None:
    opportunity.health = compute_health(db, opportunity)


def move_stage(
    db: Session,
    opportunity: Opportunity,
    stage_id: str,
    actor: User,
    lost_reason: str | None = None,
    sold_price: float | None = None,
) -> Opportunity:
    stage = db.get(PipelineStage, stage_id)
    if not stage or stage.organization_id != opportunity.organization_id:
        raise not_found("etapa", "STAGE_NOT_FOUND")
    if opportunity.stage_id == stage.id:
        return opportunity
    if stage.is_lost and not lost_reason:
        raise ApiError("LOST_REASON_REQUIRED", "Indicá el motivo de la pérdida", 400)

    from_stage_id = opportunity.stage_id
    now = utcnow()
    opportunity.stage_id = stage.id
    opportunity.probability = stage.probability
    db.add(
        OpportunityStageHistory(
            organization_id=opportunity.organization_id,
            opportunity_id=opportunity.id,
            from_stage_id=from_stage_id,
            to_stage_id=stage.id,
            user_id=actor.id,
        )
    )

    customer: Customer = opportunity.customer
    event_name = "opportunity.stage_changed"

    if stage.is_won:
        opportunity.status = "ganada"
        opportunity.closed_at = now
        customer.status = "cliente"
        vehicle: Vehicle | None = opportunity.vehicle
        if vehicle and vehicle.status != "vendido":
            db.add(
                VehicleStatusHistory(
                    organization_id=vehicle.organization_id,
                    vehicle_id=vehicle.id,
                    from_status=vehicle.status,
                    to_status="vendido",
                    user_id=actor.id,
                )
            )
            vehicle.status = "vendido"
            vehicle.sold_at = now
            vehicle.sold_price = sold_price or opportunity.expected_value or vehicle.price
            vehicle.buyer_customer_id = customer.id
            publish(
                db,
                DomainEvent(
                    name="vehicle.sold",
                    organization_id=vehicle.organization_id,
                    entity_type="vehicle",
                    entity_id=vehicle.id,
                    actor_user_id=actor.id,
                ),
            )
        if sold_price:
            opportunity.expected_value = sold_price
        event_name = "opportunity.won"
    elif stage.is_lost:
        opportunity.status = "perdida"
        opportunity.closed_at = now
        opportunity.lost_reason = lost_reason
        other_open = db.scalar(
            select(Opportunity.id).where(
                Opportunity.customer_id == customer.id,
                Opportunity.status == "abierta",
                Opportunity.id != opportunity.id,
            )
        )
        if not other_open:
            customer.status = "perdido"
        event_name = "opportunity.lost"
    else:
        opportunity.status = "abierta"
        opportunity.closed_at = None
        if customer.status == "lead":
            customer.status = "activo"

    scoring.apply_score(db, customer)
    refresh_health(db, opportunity)
    audit.log(
        db,
        opportunity.organization_id,
        "oportunidad_etapa",
        "opportunity",
        opportunity.id,
        actor.id,
        {"a_etapa": stage.name, "cliente": customer.full_name},
    )
    publish(
        db,
        DomainEvent(
            name=event_name,
            organization_id=opportunity.organization_id,
            entity_type="opportunity",
            entity_id=opportunity.id,
            actor_user_id=actor.id,
            data={"stage_key": stage.key},
        ),
    )
    return opportunity
