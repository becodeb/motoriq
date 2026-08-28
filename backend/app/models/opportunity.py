from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.utils import utcnow
from app.database.base import Base, TimestampMixin, pk


class Opportunity(Base, TimestampMixin):
    __tablename__ = "opportunities"
    __table_args__ = (
        Index("ix_opportunities_org_status", "organization_id", "status"),
        Index("ix_opportunities_org_stage", "organization_id", "stage_id"),
    )

    id: Mapped[str] = pk()
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    vehicle_id: Mapped[str | None] = mapped_column(ForeignKey("vehicles.id"), index=True)
    owner_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), index=True)
    stage_id: Mapped[str] = mapped_column(ForeignKey("pipeline_stages.id"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="abierta")
    expected_value: Mapped[float | None] = mapped_column(Numeric(12, 2, asdecimal=False))
    probability: Mapped[int | None] = mapped_column(Integer)
    source: Mapped[str | None] = mapped_column(String(30))
    health: Mapped[str] = mapped_column(String(10), default="yellow")
    lost_reason: Mapped[str | None] = mapped_column(String(300))
    notes: Mapped[str | None] = mapped_column(Text)
    expected_close_date: Mapped[datetime | None] = mapped_column(DateTime)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime)

    customer = relationship("Customer", lazy="joined")
    vehicle = relationship("Vehicle", lazy="joined")
    owner = relationship("User", lazy="joined")
    stage = relationship("PipelineStage", lazy="joined")


class OpportunityStageHistory(Base):
    __tablename__ = "opportunity_stage_history"

    id: Mapped[str] = pk()
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    opportunity_id: Mapped[str] = mapped_column(ForeignKey("opportunities.id", ondelete="CASCADE"), index=True)
    from_stage_id: Mapped[str | None] = mapped_column(ForeignKey("pipeline_stages.id"))
    to_stage_id: Mapped[str] = mapped_column(ForeignKey("pipeline_stages.id"))
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    from_stage = relationship("PipelineStage", foreign_keys=[from_stage_id], lazy="joined")
    to_stage = relationship("PipelineStage", foreign_keys=[to_stage_id], lazy="joined")
