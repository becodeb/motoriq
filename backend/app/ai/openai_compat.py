"""Provider para APIs compatibles con OpenAI Chat Completions.

Cubre OpenAI, Gemini (endpoint compatible), Ollama y cualquier servidor
compatible configurando base_url.
"""

import json

import httpx

from app.ai.base import AIProvider, AIProviderError, AIResponse, ToolCall, ToolSpec

DEFAULT_BASE_URLS = {
    "openai": "https://api.openai.com/v1",
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai",
}


class OpenAICompatProvider(AIProvider):
    name = "openai_compat"

    def __init__(self, api_key: str, model: str, base_url: str | None = None, provider_key: str = "openai") -> None:
        super().__init__(api_key, model, base_url or DEFAULT_BASE_URLS.get(provider_key, DEFAULT_BASE_URLS["openai"]))
        self.name = provider_key

    def chat(
        self,
        messages: list[dict],
        tools: list[ToolSpec] | None = None,
        max_tokens: int = 1024,
        temperature: float = 0.4,
    ) -> AIResponse:
        payload: dict = {
            "model": self.model,
            "messages": self._convert_messages(messages),
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if tools:
            payload["tools"] = [
                {
                    "type": "function",
                    "function": {"name": t.name, "description": t.description, "parameters": t.parameters},
                }
                for t in tools
            ]

        try:
            response = httpx.post(
                f"{self.base_url.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                json=payload,
                timeout=60,
            )
        except httpx.HTTPError as exc:
            raise AIProviderError(f"No se pudo conectar con el proveedor de IA: {exc}") from exc

        if response.status_code >= 400:
            detail = _extract_error(response)
            raise AIProviderError(f"El proveedor respondió {response.status_code}: {detail}", response.status_code)

        data = response.json()
        choice = (data.get("choices") or [{}])[0]
        message = choice.get("message", {})
        usage = data.get("usage", {})

        tool_calls = []
        for call in message.get("tool_calls") or []:
            try:
                arguments = json.loads(call["function"].get("arguments") or "{}")
            except json.JSONDecodeError:
                arguments = {}
            tool_calls.append(ToolCall(id=call.get("id", ""), name=call["function"]["name"], arguments=arguments))

        return AIResponse(
            text=message.get("content"),
            tool_calls=tool_calls,
            input_tokens=usage.get("prompt_tokens", 0),
            output_tokens=usage.get("completion_tokens", 0),
            raw_assistant_message=message,
        )

    def _convert_messages(self, messages: list[dict]) -> list[dict]:
        converted = []
        for m in messages:
            if m["role"] == "assistant" and m.get("raw"):
                converted.append(m["raw"])  # mensaje del propio provider con tool_calls
            elif m["role"] == "tool":
                converted.append({"role": "tool", "tool_call_id": m["tool_call_id"], "content": m["content"]})
            else:
                converted.append({"role": m["role"], "content": m["content"]})
        return converted


def _extract_error(response: httpx.Response) -> str:
    try:
        data = response.json()
        if isinstance(data.get("error"), dict):
            return data["error"].get("message", response.text[:200])
        return str(data)[:200]
    except Exception:
        return response.text[:200]
