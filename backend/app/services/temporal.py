"""Detección de intención temporal en mensajes (§16).

"Escribime la semana que viene" → seguimiento sugerido con fecha concreta.
Trabaja sobre texto normalizado (minúsculas, sin acentos).
"""

import re
from calendar import monthrange
from datetime import datetime, timedelta

from app.core.utils import normalize, utcnow

# Hora por defecto del seguimiento sugerido: 10:00 de Argentina = 13:00 UTC.
DEFAULT_HOUR_UTC = 13

WEEKDAYS = {"lunes": 0, "martes": 1, "miercoles": 2, "jueves": 3, "viernes": 4, "sabado": 5, "domingo": 6}


def _at_default_hour(base: datetime) -> datetime:
    return base.replace(hour=DEFAULT_HOUR_UTC, minute=0, second=0, microsecond=0)


def _next_weekday(now: datetime, weekday: int) -> datetime:
    days_ahead = (weekday - now.weekday() + 7) % 7
    if days_ahead == 0:
        days_ahead = 7
    return now + timedelta(days=days_ahead)


def _day_of_month(now: datetime, day: int, after: bool = False) -> datetime | None:
    if not 1 <= day <= 31:
        return None
    year, month = now.year, now.month
    candidate_day = day + 1 if after else day
    for _ in range(2):
        last = monthrange(year, month)[1]
        if candidate_day <= last:
            candidate = now.replace(year=year, month=month, day=candidate_day)
            if candidate.date() > now.date():
                return candidate
        month += 1
        if month > 12:
            month, year = 1, year + 1
    return None


def detect_followup_date(text: str, now: datetime | None = None) -> tuple[datetime, str] | None:
    """Devuelve (fecha_sugerida_utc, frase_detectada) o None."""
    now = now or utcnow()
    t = normalize(text)

    if re.search(r"pasado manana", t):
        return _at_default_hour(now + timedelta(days=2)), "pasado mañana"
    if re.search(r"\bmanana\b", t) and not re.search(r"(a|de|por) la manana", t):
        return _at_default_hour(now + timedelta(days=1)), "mañana"
    if re.search(r"semana que viene|proxima semana|otra semana", t):
        return _at_default_hour(_next_weekday(now, 0)), "la semana que viene"
    if re.search(r"mes que viene|proximo mes|en un mes", t):
        return _at_default_hour(now + timedelta(days=30)), "el mes que viene"
    if re.search(r"fin de mes", t):
        last = monthrange(now.year, now.month)[1]
        target = now.replace(day=last)
        if target.date() <= now.date():
            target = _day_of_month(now, 28) or now + timedelta(days=28)
        return _at_default_hour(target), "a fin de mes"

    match = re.search(r"\bel (lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b", t)
    if match:
        return _at_default_hour(_next_weekday(now, WEEKDAYS[match.group(1)])), f"el {match.group(1)}"

    match = re.search(r"en (\d{1,2}) dias", t)
    if match:
        return _at_default_hour(now + timedelta(days=int(match.group(1)))), f"en {match.group(1)} días"
    if re.search(r"en una semana", t):
        return _at_default_hour(now + timedelta(days=7)), "en una semana"
    if re.search(r"en dos semanas|en 15 dias|en quince dias", t):
        return _at_default_hour(now + timedelta(days=14)), "en dos semanas"

    match = re.search(r"despues del (\d{1,2})\b", t)
    if match:
        target = _day_of_month(now, int(match.group(1)), after=True)
        if target:
            return _at_default_hour(target), f"después del {match.group(1)}"

    match = re.search(r"(?:hablame|escribime|llamame|contactame)[^.]{0,20}\bel (\d{1,2})\b", t)
    if match:
        target = _day_of_month(now, int(match.group(1)))
        if target:
            return _at_default_hour(target), f"el {match.group(1)}"

    return None
