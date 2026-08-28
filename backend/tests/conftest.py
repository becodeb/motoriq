import os
import uuid

# La configuración se resuelve al importar la app: fijar el entorno ANTES.
os.environ["POPS_DATABASE_URL"] = "sqlite:///./test_pops.db"
os.environ["POPS_TESTING"] = "1"
os.environ["POPS_SCHEDULER_ENABLED"] = "0"
os.environ["POPS_RATE_LIMIT_ENABLED"] = "0"
os.environ["POPS_DEMO_MODE"] = "1"

import contextlib

import pytest
from fastapi.testclient import TestClient

from app.core.constants import DEFAULT_PIPELINE_STAGES
from app.core.security import hash_password
from app.database.base import Base
from app.database.session import SessionLocal, engine
from app.main import app
from app.models import Organization, PipelineStage, User


@pytest.fixture(scope="session", autouse=True)
def _database():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
    engine.dispose()
    with contextlib.suppress(OSError):
        os.remove("test_pops.db")


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


PASSWORD = "clave-secreta-123"


def make_org(db) -> dict:
    """Org aislada con admin, gerente y dos vendedores. Devuelve ids y emails."""
    suffix = uuid.uuid4().hex[:8]
    org = Organization(name=f"Agencia {suffix}", currency="USD", lead_distribution="round_robin")
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
    users = {}
    for role, name in (("admin", "Ana"), ("gerente", "Gero"), ("vendedor", "Vito"), ("vendedor", "Vera")):
        email = f"{role}-{name.lower()}-{suffix}@pops-test.com"
        user = User(
            organization_id=org.id,
            email=email,
            password_hash=hash_password(PASSWORD),
            first_name=name,
            last_name="Test",
            role=role,
        )
        db.add(user)
        db.flush()
        users.setdefault(role, []).append({"id": user.id, "email": email})
    db.commit()
    stages = {
        s.key: s.id
        for s in db.query(PipelineStage).filter(PipelineStage.organization_id == org.id).all()
    }
    return {"org_id": org.id, "users": users, "stages": stages}


def login(client, email: str) -> dict:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def org(db):
    return make_org(db)


@pytest.fixture()
def admin_headers(client, org):
    return login(client, org["users"]["admin"][0]["email"])


@pytest.fixture()
def gerente_headers(client, org):
    return login(client, org["users"]["gerente"][0]["email"])


@pytest.fixture()
def vendedor_headers(client, org):
    return login(client, org["users"]["vendedor"][0]["email"])


def create_vehicle(client, headers, **overrides) -> dict:
    payload = {
        "brand": "Toyota",
        "model": "Corolla",
        "version": "XEI",
        "year": 2022,
        "km": 30000,
        "price": 23000,
        "cost": 20000,
        "body_type": "sedan",
        "transmission": "automatica",
        "fuel": "nafta",
        **overrides,
    }
    response = client.post("/api/v1/vehicles", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def create_customer(client, headers, **overrides) -> dict:
    payload = {"first_name": "Cliente", "last_name": uuid.uuid4().hex[:6], "source": "whatsapp", **overrides}
    response = client.post("/api/v1/customers", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()
