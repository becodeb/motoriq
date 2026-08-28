from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin, pk


class Followup(Base, TimestampMixin):
    __tablename__ = "followups"
    __table_args__ = (Index("ix_followups_org_status_due", "organization_id", "status", "due_at"),)

    id: Mapped[str] = pk()
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    opportunity_id: Mapped[str | None] = mapped_column(ForeignKey("opportunities.id"))
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), index=True)
    due_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    type: Mapped[str] = mapped_column(String(20), default="llamada")
    priority: Mapped[str] = mapped_column(String(10), default="media")
    note: Mapped[str | None] = mapped_column(Text)
    # sugerido | pendiente | completado | cancelado | descartado — "vencido" se calcula.
    status: Mapped[str] = mapped_column(String(20), default="pendiente")
    origin: Mapped[str] = mapped_column(String(20), default="manual")
    suggested_reason: Mapped[str | None] = mapped_column(String(300))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)

    customer = relationship("Customer", lazy="joined")
    user = relationship("User", lazy="joined")


class Task(Base, TimestampMixin):
    __tablename__ = "tasks"
    __table_args__ = (Index("ix_tasks_org_status_due", "organization_id", "status", "due_at"),)

    id: Mapped[str] = pk()
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), index=True)
    customer_id: Mapped[str | None] = mapped_column(ForeignKey("customers.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    type: Mapped[str] = mapped_column(String(20), default="seguimiento")
    due_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    priority: Mapped[str] = mapped_column(String(10), default="media")
    status: Mapped[str] = mapped_column(String(20), default="pendiente")
    origin: Mapped[str] = mapped_column(String(20), default="manual")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)

    customer = relationship("Customer", lazy="joined")
    user = relationship("User", lazy="joined")


class Appointment(Base, TimestampMixin):
    __tablename__ = "appointments"
    __table_args__ = (Index("ix_appointments_org_starts", "organization_id", "starts_at"),)

    id: Mapped[str] = pk()
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    customer_id: Mapped[str | None] = mapped_column(ForeignKey("customers.id", ondelete="SET NULL"))
    vehicle_id: Mapped[str | None] = mapped_column(ForeignKey("vehicles.id"))
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    type: Mapped[str] = mapped_column(String(20), default="visita")
    starts_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime)
    location: Mapped[str | None] = mapped_column(String(200))
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="agendada")

    customer = relationship("Customer", lazy="joined")
    vehicle = relationship("Vehicle", lazy="joined")
    user = relationship("User", lazy="joined")
