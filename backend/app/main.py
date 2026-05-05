from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from sqlalchemy import select

from app.api.cameras import router as cameras_router
from app.api.events import router as events_router
from app.api.health import router as health_router
from app.api.settings import router as settings_router
from app.api.stats import router as stats_router
from app.api.websocket import router as ws_router
from app.config import settings
from app.database import SessionLocal
from app.models import AppSettings
from app.pipeline.orchestrator import orchestrator
from app.runtime_settings import DEFAULTS, runtime

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("app")


async def _bootstrap_runtime_settings() -> None:
    """Hydrate the in-memory runtime cache from the DB; seed the row on
    first boot using the env-var defaults."""
    async with SessionLocal() as session:
        res = await session.execute(select(AppSettings).where(AppSettings.id == 1))
        row = res.scalar_one_or_none()
        if row is None:
            row = AppSettings(id=1, **DEFAULTS)
            session.add(row)
            await session.commit()
            log.info("seeded app_settings with env defaults")
        runtime.update(
            conf_threshold=row.conf_threshold,
            positive_required=row.positive_required,
            positive_window=row.positive_window,
            cooldown_seconds=row.cooldown_seconds,
            pre_roll_seconds=row.pre_roll_seconds,
            post_roll_seconds=row.post_roll_seconds,
        )
        log.info("runtime settings loaded: %s", runtime.snapshot())


@asynccontextmanager
async def lifespan(_app: FastAPI):
    os.makedirs(settings.clip_dir, exist_ok=True)
    os.makedirs(settings.thumb_dir, exist_ok=True)

    # Surface a clear, actionable error if the model file is missing.
    if not os.path.exists(settings.model_path):
        log.error(
            "YOLO weights not found at %s — mount best.pt into the container",
            settings.model_path,
        )

    await _bootstrap_runtime_settings()
    await orchestrator.start()
    try:
        yield
    finally:
        await orchestrator.stop()


app = FastAPI(title="Shoplifting Detection API", version="1.0.0", lifespan=lifespan)

# CORS open in dev; tighten in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix="/api")
app.include_router(cameras_router, prefix="/api")
app.include_router(events_router, prefix="/api")
app.include_router(stats_router, prefix="/api")
app.include_router(settings_router, prefix="/api")
app.include_router(ws_router, prefix="/api")
