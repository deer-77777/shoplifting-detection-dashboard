from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone

import cv2
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Camera
from app.pipeline.orchestrator import orchestrator
from app.schemas import CameraCreate, CameraOut, CameraUpdate

router = APIRouter(prefix="/cameras", tags=["cameras"])

PREVIEW_FPS = 8
PREVIEW_QUALITY = 70
PREVIEW_BOUNDARY = "lpframe"


def _to_out(c: Camera) -> CameraOut:
    return CameraOut.model_validate(c)


async def _name_taken(
    db: AsyncSession, name: str, exclude_id: uuid.UUID | None = None
) -> bool:
    """True if an *active* (non-deleted) camera already uses this name."""
    stmt = select(Camera.id).where(
        Camera.name == name,
        Camera.is_deleted.is_(False),
    )
    if exclude_id is not None:
        stmt = stmt.where(Camera.id != exclude_id)
    res = await db.execute(stmt)
    return res.scalar_one_or_none() is not None


@router.get("", response_model=list[CameraOut])
async def list_cameras(
    include_deleted: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
) -> list[CameraOut]:
    stmt = select(Camera).order_by(
        # Active rows first, then deleted ones below.
        Camera.is_deleted.asc(),
        Camera.created_at.asc(),
    )
    if not include_deleted:
        stmt = stmt.where(Camera.is_deleted.is_(False))
    res = await db.execute(stmt)
    return [_to_out(c) for c in res.scalars().all()]


@router.post("", response_model=CameraOut, status_code=status.HTTP_201_CREATED)
async def create_camera(
    payload: CameraCreate, db: AsyncSession = Depends(get_db)
) -> CameraOut:
    if await _name_taken(db, payload.name):
        raise HTTPException(
            status_code=409,
            detail=f"camera name '{payload.name}' is already in use",
        )
    cam = Camera(
        name=payload.name,
        rtsp_url=payload.rtsp_url,
        enabled=payload.enabled,
        status="offline",
    )
    db.add(cam)
    await db.commit()
    await db.refresh(cam)
    orchestrator.request_reconcile()
    return _to_out(cam)


@router.get("/{camera_id}", response_model=CameraOut)
async def get_camera(
    camera_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> CameraOut:
    cam = await db.get(Camera, camera_id)
    if cam is None or cam.is_deleted:
        raise HTTPException(status_code=404, detail="camera not found")
    return _to_out(cam)


@router.patch("/{camera_id}", response_model=CameraOut)
async def update_camera(
    camera_id: uuid.UUID,
    payload: CameraUpdate,
    db: AsyncSession = Depends(get_db),
) -> CameraOut:
    cam = await db.get(Camera, camera_id)
    if cam is None or cam.is_deleted:
        raise HTTPException(status_code=404, detail="camera not found")
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] != cam.name:
        if await _name_taken(db, data["name"], exclude_id=camera_id):
            raise HTTPException(
                status_code=409,
                detail=f"camera name '{data['name']}' is already in use",
            )
    for k, v in data.items():
        setattr(cam, k, v)
    await db.commit()
    await db.refresh(cam)
    orchestrator.request_reconcile()
    return _to_out(cam)


@router.get("/{camera_id}/preview", response_class=StreamingResponse)
async def stream_preview(
    camera_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> StreamingResponse:
    """Live MJPEG preview of the worker's most recent decoded frame."""
    cam = await db.get(Camera, camera_id)
    if cam is None or cam.is_deleted:
        raise HTTPException(status_code=404, detail="camera not found")

    period = 1.0 / PREVIEW_FPS

    async def gen():
        boundary = f"--{PREVIEW_BOUNDARY}\r\n".encode()
        last_ts = 0.0
        while True:
            worker = orchestrator.get_worker(camera_id)
            snap = worker.get_preview_frame() if worker else None
            if snap is None:
                await asyncio.sleep(period)
                continue
            frame, ts = snap
            if ts == last_ts:
                await asyncio.sleep(period)
                continue
            last_ts = ts
            ok, buf = await asyncio.to_thread(
                cv2.imencode,
                ".jpg",
                frame,
                [int(cv2.IMWRITE_JPEG_QUALITY), PREVIEW_QUALITY],
            )
            if not ok:
                await asyncio.sleep(period)
                continue
            jpeg = buf.tobytes()
            yield boundary
            yield b"Content-Type: image/jpeg\r\n"
            yield f"Content-Length: {len(jpeg)}\r\n\r\n".encode()
            yield jpeg
            yield b"\r\n"
            await asyncio.sleep(period)

    return StreamingResponse(
        gen(),
        media_type=f"multipart/x-mixed-replace; boundary={PREVIEW_BOUNDARY}",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.delete(
    "/{camera_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_camera(
    camera_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> Response:
    """Soft-delete: marks the row deleted; events are preserved.

    The camera disappears from the active list immediately and frees its
    name for reuse, but historical events remain queryable when the Events
    page enables 'show deleted'.
    """
    cam = await db.get(Camera, camera_id)
    if cam is None or cam.is_deleted:
        raise HTTPException(status_code=404, detail="camera not found")
    cam.is_deleted = True
    cam.deleted_at = datetime.now(timezone.utc)
    cam.enabled = False  # belt-and-braces: orchestrator stops the worker
    await db.commit()
    orchestrator.request_reconcile()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
