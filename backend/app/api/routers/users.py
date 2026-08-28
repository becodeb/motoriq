from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import DB, CurrentOrg, CurrentUser, ManagerUser
from app.core.constants import ROLES
from app.core.errors import ApiError, not_found
from app.core.security import hash_password
from app.models import User
from app.schemas.auth import UserCreate, UserOut, UserUpdate
from app.schemas.common import Msg
from app.services import audit

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserOut])
def list_users(db: DB, user: CurrentUser, org: CurrentOrg):
    # Todos pueden ver el equipo (para asignar clientes); solo managers lo administran.
    return db.scalars(
        select(User).where(User.organization_id == org.id).order_by(User.created_at)
    ).all()


@router.post("", response_model=UserOut, status_code=201)
def create_user(data: UserCreate, db: DB, manager: ManagerUser, org: CurrentOrg):
    if data.role not in ROLES:
        raise ApiError("INVALID_ROLE", f"Rol inválido: {data.role}", 400)
    if data.role == "admin" and manager.role != "admin":
        raise ApiError("FORBIDDEN", "Solo un administrador puede crear administradores", 403)
    email = data.email.lower().strip()
    if db.scalar(select(User.id).where(User.email == email)):
        raise ApiError("EMAIL_TAKEN", "Ya existe un usuario con ese email", 409)
    user = User(
        organization_id=org.id,
        email=email,
        password_hash=hash_password(data.password),
        first_name=data.first_name,
        last_name=data.last_name,
        role=data.role,
        phone=data.phone,
        avatar_color=data.avatar_color,
    )
    db.add(user)
    audit.log(db, org.id, "usuario_creado", "user", user.id, manager.id, {"email": email, "rol": data.role})
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: str, data: UserUpdate, db: DB, manager: ManagerUser, org: CurrentOrg):
    target = db.get(User, user_id)
    if not target or target.organization_id != org.id:
        raise not_found("usuario", "USER_NOT_FOUND")
    updates = data.model_dump(exclude_unset=True)
    if "role" in updates:
        if updates["role"] not in ROLES:
            raise ApiError("INVALID_ROLE", f"Rol inválido: {updates['role']}", 400)
        if (updates["role"] == "admin" or target.role == "admin") and manager.role != "admin":
            raise ApiError("FORBIDDEN", "Solo un administrador puede cambiar roles de administrador", 403)
    if "is_active" in updates and target.id == manager.id and not updates["is_active"]:
        raise ApiError("CANNOT_DEACTIVATE_SELF", "No podés desactivar tu propio usuario", 400)
    password = updates.pop("password", None)
    if password:
        target.password_hash = hash_password(password)
        target.token_version += 1
    for field, value in updates.items():
        setattr(target, field, value)
    if "is_active" in updates and not updates["is_active"]:
        target.token_version += 1
    audit.log(db, org.id, "usuario_editado", "user", target.id, manager.id, {"cambios": list(updates.keys())})
    db.commit()
    db.refresh(target)
    return target


@router.delete("/{user_id}", response_model=Msg)
def deactivate_user(user_id: str, db: DB, manager: ManagerUser, org: CurrentOrg):
    target = db.get(User, user_id)
    if not target or target.organization_id != org.id:
        raise not_found("usuario", "USER_NOT_FOUND")
    if target.id == manager.id:
        raise ApiError("CANNOT_DEACTIVATE_SELF", "No podés desactivar tu propio usuario", 400)
    if target.role == "admin" and manager.role != "admin":
        raise ApiError("FORBIDDEN", "Solo un administrador puede desactivar administradores", 403)
    target.is_active = False
    target.token_version += 1
    audit.log(db, org.id, "usuario_desactivado", "user", target.id, manager.id)
    db.commit()
    return Msg(message=f"{target.full_name} desactivado")
