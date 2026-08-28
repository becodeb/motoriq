import { beforeAll, describe, expect, it } from "vitest";

import { configureFormat, dateShort, isoToLocalInput, money, num, relative, timeOnly } from "./format";

beforeAll(() => {
  configureFormat({ locale: "es-AR", currency: "USD", timezone: "America/Argentina/Buenos_Aires" });
});

describe("money", () => {
  it("formatea moneda de la organización sin decimales", () => {
    expect(money(23500)).toMatch(/US\$\s?23\.500/);
  });
  it("devuelve guion para null", () => {
    expect(money(null)).toBe("—");
  });
  it("compacta montos grandes cuando se pide", () => {
    expect(money(925_100, true)).toMatch(/925/);
  });
});

describe("num", () => {
  it("usa separador de miles local", () => {
    expect(num(68000)).toBe("68.000");
  });
});

describe("fechas", () => {
  it("convierte ISO UTC a la zona de la organización (UTC-3)", () => {
    // 13:00 UTC = 10:00 en Buenos Aires
    expect(timeOnly("2026-08-27T13:00:00Z")).toBe("10:00");
  });
  it("dateShort maneja null", () => {
    expect(dateShort(null)).toBe("—");
  });
  it("relative describe pasado y futuro", () => {
    const past = new Date(Date.now() - 3 * 3600_000).toISOString();
    const future = new Date(Date.now() + 2 * 3600_000).toISOString();
    expect(relative(past)).toBe("hace 3 h");
    expect(relative(future)).toMatch(/^en /);
  });
  it("isoToLocalInput produce formato datetime-local", () => {
    expect(isoToLocalInput("2026-08-27T13:00:00Z")).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});
