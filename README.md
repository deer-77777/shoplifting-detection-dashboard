# Shoplifting Detection Dashboard

Production-ready loss-prevention system. Connects to RTSP IP cameras, runs a
trained YOLO model on a single on-prem GPU, deduplicates detections via a
per-track state machine, records pre-/post-roll clips for confirmed
incidents, and ships them to a dark ops-console web dashboard.

## Architecture

- **Backend**: FastAPI + SQLAlchemy 2 async + asyncpg + Ultralytics YOLO + OpenCV.
  One worker thread per enabled camera. Single GPU lock serializes inference.
  In-process pub/sub bus (`asyncio.Queue` + `loop.call_soon_threadsafe`) bridges
  detection threads to WebSocket subscribers.
- **State machine**: `(camera_id, track_id)` keyed; states `observing →
  suspicious → confirmed → cooldown`. A track is confirmed when at least
  `POSITIVE_REQUIRED` (default 5) positive frames appear within the last
  `POSITIVE_WINDOW` (default 10) frames in which it was visible. After
  confirmation, the track is locked out for `COOLDOWN_SECONDS` (default 30).
  Tracks unseen for >5 s are dropped.
- **Pre-roll buffer**: 5 s of frames held in RAM only. On confirmation, the
  worker continues capturing for 10 s of post-roll, then writes an MP4 clip
  and JPEG thumbnail to disk.
- **Database**: PostgreSQL 16. Single Alembic migration creates `cameras` and
  `events`.
- **Frontend**: React 18 + TypeScript + Vite + Tailwind v4 + TanStack Query +
  React Router + Recharts.

## Prerequisites

1. Linux host with an NVIDIA GPU.
2. Docker & Docker Compose v2.
3. [`nvidia-container-toolkit`](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html)
   installed and the daemon restarted, so `docker run --gpus all` works.
4. A trained YOLO weights file named `best.pt` in the project root.

## One-command startup

```bash
cp .env.example .env        # optional; defaults work
cp /path/to/best.pt ./      # required
docker compose up --build
```

Then open <http://localhost:5173>.

The backend container runs `alembic upgrade head` on boot, so the schema is
created automatically. Camera workers spawn the moment a camera row is
inserted (and reconcile every 10 s thereafter).

## Adding the first camera

1. Open the dashboard at <http://localhost:5173>.
2. Navigate to **Cameras** in the left sidebar.
3. Click **+ Add camera**.
4. Enter a friendly name and the RTSP URL (e.g.
   `rtsp://user:pass@192.168.1.42:554/Streaming/Channels/101`).
5. Save. The status dot transitions `connecting → online` once the stream is
   reading frames. If it stays `error`, hover the row for the last error
   message; check the backend logs with `docker compose logs -f backend`.

Confirmed incidents arrive in real time on the **Live** page (alert banner +
toast + WebSocket connection indicator in the sidebar). All historical events
with playable clips are on the **Events** page.

## Configuration

All knobs are environment variables consumed via `pydantic-settings`. Edit
`.env` (or override in `docker-compose.yml`):

| Var | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | (built from compose) | Async SQLAlchemy URL |
| `MODEL_PATH` | `/app/best.pt` | YOLO weights |
| `DEVICE` | `cuda:0` | Torch device |
| `CLIP_DIR` | `/app/storage/clips` | MP4 output |
| `THUMB_DIR` | `/app/storage/thumbnails` | JPEG output |
| `SAMPLE_FPS` | `8` | Inference rate per camera |
| `CONF_THRESHOLD` | `0.5` | Min confidence for a positive frame |
| `COOLDOWN_SECONDS` | `30` | Per-track lockout after confirmation |
| `PRE_ROLL_SECONDS` | `5` | RAM-only buffer ahead of incident |
| `POST_ROLL_SECONDS` | `10` | Capture window after confirmation |
| `POSITIVE_REQUIRED` | `5` | N in the N-of-M rule |
| `POSITIVE_WINDOW` | `10` | M in the N-of-M rule |

## Local development without a GPU

You can run the whole stack on CPU for UI work, or just the frontend on its
own.

**Frontend only** (fast, no Docker required):

```bash
cd frontend && npm install && npm run dev
```

Open <http://localhost:5173>. The Vite dev server proxies `/api/` to
`localhost:8000`, so API calls error out unless you also start the backend.

**Full stack on CPU** (slow inference but everything works end-to-end):

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

The override drops the NVIDIA GPU reservation and forces `DEVICE=cpu`. You
still need `best.pt` at the repo root.

## Air-gapped deployment

The store machine has no internet — the dashboard is built to ship that
way. Build on an internet host, run `./airgap-bundle.sh`, copy the
resulting folder to the store, run `./install.sh`. See [AIRGAP.md](AIRGAP.md)
for details.

## Notes

- **No auth in v1** — the system is on a private store network. Add an auth
  layer in front of `/api/` before exposing it.
- **CORS** is open in development; lock it down for production.
- **Timestamps** are UTC throughout the API; the frontend formats to local
  time on display.
- **Clip codec**: written as `mp4v` for portability. For production, remux
  the source H.264 stream instead of re-encoding (TODO in
  `backend/app/pipeline/clip_writer.py`).
