from typing import Annotated

from fastapi import Depends, Header, Query
from sqlalchemy.orm import Session

from app.core.errors import ApiError, forbidden
from app.core.security import decode_token
from app.database.session import get_db
from app.models import Organization, User

DB = Annotated[Session, Depends(get_db)]


def get_current_user(
    db: DB,
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise ApiError("UNAUTHORIZED", "Necesitás iniciar sesión", 401)
    payload = decode_token(authorization.split(" ", 1)[1], expected_type="access")
    if not payload:
        raise ApiError("UNAUTHORIZED", "La sesión expiró, volvé a iniciar sesión", 401)
    user = db.get(User, payload.get("sub"))
    if not user or not user.is_active:
        raise ApiError("UNAUTHORIZED", "Usuario inválido o desactivado", 401)
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_current_org(db: DB, user: CurrentUser) -> Organization:
    org = db.get(Organization, user.organization_id)
    if not org:
        raise ApiError("ORGANIZATION_NOT_FOUND", "Organización no encontrada", 404)
    return org


CurrentOrg = Annotated[Organization, Depends(get_current_org)]


def require_manager(user: CurrentUser) -> User:
    """admin o gerente."""
    if user.role not in ("admin", "gerente"):
        raise forbidden()
    return user


def require_admin(user: CurrentUser) -> User:
    if user.role != "admin":
        raise forbidden()
    return user


ManagerUser = Annotated[User, Depends(require_manager)]
AdminUser = Annotated[User, Depends(require_admin)]


def is_manager(user: User) -> bool:
    return user.role in ("admin", "gerente")


class PageParams:
    def __init__(
        self,
        page: Annotated[int, Query(ge=1)] = 1,
        page_size: Annotated[int, Query(ge=1, le=200)] = 25,
    ) -> None:
        self.page = page
        self.page_size = page_size

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


Pagination = Annotated[PageParams, Depends()]
