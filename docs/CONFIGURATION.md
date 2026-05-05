# Configuration

Two layers:

1. **Environment variables** — set at boot, read by `pydantic-settings`.
   Used to seed the database the very first time and as the source of
   truth for things that *can't* change at runtime (database URL, model
   path, device, sample fps).
2. **Runtime settings** — six knobs persisted in the `app_settings`
   table, edited live from the **Settings** page in the dashboard.
   Override the env-var defaults; survive restarts.

If a setting appears in both layers, the runtime cache wins.

---

## Environment variables

All defaults defined in [`backend/app/config.py`](../backend/app/config.py).
Override in `.env` or in the `environment:` block of `docker-compose.yml`.

### Database / paths

| Var | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://lpuser:lppass@postgres:5432/lossprev` | Used by the app at runtime. Migrations swap the dialect to `psycopg2` automatically. |
| `MODEL_PATH` | `/app/best.pt` | YOLO weights file. The container fails loudly on first inference if this is missing. |
| `DEVICE` | `cuda:0` | Torch device. Set to `cpu` in `docker-compose.dev.yml` for GPU-less hosts. |
| `CLIP_DIR` | `/app/storage/clips` | MP4 output. Backed by the `backend_storage` named volume. |
| `THUMB_DIR` | `/app/storage/thumbnails` | JPEG output. Same volume. |

### Inference / capture

| Var | Default | Notes |
|---|---|---|
| `SAMPLE_FPS` | `8` | Per-camera inference rate. Higher → more responsive but more GPU. Affects pre-roll/post-roll buffer **size** (in frames) but not the seconds. |
| `CONF_THRESHOLD` | `0.5` | Seed for the runtime cache. Edit on the **Settings** page after boot. |

### State machine

These four are env-var seeds for the runtime cache.
**Edit them via the dashboard, not by restarting the container.**

| Var | Default | Maps to runtime knob |
|---|---|---|
| `POSITIVE_REQUIRED` | `5` | `positive_required` (N) |
| `POSITIVE_WINDOW` | `10` | `positive_window` (M) |
| `COOLDOWN_SECONDS` | `30` | `cooldown_seconds` |
| `PRE_ROLL_SECONDS` | `5` | `pre_roll_seconds` |
| `POST_ROLL_SECONDS` | `10` | `post_roll_seconds` |

### Internal (rarely change)

| Var | Default | Notes |
|---|---|---|
| `track_idle_drop_seconds` | `5.0` | A track unseen for longer than this is dropped (unless in cooldown). |
| `rtsp_reconnect_max_backoff` | `60.0` | Cap on the exponential backoff between RTSP reconnect attempts. |
| `orchestrator_interval_seconds` | `10.0` | How often the orchestrator polls the DB for camera changes. Mutations also trigger an immediate reconcile. |

### Compose-only

These don't appear in `Settings` but matter for deployment:

- `OPENCV_FFMPEG_CAPTURE_OPTIONS` — set to `rtsp_transport;tcp` in the
  dev override. Forces TCP for RTSP (UDP doesn't traverse Docker
  bridges reliably). Real IP cameras prefer TCP anyway.
- `YOLO_CONFIG_DIR=/app/.config/Ultralytics` — set in the Dockerfile.
  Pinning the config dir lets the build pre-disable Ultralytics' phone-home
  (`settings.update({'sync': False})`) so the image works air-gapped.

---

## Runtime settings (the Settings page)

Persisted in the `app_settings` table, exposed at `/api/settings`,
edited from <http://localhost:5173/settings>.

| Knob | Range | Default | Hot-reload? | What it does |
|---|---|---|---|---|
| `conf_threshold` | 0.05 – 0.95 | 0.5 | **yes** | Minimum YOLO confidence for a frame to count as "positive". Lower → more events, more false positives. |
| `positive_required` (N) | 1 – 20 | 5 | no — restarts workers | Number of positive frames within the rolling window before a track is confirmed. |
| `positive_window` (M) | 1 – 50 | 10 | no — restarts workers | How many of the most recent visible frames the N-of-M check looks at. **Must be ≥ N**. |
| `cooldown_seconds` | 5 – 600 | 30 | no — restarts workers | After confirmation, the same track is locked out this long before it can fire another event. |
| `pre_roll_seconds` | 1 – 30 | 5 | no — restarts workers | Seconds of frames captured **before** confirmation, included at the start of the saved clip. Bounded by RAM. |
| `post_roll_seconds` | 1 – 60 | 10 | no — restarts workers | Seconds captured **after** confirmation before the clip is finalised to disk. |

**"Hot-reload"** means the change takes effect on the next inference
call — no worker restart, no UI blip. The other knobs are read once at
worker init (state-machine deque sizes, pre-roll buffer maxlen), so
changing them stops and restarts every running camera worker. Brief
~5 s reconnection blip per camera; the dashboard shows a toast
(`Cameras restart briefly when N or M changes.`) on save.

### Validation

- `positive_window` must be ≥ `positive_required`. The API rejects with
  `400` and the frontend shows an inline error.
- All numeric ranges above are enforced server-side via Pydantic. The
  HTML inputs `min`/`max` enforce the same bounds client-side.

### Reset to defaults

`POST /api/settings/reset` (or click **Reset to defaults** on the page)
restores every knob to the env-var seeds and triggers a worker restart.

---

## Frontend-only preferences

User preferences, persisted in `localStorage` per-browser. Not
persisted in the DB, not synced across devices.

| Key | Values | Default | Where set |
|---|---|---|---|
| `lp.theme.v2` | `dark` / `light` | `light` | Sidebar theme toggle |
| `lp.lang` | `en` / `jp` | `en` | Sidebar language toggle |

---

## Tuning cheat sheet

A compact mapping of "what's wrong" to "which knob to push":

| Symptom | Knob | Direction |
|---|---|---|
| Too many false alerts | `conf_threshold` | up |
| Too many false alerts (model fires on innocent behavior) | `positive_required` | up |
| Too many false alerts (positives flicker over a long span) | `positive_window` | down |
| Missing real shoplifting | `conf_threshold` | down |
| Quick incidents (<1 s) never confirm | `positive_required` | down |
| One incident becomes 5 alerts | `cooldown_seconds` | up |
| Same person can re-fire too aggressively | `cooldown_seconds` | up |
| Need to capture more lead-up in the clip | `pre_roll_seconds` | up |
| Need to capture more aftermath in the clip | `post_roll_seconds` | up |
| RAM pressure with many cameras | `pre_roll_seconds` | down |

Larger explanations and how the four state-machine knobs interact:
[OPERATIONS.md](OPERATIONS.md#tuning-the-state-machine).
