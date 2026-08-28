import { expect, test } from "@playwright/test";

import { login, uniqueName } from "./helpers";

test("crear vehículo, oportunidad, moverla por el pipeline y registrar la venta", async ({ page }) => {
  await login(page);

  // 1) vehículo nuevo (gerencia)
  const modelo = uniqueName("Modelo");
  await page.goto("/vehiculos");
  await page.getByRole("button", { name: "Nuevo vehículo" }).click();
  const vehicleDialog = page.getByRole("dialog");
  await vehicleDialog.getByLabel(/^Marca/).fill("MarcaE2E");
  await vehicleDialog.getByLabel(/^Modelo/).fill(modelo);
  await vehicleDialog.getByLabel(/^Año/).fill("2021");
  await vehicleDialog.getByLabel(/^Precio/).fill("15000");
  await vehicleDialog.getByRole("button", { name: "Ingresar vehículo" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(modelo) })).toBeVisible({ timeout: 10_000 });

  // 2) cliente interesado (la oportunidad inicial se crea sola)
  const nombre = uniqueName("Comprador");
  await page.goto("/clientes");
  await page.getByRole("button", { name: "Nuevo cliente" }).click();
  const customerDialog = page.getByRole("dialog");
  await customerDialog.getByLabel(/^Nombre/).fill(nombre);
  await customerDialog.getByRole("combobox", { name: /Elegir vehículo/ }).click();
  await page.getByPlaceholder(/Buscar por marca/).fill(modelo);
  await page.getByRole("option", { name: new RegExp(modelo) }).first().click();
  await customerDialog.getByRole("button", { name: "Crear cliente" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(nombre) })).toBeVisible({ timeout: 10_000 });

  // 3) mover la oportunidad a Negociación
  await page.getByRole("tab", { name: "Oportunidades" }).click();
  await page.getByRole("combobox").filter({ hasText: "Nuevo lead" }).click();
  await page.getByRole("option", { name: "Negociación" }).click();
  await expect(page.getByText("Movida a Negociación")).toBeVisible();

  // 4) registrar la venta (diálogo de precio final §96)
  await page.getByRole("combobox").filter({ hasText: "Negociación" }).click();
  await page.getByRole("option", { name: "Vendido", exact: true }).click();
  await expect(page.getByRole("heading", { name: "🎉 Registrar venta" })).toBeVisible();
  await page.getByRole("button", { name: "Confirmar venta" }).click();

  await expect(page.getByText(/Venta registrada/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Cliente", { exact: true }).first()).toBeVisible();
});
