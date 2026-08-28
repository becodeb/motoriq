"""Next Best Action (§13, §94): cascada de reglas explicables por cliente."""


from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.utils import utcnow
from app.models import (
    Customer,
    CustomerVehicleMatch,
    FinancingScenario,
    Followup,
    Opportunity,
    PipelineStage,
    TradeIn,
)
from app.services.scoring import has_signal

NEGOTIATION_POSITION_THRESHOLD = 5  # posición de "negociacion" en el pipeline por defecto


def next_best_action(db: Session, customer: Customer) -> dict:
    now = utcnow()

    open_opps = db.scalars(
        select(Opportunity).where(
            Opportunity.customer_id == customer.id, Opportunity.status == "abierta"
        )
    ).all()
    stage_keys = {opp.stage.key for opp in open_opps if opp.stage}
    max_stage_position = max((opp.stage.position for opp in open_opps if opp.stage), default=-1)

    # 1. Reserva activa → cerrar bien.
    if "reserva" in stage_keys:
        return _action(
            "confirmar_reserva",
            "Confirmar seña y preparar documentación",
            "Tiene una reserva activa: es el momento de cerrar sin fricción.",
            "alta",
        )

    # 2. Preguntó financiación y nunca recibió una simulación.
    if has_signal(customer, "Preguntó por financiación"):
        has_financing = db.scalar(
            select(FinancingScenario.id).where(FinancingScenario.customer_id == customer.id).limit(1)
        )
        if not has_financing:
            return _action(
                "enviar_financiacion",
                "Enviar simulación de financiación",
                "Consultó financiación y todavía no recibió ninguna simulación.",
                "alta",
            )

    # 3. Tiene vehículo para entregar y nadie lo tasó.
    if customer.has_trade_in or has_signal(customer, "Consultó permuta"):
        has_trade_in = db.scalar(select(TradeIn.id).where(TradeIn.customer_id == customer.id).limit(1))
        if not has_trade_in:
            return _action(
                "cotizar_permuta",
                "Cotizar la permuta",
                "Mencionó que entregaría su vehículo y aún no está tasado.",
                "alta",
            )

    # 4. Nos escribió y no le respondimos.
    if customer.awaiting_reply and customer.last_inbound_at:
        hours = int((now - customer.last_inbound_at).total_seconds() // 3600)
        waiting = f"{hours} h" if hours < 48 else f"{hours // 24} días"
        return _action(
            "responder",
            "Responder ahora",
            f"El último mensaje es del cliente: espera respuesta hace {waiting}.",
            "alta",
        )

    # 5. Caliente pero enfriándose.
    if customer.lead_score >= 65 and customer.last_contact_at and (now - customer.last_contact_at).days >= 4:
        return _action(
            "retomar",
            "Retomar la conversación hoy",
            f"Score {customer.lead_score}/100 pero sin contacto hace {(now - customer.last_contact_at).days} días.",
            "alta",
        )

    # 6. Seguimiento vencido.
    overdue = db.scalar(
        select(Followup).where(
            Followup.customer_id == customer.id,
            Followup.status == "pendiente",
            Followup.due_at < now,
        ).order_by(Followup.due_at).limit(1)
    )
    if overdue:
        return _action(
            "completar_seguimiento",
            "Completar el seguimiento vencido",
            f"Había un seguimiento programado para el {overdue.due_at.strftime('%d/%m')} que quedó pendiente.",
            "media",
        )

    # 7. Match nuevo sin ofrecer.
    match = db.scalar(
        select(CustomerVehicleMatch)
        .where(
            CustomerVehicleMatch.customer_id == customer.id,
            CustomerVehicleMatch.status == "sugerido",
        )
        .order_by(CustomerVehicleMatch.score.desc())
        .limit(1)
    )
    if match and match.vehicle and match.vehicle.status == "disponible":
        return _action(
            "ofrecer_match",
            f"Ofrecer {match.vehicle.title} ({match.score}% match)",
            "Hay stock compatible con lo que busca y todavía no se lo ofrecimos.",
            "media",
        )

    # 8. Muy caliente pero la oportunidad no avanzó.
    if customer.lead_score >= 85 and open_opps:
        negotiation_position = db.scalar(
            select(PipelineStage.position).where(
                PipelineStage.organization_id == customer.organization_id,
                PipelineStage.key == "negociacion",
            )
        ) or NEGOTIATION_POSITION_THRESHOLD
        if max_stage_position < negotiation_position:
            return _action(
                "proponer_visita",
                "Proponer visita o reserva",
                f"Probabilidad de compra muy alta ({customer.lead_score}/100): es momento de avanzar.",
                "alta",
            )

    # 9. Su vehículo de interés ya se vendió.
    if customer.interested_vehicle and customer.interested_vehicle.status == "vendido" and customer.status not in ("cliente", "perdido"):
        return _action(
            "ofrecer_alternativas",
            "Ofrecer alternativas similares",
            f"El {customer.interested_vehicle.title} que le interesaba ya se vendió.",
            "media",
        )

    # 10. Frío y abandonado hace un mes.
    if customer.lead_score < 40 and customer.last_contact_at and (now - customer.last_contact_at).days >= 30:
        return _action(
            "cerrar_perdido",
            "Considerar cerrar como perdido",
            f"Score bajo ({customer.lead_score}/100) y sin actividad hace más de 30 días.",
            "baja",
        )

    # 11. Default.
    if customer.next_followup_at and customer.next_followup_at > now:
        return _action(
            "mantener",
            "Mantener el seguimiento programado",
            f"Próximo contacto agendado para el {customer.next_followup_at.strftime('%d/%m %H:%M')}.",
            "baja",
        )
    return _action(
        "agendar_seguimiento",
        "Agendar un próximo contacto",
        "No hay seguimientos futuros: definí cuándo volver a hablarle.",
        "media",
    )


def _action(action: str, label: str, reason: str, urgency: str) -> dict:
    return {"action": action, "label": label, "reason": reason, "urgency": urgency}
