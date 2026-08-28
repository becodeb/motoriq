from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.utils import utcnow
from app.database.base import Base, TimestampMixin, pk


class TradeIn(Base, TimestampMixin):
    __tablename__ = "trade_ins"

    id: Mapped[str] = pk()
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    opportunity_id: Mapped[str | None] = mapped_column(ForeignKey("opportunities.id"))
    brand: Mapped[str] = mapped_column(String(60))
    model: Mapped[str] = mapped_column(String(80))
    version: Mapped[str | None] = mapped_column(String(120))
    year: Mapped[int | None] = mapped_column(Integer)
    km: Mapped[int | None] = mapped_column(Integer)
    plate: Mapped[str | None] = mapped_column(String(20))
    condition: Mapped[str | None] = mapped_column(String(200))
    estimated_value: Mapped[float | None] = mapped_column(Numeric(12, 2, asdecimal=False))
    offered_value: Mapped[float | None] = mapped_column(Numeric(12, 2, asdecimal=False))
    status: Mapped[str] = mapped_column(String(20), default="pendiente")
    notes: Mapped[str | None] = mapped_column(Text)
    images: Mapped[list] = mapped_column(JSON, default=list)


class FinancingScenario(Base):
    __tablename__ = "financing_scenarios"

    id: Mapped[str] = pk()
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    opportunity_id: Mapped[str | None] = mapped_column(ForeignKey("opportunities.id"))
    vehicle_id: Mapped[str | None] = mapped_column(ForeignKey("vehicles.id"))
    vehicle_price: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False))
    down_payment: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False))
    financed_amount: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False))
    installments: Mapped[int] = mapped_column(Integer)
    annual_rate: Mapped[float] = mapped_column(Numeric(6, 2, asdecimal=False))
    monthly_payment: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False))
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    vehicle = relationship("Vehicle", lazy="joined")


class Quote(Base, TimestampMixin):
    __tablename__ = "quotes"
    __table_args__ = (Index("ix_quotes_org_number", "organization_id", "number"),)

    id: Mapped[str] = pk()
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    number: Mapped[int] = mapped_column(Integer)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    opportunity_id: Mapped[str | None] = mapped_column(ForeignKey("opportunities.id"))
    vehicle_id: Mapped[str] = mapped_column(ForeignKey("vehicles.id"), index=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    price: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False))
    discount: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False), default=0)
    trade_in_value: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False), default=0)
    expenses: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False), default=0)
    financing_scenario_id: Mapped[str | None] = mapped_column(ForeignKey("financing_scenarios.id"))
    total: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False))
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="borrador")
    valid_until: Mapped[datetime | None] = mapped_column(DateTime)

    customer = relationship("Customer", lazy="joined")
    vehicle = relationship("Vehicle", lazy="joined")
    user = relationship("User", lazy="joined")
    financing = relationship("FinancingScenario", lazy="joined")
