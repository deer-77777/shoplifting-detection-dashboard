"""YOLO inference wrapper.

One :class:`YoloEngine` per camera so each camera owns an isolated tracker
state (Ultralytics' ``model.track(persist=True)`` keeps tracker state inside
the model instance — sharing one model across cameras would mix track IDs).
A single process-wide lock serialises all GPU work since the host has one GPU.
"""

from __future__ import annotations

import logging
import os
import threading
from dataclasses import dataclass
from typing import Any

import numpy as np

from app.config import settings
from app.runtime_settings import runtime

# A more permissive tracker config used when the runtime CONF_THRESHOLD is
# below ultralytics' default bytetrack thresholds (0.25 / 0.1). Without this
# the predictor emits low-confidence detections that ByteTrack drops before
# they can form tracks.
_PERMISSIVE_TRACKER = os.path.join(
    os.path.dirname(__file__), "bytetrack_permissive.yaml"
)

log = logging.getLogger(__name__)

# One lock for the entire process — every .track() call goes through it.
GPU_LOCK = threading.Lock()


@dataclass
class Detection:
    track_id: int
    bbox: tuple[float, float, float, float]  # xyxy
    confidence: float
    cls: int


class YoloEngine:
    """Per-camera YOLO + ByteTrack wrapper. Lazy-loaded on first frame."""

    def __init__(self, model_path: str | None = None, device: str | None = None) -> None:
        self._model_path = model_path or settings.model_path
        self._device = device or settings.device
        self._model: Any = None
        self._load_lock = threading.Lock()

    def _ensure_loaded(self) -> None:
        if self._model is not None:
            return
        with self._load_lock:
            if self._model is not None:
                return
            if not os.path.exists(self._model_path):
                raise FileNotFoundError(
                    f"YOLO weights not found at {self._model_path!r}. "
                    "Mount the trained best.pt into the container."
                )
            # Imported lazily so the process can boot without torch on tests.
            from ultralytics import YOLO  # type: ignore

            log.info(
                "loading YOLO weights path=%s device=%s",
                self._model_path,
                self._device,
            )
            self._model = YOLO(self._model_path)

    def track(self, frame: np.ndarray) -> list[Detection]:
        self._ensure_loaded()
        conf = runtime.conf_threshold
        # If the runtime conf is lower than ultralytics' bytetrack defaults,
        # use the permissive tracker config so low-confidence detections can
        # still form tracks. Otherwise stick with the bundled default.
        tracker = _PERMISSIVE_TRACKER if conf < 0.25 else "bytetrack.yaml"
        with GPU_LOCK:
            results = self._model.track(
                frame,
                persist=True,
                tracker=tracker,
                device=self._device,
                verbose=False,
                # Push CONF_THRESHOLD down into the predictor; without this
                # ultralytics applies its own default (0.25) and weaker
                # detections never reach the state machine.
                conf=conf,
            )

        detections: list[Detection] = []
        if not results:
            return detections

        r = results[0]
        boxes = getattr(r, "boxes", None)
        if boxes is None or boxes.id is None:
            return detections

        ids = boxes.id.int().cpu().tolist()
        xyxy = boxes.xyxy.cpu().tolist()
        confs = boxes.conf.cpu().tolist()
        clss = boxes.cls.int().cpu().tolist()

        for tid, xy, c, k in zip(ids, xyxy, confs, clss, strict=False):
            detections.append(
                Detection(
                    track_id=int(tid),
                    bbox=(float(xy[0]), float(xy[1]), float(xy[2]), float(xy[3])),
                    confidence=float(c),
                    cls=int(k),
                )
            )
        return detections
