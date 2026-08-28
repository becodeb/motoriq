from pydantic import BaseModel, Field

from app.schemas.common import ApiModel, UTCDateTime


class NotificationOut(ApiModel):
    id: str
    type: str
    title: str
    body: str | None = None
    entity_type: str | None = None
    entity_id: str | None = None
    read_at: UTCDateTime | None = None
    created_at: UTCDateTime


class AutomationOut(ApiModel):
    id: str
    name: str
    description: str | None = None
    trigger: str
    conditions: list
    actions: list
    enabled: bool
    created_at: UTCDateTime


class AutomationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=400)
    trigger: str
    conditions: list = []
    actions: list = []
    enabled: bool = True


class AutomationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    trigger: str | None = None
    conditions: list | None = None
    actions: list | None = None
    enabled: bool | None = None


class AutomationRunOut(ApiModel):
    id: str
    automation_id: str
    trigger_entity_type: str | None = None
    trigger_entity_id: str | None = None
    status: str
    result: dict
    created_at: UTCDateTime


class SegmentOut(ApiModel):
    id: str
    name: str
    entity: str
    filters: dict
    created_at: UTCDateTime


class SegmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    entity: str = "customers"
    filters: dict = {}


class AuditLogOut(ApiModel):
    id: str
    actor_user_id: str | None = None
    actor_name: str | None = None
    action: str
    entity_type: str
    entity_id: str | None = None
    meta: dict
    created_at: UTCDateTime


class SearchResultItem(BaseModel):
    kind: str  # customer | vehicle | opportunity
    id: str
    title: str
    subtitle: str | None = None
    extra: str | None = None


class GlobalSearchOut(BaseModel):
    results: list[SearchResultItem]


class TimelineItem(BaseModel):
    id: str
    kind: str  # mensaje | nota | seguimiento | etapa | score | cotizacion | cita | sistema
    icon: str
    title: str
    body: str | None = None
    actor: str | None = None
    direction: str | None = None
    created_at: UTCDateTime


class ImportColumnMapping(BaseModel):
    # columna del CSV → campo del sistema ("" = ignorar)
    mapping: dict[str, str]


class ImportPreviewOut(BaseModel):
    token: str
    columns: list[str]
    suggested_mapping: dict[str, str]
    sample_rows: list[dict]
    total_rows: int


class ImportCommitRequest(BaseModel):
    token: str
    mapping: dict[str, str]


class ImportResultOut(BaseModel):
    created: int
    skipped: int
    errors: list[str]
