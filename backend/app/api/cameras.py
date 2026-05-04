from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Camera
from app.pipeline.orchestrator import orchestrator
from app.schemas import CameraCreate, CameraOut, CameraUpdate

router = APIRouter(prefix="/cameras", tags=["cameras"])


def _to_out(c: Camera) -> CameraOut:
    return CameraOut.model_validate(c)


@router.get("", response_model=list[CameraOut])
async def list_cameras(db: AsyncSession = Depends(get_db)) -> list[CameraOut]:
    res = await db.execute(select(Camera).order_by(Camera.created_at.asc()))
    return [_to_out(c) for c in res.scalars().all()]


@router.post("", response_model=CameraOut, status_code=status.HTTP_201_CREATED)
async def create_camera(
    payload: CameraCreate, db: AsyncSession = Depends(get_db)
) -> CameraOut:
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
    if cam is None:
        raise HTTPException(status_code=404, detail="camera not found")
    return _to_out(cam)


@router.patch("/{camera_id}", response_model=CameraOut)
async def update_camera(
    camera_id: uuid.UUID,
    payload: CameraUpdate,
    db: AsyncSession = Depends(get_db),
) -> CameraOut:
    cam = await db.get(Camera, camera_id)
    if cam is None:
        raise HTTPException(status_code=404, detail="camera not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(cam, k, v)
    await db.commit()
    await db.refresh(cam)
    orchestrator.request_reconcile()
    return _to_out(cam)


@router.delete(
    "/{camera_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_camera(
    camera_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> Response:
    cam = await db.get(Camera, camera_id)
    if cam is None:
        raise HTTPException(status_code=404, detail="camera not found")
    await db.delete(cam)
    await db.commit()
    orchestrator.request_reconcile()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
