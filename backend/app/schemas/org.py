from pydantic import BaseModel, Field

from app.schemas.common import ApiModel


class OrganizationOut(ApiModel):
    id: str
    name: str
    logo_url: str | None = None
    currency: str
    locale: str
    timezone: str
    lead_distribution: str
    allow_ai_processing: bool
    ai_provider: str | None = None
    ai_model: str | None = None
    ai_base_url: str | None = None
    ai_monthly_limit_usd: float | None = None
    # Nunca exponemos la key: solo si está configurada y sus últimos 4 caracteres.
    ai_api_key_set: bool = False
    ai_api_key_hint: str | None = None


class OrganizationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    logo_url: str | None = None
    currency: str | None = Field(default=None, max_length=8)
    locale: str | None = Field(default=None, max_length=16)
    timezone: str | None = Field(default=None, max_length=64)
    lead_distribution: str | None = None


class AIConfigUpdate(BaseModel):
    ai_provider: str | None = None
    ai_model: str | None = None
    ai_api_key: str | None = Field(default=None, max_length=300)
    ai_base_url: str | None = None
    allow_ai_processing: bool | None = None
    ai_monthly_limit_usd: float | None = Field(default=None, ge=0)


class StageCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    color: str = "zinc"
    probability: int = Field(default=0, ge=0, le=100)


class StageUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    color: str | None = None
    probability: int | None = Field(default=None, ge=0, le=100)
    is_active: bool | None = None


class StageReorder(BaseModel):
    stage_ids: list[str]


class FeatureFlagOut(ApiModel):
    id: str
    key: str
    enabled: bool
    payload: dict


class FeatureFlagUpdate(BaseModel):
    enabled: bool
