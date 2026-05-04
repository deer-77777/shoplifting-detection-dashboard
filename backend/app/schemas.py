from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ----- cameras --------------------------------------------------------------


class CameraBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    rtsp_url: str = Field(min_length=1)


class CameraCreate(CameraBase):
    enabled: bool = True

    @field_validator("rtsp_url")
    @classmethod
    def _check_scheme(cls, v: str) -> str:
        if not (v.startswith("rtsp://") or v.startswith("rtsps://")):
            raise ValueError("rtsp_url must start with rtsp:// or rtsps://")
        return v


class CameraUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    rtsp_url: str | None = None
    enabled: bool | None = None

    @field_validator("rtsp_url")
    @classmethod
    def _check_scheme(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if not (v.startswith("rtsp://") or v.startswith("rtsps://")):
            raise ValueError("rtsp_url must start with rtsp:// or rtsps://")
        return v


_RTSP_CRED_RE = re.compile(r"(rtsps?://)([^:/?#@]+):([^@]+)@")


def mask_rtsp(url: str) -> str:
    return _RTSP_CRED_RE.sub(r"\1\2:****@", url)


class CameraOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    rtsp_url: str
    status: str
    last_seen_at: datetime | None
    last_error: str | None
    enabled: bool
    created_at: datetime


# ----- events ---------------------------------------------------------------


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    camera_id: uuid.UUID
    track_id: int
    started_at: datetime
    ended_at: datetime
    peak_confidence: float
    bbox_trajectory: list[dict[str, Any]]
    clip_path: str
    thumbnail_path: str
    created_at: datetime


class EventWithCamera(EventOut):
    camera_name: str | None = None


# ----- stats ----------------------------------------------------------------


class DayBucket(BaseModel):
    day: str  # YYYY-MM-DD (UTC)
    count: int


class CameraBucket(BaseModel):
    camera_id: uuid.UUID
    camera_name: str
    count: int


class StatsOut(BaseModel):
    total_events: int
    events_today: int
    events_last_7_days: int
    online_cameras: int
    total_cameras: int
    by_day: list[DayBucket]
    by_camera: list[CameraBucket]
