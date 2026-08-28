from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuración por entorno. Ver .env.example para la documentación de cada variable."""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="POPS_", extra="ignore")

    app_name: str = "Motor IQ"
    debug: bool = True
    # Modo demo: muestra las credenciales seed en /login y devuelve el token de reset
    # de contraseña en la respuesta (no hay SMTP en desarrollo).
    demo_mode: bool = True
    testing: bool = False

    secret_key: str = "pops-dev-secret-cambiar-en-produccion"
    access_token_minutes: int = 30
    refresh_token_days: int = 14

    database_url: str = Field(
        default="sqlite:///./pops.db",
        validation_alias=AliasChoices("POPS_DATABASE_URL", "DATABASE_URL"),
    )

    upload_dir: str = "uploads"
    max_upload_mb: int = 8

    cors_origins: str = "http://localhost:5180,http://127.0.0.1:5180"

    # Fallback de IA por entorno (la configuración por organización tiene prioridad).
    ai_provider: str | None = None
    ai_api_key: str | None = None
    ai_model: str | None = None
    ai_base_url: str | None = None

    scheduler_enabled: bool = True
    rate_limit_enabled: bool = True

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
