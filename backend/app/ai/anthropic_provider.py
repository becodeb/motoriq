"""Provider nativo de Anthropic (Messages API)."""

import httpx

from app.ai.base import AIProvider, AIProviderError, AIResponse, ToolCall, ToolSpec

API_URL = "https://api.anthropic.com/v1/messages"
API_VERSION = "2023-06-01"


class AnthropicProvider(AIProvider):
    name = "anthropic"

    def chat(
        self,
        messages: list[dict],
        tools: list[ToolSpec] | None = None,
        max_tokens: int = 1024,
        temperature: float = 0.4,
    ) -> AIResponse:
        system_parts = [m["content"] for m in messages if m["role"] == "system"]
        payload: dict = {
            "model": self.model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": self._convert_messages(messages),
        }
        if system_parts:
            payload["system"] = "\n\n".join(system_parts)
        if tools:
            payload["tools"] = [
                {"name": t.name, "description": t.description, "input_schema": t.parameters} for t in tools
            ]

        try:
            response = httpx.post(
                self.base_url or API_URL,
                headers={
                    "x-api-key": self.api_key,
                    "anthropic-version": API_VERSION,
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=60,
            )
        except httpx.HTTPError as exc:
            raise AIProviderError(f"No se pudo conectar con Anthropic: {exc}") from exc

        if response.status_code >= 400:
            try:
                detail = response.json().get("error", {}).get("message", response.text[:200])
            except Exception:
                detail = response.text[:200]
            raise AIProviderError(f"Anthropic respondió {response.status_code}: {detail}", response.status_code)

        data = response.json()
        text_parts: list[str] = []
        tool_calls: list[ToolCall] = []
        for block in data.get("content", []):
            if block.get("type") == "text":
                text_parts.append(block["text"])
            elif block.get("type") == "tool_use":
                tool_calls.append(ToolCall(id=block["id"], name=block["name"], arguments=block.get("input") or {}))

        usage = data.get("usage", {})
        return AIResponse(
            text="\n".join(text_parts) if text_parts else None,
            tool_calls=tool_calls,
            input_tokens=usage.get("input_tokens", 0),
            output_tokens=usage.get("output_tokens", 0),
            raw_assistant_message=data.get("content", []),
        )

    def _convert_messages(self, messages: list[dict]) -> list[dict]:
        converted: list[dict] = []
        pending_tool_results: list[dict] = []
        for m in messages:
            if m["role"] == "system":
                continue
            if m["role"] == "tool":
                pending_tool_results.append(
                    {"type": "tool_result", "tool_use_id": m["tool_call_id"], "content": m["content"]}
                )
                continue
            if pending_tool_results:
                converted.append({"role": "user", "content": pending_tool_results})
                pending_tool_results = []
            if m["role"] == "assistant" and m.get("raw") is not None:
                converted.append({"role": "assistant", "content": m["raw"]})
            else:
                converted.append({"role": m["role"], "content": m["content"]})
        if pending_tool_results:
            converted.append({"role": "user", "content": pending_tool_results})
        return converted
