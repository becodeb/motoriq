from fastapi import APIRouter
from sqlalchemy import func, or_, select

from app.ai import service as ai_service
from app.api.deps import DB, CurrentOrg, CurrentUser, Pagination
from app.core.constants import CHANNELS, MESSAGE_DIRECTIONS
from app.core.errors import ApiError, not_found
from app.models import Conversation, Customer, Message
from app.schemas.common import Page
from app.schemas.sales import (
    ConversationCreate,
    ConversationOut,
    MessageCreate,
    MessageOut,
    SuggestReplyResponse,
)
from app.services import messages as messages_service

router = APIRouter(prefix="/conversations", tags=["conversations"])


def _conversation_out(db, conversation: Conversation) -> dict:
    last = db.scalar(
        select(Message)
        .where(Message.conversation_id == conversation.id)
        .order_by(Message.created_at.desc())
        .limit(1)
    )
    customer = conversation.customer
    return {
        "id": conversation.id,
        "customer": customer,
        "channel": conversation.channel,
        "status": conversation.status,
        "last_message_at": conversation.last_message_at,
        "last_message_preview": (last.body[:120] if last else None),
        "last_message_direction": last.direction if last else None,
        "awaiting_reply": bool(customer and customer.awaiting_reply),
    }


@router.get("", response_model=Page[ConversationOut])
def list_conversations(
    db: DB,
    user: CurrentUser,
    org: CurrentOrg,
    pagination: Pagination,
    q: str | None = None,
    channel: str | None = None,
    awaiting_reply: bool | None = None,
    customer_id: str | None = None,
):
    query = (
        select(Conversation)
        .join(Customer, Customer.id == Conversation.customer_id)
        .where(Conversation.organization_id == org.id, Customer.deleted_at.is_(None))
    )
    if q:
        like = f"%{q.strip()}%"
        query = query.where(
            or_((Customer.first_name + " " + Customer.last_name).ilike(like), Customer.phone.ilike(like))
        )
    if channel:
        query = query.where(Conversation.channel == channel)
    if customer_id:
        query = query.where(Conversation.customer_id == customer_id)
    if awaiting_reply:
        query = query.where(
            Customer.last_inbound_at.isnot(None),
            or_(Customer.last_outbound_at.is_(None), Customer.last_inbound_at > Customer.last_outbound_at),
        )

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    conversations = db.scalars(
        query.order_by(Conversation.last_message_at.desc().nulls_last())
        .offset(pagination.offset)
        .limit(pagination.page_size)
    ).all()
    return {
        "items": [_conversation_out(db, c) for c in conversations],
        "total": total,
        "page": pagination.page,
        "page_size": pagination.page_size,
    }


@router.post("", response_model=ConversationOut, status_code=201)
def create_conversation(data: ConversationCreate, db: DB, user: CurrentUser, org: CurrentOrg):
    customer = db.get(Customer, data.customer_id)
    if not customer or customer.organization_id != org.id or customer.deleted_at:
        raise not_found("cliente", "CUSTOMER_NOT_FOUND")
    if data.channel not in CHANNELS:
        raise ApiError("INVALID_CHANNEL", f"Canal inválido: {data.channel}", 400)
    existing = db.scalar(
        select(Conversation).where(
            Conversation.customer_id == customer.id,
            Conversation.channel == data.channel,
            Conversation.status == "abierta",
        )
    )
    if existing:
        return _conversation_out(db, existing)
    conversation = Conversation(
        organization_id=org.id,
        customer_id=customer.id,
        channel=data.channel,
        assigned_user_id=customer.assigned_user_id,
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return _conversation_out(db, conversation)


@router.get("/{conversation_id}", response_model=ConversationOut)
def get_conversation(conversation_id: str, db: DB, user: CurrentUser, org: CurrentOrg):
    conversation = db.get(Conversation, conversation_id)
    if not conversation or conversation.organization_id != org.id:
        raise not_found("conversación", "CONVERSATION_NOT_FOUND")
    return _conversation_out(db, conversation)


@router.get("/{conversation_id}/messages", response_model=list[MessageOut])
def list_messages(conversation_id: str, db: DB, user: CurrentUser, org: CurrentOrg):
    conversation = db.get(Conversation, conversation_id)
    if not conversation or conversation.organization_id != org.id:
        raise not_found("conversación", "CONVERSATION_NOT_FOUND")
    return db.scalars(
        select(Message)
        .where(Message.conversation_id == conversation.id)
        .order_by(Message.created_at)
        .limit(500)
    ).all()


@router.post("/{conversation_id}/messages")
def create_message(conversation_id: str, data: MessageCreate, db: DB, user: CurrentUser, org: CurrentOrg):
    conversation = db.get(Conversation, conversation_id)
    if not conversation or conversation.organization_id != org.id:
        raise not_found("conversación", "CONVERSATION_NOT_FOUND")
    if data.direction not in MESSAGE_DIRECTIONS:
        raise ApiError("INVALID_DIRECTION", "La dirección debe ser entrante o saliente", 400)

    message, suggested = messages_service.create_message(
        db,
        conversation,
        direction=data.direction,
        body=data.body,
        actor=user,
        channel=data.channel,
        ai_generated=data.ai_generated,
    )
    db.commit()
    db.refresh(message)
    result: dict = {"message": MessageOut.model_validate(message).model_dump(mode="json")}
    if suggested:
        db.refresh(suggested)
        result["suggested_followup"] = {
            "id": suggested.id,
            "due_at": suggested.due_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "reason": suggested.suggested_reason,
        }
    return result


@router.post("/{conversation_id}/suggest-reply", response_model=SuggestReplyResponse)
def suggest_reply(conversation_id: str, db: DB, user: CurrentUser, org: CurrentOrg):
    conversation = db.get(Conversation, conversation_id)
    if not conversation or conversation.organization_id != org.id:
        raise not_found("conversación", "CONVERSATION_NOT_FOUND")
    has_messages = db.scalar(select(Message.id).where(Message.conversation_id == conversation.id).limit(1))
    if not has_messages:
        raise ApiError("CONVERSATION_EMPTY", "No hay mensajes para responder", 400)
    suggestions = ai_service.suggest_replies(db, org, user, conversation)
    db.commit()
    return {"suggestions": suggestions, "context_note": None}
