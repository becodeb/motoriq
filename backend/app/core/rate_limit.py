import time
from collections import defaultdict, deque

from fastapi import Request

from app.core.errors import ApiError


class SlidingWindowLimiter:
    """Rate limiter en memoria (suficiente para una instancia; Redis si se escala horizontal)."""

    def __init__(self, max_requests: int, window_seconds: int) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] > self.window_seconds:
            hits.popleft()
        if len(hits) >= self.max_requests:
            raise ApiError("RATE_LIMITED", "Demasiados intentos. Probá de nuevo en un minuto.", 429)
        hits.append(now)


auth_limiter = SlidingWindowLimiter(max_requests=15, window_seconds=60)
ai_limiter = SlidingWindowLimiter(max_requests=30, window_seconds=60)


def client_ip(request: Request) -> str:
    if request.client:
        return request.client.host
    return "unknown"
