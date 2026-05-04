from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.event_bus import bus

log = logging.getLogger(__name__)

router = APIRouter()

PING_INTERVAL_SECONDS = 20.0


@router.websocket("/ws/events")
async def ws_events(ws: WebSocket) -> None:
    await ws.accept()
    queue = await bus.subscribe()

    async def heartbeat() -> None:
        while True:
            await asyncio.sleep(PING_INTERVAL_SECONDS)
            await ws.send_json({"type": "ping"})

    hb_task = asyncio.create_task(heartbeat())
    try:
        while True:
            msg = await queue.get()
            await ws.send_json(msg)
    except WebSocketDisconnect:
        pass
    except Exception:
        log.exception("ws send failed")
    finally:
        hb_task.cancel()
        await bus.unsubscribe(queue)
        try:
            await ws.close()
        except Exception:
            pass
