"""Per-camera worker thread.

Responsibilities:

* Open the RTSP stream with exponential backoff on failure.
* Read frames as fast as the stream delivers them on a dedicated reader
  thread, holding only the latest frame so the processor never falls behind.
* Sample frames at ``SAMPLE_FPS`` and run YOLO + ByteTrack on each sample.
* Drive the per-track state machine.
* Maintain a RAM-only pre-roll buffer.
* On confirmation, spin up a :class:`_ActiveRecording`; feed it post-roll
  frames; finalise to disk + database + event bus when complete.
* Push status transitions out via the supplied hooks.

The worker is thread-based (FastAPI is async). All async work — DB writes,
bus publishes — is dispatched through the hooks the orchestrator supplies.
"""

from __future__ import annotations

import logging
import threading
import time
import uuid
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Callable

import cv2
import numpy as np

from app.config import settings
from app.pipeline.clip_writer import make_paths, write_clip, write_thumbnail
from app.pipeline.inference import YoloEngine
from app.pipeline.state_machine import Confirmation, TrackStateMachine

log = logging.getLogger(__name__)


@dataclass
class EventPayload:
    """Result of a confirmed event, ready for DB insert and bus publish."""

    id: uuid.UUID
    camera_id: uuid.UUID
    track_id: int
    started_at: datetime
    ended_at: datetime
    peak_confidence: float
    bbox_trajectory: list[dict]
    clip_path: str
    thumbnail_path: str


@dataclass
class StatusChange:
    camera_id: uuid.UUID
    status: str
    last_seen_at: datetime | None
    last_error: str | None


@dataclass
class WorkerHooks:
    on_status_change: Callable[[StatusChange], None]
    on_event_confirmed: Callable[[EventPayload], None]


@dataclass
class _ActiveRecording:
    track_id: int
    started_at: float
    confirmed_at: float
    peak_confidence: float
    peak_frame: np.ndarray
    peak_bbox: tuple[float, float, float, float]
    bbox_trajectory: list[dict]
    frames: list[np.ndarray] = field(default_factory=list)
    post_roll_target: int = 0  # frames after confirmation we still need

    def feed(self, frame: np.ndarray) -> None:
        self.frames.append(frame)
        if self.post_roll_target > 0:
            self.post_roll_target -= 1

    @property
    def complete(self) -> bool:
        return self.post_roll_target <= 0


class CameraWorker(threading.Thread):
    def __init__(
        self,
        camera_id: uuid.UUID,
        name: str,
        rtsp_url: str,
        hooks: WorkerHooks,
    ) -> None:
        super().__init__(daemon=True, name=f"camworker[{name}]")
        self.camera_id = camera_id
        self.camera_name = name
        self.rtsp_url = rtsp_url
        self.hooks = hooks

        self._stop_event = threading.Event()
        self._engine = YoloEngine()
        self._state_machine = TrackStateMachine(
            positive_required=settings.positive_required,
            positive_window=settings.positive_window,
            cooldown_seconds=settings.cooldown_seconds,
            idle_drop_seconds=settings.track_idle_drop_seconds,
        )
        self._fps = max(1, int(settings.sample_fps))
        self._pre_roll_size = self._fps * settings.pre_roll_seconds
        self._post_roll_frames = self._fps * settings.post_roll_seconds
        self._pre_roll: deque[np.ndarray] = deque(maxlen=self._pre_roll_size)
        self._active: list[_ActiveRecording] = []
        self._last_status: str | None = None
        self._last_seen_emit: float = 0.0

    # ----- lifecycle --------------------------------------------------------

    def stop(self) -> None:
        self._stop_event.set()

    def run(self) -> None:
        backoff = 1.0
        try:
            while not self._stop_event.is_set():
                self._set_status("connecting")
                cap = cv2.VideoCapture(self.rtsp_url, cv2.CAP_FFMPEG)
                # Best-effort buffer-size hint (some backends honour it).
                try:
                    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                except Exception:
                    pass

                if not cap.isOpened():
                    self._set_status("error", "failed to open RTSP stream")
                    cap.release()
                    self._sleep(backoff)
                    backoff = min(backoff * 2, settings.rtsp_reconnect_max_backoff)
                    continue

                self._set_status("online")
                backoff = 1.0  # reset after a clean connect
                err: str | None = None
                try:
                    self._stream_loop(cap)
                except Exception as exc:  # pragma: no cover (defensive)
                    err = f"{type(exc).__name__}: {exc}"
                    log.exception("camera worker %s crashed", self.camera_name)
                finally:
                    cap.release()

                if self._stop_event.is_set():
                    break

                self._set_status("error", err or "rtsp read failed")
                self._sleep(backoff)
                backoff = min(backoff * 2, settings.rtsp_reconnect_max_backoff)
        finally:
            # Best-effort flush of any active recordings so we don't lose them.
            for rec in self._active:
                try:
                    self._finalize(rec)
                except Exception:
                    log.exception("error finalising recording on shutdown")
            self._set_status("offline")

    def _sleep(self, seconds: float) -> None:
        # interruptible sleep
        self._stop_event.wait(timeout=seconds)

    # ----- inner loop -------------------------------------------------------

    def _stream_loop(self, cap: cv2.VideoCapture) -> None:
        latest: dict = {"frame": None, "ts": 0.0}
        latest_lock = threading.Lock()
        reader_stop = threading.Event()

        def _reader() -> None:
            while not reader_stop.is_set() and not self._stop_event.is_set():
                ok, frame = cap.read()
                if not ok or frame is None:
                    reader_stop.set()
                    return
                ts = time.time()
                with latest_lock:
                    latest["frame"] = frame
                    latest["ts"] = ts

        t = threading.Thread(target=_reader, name=f"camread[{self.camera_name}]", daemon=True)
        t.start()

        period = 1.0 / float(self._fps)
        try:
            while not self._stop_event.is_set() and not reader_stop.is_set():
                self._stop_event.wait(timeout=period)
                if self._stop_event.is_set():
                    break
                with latest_lock:
                    frame = latest["frame"]
                    ts = latest["ts"]
                if frame is None:
                    continue
                self._process_frame(frame, ts)
        finally:
            reader_stop.set()
            t.join(timeout=2.0)

        if reader_stop.is_set() and not self._stop_event.is_set():
            raise RuntimeError("rtsp reader exited unexpectedly")

    def _process_frame(self, frame: np.ndarray, ts: float) -> None:
        # Copy because OpenCV may reuse the buffer; pre-roll lives in RAM
        # only and must be a stable copy.
        frame_copy = frame.copy()
        self._pre_roll.append(frame_copy)

        # Periodically (≈1Hz) push last_seen up to the DB so the UI sees life.
        now_mono = time.monotonic()
        if now_mono - self._last_seen_emit >= 1.0:
            self._last_seen_emit = now_mono
            self._emit_status(
                "online",
                last_seen=datetime.fromtimestamp(ts, tz=timezone.utc),
                last_error=None,
            )

        # Inference + tracking.
        try:
            detections = self._engine.track(frame_copy)
        except FileNotFoundError as e:
            self._emit_status("error", last_error=str(e))
            raise
        except Exception as exc:
            log.exception("inference error on %s", self.camera_name)
            self._emit_status("error", last_error=f"inference: {exc}")
            return

        # Feed every active recording first (each frame at sample rate adds
        # to all in-progress clips).
        for rec in self._active:
            rec.feed(frame_copy)

        # Drive state machine; collect new confirmations.
        for det in detections:
            is_pos = det.confidence >= settings.conf_threshold
            confirmation = self._state_machine.observe(
                track_id=det.track_id,
                is_positive=is_pos,
                confidence=det.confidence,
                bbox=det.bbox,
                ts=ts,
            )
            if confirmation is not None:
                self._begin_recording(confirmation, frame_copy)

        # Drop stale tracks.
        self._state_machine.sweep(ts)

        # Finalise any recordings that have collected enough post-roll frames.
        still_active: list[_ActiveRecording] = []
        for rec in self._active:
            if rec.complete:
                try:
                    self._finalize(rec)
                except Exception:
                    log.exception(
                        "failed to finalise recording for camera=%s track=%s",
                        self.camera_name,
                        rec.track_id,
                    )
            else:
                still_active.append(rec)
        self._active = still_active

    # ----- recording lifecycle ---------------------------------------------

    def _begin_recording(self, conf: Confirmation, current_frame: np.ndarray) -> None:
        # The pre-roll buffer already has frames up to and including the
        # current one. Snapshot it as the first slice of the clip.
        pre_frames = list(self._pre_roll)
        # Identify peak-confidence bbox for the thumbnail.
        peak_entry = max(conf.bbox_trajectory, key=lambda e: e["conf"])
        peak_bbox = tuple(peak_entry["bbox"])  # type: ignore[assignment]

        rec = _ActiveRecording(
            track_id=conf.track_id,
            started_at=conf.started_at,
            confirmed_at=conf.confirmed_at,
            peak_confidence=conf.peak_confidence,
            peak_frame=current_frame.copy(),
            peak_bbox=peak_bbox,  # type: ignore[arg-type]
            bbox_trajectory=conf.bbox_trajectory,
            frames=pre_frames,
            post_roll_target=self._post_roll_frames,
        )
        self._active.append(rec)
        log.info(
            "event confirmed camera=%s track=%s conf=%.2f",
            self.camera_name,
            conf.track_id,
            conf.peak_confidence,
        )

    def _finalize(self, rec: _ActiveRecording) -> None:
        event_id = uuid.uuid4()
        clip_path, thumb_path = make_paths(
            settings.clip_dir,
            settings.thumb_dir,
            self.camera_id,
            event_id,
        )
        write_clip(rec.frames, fps=self._fps, out_path=clip_path)
        write_thumbnail(rec.peak_frame, rec.peak_bbox, thumb_path)

        ended_at = datetime.fromtimestamp(time.time(), tz=timezone.utc)
        started_at = datetime.fromtimestamp(rec.started_at, tz=timezone.utc)

        payload = EventPayload(
            id=event_id,
            camera_id=self.camera_id,
            track_id=rec.track_id,
            started_at=started_at,
            ended_at=ended_at,
            peak_confidence=rec.peak_confidence,
            bbox_trajectory=rec.bbox_trajectory,
            clip_path=clip_path,
            thumbnail_path=thumb_path,
        )
        self.hooks.on_event_confirmed(payload)

    # ----- status helpers ---------------------------------------------------

    def _set_status(
        self,
        status: str,
        last_error: str | None = None,
    ) -> None:
        self._emit_status(status, last_seen=None, last_error=last_error)

    def _emit_status(
        self,
        status: str,
        *,
        last_seen: datetime | None,
        last_error: str | None,
    ) -> None:
        # Coalesce repeated identical pings, but always allow status changes
        # and last_seen updates through.
        if (
            status == self._last_status
            and last_seen is None
            and last_error is None
        ):
            return
        self._last_status = status
        change = StatusChange(
            camera_id=self.camera_id,
            status=status,
            last_seen_at=last_seen,
            last_error=last_error,
        )
        try:
            self.hooks.on_status_change(change)
        except Exception:
            log.exception("status hook raised")
