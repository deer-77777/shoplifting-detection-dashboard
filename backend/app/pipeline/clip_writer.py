"""Disk writer for confirmed-event clips and thumbnails.

The pre-roll buffer lives in RAM only. When a track is confirmed, the camera
worker hands the writer:

* a list of ``(timestamp, frame)`` tuples covering pre-roll + post-roll,
* the chosen "peak" frame (highest confidence) for the thumbnail, with a
  bounding box already drawn.

We re-encode with ``mp4v`` for portability. TODO(production): remux the
source H.264 NAL units instead of re-encoding to preserve original quality
and CPU.
"""

from __future__ import annotations

import logging
import os
import uuid
from pathlib import Path

import cv2
import numpy as np

log = logging.getLogger(__name__)


def write_clip(
    frames: list[np.ndarray],
    fps: int,
    out_path: str,
) -> None:
    if not frames:
        raise ValueError("write_clip called with no frames")

    h, w = frames[0].shape[:2]
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(out_path, fourcc, float(fps), (w, h))
    if not writer.isOpened():
        raise RuntimeError(f"VideoWriter failed to open at {out_path}")

    try:
        for f in frames:
            if f.shape[:2] != (h, w):
                f = cv2.resize(f, (w, h))
            writer.write(f)
    finally:
        writer.release()


def write_thumbnail(
    frame: np.ndarray,
    bbox: tuple[float, float, float, float] | None,
    out_path: str,
    quality: int = 85,
) -> None:
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    img = frame.copy()
    if bbox is not None:
        x1, y1, x2, y2 = (int(v) for v in bbox)
        cv2.rectangle(img, (x1, y1), (x2, y2), (46, 61, 255), 3)  # BGR for #ff3d2e
    if not cv2.imwrite(out_path, img, [int(cv2.IMWRITE_JPEG_QUALITY), quality]):
        raise RuntimeError(f"failed to write thumbnail at {out_path}")


def make_paths(
    clip_dir: str,
    thumb_dir: str,
    camera_id: uuid.UUID,
    event_id: uuid.UUID,
) -> tuple[str, str]:
    cam = str(camera_id)
    clip = os.path.join(clip_dir, cam, f"{event_id}.mp4")
    thumb = os.path.join(thumb_dir, cam, f"{event_id}.jpg")
    return clip, thumb
