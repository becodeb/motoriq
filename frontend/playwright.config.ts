import { defineConfig } from "@playwright/test";

/**
 * E2E contra los servidores de desarrollo ya corriendo:
 *   backend  → http://localhost:8000  (con datos seed)
 *   frontend → http://localhost:5180
 * Los tests crean sus propios registros (no dependen de nombres del seed).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://localhost:5180",
    trace: "retain-on-failure",
    locale: "es-AR",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
