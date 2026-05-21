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

## Offline / air-gapped deployment

For deploying to a store host that has no internet access. Build on a
machine with internet, ship a single tarball, run with no internet on
the target side. Four bundle variants are available — pick the one
that matches how the target host is set up:

| Variant | When to use | Bundle size | Contains |
|---|---|---|---|
| **Production** (`./airgap-bundle.sh`) | Target has Docker + NVIDIA GPU + nvidia-container-toolkit; you want the **whole stack** in containers | ~5.2 GB | backend, frontend, postgres |
| **Development** (`./airgap-bundle-dev.sh`) | Target is CPU-only (teammate's laptop, demo box); you want fake-camera test infra included | ~5.3 GB | backend, frontend, postgres, mediamtx + publisher |
| **Frontend-only** (`./airgap-bundle-frontend.sh`) | Target already has the **backend running natively** (Python packages installed on the host); you only need to ship the UI | ~21 MB | frontend only (built `dist/` + nginx) |
| **Frontend-only / editable** (`./airgap-bundle-frontend-dev.sh`) | Same as above, but you also want to **edit source code on the offline PC** and rebuild without internet | ~161 MB | frontend image including source + node_modules + node + nginx + `rebuild` helper |

### Frontend-only bundle (backend runs natively on the offline PC)

This is the smallest, fastest path when the offline PC already has the
backend's Python environment installed and managed outside Docker.

```bash
# on a machine with internet
./airgap-bundle-frontend.sh
tar czf airgap-bundle-frontend.tar.gz airgap-bundle-frontend/
# transfer the 21 MB .tar.gz to the offline PC

# on the offline PC
tar xzf airgap-bundle-frontend.tar.gz
cd airgap-bundle-frontend && ./run-frontend.sh
# dashboard at http://<offline-pc-ip>:5173
```

**The native backend must bind to `0.0.0.0:8000`, not `127.0.0.1:8000`.**
The frontend container reaches the host through the docker bridge, not
the host's loopback — `127.0.0.1` from inside the container points at
the container itself. Start uvicorn the same way the docker entrypoint
does:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
```

### Frontend-only editable bundle (same as above, but with source code)

Use this when you need to tweak the UI directly on the offline PC.
The image is larger (~161 MB tarball) because it bakes in the full
source tree, node_modules, and node — so `npm run build` works offline.

```bash
# on a machine with internet
./airgap-bundle-frontend-dev.sh
tar czf airgap-bundle-frontend-dev.tar.gz airgap-bundle-frontend-dev/

# on the offline PC
tar xzf airgap-bundle-frontend-dev.tar.gz
cd airgap-bundle-frontend-dev && ./run-frontend-dev.sh

# edit a file inside the container, rebuild, refresh browser
docker exec -it lp_frontend sh
cd /app/src && vi App.tsx        # busybox vi is available
exit
docker exec lp_frontend rebuild   # runs `npm run build`
```

See [AIRGAP.md](AIRGAP.md) for the full walkthrough of all four
bundles, host setup, troubleshooting, and update workflow.

## Documentation

| | |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | What the components are, how a frame becomes an event |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | Every env var + every runtime knob on the Settings page |
| [docs/API.md](docs/API.md) | REST + WebSocket reference |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Day-to-day operator guide: adding cameras, tuning thresholds, retention, sizing |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Local dev workflow, image rebuilds, troubleshooting |
| [AIRGAP.md](AIRGAP.md) | Building on an internet host, running on an air-gapped target — covers `airgap-bundle.sh` (prod / GPU, full stack), `airgap-bundle-dev.sh` (dev / CPU + test infra), `airgap-bundle-frontend.sh` (frontend-only built bundle, ~21 MB), and `airgap-bundle-frontend-dev.sh` (frontend-only with source + node_modules for offline editing, ~161 MB) |

## Stack

- **Backend** — Python 3.11, FastAPI, SQLAlchemy 2 async, asyncpg, Alembic, Ultralytics YOLO, OpenCV (headless)
- **Database** — PostgreSQL 16
- **Frontend** — React 18 + TypeScript, Vite, Tailwind v4, TanStack Query, React Router, Recharts, date-fns
- **Inference** — `model.track(persist=True, tracker="bytetrack.yaml")`, single GPU lock serialises all calls
- **Streaming** — RTSP in (cameras → backend), MJPEG out (`/api/cameras/{id}/preview` → `<img>` in browser)

## License

Internal. No third-party redistribution.
