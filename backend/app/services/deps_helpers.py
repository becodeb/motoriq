"""Queries base reutilizadas entre servicios."""

from sqlalchemy import Select, select

from app.models import Customer


def active_customers_query(organization_id: str) -> Select:
    return select(Customer).where(
        Customer.organization_id == organization_id,
        Customer.deleted_at.is_(None),
        Customer.status.in_(("lead", "activo")),
    )
