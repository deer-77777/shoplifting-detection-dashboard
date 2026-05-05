#!/usr/bin/env bash
# Dev-mode air-gap bundle: same as airgap-bundle.sh but also includes the
# mediamtx + rtsp-publisher dev infrastructure so the recipient can run
# the stack on a CPU-only host (no NVIDIA driver / nvidia-container-toolkit
# required) using your training images as a fake camera feed.
#
# Volumes (postgres_data, backend_storage) are NOT included — `docker save`
# only saves images, so the recipient gets a clean DB and an empty clip
# store on first boot.
#
# Usage:
#   ./airgap-bundle-dev.sh [output-dir]

set -euo pipefail

OUT="${1:-airgap-bundle-dev}"
HERE="$(cd "$(dirname "$0")" && pwd)"

if [[ ! -f "$HERE/best.pt" ]]; then
    echo "error: best.pt missing at repo root — copy your trained weights here first." >&2
    exit 1
fi

mkdir -p "$OUT"

echo "[1/5] building backend + frontend images (dev override applied)..."
docker compose \
    -f "$HERE/docker-compose.yml" \
    -f "$HERE/docker-compose.dev.yml" \
    build

# mediamtx isn't built — it's pulled. Make sure it's in the local cache.
echo "[2/5] ensuring mediamtx + postgres images are pulled locally..."
docker pull bluenviron/mediamtx:latest >/dev/null
docker pull postgres:16-alpine        >/dev/null

echo "[3/5] saving four images → $OUT/images.tar ..."
docker save \
    lossprev/backend:1.0 \
    lossprev/frontend:1.0 \
    postgres:16-alpine \
    bluenviron/mediamtx:latest \
    -o "$OUT/images.tar"

echo "[4/5] copying compose configs + tools + best.pt + .env ..."
cp "$HERE/docker-compose.yml"      "$OUT/docker-compose.yml"
cp "$HERE/docker-compose.dev.yml"  "$OUT/docker-compose.dev.yml"
cp "$HERE/best.pt"                 "$OUT/best.pt"
if [[ -f "$HERE/.env" ]]; then
    cp "$HERE/.env" "$OUT/.env"
else
    cp "$HERE/.env.example" "$OUT/.env"
fi

# tools/ holds the publisher script that the dev compose mounts at runtime.
mkdir -p "$OUT/tools"
cp "$HERE/tools/rtsp-publisher.sh" "$OUT/tools/rtsp-publisher.sh"
chmod +x "$OUT/tools/rtsp-publisher.sh"

# test-stream/ — bind mount target. Ship only the README so the directory
# exists with the right structure; the recipient drops their own images
# (or video files) in to feed the publisher.
mkdir -p "$OUT/test-stream/images"
if [[ -f "$HERE/test-stream/README.md" ]]; then
    cp "$HERE/test-stream/README.md" "$OUT/test-stream/README.md"
fi

cat > "$OUT/install-dev.sh" <<'EOF'
#!/usr/bin/env bash
# Run on the target host. Works on CPU-only machines (no NVIDIA toolkit
# needed). Drop your training images into ./test-stream/images/ before
# starting if you want the model to fire.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "[1/2] loading docker images from images.tar ..."
docker load -i "$HERE/images.tar"

echo "[2/2] starting stack (dev mode) ..."
cd "$HERE"
docker compose \
    -f docker-compose.yml \
    -f docker-compose.dev.yml \
    up -d

echo ""
echo "stack is up (dev mode, CPU inference)."
echo "  dashboard:   http://<this-host-ip>:5173"
echo "  RTSP feed:   rtsp://localhost:8554/stream1  (from this host)"
echo "  inside docker: rtsp://mediamtx:8554/stream1 (when adding the camera)"
echo ""
echo "drop training images into ./test-stream/images/ then:"
echo "    docker compose -f docker-compose.yml -f docker-compose.dev.yml \\"
echo "        up -d --force-recreate rtsp-publisher"
EOF
chmod +x "$OUT/install-dev.sh"

echo "[5/5] done."
echo ""
echo "ship the entire directory ./$OUT/ to the target. on the target:"
echo "    cd $OUT && ./install-dev.sh"
echo ""
echo "or gzip first:"
echo "    tar czf ${OUT}.tar.gz $OUT/"
