# Air-gapped deployment

Build on an internet-connected machine, ship a single folder to the store,
run there with no network reach beyond the store LAN.

## Target host prerequisites (one-time, install offline)

These live on the host, not in the docker images:

- Docker engine + the `docker compose` plugin
- NVIDIA GPU driver (matching the GPU in the box)
- `nvidia-container-toolkit` (the runtime that wires the GPU into containers)

If the target's package mirror is reachable on the store LAN you can use the
distro's package manager. Otherwise stage the `.deb`/`.rpm` files alongside
the bundle and `apt install ./*.deb` on arrival.

## On the build host (with internet)

```bash
# 1. drop your trained weights at the repo root
cp /path/to/best.pt ./best.pt

# 2. build every image, save them and the compose config into one folder
./airgap-bundle.sh airgap-bundle

# 3. ship the folder
tar czf airgap-bundle.tar.gz airgap-bundle/
scp airgap-bundle.tar.gz store-host:/tmp/
```

The bundle contains:

```
airgap-bundle/
├── docker-compose.yml
├── .env
├── best.pt
├── images.tar              # lossprev/backend, lossprev/frontend, postgres:16-alpine
└── install.sh
```

## On the target host (no internet)

```bash
tar xzf /tmp/airgap-bundle.tar.gz -C /opt/
cd /opt/airgap-bundle
./install.sh
```

`install.sh` runs `docker load -i images.tar` then `docker compose up -d`.

Open `http://<store-host-ip>:5173`, add cameras, done.

## Why it works without internet

- **Frontend**: IBM Plex is bundled via `@fontsource/*` (no Google Fonts CDN).
- **Backend**: Ultralytics analytics are disabled at build time
  (`settings.update({'sync': False})`) and `Arial.ttf` is pre-cached, so the
  YOLO model never tries to call out on first inference.
- **Compose**: every service has `image:` + `pull_policy: never`, so
  `docker compose up` uses the loaded images and never reaches a registry.
- **No DB seed data needs the network**: alembic migrations run from the
  baked-in migration file.

## Updating

Rebuild on the internet host, re-run `airgap-bundle.sh`, copy the new tar
over, and on the target:

```bash
./install.sh           # docker load is idempotent — replaces existing tags
docker compose up -d   # recreates containers with the new images
```

The `postgres_data` and `backend_storage` volumes survive the recreate, so
your event history and clips are preserved.
