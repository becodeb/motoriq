from pydantic import BaseModel, Field

from app.schemas.common import (
    ApiModel,
    CustomerBrief,
    StageOut,
    UserBrief,
    UTCDateTime,
    VehicleBrief,
)

# ---------- Conversaciones ----------

class MessageOut(ApiModel):
    id: str
    conversation_id: str
    direction: str
    channel: str
    body: str
    sent_by: UserBrief | None = None
    ai_generated: bool
    created_at: UTCDateTime


class ConversationOut(ApiModel):
    id: str
    customer: CustomerBrief
    channel: str
    status: str
    last_message_at: UTCDateTime | None = None
    last_message_preview: str | None = None
    last_message_direction: str | None = None
    awaiting_reply: bool = False


class ConversationCreate(BaseModel):
    customer_id: str
    channel: str = "whatsapp"


class MessageCreate(BaseModel):
    direction: str  # entrante | saliente
    body: str = Field(min_length=1, max_length=8000)
    channel: str | None = None
    ai_generated: bool = False


class SuggestedReply(BaseModel):
    tone: str  # directa | cercana | formal
    text: str


class SuggestReplyResponse(BaseModel):
    suggestions: list[SuggestedReply]
    context_note: str | None = None


class DateDetection(BaseModel):
    detected: bool
    suggested_date: UTCDateTime | None = None
    phrase: str | None = None
    followup_id: str | None = None  # seguimiento sugerido creado


# ---------- Oportunidades ----------

class OpportunityOut(ApiModel):
    id: str
    customer: CustomerBrief
    vehicle: VehicleBrief | None = None
    owner: UserBrief | None = None
    stage: StageOut
    status: str
    expected_value: float | None = None
    probability: int | None = None
    source: str | None = None
    health: str
    lost_reason: str | None = None
    notes: str | None = None
    expected_close_date: UTCDateTime | None = None
    closed_at: UTCDateTime | None = None
    created_at: UTCDateTime
    updated_at: UTCDateTime


class OpportunityCreate(BaseModel):
    customer_id: str
    vehicle_id: str | None = None
    owner_user_id: str | None = None
    stage_id: str | None = None  # default: primera etapa
    expected_value: float | None = Field(default=None, ge=0)
    source: str | None = None
    notes: str | None = None
    expected_close_date: UTCDateTime | None = None


class OpportunityUpdate(BaseModel):
    vehicle_id: str | None = None
    owner_user_id: str | None = None
    expected_value: float | None = Field(default=None, ge=0)
    source: str | None = None
    notes: str | None = None
    expected_close_date: UTCDateTime | None = None


class StageMoveRequest(BaseModel):
    stage_id: str
    lost_reason: str | None = None
    sold_price: float | None = Field(default=None, ge=0)


class StageHistoryOut(ApiModel):
    id: str
    from_stage: StageOut | None = None
    to_stage: StageOut
    created_at: UTCDateTime


# ---------- Seguimientos ----------

class FollowupOut(ApiModel):
    id: str
    customer: CustomerBrief
    opportunity_id: str | None = None
    user: UserBrief | None = None
    due_at: UTCDateTime
    type: str
    priority: str
    note: str | None = None
    status: str
    origin: str
    suggested_reason: str | None = None
    completed_at: UTCDateTime | None = None
    is_overdue: bool = False
    created_at: UTCDateTime


class FollowupCreate(BaseModel):
    customer_id: str
    opportunity_id: str | None = None
    user_id: str | None = None  # default: usuario actual
    due_at: UTCDateTime
    type: str = "llamada"
    priority: str = "media"
    note: str | None = Field(default=None, max_length=2000)


class FollowupUpdate(BaseModel):
    due_at: UTCDateTime | None = None
    type: str | None = None
    priority: str | None = None
    note: str | None = None
    user_id: str | None = None


# ---------- Tareas ----------

class TaskOut(ApiModel):
    id: str
    title: str
    description: str | None = None
    type: str
    customer: CustomerBrief | None = None
    user: UserBrief | None = None
    due_at: UTCDateTime | None = None
    priority: str
    status: str
    origin: str
    completed_at: UTCDateTime | None = None
    is_overdue: bool = False
    created_at: UTCDateTime


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    type: str = "seguimiento"
    customer_id: str | None = None
    user_id: str | None = None
    due_at: UTCDateTime | None = None
    priority: str = "media"


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    type: str | None = None
    due_at: UTCDateTime | None = None
    priority: str | None = None
    user_id: str | None = None


# ---------- Citas ----------

class AppointmentOut(ApiModel):
    id: str
    title: str
    type: str
    customer: CustomerBrief | None = None
    vehicle: VehicleBrief | None = None
    user: UserBrief | None = None
    starts_at: UTCDateTime
    ends_at: UTCDateTime | None = None
    location: str | None = None
    notes: str | None = None
    status: str


class AppointmentCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    type: str = "visita"
    customer_id: str | None = None
    vehicle_id: str | None = None
    user_id: str | None = None
    starts_at: UTCDateTime
    ends_at: UTCDateTime | None = None
    location: str | None = None
    notes: str | None = None


class AppointmentUpdate(BaseModel):
    title: str | None = None
    type: str | None = None
    starts_at: UTCDateTime | None = None
    ends_at: UTCDateTime | None = None
    location: str | None = None
    notes: str | None = None
    status: str | None = None
    vehicle_id: str | None = None
    customer_id: str | None = None
