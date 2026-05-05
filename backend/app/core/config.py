import os
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[3]
ROOT_ENV_FILE = PROJECT_ROOT / ".env"
BACKEND_ENV_FILE = PROJECT_ROOT / "backend" / ".env"


class Settings(BaseSettings):
    tuding_account: str = Field(default="", alias="TUDING_ACCOUNT")
    tuding_password: str = Field(default="", alias="TUDING_PASSWORD")
    backend_host: str = Field(default="0.0.0.0", alias="BACKEND_HOST")
    backend_port: int = Field(default=8000, alias="BACKEND_PORT")
    data_dir: Path = Field(default=Path("data"), alias="DATA_DIR")
    max_batch_size: int = Field(default=5, alias="MAX_BATCH_SIZE")
    max_image_side: int = Field(default=6000, alias="MAX_IMAGE_SIDE")
    max_concurrent_uploads: int = Field(default=4, alias="MAX_CONCURRENT_UPLOADS")
    task_expire_hours: int = Field(default=1, alias="TASK_EXPIRE_HOURS")
    cors_origins: str = Field(default="*", alias="CORS_ORIGINS")

    model_config = SettingsConfigDict(env_file=(BACKEND_ENV_FILE, ROOT_ENV_FILE), env_file_encoding="utf-8", extra="ignore")

    @property
    def cookie_dir(self) -> Path:
        return self.data_dir / "cookies"

    @property
    def upload_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def result_dir(self) -> Path:
        return self.data_dir / "results"

    @property
    def task_dir(self) -> Path:
        return self.data_dir / "tasks"

    @property
    def cookie_file(self) -> Path:
        return self.cookie_dir / "tudingai_cookies.json"

    @property
    def cors_origin_list(self) -> list[str]:
        if self.cors_origins.strip() == "*":
            return ["*"]
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    def ensure_directories(self) -> None:
        for directory in [self.cookie_dir, self.upload_dir, self.result_dir, self.task_dir]:
            directory.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if os.getenv("DATA_DIR") is None and Path("/app/data").exists():
        settings.data_dir = Path("/app/data")
    settings.ensure_directories()
    return settings
