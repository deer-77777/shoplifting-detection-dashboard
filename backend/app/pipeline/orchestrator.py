"""Reconciles enabled cameras (DB) with running worker threads.

Polls every ``orchestrator_interval_seconds`` and on demand (after API
mutations). Provides the bridge between the synchronous worker threads and
the async FastAPI world: status updates and event saves both arrive on the
asyncio loop here.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update

from app.config import settings
from app.database import SessionLocal
from app.event_bus import bus
from app.models import Camera, Event
from app.pipeline.camera_worker import (
    CameraWorker,
    EventPayload,
    StatusChange,
    WorkerHooks,
)

log = logging.getLogger(__name__)


class PipelineOrchestrator:
    def __init__(self) -> None:
        self._workers: dict[uuid.UUID, CameraWorker] = {}
        self._loop: asyncio.AbstractEventLoop | None = None
        self._reconcile_event = asyncio.Event()
        self._stop_event = asyncio.Event()
        self._task: asyncio.Task | None = None

    # ----- lifecycle --------------------------------------------------------

    async def start(self) -> None:
        self._loop = asyncio.get_running_loop()
        bus.bind_loop(self._loop)
        self._stop_event.clear()
        self._task = asyncio.create_task(self._run(), name="pipeline-orchestrator")
        log.info("pipeline orchestrator started")

    async def stop(self) -> None:
        log.info("pipeline orchestrator stopping")
        self._stop_event.set()
        self._reconcile_event.set()
        if self._task is not None:
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        # Stop every worker.
        for w in list(self._workers.values()):
            w.stop()
        for w in list(self._workers.values()):
            w.join(timeout=10.0)
        self._workers.clear()
        log.info("pipeline orchestrator stopped")

    def request_reconcile(self) -> None:
        """Trigger an immediate reconcile (called from API mutation handlers)."""
        if self._loop is None:
            return
        self._loop.call_soon_threadsafe(self._reconcile_event.set)

    def get_worker(self, camera_id: uuid.UUID) -> CameraWorker | None:
        return self._workers.get(camera_id)

    async def restart_all_workers(self) -> None:
        """Stop every running worker; reconcile loop will respawn them.

        Used by the settings API when a knob change requires the per-camera
        state machine to be rebuilt (deque sizes, etc.). Safe to call from
        any async context.
        """
        log.info("restarting all workers (settings change)")
        for cid in list(self._workers.keys()):
            await self._stop_worker(cid)
        # Trigger an immediate reconcile so workers come back without waiting
        # for the next scheduled tick.
        if self._loop is not None:
            self._loop.call_soon_threadsafe(self._reconcile_event.set)

    # ----- reconciliation loop ---------------------------------------------

    async def _run(self) -> None:
        while not self._stop_event.is_set():
            try:
                await self._reconcile()
            except Exception:
                log.exception("reconcile failed")
            try:
                await asyncio.wait_for(
                    self._reconcile_event.wait(),
                    timeout=settings.orchestrator_interval_seconds,
                )
            except asyncio.TimeoutError:
                pass
            self._reconcile_event.clear()

    async def _reconcile(self) -> None:
        async with SessionLocal() as session:
            res = await session.execute(
                select(Camera).where(
                    Camera.enabled.is_(True),
                    Camera.is_deleted.is_(False),
                )
            )
            enabled = list(res.scalars().all())

        desired_by_id: dict[uuid.UUID, Camera] = {c.id: c for c in enabled}
        desired_ids = set(desired_by_id.keys())
        current_ids = set(self._workers.keys())

        to_stop = current_ids - desired_ids
        for cid in to_stop:
            await self._stop_worker(cid)

        for cid, cam in desired_by_id.items():
            existing = self._workers.get(cid)
            if existing is None:
                self._start_worker(cam)
                continue
            # If RTSP URL or name changed, recycle the worker.
            if existing.rtsp_url != cam.rtsp_url or existing.camera_name != cam.name:
                await self._stop_worker(cid)
                self._start_worker(cam)

    def _start_worker(self, cam: Camera) -> None:
        hooks = WorkerHooks(
            on_status_change=self._on_status_change,
            on_event_confirmed=self._on_event_confirmed,
        )
        w = CameraWorker(
            camera_id=cam.id,
            name=cam.name,
            rtsp_url=cam.rtsp_url,
            hooks=hooks,
        )
        self._workers[cam.id] = w
        w.start()
        log.info("started worker for camera=%s", cam.name)

    async def _stop_worker(self, cid: uuid.UUID) -> None:
        w = self._workers.pop(cid, None)
        if w is None:
            return
        w.stop()
        # Join in a thread so we don't block the event loop on shutdown.
        await asyncio.to_thread(w.join, 10.0)
        # Best-effort: mark camera offline.
        async with SessionLocal() as session:
            await session.execute(
                update(Camera).where(Camera.id == cid).values(status="offline")
            )
            await session.commit()
        bus.publish_threadsafe(
            {
                "type": "camera.status",
                "camera_id": str(cid),
                "status": "offline",
            }
        )
        log.info("stopped worker for camera=%s", cid)

    # ----- thread → asyncio bridge -----------------------------------------

    def _on_status_change(self, change: StatusChange) -> None:
        loop = self._loop
        if loop is None or loop.is_closed():
            return
        asyncio.run_coroutine_threadsafe(self._apply_status_change(change), loop)

    def _on_event_confirmed(self, payload: EventPayload) -> None:
        loop = self._loop
        if loop is None or loop.is_closed():
            return
        # Fire-and-forget; if the loop is shutting down the future will be
        # cancelled cleanly.
        asyncio.run_coroutine_threadsafe(self._apply_event(payload), loop)

    async def _apply_status_change(self, change: StatusChange) -> None:
        try:
            async with SessionLocal() as session:
                values: dict = {"status": change.status}
                if change.last_seen_at is not None:
                    values["last_seen_at"] = change.last_seen_at
                if change.last_error is not None:
                    values["last_error"] = change.last_error
                elif change.status in ("online", "connecting"):
                    values["last_error"] = None
                await session.execute(
                    update(Camera).where(Camera.id == change.camera_id).values(**values)
                )
                await session.commit()
        except Exception:
            log.exception("failed to persist status change")
            return
        bus.publish_threadsafe(
            {
                "type": "camera.status",
                "camera_id": str(change.camera_id),
                "status": change.status,
                "last_seen_at": (
                    change.last_seen_at.isoformat()
                    if change.last_seen_at
                    else None
                ),
                "last_error": change.last_error,
            }
        )

    async def _apply_event(self, payload: EventPayload) -> None:
        try:
            async with SessionLocal() as session:
                ev = Event(
                    id=payload.id,
                    camera_id=payload.camera_id,
                    track_id=payload.track_id,
                    started_at=payload.started_at,
                    ended_at=payload.ended_at,
                    peak_confidence=payload.peak_confidence,
                    bbox_trajectory=payload.bbox_trajectory,
                    clip_path=payload.clip_path,
                    thumbnail_path=payload.thumbnail_path,
                    created_at=datetime.now(timezone.utc),
                )
                session.add(ev)
                await session.commit()
        except Exception:
            log.exception("failed to persist event")
            return

        bus.publish_threadsafe(
            {
                "type": "event.confirmed",
                "event": {
                    "id": str(payload.id),
                    "camera_id": str(payload.camera_id),
                    "track_id": payload.track_id,
                    "started_at": payload.started_at.isoformat(),
                    "ended_at": payload.ended_at.isoformat(),
                    "peak_confidence": payload.peak_confidence,
                    "clip_path": payload.clip_path,
                    "thumbnail_path": payload.thumbnail_path,
                },
            }
        )


orchestrator = PipelineOrchestrator()
