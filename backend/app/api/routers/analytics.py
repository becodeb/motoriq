import csv
import io
from datetime import datetime

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.api.deps import DB, CurrentOrg, CurrentUser, ManagerUser, is_manager
from app.models import Opportunity
from app.schemas.analytics import (
    DashboardOut,
    ForecastOut,
    FunnelOut,
    OverviewOut,
    PriceInterestOut,
    SellerStats,
    SourceStats,
    StockIntelOut,
    StockRecommendation,
)
from app.services import analytics as analytics_service
from app.services import audit, dashboard, stock_intel

router = APIRouter(tags=["analytics"])


def _naive(dt: datetime | None) -> datetime | None:
    return dt.replace(tzinfo=None) if dt else None


@router.get("/dashboard", response_model=DashboardOut)
def get_dashboard(db: DB, user: CurrentUser, org: CurrentOrg):
    return dashboard.get_dashboard(db, org, user)


@router.get("/analytics/overview", response_model=OverviewOut)
def overview(
    db: DB,
    user: CurrentUser,
    org: CurrentOrg,
    range: str = "30d",
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    seller_id: str | None = None,
):
    if not is_manager(user):
        seller_id = user.id  # un vendedor solo ve sus propias métricas
    return analytics_service.overview(db, org, range, _naive(date_from), _naive(date_to), seller_id)


@router.get("/analytics/funnel", response_model=FunnelOut)
def funnel(
    db: DB,
    user: CurrentUser,
    org: CurrentOrg,
    range: str = "ano",  # el funnel necesita historia: default año
    date_from: datetime | None = None,
    date_to: datetime | None = None,
):
    return analytics_service.funnel(db, org, range, _naive(date_from), _naive(date_to))


@router.get("/analytics/sellers", response_model=list[SellerStats])
def sellers(
    db: DB,
    manager: ManagerUser,
    org: CurrentOrg,
    range: str = "30d",
    date_from: datetime | None = None,
    date_to: datetime | None = None,
):
    return analytics_service.sellers(db, org, range, _naive(date_from), _naive(date_to))


@router.get("/analytics/sources", response_model=list[SourceStats])
def sources(
    db: DB,
    user: CurrentUser,
    org: CurrentOrg,
    range: str = "ano",
    date_from: datetime | None = None,
    date_to: datetime | None = None,
):
    return analytics_service.sources(db, org, range, _naive(date_from), _naive(date_to))


@router.get("/analytics/stock", response_model=StockIntelOut)
def stock(db: DB, user: CurrentUser, org: CurrentOrg):
    return stock_intel.stock_intelligence(db, org.id, org.currency)


@router.get("/analytics/stock/recommendations", response_model=list[StockRecommendation])
def stock_recommendations(db: DB, user: CurrentUser, org: CurrentOrg):
    return stock_intel.stock_recommendations(db, org.id)


@router.get("/analytics/price-interest", response_model=PriceInterestOut)
def price_interest(db: DB, user: CurrentUser, org: CurrentOrg):
    return stock_intel.price_vs_interest(db, org.id, org.currency)


@router.get("/analytics/forecast", response_model=ForecastOut)
def forecast(db: DB, user: CurrentUser, org: CurrentOrg):
    return analytics_service.forecast(db, org)


@router.get("/analytics/sales/export")
def export_sales(db: DB, user: CurrentUser, org: CurrentOrg):
    won = db.scalars(
        select(Opportunity)
        .where(Opportunity.organization_id == org.id, Opportunity.status == "ganada")
        .order_by(Opportunity.closed_at.desc())
    ).all()
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["fecha", "cliente", "vehiculo", "monto", "vendedor", "origen", "dias_hasta_cierre"])
    for o in won:
        writer.writerow([
            o.closed_at.date() if o.closed_at else "",
            o.customer.full_name if o.customer else "",
            o.vehicle.title if o.vehicle else "",
            o.expected_value or "",
            o.owner.full_name if o.owner else "",
            o.source or "",
            (o.closed_at - o.created_at).days if o.closed_at else "",
        ])
    audit.log(db, org.id, "exportacion", "sales", None, user.id, {"filas": len(won)})
    db.commit()
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=ventas.csv"},
    )
