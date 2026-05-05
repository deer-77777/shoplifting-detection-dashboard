# Shoplifting Detection Dashboard

Production-ready loss-prevention system. Connects to RTSP IP cameras,
runs a trained YOLO model on a single on-prem GPU, deduplicates raw
detections via a per-track state machine, records pre-/post-roll clips
for confirmed incidents, and ships them to a dark ops-console web
dashboard with EN/JP localisation and a light/dark theme.

```
RTSP cameras  ──▶  worker thread per camera  ──▶  YOLO + ByteTrack
                                                    │
                                              state machine (N-of-M + cooldown)
                                                    │
                                              ┌─────┴─────┐
                                              ▼           ▼
                                          MP4 clip    JPEG thumb       ─▶  PostgreSQL events
                                                                       ─▶  WebSocket fan-out
                                                                       ─▶  Live dashboard
```

## Quick start

```bash
cp .env.example .env       # optional; defaults work
cp /path/to/best.pt ./     # required: your trained YOLO weights
docker compose up --build
```

Then open <http://localhost:5173>.

For local development without an NVIDIA GPU:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

The dev override drops the GPU reservation, switches to CPU inference,
and spins up a `mediamtx` virtual RTSP server fed by your training
images so you can exercise the full pipeline end-to-end.

## Documentation

| | |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | What the components are, how a frame becomes an event |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | Every env var + every runtime knob on the Settings page |
| [docs/API.md](docs/API.md) | REST + WebSocket reference |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Day-to-day operator guide: adding cameras, tuning thresholds, retention, sizing |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Local dev workflow, image rebuilds, troubleshooting |
| [AIRGAP.md](AIRGAP.md) | Building on an internet host, running on an air-gapped target — covers both `airgap-bundle.sh` (prod / GPU) and `airgap-bundle-dev.sh` (dev / CPU + test infra) |

## Stack

- **Backend** — Python 3.11, FastAPI, SQLAlchemy 2 async, asyncpg, Alembic, Ultralytics YOLO, OpenCV (headless)
- **Database** — PostgreSQL 16
- **Frontend** — React 18 + TypeScript, Vite, Tailwind v4, TanStack Query, React Router, Recharts, date-fns
- **Inference** — `model.track(persist=True, tracker="bytetrack.yaml")`, single GPU lock serialises all calls
- **Streaming** — RTSP in (cameras → backend), MJPEG out (`/api/cameras/{id}/preview` → `<img>` in browser)

## License

Internal. No third-party redistribution.
