# test-stream/

Source for the `rtsp-publisher` container in `docker-compose.dev.yml`.

The publisher checks three things in order; first match wins:

## 1. `images/` slideshow — best when you trained on still images

Drop your training/validation **images** here:

```
test-stream/
└── images/
    ├── frame001.jpg
    ├── frame002.jpg
    └── ...
```

The publisher stitches them into an RTSP stream — each image shown for 3
seconds (configurable via `SLIDE_SECONDS` env in the compose), upscaled to
1280×720 with letterboxing, looped forever. Because the model was trained on
these exact images, it will fire on essentially every frame and the dashboard
will show events fire reliably.

Recommended for testing because:
- guaranteed detection (model has seen these)
- you don't need to source video footage
- 3s per image × 2 fps sample rate → ~6 inferences per image, easily
  triggers the default 5-of-10 N-of-M state machine

After dropping files in:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml \
  up -d --force-recreate rtsp-publisher
docker compose -f docker-compose.yml -f docker-compose.dev.yml \
  logs --tail 5 rtsp-publisher
# expect: "[rtsp-publisher] slideshow: NNN images from /test/images -> rtsp://..."
```

## 2. First video file in this directory

Any `.mp4` / `.mkv` / `.mov` / `.avi`. The publisher loops it forever via
FFmpeg `-stream_loop -1`. Useful if you have video clips that match your
training distribution.

## 3. testsrc fallback

If neither `images/` nor a video file is present, the publisher pushes
FFmpeg's built-in `testsrc` color-bars pattern. Confirms the RTSP plumbing
end-to-end, but the model won't fire (testsrc is just colored bars + a
counter — nothing for a shoplifting model to recognize).

## Verifying the stream

From the host:

```bash
ffprobe -hide_banner -i rtsp://localhost:8554/stream1
# or
vlc rtsp://localhost:8554/stream1
```

The dashboard's Live page also shows a live MJPEG preview tile per camera.
