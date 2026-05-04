from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # `protected_namespaces=()` so pydantic stops complaining about our
    # `model_path` field colliding with the `model_` namespace.
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        protected_namespaces=(),
    )

    database_url: str = "postgresql+asyncpg://lpuser:lppass@postgres:5432/lossprev"

    model_path: str = "./best.pt"
    device: str = "cuda:0"

    clip_dir: str = "./storage/clips"
    thumb_dir: str = "./storage/thumbnails"

    sample_fps: int = 8
    conf_threshold: float = 0.5

    cooldown_seconds: int = 30
    pre_roll_seconds: int = 5
    post_roll_seconds: int = 10

    positive_required: int = 5
    positive_window: int = 10

    track_idle_drop_seconds: float = 5.0
    rtsp_reconnect_max_backoff: float = 60.0
    orchestrator_interval_seconds: float = 10.0


settings = Settings()
