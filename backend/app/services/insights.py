"""Generación de insights de POPS Intelligence (§15, §40).

Idempotente vía dedup_key (semana ISO): el scheduler puede correr cada minuto
sin duplicar. Cada insight explica qué se detectó, por qué y qué hacer.
"""


from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.utils import utcnow
from app.models import AIInsight, Customer, Followup, Opportunity, Organization, Vehicle
from app.services import stock_intel
from app.services.stock_intel import STALE_DAYS


def _week_key() -> str:
    now = utcnow()
    return f"{now.year}-w{now.isocalendar().week}"


def _upsert(db: Session, org_id: str, dedup_key: str, **fields) -> bool:
    exists = db.scalar(
        select(AIInsight.id).where(AIInsight.organization_id == org_id, AIInsight.dedup_key == dedup_key)
    )
    if exists:
        return False
    db.add(AIInsight(organization_id=org_id, dedup_key=dedup_key, **fields))
    return True


def generate_for_org(db: Session, org: Organization) -> int:
    """Corre todas las detecciones. Devuelve cantidad de insights nuevos."""
    created = 0
    created += _customers_to_recover(db, org)
    created += _at_risk_opportunities(db, org)
    created += _stale_stock(db, org)
    created += _demand_vehicles(db, org)
    created += _stock_opportunities(db, org)
    return created


def _customers_to_recover(db: Session, org: Organization) -> int:
    now = utcnow()
    week = _week_key()
    created = 0
    customers = db.scalars(
        select(Customer).where(
            Customer.organization_id == org.id,
            Customer.deleted_at.is_(None),
            Customer.status.in_(("lead", "activo")),
            Customer.lead_score >= 50,
        )
    ).all()
    for c in customers:
        last = c.last_contact_at
        if not last or (now - last).days < 5:
            continue
        days = (now - last).days
        if days > 45:
            continue
        vehicle = c.interested_vehicle.title if c.interested_vehicle else "un vehículo"
        if _upsert(
            db,
            org.id,
            f"recuperar:{c.id}:{week}",
            kind="recuperar",
            title=f"{c.full_name} quedó sin seguimiento",
            detail=f"Estaba interesado en {vehicle} con score {c.lead_score}/100 y no tiene contacto hace {days} días.",
            reason=c.score_reason or "Mostró señales de compra en la conversación y el contacto se cortó.",
            recommendation="Retomar la conversación hoy con un mensaje breve y una propuesta concreta (visita o simulación).",
            entity_type="customer",
            entity_id=c.id,
            data={"score": c.lead_score, "dias_sin_contacto": days},
        ):
            created += 1
    return created


def _at_risk_opportunities(db: Session, org: Organization) -> int:
    week = _week_key()
    created = 0
    now = utcnow()
    opportunities = db.scalars(
        select(Opportunity).where(
            Opportunity.organization_id == org.id,
            Opportunity.status == "abierta",
            Opportunity.health == "red",
        )
    ).all()
    for o in opportunities:
        if not o.customer:
            continue
        overdue = db.scalar(
            select(Followup.due_at).where(
                Followup.opportunity_id == o.id, Followup.status == "pendiente", Followup.due_at < now
            ).order_by(Followup.due_at).limit(1)
        )
        reason = (
            f"Tiene un seguimiento vencido desde el {overdue.strftime('%d/%m')}."
            if overdue
            else "No registra actividad reciente y el pipeline la muestra frenada."
        )
        if _upsert(
            db,
            org.id,
            f"riesgo:{o.id}:{week}",
            kind="riesgo",
            title=f"Oportunidad en riesgo: {o.customer.full_name}",
            detail=f"La oportunidad {'por ' + o.vehicle.title if o.vehicle else ''} en etapa {o.stage.name if o.stage else '—'} está en rojo.",
            reason=reason,
            recommendation="Contactar hoy y redefinir el próximo paso; si no responde, ofrecer una alternativa o agendar recontacto.",
            entity_type="customer",
            entity_id=o.customer_id,
            data={"opportunity_id": o.id, "valor": o.expected_value},
        ):
            created += 1
    return created


def _stale_stock(db: Session, org: Organization) -> int:
    week = _week_key()
    created = 0
    inquiries = stock_intel.inquiries_map(db, org.id)
    vehicles = db.scalars(
        select(Vehicle).where(
            Vehicle.organization_id == org.id,
            Vehicle.deleted_at.is_(None),
            Vehicle.status == "disponible",
        )
    ).all()
    if not vehicles:
        return 0
    avg = sum(inquiries.get(v.id, 0) for v in vehicles) / len(vehicles)
    for v in vehicles:
        count = inquiries.get(v.id, 0)
        if v.days_in_stock >= STALE_DAYS and count <= avg:
            if _upsert(
                db,
                org.id,
                f"estancado:{v.id}:{week}",
                kind="stock_estancado",
                title=f"{v.title} {v.year} está estancado",
                detail=f"Lleva {v.days_in_stock} días publicado con {count} consulta{'s' if count != 1 else ''}.",
                reason=f"La demanda está por debajo del promedio del stock ({avg:.1f} consultas por vehículo).",
                recommendation="Revisar precio y publicación (fotos/descripción) u ofrecerlo activamente a clientes compatibles.",
                entity_type="vehicle",
                entity_id=v.id,
                data={"dias": v.days_in_stock, "consultas": count},
            ):
                created += 1
    return created


def _demand_vehicles(db: Session, org: Organization) -> int:
    week = _week_key()
    created = 0
    inquiries = stock_intel.inquiries_map(db, org.id)
    vehicles = db.scalars(
        select(Vehicle).where(
            Vehicle.organization_id == org.id,
            Vehicle.deleted_at.is_(None),
            Vehicle.status.in_(("disponible", "reservado")),
        )
    ).all()
    if not vehicles:
        return 0
    avg = sum(inquiries.get(v.id, 0) for v in vehicles) / len(vehicles)
    if not avg:
        return 0
    for v in vehicles:
        count = inquiries.get(v.id, 0)
        if count >= max(3, avg * 1.5):
            if _upsert(
                db,
                org.id,
                f"demanda:{v.id}:{week}",
                kind="demanda_vehiculo",
                title=f"Alta demanda: {v.title} {v.year}",
                detail=f"Recibe {count / avg:.1f}× más consultas que el promedio del stock ({count} consultas).",
                reason="Varios clientes activos lo tienen como vehículo de interés o abrieron oportunidades por él.",
                recommendation="Priorizar respuestas y visitas por este vehículo; evaluar conseguir unidades similares.",
                entity_type="vehicle",
                entity_id=v.id,
                data={"consultas": count, "promedio": round(avg, 1)},
            ):
                created += 1
    return created


def _stock_opportunities(db: Session, org: Organization) -> int:
    week = _week_key()
    created = 0
    for i, rec in enumerate(stock_intel.stock_recommendations(db, org.id)):
        if _upsert(
            db,
            org.id,
            f"oportunidad_stock:{i}:{week}",
            kind="oportunidad_stock",
            title=rec["title"],
            detail=rec["detail"],
            reason=rec["reason"],
            recommendation="Buscar unidades de este modelo para reponer stock. Basado en datos históricos, no es una certeza.",
            entity_type=None,
            entity_id=None,
            data={"metric": rec.get("metric")},
        ):
            created += 1
    return created
