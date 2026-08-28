"""Capa de proveedores de IA desacoplada (§3, §55).

Formato canónico de mensajes (estilo OpenAI):
  {"role": "system" | "user" | "assistant", "content": str}
  {"role": "assistant", "tool_calls": [{"id", "name", "arguments": dict}]}
  {"role": "tool", "tool_call_id": str, "content": str}
Cada provider traduce a su protocolo.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ToolSpec:
    name: str
    description: str
    parameters: dict[str, Any]  # JSON Schema


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class AIResponse:
    text: str | None
    tool_calls: list[ToolCall] = field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0
    raw_assistant_message: Any = None  # para re-inyectar en el historial del provider


class AIProviderError(Exception):
    def __init__(self, message: str, status_code: int | None = None) -> None:
        self.status_code = status_code
        super().__init__(message)


class AIProvider(ABC):
    name: str = "base"

    def __init__(self, api_key: str, model: str, base_url: str | None = None) -> None:
        self.api_key = api_key
        self.model = model
        self.base_url = base_url

    @abstractmethod
    def chat(
        self,
        messages: list[dict],
        tools: list[ToolSpec] | None = None,
        max_tokens: int = 1024,
        temperature: float = 0.4,
    ) -> AIResponse: ...


# Costos aproximados por millón de tokens (entrada, salida) — para el panel de costos.
# Son estimaciones para control interno, no facturación.
MODEL_COSTS_PER_MTOK: dict[str, tuple[float, float]] = {
    "gpt-5": (1.25, 10.0),
    "gpt-5-mini": (0.25, 2.0),
    "gpt-4o": (2.5, 10.0),
    "gpt-4o-mini": (0.15, 0.6),
    "gpt-4.1": (2.0, 8.0),
    "claude-fable-5": (25.0, 125.0),
    "claude-opus": (15.0, 75.0),
    "claude-sonnet": (3.0, 15.0),
    "claude-haiku": (0.8, 4.0),
    "gemini-2.5-pro": (1.25, 10.0),
    "gemini-2.5-flash": (0.3, 2.5),
    "gemini-2.0-flash": (0.1, 0.4),
    "minimaxai/minimax": (0.3, 1.2),
}
DEFAULT_COST = (1.0, 4.0)


def estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    model_lower = (model or "").lower()
    costs = DEFAULT_COST
    for prefix, prices in MODEL_COSTS_PER_MTOK.items():
        if model_lower.startswith(prefix):
            costs = prices
            break
    return round(input_tokens / 1_000_000 * costs[0] + output_tokens / 1_000_000 * costs[1], 6)
