from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.utils import utcnow
from app.database.base import Base, TimestampMixin, pk

customer_tags = Table(
    "customer_tags",
    Base.metadata,
    Column("customer_id", ForeignKey("customers.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Tag(Base):
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("organization_id", "name", name="uq_tag_org_name"),)

    id: Mapped[str] = pk()
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    name: Mapped[str] = mapped_column(String(60))
    color: Mapped[str] = mapped_column(String(30), default="zinc")


class Customer(Base, TimestampMixin):
    __tablename__ = "customers"
    __table_args__ = (
        Index("ix_customers_org_status", "organization_id", "status"),
        Index("ix_customers_org_score", "organization_id", "lead_score"),
        Index("ix_customers_org_assigned", "organization_id", "assigned_user_id"),
    )

    id: Mapped[str] = pk()
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    first_name: Mapped[str] = mapped_column(String(80))
    last_name: Mapped[str] = mapped_column(String(80), default="")
    phone: Mapped[str | None] = mapped_column(String(40), index=True)
    whatsapp: Mapped[str | None] = mapped_column(String(40))
    email: Mapped[str | None] = mapped_column(String(255), index=True)
    source: Mapped[str] = mapped_column(String(30), default="otro")
    status: Mapped[str] = mapped_column(String(20), default="lead")
    assigned_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), index=True)

    # Interés estructurado (alimenta matching y analytics de demanda).
    interested_vehicle_id: Mapped[str | None] = mapped_column(ForeignKey("vehicles.id"), index=True)
    budget: Mapped[float | None] = mapped_column(Numeric(12, 2, asdecimal=False))
    financing_interest: Mapped[bool] = mapped_column(Boolean, default=False)
    has_trade_in: Mapped[bool] = mapped_column(Boolean, default=False)
    interest_brand: Mapped[str | None] = mapped_column(String(60))
    interest_model: Mapped[str | None] = mapped_column(String(80))
    interest_body_type: Mapped[str | None] = mapped_column(String(20))
    interest_year_min: Mapped[int | None] = mapped_column(Integer)
    interest_year_max: Mapped[int | None] = mapped_column(Integer)
    interest_transmission: Mapped[str | None] = mapped_column(String(20))
    interest_fuel: Mapped[str | None] = mapped_column(String(20))
    notes: Mapped[str | None] = mapped_column(Text)

    # Scoring (motor determinístico + IA). Historial en lead_score_history.
    lead_score: Mapped[int] = mapped_column(Integer, default=25)
    score_label: Mapped[str] = mapped_column(String(12), default="frio")
    score_reason: Mapped[str | None] = mapped_column(String(300))
    score_factors: Mapped[list] = mapped_column(JSON, default=list)
    score_updated_at: Mapped[datetime | None] = mapped_column(DateTime)

    # Resumen IA (§19) — se regenera cuando cambia la conversación.
    ai_summary: Mapped[str | None] = mapped_column(Text)
    ai_summary_at: Mapped[datetime | None] = mapped_column(DateTime)

    # Denormalizados para listas/filtros rápidos.
    last_contact_at: Mapped[datetime | None] = mapped_column(DateTime)
    last_inbound_at: Mapped[datetime | None] = mapped_column(DateTime)
    last_outbound_at: Mapped[datetime | None] = mapped_column(DateTime)
    next_followup_at: Mapped[datetime | None] = mapped_column(DateTime)
    first_response_seconds: Mapped[int | None] = mapped_column(Integer)

    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime)

    tags: Mapped[list[Tag]] = relationship(secondary=customer_tags, lazy="selectin", order_by=Tag.name)
    assigned_user = relationship("User", foreign_keys=[assigned_user_id], lazy="joined")
    interested_vehicle = relationship("Vehicle", foreign_keys=[interested_vehicle_id], lazy="joined")

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def awaiting_reply(self) -> bool:
        """True si el último mensaje es del cliente y todavía no respondimos."""
        if not self.last_inbound_at:
            return False
        return self.last_outbound_at is None or self.last_inbound_at > self.last_outbound_at


class CustomerNote(Base):
    __tablename__ = "customer_notes"

    id: Mapped[str] = pk()
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(Text)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    user = relationship("User", lazy="joined")
