"""Orquestación de IA: resolución de provider, loop de tools, features y costos."""

import json
import logging
import re
import time
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai import prompts
from app.ai.anthropic_provider import AnthropicProvider
from app.ai.base import AIProvider, AIProviderError, AIResponse, estimate_cost
from app.ai.openai_compat import OpenAICompatProvider
from app.ai.tools import execute_tool, tool_specs_for
from app.core.config import get_settings
from app.core.errors import ApiError
from app.core.utils import utcnow
from app.models import AIUsage, Conversation, Customer, Message, Organization, User

logger = logging.getLogger("pops.ai")

MAX_TOOL_ROUNDS = 6

# ---------- Saneo de texto generado ----------
# La UI muestra texto plano y el usuario es un vendedor: se eliminan artefactos
# de markdown y bloques de razonamiento aunque el modelo desobedezca el prompt.

_THINK_BLOCK = re.compile(r"<think>.*?</think>\s*", re.DOTALL | re.IGNORECASE)
_TABLE_SEPARATOR = re.compile(r"^\s*\|?[\s:|-]+\|?\s*$")


def sanitize_ai_text(text: str) -> str:
    text = _THINK_BLOCK.sub("", text)
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)  # encabezados
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text, flags=re.DOTALL)  # negritas
    text = re.sub(r"__(.+?)__", r"\1", text, flags=re.DOTALL)
    text = re.sub(r"^(\s*)\*\s+", r"\1- ", text, flags=re.MULTILINE)  # viñetas con *
    text = re.sub(r"(?<![\w*])\*([^*\n]+?)\*(?![\w*])", r"\1", text)  # itálicas sueltas
    text = text.replace("`", "")

    lines: list[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        if "|" in stripped and _TABLE_SEPARATOR.fullmatch(stripped):
            continue  # fila separadora de tabla markdown
        if stripped.startswith("|") and stripped.endswith("|") and stripped.count("|") >= 2:
            cells = [c.strip() for c in stripped.strip("|").split("|") if c.strip()]
            lines.append("- " + " · ".join(cells))
        else:
            lines.append(line)
    text = "\n".join(lines)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def resolve_config(org: Organization) -> dict | None:
    """Config de org primero; si no hay, variables de entorno."""
    if org.ai_provider and org.ai_api_key:
        return {
            "provider": org.ai_provider,
            "api_key": org.ai_api_key,
            "model": org.ai_model or _default_model(org.ai_provider),
            "base_url": org.ai_base_url,
            "source": "organizacion",
        }
    settings = get_settings()
    if settings.ai_provider and settings.ai_api_key:
        return {
            "provider": settings.ai_provider,
            "api_key": settings.ai_api_key,
            "model": settings.ai_model or _default_model(settings.ai_provider),
            "base_url": settings.ai_base_url,
            "source": "entorno",
        }
    return None


def _default_model(provider: str) -> str:
    return {
        "openai": "gpt-4o-mini",
        "anthropic": "claude-haiku-4-5-20251001",
        "gemini": "gemini-2.5-flash",
        "openai_compat": "gpt-4o-mini",
    }.get(provider, "gpt-4o-mini")


def get_status(org: Organization) -> dict:
    config = resolve_config(org)
    return {
        "configured": config is not None,
        "provider": config["provider"] if config else None,
        "model": config["model"] if config else None,
        "allow_ai_processing": org.allow_ai_processing,
        "source": config["source"] if config else None,
    }


def build_provider(config: dict) -> AIProvider:
    provider_key = config["provider"]
    if provider_key == "anthropic":
        return AnthropicProvider(config["api_key"], config["model"], config.get("base_url"))
    return OpenAICompatProvider(
        config["api_key"], config["model"], config.get("base_url"), provider_key=provider_key
    )


def _require_ai(db: Session, org: Organization) -> tuple[AIProvider, dict]:
    if not org.allow_ai_processing:
        raise ApiError("AI_DISABLED", "El procesamiento con IA está desactivado en la configuración", 400)
    config = resolve_config(org)
    if not config:
        raise ApiError(
            "AI_NOT_CONFIGURED",
            "Configurá un proveedor de IA en Configuración → IA para usar esta función",
            400,
        )
    if org.ai_monthly_limit_usd:
        month_start = utcnow().replace(day=1, hour=0, minute=0, second=0)
        spent = db.scalar(
            select(func.coalesce(func.sum(AIUsage.estimated_cost), 0)).where(
                AIUsage.organization_id == org.id, AIUsage.created_at >= month_start
            )
        ) or 0
        if spent >= org.ai_monthly_limit_usd:
            raise ApiError(
                "AI_LIMIT_REACHED",
                f"Se alcanzó el límite mensual de IA (US$ {org.ai_monthly_limit_usd:.2f})",
                400,
            )
    return build_provider(config), config


def _log_usage(
    db: Session,
    org: Organization,
    user: User | None,
    config: dict,
    feature: str,
    response: AIResponse,
    latency_ms: int,
) -> None:
    db.add(
        AIUsage(
            organization_id=org.id,
            user_id=user.id if user else None,
            provider=config["provider"],
            model=config["model"],
            feature=feature,
            input_tokens=response.input_tokens,
            output_tokens=response.output_tokens,
            estimated_cost=estimate_cost(config["model"], response.input_tokens, response.output_tokens),
            latency_ms=latency_ms,
        )
    )


def _call(provider: AIProvider, *args, **kwargs) -> tuple[AIResponse, int]:
    start = time.perf_counter()
    try:
        response = provider.chat(*args, **kwargs)
    except AIProviderError as exc:
        raise ApiError("AI_PROVIDER_ERROR", str(exc), 502) from exc
    return response, int((time.perf_counter() - start) * 1000)


# ---------- Features ----------


def customer_summary(db: Session, org: Organization, user: User, customer: Customer) -> str:
    provider, config = _require_ai(db, org)

    messages = db.scalars(
        select(Message).where(Message.customer_id == customer.id).order_by(Message.created_at.desc()).limit(20)
    ).all()
    context = {
        "nombre": customer.full_name,
        "estado": customer.status,
        "score": f"{customer.lead_score}/100 ({customer.score_label})",
        "senales": [f["label"] for f in (customer.score_factors or []) if f.get("points", 0) > 0 and f["label"] != "Base"],
        "vehiculo_interes": customer.interested_vehicle.title if customer.interested_vehicle else (
            f"{customer.interest_brand or ''} {customer.interest_model or ''}".strip() or "no definido"
        ),
        "presupuesto": customer.budget,
        "permuta": customer.has_trade_in,
        "financiacion": customer.financing_interest,
        "notas": customer.notes,
        "conversacion_reciente": [
            {"quien": "cliente" if m.direction == "entrante" else "vendedor", "texto": m.body[:250]}
            for m in reversed(messages)
        ],
    }
    chat_messages = [
        {"role": "system", "content": prompts.summary_system(org.name)},
        {"role": "user", "content": json.dumps(context, ensure_ascii=False, default=str)},
    ]
    response, latency = _call(provider, chat_messages, max_tokens=300)
    _log_usage(db, org, user, config, "resumen_cliente", response, latency)

    summary = sanitize_ai_text(response.text or "")
    if not summary:
        raise ApiError("AI_EMPTY_RESPONSE", "El proveedor devolvió una respuesta vacía", 502)
    customer.ai_summary = summary
    customer.ai_summary_at = utcnow()
    return summary


def suggest_replies(db: Session, org: Organization, user: User, conversation: Conversation) -> list[dict]:
    provider, config = _require_ai(db, org)
    customer = db.get(Customer, conversation.customer_id)

    messages = db.scalars(
        select(Message)
        .where(Message.conversation_id == conversation.id)
        .order_by(Message.created_at.desc())
        .limit(15)
    ).all()
    vehicle = customer.interested_vehicle
    context = {
        "cliente": customer.full_name,
        "score": customer.lead_score,
        "vehiculo": (
            {
                "titulo": f"{vehicle.title} {vehicle.year}",
                "precio": vehicle.price,
                "km": vehicle.km,
                "estado": vehicle.status,
                "transmision": vehicle.transmission,
            }
            if vehicle
            else None
        ),
        "permuta": customer.has_trade_in,
        "financiacion_consultada": customer.financing_interest
        or any(f.get("label") == "Preguntó por financiación" for f in (customer.score_factors or [])),
        "chat": [
            {"quien": "cliente" if m.direction == "entrante" else "vendedor", "texto": m.body[:300]}
            for m in reversed(messages)
        ],
    }
    chat_messages = [
        {"role": "system", "content": prompts.reply_system(org.name, user.full_name)},
        {"role": "user", "content": json.dumps(context, ensure_ascii=False, default=str)},
    ]
    response, latency = _call(provider, chat_messages, max_tokens=600, temperature=0.7)
    _log_usage(db, org, user, config, "sugerencia_respuesta", response, latency)

    return _parse_suggestions(response.text or "")


def _parse_suggestions(text: str) -> list[dict]:
    match = re.search(r"\[.*\]", text, re.DOTALL)
    if match:
        try:
            data = json.loads(match.group(0))
            suggestions = [
                {"tone": str(item.get("tone", "directa")), "text": sanitize_ai_text(str(item.get("text", "")))}
                for item in data
                if isinstance(item, dict) and item.get("text")
            ]
            if suggestions:
                return suggestions[:3]
        except json.JSONDecodeError:
            pass
    cleaned = sanitize_ai_text(text)
    if cleaned:
        return [{"tone": "directa", "text": cleaned[:600]}]
    raise ApiError("AI_EMPTY_RESPONSE", "No se pudieron generar sugerencias", 502)


def chat_with_data(db: Session, org: Organization, user: User, history: list[dict]) -> dict:
    provider, config = _require_ai(db, org)

    today = utcnow().strftime("%A %d/%m/%Y %H:%M UTC")
    role_label = {"admin": "administrador", "gerente": "gerente", "vendedor": "vendedor"}.get(user.role, user.role)
    messages: list[dict] = [
        {"role": "system", "content": prompts.chat_system(org.name, org.currency, today, user.full_name, role_label)}
    ]
    for m in history[-12:]:
        messages.append({"role": m["role"], "content": m["content"][:4000]})

    tool_summaries: list[dict] = []
    total_response: AIResponse | None = None
    available_tools = tool_specs_for(user)

    for _round in range(MAX_TOOL_ROUNDS):
        response, latency = _call(provider, messages, tools=available_tools, max_tokens=1200)
        _log_usage(db, org, user, config, "chat", response, latency)
        total_response = response

        if not response.tool_calls:
            break

        messages.append({"role": "assistant", "content": response.text or "", "raw": response.raw_assistant_message})
        for call in response.tool_calls:
            try:
                result, summary = execute_tool(db, org, user, call.name, call.arguments)
            except Exception as exc:
                logger.exception("Tool %s falló", call.name)
                result, summary = {"error": str(exc)}, "Una consulta falló"
            tool_summaries.append({"tool": call.name, "summary": summary})
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": call.id,
                    "content": json.dumps(result, ensure_ascii=False, default=str)[:12000],
                }
            )

    reply = sanitize_ai_text(total_response.text or "") if total_response else ""
    reply = reply or "No pude generar una respuesta. Probá reformular la pregunta."
    return {"reply": reply, "tool_calls": tool_summaries}


def test_connection(db: Session, org: Organization, user: User) -> dict:
    provider, config = _require_ai(db, org)
    response, latency = _call(
        provider,
        [{"role": "user", "content": "Respondé únicamente: OK"}],
        max_tokens=10,
    )
    _log_usage(db, org, user, config, "insight", response, latency)
    return {
        "ok": True,
        "provider": config["provider"],
        "model": config["model"],
        "latency_ms": latency,
        "reply": (response.text or "").strip()[:50],
    }


def usage_summary(db: Session, org: Organization) -> dict:
    now = utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0)
    rows = db.scalars(
        select(AIUsage).where(AIUsage.organization_id == org.id, AIUsage.created_at >= now - timedelta(days=30))
    ).all()

    by_feature: dict[str, dict] = {}
    by_day: dict[str, float] = {}
    for r in rows:
        f = by_feature.setdefault(r.feature, {"feature": r.feature, "calls": 0, "cost": 0.0, "tokens": 0})
        f["calls"] += 1
        f["cost"] = round(f["cost"] + r.estimated_cost, 6)
        f["tokens"] += r.input_tokens + r.output_tokens
        day = r.created_at.strftime("%Y-%m-%d")
        by_day[day] = round(by_day.get(day, 0) + r.estimated_cost, 6)

    month_rows = [r for r in rows if r.created_at >= month_start]
    return {
        "total_cost": round(sum(r.estimated_cost for r in month_rows), 4),
        "total_input_tokens": sum(r.input_tokens for r in month_rows),
        "total_output_tokens": sum(r.output_tokens for r in month_rows),
        "total_calls": len(month_rows),
        "by_feature": sorted(by_feature.values(), key=lambda x: x["cost"], reverse=True),
        "by_day": [{"date": k, "cost": v} for k, v in sorted(by_day.items())],
        "recent": [
            {
                "feature": r.feature,
                "model": r.model,
                "tokens": r.input_tokens + r.output_tokens,
                "cost": r.estimated_cost,
                "latency_ms": r.latency_ms,
                "at": r.created_at.strftime("%d/%m %H:%M"),
            }
            for r in sorted(rows, key=lambda r: r.created_at, reverse=True)[:15]
        ],
    }
