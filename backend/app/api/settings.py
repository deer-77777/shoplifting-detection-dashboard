"""Runtime-tunable detection settings API.

GET   /api/settings        — current effective values
PATCH /api/settings        — partial update; restarts workers when needed
POST  /api/settings/reset  — restore env-var defaults; restarts workers
"""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import AppSettings
from app.pipeline.orchestrator import orchestrator
from app.runtime_settings import DEFAULTS, runtime
from app.schemas import SettingsOut, SettingsUpdate

router = APIRouter(prefix="/settings", tags=["settings"])

# Knobs that need a worker restart on change — these are read once at worker
# init (state-machine deque sizes, pre-roll buffer maxlen). conf_threshold
# hot-reloads cleanly each frame.
_RESTART_KEYS = {
    "positive_required",
    "positive_window",
    "cooldown_seconds",
    "pre_roll_seconds",
    "post_roll_seconds",
}


def _to_out(s: AppSettings) -> SettingsOut:
    return SettingsOut(
        conf_threshold=s.conf_threshold,
        positive_required=s.positive_required,
        positive_window=s.positive_window,
        cooldown_seconds=s.cooldown_seconds,
        pre_roll_seconds=s.pre_roll_seconds,
        post_roll_seconds=s.post_roll_seconds,
    )


async def _get_or_seed(db: AsyncSession) -> AppSettings:
    res = await db.execute(select(AppSettings).where(AppSettings.id == 1))
    row = res.scalar_one_or_none()
    if row is not None:
        return row
    row = AppSettings(id=1, **DEFAULTS)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.get("", response_model=SettingsOut)
async def get_settings(db: AsyncSession = Depends(get_db)) -> SettingsOut:
    return _to_out(await _get_or_seed(db))


@router.patch("", response_model=SettingsOut)
async def update_settings(
    payload: SettingsUpdate, db: AsyncSession = Depends(get_db)
) -> SettingsOut:
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=400, detail="no fields supplied")

    # Cross-field validation: window must be at least as large as required.
    new_required = data.get("positive_required", runtime.positive_required)
    new_window = data.get("positive_window", runtime.positive_window)
    if new_window < new_required:
        raise HTTPException(
            status_code=400,
            detail="positive_window must be >= positive_required",
        )

    row = await _get_or_seed(db)
    needs_restart = False
    for k, v in data.items():
        if k in _RESTART_KEYS and getattr(row, k) != v:
            needs_restart = True
        setattr(row, k, v)
    await db.commit()
    await db.refresh(row)

    runtime.update(**data)
    if needs_restart:
        # Fire-and-forget so the response returns immediately; workers stop
        # in the background and the reconcile loop respawns them.
        asyncio.create_task(orchestrator.restart_all_workers())
    return _to_out(row)


@router.post("/reset", response_model=SettingsOut)
async def reset_settings(db: AsyncSession = Depends(get_db)) -> SettingsOut:
    row = await _get_or_seed(db)
    for k, v in DEFAULTS.items():
        setattr(row, k, v)
    await db.commit()
    await db.refresh(row)
    runtime.update(**DEFAULTS)
    asyncio.create_task(orchestrator.restart_all_workers())
    return _to_out(row)
