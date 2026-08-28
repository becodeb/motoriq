"""Timeline unificado del cliente (§9): mensajes, notas, seguimientos,
cambios de etapa, score, cotizaciones y citas en orden cronológico."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Appointment,
    Customer,
    CustomerNote,
    Followup,
    LeadScoreHistory,
    Message,
    Opportunity,
    OpportunityStageHistory,
    Quote,
)

LIMIT = 250


def customer_timeline(db: Session, customer: Customer) -> list[dict]:
    items: list[dict] = []

    messages = db.scalars(
        select(Message).where(Message.customer_id == customer.id).order_by(Message.created_at.desc()).limit(LIMIT)
    ).all()
    for m in messages:
        who = "Cliente" if m.direction == "entrante" else (m.sent_by.full_name if m.sent_by else "Motor IQ")
        items.append(
            {
                "id": f"msg-{m.id}",
                "kind": "mensaje",
                "icon": "message",
                "title": f"{who} · {m.channel}",
                "body": m.body,
                "actor": who,
                "direction": m.direction,
                "created_at": m.created_at,
            }
        )

    notes = db.scalars(select(CustomerNote).where(CustomerNote.customer_id == customer.id)).all()
    for n in notes:
        items.append(
            {
                "id": f"note-{n.id}",
                "kind": "nota",
                "icon": "note",
                "title": "Nota interna",
                "body": n.body,
                "actor": n.user.full_name if n.user else None,
                "created_at": n.created_at,
            }
        )

    followups = db.scalars(select(Followup).where(Followup.customer_id == customer.id)).all()
    for f in followups:
        if f.status == "completado" and f.completed_at:
            items.append(
                {
                    "id": f"fu-done-{f.id}",
                    "kind": "seguimiento",
                    "icon": "check",
                    "title": f"Seguimiento completado ({f.type})",
                    "body": f.note,
                    "actor": f.user.full_name if f.user else None,
                    "created_at": f.completed_at,
                }
            )
        items.append(
            {
                "id": f"fu-{f.id}",
                "kind": "seguimiento",
                "icon": "clock",
                "title": (
                    "Motor IQ sugirió un seguimiento" if f.origin == "ia" and f.status == "sugerido"
                    else f"Seguimiento creado ({f.type})"
                ),
                "body": f.suggested_reason or f.note,
                "actor": "Motor IQ" if f.origin == "ia" else (f.user.full_name if f.user else None),
                "created_at": f.created_at,
            }
        )

    stage_moves = db.scalars(
        select(OpportunityStageHistory)
        .join(Opportunity, Opportunity.id == OpportunityStageHistory.opportunity_id)
        .where(Opportunity.customer_id == customer.id)
    ).all()
    for s in stage_moves:
        from_name = s.from_stage.name if s.from_stage else "—"
        items.append(
            {
                "id": f"stage-{s.id}",
                "kind": "etapa",
                "icon": "kanban",
                "title": f"Etapa: {from_name} → {s.to_stage.name}",
                "body": None,
                "actor": None,
                "created_at": s.created_at,
            }
        )

    scores = db.scalars(select(LeadScoreHistory).where(LeadScoreHistory.customer_id == customer.id)).all()
    for s in scores:
        arrow = "subió" if s.new_score > s.old_score else "bajó"
        items.append(
            {
                "id": f"score-{s.id}",
                "kind": "score",
                "icon": "trending-up" if s.new_score > s.old_score else "trending-down",
                "title": f"Motor IQ {arrow} la intención: {s.old_score} → {s.new_score}",
                "body": s.reason,
                "actor": "Motor IQ",
                "created_at": s.created_at,
            }
        )

    quotes = db.scalars(select(Quote).where(Quote.customer_id == customer.id)).all()
    for q in quotes:
        items.append(
            {
                "id": f"quote-{q.id}",
                "kind": "cotizacion",
                "icon": "file-text",
                "title": f"Cotización #{q.number} · {q.vehicle.title if q.vehicle else ''}",
                "body": f"Total {q.total:,.0f}",
                "actor": q.user.full_name if q.user else None,
                "created_at": q.created_at,
            }
        )

    appointments = db.scalars(select(Appointment).where(Appointment.customer_id == customer.id)).all()
    for a in appointments:
        items.append(
            {
                "id": f"appt-{a.id}",
                "kind": "cita",
                "icon": "calendar",
                "title": a.title,
                "body": a.location,
                "actor": a.user.full_name if a.user else None,
                "created_at": a.starts_at,
            }
        )

    items.sort(key=lambda item: item["created_at"], reverse=True)
    return items[:LIMIT]
