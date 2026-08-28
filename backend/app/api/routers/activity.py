from datetime import datetime, timedelta

from fastapi import APIRouter
from sqlalchemy import func, select

from app.api.deps import DB, CurrentOrg, CurrentUser, Pagination
from app.core.errors import ApiError, not_found
from app.core.utils import utcnow
from app.models import Appointment, Customer, Followup, Task
from app.schemas.common import Msg, Page
from app.schemas.sales import (
    AppointmentCreate,
    AppointmentOut,
    AppointmentUpdate,
    FollowupCreate,
    FollowupOut,
    FollowupUpdate,
    TaskCreate,
    TaskOut,
    TaskUpdate,
)
from app.services import audit

router = APIRouter(tags=["activity"])


def _naive(dt: datetime | None) -> datetime | None:
    return dt.replace(tzinfo=None) if dt else None


def _sync_next_followup(db, customer: Customer) -> None:
    db.flush()  # la sesión usa autoflush=False: persistir el cambio de estado antes de recalcular
    customer.next_followup_at = db.scalar(
        select(func.min(Followup.due_at)).where(
            Followup.customer_id == customer.id, Followup.status == "pendiente"
        )
    )


def _followup_out(f: Followup, now: datetime) -> FollowupOut:
    out = FollowupOut.model_validate(f)
    out.is_overdue = f.status == "pendiente" and f.due_at < now
    return out


# ---------- Seguimientos ----------

@router.get("/followups", response_model=Page[FollowupOut])
def list_followups(
    db: DB,
    user: CurrentUser,
    org: CurrentOrg,
    pagination: Pagination,
    view: str | None = None,  # hoy | vencidos | proximos | sugeridos | completados | todos
    user_id: str | None = None,
    customer_id: str | None = None,
    type: str | None = None,
):
    now = utcnow()
    query = select(Followup).join(Customer, Customer.id == Followup.customer_id).where(
        Followup.organization_id == org.id, Customer.deleted_at.is_(None)
    )
    if user_id:
        query = query.where(Followup.user_id == user_id)
    if customer_id:
        query = query.where(Followup.customer_id == customer_id)
    if type:
        query = query.where(Followup.type == type)

    if view == "hoy":
        query = query.where(
            Followup.status == "pendiente", Followup.due_at >= now - timedelta(hours=12),
            Followup.due_at < now + timedelta(hours=24),
        ).order_by(Followup.due_at)
    elif view == "vencidos":
        query = query.where(Followup.status == "pendiente", Followup.due_at < now).order_by(Followup.due_at)
    elif view == "proximos":
        query = query.where(Followup.status == "pendiente", Followup.due_at >= now).order_by(Followup.due_at)
    elif view == "sugeridos":
        query = query.where(Followup.status == "sugerido").order_by(Followup.due_at)
    elif view == "completados":
        query = query.where(Followup.status == "completado").order_by(Followup.completed_at.desc())
    else:
        query = query.where(Followup.status.in_(("pendiente", "sugerido"))).order_by(Followup.due_at)

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    items = db.scalars(query.offset(pagination.offset).limit(pagination.page_size)).all()
    return {
        "items": [_followup_out(f, now) for f in items],
        "total": total,
        "page": pagination.page,
        "page_size": pagination.page_size,
    }


@router.post("/followups", response_model=FollowupOut, status_code=201)
def create_followup(data: FollowupCreate, db: DB, user: CurrentUser, org: CurrentOrg):
    customer = db.get(Customer, data.customer_id)
    if not customer or customer.organization_id != org.id or customer.deleted_at:
        raise not_found("cliente", "CUSTOMER_NOT_FOUND")
    followup = Followup(
        organization_id=org.id,
        customer_id=customer.id,
        opportunity_id=data.opportunity_id,
        user_id=data.user_id or customer.assigned_user_id or user.id,
        due_at=_naive(data.due_at),
        type=data.type,
        priority=data.priority,
        note=data.note,
        status="pendiente",
    )
    db.add(followup)
    db.flush()
    _sync_next_followup(db, customer)
    audit.log(db, org.id, "seguimiento_creado", "followup", followup.id, user.id, {"cliente": customer.full_name})
    db.commit()
    db.refresh(followup)
    return _followup_out(followup, utcnow())


def _get_followup(db, org, followup_id: str) -> Followup:
    followup = db.get(Followup, followup_id)
    if not followup or followup.organization_id != org.id:
        raise not_found("seguimiento", "FOLLOWUP_NOT_FOUND")
    return followup


@router.patch("/followups/{followup_id}", response_model=FollowupOut)
def update_followup(followup_id: str, data: FollowupUpdate, db: DB, user: CurrentUser, org: CurrentOrg):
    followup = _get_followup(db, org, followup_id)
    updates = data.model_dump(exclude_unset=True)
    if "due_at" in updates:
        updates["due_at"] = _naive(updates["due_at"])
    for field, value in updates.items():
        setattr(followup, field, value)
    db.flush()
    _sync_next_followup(db, followup.customer)
    db.commit()
    db.refresh(followup)
    return _followup_out(followup, utcnow())


@router.post("/followups/{followup_id}/complete", response_model=FollowupOut)
def complete_followup(followup_id: str, db: DB, user: CurrentUser, org: CurrentOrg):
    followup = _get_followup(db, org, followup_id)
    if followup.status not in ("pendiente", "sugerido"):
        raise ApiError("FOLLOWUP_NOT_PENDING", "El seguimiento ya no está pendiente", 400)
    followup.status = "completado"
    followup.completed_at = utcnow()
    _sync_next_followup(db, followup.customer)
    audit.log(db, org.id, "seguimiento_completado", "followup", followup.id, user.id)
    db.commit()
    db.refresh(followup)
    return _followup_out(followup, utcnow())


@router.post("/followups/{followup_id}/cancel", response_model=FollowupOut)
def cancel_followup(followup_id: str, db: DB, user: CurrentUser, org: CurrentOrg):
    followup = _get_followup(db, org, followup_id)
    followup.status = "cancelado"
    _sync_next_followup(db, followup.customer)
    db.commit()
    db.refresh(followup)
    return _followup_out(followup, utcnow())


@router.post("/followups/{followup_id}/accept", response_model=FollowupOut)
def accept_suggested(followup_id: str, db: DB, user: CurrentUser, org: CurrentOrg):
    """Acepta un seguimiento sugerido por POPS (§16)."""
    followup = _get_followup(db, org, followup_id)
    if followup.status != "sugerido":
        raise ApiError("FOLLOWUP_NOT_SUGGESTED", "El seguimiento no está en estado sugerido", 400)
    followup.status = "pendiente"
    if not followup.user_id:
        followup.user_id = user.id
    _sync_next_followup(db, followup.customer)
    audit.log(db, org.id, "seguimiento_sugerido_aceptado", "followup", followup.id, user.id)
    db.commit()
    db.refresh(followup)
    return _followup_out(followup, utcnow())


@router.post("/followups/{followup_id}/discard", response_model=Msg)
def discard_suggested(followup_id: str, db: DB, user: CurrentUser, org: CurrentOrg):
    followup = _get_followup(db, org, followup_id)
    if followup.status != "sugerido":
        raise ApiError("FOLLOWUP_NOT_SUGGESTED", "El seguimiento no está en estado sugerido", 400)
    followup.status = "descartado"
    db.commit()
    return Msg(message="Sugerencia descartada")


# ---------- Tareas ----------

@router.get("/tasks", response_model=Page[TaskOut])
def list_tasks(
    db: DB,
    user: CurrentUser,
    org: CurrentOrg,
    pagination: Pagination,
    view: str | None = None,  # hoy | proximas | vencidas | completadas
    user_id: str | None = None,
    customer_id: str | None = None,
):
    now = utcnow()
    query = select(Task).where(Task.organization_id == org.id)
    if user_id:
        query = query.where(Task.user_id == user_id)
    if customer_id:
        query = query.where(Task.customer_id == customer_id)

    if view == "hoy":
        query = query.where(
            Task.status == "pendiente", Task.due_at.isnot(None),
            Task.due_at >= now - timedelta(hours=12), Task.due_at < now + timedelta(hours=24),
        ).order_by(Task.due_at)
    elif view == "proximas":
        query = query.where(Task.status == "pendiente", (Task.due_at.is_(None)) | (Task.due_at >= now)).order_by(
            Task.due_at.asc().nulls_last()
        )
    elif view == "vencidas":
        query = query.where(Task.status == "pendiente", Task.due_at.isnot(None), Task.due_at < now).order_by(Task.due_at)
    elif view == "completadas":
        query = query.where(Task.status == "completada").order_by(Task.completed_at.desc())
    else:
        query = query.where(Task.status == "pendiente").order_by(Task.due_at.asc().nulls_last())

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    items = db.scalars(query.offset(pagination.offset).limit(pagination.page_size)).all()
    out = []
    for t in items:
        item = TaskOut.model_validate(t)
        item.is_overdue = t.status == "pendiente" and t.due_at is not None and t.due_at < now
        out.append(item)
    return {"items": out, "total": total, "page": pagination.page, "page_size": pagination.page_size}


@router.post("/tasks", response_model=TaskOut, status_code=201)
def create_task(data: TaskCreate, db: DB, user: CurrentUser, org: CurrentOrg):
    task = Task(
        organization_id=org.id,
        user_id=data.user_id or user.id,
        customer_id=data.customer_id,
        title=data.title,
        description=data.description,
        type=data.type,
        due_at=_naive(data.due_at),
        priority=data.priority,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return TaskOut.model_validate(task)


def _get_task(db, org, task_id: str) -> Task:
    task = db.get(Task, task_id)
    if not task or task.organization_id != org.id:
        raise not_found("tarea", "TASK_NOT_FOUND")
    return task


@router.patch("/tasks/{task_id}", response_model=TaskOut)
def update_task(task_id: str, data: TaskUpdate, db: DB, user: CurrentUser, org: CurrentOrg):
    task = _get_task(db, org, task_id)
    updates = data.model_dump(exclude_unset=True)
    if "due_at" in updates:
        updates["due_at"] = _naive(updates["due_at"])
    for field, value in updates.items():
        setattr(task, field, value)
    db.commit()
    db.refresh(task)
    return TaskOut.model_validate(task)


@router.post("/tasks/{task_id}/complete", response_model=TaskOut)
def complete_task(task_id: str, db: DB, user: CurrentUser, org: CurrentOrg):
    task = _get_task(db, org, task_id)
    task.status = "completada"
    task.completed_at = utcnow()
    db.commit()
    db.refresh(task)
    return TaskOut.model_validate(task)


@router.delete("/tasks/{task_id}", response_model=Msg)
def cancel_task(task_id: str, db: DB, user: CurrentUser, org: CurrentOrg):
    task = _get_task(db, org, task_id)
    task.status = "cancelada"
    db.commit()
    return Msg(message="Tarea cancelada")


# ---------- Citas / Calendario ----------

@router.get("/appointments", response_model=list[AppointmentOut])
def list_appointments(
    db: DB,
    user: CurrentUser,
    org: CurrentOrg,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    user_id: str | None = None,
    customer_id: str | None = None,
):
    now = utcnow()
    query = select(Appointment).where(Appointment.organization_id == org.id)
    query = query.where(Appointment.starts_at >= _naive(date_from) if date_from else Appointment.starts_at >= now - timedelta(days=45))
    if date_to:
        query = query.where(Appointment.starts_at <= _naive(date_to))
    if user_id:
        query = query.where(Appointment.user_id == user_id)
    if customer_id:
        query = query.where(Appointment.customer_id == customer_id)
    return db.scalars(query.order_by(Appointment.starts_at).limit(500)).all()


@router.post("/appointments", response_model=AppointmentOut, status_code=201)
def create_appointment(data: AppointmentCreate, db: DB, user: CurrentUser, org: CurrentOrg):
    appointment = Appointment(
        organization_id=org.id,
        customer_id=data.customer_id,
        vehicle_id=data.vehicle_id,
        user_id=data.user_id or user.id,
        title=data.title,
        type=data.type,
        starts_at=_naive(data.starts_at),
        ends_at=_naive(data.ends_at),
        location=data.location,
        notes=data.notes,
    )
    db.add(appointment)
    audit.log(db, org.id, "cita_creada", "appointment", appointment.id, user.id, {"titulo": data.title})
    db.commit()
    db.refresh(appointment)
    return appointment


@router.patch("/appointments/{appointment_id}", response_model=AppointmentOut)
def update_appointment(appointment_id: str, data: AppointmentUpdate, db: DB, user: CurrentUser, org: CurrentOrg):
    appointment = db.get(Appointment, appointment_id)
    if not appointment or appointment.organization_id != org.id:
        raise not_found("cita", "APPOINTMENT_NOT_FOUND")
    updates = data.model_dump(exclude_unset=True)
    for field in ("starts_at", "ends_at"):
        if field in updates:
            updates[field] = _naive(updates[field])
    for field, value in updates.items():
        setattr(appointment, field, value)
    db.commit()
    db.refresh(appointment)
    return appointment


@router.delete("/appointments/{appointment_id}", response_model=Msg)
def cancel_appointment(appointment_id: str, db: DB, user: CurrentUser, org: CurrentOrg):
    appointment = db.get(Appointment, appointment_id)
    if not appointment or appointment.organization_id != org.id:
        raise not_found("cita", "APPOINTMENT_NOT_FOUND")
    appointment.status = "cancelada"
    db.commit()
    return Msg(message="Cita cancelada")
