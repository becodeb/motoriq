from pydantic import BaseModel, Field

from app.schemas.common import (
    ApiModel,
    CustomerBrief,
    UserBrief,
    UTCDateTime,
    VehicleBrief,
)

# ---------- Permutas ----------

class TradeInOut(ApiModel):
    id: str
    customer_id: str
    opportunity_id: str | None = None
    brand: str
    model: str
    version: str | None = None
    year: int | None = None
    km: int | None = None
    plate: str | None = None
    condition: str | None = None
    estimated_value: float | None = None
    offered_value: float | None = None
    status: str
    notes: str | None = None
    created_at: UTCDateTime


class TradeInCreate(BaseModel):
    customer_id: str
    opportunity_id: str | None = None
    brand: str = Field(min_length=1, max_length=60)
    model: str = Field(min_length=1, max_length=80)
    version: str | None = None
    year: int | None = Field(default=None, ge=1950, le=2100)
    km: int | None = Field(default=None, ge=0)
    plate: str | None = None
    condition: str | None = None
    estimated_value: float | None = Field(default=None, ge=0)
    offered_value: float | None = Field(default=None, ge=0)
    notes: str | None = None


class TradeInUpdate(BaseModel):
    version: str | None = None
    year: int | None = Field(default=None, ge=1950, le=2100)
    km: int | None = Field(default=None, ge=0)
    plate: str | None = None
    condition: str | None = None
    estimated_value: float | None = Field(default=None, ge=0)
    offered_value: float | None = Field(default=None, ge=0)
    status: str | None = None
    notes: str | None = None


# ---------- Financiación ----------

class FinancingSimulateRequest(BaseModel):
    vehicle_price: float = Field(gt=0)
    down_payment: float = Field(ge=0)
    installments: int = Field(ge=1, le=120)
    annual_rate: float = Field(ge=0, le=300)


class FinancingSimulateResponse(BaseModel):
    financed_amount: float
    monthly_payment: float
    total_paid: float
    total_interest: float
    disclaimer: str


class FinancingOut(ApiModel):
    id: str
    customer_id: str
    opportunity_id: str | None = None
    vehicle: VehicleBrief | None = None
    vehicle_price: float
    down_payment: float
    financed_amount: float
    installments: int
    annual_rate: float
    monthly_payment: float
    notes: str | None = None
    created_at: UTCDateTime


class FinancingCreate(BaseModel):
    customer_id: str
    opportunity_id: str | None = None
    vehicle_id: str | None = None
    vehicle_price: float = Field(gt=0)
    down_payment: float = Field(ge=0)
    installments: int = Field(ge=1, le=120)
    annual_rate: float = Field(ge=0, le=300)
    notes: str | None = None


# ---------- Cotizaciones ----------

class QuoteOut(ApiModel):
    id: str
    number: int
    customer: CustomerBrief
    opportunity_id: str | None = None
    vehicle: VehicleBrief
    user: UserBrief | None = None
    price: float
    discount: float
    trade_in_value: float
    expenses: float
    total: float
    notes: str | None = None
    status: str
    valid_until: UTCDateTime | None = None
    financing: FinancingOut | None = None
    created_at: UTCDateTime


class QuoteCreate(BaseModel):
    customer_id: str
    opportunity_id: str | None = None
    vehicle_id: str
    price: float = Field(gt=0)
    discount: float = Field(default=0, ge=0)
    trade_in_value: float = Field(default=0, ge=0)
    expenses: float = Field(default=0, ge=0)
    financing_scenario_id: str | None = None
    notes: str | None = None
    valid_until: UTCDateTime | None = None


class QuoteUpdate(BaseModel):
    price: float | None = Field(default=None, gt=0)
    discount: float | None = Field(default=None, ge=0)
    trade_in_value: float | None = Field(default=None, ge=0)
    expenses: float | None = Field(default=None, ge=0)
    notes: str | None = None
    status: str | None = None
    valid_until: UTCDateTime | None = None
