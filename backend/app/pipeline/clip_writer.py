"""Disk writer for confirmed-event clips and thumbnails.

The pre-roll buffer lives in RAM only. When a track is confirmed, the camera
worker hands the writer:

* a list of frames covering pre-roll + post-roll,
* the chosen "peak" frame (highest confidence) for the thumbnail, with a
  bounding box already drawn.

We pipe frames through ffmpeg (libx264) instead of cv2.VideoWriter so the
output is real H.264 / AVC, which every modern browser plays in <video>.
The bundled opencv-python-headless wheels do not ship with libx264 linked
in, so cv2.VideoWriter(..., 'avc1') silently falls back to mpeg4/mp4v —
which Chrome, Firefox, and Safari all refuse to render.

`-movflags +faststart` puts the moov atom at the head of the file so the
browser can start playback before the entire clip is downloaded.

TODO(production): remux source H.264 NAL units from the RTSP stream
directly to skip re-encoding entirely.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import uuid
from pathlib import Path

import cv2
import numpy as np

log = logging.getLogger(__name__)


def _even(n: int) -> int:
    """libx264 with yuv420p needs even dimensions."""
    return n - (n % 2)


def write_clip(
    frames: list[np.ndarray],
    fps: int,
    out_path: str,
) -> None:
    if not frames:
        raise ValueError("write_clip called with no frames")
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg not on PATH; cannot encode H.264 clip")

    h0, w0 = frames[0].shape[:2]
    w, h = _even(w0), _even(h0)
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        # input: raw BGR frames over stdin at the worker's sample fps
        "-f",
        "rawvideo",
        "-pix_fmt",
        "bgr24",
        "-s",
        f"{w}x{h}",
        "-r",
        str(int(fps)),
        "-i",
        "-",
        # output: H.264 in mp4 with web-friendly fast-start
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        out_path,
    ]

    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    assert proc.stdin is not None and proc.stderr is not None

    try:
        for f in frames:
            if f.shape[:2] != (h, w):
                f = cv2.resize(f, (w, h))
            proc.stdin.write(f.tobytes())
        proc.stdin.close()
        rc = proc.wait(timeout=60)
    except Exception:
        proc.kill()
        proc.wait()
        raise
    finally:
        try:
            if proc.stdin and not proc.stdin.closed:
                proc.stdin.close()
        except Exception:
            pass

    if rc != 0:
        err = proc.stderr.read().decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"ffmpeg encode failed (rc={rc}): {err}")


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
