from __future__ import annotations

import os
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Camera, Event
from app.schemas import EventOut, EventWithCamera

router = APIRouter(prefix="/events", tags=["events"])


@router.get("", response_model=list[EventWithCamera])
async def list_events(
    camera_id: uuid.UUID | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> list[EventWithCamera]:
    stmt = (
        select(Event, Camera.name)
        .join(Camera, Camera.id == Event.camera_id)
        .order_by(Event.started_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if camera_id is not None:
        stmt = stmt.where(Event.camera_id == camera_id)
    if since is not None:
        stmt = stmt.where(Event.started_at >= since)
    if until is not None:
        stmt = stmt.where(Event.started_at <= until)

    res = await db.execute(stmt)
    out: list[EventWithCamera] = []
    for ev, camera_name in res.all():
        out.append(
            EventWithCamera(
                **EventOut.model_validate(ev).model_dump(),
                camera_name=camera_name,
            )
        )
    return out


@router.get("/{event_id}", response_model=EventWithCamera)
async def get_event(
    event_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> EventWithCamera:
    stmt = (
        select(Event, Camera.name)
        .join(Camera, Camera.id == Event.camera_id)
        .where(Event.id == event_id)
    )
    row = (await db.execute(stmt)).first()
    if row is None:
        raise HTTPException(status_code=404, detail="event not found")
    ev, camera_name = row
    return EventWithCamera(
        **EventOut.model_validate(ev).model_dump(),
        camera_name=camera_name,
    )


@router.get("/{event_id}/clip")
async def get_event_clip(
    event_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> FileResponse:
    ev = await db.get(Event, event_id)
    if ev is None:
        raise HTTPException(status_code=404, detail="event not found")
    if not os.path.exists(ev.clip_path):
        raise HTTPException(status_code=410, detail="clip file missing on disk")
    return FileResponse(
        ev.clip_path,
        media_type="video/mp4",
        filename=f"{event_id}.mp4",
    )


@router.get("/{event_id}/thumbnail")
async def get_event_thumbnail(
    event_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> FileResponse:
    ev = await db.get(Event, event_id)
    if ev is None:
        raise HTTPException(status_code=404, detail="event not found")
    if not os.path.exists(ev.thumbnail_path):
        raise HTTPException(status_code=410, detail="thumbnail missing on disk")
    return FileResponse(
        ev.thumbnail_path,
        media_type="image/jpeg",
        filename=f"{event_id}.jpg",
    )
