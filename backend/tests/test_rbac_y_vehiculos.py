from tests.conftest import create_customer, create_vehicle


def test_datos_del_equipo_solo_para_gerencia(db, org):
    """La IA solo ofrece (y ejecuta) la consulta de equipo para admin/gerente."""
    from app.ai.tools import execute_tool, tool_specs_for
    from app.models import Organization, User

    organization = db.get(Organization, org["org_id"])
    admin = db.get(User, org["users"]["admin"][0]["id"])
    vendedor = db.get(User, org["users"]["vendedor"][0]["id"])

    assert any(t.name == "get_team" for t in tool_specs_for(admin))
    assert not any(t.name == "get_team" for t in tool_specs_for(vendedor))

    # Defensa en profundidad: aunque se invoque igual, un vendedor no recibe datos.
    result, _ = execute_tool(db, organization, vendedor, "get_team", {})
    assert "error" in result

    rows, _ = execute_tool(db, organization, admin, "get_team", {"query": "vito"})
    assert rows and rows[0]["apellido"] == "Test"
    assert "email" in rows[0] and "ventas_este_mes" in rows[0]


def test_respuestas_de_ia_salen_sin_markdown():
    from app.ai.service import sanitize_ai_text

    sucio = (
        "<think>razonando…</think>## Resumen\n"
        "**Lucas Fernández** tiene *2* seguimientos:\n"
        "| Cliente | Estado |\n|---|---|\n| Juan | vencido |\n"
        "* llamar hoy\n`fin`"
    )
    limpio = sanitize_ai_text(sucio)
    assert "**" not in limpio and "##" not in limpio and "`" not in limpio
    assert "<think>" not in limpio
    assert "|---|" not in limpio
    assert "Juan · vencido" in limpio  # la fila de tabla se convierte en línea legible
    assert "- llamar hoy" in limpio


def test_vendedor_no_gestiona_vehiculos(client, vendedor_headers):
    denied = client.post(
        "/api/v1/vehicles",
        json={"brand": "Fiat", "model": "Cronos", "year": 2022, "price": 15000},
        headers=vendedor_headers,
    )
    assert denied.status_code == 403


def test_vendedor_no_ve_costos(client, gerente_headers, vendedor_headers):
    vehicle = create_vehicle(client, gerente_headers, cost=19000)
    as_manager = client.get(f"/api/v1/vehicles/{vehicle['id']}", headers=gerente_headers).json()
    assert as_manager["cost"] == 19000

    as_seller = client.get(f"/api/v1/vehicles/{vehicle['id']}", headers=vendedor_headers).json()
    assert as_seller["cost"] is None


def test_auditoria_y_usage_solo_admin(client, admin_headers, vendedor_headers):
    assert client.get("/api/v1/audit", headers=vendedor_headers).status_code == 403
    assert client.get("/api/v1/audit", headers=admin_headers).status_code == 200
    assert client.get("/api/v1/ai/usage", headers=vendedor_headers).status_code == 403
    assert client.get("/api/v1/ai/usage", headers=admin_headers).status_code == 200


def test_analytics_vendedores_solo_gerencia(client, gerente_headers, vendedor_headers):
    assert client.get("/api/v1/analytics/sellers", headers=vendedor_headers).status_code == 403
    assert client.get("/api/v1/analytics/sellers", headers=gerente_headers).status_code == 200


def test_estadisticas_del_vehiculo(client, gerente_headers):
    vehicle = create_vehicle(client, gerente_headers, brand="Jeep", model="Renegade", body_type="suv")
    create_customer(client, gerente_headers, interested_vehicle_id=vehicle["id"])
    create_customer(client, gerente_headers, interested_vehicle_id=vehicle["id"])

    stats = client.get(f"/api/v1/vehicles/{vehicle['id']}/stats", headers=gerente_headers).json()
    assert stats["inquiries"] >= 2
    assert len(stats["interested_customers"]) >= 2
    assert stats["opportunities_count"] >= 2  # las oportunidades creadas junto al cliente


def test_cambio_de_estado_con_historial(client, gerente_headers):
    vehicle = create_vehicle(client, gerente_headers)
    changed = client.post(
        f"/api/v1/vehicles/{vehicle['id']}/status", json={"status": "reservado"}, headers=gerente_headers
    )
    assert changed.status_code == 200
    assert changed.json()["status"] == "reservado"

    history = client.get(f"/api/v1/vehicles/{vehicle['id']}/status-history", headers=gerente_headers).json()
    assert history[0]["to_status"] == "reservado"


def test_busqueda_global_sin_acentos(client, gerente_headers):
    create_customer(client, gerente_headers, first_name="Ramón", last_name="Íñiguez")
    found = client.get("/api/v1/search", params={"q": "ramon iniguez"}, headers=gerente_headers).json()
    assert any(r["title"] == "Ramón Íñiguez" for r in found["results"])
