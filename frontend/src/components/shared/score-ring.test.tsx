import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ScoreRing, ScoreRingExplained } from "./score-ring";

describe("ScoreRing", () => {
  it("muestra el número y un aria-label descriptivo", () => {
    render(<ScoreRing score={82} label="caliente" />);
    expect(screen.getByText("82")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Score 82.*Caliente/ })).toBeInTheDocument();
  });

  it("acepta los cuatro niveles de clasificación", () => {
    for (const label of ["frio", "tibio", "caliente", "cierre"]) {
      const { unmount } = render(<ScoreRing score={50} label={label} />);
      unmount();
    }
  });
});

describe("ScoreRingExplained", () => {
  it("expone el disparador '¿Por qué N?' para la explicabilidad (§95)", () => {
    render(
      <ScoreRingExplained
        score={82}
        label="caliente"
        reason="Preguntó por financiación"
        factors={[
          { label: "Base", points: 25 },
          { label: "Preguntó por financiación", points: 15 },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "¿Por qué 82?" })).toBeInTheDocument();
  });
});
