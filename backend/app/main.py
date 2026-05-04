from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.cameras import router as cameras_router
from app.api.events import router as events_router
from app.api.health import router as health_router
from app.api.stats import router as stats_router
from app.api.websocket import router as ws_router
from app.config import settings
from app.pipeline.orchestrator import orchestrator

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("app")


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
app.include_router(ws_router, prefix="/api")
