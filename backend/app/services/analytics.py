"""Analytics comercial (§35–§38, §84).

Los datos se agregan en Python después de filtrar por período: a escala de
agencia (miles de filas) es simple, portable entre SQLite y PostgreSQL y
suficientemente rápido. Si el volumen crece, estas funciones son el punto
único a optimizar con SQL específico del motor.
"""

from collections import defaultdict
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.core.utils import utcnow
from app.models import (
    Customer,
    Followup,
    Message,
    Opportunity,
    OpportunityStageHistory,
    Organization,
    PipelineStage,
    User,
)

RANGE_KEYS = ("hoy", "7d", "30d", "mes", "trimestre", "ano")


def resolve_period(
    org: Organization,
    range_key: str = "30d",
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> tuple[datetime, datetime, datetime, datetime]:
    """(inicio, fin, inicio_previo, fin_previo) en naive-UTC."""
    now = utcnow()
    try:
        tz = ZoneInfo(org.timezone)
    except Exception:
        tz = ZoneInfo("UTC")
    local_now = now.replace(tzinfo=UTC).astimezone(tz)
    today_start_local = local_now.replace(hour=0, minute=0, second=0, microsecond=0)

    def to_utc(d: datetime) -> datetime:
        return d.astimezone(UTC).replace(tzinfo=None)

    if range_key == "custom":
        if not date_from or not date_to:
            raise ApiError("INVALID_RANGE", "El rango custom requiere from y to", 400)
        start, end = date_from, date_to
    elif range_key == "hoy":
        start, end = to_utc(today_start_local), now
    elif range_key == "7d":
        start, end = now - timedelta(days=7), now
    elif range_key == "mes":
        start, end = to_utc(today_start_local.replace(day=1)), now
    elif range_key == "trimestre":
        month = ((local_now.month - 1) // 3) * 3 + 1
        start, end = to_utc(today_start_local.replace(month=month, day=1)), now
    elif range_key == "ano":
        start, end = to_utc(today_start_local.replace(month=1, day=1)), now
    else:  # 30d default
        start, end = now - timedelta(days=30), now

    length = end - start
    return start, end, start - length, start


def _metric(value: float, previous: float | None) -> dict:
    delta = None
    if previous is not None and previous > 0:
        delta = round((value - previous) / previous * 100, 1)
    return {"value": round(value, 2), "previous": round(previous, 2) if previous is not None else None, "delta_percent": delta}


def _base_metrics(db: Session, org_id: str, start: datetime, end: datetime, seller_id: str | None) -> dict:
    customer_filter = [Customer.organization_id == org_id, Customer.deleted_at.is_(None)]
    if seller_id:
        customer_filter.append(Customer.assigned_user_id == seller_id)

    leads = db.scalar(
        select(func.count(Customer.id)).where(*customer_filter, Customer.created_at.between(start, end))
    ) or 0

    contacted_query = (
        select(func.count(func.distinct(Message.customer_id)))
        .join(Customer, Customer.id == Message.customer_id)
        .where(
            Message.organization_id == org_id,
            Message.direction == "saliente",
            Message.created_at.between(start, end),
        )
    )
    if seller_id:
        contacted_query = contacted_query.where(Customer.assigned_user_id == seller_id)
    contacted = db.scalar(contacted_query) or 0

    opp_filter = [Opportunity.organization_id == org_id]
    if seller_id:
        opp_filter.append(Opportunity.owner_user_id == seller_id)
    opportunities = db.scalar(
        select(func.count(Opportunity.id)).where(*opp_filter, Opportunity.created_at.between(start, end))
    ) or 0

    reservations = db.scalar(
        select(func.count(OpportunityStageHistory.id))
        .join(Opportunity, Opportunity.id == OpportunityStageHistory.opportunity_id)
        .join(PipelineStage, PipelineStage.id == OpportunityStageHistory.to_stage_id)
        .where(
            Opportunity.organization_id == org_id,
            PipelineStage.key == "reserva",
            OpportunityStageHistory.created_at.between(start, end),
            *( [Opportunity.owner_user_id == seller_id] if seller_id else [] ),
        )
    ) or 0

    won = db.scalars(
        select(Opportunity).where(
            *opp_filter, Opportunity.status == "ganada", Opportunity.closed_at.between(start, end)
        )
    ).all()
    sales = len(won)
    revenue = sum(o.expected_value or (o.vehicle.sold_price if o.vehicle else 0) or 0 for o in won)
    days_to_sale = [ (o.closed_at - o.created_at).days for o in won if o.closed_at ]

    first_response_rows = db.scalars(
        select(Customer.first_response_seconds).where(
            *customer_filter,
            Customer.created_at.between(start, end),
            Customer.first_response_seconds.isnot(None),
        )
    ).all()

    followup_filter = [Followup.organization_id == org_id]
    if seller_id:
        followup_filter.append(Followup.user_id == seller_id)
    followups_completed = db.scalar(
        select(func.count(Followup.id)).where(
            *followup_filter, Followup.status == "completado", Followup.completed_at.between(start, end)
        )
    ) or 0

    return {
        "leads": leads,
        "contacted": contacted,
        "opportunities": opportunities,
        "reservations": reservations,
        "sales": sales,
        "revenue": revenue,
        "conversion_rate": (sales / leads * 100) if leads else 0,
        "avg_ticket": (revenue / sales) if sales else 0,
        "avg_first_response_minutes": (sum(first_response_rows) / len(first_response_rows) / 60) if first_response_rows else 0,
        "avg_days_to_sale": (sum(days_to_sale) / len(days_to_sale)) if days_to_sale else 0,
        "followups_completed": followups_completed,
    }


def overview(
    db: Session,
    org: Organization,
    range_key: str,
    date_from: datetime | None,
    date_to: datetime | None,
    seller_id: str | None = None,
) -> dict:
    start, end, prev_start, prev_end = resolve_period(org, range_key, date_from, date_to)
    current = _base_metrics(db, org.id, start, end, seller_id)
    previous = _base_metrics(db, org.id, prev_start, prev_end, seller_id)

    followups_overdue = db.scalar(
        select(func.count(Followup.id)).where(
            Followup.organization_id == org.id,
            Followup.status == "pendiente",
            Followup.due_at < utcnow(),
            *( [Followup.user_id == seller_id] if seller_id else [] ),
        )
    ) or 0

    # Series: leads por día del período y ventas por mes (últimos 6 meses).
    lead_dates = db.scalars(
        select(Customer.created_at).where(
            Customer.organization_id == org.id,
            Customer.deleted_at.is_(None),
            Customer.created_at.between(start, end),
            *( [Customer.assigned_user_id == seller_id] if seller_id else [] ),
        )
    ).all()
    by_day: dict[str, int] = defaultdict(int)
    for d in lead_dates:
        by_day[d.strftime("%Y-%m-%d")] += 1
    days_span = max(1, (end - start).days)
    leads_by_day = []
    for i in range(days_span + 1):
        day = (start + timedelta(days=i)).strftime("%Y-%m-%d")
        if start + timedelta(days=i) > end + timedelta(days=1):
            break
        leads_by_day.append({"date": day, "leads": by_day.get(day, 0)})
    if len(leads_by_day) > 60:  # comprimir a semanas para rangos largos
        weekly: dict[str, int] = defaultdict(int)
        for point in leads_by_day:
            week = datetime.strptime(point["date"], "%Y-%m-%d").strftime("%Y-W%W")
            weekly[week] += point["leads"]
        leads_by_day = [{"date": k, "leads": v} for k, v in sorted(weekly.items())]

    six_months_ago = utcnow() - timedelta(days=185)
    won_rows = db.scalars(
        select(Opportunity).where(
            Opportunity.organization_id == org.id,
            Opportunity.status == "ganada",
            Opportunity.closed_at >= six_months_ago,
            *( [Opportunity.owner_user_id == seller_id] if seller_id else [] ),
        )
    ).all()
    by_month: dict[str, dict] = defaultdict(lambda: {"sales": 0, "revenue": 0.0})
    for o in won_rows:
        key = o.closed_at.strftime("%Y-%m")
        by_month[key]["sales"] += 1
        by_month[key]["revenue"] += o.expected_value or 0
    sales_by_month = [
        {"month": k, "sales": v["sales"], "revenue": round(v["revenue"], 0)} for k, v in sorted(by_month.items())
    ]

    return {
        "leads": _metric(current["leads"], previous["leads"]),
        "contacted": _metric(current["contacted"], previous["contacted"]),
        "opportunities": _metric(current["opportunities"], previous["opportunities"]),
        "reservations": _metric(current["reservations"], previous["reservations"]),
        "sales": _metric(current["sales"], previous["sales"]),
        "revenue": _metric(current["revenue"], previous["revenue"]),
        "conversion_rate": _metric(current["conversion_rate"], previous["conversion_rate"]),
        "avg_ticket": _metric(current["avg_ticket"], previous["avg_ticket"]),
        "avg_first_response_minutes": _metric(
            current["avg_first_response_minutes"], previous["avg_first_response_minutes"]
        ),
        "avg_days_to_sale": _metric(current["avg_days_to_sale"], previous["avg_days_to_sale"]),
        "followups_completed": _metric(current["followups_completed"], previous["followups_completed"]),
        "followups_overdue": followups_overdue,
        "leads_by_day": leads_by_day,
        "sales_by_month": sales_by_month,
    }


def funnel(db: Session, org: Organization, range_key: str, date_from, date_to) -> dict:
    start, end, _, _ = resolve_period(org, range_key, date_from, date_to)
    stages = db.scalars(
        select(PipelineStage)
        .where(PipelineStage.organization_id == org.id, PipelineStage.is_active.is_(True), PipelineStage.is_lost.is_(False))
        .order_by(PipelineStage.position)
    ).all()
    opportunities = db.scalars(
        select(Opportunity).where(
            Opportunity.organization_id == org.id, Opportunity.created_at.between(start, end)
        )
    ).all()
    if not opportunities:
        return {"stages": [{"key": s.key, "name": s.name, "count": 0, "rate_from_previous": None} for s in stages], "total_leads": 0, "won": 0, "overall_rate": 0}

    history = db.execute(
        select(OpportunityStageHistory.opportunity_id, PipelineStage.position)
        .join(PipelineStage, PipelineStage.id == OpportunityStageHistory.to_stage_id)
        .where(OpportunityStageHistory.opportunity_id.in_([o.id for o in opportunities]))
    ).all()
    max_position: dict[str, int] = defaultdict(int)
    stage_by_id = {s.id: s for s in stages}
    for o in opportunities:
        current = stage_by_id.get(o.stage_id)
        if current:
            max_position[o.id] = current.position
    for opp_id, position in history:
        max_position[opp_id] = max(max_position[opp_id], position)

    result = []
    previous_count = None
    for stage in stages:
        count = sum(1 for o in opportunities if max_position.get(o.id, 0) >= stage.position)
        rate = round(count / previous_count * 100, 1) if previous_count else None
        result.append({"key": stage.key, "name": stage.name, "count": count, "rate_from_previous": rate})
        previous_count = count if count else previous_count

    total = len(opportunities)
    won = sum(1 for o in opportunities if o.status == "ganada")
    return {
        "stages": result,
        "total_leads": total,
        "won": won,
        "overall_rate": round(won / total * 100, 1) if total else 0,
    }


def sellers(db: Session, org: Organization, range_key: str, date_from, date_to) -> list[dict]:
    start, end, _, _ = resolve_period(org, range_key, date_from, date_to)
    now = utcnow()
    team = db.scalars(
        select(User).where(User.organization_id == org.id, User.is_active.is_(True), User.role == "vendedor")
    ).all()
    rows = []
    for seller in team:
        m = _base_metrics(db, org.id, start, end, seller.id)
        overdue = db.scalar(
            select(func.count(Followup.id)).where(
                Followup.organization_id == org.id,
                Followup.user_id == seller.id,
                Followup.status == "pendiente",
                Followup.due_at < now,
            )
        ) or 0
        open_opps = db.scalar(
            select(func.count(Opportunity.id)).where(
                Opportunity.organization_id == org.id,
                Opportunity.owner_user_id == seller.id,
                Opportunity.status == "abierta",
            )
        ) or 0
        rows.append(
            {
                "user_id": seller.id,
                "full_name": seller.full_name,
                "avatar_color": seller.avatar_color,
                "leads": m["leads"],
                "contacted": m["contacted"],
                "opportunities": m["opportunities"],
                "sales": m["sales"],
                "revenue": round(m["revenue"], 0),
                "conversion_rate": round(m["conversion_rate"], 1),
                "avg_first_response_minutes": round(m["avg_first_response_minutes"], 1) if m["avg_first_response_minutes"] else None,
                "followups_completed": m["followups_completed"],
                "followups_overdue": overdue,
                "open_opportunities": open_opps,
            }
        )
    rows.sort(key=lambda r: (r["revenue"], r["sales"]), reverse=True)
    return rows


def sources(db: Session, org: Organization, range_key: str, date_from, date_to) -> list[dict]:
    start, end, _, _ = resolve_period(org, range_key, date_from, date_to)
    customers = db.scalars(
        select(Customer).where(
            Customer.organization_id == org.id,
            Customer.deleted_at.is_(None),
            Customer.created_at.between(start, end),
        )
    ).all()
    won_customer_ids = set(
        db.scalars(
            select(Opportunity.customer_id).where(
                Opportunity.organization_id == org.id,
                Opportunity.status == "ganada",
            )
        ).all()
    )
    by_source: dict[str, dict] = defaultdict(lambda: {"leads": 0, "sales": 0})
    for c in customers:
        by_source[c.source]["leads"] += 1
        if c.id in won_customer_ids:
            by_source[c.source]["sales"] += 1
    return sorted(
        (
            {
                "source": source,
                "leads": data["leads"],
                "sales": data["sales"],
                "conversion_rate": round(data["sales"] / data["leads"] * 100, 1) if data["leads"] else 0,
            }
            for source, data in by_source.items()
        ),
        key=lambda r: r["leads"],
        reverse=True,
    )


def forecast(db: Session, org: Organization) -> dict:
    """Forecast ponderado del pipeline abierto (§84). Estimación, no garantía."""
    now = utcnow()
    open_opps = db.scalars(
        select(Opportunity).where(Opportunity.organization_id == org.id, Opportunity.status == "abierta")
    ).all()
    pipeline_total = sum(o.expected_value or 0 for o in open_opps)
    weighted = sum((o.expected_value or 0) * (o.probability or 0) / 100 for o in open_opps)

    by_stage: dict[str, dict] = {}
    for o in open_opps:
        stage = o.stage
        entry = by_stage.setdefault(
            stage.key, {"key": stage.key, "name": stage.name, "count": 0, "total": 0.0, "weighted": 0.0, "position": stage.position}
        )
        entry["count"] += 1
        entry["total"] += o.expected_value or 0
        entry["weighted"] += (o.expected_value or 0) * (o.probability or 0) / 100

    expected_closes = sum(
        1 for o in open_opps if o.expected_close_date and o.expected_close_date <= now + timedelta(days=30)
    ) + sum(1 for o in open_opps if not o.expected_close_date and o.stage and o.stage.key == "reserva")

    stage_rows = sorted(by_stage.values(), key=lambda v: v["position"])
    return {
        "pipeline_total": round(pipeline_total, 0),
        "weighted_forecast": round(weighted, 0),
        "by_stage": [
            {
                "key": v["key"],
                "name": v["name"],
                "count": v["count"],
                "total": round(v["total"], 0),
                "weighted": round(v["weighted"], 0),
            }
            for v in stage_rows
        ],
        "expected_closes_30d": expected_closes,
        "disclaimer": "Proyección ponderada por probabilidad de etapa sobre el pipeline abierto. Es una estimación, no una garantía.",
    }
