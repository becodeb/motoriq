from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.utils import utcnow
from app.database.base import Base, TimestampMixin, pk


class Vehicle(Base, TimestampMixin):
    __tablename__ = "vehicles"
    __table_args__ = (
        Index("ix_vehicles_org_status", "organization_id", "status"),
        Index("ix_vehicles_org_brand_model", "organization_id", "brand", "model"),
    )

    id: Mapped[str] = pk()
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    brand: Mapped[str] = mapped_column(String(60))
    model: Mapped[str] = mapped_column(String(80))
    version: Mapped[str | None] = mapped_column(String(120))
    year: Mapped[int] = mapped_column(Integer)
    km: Mapped[int] = mapped_column(Integer, default=0)
    price: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False))
    cost: Mapped[float | None] = mapped_column(Numeric(12, 2, asdecimal=False))
    plate: Mapped[str | None] = mapped_column(String(20), index=True)
    fuel: Mapped[str] = mapped_column(String(20), default="nafta")
    transmission: Mapped[str] = mapped_column(String(20), default="manual")
    color: Mapped[str | None] = mapped_column(String(40))
    location: Mapped[str | None] = mapped_column(String(120))
    body_type: Mapped[str] = mapped_column(String(20), default="sedan")
    doors: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="disponible")
    description: Mapped[str | None] = mapped_column(Text)
    observations: Mapped[str | None] = mapped_column(Text)
    assigned_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))

    entry_date: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    published_at: Mapped[datetime | None] = mapped_column(DateTime)
    sold_at: Mapped[datetime | None] = mapped_column(DateTime)
    sold_price: Mapped[float | None] = mapped_column(Numeric(12, 2, asdecimal=False))
    # Referencia blanda (sin FK) para evitar dependencia circular customers ↔ vehicles.
    buyer_customer_id: Mapped[str | None] = mapped_column(String(32))

    deleted_at: Mapped[datetime | None] = mapped_column(DateTime)

    images: Mapped[list["VehicleImage"]] = relationship(
        lazy="selectin", order_by="VehicleImage.position", cascade="all, delete-orphan"
    )
    assigned_user = relationship("User", lazy="joined")

    @property
    def title(self) -> str:
        return f"{self.brand} {self.model}" + (f" {self.version}" if self.version else "")

    @property
    def thumbnail_url(self) -> str | None:
        return self.images[0].url if self.images else None

    @property
    def days_in_stock(self) -> int:
        end = self.sold_at or utcnow()
        return max(0, (end - self.entry_date).days)


class VehicleImage(Base):
    __tablename__ = "vehicle_images"

    id: Mapped[str] = pk()
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    vehicle_id: Mapped[str] = mapped_column(ForeignKey("vehicles.id", ondelete="CASCADE"), index=True)
    url: Mapped[str] = mapped_column(String(500))
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class VehicleStatusHistory(Base):
    __tablename__ = "vehicle_status_history"

    id: Mapped[str] = pk()
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    vehicle_id: Mapped[str] = mapped_column(ForeignKey("vehicles.id", ondelete="CASCADE"), index=True)
    from_status: Mapped[str | None] = mapped_column(String(20))
    to_status: Mapped[str] = mapped_column(String(20))
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
