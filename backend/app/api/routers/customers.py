import csv
import io
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select

from app.ai import service as ai_service
from app.api.deps import (
    DB,
    CurrentOrg,
    CurrentUser,
    ManagerUser,
    Pagination,
    is_manager,
)
from app.core.errors import ApiError, not_found
from app.core.utils import utcnow
from app.models import Customer, CustomerNote, LeadScoreHistory, Tag
from app.schemas.common import Msg, Page
from app.schemas.customer import (
    CustomerCreate,
    CustomerOut,
    CustomerUpdate,
    DuplicateCheckResponse,
    MergeRequest,
    NoteCreate,
    NoteOut,
    TagCreate,
    TagOut,
)
from app.schemas.intelligence import NextBestAction, ScoreHistoryOut
from app.schemas.system import TimelineItem
from app.services import audit, dedup, matching, nba, scoring, timeline
from app.services import customers as customers_service

router = APIRouter(prefix="/customers", tags=["customers"])

SORTABLE = {
    "created_at": Customer.created_at,
    "lead_score": Customer.lead_score,
    "last_contact_at": Customer.last_contact_at,
    "next_followup_at": Customer.next_followup_at,
    "first_name": Customer.first_name,
}

INTEREST_FIELDS = {
    "interested_vehicle_id", "budget", "interest_brand", "interest_model", "interest_body_type",
    "interest_year_min", "interest_year_max", "interest_transmission", "interest_fuel",
}


def _get_customer(db, org, customer_id: str) -> Customer:
    customer = db.get(Customer, customer_id)
    if not customer or customer.organization_id != org.id or customer.deleted_at:
        raise not_found("cliente", "CUSTOMER_NOT_FOUND")
    return customer


@router.get("", response_model=Page[CustomerOut])
def list_customers(
    db: DB,
    user: CurrentUser,
    org: CurrentOrg,
    pagination: Pagination,
    q: str | None = None,
    status: str | None = None,
    source: str | None = None,
    assigned_user_id: str | None = None,
    score_label: str | None = None,
    min_score: Annotated[int | None, Query(ge=0, le=100)] = None,
    awaiting_reply: bool | None = None,
    followup: str | None = None,  # vencido | pendiente | sin
    tag_id: str | None = None,
    interested_vehicle_id: str | None = None,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
    order_by: str = "-created_at",
):
    now = utcnow()
    query = select(Customer).where(Customer.organization_id == org.id, Customer.deleted_at.is_(None))

    if q:
        like = f"%{q.strip()}%"
        query = query.where(
            or_(
                (Customer.first_name + " " + Customer.last_name).ilike(like),
                Customer.phone.ilike(like),
                Customer.whatsapp.ilike(like),
                Customer.email.ilike(like),
            )
        )
    if status:
        query = query.where(Customer.status == status)
    if source:
        query = query.where(Customer.source == source)
    if assigned_user_id:
        query = query.where(Customer.assigned_user_id == assigned_user_id)
    if score_label:
        query = query.where(Customer.score_label == score_label)
    if min_score is not None:
        query = query.where(Customer.lead_score >= min_score)
    if awaiting_reply:
        query = query.where(
            Customer.last_inbound_at.isnot(None),
            or_(Customer.last_outbound_at.is_(None), Customer.last_inbound_at > Customer.last_outbound_at),
        )
    if interested_vehicle_id:
        query = query.where(Customer.interested_vehicle_id == interested_vehicle_id)
    if created_from:
        query = query.where(Customer.created_at >= created_from.replace(tzinfo=None))
    if created_to:
        query = query.where(Customer.created_at <= created_to.replace(tzinfo=None))
    if tag_id:
        query = query.where(Customer.tags.any(Tag.id == tag_id))
    if followup == "vencido":
        query = query.where(Customer.next_followup_at.isnot(None), Customer.next_followup_at < now)
    elif followup == "pendiente":
        query = query.where(Customer.next_followup_at.isnot(None), Customer.next_followup_at >= now)
    elif followup == "sin":
        query = query.where(or_(Customer.next_followup_at.is_(None), Customer.next_followup_at < now))

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0

    descending = order_by.startswith("-")
    column = SORTABLE.get(order_by.lstrip("-"), Customer.created_at)
    query = query.order_by(column.desc().nulls_last() if descending else column.asc().nulls_last())

    items = db.scalars(query.offset(pagination.offset).limit(pagination.page_size)).all()
    return {"items": items, "total": total, "page": pagination.page, "page_size": pagination.page_size}


@router.post("", response_model=CustomerOut, status_code=201)
def create_customer(data: CustomerCreate, db: DB, user: CurrentUser, org: CurrentOrg):
    customer = customers_service.create_customer(db, org, user, data)
    db.commit()
    db.refresh(customer)
    return customer


@router.post("/check-duplicates", response_model=DuplicateCheckResponse)
def check_duplicates(
    db: DB,
    user: CurrentUser,
    org: CurrentOrg,
    phone: str | None = None,
    email: str | None = None,
    first_name: str | None = None,
    last_name: str | None = None,
    exclude_id: str | None = None,
):
    return {"duplicates": dedup.find_duplicates(db, org.id, phone, email, first_name, last_name, exclude_id)}


@router.get("/export")
def export_customers(db: DB, user: CurrentUser, org: CurrentOrg):
    customers = db.scalars(
        select(Customer)
        .where(Customer.organization_id == org.id, Customer.deleted_at.is_(None))
        .order_by(Customer.created_at.desc())
    ).all()
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        ["nombre", "apellido", "telefono", "whatsapp", "email", "origen", "estado", "score",
         "clasificacion", "vendedor", "vehiculo_interes", "presupuesto", "ultimo_contacto",
         "proximo_seguimiento", "creado"]
    )
    for c in customers:
        writer.writerow([
            c.first_name, c.last_name, c.phone or "", c.whatsapp or "", c.email or "", c.source,
            c.status, c.lead_score, c.score_label,
            c.assigned_user.full_name if c.assigned_user else "",
            c.interested_vehicle.title if c.interested_vehicle else "",
            c.budget or "", c.last_contact_at or "", c.next_followup_at or "", c.created_at,
        ])
    audit.log(db, org.id, "exportacion", "customer", None, user.id, {"filas": len(customers)})
    db.commit()
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=clientes.csv"},
    )


# ---------- Tags (paths fijos antes de /{customer_id}) ----------

@router.get("/tags", response_model=list[TagOut])
def list_tags(db: DB, user: CurrentUser, org: CurrentOrg):
    return db.scalars(select(Tag).where(Tag.organization_id == org.id).order_by(Tag.name)).all()


@router.post("/tags", response_model=TagOut, status_code=201)
def create_tag(data: TagCreate, db: DB, user: CurrentUser, org: CurrentOrg):
    existing = db.scalar(
        select(Tag).where(Tag.organization_id == org.id, func.lower(Tag.name) == data.name.lower())
    )
    if existing:
        return existing
    tag = Tag(organization_id=org.id, name=data.name, color=data.color)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


# ---------- Detalle ----------

@router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(customer_id: str, db: DB, user: CurrentUser, org: CurrentOrg):
    return _get_customer(db, org, customer_id)


@router.patch("/{customer_id}", response_model=CustomerOut)
def update_customer(customer_id: str, data: CustomerUpdate, db: DB, user: CurrentUser, org: CurrentOrg):
    customer = _get_customer(db, org, customer_id)
    updates = data.model_dump(exclude_unset=True)
    tag_ids = updates.pop("tag_ids", None)

    if "assigned_user_id" in updates and updates["assigned_user_id"] != customer.assigned_user_id:
        if not is_manager(user) and customer.assigned_user_id not in (None, user.id):
            raise ApiError("FORBIDDEN", "Solo un gerente puede reasignar clientes de otros vendedores", 403)

    for field, value in updates.items():
        setattr(customer, field, value)
    if tag_ids is not None:
        customers_service.set_tags(db, customer, tag_ids)

    db.flush()
    db.refresh(customer)
    if INTEREST_FIELDS & set(updates.keys()):
        scoring.apply_score(db, customer)
        matching.run_matching_for_customer(db, customer)
    audit.log(db, org.id, "cliente_editado", "customer", customer.id, user.id, {"cambios": list(updates.keys())})
    db.commit()
    db.refresh(customer)
    return customer


@router.delete("/{customer_id}", response_model=Msg)
def delete_customer(customer_id: str, db: DB, manager: ManagerUser, org: CurrentOrg):
    customer = _get_customer(db, org, customer_id)
    customer.deleted_at = utcnow()
    audit.log(db, org.id, "cliente_eliminado", "customer", customer.id, manager.id, {"nombre": customer.full_name})
    db.commit()
    return Msg(message=f"{customer.full_name} eliminado")


@router.post("/{customer_id}/merge", response_model=CustomerOut)
def merge_customer(customer_id: str, data: MergeRequest, db: DB, manager: ManagerUser, org: CurrentOrg):
    target = _get_customer(db, org, customer_id)
    source = _get_customer(db, org, data.source_customer_id)
    merged = customers_service.merge_customers(db, org, manager, target, source)
    db.commit()
    db.refresh(merged)
    return merged


@router.get("/{customer_id}/timeline", response_model=list[TimelineItem])
def customer_timeline(customer_id: str, db: DB, user: CurrentUser, org: CurrentOrg):
    customer = _get_customer(db, org, customer_id)
    return timeline.customer_timeline(db, customer)


@router.get("/{customer_id}/score-history", response_model=list[ScoreHistoryOut])
def score_history(customer_id: str, db: DB, user: CurrentUser, org: CurrentOrg):
    customer = _get_customer(db, org, customer_id)
    return db.scalars(
        select(LeadScoreHistory)
        .where(LeadScoreHistory.customer_id == customer.id)
        .order_by(LeadScoreHistory.created_at.desc())
        .limit(30)
    ).all()


@router.get("/{customer_id}/next-best-action", response_model=NextBestAction)
def next_best_action(customer_id: str, db: DB, user: CurrentUser, org: CurrentOrg):
    customer = _get_customer(db, org, customer_id)
    return nba.next_best_action(db, customer)


@router.get("/{customer_id}/recommended-vehicles")
def recommended_vehicles(customer_id: str, db: DB, user: CurrentUser, org: CurrentOrg):
    from app.schemas.common import VehicleBrief

    customer = _get_customer(db, org, customer_id)
    recommendations = matching.recommended_vehicles(db, customer)
    return [
        {
            "vehicle": VehicleBrief.model_validate(r["vehicle"]).model_dump(),
            "score": r["score"],
            "reasons": r["reasons"],
        }
        for r in recommendations
    ]


@router.post("/{customer_id}/ai-summary", response_model=CustomerOut)
def refresh_ai_summary(customer_id: str, db: DB, user: CurrentUser, org: CurrentOrg):
    customer = _get_customer(db, org, customer_id)
    ai_service.customer_summary(db, org, user, customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.post("/{customer_id}/recalculate-score", response_model=CustomerOut)
def recalculate_score(customer_id: str, db: DB, user: CurrentUser, org: CurrentOrg):
    customer = _get_customer(db, org, customer_id)
    scoring.apply_score(db, customer)
    db.commit()
    db.refresh(customer)
    return customer


# ---------- Notas ----------

@router.get("/{customer_id}/notes", response_model=list[NoteOut])
def list_notes(customer_id: str, db: DB, user: CurrentUser, org: CurrentOrg):
    customer = _get_customer(db, org, customer_id)
    return db.scalars(
        select(CustomerNote)
        .where(CustomerNote.customer_id == customer.id)
        .order_by(CustomerNote.pinned.desc(), CustomerNote.created_at.desc())
    ).all()


@router.post("/{customer_id}/notes", response_model=NoteOut, status_code=201)
def create_note(customer_id: str, data: NoteCreate, db: DB, user: CurrentUser, org: CurrentOrg):
    customer = _get_customer(db, org, customer_id)
    note = CustomerNote(
        organization_id=org.id,
        customer_id=customer.id,
        user_id=user.id,
        body=data.body,
        pinned=data.pinned,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{customer_id}/notes/{note_id}", response_model=Msg)
def delete_note(customer_id: str, note_id: str, db: DB, user: CurrentUser, org: CurrentOrg):
    customer = _get_customer(db, org, customer_id)
    note = db.get(CustomerNote, note_id)
    if not note or note.customer_id != customer.id:
        raise not_found("nota", "NOTE_NOT_FOUND")
    if note.user_id != user.id and not is_manager(user):
        raise ApiError("FORBIDDEN", "Solo podés borrar tus propias notas", 403)
    db.delete(note)
    db.commit()
    return Msg(message="Nota eliminada")
