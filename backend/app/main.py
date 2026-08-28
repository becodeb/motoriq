import asyncio
import logging
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.api.router import api_router
from app.core.config import get_settings
from app.core.errors import register_error_handlers
from app.core.logging import register_request_logging, setup_logging
from app.core.scheduler import scheduler_loop
from app.database.session import engine
from app.services.event_handlers import register_all

logger = logging.getLogger("pops")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    register_all()
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)

    task: asyncio.Task | None = None
    if settings.scheduler_enabled and not settings.testing:
        task = asyncio.create_task(scheduler_loop())
    logger.info("POPS backend listo — %s", settings.database_url.split("://")[0])
    yield
    if task:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


def create_app() -> FastAPI:
    settings = get_settings()
    setup_logging(settings.debug)

    app = FastAPI(
        title="Motor IQ API",
        description="Sales Intelligence for Automotive — CRM, stock y motor comercial con IA.",
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/docs",
        openapi_url="/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_error_handlers(app)
    register_request_logging(app)
    app.include_router(api_router)

    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(upload_dir)), name="uploads")

    @app.get("/health", tags=["health"])
    def health():
        return {"status": "ok", "app": settings.app_name}

    @app.get("/ready", tags=["health"])
    def ready():
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            return {"status": "ready"}
        except Exception:
            from fastapi.responses import JSONResponse

            return JSONResponse(status_code=503, content={"status": "not_ready"})

    return app


app = create_app()
