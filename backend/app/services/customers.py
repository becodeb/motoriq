"""Lógica de negocio de clientes: alta con detección de duplicados,
distribución de leads, fusión de registros y bajas."""

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.core.events import DomainEvent, publish
from app.core.utils import utcnow
from app.models import (
    Appointment,
    Conversation,
    Customer,
    CustomerNote,
    CustomerVehicleMatch,
    FinancingScenario,
    Followup,
    LeadScoreHistory,
    Message,
    Opportunity,
    Organization,
    PipelineStage,
    Quote,
    Tag,
    Task,
    TradeIn,
    User,
)
from app.schemas.customer import CustomerCreate
from app.services import audit, dedup, matching, scoring


def pick_seller(db: Session, org: Organization) -> str | None:
    """Distribución de leads (§34): round-robin o vendedor con menos leads activos."""
    sellers = db.scalars(
        select(User).where(
            User.organization_id == org.id,
            User.role == "vendedor",
            User.is_active.is_(True),
        ).order_by(User.created_at)
    ).all()
    if not sellers:
        return None

    if org.lead_distribution == "menos_leads":
        counts = dict(
            db.execute(
                select(Customer.assigned_user_id, func.count(Customer.id))
                .where(
                    Customer.organization_id == org.id,
                    Customer.status.in_(("lead", "activo")),
                    Customer.deleted_at.is_(None),
                )
                .group_by(Customer.assigned_user_id)
            ).all()
        )
        return min(sellers, key=lambda s: counts.get(s.id, 0)).id

    if org.lead_distribution == "round_robin":
        settings = dict(org.settings or {})
        last_index = settings.get("rr_last_index", -1)
        next_index = (last_index + 1) % len(sellers)
        settings["rr_last_index"] = next_index
        org.settings = settings
        return sellers[next_index].id

    return None  # manual


def create_customer(db: Session, org: Organization, actor: User, data: CustomerCreate) -> Customer:
    if not data.force:
        duplicates = dedup.find_duplicates(
            db, org.id, data.phone, data.email, data.first_name, data.last_name
        )
        if duplicates:
            first = duplicates[0]
            raise ApiError(
                "CUSTOMER_DUPLICATE",
                f"Podría tratarse de {first['full_name']} ya registrado ({first['matched_by']})",
                409,
            )

    assigned_id = data.assigned_user_id
    if not assigned_id:
        assigned_id = pick_seller(db, org) or (actor.id if actor.role == "vendedor" else None)

    customer = Customer(
        organization_id=org.id,
        created_by=actor.id,
        assigned_user_id=assigned_id,
        **data.model_dump(exclude={"tag_ids", "create_opportunity", "force", "assigned_user_id"}),
    )
    db.add(customer)
    db.flush()

    if data.tag_ids:
        set_tags(db, customer, data.tag_ids)

    if data.create_opportunity:
        first_stage = db.scalar(
            select(PipelineStage)
            .where(PipelineStage.organization_id == org.id, PipelineStage.is_active.is_(True))
            .order_by(PipelineStage.position)
        )
        if first_stage:
            db.add(
                Opportunity(
                    organization_id=org.id,
                    customer_id=customer.id,
                    vehicle_id=customer.interested_vehicle_id,
                    owner_user_id=assigned_id,
                    stage_id=first_stage.id,
                    probability=first_stage.probability,
                    source=customer.source,
                    expected_value=(
                        customer.interested_vehicle.price if customer.interested_vehicle else customer.budget
                    ),
                )
            )

    scoring.apply_score(db, customer)
    matching.run_matching_for_customer(db, customer)
    audit.log(db, org.id, "cliente_creado", "customer", customer.id, actor.id, {"nombre": customer.full_name})
    publish(
        db,
        DomainEvent(
            name="lead.created",
            organization_id=org.id,
            entity_type="customer",
            entity_id=customer.id,
            actor_user_id=actor.id,
            data={"source": customer.source, "assigned_user_id": assigned_id},
        ),
    )
    return customer


def set_tags(db: Session, customer: Customer, tag_ids: list[str]) -> None:
    tags = db.scalars(
        select(Tag).where(Tag.id.in_(tag_ids), Tag.organization_id == customer.organization_id)
    ).all()
    customer.tags = list(tags)


def merge_customers(db: Session, org: Organization, actor: User, target: Customer, source: Customer) -> Customer:
    """Fusiona `source` dentro de `target` (§80): mueve toda la actividad y desactiva el origen."""
    if source.id == target.id:
        raise ApiError("MERGE_INVALID", "No se puede fusionar un cliente consigo mismo", 400)

    for model, column in (
        (Conversation, Conversation.customer_id),
        (Message, Message.customer_id),
        (Followup, Followup.customer_id),
        (Task, Task.customer_id),
        (Appointment, Appointment.customer_id),
        (Opportunity, Opportunity.customer_id),
        (CustomerNote, CustomerNote.customer_id),
        (TradeIn, TradeIn.customer_id),
        (FinancingScenario, FinancingScenario.customer_id),
        (Quote, Quote.customer_id),
        (LeadScoreHistory, LeadScoreHistory.customer_id),
    ):
        db.execute(update(model).where(column == source.id).values(customer_id=target.id))

    # Matches: evitar violar la unicidad (customer, vehicle).
    target_vehicle_ids = set(
        db.scalars(select(CustomerVehicleMatch.vehicle_id).where(CustomerVehicleMatch.customer_id == target.id)).all()
    )
    source_matches = db.scalars(
        select(CustomerVehicleMatch).where(CustomerVehicleMatch.customer_id == source.id)
    ).all()
    for m in source_matches:
        if m.vehicle_id in target_vehicle_ids:
            db.delete(m)
        else:
            m.customer_id = target.id

    # Completar campos vacíos del destino con datos del origen.
    for field in (
        "phone", "whatsapp", "email", "budget", "interest_brand", "interest_model",
        "interest_body_type", "interest_year_min", "interest_year_max",
        "interest_transmission", "interest_fuel", "interested_vehicle_id", "notes",
    ):
        if getattr(target, field) in (None, "") and getattr(source, field) not in (None, ""):
            setattr(target, field, getattr(source, field))

    source.deleted_at = utcnow()
    source.status = "inactivo"
    db.flush()
    db.refresh(target)
    scoring.apply_score(db, target)
    audit.log(
        db, org.id, "clientes_fusionados", "customer", target.id, actor.id,
        {"origen": source.full_name, "origen_id": source.id},
    )
    return target
