import { expect, test } from "@playwright/test";

import { login, uniqueName } from "./helpers";

test("crear cliente, verlo en su perfil y agendar un seguimiento", async ({ page }) => {
  await login(page);
  const nombre = uniqueName("Clienta");

  await page.goto("/clientes");
  await page.getByRole("button", { name: "Nuevo cliente" }).click();
  await page.getByLabel(/^Nombre/).fill(nombre);
  await page.getByLabel(/^Apellido/).fill("Prueba");
  await page.getByLabel(/^Teléfono/).fill(`+54 9 11 ${Date.now() % 10_000_000}`);
  await page.getByRole("button", { name: "Crear cliente" }).click();

  // navega al perfil recién creado
  await expect(page.getByRole("heading", { name: `${nombre} Prueba` })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("PRÓXIMA MEJOR ACCIÓN", { exact: false })).toBeVisible();

  // seguimiento en 2-3 acciones (§89)
  await page.getByRole("button", { name: "Seguimiento" }).first().click();
  await page.getByRole("button", { name: "Crear seguimiento" }).click();
  await expect(page.getByText("Seguimiento creado")).toBeVisible();
});

test("registrar un mensaje del cliente recalcula el score", async ({ page }) => {
  await login(page);
  const nombre = uniqueName("Señal");

  await page.goto("/clientes");
  await page.getByRole("button", { name: "Nuevo cliente" }).click();
  await page.getByLabel(/^Nombre/).fill(nombre);
  await page.getByRole("button", { name: "Crear cliente" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(nombre) })).toBeVisible({ timeout: 10_000 });

  await page.getByRole("tab", { name: "Conversación" }).click();
  await page.getByRole("button", { name: "Mensaje del cliente" }).click();
  await page
    .getByPlaceholder(/Pegá acá lo que escribió/)
    .fill("Hola, ¿está disponible? ¿Qué financiación tienen?");
  await page.getByRole("button", { name: "Registrar mensaje" }).click();

  await expect(page.getByText("¿Qué financiación tienen?")).toBeVisible();
  // el ring de score del header refleja las señales (base 25 → sube)
  await page.getByRole("tab", { name: "Actividad" }).click();
  await expect(page.getByText(/Motor IQ subió la intención/).first()).toBeVisible({ timeout: 10_000 });
});
