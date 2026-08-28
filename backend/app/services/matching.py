"""Matching cliente ↔ vehículo (§25, §26).

Pondera preferencias estructuradas del cliente contra el stock disponible.
Cada match persiste sus razones para explicar el porcentaje.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.utils import normalize, utcnow
from app.models import Customer, CustomerVehicleMatch, Vehicle
from app.services.notify import notify

MATCH_THRESHOLD = 45
BRAND_POINTS = 25
MODEL_POINTS = 25
BODY_POINTS = 15
BUDGET_FULL_POINTS = 20  # presupuesto ≥ 90% del precio
BUDGET_NEAR_POINTS = 10  # presupuesto ≥ 80% del precio
YEAR_POINTS = 10
TRANSMISSION_POINTS = 5
FUEL_POINTS = 5


def _customer_preferences(customer: Customer) -> dict:
    """Preferencias efectivas: campos de interés + datos del vehículo de interés."""
    interested = customer.interested_vehicle
    return {
        "brand": normalize(customer.interest_brand or (interested.brand if interested else "")),
        "model": normalize(customer.interest_model or (interested.model if interested else "")),
        "body_type": customer.interest_body_type or (interested.body_type if interested else None),
        "budget": customer.budget or (interested.price if interested else None),
        "year_min": customer.interest_year_min or (interested.year - 2 if interested else None),
        "year_max": customer.interest_year_max or (interested.year + 2 if interested else None),
        "transmission": customer.interest_transmission or (interested.transmission if interested else None),
        "fuel": customer.interest_fuel or (interested.fuel if interested else None),
    }


def match_score(customer: Customer, vehicle: Vehicle) -> tuple[int, list[str]]:
    prefs = _customer_preferences(customer)
    if not any([prefs["brand"], prefs["model"], prefs["body_type"], prefs["budget"]]):
        return 0, []  # sin datos de interés no hay match confiable

    score = 0
    reasons: list[str] = []

    if prefs["brand"] and prefs["brand"] == normalize(vehicle.brand):
        score += BRAND_POINTS
        reasons.append(f"Busca {vehicle.brand}")
    if prefs["model"] and prefs["model"] in normalize(vehicle.model):
        score += MODEL_POINTS
        reasons.append(f"Busca modelo {vehicle.model}")
    if prefs["body_type"] and prefs["body_type"] == vehicle.body_type:
        score += BODY_POINTS
        reasons.append(f"Busca {vehicle.body_type.upper() if vehicle.body_type == 'suv' else vehicle.body_type}")

    budget = prefs["budget"]
    if budget and vehicle.price:
        if budget >= vehicle.price * 0.9:
            score += BUDGET_FULL_POINTS
            reasons.append("Dentro de su presupuesto")
        elif budget >= vehicle.price * 0.8:
            score += BUDGET_NEAR_POINTS
            reasons.append("Cerca de su presupuesto")

    if prefs["year_min"] and prefs["year_max"] and prefs["year_min"] <= vehicle.year <= prefs["year_max"]:
        score += YEAR_POINTS
        reasons.append(f"Año {vehicle.year} en el rango buscado")
    if prefs["transmission"] and prefs["transmission"] == vehicle.transmission:
        score += TRANSMISSION_POINTS
        reasons.append(f"Transmisión {vehicle.transmission}")
    if prefs["fuel"] and prefs["fuel"] == vehicle.fuel:
        score += FUEL_POINTS
        reasons.append(f"Combustible {vehicle.fuel}")

    return min(score, 99), reasons


def _upsert_match(db: Session, customer: Customer, vehicle: Vehicle, score: int, reasons: list[str]) -> CustomerVehicleMatch | None:
    existing = db.scalar(
        select(CustomerVehicleMatch).where(
            CustomerVehicleMatch.customer_id == customer.id,
            CustomerVehicleMatch.vehicle_id == vehicle.id,
        )
    )
    if existing:
        existing.score = score
        existing.reasons = reasons
        existing.updated_at = utcnow()
        return None  # no es nuevo
    match = CustomerVehicleMatch(
        organization_id=customer.organization_id,
        customer_id=customer.id,
        vehicle_id=vehicle.id,
        score=score,
        reasons=reasons,
        status="sugerido",
    )
    db.add(match)
    return match


def run_matching_for_vehicle(db: Session, vehicle: Vehicle) -> int:
    """Al ingresar un vehículo, busca clientes compatibles. Devuelve cantidad de matches."""
    if vehicle.status not in ("disponible", "preparacion"):
        return 0
    db.flush()  # la sesión usa autoflush=False: hacer visibles los matches pendientes al chequeo de unicidad
    customers = db.scalars(
        select(Customer).where(
            Customer.organization_id == vehicle.organization_id,
            Customer.status.notin_(("perdido", "inactivo", "cliente")),
            Customer.deleted_at.is_(None),
        )
    ).all()
    total = 0
    new_by_seller: dict[str, int] = {}
    for customer in customers:
        score, reasons = match_score(customer, vehicle)
        if score >= MATCH_THRESHOLD:
            total += 1
            if _upsert_match(db, customer, vehicle, score, reasons) and customer.assigned_user_id:
                new_by_seller[customer.assigned_user_id] = new_by_seller.get(customer.assigned_user_id, 0) + 1
    for seller_id, count in new_by_seller.items():
        notify(
            db,
            vehicle.organization_id,
            seller_id,
            "match_nuevo",
            f"🎯 {vehicle.title}: {count} cliente{'s' if count > 1 else ''} tuyo{'s' if count > 1 else ''} compatible{'s' if count > 1 else ''}",
            "Nuevo ingreso al stock con clientes potencialmente interesados.",
            "vehicle",
            vehicle.id,
            dedup_key=f"match_vehicle:{vehicle.id}:{seller_id}",
        )
    return total


def run_matching_for_customer(db: Session, customer: Customer) -> int:
    """Al crear/editar preferencias de un cliente, recalcula su stock compatible."""
    db.flush()  # ver run_matching_for_vehicle
    vehicles = db.scalars(
        select(Vehicle).where(
            Vehicle.organization_id == customer.organization_id,
            Vehicle.status == "disponible",
            Vehicle.deleted_at.is_(None),
        )
    ).all()
    total = 0
    for vehicle in vehicles:
        score, reasons = match_score(customer, vehicle)
        if score >= MATCH_THRESHOLD:
            total += 1
            _upsert_match(db, customer, vehicle, score, reasons)
    return total


def recommended_vehicles(db: Session, customer: Customer, limit: int = 6) -> list[dict]:
    """Top de stock disponible compatible, calculado en vivo (perfil del cliente §26)."""
    vehicles = db.scalars(
        select(Vehicle).where(
            Vehicle.organization_id == customer.organization_id,
            Vehicle.status == "disponible",
            Vehicle.deleted_at.is_(None),
        )
    ).all()
    scored = []
    for vehicle in vehicles:
        score, reasons = match_score(customer, vehicle)
        if score >= MATCH_THRESHOLD:
            scored.append({"vehicle": vehicle, "score": score, "reasons": reasons})
    scored.sort(key=lambda item: item["score"], reverse=True)
    return scored[:limit]
