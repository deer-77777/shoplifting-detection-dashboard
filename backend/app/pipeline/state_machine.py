"""Per-track event state machine.

Keyed by ``(camera_id, track_id)``. States: observing → suspicious → confirmed
→ cooldown. A track is confirmed when at least ``positive_required`` of the
last ``positive_window`` frames in which it was visible were positive (i.e.
detection confidence ≥ threshold). After confirmation, the track is locked
out for ``cooldown_seconds``. Tracks unseen for more than
``track_idle_drop_seconds`` are dropped — except those still in cooldown,
which are kept until cooldown expires so re-firing can't sneak through.
"""

from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass, field
from enum import Enum
from typing import Iterable


class State(str, Enum):
    OBSERVING = "observing"
    SUSPICIOUS = "suspicious"
    CONFIRMED = "confirmed"
    COOLDOWN = "cooldown"


@dataclass
class TrackState:
    track_id: int
    state: State = State.OBSERVING
    positives: deque[bool] = field(default_factory=deque)
    last_seen: float = 0.0
    cooldown_until: float = 0.0
    suspect_started_at: float | None = None
    confirmed_at: float | None = None
    peak_confidence: float = 0.0
    bbox_trajectory: list[dict] = field(default_factory=list)


@dataclass
class Confirmation:
    track_id: int
    started_at: float
    confirmed_at: float
    peak_confidence: float
    bbox_trajectory: list[dict]


class TrackStateMachine:
    """Single-camera state machine. Not thread-safe; run inside one worker."""

    def __init__(
        self,
        positive_required: int,
        positive_window: int,
        cooldown_seconds: float,
        idle_drop_seconds: float,
    ) -> None:
        self.positive_required = positive_required
        self.positive_window = positive_window
        self.cooldown_seconds = cooldown_seconds
        self.idle_drop_seconds = idle_drop_seconds
        self._tracks: dict[int, TrackState] = {}

    def observe(
        self,
        track_id: int,
        is_positive: bool,
        confidence: float,
        bbox: tuple[float, float, float, float],
        ts: float,
    ) -> Confirmation | None:
        ts_obj = self._tracks.get(track_id)
        if ts_obj is None:
            ts_obj = TrackState(
                track_id=track_id,
                positives=deque(maxlen=self.positive_window),
            )
            self._tracks[track_id] = ts_obj

        ts_obj.last_seen = ts

        # If already in cooldown, ignore further observations until expiry.
        if ts_obj.state is State.COOLDOWN:
            return None

        ts_obj.positives.append(is_positive)

        if is_positive:
            if ts_obj.state is State.OBSERVING:
                ts_obj.state = State.SUSPICIOUS
                ts_obj.suspect_started_at = ts
            ts_obj.bbox_trajectory.append(
                {
                    "t": ts,
                    "bbox": list(bbox),
                    "conf": confidence,
                }
            )
            if confidence > ts_obj.peak_confidence:
                ts_obj.peak_confidence = confidence

        if (
            ts_obj.state is State.SUSPICIOUS
            and len(ts_obj.positives) >= self.positive_window
            and sum(ts_obj.positives) >= self.positive_required
        ):
            ts_obj.state = State.COOLDOWN
            ts_obj.confirmed_at = ts
            ts_obj.cooldown_until = ts + self.cooldown_seconds
            return Confirmation(
                track_id=track_id,
                started_at=ts_obj.suspect_started_at or ts,
                confirmed_at=ts,
                peak_confidence=ts_obj.peak_confidence,
                bbox_trajectory=list(ts_obj.bbox_trajectory),
            )

        return None

    def sweep(self, now: float) -> Iterable[int]:
        """Drop tracks idle for too long (unless still in cooldown).

        Yields the track IDs that were dropped, mostly for logging.
        """
        drop: list[int] = []
        for tid, ts in self._tracks.items():
            if ts.state is State.COOLDOWN:
                if now < ts.cooldown_until:
                    continue
                # cooldown expired → drop
                drop.append(tid)
                continue
            if (now - ts.last_seen) > self.idle_drop_seconds:
                drop.append(tid)
        for tid in drop:
            self._tracks.pop(tid, None)
        return drop

    def __len__(self) -> int:
        return len(self._tracks)
