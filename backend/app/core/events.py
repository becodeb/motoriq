"""Bus de eventos de dominio in-process.

Los servicios publican eventos (vehicle.created, message.received, ...) y los handlers
(automatizaciones, matching, notificaciones, auditoría) se suscriben sin acoplarse entre sí.
Los handlers corren de forma síncrona dentro de la misma transacción/request; si uno falla,
se loguea y no interrumpe al resto (los eventos son best-effort, la operación principal ya
está persistida).
"""

import logging
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session

logger = logging.getLogger("pops.events")


@dataclass
class DomainEvent:
    name: str
    organization_id: str
    entity_type: str | None = None
    entity_id: str | None = None
    actor_user_id: str | None = None
    data: dict[str, Any] = field(default_factory=dict)


Handler = Callable[[Session, DomainEvent], None]

_subscribers: dict[str, list[Handler]] = defaultdict(list)


def subscribe(event_name: str, handler: Handler) -> None:
    if handler not in _subscribers[event_name]:
        _subscribers[event_name].append(handler)


def publish(db: Session, event: DomainEvent) -> None:
    handlers = _subscribers.get(event.name, []) + _subscribers.get("*", [])
    for handler in handlers:
        try:
            handler(db, event)
        except Exception:
            logger.exception("Handler %s falló para %s", getattr(handler, "__name__", handler), event.name)


def clear_subscribers() -> None:
    """Solo para tests."""
    _subscribers.clear()
