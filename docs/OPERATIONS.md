# Operations guide

Day-to-day actions for someone running the system in a real store.

---

## Adding the first camera

1. Open <http://localhost:5173>, go to the **Cameras** tab.
2. Click **+ Add Camera**.
3. **Name** — any human-friendly label, must be unique among active
   cameras (deleted cameras don't count).
4. **RTSP URL** — your IP camera's stream URL. Common forms:
   - Hikvision / similar — `rtsp://user:pass@192.168.1.42:554/Streaming/Channels/101`
   - Dahua — `rtsp://user:pass@192.168.1.42:554/cam/realmonitor?channel=1&subtype=0`
   - Axis — `rtsp://user:pass@192.168.1.42/axis-media/media.amp`
5. Save. The status dot transitions `connecting → online` once the
   stream is reading frames. If it stays `error`, hover the row for the
   `last_error`.

The credentials in the URL are stored as-is in the database and masked
on display in the UI (`rtsp://user:****@…`). Treat the DB row as
sensitive.

## Editing or removing cameras

- **Edit** — same modal, change name / URL / enabled. URL change
  recycles the worker (~5 s reconnect blip).
- **Enable toggle** — on the row, cheap and fast. Disabled cameras stop
  consuming GPU but stay in the list.
- **Delete** — soft-delete. The row is marked `is_deleted=true`, the
  worker stops, the name frees up for reuse, and historical events are
  preserved. To see them, enable "Show deleted cameras" on the Events
  page.

There's no UI for *hard* delete. To purge a soft-deleted camera and its
events permanently, drop the row in the DB:

```sql
DELETE FROM cameras WHERE id = '...' AND is_deleted = true;
-- ON DELETE CASCADE removes the events too. Clip files on disk are not
-- deleted automatically — see "Cleaning up orphaned clips" below.
```

---

## Tuning the state machine

Detailed knob descriptions: [CONFIGURATION.md](CONFIGURATION.md#runtime-settings-the-settings-page).

The four state-machine knobs work together. Read them as a sentence:

> "I'll only call it shoplifting if I see at least **N** confident
> detections within any **M** consecutive frames where this person was
> visible, and after I do, I won't fire again on the same person for
> **cooldown** seconds. The clip I save covers **pre-roll** seconds
> before the alert and **post-roll** seconds after."

The defaults — `5 / 10 / 30 / 5 / 10` — assume:
- A real shoplifting incident is at least 1–2 seconds long
- Sample fps is 8, so 5 detections in 10 frames ≈ "the model agrees over 1.25 s"
- Cooldown of 30 s collapses the per-frame burst that follows confirmation into one event
- 15 seconds of clip (5 + 10) gives reviewers context

### When defaults are wrong

| Symptom | Try |
|---|---|
| **Too many false positives.** Innocent shoppers trigger alerts. | Raise `conf_threshold` 0.5 → 0.65. If that misses real ones, instead raise `positive_required` 5 → 7 and shrink `positive_window` 10 → 8 (stricter density requirement). |
| **Missing real shoplifting.** Operator sees an act on the live feed; no event ever fires. | Lower `conf_threshold` 0.5 → 0.35. If still missing, lower `positive_required` 5 → 3. |
| **One incident produces 3+ alerts.** Same person, same act, multiple events 30–90 s apart. | Cooldown is too short for your store's flow. Raise `cooldown_seconds` 30 → 90. |
| **Quick incidents (< 1 s) never confirm.** | At 8 fps you only get 8 frames per second; N=5 needs 5 of those to be confident. Lower N to 3, or raise `SAMPLE_FPS` to 12 (env var, requires backend restart). |
| **Clips cut off too early.** | Raise `post_roll_seconds`. |
| **Clips don't show enough lead-up.** | Raise `pre_roll_seconds`. Watch RAM — buffer = `pre × fps × frame_size` per camera. |

### Workflow for tuning

1. Run the system for 24 h with defaults.
2. Open the **Events** page filtered to today.
3. For each event, watch the clip and label it mentally as
   `true positive` / `false positive`.
4. If TP rate > 90% but you're still missing some you saw on the live
   feed → loosen (lower `conf_threshold`, lower N).
5. If FP rate > 30% → tighten (raise `conf_threshold`, raise N, shrink
   M).
6. Re-run for 24 h, repeat.

Don't over-tune from a single shift's data — store traffic patterns
shift by hour and day.

---

## Reviewing and exporting events

- **Live page** — last 20 events on the right; click any card to play
  the clip in a modal.
- **Events page** — full history with filters (camera, date range, show
  deleted). Default range is **today's 0:00–24:00 in your local
  timezone**. Click "Show deleted cameras" to include archived data.
- **Direct file copy** — for evidence handoff, the clips and thumbs are
  at `/var/lib/docker/volumes/shoplifting-detection-dashboard_backend_storage/_data/`
  on the host, organised as `clips/<camera_id>/<event_id>.mp4` and
  `thumbnails/<camera_id>/<event_id>.jpg`. Copy via `docker cp` or
  directly from the volume path.

---

## Storage sizing

Per event, current settings (1080p source, 15 s clip @ 8 fps, libx264 ultrafast):

| Artifact | Size |
|---|---|
| MP4 clip | ~5–8 MB |
| JPEG thumbnail | ~300 KB |
| DB row + JSONB | ~5 KB |
| **Total** | **~6.3 MB / event** |

Rough scaling table assuming 100 events/day per camera (high — real
busy convenience stores see 10–30):

| Cameras | Daily | Monthly | Yearly |
|---|---|---|---|
| 1 | 600 MB | 19 GB | 230 GB |
| 10 | 6 GB | 190 GB | 2.3 TB |
| 100 | 63 GB | 1.9 TB | 23 TB |

What changes the number:

- **Lower events/day** → linear. The 100/day assumption is the worst-case
  ceiling.
- **720p instead of 1080p** → ~45% smaller clips.
- **Shorter post-roll** → linear in clip duration.
- **Longer post-roll or lossier preset** → grows fast.

---

## Retention

There's no automatic retention policy in v1 — clips and event rows
accumulate forever. For production add a periodic cleanup job. Two
patterns:

### Simple time-based retention (recommended)

Run from cron on the host or in a sidecar container:

```bash
# delete events older than 90 days, plus their clips/thumbs
docker compose exec -T postgres psql -U lpuser -d lossprev -t -c \
  "SELECT clip_path || '|' || thumbnail_path FROM events
    WHERE started_at < now() - interval '90 days';" \
  | while IFS='|' read -r clip thumb; do
      docker compose exec backend rm -f "$clip" "$thumb"
    done

docker compose exec -T postgres psql -U lpuser -d lossprev -c \
  "DELETE FROM events WHERE started_at < now() - interval '90 days';"
```

### Hot/cold tiering

Move clips older than 30 days off the SSD volume to a slower disk or
S3-compatible storage; re-encode them at lower resolution to save space.
Update `events.clip_path` to the new location. The API serves whatever
path the row points to.

---

## Cleaning up orphaned clips

If you hard-delete events outside the API (or wipe the DB while keeping
the volume), clip files become orphaned. To find and remove:

```bash
docker compose exec backend bash -c '
  cd /app/storage/clips
  for cam in */; do
    cam_id="${cam%/}"
    for clip in "$cam"*.mp4; do
      [[ -f "$clip" ]] || continue
      event_id=$(basename "$clip" .mp4)
      exists=$(echo "SELECT 1 FROM events WHERE id = '\''$event_id'\'' LIMIT 1;" | \
        psql "$DATABASE_URL" -t -A 2>/dev/null)
      if [[ -z "$exists" ]]; then
        echo "orphan: $clip"
        # rm "$clip"   # uncomment to actually delete
      fi
    done
  done
'
```

(That snippet uses `psql` inside the container; works because the
backend image already has psycopg2 / libpq and `DATABASE_URL` set.)

---

## Backup

Two things matter:

1. **`postgres_data` volume** — cameras, events, settings.
   ```bash
   docker compose exec -T postgres pg_dump -U lpuser -Fc lossprev > backup-$(date +%F).pgdump
   ```
2. **`backend_storage` volume** — clip MP4s and thumbnails.
   ```bash
   docker run --rm \
     -v shoplifting-detection-dashboard_backend_storage:/data:ro \
     -v $(pwd):/out \
     alpine \
     tar czf /out/clips-$(date +%F).tar.gz -C /data .
   ```

Restore is the reverse: `pg_restore` into a fresh DB and `tar -xzf`
into the volume.

---

## Health checks

| What | How |
|---|---|
| Process liveness | `curl http://localhost:8000/api/health` → `{"status":"ok"}` |
| Camera health | The dashboard sidebar shows `Online N / M`. Drill into Cameras tab for per-camera detail. |
| WebSocket connectivity | Sidebar bottom: `● Online` (green) / `Connecting` / `Offline`. |
| GPU utilisation | `docker compose exec backend nvidia-smi` (only on hosts with the toolkit). |
| DB size | `docker compose exec postgres psql -U lpuser -d lossprev -c "SELECT pg_size_pretty(pg_database_size('lossprev'));"` |
| Clip storage size | `docker run --rm -v shoplifting-detection-dashboard_backend_storage:/d alpine du -sh /d` |

---

## Scaling considerations

The single-process / single-GPU design is **fine up to roughly 10–20
cameras at 1080p / 8 fps** on one consumer GPU. Past that you'll hit:

1. **`GPU_LOCK` contention** — every inference is serialised. With 100
   cameras at 8 fps that's 800 serialised inferences/sec; a single
   4090 caps out long before. Solution: shard cameras across multiple
   backend processes, drop the global lock, give each process its own
   GPU.
2. **Pre-roll RAM** — 250 MB per 1080p camera × 100 cameras = 25 GB
   resident. Solution: drop pre-roll resolution (sample at 720p,
   upscale only the final clip), or back the buffer with a memory-mapped
   file.
3. **Disk write bursts** — finalising clips happens synchronously in
   the worker thread. With 100 cameras occasionally clipping
   concurrently, ffmpeg processes pile up. Solution: a thread pool
   dedicated to encoding, or a separate encoder service.

For the current scope (single store, ≤10 cameras), defaults are fine.
