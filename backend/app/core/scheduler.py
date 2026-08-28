"""Scheduler liviano in-process: vencimientos, olvidados e insights.

Corre un tick por minuto en un thread (la DB es sync). Todo lo que genera es
idempotente vía dedup_key, así que un tick repetido no duplica nada.
Para escalar horizontalmente se reemplaza por un worker (Celery/Dramatiq).
"""

import asyncio
import logging
from datetime import timedelta

from sqlalchemy import select

from app.core.events import DomainEvent, publish
from app.core.utils import utcnow
from app.database.session import SessionLocal
from app.models import Automation, Customer, Followup, Organization, Task
from app.services import insights
from app.services.notify import notify

logger = logging.getLogger("pops.scheduler")

_INSIGHTS_EVERY = timedelta(minutes=30)
_last_insights_run = None


def run_tick() -> None:
    global _last_insights_run
    db = SessionLocal()
    try:
        now = utcnow()
        _notify_overdue_followups(db, now)
        _notify_overdue_tasks(db, now)
        _notify_upcoming_followups(db, now)
        _run_inactivity_automations(db, now)

        if _last_insights_run is None or now - _last_insights_run >= _INSIGHTS_EVERY:
            _last_insights_run = now
            for org in db.scalars(select(Organization)).all():
                created = insights.generate_for_org(db, org)
                if created:
                    logger.info("Insights generados para %s: %s", org.name, created)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Tick del scheduler falló")
    finally:
        db.close()


def _notify_overdue_followups(db, now) -> None:
    overdue = db.scalars(
        select(Followup).where(
            Followup.status == "pendiente",
            Followup.due_at < now,
            Followup.due_at > now - timedelta(days=14),
        )
    ).all()
    for f in overdue:
        if not f.user_id:
            continue
        created = notify(
            db,
            f.organization_id,
            f.user_id,
            "seguimiento_vencido",
            f"Seguimiento vencido: {f.customer.full_name if f.customer else ''}".strip(),
            f.note,
            "customer",
            f.customer_id,
            dedup_key=f"followup_overdue:{f.id}",
        )
        if created:
            publish(
                db,
                DomainEvent(
                    name="followup.overdue",
                    organization_id=f.organization_id,
                    entity_type="customer",
                    entity_id=f.customer_id,
                    data={"followup_id": f.id},
                ),
            )


def _notify_overdue_tasks(db, now) -> None:
    overdue = db.scalars(
        select(Task).where(
            Task.status == "pendiente",
            Task.due_at.isnot(None),
            Task.due_at < now,
            Task.due_at > now - timedelta(days=14),
        )
    ).all()
    for t in overdue:
        if t.user_id:
            notify(
                db,
                t.organization_id,
                t.user_id,
                "tarea_vencida",
                f"Tarea vencida: {t.title}",
                None,
                "task",
                t.id,
                dedup_key=f"task_overdue:{t.id}",
            )


def _notify_upcoming_followups(db, now) -> None:
    upcoming = db.scalars(
        select(Followup).where(
            Followup.status == "pendiente",
            Followup.due_at >= now,
            Followup.due_at <= now + timedelta(minutes=60),
        )
    ).all()
    for f in upcoming:
        if f.user_id:
            notify(
                db,
                f.organization_id,
                f.user_id,
                "seguimiento_hoy",
                f"En breve: {f.customer.full_name if f.customer else ''} ({f.due_at.strftime('%H:%M')} UTC)",
                f.note,
                "customer",
                f.customer_id,
                dedup_key=f"followup_soon:{f.id}",
            )


def _run_inactivity_automations(db, now) -> None:
    """Trigger inactivity.72h: clientes activos sin contacto hace más de 72 h."""
    autos = db.scalars(
        select(Automation).where(Automation.trigger == "inactivity.72h", Automation.enabled.is_(True))
    ).all()
    if not autos:
        return
    org_ids = {a.organization_id for a in autos}
    for org_id in org_ids:
        stale_customers = db.scalars(
            select(Customer).where(
                Customer.organization_id == org_id,
                Customer.deleted_at.is_(None),
                Customer.status.in_(("lead", "activo")),
                Customer.last_contact_at.isnot(None),
                Customer.last_contact_at < now - timedelta(hours=72),
                Customer.last_contact_at > now - timedelta(hours=96),  # ventana de 1 día para no repetir
            )
        ).all()
        for customer in stale_customers:
            publish(
                db,
                DomainEvent(
                    name="inactivity.72h",
                    organization_id=org_id,
                    entity_type="customer",
                    entity_id=customer.id,
                ),
            )


async def scheduler_loop() -> None:
    logger.info("Scheduler Motor IQ iniciado (tick de 60s)")
    while True:
        try:
            await asyncio.sleep(60)
            await asyncio.to_thread(run_tick)
        except asyncio.CancelledError:
            logger.info("Scheduler detenido")
            raise
        except Exception:
            logger.exception("Error en el loop del scheduler")
