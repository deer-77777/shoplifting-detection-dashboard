# API reference

All endpoints are under `/api/`. The dashboard reaches them via the
nginx proxy at `:5173`; for direct access from the host or external
tooling use `:8000`.

No authentication in v1 — the system is on a private store network. If
you put it behind a reverse proxy add auth there.

CORS is open in dev (`allow_origins=["*"]`). Tighten in production.

All timestamps in payloads are **UTC ISO-8601**. The dashboard
formats to local time on display.

---

## Health

### `GET /api/health`

Liveness probe. Returns `200 {"status": "ok"}` if the process is up.
Does not check DB or GPU.

---

## Cameras

### `GET /api/cameras`

List cameras, ordered by `created_at` ascending.

| Query param | Default | |
|---|---|---|
| `include_deleted` | `false` | When `true`, soft-deleted cameras are included after the active rows. |

Response — `200 [Camera, ...]`:

```jsonc
{
  "id": "dda07333-d502-4f0c-b47b-4187f28e52fa",
  "name": "Aisle 4 ceiling",
  "rtsp_url": "rtsp://user:pass@10.0.1.42:554/Streaming/Channels/101",
  "status": "online",                   // offline|connecting|online|error
  "last_seen_at": "2026-05-04T07:17:13.158295Z",
  "last_error": null,
  "enabled": true,
  "created_at": "2026-05-04T02:40:40.295814Z",
  "is_deleted": false,
  "deleted_at": null
}
```

### `POST /api/cameras`

Create a new camera.

```json
{ "name": "Aisle 4 ceiling", "rtsp_url": "rtsp://...", "enabled": true }
```

- `rtsp_url` must start with `rtsp://` or `rtsps://`
- `name` is **active-name unique**: a name in use by an active camera
  causes `409 Conflict`. Names freed by soft-delete can be reused.

Response: `201 Camera`.

### `GET /api/cameras/{id}`

Returns the camera or `404` (also `404` if soft-deleted).

### `PATCH /api/cameras/{id}`

Partial update. Same name-uniqueness check as `POST`.

```jsonc
{ "name": "Aisle 4", "rtsp_url": "...", "enabled": false }
```

Returns `200 Camera`.

### `DELETE /api/cameras/{id}`

**Soft-delete**. Sets `is_deleted=true`, `deleted_at=now()`,
`enabled=false`. Returns `204`. The camera disappears from the active
list and frees its name for reuse, but its events remain queryable via
`include_deleted_cameras=true`.

### `GET /api/cameras/{id}/preview`

Live MJPEG preview of the worker's most recent decoded frame.

- `Content-Type: multipart/x-mixed-replace; boundary=lpframe`
- Frame rate: 8 fps (capped on the server regardless of `SAMPLE_FPS`)
- JPEG quality 70

Drop straight into an `<img src=...>` — browsers render it natively.
Returns `404` if the camera doesn't exist or is soft-deleted; the
stream simply pauses if the worker hasn't produced a frame yet.

---

## Events

### `GET /api/events`

List events, newest first.

| Query param | Default | |
|---|---|---|
| `camera_id` | — | filter to one camera |
| `since` | — | ISO-8601 lower bound on `started_at` |
| `until` | — | ISO-8601 upper bound on `started_at` |
| `limit` | `50` | 1–500 |
| `offset` | `0` | for pagination |
| `include_deleted_cameras` | `false` | include events from soft-deleted cameras |

Response — `200 [EventWithCamera, ...]`:

```jsonc
{
  "id": "4e5fc429-a902-4f7d-8f41-9cdfd9bfab08",
  "camera_id": "dda07333-...",
  "camera_name": "Aisle 4 ceiling",
  "camera_deleted": false,
  "track_id": 12,
  "started_at": "2026-05-04T03:17:08.000Z",
  "ended_at":   "2026-05-04T03:17:23.000Z",
  "peak_confidence": 0.84,
  "bbox_trajectory": [
    { "t": 1714794428.123, "bbox": [102.4, 88.0, 220.5, 410.0], "conf": 0.71 },
    ...
  ],
  "clip_path": "/app/storage/clips/.../<event-id>.mp4",
  "thumbnail_path": "/app/storage/thumbnails/.../<event-id>.jpg",
  "created_at": "2026-05-04T03:17:23.500Z"
}
```

### `GET /api/events/{id}`

Single event. Returns `404` if the row doesn't exist.

### `GET /api/events/{id}/clip`

Streams the MP4 clip. `Content-Type: video/mp4`. Returns:
- `404` — event row not found
- `410` — file missing on disk (the row exists but the volume was wiped)

The clip is H.264 / yuv420p / `+faststart`, ready to drop into a
browser `<video>` tag.

### `GET /api/events/{id}/thumbnail`

JPEG of the peak-confidence frame with the bbox drawn on it. Same
404/410 semantics.

---

## Stats

### `GET /api/stats`

Aggregate metrics for the dashboard's Stats page.

```jsonc
{
  "total_events": 12,
  "events_today": 3,
  "events_last_7_days": 11,
  "online_cameras": 3,        // excludes soft-deleted
  "total_cameras": 4,         // excludes soft-deleted
  "by_day": [                  // last 14 UTC days, oldest first
    { "day": "2026-04-21", "count": 0 },
    { "day": "2026-04-22", "count": 1 },
    ...
  ],
  "by_camera": [               // active cameras only
    { "camera_id": "...", "camera_name": "Aisle 4", "count": 7 },
    ...
  ]
}
```

Event counters (`total_events`, `events_today`, `events_last_7_days`,
`by_day`) include events from soft-deleted cameras. Camera-side
metrics (`total_cameras`, `online_cameras`, `by_camera`) exclude them.

---

## Settings

Runtime-tunable detection knobs persisted in the `app_settings`
singleton table. Detailed semantics in [CONFIGURATION.md](CONFIGURATION.md#runtime-settings-the-settings-page).

### `GET /api/settings`

```jsonc
{
  "conf_threshold": 0.5,
  "positive_required": 5,
  "positive_window": 10,
  "cooldown_seconds": 30,
  "pre_roll_seconds": 5,
  "post_roll_seconds": 10
}
```

### `PATCH /api/settings`

Partial update; field-by-field bounds enforced. Cross-field rule:
`positive_window >= positive_required`.

```json
{ "conf_threshold": 0.6, "positive_required": 4 }
```

If any restart-keyed knob (`positive_required`, `positive_window`,
`cooldown_seconds`, `pre_roll_seconds`, `post_roll_seconds`) actually
changed value, the orchestrator schedules
`restart_all_workers()` in the background — the response returns
immediately and workers reconnect over the next ~5 s.

Returns `200 SettingsOut`.
Errors: `400` on validation failure (out of range, M < N, empty payload).

### `POST /api/settings/reset`

Restore every knob to the env-var defaults. Always triggers a worker
restart. Returns `200 SettingsOut`.

---

## WebSocket

### `WS /api/ws/events`

The dashboard opens this once on app mount. The connection-state
indicator in the sidebar reflects its readyState.

Messages are JSON envelopes:

```jsonc
// keep-alive every ~20 s; client uses this to detect dead connections
{ "type": "ping" }

// fired once per confirmed event, from the worker via the EventBus
{
  "type": "event.confirmed",
  "event": {
    "id": "4e5fc429-...",
    "camera_id": "dda07333-...",
    "track_id": 12,
    "started_at": "2026-05-04T03:17:08.000Z",
    "ended_at":   "2026-05-04T03:17:23.000Z",
    "peak_confidence": 0.84,
    "clip_path": "...",
    "thumbnail_path": "..."
  }
}

// fired when a camera transitions status; also carries the latest
// last_seen_at heartbeat
{
  "type": "camera.status",
  "camera_id": "dda07333-...",
  "status": "online",
  "last_seen_at": "2026-05-04T03:17:13.158295Z",
  "last_error": null
}
```

Best-effort delivery: subscriber queues are sized 200; messages are
dropped on overflow. The dashboard tolerates this — TanStack Query
re-fetches on event arrival to fix any drift.

---

## Error envelope

FastAPI's standard format:

```json
{ "detail": "human-readable error" }
```

The frontend's `http()` helper unwraps `detail` automatically so
toast/inline errors show the message verbatim instead of the raw
status line.
