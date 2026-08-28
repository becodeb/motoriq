import { describe, expect, it } from "vitest";

import { cn, initials, normalizeText } from "./utils";

describe("cn", () => {
  it("mergea clases de tailwind resolviendo conflictos", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    const hidden = false as boolean;
    expect(cn("text-sm", hidden && "hidden", "font-bold")).toBe("text-sm font-bold");
  });
});

describe("initials", () => {
  it("toma las dos primeras palabras", () => {
    expect(initials("Juan Pérez")).toBe("JP");
    expect(initials("Sofía")).toBe("S");
    expect(initials("María del Carmen López")).toBe("MD");
  });
});

describe("normalizeText", () => {
  it("quita acentos y baja a minúsculas", () => {
    expect(normalizeText("Sebastián Íñiguez")).toBe("sebastian iniguez");
  });
});
