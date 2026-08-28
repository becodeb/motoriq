"""Motor de Lead Scoring (§11, §95).

Reglas determinísticas y explicables: cada punto tiene un motivo visible.
Los pesos están congelados en docs/ARCHITECTURE.md — el seed y los tests
importan estas mismas constantes para que los números del demo coincidan
con las explicaciones que muestra la UI.
"""

import re
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.constants import score_label_for
from app.core.utils import clamp, normalize, utcnow
from app.models import Customer, LeadScoreHistory, Message, Opportunity, PipelineStage
from app.services.notify import notify

BASE_SCORE = 25
INTEREST_DEFINED_POINTS = 10
HOT_THRESHOLD = 65

# (key, regex sobre texto normalizado, puntos, motivo)
SIGNALS: tuple[tuple[str, str, int, str], ...] = (
    ("visita", r"verlo|puedo ver|pasar a ver|visita|ir a ver|conocerlo", 20, "Pidió ver el vehículo"),
    ("reserva", r"reserv|senar|sena de|adelanto", 18, "Habló de reservar"),
    ("financiacion", r"financi|cuota|credito|prestamo", 15, "Preguntó por financiación"),
    ("documentacion", r"documento|transferencia|papeles|titulo|verificacion", 12, "Consultó documentación"),
    ("cotizacion", r"cotiza|precio final|mejor precio|contado", 10, "Pidió cotización"),
    ("entrega", r"entrega|puedo tener|retirar", 10, "Habló de la entrega"),
    ("permuta", r"permuta|entrego mi|toman mi|tomar mi", 9, "Consultó permuta"),
    ("disponibilidad", r"disponible|disponibilidad|sigue en venta|lo tenes", 8, "Consultó disponibilidad"),
    ("ubicacion", r"ubicacion|donde estan|direccion|zona", 6, "Consultó ubicación"),
)

RECENT_REPLY_POINTS = 12  # entrante en las últimas 24h
HIGH_ACTIVITY_POINTS = 8  # ≥3 entrantes en 7 días

SILENT_4_7_POINTS = -8
SILENT_OVER_7_POINTS = -15
EXPLICIT_REJECTION_POINTS = -12
BUDGET_MISMATCH_POINTS = -10
REJECTION_PATTERN = r"no por ahora|mas adelante|solo miraba|lo pienso|no me interesa"

STAGE_BONUS = {"visita": (8, "Visita agendada"), "negociacion": (10, "En negociación"), "reserva": (20, "Con reserva")}


def compute_score(db: Session, customer: Customer) -> tuple[int, list[dict]]:
    now = utcnow()
    factors: list[dict] = [{"label": "Base", "points": BASE_SCORE}]
    score = BASE_SCORE

    if customer.interested_vehicle_id:
        score += INTEREST_DEFINED_POINTS
        factors.append({"label": "Vehículo de interés definido", "points": INTEREST_DEFINED_POINTS})

    inbound = db.scalars(
        select(Message)
        .where(
            Message.customer_id == customer.id,
            Message.direction == "entrante",
            Message.created_at >= now - timedelta(days=30),
        )
        .order_by(Message.created_at)
    ).all()
    text = normalize(" ".join(m.body for m in inbound))

    for _key, pattern, points, label in SIGNALS:
        if re.search(pattern, text):
            score += points
            factors.append({"label": label, "points": points})

    if inbound and (now - inbound[-1].created_at) <= timedelta(hours=24):
        score += RECENT_REPLY_POINTS
        factors.append({"label": "Respondió en las últimas 24 horas", "points": RECENT_REPLY_POINTS})
    if len([m for m in inbound if m.created_at >= now - timedelta(days=7)]) >= 3:
        score += HIGH_ACTIVITY_POINTS
        factors.append({"label": "Alta actividad reciente", "points": HIGH_ACTIVITY_POINTS})

    # Silencio: solo penaliza si el último movimiento fue nuestro (esperamos su respuesta).
    if customer.last_inbound_at and customer.last_outbound_at and customer.last_outbound_at > customer.last_inbound_at:
        days_silent = (now - customer.last_inbound_at).days
        if days_silent > 7:
            score += SILENT_OVER_7_POINTS
            factors.append({"label": "Dejó de responder", "points": SILENT_OVER_7_POINTS})
        elif days_silent >= 4:
            score += SILENT_4_7_POINTS
            factors.append({"label": "Sin respuesta hace varios días", "points": SILENT_4_7_POINTS})

    if text and re.search(REJECTION_PATTERN, text):
        score += EXPLICIT_REJECTION_POINTS
        factors.append({"label": "Expresó baja intención", "points": EXPLICIT_REJECTION_POINTS})

    if customer.budget and customer.interested_vehicle and customer.interested_vehicle.price:
        if customer.budget < customer.interested_vehicle.price * 0.7:
            score += BUDGET_MISMATCH_POINTS
            factors.append({"label": "Presupuesto por debajo del precio", "points": BUDGET_MISMATCH_POINTS})

    stage_key = _best_open_stage_key(db, customer.id)
    if stage_key in STAGE_BONUS:
        points, label = STAGE_BONUS[stage_key]
        score += points
        factors.append({"label": label, "points": points})

    # Tope 99: la probabilidad nunca se presenta como certeza (§23, §84).
    return clamp(score, 0, 99), factors


def _best_open_stage_key(db: Session, customer_id: str) -> str | None:
    rows = db.execute(
        select(PipelineStage.key, PipelineStage.position)
        .join(Opportunity, Opportunity.stage_id == PipelineStage.id)
        .where(Opportunity.customer_id == customer_id, Opportunity.status == "abierta")
    ).all()
    if not rows:
        return None
    return max(rows, key=lambda r: r.position).key


def apply_score(db: Session, customer: Customer, reason_override: str | None = None) -> bool:
    """Recalcula y persiste el score. Devuelve True si cambió."""
    new_score, factors = compute_score(db, customer)
    old_score = customer.lead_score
    now = utcnow()

    positive = [f for f in factors if f["points"] > 0 and f["label"] != "Base"]
    negative = [f for f in factors if f["points"] < 0]
    if reason_override:
        reason = reason_override
    elif new_score >= old_score and positive:
        reason = max(positive, key=lambda f: f["points"])["label"]
    elif negative:
        reason = min(negative, key=lambda f: f["points"])["label"]
    else:
        reason = "Actividad de la conversación"

    customer.score_factors = factors
    customer.score_updated_at = now

    if new_score == old_score:
        return False

    customer.lead_score = new_score
    customer.score_label = score_label_for(new_score)
    customer.score_reason = reason
    db.add(
        LeadScoreHistory(
            organization_id=customer.organization_id,
            customer_id=customer.id,
            old_score=old_score,
            new_score=new_score,
            reason=reason,
            factors=factors,
        )
    )

    # Cruce del umbral caliente → avisar al vendedor asignado.
    if old_score < HOT_THRESHOLD <= new_score and customer.assigned_user_id:
        notify(
            db,
            customer.organization_id,
            customer.assigned_user_id,
            "lead_caliente",
            f"🔥 {customer.full_name} se puso caliente ({new_score}/100)",
            reason,
            "customer",
            customer.id,
            dedup_key=f"hot:{customer.id}:{now.date().isoformat()}",
        )
    return True


def has_signal(customer: Customer, label: str) -> bool:
    """Consulta los factores persistidos (evita re-escanear mensajes)."""
    return any(f.get("label") == label for f in (customer.score_factors or []))
