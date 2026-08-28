from pydantic import BaseModel, Field

from app.schemas.common import ApiModel, UserBrief, UTCDateTime, VehicleBrief


class TagOut(ApiModel):
    id: str
    name: str
    color: str


class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    color: str = "zinc"


class CustomerOut(ApiModel):
    id: str
    first_name: str
    last_name: str
    full_name: str
    phone: str | None = None
    whatsapp: str | None = None
    email: str | None = None
    source: str
    status: str
    assigned_user: UserBrief | None = None
    interested_vehicle: VehicleBrief | None = None
    budget: float | None = None
    financing_interest: bool
    has_trade_in: bool
    interest_brand: str | None = None
    interest_model: str | None = None
    interest_body_type: str | None = None
    interest_year_min: int | None = None
    interest_year_max: int | None = None
    interest_transmission: str | None = None
    interest_fuel: str | None = None
    notes: str | None = None
    lead_score: int
    score_label: str
    score_reason: str | None = None
    score_factors: list
    score_updated_at: UTCDateTime | None = None
    ai_summary: str | None = None
    ai_summary_at: UTCDateTime | None = None
    last_contact_at: UTCDateTime | None = None
    last_inbound_at: UTCDateTime | None = None
    last_outbound_at: UTCDateTime | None = None
    next_followup_at: UTCDateTime | None = None
    awaiting_reply: bool
    tags: list[TagOut] = []
    created_at: UTCDateTime
    updated_at: UTCDateTime


class CustomerCreate(BaseModel):
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(default="", max_length=80)
    phone: str | None = Field(default=None, max_length=40)
    whatsapp: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=255)
    source: str = "otro"
    status: str = "lead"
    assigned_user_id: str | None = None
    interested_vehicle_id: str | None = None
    budget: float | None = Field(default=None, ge=0)
    financing_interest: bool = False
    has_trade_in: bool = False
    interest_brand: str | None = None
    interest_model: str | None = None
    interest_body_type: str | None = None
    interest_year_min: int | None = None
    interest_year_max: int | None = None
    interest_transmission: str | None = None
    interest_fuel: str | None = None
    notes: str | None = None
    tag_ids: list[str] = []
    # Si es true, crea también la oportunidad inicial en la etapa "nuevo".
    create_opportunity: bool = True
    force: bool = False  # crear aunque haya posibles duplicados


class CustomerUpdate(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=80)
    last_name: str | None = Field(default=None, max_length=80)
    phone: str | None = Field(default=None, max_length=40)
    whatsapp: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=255)
    source: str | None = None
    status: str | None = None
    assigned_user_id: str | None = None
    interested_vehicle_id: str | None = None
    budget: float | None = Field(default=None, ge=0)
    financing_interest: bool | None = None
    has_trade_in: bool | None = None
    interest_brand: str | None = None
    interest_model: str | None = None
    interest_body_type: str | None = None
    interest_year_min: int | None = None
    interest_year_max: int | None = None
    interest_transmission: str | None = None
    interest_fuel: str | None = None
    notes: str | None = None
    tag_ids: list[str] | None = None


class NoteOut(ApiModel):
    id: str
    body: str
    pinned: bool
    user: UserBrief | None = None
    created_at: UTCDateTime


class NoteCreate(BaseModel):
    body: str = Field(min_length=1, max_length=5000)
    pinned: bool = False


class DuplicateMatch(ApiModel):
    id: str
    full_name: str
    phone: str | None = None
    email: str | None = None
    matched_by: str  # telefono | email | nombre


class DuplicateCheckResponse(BaseModel):
    duplicates: list[DuplicateMatch]


class MergeRequest(BaseModel):
    source_customer_id: str  # se fusiona (y desactiva) dentro del cliente destino
