from pydantic import BaseModel, Field

from app.schemas.common import ApiModel, CustomerBrief, UserBrief, UTCDateTime


class VehicleImageOut(ApiModel):
    id: str
    url: str
    position: int


class VehicleOut(ApiModel):
    id: str
    brand: str
    model: str
    version: str | None = None
    title: str
    year: int
    km: int
    price: float
    # cost y margen solo visibles para admin/gerente (el router los anula para vendedor).
    cost: float | None = None
    plate: str | None = None
    fuel: str
    transmission: str
    color: str | None = None
    location: str | None = None
    body_type: str
    doors: int | None = None
    status: str
    description: str | None = None
    observations: str | None = None
    assigned_user: UserBrief | None = None
    entry_date: UTCDateTime
    published_at: UTCDateTime | None = None
    sold_at: UTCDateTime | None = None
    sold_price: float | None = None
    days_in_stock: int
    thumbnail_url: str | None = None
    images: list[VehicleImageOut] = []
    created_at: UTCDateTime
    updated_at: UTCDateTime


class VehicleCreate(BaseModel):
    brand: str = Field(min_length=1, max_length=60)
    model: str = Field(min_length=1, max_length=80)
    version: str | None = Field(default=None, max_length=120)
    year: int = Field(ge=1950, le=2100)
    km: int = Field(default=0, ge=0)
    price: float = Field(gt=0)
    cost: float | None = Field(default=None, ge=0)
    plate: str | None = Field(default=None, max_length=20)
    fuel: str = "nafta"
    transmission: str = "manual"
    color: str | None = None
    location: str | None = None
    body_type: str = "sedan"
    doors: int | None = Field(default=None, ge=2, le=6)
    status: str = "disponible"
    description: str | None = None
    observations: str | None = None
    assigned_user_id: str | None = None


class VehicleUpdate(BaseModel):
    brand: str | None = Field(default=None, min_length=1, max_length=60)
    model: str | None = Field(default=None, min_length=1, max_length=80)
    version: str | None = None
    year: int | None = Field(default=None, ge=1950, le=2100)
    km: int | None = Field(default=None, ge=0)
    price: float | None = Field(default=None, gt=0)
    cost: float | None = Field(default=None, ge=0)
    plate: str | None = None
    fuel: str | None = None
    transmission: str | None = None
    color: str | None = None
    location: str | None = None
    body_type: str | None = None
    doors: int | None = Field(default=None, ge=2, le=6)
    description: str | None = None
    observations: str | None = None
    assigned_user_id: str | None = None


class VehicleStatusChange(BaseModel):
    status: str
    sold_price: float | None = Field(default=None, ge=0)
    buyer_customer_id: str | None = None


class VehicleStatusHistoryOut(ApiModel):
    id: str
    from_status: str | None = None
    to_status: str
    created_at: UTCDateTime


class VehicleStatsOut(BaseModel):
    inquiries: int
    interested_customers: list[CustomerBrief]
    opportunities_count: int
    quotes_count: int
    appointments_count: int
    conversion_rate: float | None = None  # oportunidades ganadas / consultas
    margin: float | None = None
    margin_percent: float | None = None
    demand_index: float | None = None  # consultas vs promedio de la flota
    demand_text: str | None = None
    avg_days_fleet: float | None = None
