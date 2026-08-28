from tests.conftest import create_customer, create_vehicle


def test_overview_refleja_actividad(client, org, gerente_headers):
    vehicle = create_vehicle(client, gerente_headers, price=20000)
    customer = create_customer(client, gerente_headers, interested_vehicle_id=vehicle["id"])
    opp = client.get(
        "/api/v1/opportunities", params={"customer_id": customer["id"]}, headers=gerente_headers
    ).json()["items"][0]
    client.post(
        f"/api/v1/opportunities/{opp['id']}/move",
        json={"stage_id": org["stages"]["vendido"], "sold_price": 19500},
        headers=gerente_headers,
    )

    overview = client.get("/api/v1/analytics/overview", params={"range": "hoy"}, headers=gerente_headers)
    assert overview.status_code == 200
    data = overview.json()
    assert data["leads"]["value"] >= 1
    assert data["sales"]["value"] >= 1
    assert data["revenue"]["value"] >= 19500


def test_funnel_y_forecast(client, gerente_headers):
    create_customer(client, gerente_headers)
    funnel = client.get("/api/v1/analytics/funnel", headers=gerente_headers)
    assert funnel.status_code == 200
    assert funnel.json()["stages"][0]["key"] == "nuevo"

    forecast = client.get("/api/v1/analytics/forecast", headers=gerente_headers)
    assert forecast.status_code == 200
    assert "estimación" in forecast.json()["disclaimer"]


def test_dashboard_y_radar(client, gerente_headers):
    create_customer(client, gerente_headers)
    dashboard = client.get("/api/v1/dashboard", headers=gerente_headers)
    assert dashboard.status_code == 200
    counts = dashboard.json()["counts"]
    assert counts["new_leads_today"] >= 1

    radar = client.get("/api/v1/intelligence/radar", headers=gerente_headers)
    assert radar.status_code == 200
    assert set(radar.json().keys()) >= {
        "hot_customers",
        "urgent_followups",
        "ghosted_customers",
        "high_demand_vehicles",
        "stale_vehicles",
        "new_matches",
        "probable_closes",
    }


def test_nba_responde_para_cliente(client, gerente_headers):
    customer = create_customer(client, gerente_headers)
    nba = client.get(f"/api/v1/customers/{customer['id']}/next-best-action", headers=gerente_headers)
    assert nba.status_code == 200
    data = nba.json()
    assert data["label"] and data["reason"]
    assert data["urgency"] in ("baja", "media", "alta")


def test_simulador_de_financiacion(client, gerente_headers):
    ok = client.post(
        "/api/v1/financing/simulate",
        json={"vehicle_price": 20000, "down_payment": 8000, "installments": 24, "annual_rate": 40},
        headers=gerente_headers,
    )
    assert ok.status_code == 200
    data = ok.json()
    assert data["financed_amount"] == 12000
    assert data["monthly_payment"] > 500  # cuota francesa con interés
    assert data["total_interest"] > 0

    invalido = client.post(
        "/api/v1/financing/simulate",
        json={"vehicle_price": 10000, "down_payment": 12000, "installments": 12, "annual_rate": 40},
        headers=gerente_headers,
    )
    assert invalido.status_code == 400
