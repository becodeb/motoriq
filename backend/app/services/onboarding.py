"""Alta de organizaciones: una agencia nueva arranca vacía pero lista para operar.

Crea la organización con su configuración base — etapas del pipeline, etiquetas y
automatizaciones recomendadas — sin ningún dato comercial (clientes, stock, ventas).
Lo usan el registro público (`POST /auth/register`) y el seed.
"""

from sqlalchemy.orm import Session

from app.core.constants import DEFAULT_PIPELINE_STAGES
from app.models import Automation, Organization, PipelineStage, Tag

DEFAULT_TAGS = (
    ("SUV", "blue"),
    ("Financiación", "violet"),
    ("Permuta", "amber"),
    ("Urgente", "red"),
    ("Cliente anterior", "emerald"),
    ("Empresa", "zinc"),
    ("Alta intención", "orange"),
)

DEFAULT_AUTOMATIONS = (
    (
        "Asignar leads nuevos",
        "Cuando entra un lead sin vendedor, lo asigna por round-robin y avisa.",
        "lead.created",
        [{"field": "sin_vendedor"}],
        [{"type": "assign_round_robin"}],
    ),
    (
        "Rescatar clientes calientes inactivos",
        "Si un cliente con score alto queda 72 h sin actividad, crea una tarea urgente.",
        "inactivity.72h",
        [{"field": "score", "op": "gt", "value": 60}],
        [{"type": "create_task", "params": {"title": "Rescatar a {nombre} — 72 h sin actividad", "priority": "alta", "due_in_hours": 6}}],
    ),
    (
        "Matching de ingresos nuevos",
        "Cuando ingresa un vehículo, busca clientes compatibles y notifica a los vendedores.",
        "vehicle.created",
        [],
        [{"type": "run_matching"}],
    ),
)


def create_organization(
    db: Session,
    *,
    name: str,
    currency: str = "USD",
    locale: str = "es-AR",
    timezone: str = "America/Argentina/Buenos_Aires",
) -> Organization:
    """Crea la org con su configuración inicial. No hace commit."""
    org = Organization(
        name=name,
        currency=currency,
        locale=locale,
        timezone=timezone,
        lead_distribution="round_robin",
    )
    db.add(org)
    db.flush()

    for position, spec in enumerate(DEFAULT_PIPELINE_STAGES):
        db.add(
            PipelineStage(
                organization_id=org.id,
                key=spec["key"],
                name=spec["name"],
                position=position,
                color=spec["color"],
                probability=spec["probability"],
                is_won=spec.get("is_won", False),
                is_lost=spec.get("is_lost", False),
            )
        )
    for tag_name, color in DEFAULT_TAGS:
        db.add(Tag(organization_id=org.id, name=tag_name, color=color))
    for auto_name, description, trigger, conditions, actions in DEFAULT_AUTOMATIONS:
        db.add(
            Automation(
                organization_id=org.id, name=auto_name, description=description,
                trigger=trigger, conditions=conditions, actions=actions, enabled=True,
            )
        )
    db.flush()
    return org
