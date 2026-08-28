from fastapi import APIRouter
from sqlalchemy import select

from app.ai import service as ai_service
from app.api.deps import DB, AdminUser, CurrentOrg, CurrentUser
from app.core.errors import ApiError, not_found
from app.models import AIInsight, Customer, CustomerVehicleMatch
from app.schemas.common import Msg
from app.schemas.intelligence import (
    AIStatus,
    AIUsageSummary,
    ChatRequest,
    ChatResponse,
    InsightOut,
    MatchOut,
    RadarOut,
)
from app.services import insights as insights_service
from app.services import radar

router = APIRouter(tags=["intelligence"])


@router.get("/intelligence/radar", response_model=RadarOut)
def get_radar(db: DB, user: CurrentUser, org: CurrentOrg):
    return radar.get_radar(db, org, user)


@router.get("/insights", response_model=list[InsightOut])
def list_insights(
    db: DB,
    user: CurrentUser,
    org: CurrentOrg,
    status: str | None = "nueva",
    kind: str | None = None,
    limit: int = 50,
):
    query = select(AIInsight).where(AIInsight.organization_id == org.id)
    if status and status != "todas":
        query = query.where(AIInsight.status == status)
    if kind:
        query = query.where(AIInsight.kind == kind)
    return db.scalars(query.order_by(AIInsight.created_at.desc()).limit(min(limit, 100))).all()


@router.post("/insights/generate", response_model=Msg)
def generate_insights(db: DB, user: CurrentUser, org: CurrentOrg):
    created = insights_service.generate_for_org(db, org)
    db.commit()
    return Msg(message=f"{created} insights nuevos" if created else "Sin novedades: todo lo detectable ya estaba informado")


@router.post("/insights/{insight_id}/status", response_model=InsightOut)
def update_insight_status(insight_id: str, db: DB, user: CurrentUser, org: CurrentOrg, status: str):
    insight = db.get(AIInsight, insight_id)
    if not insight or insight.organization_id != org.id:
        raise not_found("insight", "INSIGHT_NOT_FOUND")
    if status not in ("nueva", "vista", "descartada", "accionada"):
        raise ApiError("INVALID_STATUS", f"Estado inválido: {status}", 400)
    insight.status = status
    db.commit()
    db.refresh(insight)
    return insight


@router.get("/matches", response_model=list[MatchOut])
def list_matches(
    db: DB,
    user: CurrentUser,
    org: CurrentOrg,
    customer_id: str | None = None,
    vehicle_id: str | None = None,
    status: str | None = None,
    limit: int = 50,
):
    query = select(CustomerVehicleMatch).join(
        Customer, Customer.id == CustomerVehicleMatch.customer_id
    ).where(CustomerVehicleMatch.organization_id == org.id, Customer.deleted_at.is_(None))
    if customer_id:
        query = query.where(CustomerVehicleMatch.customer_id == customer_id)
    if vehicle_id:
        query = query.where(CustomerVehicleMatch.vehicle_id == vehicle_id)
    if status:
        query = query.where(CustomerVehicleMatch.status == status)
    return db.scalars(
        query.order_by(CustomerVehicleMatch.score.desc()).limit(min(limit, 100))
    ).all()


@router.post("/matches/{match_id}/status", response_model=MatchOut)
def update_match_status(match_id: str, db: DB, user: CurrentUser, org: CurrentOrg, status: str):
    match = db.get(CustomerVehicleMatch, match_id)
    if not match or match.organization_id != org.id:
        raise not_found("match", "MATCH_NOT_FOUND")
    if status not in ("sugerido", "enviado", "descartado", "convertido"):
        raise ApiError("INVALID_STATUS", f"Estado inválido: {status}", 400)
    match.status = status
    db.commit()
    db.refresh(match)
    return match


# ---------- IA ----------

@router.get("/ai/status", response_model=AIStatus)
def ai_status(org: CurrentOrg, user: CurrentUser):
    return ai_service.get_status(org)


@router.post("/ai/chat", response_model=ChatResponse)
def ai_chat(data: ChatRequest, db: DB, user: CurrentUser, org: CurrentOrg):
    from app.core.config import get_settings
    from app.core.rate_limit import ai_limiter

    if get_settings().rate_limit_enabled:
        ai_limiter.check(user.id)
    if not data.messages or data.messages[-1].role != "user":
        raise ApiError("INVALID_CHAT", "El último mensaje debe ser del usuario", 400)
    history = [{"role": m.role, "content": m.content} for m in data.messages if m.role in ("user", "assistant")]
    result = ai_service.chat_with_data(db, org, user, history)
    db.commit()
    return result


@router.post("/ai/test")
def ai_test(db: DB, admin: AdminUser, org: CurrentOrg):
    result = ai_service.test_connection(db, org, admin)
    db.commit()
    return result


@router.get("/ai/usage", response_model=AIUsageSummary)
def ai_usage(db: DB, admin: AdminUser, org: CurrentOrg):
    return ai_service.usage_summary(db, org)
