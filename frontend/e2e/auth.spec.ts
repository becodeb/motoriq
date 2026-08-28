import { expect, test } from "@playwright/test";

import { CREDENTIALS, login } from "./helpers";

test("login inválido muestra el error sin salir de la pantalla", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(CREDENTIALS.email);
  await page.getByLabel("Contraseña").fill("clave-incorrecta");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Email o contraseña incorrectos")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("login válido lleva al centro de comando", async ({ page }) => {
  await login(page);
  await expect(page.getByText("Prioridades de Motor IQ")).toBeVisible();
  await expect(page.getByText("Agenda de hoy")).toBeVisible();
});

test("una ruta protegida sin sesión redirige a login", async ({ page }) => {
  await page.goto("/clientes");
  await expect(page).toHaveURL(/\/login/);
});
