from sqlalchemy import (
    JSON,
    Boolean,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin, pk


class Organization(Base, TimestampMixin):
    __tablename__ = "organizations"

    id: Mapped[str] = pk()
    name: Mapped[str] = mapped_column(String(120))
    logo_url: Mapped[str | None] = mapped_column(String(500))
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    locale: Mapped[str] = mapped_column(String(16), default="es-AR")
    timezone: Mapped[str] = mapped_column(String(64), default="America/Argentina/Buenos_Aires")

    # Configuración de IA por organización (tiene prioridad sobre las variables de entorno).
    ai_provider: Mapped[str | None] = mapped_column(String(30))
    ai_model: Mapped[str | None] = mapped_column(String(80))
    ai_api_key: Mapped[str | None] = mapped_column(String(300))
    ai_base_url: Mapped[str | None] = mapped_column(String(300))
    allow_ai_processing: Mapped[bool] = mapped_column(Boolean, default=True)
    ai_monthly_limit_usd: Mapped[float | None] = mapped_column(Numeric(10, 2, asdecimal=False))

    lead_distribution: Mapped[str] = mapped_column(String(20), default="round_robin")
    retention_days: Mapped[int | None] = mapped_column(Integer)
    settings: Mapped[dict] = mapped_column(JSON, default=dict)


class PipelineStage(Base):
    __tablename__ = "pipeline_stages"
    __table_args__ = (UniqueConstraint("organization_id", "key", name="uq_stage_org_key"),)

    id: Mapped[str] = pk()
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    key: Mapped[str] = mapped_column(String(50))
    name: Mapped[str] = mapped_column(String(80))
    position: Mapped[int] = mapped_column(Integer, default=0)
    color: Mapped[str] = mapped_column(String(30), default="zinc")
    probability: Mapped[int] = mapped_column(Integer, default=0)
    is_won: Mapped[bool] = mapped_column(Boolean, default=False)
    is_lost: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class FeatureFlag(Base):
    __tablename__ = "feature_flags"
    __table_args__ = (UniqueConstraint("organization_id", "key", name="uq_flag_org_key"),)

    id: Mapped[str] = pk()
    organization_id: Mapped[str | None] = mapped_column(ForeignKey("organizations.id"), index=True)
    key: Mapped[str] = mapped_column(String(80))
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
