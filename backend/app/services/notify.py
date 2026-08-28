from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Notification, User


def notify(
    db: Session,
    organization_id: str,
    user_id: str,
    type_: str,
    title: str,
    body: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    dedup_key: str | None = None,
) -> Notification | None:
    """Crea una notificación. Si dedup_key ya existe para ese usuario, no duplica."""
    if dedup_key:
        exists = db.scalar(
            select(Notification.id).where(
                Notification.user_id == user_id, Notification.dedup_key == dedup_key
            )
        )
        if exists:
            return None
    notification = Notification(
        organization_id=organization_id,
        user_id=user_id,
        type=type_,
        title=title,
        body=body,
        entity_type=entity_type,
        entity_id=entity_id,
        dedup_key=dedup_key,
    )
    db.add(notification)
    return notification


def notify_managers(
    db: Session,
    organization_id: str,
    type_: str,
    title: str,
    body: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    dedup_key: str | None = None,
    exclude_user_id: str | None = None,
) -> None:
    managers = db.scalars(
        select(User).where(
            User.organization_id == organization_id,
            User.role.in_(("admin", "gerente")),
            User.is_active.is_(True),
        )
    ).all()
    for manager in managers:
        if manager.id == exclude_user_id:
            continue
        key = f"{dedup_key}:{manager.id}" if dedup_key else None
        notify(db, organization_id, manager.id, type_, title, body, entity_type, entity_id, key)
