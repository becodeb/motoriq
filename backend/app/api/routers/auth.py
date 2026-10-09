from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Cookie, Request, Response
from sqlalchemy import select

from app.api.deps import DB, CurrentUser
from app.core.config import get_settings
from app.core.errors import ApiError
from app.core.rate_limit import auth_limiter, client_ip
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_reset_token,
    hash_password,
    verify_password,
)
from app.core.utils import utcnow
from app.models import User
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    ProfileUpdate,
    PublicConfig,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserOut,
)
from app.schemas.common import Msg
from app.services import audit, onboarding

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "pops_refresh"
COOKIE_PATH = "/api/v1/auth"


def _set_refresh_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=settings.refresh_token_days * 86400,
        httponly=True,
        samesite="lax",
        secure=not settings.debug,  # detrás de HTTPS en producción
        path=COOKIE_PATH,
    )


def _rate_limit(request: Request) -> None:
    if get_settings().rate_limit_enabled:
        auth_limiter.check(client_ip(request))


@router.get("/config", response_model=PublicConfig)
def public_config():
    """Configuración pública que necesita la pantalla de login (sin sesión)."""
    settings = get_settings()
    return PublicConfig(
        app_name=settings.app_name,
        demo_mode=settings.demo_mode,
        allow_signup=settings.allow_signup,
    )


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(data: RegisterRequest, db: DB, request: Request, response: Response):
    """Alta de una agencia nueva: crea la organización (vacía, con su configuración
    base) y su primer usuario administrador, y deja la sesión iniciada."""
    _rate_limit(request)
    if not get_settings().allow_signup:
        raise ApiError("SIGNUP_DISABLED", "El registro de nuevas agencias está deshabilitado", 403)
    email = data.email.lower().strip()
    if db.scalar(select(User.id).where(User.email == email)):
        raise ApiError("EMAIL_TAKEN", "Ya existe un usuario con ese email", 409)

    org = onboarding.create_organization(
        db,
        name=data.company_name.strip(),
        currency=data.currency.upper(),
        timezone=data.timezone,
    )
    user = User(
        organization_id=org.id,
        email=email,
        password_hash=hash_password(data.password),
        first_name=data.first_name.strip(),
        last_name=data.last_name.strip(),
        role="admin",
        phone=data.phone or None,
        avatar_color="cyan",
        last_login_at=utcnow(),
    )
    db.add(user)
    db.flush()
    audit.log(db, org.id, "organizacion_creada", "organization", org.id, user.id, {"nombre": org.name})
    db.commit()
    db.refresh(user)

    _set_refresh_cookie(response, create_refresh_token(user.id, user.token_version))
    return TokenResponse(
        access_token=create_access_token(user.id, user.organization_id, user.role),
        user=UserOut.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, db: DB, request: Request, response: Response):
    _rate_limit(request)
    user = db.scalar(select(User).where(User.email == data.email.lower().strip()))
    if not user or not verify_password(data.password, user.password_hash):
        raise ApiError("INVALID_CREDENTIALS", "Email o contraseña incorrectos", 401)
    if not user.is_active:
        raise ApiError("USER_INACTIVE", "El usuario está desactivado", 401)

    user.last_login_at = utcnow()
    db.commit()

    _set_refresh_cookie(response, create_refresh_token(user.id, user.token_version))
    return TokenResponse(
        access_token=create_access_token(user.id, user.organization_id, user.role),
        user=UserOut.model_validate(user),
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh(
    db: DB,
    response: Response,
    pops_refresh: Annotated[str | None, Cookie()] = None,
):
    if not pops_refresh:
        raise ApiError("NO_REFRESH_TOKEN", "Sesión no encontrada", 401)
    payload = decode_token(pops_refresh, expected_type="refresh")
    if not payload:
        raise ApiError("INVALID_REFRESH_TOKEN", "La sesión expiró", 401)
    user = db.get(User, payload.get("sub"))
    if not user or not user.is_active or payload.get("ver") != user.token_version:
        raise ApiError("INVALID_REFRESH_TOKEN", "La sesión ya no es válida", 401)

    # Rotación del refresh token en cada uso.
    _set_refresh_cookie(response, create_refresh_token(user.id, user.token_version))
    return TokenResponse(
        access_token=create_access_token(user.id, user.organization_id, user.role),
        user=UserOut.model_validate(user),
    )


@router.post("/logout", response_model=Msg)
def logout(db: DB, user: CurrentUser, response: Response):
    user.token_version += 1  # invalida todos los refresh tokens emitidos
    db.commit()
    response.delete_cookie(REFRESH_COOKIE, path=COOKIE_PATH)
    return Msg(message="Sesión cerrada")


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user


@router.patch("/me", response_model=UserOut)
def update_profile(data: ProfileUpdate, db: DB, user: CurrentUser):
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.post("/change-password", response_model=Msg)
def change_password(data: ChangePasswordRequest, db: DB, user: CurrentUser):
    if not verify_password(data.current_password, user.password_hash):
        raise ApiError("INVALID_CREDENTIALS", "La contraseña actual no es correcta", 400)
    user.password_hash = hash_password(data.new_password)
    user.token_version += 1
    db.commit()
    return Msg(message="Contraseña actualizada. Volvé a iniciar sesión.")


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(data: ForgotPasswordRequest, db: DB, request: Request):
    _rate_limit(request)
    settings = get_settings()
    user = db.scalar(select(User).where(User.email == data.email.lower().strip()))
    dev_token = None
    if user and user.is_active:
        token = generate_reset_token()
        user.reset_token = token
        user.reset_token_expires = utcnow() + timedelta(hours=2)
        db.commit()
        # Sin SMTP en desarrollo: en demo_mode devolvemos el token para completar el flujo.
        if settings.demo_mode:
            dev_token = token
    return ForgotPasswordResponse(
        message="Si el email existe, se generó un enlace de recuperación (válido por 2 horas).",
        dev_reset_token=dev_token,
    )


@router.post("/reset-password", response_model=Msg)
def reset_password(data: ResetPasswordRequest, db: DB, request: Request):
    _rate_limit(request)
    user = db.scalar(select(User).where(User.reset_token == data.token))
    if not user or not user.reset_token_expires or user.reset_token_expires < utcnow():
        raise ApiError("INVALID_RESET_TOKEN", "El enlace no es válido o expiró", 400)
    user.password_hash = hash_password(data.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    user.token_version += 1
    db.commit()
    return Msg(message="Contraseña restablecida. Ya podés iniciar sesión.")
