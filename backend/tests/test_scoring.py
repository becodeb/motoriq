from tests.conftest import create_customer, create_vehicle


def _post_inbound(client, headers, customer_id: str, body: str) -> dict:
    conversation = client.post(
        "/api/v1/conversations", json={"customer_id": customer_id, "channel": "whatsapp"}, headers=headers
    ).json()
    response = client.post(
        f"/api/v1/conversations/{conversation['id']}/messages",
        json={"direction": "entrante", "body": body},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_senales_positivas_suman_y_quedan_explicadas(client, gerente_headers):
    customer = create_customer(client, gerente_headers)
    base_score = customer["lead_score"]

    _post_inbound(client, gerente_headers, customer["id"], "Hola, ¿está disponible? ¿Qué financiación tienen?")
    updated = client.get(f"/api/v1/customers/{customer['id']}", headers=gerente_headers).json()

    assert updated["lead_score"] > base_score
    labels = [f["label"] for f in updated["score_factors"]]
    assert "Preguntó por financiación" in labels
    assert "Consultó disponibilidad" in labels
    assert "Respondió en las últimas 24 horas" in labels
    assert updated["score_reason"]

    history = client.get(f"/api/v1/customers/{customer['id']}/score-history", headers=gerente_headers).json()
    assert history, "el cambio de score debe registrarse en el historial"
    assert history[0]["new_score"] == updated["lead_score"]


def test_senal_negativa_explicita(client, gerente_headers):
    customer = create_customer(client, gerente_headers)
    _post_inbound(client, gerente_headers, customer["id"], "La verdad por ahora solo miraba, gracias")
    updated = client.get(f"/api/v1/customers/{customer['id']}", headers=gerente_headers).json()
    labels = [f["label"] for f in updated["score_factors"]]
    assert "Expresó baja intención" in labels


def test_presupuesto_incompatible_penaliza(client, gerente_headers):
    vehicle = create_vehicle(client, gerente_headers, price=40000)
    customer = create_customer(
        client, gerente_headers, interested_vehicle_id=vehicle["id"], budget=10000
    )
    labels = [f["label"] for f in customer["score_factors"]]
    assert "Presupuesto por debajo del precio" in labels


def test_score_nunca_supera_99(client, gerente_headers):
    vehicle = create_vehicle(client, gerente_headers)
    customer = create_customer(client, gerente_headers, interested_vehicle_id=vehicle["id"], budget=25000)
    _post_inbound(
        client,
        gerente_headers,
        customer["id"],
        "Quiero reservarlo ya. ¿Puedo pasar a verlo hoy? Tengo financiación aprobada, "
        "llevo los documentos para la transferencia y arreglamos la entrega. ¿Ubicación?",
    )
    updated = client.get(f"/api/v1/customers/{customer['id']}", headers=gerente_headers).json()
    assert updated["lead_score"] <= 99
    assert updated["score_label"] in ("caliente", "cierre")


def test_clasificacion_por_umbrales():
    from app.core.constants import score_label_for

    assert score_label_for(10) == "frio"
    assert score_label_for(40) == "tibio"
    assert score_label_for(64) == "tibio"
    assert score_label_for(65) == "caliente"
    assert score_label_for(85) == "cierre"
