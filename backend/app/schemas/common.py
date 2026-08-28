from datetime import datetime
from typing import Annotated, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, PlainSerializer


def _serialize_utc(value: datetime) -> str:
    return value.strftime("%Y-%m-%dT%H:%M:%SZ")


# Convención: la DB guarda naive-UTC; la API serializa siempre con sufijo Z.
UTCDateTime = Annotated[datetime, PlainSerializer(_serialize_utc, when_used="json-unless-none")]

T = TypeVar("T")


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class Msg(BaseModel):
    message: str


class UserBrief(ApiModel):
    id: str
    full_name: str
    avatar_color: str = "indigo"
    role: str = "vendedor"


class StageOut(ApiModel):
    id: str
    key: str
    name: str
    position: int
    color: str
    probability: int
    is_won: bool
    is_lost: bool
    is_active: bool


class VehicleBrief(ApiModel):
    id: str
    brand: str
    model: str
    version: str | None = None
    year: int
    price: float
    status: str
    title: str
    thumbnail_url: str | None = None


class CustomerBrief(ApiModel):
    id: str
    full_name: str
    phone: str | None = None
    status: str
    lead_score: int
    score_label: str
