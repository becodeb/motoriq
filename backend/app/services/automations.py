"""Motor de automatizaciones (§39): Trigger → Conditions → Actions.

Las acciones disponibles son deliberadamente seguras: asignar, crear tareas o
seguimientos, notificar y correr matching. Nunca envían mensajes externos ni
modifican precios (§96).
"""

import logging
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.events import DomainEvent
from app.core.utils import utcnow
from app.models import (
    Automation,
    AutomationRun,
    Customer,
    Followup,
    Organization,
    Task,
    Vehicle,
)
from app.services import customers as customers_service
from app.services import matching
from app.services.notify import notify, notify_managers

logger = logging.getLogger("pops.automations")


def handle_event(db: Session, event: DomainEvent) -> None:
    automations = db.scalars(
        select(Automation).where(
            Automation.organization_id == event.organization_id,
            Automation.trigger == event.name,
            Automation.enabled.is_(True),
        )
    ).all()
    for automation in automations:
        run_automation(db, automation, event)


def run_automation(db: Session, automation: Automation, event: DomainEvent) -> None:
    customer = db.get(Customer, event.entity_id) if event.entity_type == "customer" else None
    vehicle = db.get(Vehicle, event.entity_id) if event.entity_type == "vehicle" else None

    # Idempotencia para triggers de escaneo (el scheduler los re-emite cada minuto):
    # una misma automatización no vuelve a actuar sobre la misma entidad dentro de 24 h.
    if automation.trigger in ("inactivity.72h", "followup.overdue") and event.entity_id:
        recent = db.scalar(
            select(AutomationRun.id).where(
                AutomationRun.automation_id == automation.id,
                AutomationRun.trigger_entity_id == event.entity_id,
                AutomationRun.status == "success",
                AutomationRun.created_at >= utcnow() - timedelta(hours=24),
            ).limit(1)
        )
        if recent:
            return

    try:
        if not _conditions_pass(automation.conditions or [], customer, event):
            _log_run(db, automation, event, "skipped", {"motivo": "condiciones no cumplidas"})
            return
        results = []
        for action in automation.actions or []:
            outcome = _execute_action(db, action, customer, vehicle, event)
            results.append({"action": action.get("type"), "result": outcome})
        _log_run(db, automation, event, "success", {"acciones": results})
    except Exception as exc:
        logger.exception("Automatización %s falló", automation.name)
        _log_run(db, automation, event, "error", {"error": str(exc)})


def _conditions_pass(conditions: list, customer: Customer | None, event: DomainEvent) -> bool:
    for condition in conditions:
        field = condition.get("field")
        op = condition.get("op", "eq")
        value = condition.get("value")
        if field == "sin_vendedor":
            if not (customer and customer.assigned_user_id is None):
                return False
        elif field == "score":
            if not customer:
                return False
            score = customer.lead_score
            if op == "gt" and not score > value:
                return False
            if op == "gte" and not score >= value:
                return False
            if op == "lt" and not score < value:
                return False
        elif field == "source":
            if not (customer and customer.source == value):
                return False
        elif field == "channel":
            if event.data.get("channel") != value:
                return False
        elif field == "status":
            if not (customer and customer.status == value):
                return False
    return True


def _execute_action(
    db: Session,
    action: dict,
    customer: Customer | None,
    vehicle: Vehicle | None,
    event: DomainEvent,
) -> str:
    action_type = action.get("type")
    params = action.get("params", {})

    if action_type == "assign_round_robin":
        if not customer or customer.assigned_user_id:
            return "sin cambios"
        org = db.get(Organization, event.organization_id)
        seller_id = customers_service.pick_seller(db, org)
        if seller_id:
            customer.assigned_user_id = seller_id
            notify(
                db, org.id, seller_id, "lead_nuevo",
                f"Lead asignado: {customer.full_name}",
                "Asignado automáticamente por Motor IQ.",
                "customer", customer.id,
            )
            return f"asignado a {seller_id}"
        return "sin vendedores disponibles"

    if action_type == "create_task":
        if not customer:
            return "sin cliente"
        title = params.get("title", "Revisar cliente {nombre}").replace("{nombre}", customer.full_name)
        db.add(
            Task(
                organization_id=event.organization_id,
                user_id=customer.assigned_user_id,
                customer_id=customer.id,
                title=title,
                type=params.get("task_type", "seguimiento"),
                priority=params.get("priority", "alta"),
                due_at=utcnow() + timedelta(hours=params.get("due_in_hours", 24)),
                origin="automatizacion",
            )
        )
        return "tarea creada"

    if action_type == "create_followup":
        if not customer:
            return "sin cliente"
        db.add(
            Followup(
                organization_id=event.organization_id,
                customer_id=customer.id,
                user_id=customer.assigned_user_id,
                due_at=utcnow() + timedelta(hours=params.get("due_in_hours", 24)),
                type=params.get("followup_type", "llamada"),
                priority=params.get("priority", "alta"),
                note=params.get("note", "Seguimiento automático"),
                origin="automatizacion",
            )
        )
        return "seguimiento creado"

    if action_type == "notify":
        title = params.get("title", "Aviso de Motor IQ")
        if customer:
            title = title.replace("{nombre}", customer.full_name)
        if customer and customer.assigned_user_id and params.get("to", "vendedor") == "vendedor":
            notify(
                db, event.organization_id, customer.assigned_user_id, params.get("notification_type", "sistema"),
                title, params.get("body"), event.entity_type, event.entity_id,
            )
            return "vendedor notificado"
        notify_managers(
            db, event.organization_id, params.get("notification_type", "sistema"),
            title, params.get("body"), event.entity_type, event.entity_id,
        )
        return "gerencia notificada"

    if action_type == "run_matching":
        if vehicle:
            count = matching.run_matching_for_vehicle(db, vehicle)
            return f"{count} matches"
        if customer:
            count = matching.run_matching_for_customer(db, customer)
            return f"{count} matches"
        return "sin entidad"

    return f"acción desconocida: {action_type}"


def _log_run(db: Session, automation: Automation, event: DomainEvent, status: str, result: dict) -> None:
    db.add(
        AutomationRun(
            organization_id=automation.organization_id,
            automation_id=automation.id,
            trigger_entity_type=event.entity_type,
            trigger_entity_id=event.entity_id,
            status=status,
            result=result,
        )
    )
