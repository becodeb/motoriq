from fastapi import APIRouter
from sqlalchemy import func, select

from app.api.deps import DB, CurrentOrg, CurrentUser
from app.core.errors import ApiError, not_found
from app.core.events import DomainEvent, publish
from app.models import Customer, FinancingScenario, Quote, TradeIn, Vehicle
from app.schemas.commerce import (
    FinancingCreate,
    FinancingOut,
    FinancingSimulateRequest,
    FinancingSimulateResponse,
    QuoteCreate,
    QuoteOut,
    QuoteUpdate,
    TradeInCreate,
    TradeInOut,
    TradeInUpdate,
)
from app.schemas.common import Msg
from app.services import audit

router = APIRouter(tags=["commerce"])

FINANCING_DISCLAIMER = (
    "Simulación estimativa con sistema francés. Los valores finales dependen de la entidad financiera."
)


def _monthly_payment(amount: float, installments: int, annual_rate: float) -> float:
    if installments <= 0:
        return amount
    monthly_rate = annual_rate / 100 / 12
    if monthly_rate == 0:
        return amount / installments
    return amount * monthly_rate / (1 - (1 + monthly_rate) ** -installments)


def _get_customer(db, org, customer_id: str) -> Customer:
    customer = db.get(Customer, customer_id)
    if not customer or customer.organization_id != org.id or customer.deleted_at:
        raise not_found("cliente", "CUSTOMER_NOT_FOUND")
    return customer


# ---------- Permutas ----------

@router.get("/trade-ins", response_model=list[TradeInOut])
def list_trade_ins(db: DB, user: CurrentUser, org: CurrentOrg, customer_id: str | None = None):
    query = select(TradeIn).where(TradeIn.organization_id == org.id)
    if customer_id:
        query = query.where(TradeIn.customer_id == customer_id)
    return db.scalars(query.order_by(TradeIn.created_at.desc()).limit(200)).all()


@router.post("/trade-ins", response_model=TradeInOut, status_code=201)
def create_trade_in(data: TradeInCreate, db: DB, user: CurrentUser, org: CurrentOrg):
    customer = _get_customer(db, org, data.customer_id)
    trade_in = TradeIn(organization_id=org.id, **data.model_dump())
    db.add(trade_in)
    customer.has_trade_in = True
    audit.log(db, org.id, "permuta_creada", "trade_in", trade_in.id, user.id, {"cliente": customer.full_name})
    db.commit()
    db.refresh(trade_in)
    return trade_in


@router.patch("/trade-ins/{trade_in_id}", response_model=TradeInOut)
def update_trade_in(trade_in_id: str, data: TradeInUpdate, db: DB, user: CurrentUser, org: CurrentOrg):
    trade_in = db.get(TradeIn, trade_in_id)
    if not trade_in or trade_in.organization_id != org.id:
        raise not_found("permuta", "TRADE_IN_NOT_FOUND")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(trade_in, field, value)
    db.commit()
    db.refresh(trade_in)
    return trade_in


# ---------- Financiación ----------

@router.post("/financing/simulate", response_model=FinancingSimulateResponse)
def simulate_financing(data: FinancingSimulateRequest, user: CurrentUser):
    if data.down_payment >= data.vehicle_price:
        raise ApiError("INVALID_SIMULATION", "El anticipo no puede superar el precio del vehículo", 400)
    financed = data.vehicle_price - data.down_payment
    payment = _monthly_payment(financed, data.installments, data.annual_rate)
    total_paid = payment * data.installments
    return FinancingSimulateResponse(
        financed_amount=round(financed, 2),
        monthly_payment=round(payment, 2),
        total_paid=round(total_paid, 2),
        total_interest=round(total_paid - financed, 2),
        disclaimer=FINANCING_DISCLAIMER,
    )


@router.get("/financing", response_model=list[FinancingOut])
def list_financing(db: DB, user: CurrentUser, org: CurrentOrg, customer_id: str | None = None):
    query = select(FinancingScenario).where(FinancingScenario.organization_id == org.id)
    if customer_id:
        query = query.where(FinancingScenario.customer_id == customer_id)
    return db.scalars(query.order_by(FinancingScenario.created_at.desc()).limit(200)).all()


@router.post("/financing", response_model=FinancingOut, status_code=201)
def create_financing(data: FinancingCreate, db: DB, user: CurrentUser, org: CurrentOrg):
    customer = _get_customer(db, org, data.customer_id)
    if data.down_payment >= data.vehicle_price:
        raise ApiError("INVALID_SIMULATION", "El anticipo no puede superar el precio del vehículo", 400)
    financed = data.vehicle_price - data.down_payment
    scenario = FinancingScenario(
        organization_id=org.id,
        customer_id=customer.id,
        opportunity_id=data.opportunity_id,
        vehicle_id=data.vehicle_id,
        vehicle_price=data.vehicle_price,
        down_payment=data.down_payment,
        financed_amount=round(financed, 2),
        installments=data.installments,
        annual_rate=data.annual_rate,
        monthly_payment=round(_monthly_payment(financed, data.installments, data.annual_rate), 2),
        notes=data.notes,
        created_by=user.id,
    )
    db.add(scenario)
    customer.financing_interest = True
    audit.log(db, org.id, "financiacion_creada", "financing", scenario.id, user.id, {"cliente": customer.full_name})
    db.commit()
    db.refresh(scenario)
    return scenario


# ---------- Cotizaciones ----------

@router.get("/quotes", response_model=list[QuoteOut])
def list_quotes(db: DB, user: CurrentUser, org: CurrentOrg, customer_id: str | None = None):
    query = select(Quote).where(Quote.organization_id == org.id)
    if customer_id:
        query = query.where(Quote.customer_id == customer_id)
    return db.scalars(query.order_by(Quote.created_at.desc()).limit(200)).all()


@router.post("/quotes", response_model=QuoteOut, status_code=201)
def create_quote(data: QuoteCreate, db: DB, user: CurrentUser, org: CurrentOrg):
    customer = _get_customer(db, org, data.customer_id)
    vehicle = db.get(Vehicle, data.vehicle_id)
    if not vehicle or vehicle.organization_id != org.id or vehicle.deleted_at:
        raise not_found("vehículo", "VEHICLE_NOT_FOUND")
    total = data.price - data.discount - data.trade_in_value + data.expenses
    if total < 0:
        raise ApiError("INVALID_QUOTE", "El total no puede ser negativo", 400)
    number = (db.scalar(select(func.max(Quote.number)).where(Quote.organization_id == org.id)) or 0) + 1
    quote = Quote(
        organization_id=org.id,
        number=number,
        customer_id=customer.id,
        opportunity_id=data.opportunity_id,
        vehicle_id=vehicle.id,
        user_id=user.id,
        price=data.price,
        discount=data.discount,
        trade_in_value=data.trade_in_value,
        expenses=data.expenses,
        financing_scenario_id=data.financing_scenario_id,
        total=round(total, 2),
        notes=data.notes,
        valid_until=data.valid_until.replace(tzinfo=None) if data.valid_until else None,
        status="borrador",
    )
    db.add(quote)
    db.flush()
    audit.log(db, org.id, "cotizacion_creada", "quote", quote.id, user.id, {"numero": number, "cliente": customer.full_name})
    publish(
        db,
        DomainEvent(
            name="quote.created", organization_id=org.id, entity_type="customer",
            entity_id=customer.id, actor_user_id=user.id, data={"quote_id": quote.id},
        ),
    )
    db.commit()
    db.refresh(quote)
    return quote


@router.get("/quotes/{quote_id}", response_model=QuoteOut)
def get_quote(quote_id: str, db: DB, user: CurrentUser, org: CurrentOrg):
    quote = db.get(Quote, quote_id)
    if not quote or quote.organization_id != org.id:
        raise not_found("cotización", "QUOTE_NOT_FOUND")
    return quote


@router.patch("/quotes/{quote_id}", response_model=QuoteOut)
def update_quote(quote_id: str, data: QuoteUpdate, db: DB, user: CurrentUser, org: CurrentOrg):
    quote = db.get(Quote, quote_id)
    if not quote or quote.organization_id != org.id:
        raise not_found("cotización", "QUOTE_NOT_FOUND")
    updates = data.model_dump(exclude_unset=True)
    if updates.get("valid_until"):
        updates["valid_until"] = updates["valid_until"].replace(tzinfo=None)
    for field, value in updates.items():
        setattr(quote, field, value)
    quote.total = round(quote.price - quote.discount - quote.trade_in_value + quote.expenses, 2)
    db.commit()
    db.refresh(quote)
    return quote


@router.delete("/quotes/{quote_id}", response_model=Msg)
def delete_quote(quote_id: str, db: DB, user: CurrentUser, org: CurrentOrg):
    quote = db.get(Quote, quote_id)
    if not quote or quote.organization_id != org.id:
        raise not_found("cotización", "QUOTE_NOT_FOUND")
    if quote.status not in ("borrador", "vencida", "rechazada"):
        raise ApiError("QUOTE_PROTECTED", "Solo se pueden borrar cotizaciones en borrador, vencidas o rechazadas", 400)
    db.delete(quote)
    db.commit()
    return Msg(message="Cotización eliminada")
