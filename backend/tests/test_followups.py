from datetime import timedelta

from app.core.utils import utcnow
from tests.conftest import create_customer


def _iso(dt) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def test_crear_y_completar_actualiza_proximo_seguimiento(client, gerente_headers):
    customer = create_customer(client, gerente_headers)
    due = utcnow() + timedelta(days=2)

    created = client.post(
        "/api/v1/followups",
        json={"customer_id": customer["id"], "due_at": _iso(due), "type": "llamada", "note": "Llamar"},
        headers=gerente_headers,
    )
    assert created.status_code == 201

    with_next = client.get(f"/api/v1/customers/{customer['id']}", headers=gerente_headers).json()
    assert with_next["next_followup_at"] is not None

    done = client.post(
        f"/api/v1/followups/{created.json()['id']}/complete", headers=gerente_headers
    )
    assert done.status_code == 200
    assert done.json()["status"] == "completado"

    cleared = client.get(f"/api/v1/customers/{customer['id']}", headers=gerente_headers).json()
    assert cleared["next_followup_at"] is None


def test_vencidos_en_vista(client, gerente_headers):
    customer = create_customer(client, gerente_headers)
    past = utcnow() - timedelta(days=1)
    client.post(
        "/api/v1/followups",
        json={"customer_id": customer["id"], "due_at": _iso(past), "type": "whatsapp"},
        headers=gerente_headers,
    )
    overdue = client.get("/api/v1/followups", params={"view": "vencidos"}, headers=gerente_headers).json()
    match = [f for f in overdue["items"] if f["customer"]["id"] == customer["id"]]
    assert match and match[0]["is_overdue"] is True


def test_deteccion_temporal_crea_sugerido_y_se_acepta(client, gerente_headers):
    customer = create_customer(client, gerente_headers)
    conversation = client.post(
        "/api/v1/conversations", json={"customer_id": customer["id"]}, headers=gerente_headers
    ).json()

    response = client.post(
        f"/api/v1/conversations/{conversation['id']}/messages",
        json={"direction": "entrante", "body": "Todo bien, escribime la semana que viene y lo vemos"},
        headers=gerente_headers,
    ).json()

    assert "suggested_followup" in response, "debe detectar la intención temporal (§16)"
    suggested_id = response["suggested_followup"]["id"]
    assert "la semana que viene" in (response["suggested_followup"]["reason"] or "")

    accepted = client.post(f"/api/v1/followups/{suggested_id}/accept", headers=gerente_headers)
    assert accepted.status_code == 200
    assert accepted.json()["status"] == "pendiente"


def test_descartar_sugerido(client, gerente_headers):
    customer = create_customer(client, gerente_headers)
    conversation = client.post(
        "/api/v1/conversations", json={"customer_id": customer["id"]}, headers=gerente_headers
    ).json()
    response = client.post(
        f"/api/v1/conversations/{conversation['id']}/messages",
        json={"direction": "entrante", "body": "Hablame en 3 dias"},
        headers=gerente_headers,
    ).json()
    suggested_id = response["suggested_followup"]["id"]
    discarded = client.post(f"/api/v1/followups/{suggested_id}/discard", headers=gerente_headers)
    assert discarded.status_code == 200
