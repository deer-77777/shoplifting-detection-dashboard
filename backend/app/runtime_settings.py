"""In-memory cache for runtime-tunable detection knobs.

The DB row in ``app_settings`` is the source of truth; this cache exists so
the camera worker threads can read the current values without taking a DB
round-trip on every frame. The HTTP layer updates the DB and then calls
:meth:`RuntimeSettings.update` to keep this cache in sync.
"""

from __future__ import annotations

import threading
from dataclasses import asdict, dataclass
from typing import Any

from app.config import settings as env_defaults


# Defaults sourced from environment variables (or pydantic-settings defaults
# if no env override). These are also what the singleton DB row gets seeded
# with the first time the backend boots.
DEFAULTS: dict[str, Any] = {
    "conf_threshold": env_defaults.conf_threshold,
    "positive_required": env_defaults.positive_required,
    "positive_window": env_defaults.positive_window,
    "cooldown_seconds": env_defaults.cooldown_seconds,
    "pre_roll_seconds": env_defaults.pre_roll_seconds,
    "post_roll_seconds": env_defaults.post_roll_seconds,
}


@dataclass
class _Snapshot:
    conf_threshold: float
    positive_required: int
    positive_window: int
    cooldown_seconds: int
    pre_roll_seconds: int
    post_roll_seconds: int


class RuntimeSettings:
    """Thread-safe mutable holder for the runtime knobs."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._values = _Snapshot(**DEFAULTS)

    # Read-only attribute access — workers call these on every frame.
    @property
    def conf_threshold(self) -> float:
        return self._values.conf_threshold

    @property
    def positive_required(self) -> int:
        return self._values.positive_required

    @property
    def positive_window(self) -> int:
        return self._values.positive_window

    @property
    def cooldown_seconds(self) -> int:
        return self._values.cooldown_seconds

    @property
    def pre_roll_seconds(self) -> int:
        return self._values.pre_roll_seconds

    @property
    def post_roll_seconds(self) -> int:
        return self._values.post_roll_seconds

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return asdict(self._values)

    def update(self, **kwargs: Any) -> None:
        with self._lock:
            for k, v in kwargs.items():
                if hasattr(self._values, k):
                    setattr(self._values, k, v)


runtime = RuntimeSettings()
