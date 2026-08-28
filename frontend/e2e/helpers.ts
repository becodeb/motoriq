import { expect, type Page } from "@playwright/test";

export const CREDENTIALS = { email: "gerente@motoriq.demo", password: "demo1234" };

export async function login(page: Page, email = CREDENTIALS.email) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(CREDENTIALS.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText(/Buen día|Buenas tardes|Buenas noches/)).toBeVisible({ timeout: 10_000 });
}

export function uniqueName(prefix: string): string {
  return `${prefix} E2E ${Date.now().toString(36)}`;
}
