from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.utils import utcnow
from app.database.base import Base, TimestampMixin, pk


class Conversation(Base, TimestampMixin):
    __tablename__ = "conversations"
    __table_args__ = (Index("ix_conversations_org_last", "organization_id", "last_message_at"),)

    id: Mapped[str] = pk()
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    channel: Mapped[str] = mapped_column(String(30), default="whatsapp")
    status: Mapped[str] = mapped_column(String(20), default="abierta")
    assigned_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime)

    customer = relationship("Customer", lazy="joined")


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (Index("ix_messages_conv_created", "conversation_id", "created_at"),)

    id: Mapped[str] = pk()
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    direction: Mapped[str] = mapped_column(String(10))  # entrante | saliente
    channel: Mapped[str] = mapped_column(String(30), default="whatsapp")
    body: Mapped[str] = mapped_column(Text)
    sent_by_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    ai_generated: Mapped[bool] = mapped_column(Boolean, default=False)
    meta: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    sent_by = relationship("User", lazy="joined")
