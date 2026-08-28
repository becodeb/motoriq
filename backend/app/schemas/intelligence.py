from pydantic import BaseModel

from app.schemas.common import ApiModel, CustomerBrief, UTCDateTime, VehicleBrief


class MatchOut(ApiModel):
    id: str
    customer: CustomerBrief
    vehicle: VehicleBrief
    score: int
    reasons: list
    status: str
    created_at: UTCDateTime


class ScoreHistoryOut(ApiModel):
    id: str
    old_score: int
    new_score: int
    reason: str | None = None
    factors: list
    created_at: UTCDateTime


class NextBestAction(BaseModel):
    action: str  # key estable (ej: enviar_financiacion)
    label: str  # texto corto para el botón/título
    reason: str  # por qué (señales)
    urgency: str = "media"  # baja | media | alta


class InsightOut(ApiModel):
    id: str
    kind: str
    title: str
    detail: str
    reason: str
    recommendation: str
    entity_type: str | None = None
    entity_id: str | None = None
    data: dict
    status: str
    created_at: UTCDateTime


class RadarCustomerItem(BaseModel):
    customer: CustomerBrief
    subtitle: str | None = None
    detail: str
    assigned_to: str | None = None
    metric: str | None = None


class RadarVehicleItem(BaseModel):
    vehicle: VehicleBrief
    detail: str
    metric: str | None = None


class RadarMatchItem(BaseModel):
    customer: CustomerBrief
    vehicle: VehicleBrief
    score: int
    detail: str


class RadarOut(BaseModel):
    hot_customers: list[RadarCustomerItem]
    urgent_followups: list[RadarCustomerItem]
    ghosted_customers: list[RadarCustomerItem]
    high_demand_vehicles: list[RadarVehicleItem]
    stale_vehicles: list[RadarVehicleItem]
    new_matches: list[RadarMatchItem]
    probable_closes: list[RadarCustomerItem]


class AIUsageSummary(BaseModel):
    total_cost: float
    total_input_tokens: int
    total_output_tokens: int
    total_calls: int
    by_feature: list[dict]
    by_day: list[dict]
    recent: list[dict]


class ChatMessage(BaseModel):
    role: str  # user | assistant
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


class ChatToolCall(BaseModel):
    tool: str
    summary: str


class ChatResponse(BaseModel):
    reply: str
    tool_calls: list[ChatToolCall] = []


class AIStatus(BaseModel):
    configured: bool
    provider: str | None = None
    model: str | None = None
    allow_ai_processing: bool = True
    source: str | None = None  # organizacion | entorno
