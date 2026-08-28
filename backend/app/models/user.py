from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin, pk


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[str] = pk()
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    first_name: Mapped[str] = mapped_column(String(80))
    last_name: Mapped[str] = mapped_column(String(80))
    role: Mapped[str] = mapped_column(String(20), default="vendedor")
    phone: Mapped[str | None] = mapped_column(String(40))
    avatar_color: Mapped[str] = mapped_column(String(20), default="indigo")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Se incrementa en logout / cambio de contraseña para invalidar refresh tokens emitidos.
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime)
    reset_token: Mapped[str | None] = mapped_column(String(128), index=True)
    reset_token_expires: Mapped[datetime | None] = mapped_column(DateTime)

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()
