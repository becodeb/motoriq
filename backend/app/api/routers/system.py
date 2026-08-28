from fastapi import APIRouter, UploadFile
from sqlalchemy import func, select, update

from app.api.deps import DB, AdminUser, CurrentOrg, CurrentUser, ManagerUser, Pagination
from app.core.constants import AUTOMATION_ACTIONS, AUTOMATION_TRIGGERS
from app.core.errors import ApiError, not_found
from app.core.utils import utcnow
from app.models import AuditLog, Automation, AutomationRun, Notification, Segment, User
from app.schemas.common import Msg, Page
from app.schemas.system import (
    AuditLogOut,
    AutomationCreate,
    AutomationOut,
    AutomationRunOut,
    AutomationUpdate,
    GlobalSearchOut,
    ImportCommitRequest,
    ImportPreviewOut,
    ImportResultOut,
    NotificationOut,
    SegmentCreate,
    SegmentOut,
)
from app.services import importer
from app.services import search as search_service

router = APIRouter(tags=["system"])


# ---------- Notificaciones ----------

@router.get("/notifications", response_model=list[NotificationOut])
def list_notifications(db: DB, user: CurrentUser, org: CurrentOrg, unread_only: bool = False, limit: int = 30):
    query = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        query = query.where(Notification.read_at.is_(None))
    return db.scalars(query.order_by(Notification.created_at.desc()).limit(min(limit, 100))).all()


@router.get("/notifications/unread-count")
def unread_count(db: DB, user: CurrentUser):
    count = db.scalar(
        select(func.count(Notification.id)).where(Notification.user_id == user.id, Notification.read_at.is_(None))
    ) or 0
    return {"count": count}


@router.post("/notifications/{notification_id}/read", response_model=NotificationOut)
def mark_read(notification_id: str, db: DB, user: CurrentUser):
    notification = db.get(Notification, notification_id)
    if not notification or notification.user_id != user.id:
        raise not_found("notificación", "NOTIFICATION_NOT_FOUND")
    if not notification.read_at:
        notification.read_at = utcnow()
        db.commit()
        db.refresh(notification)
    return notification


@router.post("/notifications/read-all", response_model=Msg)
def mark_all_read(db: DB, user: CurrentUser):
    db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
        .values(read_at=utcnow())
    )
    db.commit()
    return Msg(message="Notificaciones marcadas como leídas")


# ---------- Automatizaciones ----------

@router.get("/automations", response_model=list[AutomationOut])
def list_automations(db: DB, manager: ManagerUser, org: CurrentOrg):
    return db.scalars(
        select(Automation).where(Automation.organization_id == org.id).order_by(Automation.created_at)
    ).all()


def _validate_automation(trigger: str | None, actions: list | None) -> None:
    if trigger and trigger not in AUTOMATION_TRIGGERS:
        raise ApiError("INVALID_TRIGGER", f"Trigger inválido: {trigger}", 400)
    for action in actions or []:
        if not isinstance(action, dict) or action.get("type") not in AUTOMATION_ACTIONS:
            raise ApiError("INVALID_ACTION", f"Acción inválida: {action}", 400)


@router.post("/automations", response_model=AutomationOut, status_code=201)
def create_automation(data: AutomationCreate, db: DB, manager: ManagerUser, org: CurrentOrg):
    _validate_automation(data.trigger, data.actions)
    automation = Automation(organization_id=org.id, **data.model_dump())
    db.add(automation)
    db.commit()
    db.refresh(automation)
    return automation


@router.patch("/automations/{automation_id}", response_model=AutomationOut)
def update_automation(automation_id: str, data: AutomationUpdate, db: DB, manager: ManagerUser, org: CurrentOrg):
    automation = db.get(Automation, automation_id)
    if not automation or automation.organization_id != org.id:
        raise not_found("automatización", "AUTOMATION_NOT_FOUND")
    updates = data.model_dump(exclude_unset=True)
    _validate_automation(updates.get("trigger"), updates.get("actions"))
    for field, value in updates.items():
        setattr(automation, field, value)
    db.commit()
    db.refresh(automation)
    return automation


@router.delete("/automations/{automation_id}", response_model=Msg)
def delete_automation(automation_id: str, db: DB, manager: ManagerUser, org: CurrentOrg):
    automation = db.get(Automation, automation_id)
    if not automation or automation.organization_id != org.id:
        raise not_found("automatización", "AUTOMATION_NOT_FOUND")
    db.delete(automation)
    db.commit()
    return Msg(message="Automatización eliminada")


@router.get("/automations/{automation_id}/runs", response_model=list[AutomationRunOut])
def automation_runs(automation_id: str, db: DB, manager: ManagerUser, org: CurrentOrg, limit: int = 30):
    automation = db.get(Automation, automation_id)
    if not automation or automation.organization_id != org.id:
        raise not_found("automatización", "AUTOMATION_NOT_FOUND")
    return db.scalars(
        select(AutomationRun)
        .where(AutomationRun.automation_id == automation.id)
        .order_by(AutomationRun.created_at.desc())
        .limit(min(limit, 100))
    ).all()


# ---------- Segmentos (filtros guardados) ----------

@router.get("/segments", response_model=list[SegmentOut])
def list_segments(db: DB, user: CurrentUser, org: CurrentOrg):
    return db.scalars(
        select(Segment)
        .where(Segment.organization_id == org.id, (Segment.user_id == user.id) | (Segment.user_id.is_(None)))
        .order_by(Segment.created_at)
    ).all()


@router.post("/segments", response_model=SegmentOut, status_code=201)
def create_segment(data: SegmentCreate, db: DB, user: CurrentUser, org: CurrentOrg):
    segment = Segment(organization_id=org.id, user_id=user.id, **data.model_dump())
    db.add(segment)
    db.commit()
    db.refresh(segment)
    return segment


@router.delete("/segments/{segment_id}", response_model=Msg)
def delete_segment(segment_id: str, db: DB, user: CurrentUser, org: CurrentOrg):
    segment = db.get(Segment, segment_id)
    if not segment or segment.organization_id != org.id:
        raise not_found("segmento", "SEGMENT_NOT_FOUND")
    if segment.user_id and segment.user_id != user.id and user.role == "vendedor":
        raise ApiError("FORBIDDEN", "Solo podés borrar tus propios segmentos", 403)
    db.delete(segment)
    db.commit()
    return Msg(message="Segmento eliminado")


# ---------- Auditoría ----------

@router.get("/audit", response_model=Page[AuditLogOut])
def list_audit(
    db: DB,
    admin: AdminUser,
    org: CurrentOrg,
    pagination: Pagination,
    action: str | None = None,
    entity_type: str | None = None,
):
    query = select(AuditLog).where(AuditLog.organization_id == org.id)
    if action:
        query = query.where(AuditLog.action == action)
    if entity_type:
        query = query.where(AuditLog.entity_type == entity_type)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    logs = db.scalars(
        query.order_by(AuditLog.created_at.desc()).offset(pagination.offset).limit(pagination.page_size)
    ).all()
    user_ids = {log.actor_user_id for log in logs if log.actor_user_id}
    users = {
        u.id: u.full_name
        for u in db.scalars(select(User).where(User.id.in_(user_ids))).all()
    } if user_ids else {}
    items = []
    for log in logs:
        item = AuditLogOut.model_validate(log)
        item.actor_name = users.get(log.actor_user_id)
        items.append(item)
    return {"items": items, "total": total, "page": pagination.page, "page_size": pagination.page_size}


# ---------- Búsqueda global ----------

@router.get("/search", response_model=GlobalSearchOut)
def global_search(db: DB, user: CurrentUser, org: CurrentOrg, q: str):
    return {"results": search_service.global_search(db, org.id, q)}


# ---------- Importación ----------

@router.post("/import/{entity}/preview", response_model=ImportPreviewOut)
def import_preview(entity: str, file: UploadFile, db: DB, manager: ManagerUser, org: CurrentOrg):
    if entity not in ("customers", "vehicles"):
        raise ApiError("INVALID_ENTITY", "Solo se pueden importar clientes o vehículos", 400)
    content = file.file.read(5 * 1024 * 1024 + 1)
    if len(content) > 5 * 1024 * 1024:
        raise ApiError("FILE_TOO_LARGE", "El CSV supera el máximo de 5 MB", 400)
    return importer.preview(entity, content)


@router.post("/import/{entity}/commit", response_model=ImportResultOut)
def import_commit(entity: str, data: ImportCommitRequest, db: DB, manager: ManagerUser, org: CurrentOrg):
    if entity not in ("customers", "vehicles"):
        raise ApiError("INVALID_ENTITY", "Solo se pueden importar clientes o vehículos", 400)
    result = importer.commit(db, org, manager, data.token, data.mapping)
    db.commit()
    return result
