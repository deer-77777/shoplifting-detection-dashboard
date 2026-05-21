# Development guide

Local workflow, common commands, and the failure modes you're most
likely to hit.

---

## Repo layout

```
shoplifting-detection-dashboard/
├── backend/                    # FastAPI + SQLAlchemy + Ultralytics
│   ├── Dockerfile              # nvidia/cuda:12.4 base + python 3.11 + ffmpeg
│   ├── alembic/                # migrations
│   ├── app/
│   │   ├── api/                # routers: cameras, events, stats, settings, websocket, health
│   │   ├── pipeline/           # camera_worker, orchestrator, inference, state_machine, clip_writer
│   │   ├── config.py           # env-var loader (pydantic-settings)
│   │   ├── runtime_settings.py # in-memory cache for the Settings page
│   │   ├── database.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   └── main.py             # FastAPI lifespan + router registration
│   └── requirements.txt
├── frontend/                   # React 18 + Vite + Tailwind v4
│   ├── Dockerfile              # multi-stage: node build → nginx serve
│   ├── nginx.conf              # /api/ proxy with WS upgrade + buffer-off
│   └── src/
│       ├── api/                # client.ts + types.ts
│       ├── components/         # Sidebar, AlertBanner, CameraPreviewTile, etc.
│       ├── hooks/              # useCameras, useEvents, useStats, useSettings, useEventStream
│       ├── pages/              # Live, Events, Cameras, Stats, Settings
│       ├── i18n.tsx            # EN + JP dictionary
│       ├── theme.tsx           # dark/light theme provider
│       └── App.tsx
├── tools/
│   └── rtsp-publisher.sh       # ffmpeg loop for the dev RTSP server
├── test-stream/                # bind-mounted into the publisher
│   └── images/                 # drop training images here for the slideshow
├── docker-compose.yml          # production stack (GPU)
├── docker-compose.dev.yml      # dev override (CPU + mediamtx + publisher)
├── airgap-bundle.sh                # offline transfer — full stack (backend + frontend + postgres)
├── airgap-bundle-dev.sh            # offline transfer — full stack + CPU + test infra
├── airgap-bundle-frontend.sh       # offline transfer — frontend only (~21 MB, when backend runs natively)
├── airgap-bundle-frontend-dev.sh   # offline transfer — frontend + source + node_modules (~161 MB, editable offline)
└── docs/                           # ← you are here
```

---

## Common commands

### Bring it up

```bash
# production (needs NVIDIA GPU + nvidia-container-toolkit)
docker compose up --build

# local dev (CPU + mediamtx + image slideshow)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

### Rebuild one service

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml \
  up -d --build backend          # or frontend, mediamtx, etc.
```

### Logs

```bash
docker compose logs -f backend                                # follow
docker compose logs --since 60s backend                       # last minute
docker compose logs backend 2>&1 | grep -v 'GET /api'         # filter API noise
```

### Wipe everything

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v
# -v also removes postgres_data + backend_storage volumes
```

### Run a one-off SQL query

```bash
docker compose exec postgres psql -U lpuser -d lossprev -c \
  "SELECT count(*) FROM events;"
```

### Hit the API directly (skipping nginx)

```bash
curl -s http://localhost:8000/api/cameras | python3 -m json.tool
```

---

## Backend dev workflow

The backend's source is `COPY`'d into the image, not bind-mounted, so
**code changes require a rebuild** of the backend container:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build backend
```

Build time on a warm cache is ~10 s (just the `COPY` layer + ffmpeg
checks).

If you want true hot-reload of Python code, mount the `app/` directory
in the dev override:

```yaml
backend:
  volumes:
    - ./backend/app:/app/app:ro
  command: ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```

### Migrations

Adding a new column or table:

```bash
# autogenerate (in the running container — needs DB connectivity)
docker compose exec backend alembic revision --autogenerate -m "add foo"

# manual edit recommended; regenerate by hand for non-trivial changes
# (the `alembic/versions/0001_initial.py` and friends are all hand-written)
```

The `entrypoint.sh` runs `alembic upgrade head` on every backend
container start, so migrations apply automatically as part of `up`.

### Adding a new runtime setting

If you need another knob like `conf_threshold`:

1. Add the env-var to `app/config.py` `Settings`.
2. Add the column to `app/models.py` `AppSettings` + a new alembic
   migration.
3. Add to `app/runtime_settings.py` `_Snapshot`, `DEFAULTS`, and a
   `@property` accessor.
4. Add to `app/schemas.py` `SettingsOut` + bounds on `SettingsUpdate`.
5. Add to `_RESTART_KEYS` in `app/api/settings.py` if it requires a
   worker restart.
6. Wire the worker / inference / state machine to read from
   `runtime.<your_knob>` instead of `settings.<your_knob>`.
7. Frontend: add the field to `AppSettings` type, the `FormState` in
   `pages/Settings.tsx`, the dirty-check, the form render, and the i18n
   keys.

---

## Frontend dev workflow

For UI iteration, run the Vite dev server directly on the host (no
Docker) — it's much faster than rebuilding the nginx image:

```bash
cd frontend
npm install
npm run dev
```

Opens on <http://localhost:5173> with HMR. The Vite proxy in
`vite.config.ts` forwards `/api/` to `localhost:8000`, so you need the
backend running (in Docker is fine).

For production-style testing (build + nginx serving the bundle), rebuild
the frontend container:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build frontend
```

### Type checking

```bash
cd frontend
npm run build       # tsc -b && vite build — same checks CI runs
```

### i18n keys

The dictionary lives in `src/i18n.tsx`. Both EN and JP are required
(the type system enforces matching keys via
`as const satisfies Record<Lang, Record<string, string>>`). When you
add a key to `en`, TypeScript will complain until you also add it to
`jp`.

Variable interpolation uses `{name}` placeholders:

```tsx
t("alert.title", { camera: cam?.name ?? "unknown" })
// dict: "Confirmed incident — {camera}"
```

### Tailwind v4

Theme tokens live in [`src/index.css`](../frontend/src/index.css)
under `@theme { ... }` plus a light-mode override
`:root[data-theme="light"] { ... }`. Adding a new color / size:

```css
@theme {
  --color-accent-2: #1fb47a;
  /* now accessible as bg-accent-2, text-accent-2, etc. */
}
```

Lots of files use the verbose `text-[var(--color-x)]` form which
generates identical CSS to `text-x` — both are valid. Tailwind's
canonical-class linter flags the verbose form as a "hint", not an
error.

---

## Test data

For testing without a real IP camera, the dev override spins up:

- **`mediamtx`** — RTSP server on port 8554
- **`rtsp-publisher`** — ffmpeg pushing into mediamtx

The publisher checks three sources in order:

1. `test-stream/images/` — slideshow of every JPG/PNG in the folder,
   3 s per image (configurable via `SLIDE_SECONDS`). **Best for testing
   detection** — drop your training images here and the model will fire.
2. First video file in `test-stream/` (`.mp4`/`.mkv`/`.mov`/`.avi`) —
   loops it forever.
3. `testsrc` (FFmpeg color-bars) fallback if neither of the above is
   present.

Add `rtsp://mediamtx:8554/stream1` as a camera in the dashboard. From
*your host* (VLC, ffprobe) the same stream is at
`rtsp://localhost:8554/stream1`.

After dropping new files in `test-stream/`:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml \
  up -d --force-recreate rtsp-publisher
```

---

## Troubleshooting

### Backend keeps restarting on boot

Check `docker compose logs backend`. Most common causes:

- **`AssertionError: Status code 204 must not have a response body`** —
  FastAPI 0.115 stricter validation. Already fixed; if you re-introduce
  it, set `response_model=None` on the route.
- **`Field "model_path" in Settings has conflict with protected
  namespace "model_"`** — Pydantic v2. Fixed by setting
  `protected_namespaces=()` in `Settings.model_config`.
- **`DATABASE_URL is not set`** — alembic env.py raises this. Likely
  cause: `.env` not loaded into the container. Compare the env block in
  `docker-compose.yml`.

### Camera stuck on `error`, `last_error: "failed to open RTSP stream"`

- **Wrong host** — `rtsp://localhost:8554/...` doesn't work *from*
  inside the backend container. Use the docker service name:
  `rtsp://mediamtx:8554/...`. From your host browser/VLC, `localhost`
  works because port 8554 is mapped.
- **Publisher crashed** — check `docker compose logs rtsp-publisher`.
  An invalid video file (`moov atom not found`) crash-loops the
  publisher.
- **Real camera firewall** — verify with `ffprobe`:
  ```bash
  docker compose exec backend ffprobe -rtsp_transport tcp -i rtsp://...
  ```

### Browser plays no video, just shows the controls

Almost certainly the codec. `cv2.VideoWriter` with prebuilt
opencv-python-headless wheels writes mpeg4/mp4v which browsers
**refuse**. Confirm:

```bash
docker compose exec backend ffprobe -hide_banner -i /app/storage/clips/<cam>/<event>.mp4 2>&1 | grep Video
# Want: "h264 (...) (avc1 / ...)"
# Bad:  "mpeg4 (Simple Profile) (mp4v / ...)"
```

The fix is already in `clip_writer.py` (pipes raw frames through
`ffmpeg → libx264`). If you re-introduce `cv2.VideoWriter`-based
writes, the browser will silently fail again.

### Model loads but no events ever fire

In order of likelihood:

1. **Training/data mismatch** — your model was trained on Store A
   footage; you're testing on completely different visual style. Inspect
   detections directly:
   ```bash
   docker compose exec backend python3 -c "
   from ultralytics import YOLO; import cv2
   m = YOLO('/app/best.pt'); print(m.names)
   img = cv2.imread('/path/to/frame.jpg')
   res = m.predict(img, conf=0.05, verbose=False)
   print('detections:', 0 if res[0].boxes is None else len(res[0].boxes))
   "
   ```
   If the model returns 0 detections at conf=0.05, the model just
   doesn't recognise this content.
2. **`conf_threshold` too high** for what the model emits — try 0.1
   temporarily on the Settings page.
3. **ByteTrack drops weak detections** — when the runtime
   `conf_threshold < 0.25`, the bundled
   `bytetrack_permissive.yaml` kicks in automatically. If you bypass
   that path, even confident detections won't form tracks because
   ByteTrack's default `new_track_thresh` is 0.25.

### `docker compose up` tries to download images on the air-gapped target

Each service in `docker-compose.yml` has `pull_policy: never` and
explicit `image:` tags. If you see pull attempts, your compose version
is older than 2.20 (which introduced `pull_policy`). Upgrade compose,
or `docker save`/`docker load` the images and rely on the local cache.

### `useEffect` keeps re-running and resetting state

TanStack Query refetches produce **new object references** for the
same logical entity. If a `useEffect` depends on the whole object
(`[camera, ...]`), it'll run on every poll. Depend on the primitive id
instead (`[camera?.id, ...]`). Bit me twice — once on the fullscreen
modal "CONNECTING…" bug, once almost on the tile.

---

## Releasing

There's no real release process — this is internal. Rough flow when you
deploy a new version to a store:

1. Bump `lossprev/backend:1.0` and `lossprev/frontend:1.0` in
   `docker-compose.yml` to `:1.1` (or whatever).
2. `docker compose build` on an internet host.
3. Pick the bundle script that matches the target:
   - `./airgap-bundle.sh` — full GPU stack in containers (~5.2 GB)
   - `./airgap-bundle-dev.sh` — full CPU stack + test infra (~5.3 GB)
   - `./airgap-bundle-frontend.sh` — frontend only (~21 MB), when the
     target runs the backend natively in its own Python environment
   - `./airgap-bundle-frontend-dev.sh` — frontend + source + node_modules
     (~161 MB), same as above but lets you edit the UI source on the
     offline PC and rebuild without internet
4. Ship the resulting `.tar.gz`; on the target, the included
   `install.sh` / `install-dev.sh` / `run-frontend.sh` handles
   `docker load` + `docker run` (or `compose up`).
5. Volumes survive across image rebuilds, so the DB and clip history
   are preserved unless you explicitly `down -v`.

See [AIRGAP.md](../AIRGAP.md) for the full walkthrough of each bundle.
