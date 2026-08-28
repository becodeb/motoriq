from tests.conftest import PASSWORD


def test_login_ok_y_me(client, org):
    email = org["users"]["admin"][0]["email"]
    response = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200
    data = response.json()
    assert data["user"]["email"] == email
    assert data["access_token"]
    # cookie de refresh emitida
    assert "pops_refresh" in response.cookies

    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {data['access_token']}"})
    assert me.status_code == 200
    assert me.json()["role"] == "admin"


def test_login_credenciales_invalidas(client, org):
    email = org["users"]["admin"][0]["email"]
    response = client.post("/api/v1/auth/login", json={"email": email, "password": "incorrecta1"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_refresh_y_logout(client, org):
    email = org["users"]["gerente"][0]["email"]
    login_response = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    headers = {"Authorization": f"Bearer {login_response.json()['access_token']}"}

    refreshed = client.post("/api/v1/auth/refresh")
    assert refreshed.status_code == 200
    assert refreshed.json()["access_token"]

    logout = client.post("/api/v1/auth/logout", headers=headers)
    assert logout.status_code == 200

    # el refresh anterior quedó invalidado por token_version
    stale = client.post("/api/v1/auth/refresh")
    assert stale.status_code == 401
    client.cookies.clear()


def test_flujo_recuperacion_contrasena(client, org):
    email = org["users"]["vendedor"][1]["email"]
    forgot = client.post("/api/v1/auth/forgot-password", json={"email": email})
    assert forgot.status_code == 200
    token = forgot.json()["dev_reset_token"]
    assert token  # demo_mode

    reset = client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": "nueva-clave-99"})
    assert reset.status_code == 200

    ok = client.post("/api/v1/auth/login", json={"email": email, "password": "nueva-clave-99"})
    assert ok.status_code == 200
    client.cookies.clear()


def test_endpoint_protegido_sin_token(client):
    response = client.get("/api/v1/customers")
    assert response.status_code == 401
