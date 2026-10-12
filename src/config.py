from functools import lru_cache
from typing import Literal
from urllib.parse import urlparse

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    app_name: str = "AI20K Agent"
    app_env: Literal["development", "production", "test"] = "development"
    app_port: int = Field(default=8000, ge=1, le=65535)
    app_host: str = "0.0.0.0"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    cors_origins: str = "http://localhost:3000"

    # LLM
    openai_api_key: str = ""
    model_name: str = "gpt-4o-mini"
    llm_temperature: float = Field(default=0.7, ge=0.0, le=2.0)

    # Core API (backend NestJS) — nguồn rổ hàng + xếp hạng căn; agent KHÔNG có danh sách căn riêng.
    core_api_url: str = "http://localhost:4000/api/v1"
    core_api_timeout_s: float = Field(default=8.0, gt=0, le=30)

    # Database
    database_url: str = "sqlite:///./data/app.db"

    # Vector Store
    chroma_persist_dir: str = "./data/chroma"

    @field_validator("core_api_url")
    @classmethod
    def _check_core_api_url(cls, v: str) -> str:
        """Kiểm lúc khởi động: URL sai ⇒ không khởi động được (thay vì gọi nhầm đường như trước)."""
        u = urlparse(v.strip())
        if u.scheme not in ("http", "https") or not u.netloc:
            raise ValueError("CORE_API_URL phải là URL http(s) đầy đủ, vd http://localhost:4000/api/v1")
        return v.strip().rstrip("/")


@lru_cache
def get_settings() -> Settings:
    return Settings()
