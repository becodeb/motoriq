"""Mensajes: efectos colaterales de registrar una conversación.

Cada mensaje actualiza denormalizados del cliente, recalcula el score,
detecta intención temporal (entrantes) y publica eventos de dominio.
"""

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.events import DomainEvent, publish
from app.core.utils import utcnow
from app.models import Conversation, Customer, Followup, Message, User
from app.services import scoring, temporal


def create_message(
    db: Session,
    conversation: Conversation,
    direction: str,
    body: str,
    actor: User | None = None,
    channel: str | None = None,
    ai_generated: bool = False,
    created_at=None,
) -> tuple[Message, Followup | None]:
    """Devuelve (mensaje, seguimiento_sugerido | None)."""
    now = created_at or utcnow()
    customer: Customer = db.get(Customer, conversation.customer_id)

    message = Message(
        organization_id=conversation.organization_id,
        conversation_id=conversation.id,
        customer_id=customer.id,
        direction=direction,
        channel=channel or conversation.channel,
        body=body,
        sent_by_user_id=actor.id if actor and direction == "saliente" else None,
        ai_generated=ai_generated,
        created_at=now,
    )
    db.add(message)

    conversation.last_message_at = now
    if direction == "entrante":
        conversation.status = "abierta"

    customer.last_contact_at = now
    if direction == "entrante":
        customer.last_inbound_at = now
    else:
        customer.last_outbound_at = now
        if customer.status == "lead":
            customer.status = "activo"
        # Tiempo de primera respuesta (§33): primer saliente después del alta del lead.
        if customer.first_response_seconds is None:
            first_inbound = db.scalar(
                select(Message.created_at)
                .where(Message.customer_id == customer.id, Message.direction == "entrante")
                .order_by(Message.created_at)
                .limit(1)
            )
            reference = first_inbound or customer.created_at
            customer.first_response_seconds = max(0, int((now - reference).total_seconds()))

    db.flush()
    scoring.apply_score(db, customer)

    suggested: Followup | None = None
    if direction == "entrante":
        detection = temporal.detect_followup_date(body, now)
        if detection:
            due_at, phrase = detection
            # No duplicar si ya hay un seguimiento sugerido/pendiente cerca de esa fecha.
            nearby = db.scalar(
                select(Followup.id).where(
                    Followup.customer_id == customer.id,
                    Followup.status.in_(("sugerido", "pendiente")),
                    Followup.due_at.between(due_at - timedelta(days=1), due_at + timedelta(days=1)),
                )
            )
            if not nearby:
                suggested = Followup(
                    organization_id=customer.organization_id,
                    customer_id=customer.id,
                    user_id=customer.assigned_user_id,
                    due_at=due_at,
                    type="whatsapp",
                    priority="media",
                    status="sugerido",
                    origin="ia",
                    note=f"Retomar contacto con {customer.first_name}",
                    suggested_reason=f'El cliente escribió “{phrase}”',
                )
                db.add(suggested)

    publish(
        db,
        DomainEvent(
            name="message.received" if direction == "entrante" else "message.sent",
            organization_id=conversation.organization_id,
            entity_type="customer",
            entity_id=customer.id,
            actor_user_id=actor.id if actor else None,
            data={"channel": message.channel, "conversation_id": conversation.id},
        ),
    )
    return message, suggested
