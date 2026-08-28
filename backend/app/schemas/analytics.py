from pydantic import BaseModel

from app.schemas.common import CustomerBrief, UTCDateTime, VehicleBrief


class MetricValue(BaseModel):
    value: float
    previous: float | None = None
    delta_percent: float | None = None


class OverviewOut(BaseModel):
    leads: MetricValue
    contacted: MetricValue
    opportunities: MetricValue
    reservations: MetricValue
    sales: MetricValue
    revenue: MetricValue
    conversion_rate: MetricValue
    avg_ticket: MetricValue
    avg_first_response_minutes: MetricValue
    avg_days_to_sale: MetricValue
    followups_completed: MetricValue
    followups_overdue: float
    leads_by_day: list[dict]
    sales_by_month: list[dict]


class FunnelStage(BaseModel):
    key: str
    name: str
    count: int
    rate_from_previous: float | None = None


class FunnelOut(BaseModel):
    stages: list[FunnelStage]
    total_leads: int
    won: int
    overall_rate: float


class SellerStats(BaseModel):
    user_id: str
    full_name: str
    avatar_color: str
    leads: int
    contacted: int
    opportunities: int
    sales: int
    revenue: float
    conversion_rate: float
    avg_first_response_minutes: float | None = None
    followups_completed: int
    followups_overdue: int
    open_opportunities: int


class SourceStats(BaseModel):
    source: str
    leads: int
    sales: int
    conversion_rate: float


class StockVehicleStat(BaseModel):
    vehicle: VehicleBrief
    inquiries: int
    days_in_stock: int
    conversion_rate: float | None = None


class StockIntelOut(BaseModel):
    most_inquired: list[StockVehicleStat]
    best_conversion: list[StockVehicleStat]
    fastest_sold: list[StockVehicleStat]
    stale: list[StockVehicleStat]
    avg_days_in_stock: float
    avg_days_sold: float | None = None
    inquiries_by_brand: list[dict]
    inquiries_by_model: list[dict]
    inquiries_by_price_range: list[dict]


class StockRecommendation(BaseModel):
    title: str
    detail: str
    reason: str
    metric: str | None = None


class PriceInterestPoint(BaseModel):
    range_label: str
    min_price: float
    max_price: float
    vehicles: int
    inquiries: int
    avg_days_in_stock: float | None = None
    sales: int


class PriceInterestOut(BaseModel):
    points: list[PriceInterestPoint]
    insight: str | None = None


class ForecastOut(BaseModel):
    pipeline_total: float
    weighted_forecast: float
    by_stage: list[dict]
    expected_closes_30d: int
    disclaimer: str


# ---------- Dashboard / Command Center ----------

class DashboardCounts(BaseModel):
    to_contact_today: int
    pending_followups_today: int
    overdue_followups: int
    awaiting_reply: int
    hot_opportunities: int
    probable_closes: int
    new_leads_today: int


class PriorityCard(BaseModel):
    customer: CustomerBrief
    icon: str  # fire | warning | clock | target
    headline: str
    vehicle_title: str | None = None
    probability: int | None = None
    reasons: list[str]
    action_label: str
    action_kind: str  # contactar | retomar | responder | seguimiento
    assigned_to: str | None = None


class AgendaItem(BaseModel):
    id: str
    kind: str  # followup | appointment | task
    time: UTCDateTime
    title: str
    subtitle: str | None = None
    customer_id: str | None = None
    status: str
    type: str


class DashboardOut(BaseModel):
    counts: DashboardCounts
    priorities: list[PriorityCard]
    agenda: list[AgendaItem]
    new_vehicle_matches: int
