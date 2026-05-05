# Architecture

How a single RTSP frame becomes one event row + one MP4 clip + one
thumbnail in front of the operator. Top-down, then component-by-component.

## Big picture

```
                  cameras (DB)                                     events (DB)
                      ▲                                                ▲
                      │ status / last_seen                             │ insert
                      │                                                │
   ┌──────────────────┴───────────────────────────────────────────────┴──────┐
   │                                                                         │
   │  PipelineOrchestrator (asyncio task in FastAPI)                         │
   │      reconciles workers vs DB every 10 s + on API mutation              │
   │                                                                         │
   │      ┌──── CameraWorker (1 thread per camera) ───┐  ... (N cams)        │
   │      │                                            │                     │
   │      │  cv2.VideoCapture (RTSP) ──▶ frame queue   │                     │
   │      │              │                             │                     │
   │      │              ▼ sample @ SAMPLE_FPS         │                     │
   │      │   YoloEngine.track()  ─── GPU_LOCK ───┐    │                     │
   │      │              │                        │    │                     │
   │      │              ▼                        ▼    │                     │
   │      │   TrackStateMachine                  (1 GPU shared by all cams)  │
   │      │   (N-of-M + cooldown per track)                                  │
   │      │              │                                                   │
   │      │              ▼ confirmed                                         │
   │      │   _ActiveRecording (pre-roll + post-roll)                        │
   │      │              │                                                   │
   │      │              ▼ post-roll done                                    │
   │      │   clip_writer (ffmpeg → libx264) + thumbnail (cv2)               │
   │      │              │                                                   │
   │      └──────────────┼─────────────────────┬────────────────────────────┘
   │                     │                     │
   │                     ▼                     ▼
   │          on_event_confirmed()   on_status_change()
   │                     │                     │
   │                     ▼                     ▼
   │         orchestrator._apply_event   orchestrator._apply_status_change
   │                     │                     │
   │                     ▼                     ▼
   │                  EventBus.publish_threadsafe()  ─▶  asyncio.Queue per WS subscriber
   │                                                          │
   └──────────────────────────────────────────────────────────┼──────────────┐
                                                              ▼              │
                                                      WebSocket fan-out      │
                                                      /api/ws/events         │
                                                                             ▼
                                                                      browser dashboard
```

## Components

### Camera worker (`backend/app/pipeline/camera_worker.py`)

One Python `Thread` per enabled camera. Two inner threads:

- **Reader thread** does nothing but `cv2.VideoCapture.read()` in a tight
  loop. Drops the previous frame when a new one arrives — the processor
  always sees only the **latest** frame so it can never fall behind.
- **Processor loop** wakes at `1 / SAMPLE_FPS` intervals, grabs the
  latest frame, runs inference, drives the state machine, and feeds any
  active recordings.

The worker also holds:
- A **pre-roll deque** (`maxlen = pre_roll_seconds × sample_fps`) of recent
  frames. RAM only. When a track confirms, the deque becomes the start
  of the clip.
- A **list of active recordings**. Each `_ActiveRecording` is one
  in-progress clip keyed by `(camera_id, track_id)`. Multiple
  simultaneous recordings are supported (different tracks confirming
  near-simultaneously).
- A **preview frame** cell behind a separate lock. The MJPEG endpoint
  reads from this without blocking inference.

On RTSP read failure → exponential backoff (1 s → 2 s → 4 s → … capped at
60 s) and a `status="error"` push.

### Inference engine (`backend/app/pipeline/inference.py`)

`YoloEngine` — one instance **per camera**, lazy-loaded on first frame.
Why one per camera: Ultralytics' `model.track(persist=True)` keeps the
ByteTrack state inside the model object; sharing across cameras would
mix track IDs.

Every `.track()` call goes through a single process-wide
`threading.Lock` (`GPU_LOCK`) so only one inference runs at a time
across the whole backend. Single-GPU assumption baked in here.

The tracker config switches based on confidence threshold:
- `conf_threshold ≥ 0.25` → ultralytics' default `bytetrack.yaml`
- `conf_threshold < 0.25` → bundled `bytetrack_permissive.yaml` with
  floored thresholds, so weak detections can still form tracks during
  testing.

### State machine (`backend/app/pipeline/state_machine.py`)

Per-track finite-state machine keyed on `(camera_id, track_id)`:

```
observing ──▶ suspicious ──▶ confirmed ──▶ cooldown
   ▲                              │            │
   │                              │            │ cooldown elapses
   └──────────────────────────────┴────────────┘ + idle drop
```

- **observing** — track exists, no positive frames yet
- **suspicious** — at least one positive, building toward N-of-M
- **confirmed** — N positives within last M visible frames; **emits the
  event exactly once**
- **cooldown** — locked out for `cooldown_seconds` after firing

Tracks unseen for >5 s are dropped (unless in cooldown — those linger
until cooldown ends).

The state machine is what turns ~60 raw per-frame YOLO detections of a
2-second incident into **one** event.

### Clip writer (`backend/app/pipeline/clip_writer.py`)

Takes the recording's frame list (pre-roll + post-roll) and pipes raw
BGR bytes to `ffmpeg`'s stdin. FFmpeg encodes with `libx264 -preset
ultrafast -pix_fmt yuv420p -movflags +faststart`. Output is real H.264
in MP4 — playable in every browser via the `<video>` tag.

`opencv-python-headless` doesn't ship with libx264 linked in, so
`cv2.VideoWriter('avc1', ...)` silently degrades to mpeg4/mp4v which
browsers refuse. Going through ffmpeg subprocess is the reliable path.

### Pipeline orchestrator (`backend/app/pipeline/orchestrator.py`)

One asyncio task running inside the FastAPI lifespan. Its job:

- **Reconcile** — every `orchestrator_interval_seconds` (default 10 s)
  AND on demand (after every camera CRUD), query the DB for
  `(enabled = true AND is_deleted = false)` cameras, then start/stop
  workers to match.
- **Bridge** thread → asyncio. Worker hooks
  (`on_event_confirmed`, `on_status_change`) capture the FastAPI loop
  and use `asyncio.run_coroutine_threadsafe` to schedule DB writes and
  WebSocket fan-outs from the worker thread.
- **Hot-restart** — `restart_all_workers()` is called by the settings
  API when the operator changes a knob that requires re-initialising
  per-camera state (deque sizes, pre-roll buffers).

### Event bus (`backend/app/event_bus.py`)

In-process pub/sub. Publishers (workers, orchestrator) call
`publish_threadsafe(message)` from any thread. The bus uses
`loop.call_soon_threadsafe` to fan the message out to every subscriber
queue. Consumers (WebSocket handlers) `await` on their queue and forward
to the browser.

Subscribers that fall behind drop messages (queue maxlen 200) — the
event bus is best-effort, not durable.

### Runtime settings (`backend/app/runtime_settings.py`)

In-memory, thread-safe holder for the six tunable knobs
(`conf_threshold`, `positive_required`, `positive_window`,
`cooldown_seconds`, `pre_roll_seconds`, `post_roll_seconds`). The
single-row `app_settings` table in Postgres is the source of truth; the
runtime cache is hydrated on boot by `_bootstrap_runtime_settings()`.

PATCH `/api/settings` writes both — DB row first, then runtime cache —
and triggers `restart_all_workers()` if any of the restart-keyed knobs
changed.

### Frontend (`frontend/src/`)

- **TanStack Query** caches `cameras`, `events`, `stats`, `settings`.
  Mutations invalidate the relevant prefix.
- **EventStreamProvider** opens a single WebSocket on app mount; the
  connection state ("open" / "connecting" / "closed") is exposed to
  any component via `useEventStream()`.
- **Pages**: Live, Events, Cameras, Stats, Settings. Live page is a
  two-column layout — adaptive camera grid on the left, sticky events
  feed on the right.
- **Theme + i18n** are React contexts, persisted in `localStorage`.
  Theme drives `<html data-theme="dark|light">`; i18n drives
  `t(key, vars)` lookups against EN / JP dictionaries.

## Critical invariants

These three properties are load-bearing — keep them when refactoring:

1. **One incident → exactly one event row.** Frame-level YOLO produces
   tens of detections per incident. The state machine deduplicates them.
   Code that bypasses the state machine (e.g. logging "raw" detections
   to the DB) will spam.
2. **Pre-roll lives in RAM only.** No frame is ever written to disk
   until the state machine has confirmed the event. Disk wear and
   privacy concerns both depend on this.
3. **All YOLO inference goes through `GPU_LOCK`.** A single GPU is
   shared by all camera workers. Removing the lock in the name of
   "performance" causes silent torch/CUDA contention.

## Data flow for one event (timeline)

```
t=0.000    suspect enters frame; YOLO detects with conf=0.62 (positive)
                state.observe(track=7, positive=True)
                state machine:  observing → suspicious  (no event yet)

t=0.125    next sampled frame; conf=0.55 (positive)
                positive count in last 10 frames = 2

t=0.250    third positive (count=3)
t=0.375    fourth positive (count=4)
t=0.500    fifth positive (count=5)  ← N reached
                state machine:  suspicious → confirmed
                worker._begin_recording():
                    snapshot pre_roll deque (last 5s of frames)
                    create _ActiveRecording, schedule 10s of post-roll

t=0.500 to t=10.500    worker keeps appending each new frame to recording

t=10.500   post_roll_target=0; worker._finalize():
                ffmpeg encodes 15s of frames → /app/storage/clips/<cam>/<event>.mp4
                cv2.imwrite peak-conf frame → /app/storage/thumbnails/<cam>/<event>.jpg
                hooks.on_event_confirmed(payload)
                                │
t=10.501   orchestrator._apply_event:
                INSERT INTO events (...) VALUES (...)
                bus.publish_threadsafe({"type": "event.confirmed", ...})
                                │
t=10.501   WebSocket fan-out to all browser subscribers
                                │
t=10.502   dashboard: AlertBanner flashes, toast appears, EventCard
           renders, TanStack Query refetches /api/events
```

From positive #1 to alert in the UI: ≈10.5 seconds at default settings,
of which 10 seconds is intentional post-roll capture.
