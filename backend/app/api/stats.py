from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Camera, Event
from app.schemas import CameraBucket, DayBucket, StatsOut

router = APIRouter(tags=["stats"])


@router.get("/stats", response_model=StatsOut)
async def get_stats(db: AsyncSession = Depends(get_db)) -> StatsOut:
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    seven_days_ago = today_start - timedelta(days=6)
    fourteen_days_ago = today_start - timedelta(days=13)

    # Counters.
    total_events = (
        await db.execute(select(func.count()).select_from(Event))
    ).scalar_one()
    events_today = (
        await db.execute(
            select(func.count())
            .select_from(Event)
            .where(Event.started_at >= today_start)
        )
    ).scalar_one()
    events_last_7 = (
        await db.execute(
            select(func.count())
            .select_from(Event)
            .where(Event.started_at >= seven_days_ago)
        )
    ).scalar_one()

    # Camera health.
    total_cameras = (
        await db.execute(select(func.count()).select_from(Camera))
    ).scalar_one()
    online_cameras = (
        await db.execute(
            select(func.count())
            .select_from(Camera)
            .where(Camera.status == "online")
        )
    ).scalar_one()

    # by_day for the last 14 days (UTC).
    day_col = func.date_trunc("day", Event.started_at)
    by_day_rows = (
        await db.execute(
            select(day_col.label("day"), func.count().label("c"))
            .where(Event.started_at >= fourteen_days_ago)
            .group_by("day")
            .order_by("day")
        )
    ).all()

    counts_by_day: dict[str, int] = {}
    for d, c in by_day_rows:
        # d is timezone-aware datetime
        key = d.astimezone(timezone.utc).strftime("%Y-%m-%d")
        counts_by_day[key] = int(c)

    by_day: list[DayBucket] = []
    for i in range(14):
        d = (fourteen_days_ago + timedelta(days=i)).strftime("%Y-%m-%d")
        by_day.append(DayBucket(day=d, count=counts_by_day.get(d, 0)))

    # by_camera (all cameras, even with zero events).
    by_camera_rows = (
        await db.execute(
            select(
                Camera.id,
                Camera.name,
                func.count(Event.id),
            )
            .select_from(Camera)
            .outerjoin(Event, Event.camera_id == Camera.id)
            .group_by(Camera.id, Camera.name)
            .order_by(func.count(Event.id).desc(), Camera.name.asc())
        )
    ).all()

    by_camera = [
        CameraBucket(camera_id=cid, camera_name=name, count=int(c))
        for cid, name, c in by_camera_rows
    ]

    return StatsOut(
        total_events=int(total_events),
        events_today=int(events_today),
        events_last_7_days=int(events_last_7),
        online_cameras=int(online_cameras),
        total_cameras=int(total_cameras),
        by_day=by_day,
        by_camera=by_camera,
    )
