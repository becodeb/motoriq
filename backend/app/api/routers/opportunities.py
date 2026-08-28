from fastapi import APIRouter
from sqlalchemy import func, select

from app.api.deps import DB, CurrentOrg, CurrentUser, Pagination
from app.core.errors import not_found
from app.models import Customer, Opportunity, OpportunityStageHistory, PipelineStage
from app.schemas.common import Page
from app.schemas.sales import (
    OpportunityCreate,
    OpportunityOut,
    OpportunityUpdate,
    StageHistoryOut,
    StageMoveRequest,
)
from app.services import audit
from app.services import opportunities as opportunities_service

router = APIRouter(prefix="/opportunities", tags=["opportunities"])


def _get_opportunity(db, org, opportunity_id: str) -> Opportunity:
    opportunity = db.get(Opportunity, opportunity_id)
    if not opportunity or opportunity.organization_id != org.id:
        raise not_found("oportunidad", "OPPORTUNITY_NOT_FOUND")
    return opportunity


@router.get("", response_model=Page[OpportunityOut])
def list_opportunities(
    db: DB,
    user: CurrentUser,
    org: CurrentOrg,
    pagination: Pagination,
    status: str | None = None,
    stage_id: str | None = None,
    owner_user_id: str | None = None,
    customer_id: str | None = None,
    q: str | None = None,
    order_by: str = "-updated_at",
):
    query = select(Opportunity).where(Opportunity.organization_id == org.id)
    if status:
        query = query.where(Opportunity.status == status)
    if customer_id:
        query = query.where(Opportunity.customer_id == customer_id)
    if stage_id:
        query = query.where(Opportunity.stage_id == stage_id)
    if owner_user_id:
        query = query.where(Opportunity.owner_user_id == owner_user_id)
    if q:
        like = f"%{q.strip()}%"
        query = query.join(Customer, Customer.id == Opportunity.customer_id).where(
            (Customer.first_name + " " + Customer.last_name).ilike(like)
        )
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    columns = {
        "updated_at": Opportunity.updated_at,
        "created_at": Opportunity.created_at,
        "expected_value": Opportunity.expected_value,
    }
    descending = order_by.startswith("-")
    column = columns.get(order_by.lstrip("-"), Opportunity.updated_at)
    query = query.order_by(column.desc().nulls_last() if descending else column.asc().nulls_last())
    items = db.scalars(query.offset(pagination.offset).limit(pagination.page_size)).all()
    return {"items": items, "total": total, "page": pagination.page, "page_size": pagination.page_size}


@router.get("/kanban", response_model=list[OpportunityOut])
def kanban(db: DB, user: CurrentUser, org: CurrentOrg):
    """Todas las oportunidades abiertas + cerradas de los últimos 30 días (columnas vendido/perdido)."""
    from datetime import timedelta

    from app.core.utils import utcnow

    cutoff = utcnow() - timedelta(days=30)
    items = db.scalars(
        select(Opportunity).where(
            Opportunity.organization_id == org.id,
            (Opportunity.status == "abierta") | (Opportunity.closed_at >= cutoff),
        ).order_by(Opportunity.updated_at.desc()).limit(400)
    ).all()
    for o in items:
        if o.status == "abierta":
            opportunities_service.refresh_health(db, o)
    db.commit()
    return items


@router.post("", response_model=OpportunityOut, status_code=201)
def create_opportunity(data: OpportunityCreate, db: DB, user: CurrentUser, org: CurrentOrg):
    customer = db.get(Customer, data.customer_id)
    if not customer or customer.organization_id != org.id or customer.deleted_at:
        raise not_found("cliente", "CUSTOMER_NOT_FOUND")

    stage = None
    if data.stage_id:
        stage = db.get(PipelineStage, data.stage_id)
        if not stage or stage.organization_id != org.id:
            raise not_found("etapa", "STAGE_NOT_FOUND")
    else:
        stage = db.scalar(
            select(PipelineStage)
            .where(PipelineStage.organization_id == org.id, PipelineStage.is_active.is_(True))
            .order_by(PipelineStage.position)
        )

    vehicle = None
    if data.vehicle_id:
        from app.models import Vehicle

        vehicle = db.get(Vehicle, data.vehicle_id)
        if not vehicle or vehicle.organization_id != org.id:
            raise not_found("vehículo", "VEHICLE_NOT_FOUND")

    opportunity = Opportunity(
        organization_id=org.id,
        customer_id=customer.id,
        vehicle_id=data.vehicle_id,
        owner_user_id=data.owner_user_id or customer.assigned_user_id or user.id,
        stage_id=stage.id,
        probability=stage.probability,
        expected_value=data.expected_value or (vehicle.price if vehicle else customer.budget),
        source=data.source or customer.source,
        notes=data.notes,
        expected_close_date=data.expected_close_date.replace(tzinfo=None) if data.expected_close_date else None,
    )
    db.add(opportunity)
    db.flush()
    db.add(
        OpportunityStageHistory(
            organization_id=org.id, opportunity_id=opportunity.id,
            from_stage_id=None, to_stage_id=stage.id, user_id=user.id,
        )
    )
    audit.log(db, org.id, "oportunidad_creada", "opportunity", opportunity.id, user.id, {"cliente": customer.full_name})
    db.commit()
    db.refresh(opportunity)
    return opportunity


@router.get("/{opportunity_id}", response_model=OpportunityOut)
def get_opportunity(opportunity_id: str, db: DB, user: CurrentUser, org: CurrentOrg):
    return _get_opportunity(db, org, opportunity_id)


@router.patch("/{opportunity_id}", response_model=OpportunityOut)
def update_opportunity(opportunity_id: str, data: OpportunityUpdate, db: DB, user: CurrentUser, org: CurrentOrg):
    opportunity = _get_opportunity(db, org, opportunity_id)
    updates = data.model_dump(exclude_unset=True)
    if updates.get("expected_close_date"):
        updates["expected_close_date"] = updates["expected_close_date"].replace(tzinfo=None)
    for field, value in updates.items():
        setattr(opportunity, field, value)
    audit.log(db, org.id, "oportunidad_editada", "opportunity", opportunity.id, user.id, {"cambios": list(updates.keys())})
    db.commit()
    db.refresh(opportunity)
    return opportunity


@router.post("/{opportunity_id}/move", response_model=OpportunityOut)
def move_stage(opportunity_id: str, data: StageMoveRequest, db: DB, user: CurrentUser, org: CurrentOrg):
    opportunity = _get_opportunity(db, org, opportunity_id)
    opportunities_service.move_stage(
        db, opportunity, data.stage_id, user, lost_reason=data.lost_reason, sold_price=data.sold_price
    )
    db.commit()
    db.refresh(opportunity)
    return opportunity


@router.get("/{opportunity_id}/history", response_model=list[StageHistoryOut])
def stage_history(opportunity_id: str, db: DB, user: CurrentUser, org: CurrentOrg):
    opportunity = _get_opportunity(db, org, opportunity_id)
    return db.scalars(
        select(OpportunityStageHistory)
        .where(OpportunityStageHistory.opportunity_id == opportunity.id)
        .order_by(OpportunityStageHistory.created_at.desc())
    ).all()
