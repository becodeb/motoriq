import re
import unicodedata
from datetime import UTC, datetime, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo


def utcnow() -> datetime:
    """Datetime naive en UTC — convención única de la app (SQLite descarta tzinfo).

    Conserva microsegundos: dos eventos del mismo segundo deben ordenar estable.
    """
    return datetime.now(UTC).replace(tzinfo=None)


def new_id() -> str:
    return uuid4().hex


def normalize(text: str | None) -> str:
    """Minúsculas sin acentos, espacios colapsados. Base común de scoring y búsqueda."""
    if not text:
        return ""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", text.lower()).strip()


def clamp(value: int, low: int = 0, high: int = 100) -> int:
    return max(low, min(high, value))


def local_day_bounds(tz_name: str, now: datetime | None = None, day_offset: int = 0) -> tuple[datetime, datetime]:
    """Inicio y fin del día local de la organización, expresados en naive-UTC."""
    now = now or utcnow()
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo("UTC")
    local_now = now.replace(tzinfo=UTC).astimezone(tz) + timedelta(days=day_offset)
    start_local = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    end_local = start_local + timedelta(days=1)
    def to_utc(d):
        return d.astimezone(UTC).replace(tzinfo=None)
    return to_utc(start_local), to_utc(end_local)
