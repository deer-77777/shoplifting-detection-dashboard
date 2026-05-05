# Air-gapped deployment

Build the stack on an internet-connected machine, transfer one tarball
to the target, run with no internet on the target side.

There are **two bundles**, each producing a self-contained `.tar.gz`:

| Bundle | Script | Target | Includes |
|---|---|---|---|
| **Production** | [`airgap-bundle.sh`](airgap-bundle.sh) | Store host with NVIDIA GPU + nvidia-container-toolkit | 3 images: backend, frontend, postgres |
| **Development** | [`airgap-bundle-dev.sh`](airgap-bundle-dev.sh) | CPU-only host (teammate, demo box) | 4 images: backend, frontend, postgres, **mediamtx**, plus the `rtsp-publisher` script and an empty `test-stream/` for fake-camera testing |

Pick the one that fits the target. Both produce a clean image-only
bundle — `docker save` does not include Docker volumes, so the
recipient always boots with an empty database and empty clip store.
Your local history stays on your machine.

## TL;DR — production bundle (GPU target)

```bash
# on dev box (internet)
cp /path/to/best.pt ./
./airgap-bundle.sh airgap-bundle
tar czf airgap-bundle.tar.gz airgap-bundle/

# transfer the single .tar.gz
scp airgap-bundle.tar.gz store-host:/tmp/

# on store host (LAN-only, no internet, but with Docker + NVIDIA driver
# + nvidia-container-toolkit already installed)
tar xzf /tmp/airgap-bundle.tar.gz -C /opt/
cd /opt/airgap-bundle && ./install.sh

# stack is up at http://<store-ip>:5173
```

## TL;DR — development bundle (CPU-only target, includes test infra)

Same shape, different script. Use this when the target host has no
NVIDIA GPU (a teammate's laptop, a demo machine), or when you want to
ship a stack that already includes the fake-camera infrastructure
(`mediamtx` + `rtsp-publisher`) so the recipient can drop training
images into `test-stream/images/` and exercise the pipeline without a
real IP camera.

```bash
# on dev box (internet)
cp /path/to/best.pt ./
./airgap-bundle-dev.sh airgap-bundle-dev
tar czf airgap-bundle-dev.tar.gz airgap-bundle-dev/

# transfer
scp airgap-bundle-dev.tar.gz target-host:/tmp/

# on target host (Docker installed; no GPU / no nvidia-container-toolkit needed)
tar xzf /tmp/airgap-bundle-dev.tar.gz -C /opt/
cd /opt/airgap-bundle-dev && ./install-dev.sh

# stack is up at http://<target-ip>:5173
# RTSP feed at rtsp://localhost:8554/stream1 (from the host)
# from inside the docker network: rtsp://mediamtx:8554/stream1
```

The rest of this document is detail — what's inside each tar, what the
host needs, why it works without internet, and how to handle updates.

---

## What's inside

Both bundles are self-contained transfers. After untarring:

### Production bundle (`airgap-bundle/`)

```
airgap-bundle/
├── docker-compose.yml      ← production compose (no GPU override, no dev services)
├── .env                    ← seeded from .env.example; edit if needed
├── best.pt                 ← your trained YOLO weights (from the repo root)
├── images.tar              ← three Docker images saved together
└── install.sh              ← docker load + docker compose up
```

`images.tar` packs exactly three images:

| Image | Why |
|---|---|
| `lossprev/backend:1.0` | FastAPI + Ultralytics + ffmpeg + the migration code |
| `lossprev/frontend:1.0` | nginx serving the built React SPA |
| `postgres:16-alpine` | Database |

Dev-only services (`mediamtx`, `rtsp-publisher`) are **not** included
because they aren't in `docker-compose.yml` — only in
`docker-compose.dev.yml`, which `airgap-bundle.sh` ignores.

### Development bundle (`airgap-bundle-dev/`)

```
airgap-bundle-dev/
├── docker-compose.yml         ← prod compose (still needed; dev override layers on top)
├── docker-compose.dev.yml     ← dev override (CPU + mediamtx + publisher)
├── .env
├── best.pt
├── images.tar                 ← FOUR images
├── install-dev.sh             ← uses BOTH compose files
├── tools/
│   └── rtsp-publisher.sh      ← bind-mounted by the dev override
└── test-stream/
    ├── README.md
    └── images/                ← empty; recipient drops training images here
```

`images.tar` adds `bluenviron/mediamtx:latest` (~50 MB) for a fourth
image. The `rtsp-publisher` service in `docker-compose.dev.yml` reuses
`lossprev/backend:1.0` (same image, different entrypoint), so no
extra image is needed for it.

**No volumes** are saved by either bundle. `docker save` archives
images, not volumes — so the recipient gets a fresh DB and empty clip
store on first boot. Your local history (events, clips, tuned
settings) stays on your machine.

### Reference sizes (rough)

What you'll actually see when running this end to end:

| Artifact | Size |
|---|---|
| `images.tar` (raw, prod) | ~9.5 GB (mostly `lossprev/backend:1.0`, ~9.8 GB image — CUDA + torch + ultralytics) |
| **`airgap-bundle.tar.gz` (gzipped, prod)** | **~5.2 GB** ← what you ship for production |
| **`airgap-bundle-dev.tar.gz` (gzipped, dev)** | **~5.3 GB** ← what you ship for dev (extra ~50 MB for mediamtx) |
| `lossprev/frontend:1.0` | ~50 MB |
| `postgres:16-alpine` | ~280 MB |
| `bluenviron/mediamtx:latest` | ~53 MB |

Plan for a USB stick of at least 8 GB or a network transfer that can
move a 5+ GB file.

---

## On the build host (internet, no GPU required)

You do **not** need a GPU on the build host. The Dockerfile builds the
backend image starting from `nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04`,
but pulling and layering on top of a CUDA base image works on any
linux-amd64 host with Docker. You only need a GPU + nvidia-container-toolkit
to *run* the resulting container.

Prereqs:

- Docker engine + `docker compose` plugin
- ~30 GB free disk during the build (pip caches torch, the
  intermediate layers add up)
- Internet (to pull base images and pip/npm packages)
- The trained `best.pt` weights file

```bash
cp /path/to/best.pt ./best.pt

# choose one:
./airgap-bundle.sh     airgap-bundle        # for the GPU-equipped store
./airgap-bundle-dev.sh airgap-bundle-dev    # for a CPU-only target with test infra
```

`airgap-bundle.sh` does:

1. `docker compose -f docker-compose.yml build` — produces tagged
   images `lossprev/backend:1.0` and `lossprev/frontend:1.0`. No
   container start; works on a non-GPU host.
2. `docker save lossprev/backend:1.0 lossprev/frontend:1.0
   postgres:16-alpine -o airgap-bundle/images.tar`.
3. Copies `docker-compose.yml`, `best.pt`, and either your `.env` or
   `.env.example` into the folder.
4. Drops a generated `install.sh` into the folder.

`airgap-bundle-dev.sh` is the same plus:

- Builds with **both** compose files so the publisher service is taken
  into account (it reuses the backend image — no extra build).
- `docker pull bluenviron/mediamtx:latest` to make sure mediamtx is in
  the local cache.
- `docker save` adds `bluenviron/mediamtx:latest` as the fourth image.
- Copies `docker-compose.dev.yml`, `tools/rtsp-publisher.sh`, and the
  `test-stream/README.md` skeleton.
- Drops a generated `install-dev.sh` that runs with both `-f` flags.

Then gzip the folder for transfer:

```bash
tar czf airgap-bundle.tar.gz     airgap-bundle/        # prod
# or
tar czf airgap-bundle-dev.tar.gz airgap-bundle-dev/    # dev
```

You **only need to copy the single `.tar.gz`** to the target. The
unpacked staging folder stays on the build host; you can delete it
after the `.tar.gz` is made.

### Updating

Rebuild on the dev box with the new code, re-run the script, ship the
new `.tar.gz`. On the target:

```bash
tar xzf /tmp/airgap-bundle.tar.gz -C /opt/   # overwrites previous bundle
cd /opt/airgap-bundle && ./install.sh        # docker load replaces tags
```

`docker load` is idempotent — it replaces images with matching
`name:tag`. The `postgres_data` and `backend_storage` volumes survive
the recreate, so cameras, events, settings, and clip files are
preserved across updates.

---

## On the target host (no internet, LAN-only)

### One-time host setup

These live on the host, **not** in the Docker images:

- Docker engine + `docker compose` plugin (always required)
- For the **production bundle**: NVIDIA GPU driver + `nvidia-container-toolkit`
- For the **dev bundle**: nothing else — runs on CPU on any Linux host

If the store LAN can reach a corporate package mirror, install via the
distro's package manager. If truly offline, stage `.deb` files
alongside the bundle:

```bash
# on a similarly-versioned online machine, e.g. Ubuntu 22.04:
apt-get download docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin
apt-get download nvidia-container-toolkit
# … plus their transitive deps; `apt-rdepends` helps

# transfer the .debs to the store and on the store:
sudo apt install ./*.deb
sudo systemctl enable --now docker
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

Verify the host is ready:

```bash
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
```

You should see your GPU. If you do, the bundle will work.

### Installing the bundle

For the **production bundle**:

```bash
tar xzf /tmp/airgap-bundle.tar.gz -C /opt/
cd /opt/airgap-bundle
./install.sh
```

`install.sh`:

1. `docker load -i images.tar` — registers all three images.
2. `docker compose up -d` — starts the stack against `docker-compose.yml`
   only.

For the **development bundle**:

```bash
tar xzf /tmp/airgap-bundle-dev.tar.gz -C /opt/
cd /opt/airgap-bundle-dev
./install-dev.sh
```

`install-dev.sh`:

1. `docker load -i images.tar` — registers all four images.
2. `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d`
   — starts the prod stack **plus** `mediamtx` and `rtsp-publisher`.

In both cases `pull_policy: never` is set on every service, so compose
uses the loaded images and never tries to reach a registry.

Verify the stack came up:

```bash
docker compose ps
# expect: lp_postgres (healthy), lp_backend (running), lp_frontend (running)

curl -s http://localhost:8000/api/health
# {"status": "ok"}

curl -s http://localhost:8000/api/cameras
# []   ← empty until you add cameras via the UI
```

Open `http://<target-ip>:5173` from any LAN browser, navigate to
**Cameras**, and add your IP cameras. See
[docs/OPERATIONS.md](docs/OPERATIONS.md) for the operator workflow.

For the dev bundle specifically, drop training images into
`./test-stream/images/` on the target host and recreate the publisher
to feed the model:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml \
    up -d --force-recreate rtsp-publisher
```

The fake camera URL to add in the dashboard is `rtsp://mediamtx:8554/stream1`
(use the docker service name `mediamtx`, not `localhost`, since the
backend resolves it through the docker bridge network).

---

## Why it works without internet

Four things had to be made offline-safe:

1. **Frontend fonts** — IBM Plex is bundled via `@fontsource/ibm-plex-*`
   packages instead of fetched from `fonts.googleapis.com` at runtime.
   See [`frontend/src/main.tsx`](frontend/src/main.tsx).
2. **Ultralytics phone-home** — During the backend image build,
   `python -c "from ultralytics import settings;
   settings.update({'sync': False})"` runs and `Arial.ttf` is
   pre-cached into `YOLO_CONFIG_DIR=/app/.config/Ultralytics`. See
   [`backend/Dockerfile`](backend/Dockerfile).
3. **Compose registry pulls** — every service has `image:` +
   `pull_policy: never`, so `docker compose up` uses the loaded images
   and never reaches a registry.
4. **DB seed data** — Alembic migrations run from baked-in Python
   files; no `seed.sql` fetched from anywhere. The runtime settings
   row is seeded from env-var defaults at first boot.

---

## Troubleshooting

### `./airgap-bundle.sh` fails on the build host

| Symptom | Likely cause | Fix |
|---|---|---|
| `error: best.pt missing at repo root` | weights not in place | `cp /path/to/best.pt ./` first |
| pip install timeouts during build | corporate proxy blocking PyPI | export `HTTP_PROXY` / `HTTPS_PROXY` before running |
| `no space left on device` | CUDA layers fill the cache | reclaim with `docker system prune -af` |
| `failed to solve: process ... did not complete successfully: exit code: 1` on `apt-get install` line | base-image apt repo unreachable | retry; if persistent, your distro mirror is unhappy |

### `./install.sh` fails on the store host

| Symptom | Likely cause | Fix |
|---|---|---|
| `could not select device driver "" with capabilities: [[gpu]]` | `nvidia-container-toolkit` not installed | install it offline (see above) and `sudo systemctl restart docker` |
| `pull access denied for lossprev/backend` | image wasn't loaded — `docker load` step skipped | re-run `docker load -i images.tar` |
| Backend container restart loops | best.pt mount missing | check `ls -la best.pt` in `/opt/airgap-bundle/`; the compose file mounts `./best.pt:/app/best.pt:ro` |
| Postgres unhealthy | volume permission issue on rare distros | check `docker compose logs postgres`; usually a SELinux label fix |

### Images load but the dashboard shows no cameras / no events

That's expected on first boot — the database is empty. Add cameras
through the **Cameras** page. If you're updating an existing
deployment and your data vanished, you almost certainly ran
`docker compose down -v` (the `-v` wipes the volumes). Restore from
backup; see [docs/OPERATIONS.md](docs/OPERATIONS.md#backup).

---

## Related docs

- [docs/OPERATIONS.md](docs/OPERATIONS.md) — adding cameras, tuning thresholds, retention
- [docs/CONFIGURATION.md](docs/CONFIGURATION.md) — every env var + every Settings page knob
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — how to rebuild and what the bundle script actually does internally
