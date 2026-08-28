"""Radar POPS (§78): el mapa visual de dónde están las oportunidades."""

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.utils import utcnow
from app.models import (
    Customer,
    CustomerVehicleMatch,
    Followup,
    Opportunity,
    Organization,
    PipelineStage,
    User,
    Vehicle,
)
from app.services.stock_intel import STALE_DAYS, inquiries_map


def get_radar(db: Session, org: Organization, user: User) -> dict:
    now = utcnow()
    manager = user.role in ("admin", "gerente")

    def scope(query, column):
        return query if manager else query.where(column == user.id)

    # 🔥 Clientes calientes
    hot = db.scalars(
        scope(
            select(Customer).where(
                Customer.organization_id == org.id,
                Customer.deleted_at.is_(None),
                Customer.status.in_(("lead", "activo")),
                Customer.lead_score >= 65,
            ),
            Customer.assigned_user_id,
        ).order_by(Customer.lead_score.desc()).limit(8)
    ).all()
    hot_items = [
        {
            "customer": c,
            "subtitle": c.interested_vehicle.title if c.interested_vehicle else None,
            "detail": c.score_reason or "Alta intención de compra",
            "assigned_to": c.assigned_user.full_name if c.assigned_user else None,
            "metric": f"{c.lead_score}/100",
        }
        for c in hot
    ]

    # ⏰ Seguimientos urgentes (vencidos o de hoy)
    urgent = db.scalars(
        scope(
            select(Followup).where(
                Followup.organization_id == org.id,
                Followup.status == "pendiente",
                Followup.due_at < now + timedelta(hours=24),
            ),
            Followup.user_id,
        ).order_by(Followup.due_at).limit(8)
    ).all()
    urgent_items = []
    for f in urgent:
        overdue_days = (now - f.due_at).days
        detail = (
            f"Vencido hace {overdue_days} día{'s' if overdue_days != 1 else ''}"
            if f.due_at < now and overdue_days >= 1
            else ("Vencido hoy" if f.due_at < now else "Para hoy")
        )
        urgent_items.append(
            {
                "customer": f.customer,
                "subtitle": f.note,
                "detail": f"{detail} · {f.type}",
                "assigned_to": f.user.full_name if f.user else None,
                "metric": f.due_at.strftime("%d/%m %H:%M"),
            }
        )

    # 👻 Clientes que desaparecieron (les escribimos y no contestan hace 3–21 días, interés previo alto)
    ghost_cutoff_recent = now - timedelta(days=3)
    ghost_cutoff_old = now - timedelta(days=21)
    ghosts = db.scalars(
        scope(
            select(Customer).where(
                Customer.organization_id == org.id,
                Customer.deleted_at.is_(None),
                Customer.status.in_(("lead", "activo")),
                Customer.lead_score >= 45,
                Customer.last_outbound_at.isnot(None),
                Customer.last_inbound_at.isnot(None),
                Customer.last_outbound_at > Customer.last_inbound_at,
                Customer.last_inbound_at < ghost_cutoff_recent,
                Customer.last_inbound_at > ghost_cutoff_old,
            ),
            Customer.assigned_user_id,
        ).order_by(Customer.lead_score.desc()).limit(8)
    ).all()
    ghost_items = [
        {
            "customer": c,
            "subtitle": c.interested_vehicle.title if c.interested_vehicle else None,
            "detail": f"Sin respuesta hace {(now - c.last_inbound_at).days} días · mostró alto interés",
            "assigned_to": c.assigned_user.full_name if c.assigned_user else None,
            "metric": f"{(now - c.last_inbound_at).days} días",
        }
        for c in ghosts
    ]

    # 🚗 Vehículos con alta demanda / 📉 stock estancado
    vehicles = db.scalars(
        select(Vehicle).where(
            Vehicle.organization_id == org.id,
            Vehicle.deleted_at.is_(None),
            Vehicle.status.in_(("disponible", "reservado", "preparacion")),
        )
    ).all()
    inquiries = inquiries_map(db, org.id)
    avg_inquiries = (sum(inquiries.get(v.id, 0) for v in vehicles) / len(vehicles)) if vehicles else 0

    demand_items = []
    for v in sorted(vehicles, key=lambda v: inquiries.get(v.id, 0), reverse=True):
        count = inquiries.get(v.id, 0)
        if avg_inquiries and count >= avg_inquiries * 1.5 and count >= 2:
            ratio = count / avg_inquiries
            demand_items.append(
                {
                    "vehicle": v,
                    "detail": f"Recibe {ratio:.1f}× más consultas que el promedio del stock",
                    "metric": f"{count} consultas",
                }
            )
        if len(demand_items) >= 6:
            break

    stale_items = [
        {
            "vehicle": v,
            "detail": f"{v.days_in_stock} días publicado con demanda por debajo del promedio",
            "metric": f"{v.days_in_stock} días",
        }
        for v in sorted(vehicles, key=lambda v: v.days_in_stock, reverse=True)
        if v.days_in_stock >= STALE_DAYS and inquiries.get(v.id, 0) <= avg_inquiries
    ][:6]

    # 🎯 Matches nuevos
    matches_query = (
        select(CustomerVehicleMatch)
        .join(Customer, Customer.id == CustomerVehicleMatch.customer_id)
        .where(
            CustomerVehicleMatch.organization_id == org.id,
            CustomerVehicleMatch.status == "sugerido",
            CustomerVehicleMatch.created_at >= now - timedelta(days=14),
        )
    )
    if not manager:
        matches_query = matches_query.where(Customer.assigned_user_id == user.id)
    matches = db.scalars(matches_query.order_by(CustomerVehicleMatch.score.desc()).limit(8)).all()
    match_items = [
        {
            "customer": m.customer,
            "vehicle": m.vehicle,
            "score": m.score,
            "detail": " · ".join(m.reasons[:2]) if m.reasons else "Compatible con su búsqueda",
        }
        for m in matches
        if m.vehicle and m.vehicle.status == "disponible"
    ]

    # 💰 Posibles cierres
    closes_query = (
        select(Opportunity)
        .join(PipelineStage, PipelineStage.id == Opportunity.stage_id)
        .where(
            Opportunity.organization_id == org.id,
            Opportunity.status == "abierta",
            PipelineStage.key.in_(("negociacion", "reserva")),
        )
    )
    if not manager:
        closes_query = closes_query.where(Opportunity.owner_user_id == user.id)
    closes = db.scalars(closes_query.order_by(Opportunity.updated_at.desc()).limit(8)).all()
    close_items = [
        {
            "customer": o.customer,
            "subtitle": o.vehicle.title if o.vehicle else None,
            "detail": f"En {o.stage.name.lower()}" + (f" · {o.expected_value:,.0f}" if o.expected_value else ""),
            "assigned_to": o.owner.full_name if o.owner else None,
            "metric": f"{o.probability or 0}%",
        }
        for o in closes
        if o.health != "red"
    ]

    return {
        "hot_customers": hot_items,
        "urgent_followups": urgent_items,
        "ghosted_customers": ghost_items,
        "high_demand_vehicles": demand_items,
        "stale_vehicles": stale_items,
        "new_matches": match_items,
        "probable_closes": close_items,
    }
