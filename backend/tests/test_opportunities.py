from tests.conftest import create_customer, create_vehicle


def test_mover_etapa_registra_historial(client, org, gerente_headers):
    customer = create_customer(client, gerente_headers)
    opp = client.get(
        "/api/v1/opportunities", params={"customer_id": customer["id"]}, headers=gerente_headers
    ).json()["items"][0]

    moved = client.post(
        f"/api/v1/opportunities/{opp['id']}/move",
        json={"stage_id": org["stages"]["negociacion"]},
        headers=gerente_headers,
    )
    assert moved.status_code == 200
    assert moved.json()["stage"]["key"] == "negociacion"
    assert moved.json()["probability"] == 70

    history = client.get(f"/api/v1/opportunities/{opp['id']}/history", headers=gerente_headers).json()
    assert history[0]["to_stage"]["key"] == "negociacion"


def test_venta_marca_vehiculo_y_cliente(client, org, gerente_headers):
    vehicle = create_vehicle(client, gerente_headers, price=18000)
    customer = create_customer(client, gerente_headers, interested_vehicle_id=vehicle["id"])
    opp = client.get(
        "/api/v1/opportunities", params={"customer_id": customer["id"]}, headers=gerente_headers
    ).json()["items"][0]

    won = client.post(
        f"/api/v1/opportunities/{opp['id']}/move",
        json={"stage_id": org["stages"]["vendido"], "sold_price": 17500},
        headers=gerente_headers,
    )
    assert won.status_code == 200
    assert won.json()["status"] == "ganada"
    assert won.json()["expected_value"] == 17500

    sold_vehicle = client.get(f"/api/v1/vehicles/{vehicle['id']}", headers=gerente_headers).json()
    assert sold_vehicle["status"] == "vendido"
    assert sold_vehicle["sold_price"] == 17500

    buyer = client.get(f"/api/v1/customers/{customer['id']}", headers=gerente_headers).json()
    assert buyer["status"] == "cliente"


def test_perdida_requiere_motivo(client, org, gerente_headers):
    customer = create_customer(client, gerente_headers)
    opp = client.get(
        "/api/v1/opportunities", params={"customer_id": customer["id"]}, headers=gerente_headers
    ).json()["items"][0]

    sin_motivo = client.post(
        f"/api/v1/opportunities/{opp['id']}/move",
        json={"stage_id": org["stages"]["perdido"]},
        headers=gerente_headers,
    )
    assert sin_motivo.status_code == 400
    assert sin_motivo.json()["error"]["code"] == "LOST_REASON_REQUIRED"

    con_motivo = client.post(
        f"/api/v1/opportunities/{opp['id']}/move",
        json={"stage_id": org["stages"]["perdido"], "lost_reason": "Compró en otra agencia"},
        headers=gerente_headers,
    )
    assert con_motivo.status_code == 200
    assert con_motivo.json()["status"] == "perdida"

    lost_customer = client.get(f"/api/v1/customers/{customer['id']}", headers=gerente_headers).json()
    assert lost_customer["status"] == "perdido"
