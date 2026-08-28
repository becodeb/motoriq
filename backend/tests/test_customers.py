from tests.conftest import create_customer, create_vehicle


def test_crear_cliente_asigna_round_robin_y_crea_oportunidad(client, org, gerente_headers):
    c1 = create_customer(client, gerente_headers)
    c2 = create_customer(client, gerente_headers)
    sellers = {u["id"] for u in org["users"]["vendedor"]}
    assert c1["assigned_user"]["id"] in sellers
    assert c2["assigned_user"]["id"] in sellers
    assert c1["assigned_user"]["id"] != c2["assigned_user"]["id"]  # rotó

    opps = client.get("/api/v1/opportunities", params={"customer_id": c1["id"]}, headers=gerente_headers)
    assert opps.json()["total"] == 1
    assert opps.json()["items"][0]["stage"]["key"] == "nuevo"


def test_deteccion_de_duplicados(client, gerente_headers):
    original = create_customer(client, gerente_headers, phone="+54 9 11 5555-1234")
    duplicate = client.post(
        "/api/v1/customers",
        json={"first_name": "Otro", "last_name": "Nombre", "phone": "+549 11 5555 1234"},
        headers=gerente_headers,
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "CUSTOMER_DUPLICATE"

    forced = client.post(
        "/api/v1/customers",
        json={"first_name": "Otro", "last_name": "Nombre", "phone": "+549 11 5555 1234", "force": True},
        headers=gerente_headers,
    )
    assert forced.status_code == 201
    assert forced.json()["id"] != original["id"]


def test_filtros_de_lista(client, gerente_headers):
    create_customer(client, gerente_headers, first_name="Zoila", last_name="Búsqueda", status="lead")
    response = client.get("/api/v1/customers", params={"q": "zoila"}, headers=gerente_headers)
    assert response.status_code == 200
    assert any(c["first_name"] == "Zoila" for c in response.json()["items"])

    vacio = client.get("/api/v1/customers", params={"q": "inexistente-xyz"}, headers=gerente_headers)
    assert vacio.json()["total"] == 0


def test_soft_delete_solo_gerencia(client, org, gerente_headers, vendedor_headers):
    customer = create_customer(client, gerente_headers)
    denied = client.delete(f"/api/v1/customers/{customer['id']}", headers=vendedor_headers)
    assert denied.status_code == 403

    ok = client.delete(f"/api/v1/customers/{customer['id']}", headers=gerente_headers)
    assert ok.status_code == 200

    gone = client.get(f"/api/v1/customers/{customer['id']}", headers=gerente_headers)
    assert gone.status_code == 404


def test_notas_del_cliente(client, gerente_headers):
    customer = create_customer(client, gerente_headers)
    created = client.post(
        f"/api/v1/customers/{customer['id']}/notes",
        json={"body": "Prefiere que lo llamen a la tarde", "pinned": True},
        headers=gerente_headers,
    )
    assert created.status_code == 201
    notes = client.get(f"/api/v1/customers/{customer['id']}/notes", headers=gerente_headers)
    assert len(notes.json()) == 1
    assert notes.json()[0]["pinned"] is True


def test_fusion_de_duplicados(client, gerente_headers):
    target = create_customer(client, gerente_headers, phone="+54 11 4000-0001")
    source = create_customer(client, gerente_headers, email="fusion@pops-test.com", force=True)

    merged = client.post(
        f"/api/v1/customers/{target['id']}/merge",
        json={"source_customer_id": source["id"]},
        headers=gerente_headers,
    )
    assert merged.status_code == 200
    assert merged.json()["email"] == "fusion@pops-test.com"  # completó el campo vacío

    gone = client.get(f"/api/v1/customers/{source['id']}", headers=gerente_headers)
    assert gone.status_code == 404


def test_aislamiento_entre_organizaciones(client, db, gerente_headers):
    from tests.conftest import login, make_org

    customer = create_customer(client, gerente_headers)
    other_org = make_org(db)
    other_headers = login(client, other_org["users"]["gerente"][0]["email"])
    response = client.get(f"/api/v1/customers/{customer['id']}", headers=other_headers)
    assert response.status_code == 404


def test_matching_al_definir_interes(client, gerente_headers):
    vehicle = create_vehicle(client, gerente_headers, brand="Honda", model="HR-V", body_type="suv", price=21000)
    customer = create_customer(
        client, gerente_headers, interest_brand="Honda", interest_model="HR-V", budget=22000
    )
    recommended = client.get(
        f"/api/v1/customers/{customer['id']}/recommended-vehicles", headers=gerente_headers
    )
    assert recommended.status_code == 200
    ids = [r["vehicle"]["id"] for r in recommended.json()]
    assert vehicle["id"] in ids
    top = recommended.json()[0]
    assert top["score"] >= 45
    assert any("Honda" in reason for reason in top["reasons"])
