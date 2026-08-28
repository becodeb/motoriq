from pydantic import BaseModel, EmailStr, Field

from app.schemas.common import ApiModel, UTCDateTime


class UserOut(ApiModel):
    id: str
    email: str
    first_name: str
    last_name: str
    full_name: str
    role: str
    phone: str | None = None
    avatar_color: str
    is_active: bool
    last_login_at: UTCDateTime | None = None
    created_at: UTCDateTime


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    message: str
    # Solo en demo_mode (sin SMTP configurado) — permite completar el flujo localmente.
    dev_reset_token: str | None = None


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    role: str = "vendedor"
    phone: str | None = None
    avatar_color: str = "indigo"


class UserUpdate(BaseModel):
    first_name: str | None = Field(default=None, max_length=80)
    last_name: str | None = Field(default=None, max_length=80)
    role: str | None = None
    phone: str | None = None
    avatar_color: str | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)


class ProfileUpdate(BaseModel):
    first_name: str | None = Field(default=None, max_length=80)
    last_name: str | None = Field(default=None, max_length=80)
    phone: str | None = None
    avatar_color: str | None = None
