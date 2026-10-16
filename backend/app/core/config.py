from pydantic import (
    EmailStr,
    PostgresDsn,
    field_validator,
)
from pydantic_settings import (
    BaseSettings,
    SettingsConfigDict,
)


def _resolve_postgres_url(value: PostgresDsn | None) -> str | None:
    if value is None:
        return None

    url = str(value)
    for scheme in ("postgres://", "postgresql://"):
        if url.startswith(scheme):
            url = url.replace(scheme, "postgresql+asyncpg://", 1)
    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_ignore_empty=True,
        extra="ignore",
    )

    FASTAPI_ENV: str = "production"

    APP_INIT: int = 0
    APP_DEMO: bool = False
    APP_NAME: str = "AmigaVIVO"
    APP_DATABASE_URL: PostgresDsn
    APP_FRONTEND_URL: str
    APP_SYSTEM_USER_NAME: str = "System Admin"
    APP_SYSTEM_USER_EMAIL: EmailStr
    APP_SYSTEM_USER_PASSWORD: str

    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60

    AWS_BEARER_TOKEN_BEDROCK: str
    AWS_REGION: str = "ap-southeast-1"
    AWS_BEDROCK_MODEL_ID: str = "apac.amazon.nova-lite-v1:0"
    BEDROCK_MODEL_ID: str | None = None
    AWS_BEDROCK_TEMPERATURE: float = 0.1
    AWS_ACCESS_KEY_ID: str
    AWS_SECRET_ACCESS_KEY: str
    S3_BUCKET: str = "bedrock-kb-student3-1791858279"

    TEST_DATABASE_URL: PostgresDsn | None = None

    @property
    def is_development(self) -> bool:
        return self.FASTAPI_ENV == "development" or self.APP_DEMO

    @field_validator("APP_DATABASE_URL", mode="before")
    @classmethod
    def _use_asyncpg_driver(cls, value: str | PostgresDsn) -> str:
        return _resolve_postgres_url(value)

    @field_validator("TEST_DATABASE_URL", mode="before")
    @classmethod
    def _test_use_asyncpg_driver(cls, value: str | PostgresDsn) -> str:
        return _resolve_postgres_url(value)


settings = Settings()
