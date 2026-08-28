"""Command Center (§7): qué tengo que hacer hoy para vender más."""

from datetime import timedelta

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.core.utils import local_day_bounds, utcnow
from app.models import (
    Appointment,
    Customer,
    CustomerVehicleMatch,
    Followup,
    Opportunity,
    Organization,
    PipelineStage,
    Task,
    User,
)
from app.services.deps_helpers import active_customers_query


def get_dashboard(db: Session, org: Organization, user: User) -> dict:
    now = utcnow()
    today_start, today_end = local_day_bounds(org.timezone, now)
    manager = user.role in ("admin", "gerente")

    def scope_customers(query):
        if not manager:
            query = query.where(Customer.assigned_user_id == user.id)
        return query

    def scope_followups(query):
        if not manager:
            query = query.where(Followup.user_id == user.id)
        return query

    overdue_followups = db.scalar(
        scope_followups(
            select(func.count(Followup.id)).where(
                Followup.organization_id == org.id,
                Followup.status == "pendiente",
                Followup.due_at < now,
            )
        )
    ) or 0

    pending_today = db.scalar(
        scope_followups(
            select(func.count(Followup.id)).where(
                Followup.organization_id == org.id,
                Followup.status == "pendiente",
                Followup.due_at >= now,
                Followup.due_at < today_end,
            )
        )
    ) or 0

    awaiting_reply = db.scalar(
        scope_customers(
            select(func.count(Customer.id)).where(
                Customer.organization_id == org.id,
                Customer.deleted_at.is_(None),
                Customer.status.in_(("lead", "activo")),
                Customer.last_inbound_at.isnot(None),
                or_(Customer.last_outbound_at.is_(None), Customer.last_inbound_at > Customer.last_outbound_at),
            )
        )
    ) or 0

    hot_query = (
        select(func.count(Opportunity.id))
        .join(Customer, Customer.id == Opportunity.customer_id)
        .where(
            Opportunity.organization_id == org.id,
            Opportunity.status == "abierta",
            Customer.lead_score >= 65,
        )
    )
    if not manager:
        hot_query = hot_query.where(Opportunity.owner_user_id == user.id)
    hot_opportunities = db.scalar(hot_query) or 0

    closes_query = (
        select(func.count(Opportunity.id))
        .join(PipelineStage, PipelineStage.id == Opportunity.stage_id)
        .where(
            Opportunity.organization_id == org.id,
            Opportunity.status == "abierta",
            PipelineStage.key.in_(("negociacion", "reserva")),
        )
    )
    if not manager:
        closes_query = closes_query.where(Opportunity.owner_user_id == user.id)
    probable_closes = db.scalar(closes_query) or 0

    new_leads_today = db.scalar(
        scope_customers(
            select(func.count(Customer.id)).where(
                Customer.organization_id == org.id,
                Customer.deleted_at.is_(None),
                Customer.created_at >= today_start,
            )
        )
    ) or 0

    # Clientes a contactar hoy: vencidos ∪ para hoy ∪ esperando respuesta ∪ calientes enfriándose.
    contact_ids: set[str] = set()
    contact_ids.update(
        db.scalars(
            scope_followups(
                select(Followup.customer_id).where(
                    Followup.organization_id == org.id,
                    Followup.status == "pendiente",
                    Followup.due_at < today_end,
                )
            )
        ).all()
    )
    contact_ids.update(
        db.scalars(
            scope_customers(
                select(Customer.id).where(
                    Customer.organization_id == org.id,
                    Customer.deleted_at.is_(None),
                    Customer.status.in_(("lead", "activo")),
                    or_(
                        and_(
                            Customer.last_inbound_at.isnot(None),
                            or_(
                                Customer.last_outbound_at.is_(None),
                                Customer.last_inbound_at > Customer.last_outbound_at,
                            ),
                        ),
                        and_(
                            Customer.lead_score >= 65,
                            Customer.last_contact_at < now - timedelta(days=4),
                        ),
                    ),
                )
            )
        ).all()
    )

    counts = {
        "to_contact_today": len(contact_ids),
        "pending_followups_today": pending_today,
        "overdue_followups": overdue_followups,
        "awaiting_reply": awaiting_reply,
        "hot_opportunities": hot_opportunities,
        "probable_closes": probable_closes,
        "new_leads_today": new_leads_today,
    }

    priorities = _build_priorities(db, org, user, manager, now)
    agenda = _build_agenda(db, org, user, manager, today_start, today_end)

    # Clientes compatibles con vehículos ingresados en los últimos 7 días (§25).
    from app.models import Vehicle

    matches_query = (
        select(func.count(CustomerVehicleMatch.id))
        .join(Vehicle, Vehicle.id == CustomerVehicleMatch.vehicle_id)
        .where(
            CustomerVehicleMatch.organization_id == org.id,
            CustomerVehicleMatch.status == "sugerido",
            Vehicle.entry_date >= now - timedelta(days=7),
            Vehicle.status == "disponible",
        )
    )
    if not manager:
        matches_query = matches_query.join(
            Customer, Customer.id == CustomerVehicleMatch.customer_id
        ).where(Customer.assigned_user_id == user.id)
    new_vehicle_matches = db.scalar(matches_query) or 0

    return {
        "counts": counts,
        "priorities": priorities,
        "agenda": agenda,
        "new_vehicle_matches": new_vehicle_matches,
    }


def _build_priorities(db: Session, org: Organization, user: User, manager: bool, now) -> list[dict]:
    query = active_customers_query(org.id).order_by(Customer.lead_score.desc()).limit(120)
    if not manager:
        query = query.where(Customer.assigned_user_id == user.id)
    customers = db.scalars(query).all()

    overdue_map = dict(
        db.execute(
            select(Followup.customer_id, func.count(Followup.id))
            .where(
                Followup.organization_id == org.id,
                Followup.status == "pendiente",
                Followup.due_at < now,
            )
            .group_by(Followup.customer_id)
        ).all()
    )

    scored: list[tuple[float, Customer, list[str], str, str]] = []
    for c in customers:
        urgency = float(c.lead_score)
        reasons: list[str] = []
        action_kind = "contactar"
        icon = "fire" if c.lead_score >= 65 else "clock"

        if c.awaiting_reply:
            urgency += 25
            action_kind = "responder"
            hours = int((now - c.last_inbound_at).total_seconds() // 3600) if c.last_inbound_at else 0
            waiting = f"{hours} h" if hours < 48 else f"{hours // 24} días"
            reasons.append(f"Espera respuesta hace {waiting}")
        if overdue_map.get(c.id):
            urgency += 20
            reasons.append(f"{overdue_map[c.id]} seguimiento{'s' if overdue_map[c.id] > 1 else ''} vencido{'s' if overdue_map[c.id] > 1 else ''}")
            if action_kind == "contactar":
                action_kind = "seguimiento"
        days_quiet = (now - c.last_contact_at).days if c.last_contact_at else None
        if c.lead_score >= 60 and days_quiet is not None and days_quiet >= 4:
            urgency += 15
            icon = "warning"
            action_kind = "retomar" if action_kind == "contactar" else action_kind
            reasons.append(f"Sin contacto hace {days_quiet} días con alto interés")

        factor_labels = [f["label"] for f in (c.score_factors or []) if f.get("points", 0) > 0 and f["label"] != "Base"]
        for label in factor_labels[:3]:
            if len(reasons) < 4:
                reasons.append(label)

        if urgency >= 70 and reasons:
            scored.append((urgency, c, reasons[:4], action_kind, icon))

    scored.sort(key=lambda item: item[0], reverse=True)
    cards = []
    action_labels = {
        "responder": "Responder",
        "retomar": "Retomar conversación",
        "seguimiento": "Completar seguimiento",
        "contactar": "Contactar",
    }
    for _urgency, c, reasons, action_kind, icon in scored[:6]:
        vehicle_title = c.interested_vehicle.title if c.interested_vehicle else (
            f"{c.interest_brand or ''} {c.interest_model or ''}".strip() or None
        )
        headline = (
            f"Interesado en {vehicle_title}" if vehicle_title else "Cliente con actividad reciente"
        )
        if icon == "warning" and c.last_contact_at:
            headline = f"Sin respuesta hace {(now - c.last_contact_at).days} días"
        cards.append(
            {
                "customer": c,
                "icon": icon,
                "headline": headline,
                "vehicle_title": vehicle_title,
                "probability": c.lead_score,
                "reasons": reasons,
                "action_label": action_labels[action_kind],
                "action_kind": action_kind,
                "assigned_to": c.assigned_user.full_name if c.assigned_user else None,
            }
        )
    return cards


def _build_agenda(db: Session, org: Organization, user: User, manager: bool, start, end) -> list[dict]:
    """Agenda del día: personal para vendedores, de todo el equipo para gerencia."""
    items: list[dict] = []

    def with_owner(subtitle: str | None, owner) -> str | None:
        if not manager or not owner or owner.id == user.id:
            return subtitle
        return f"{owner.full_name}{' · ' + subtitle if subtitle else ''}"

    followups_query = select(Followup).where(
        Followup.organization_id == org.id,
        Followup.status == "pendiente",
        Followup.due_at >= start,
        Followup.due_at < end,
    )
    if not manager:
        followups_query = followups_query.where(Followup.user_id == user.id)
    for f in db.scalars(followups_query).all():
        items.append(
            {
                "id": f.id,
                "kind": "followup",
                "time": f.due_at,
                "title": f"{_followup_verb(f.type)} {f.customer.full_name if f.customer else ''}".strip(),
                "subtitle": with_owner(f.note, f.user),
                "customer_id": f.customer_id,
                "status": f.status,
                "type": f.type,
            }
        )

    appointments_query = select(Appointment).where(
        Appointment.organization_id == org.id,
        Appointment.status == "agendada",
        Appointment.starts_at >= start,
        Appointment.starts_at < end,
    )
    if not manager:
        appointments_query = appointments_query.where(Appointment.user_id == user.id)
    for a in db.scalars(appointments_query).all():
        items.append(
            {
                "id": a.id,
                "kind": "appointment",
                "time": a.starts_at,
                "title": a.title,
                "subtitle": with_owner(a.location, a.user),
                "customer_id": a.customer_id,
                "status": a.status,
                "type": a.type,
            }
        )

    tasks_query = select(Task).where(
        Task.organization_id == org.id,
        Task.status == "pendiente",
        Task.due_at.isnot(None),
        Task.due_at >= start,
        Task.due_at < end,
    )
    if not manager:
        tasks_query = tasks_query.where(Task.user_id == user.id)
    for t in db.scalars(tasks_query).all():
        items.append(
            {
                "id": t.id,
                "kind": "task",
                "time": t.due_at,
                "title": t.title,
                "subtitle": with_owner(t.customer.full_name if t.customer else None, t.user),
                "customer_id": t.customer_id,
                "status": t.status,
                "type": t.type,
            }
        )

    items.sort(key=lambda item: item["time"])
    return items


def _followup_verb(type_: str) -> str:
    return {
        "llamada": "Llamar a",
        "whatsapp": "Escribir a",
        "email": "Enviar email a",
        "visita": "Visita con",
        "recordatorio": "Recordatorio:",
        "tarea": "Tarea:",
    }.get(type_, "Contactar a")
