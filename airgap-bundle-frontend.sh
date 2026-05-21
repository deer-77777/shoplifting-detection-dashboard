#!/usr/bin/env bash
# Build frontend-only docker image on a machine WITH internet, save it as a
# tar that ships to an offline PC where the backend runs natively (Python
# packages already installed on that host).
#
# Usage:
#   ./airgap-bundle-frontend.sh [output-dir]
#
# Result: <output-dir>/ contains:
#   - frontend-image.tar     (the docker image)
#   - run-frontend.sh        (one-command launcher for the offline PC)
#   - README.txt             (short instructions)

set -euo pipefail

OUT="${1:-airgap-bundle-frontend}"
HERE="$(cd "$(dirname "$0")" && pwd)"
IMAGE_TAG="lossprev/frontend-standalone:1.0"

mkdir -p "$OUT"

echo "[1/3] building frontend image ($IMAGE_TAG)..."
docker build \
    -f "$HERE/frontend/Dockerfile.standalone" \
    -t "$IMAGE_TAG" \
    "$HERE/frontend"

echo "[2/3] saving image → $OUT/frontend-image.tar ..."
docker save "$IMAGE_TAG" -o "$OUT/frontend-image.tar"

echo "[3/3] writing run-frontend.sh + README.txt ..."

cat > "$OUT/run-frontend.sh" <<'EOF'
#!/usr/bin/env bash
# Run this on the offline PC. Loads the frontend image and starts it.
# The container's nginx proxies /api/ to host.docker.internal:8000, which
# resolves to the host machine via --add-host=host.docker.internal:host-gateway.
# That means the natively-running backend on port 8000 is reachable from
# inside the container without any extra networking setup.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
IMAGE_TAG="lossprev/frontend-standalone:1.0"
CONTAINER="lp_frontend"
PORT="${PORT:-5173}"

echo "[1/2] loading image from frontend-image.tar ..."
docker load -i "$HERE/frontend-image.tar"

echo "[2/2] (re)starting container $CONTAINER on port $PORT ..."
docker rm -f "$CONTAINER" 2>/dev/null || true
docker run -d \
    --name "$CONTAINER" \
    --restart unless-stopped \
    --add-host=host.docker.internal:host-gateway \
    -p "$PORT:80" \
    "$IMAGE_TAG"

echo ""
echo "frontend is up: http://<this-host-ip>:$PORT"
echo "logs:           docker logs -f $CONTAINER"
echo ""
echo "the container proxies /api/ → http://host.docker.internal:8000/api/"
echo "make sure your backend is listening on the host at 0.0.0.0:8000"
echo "(NOT 127.0.0.1:8000 — that's unreachable from inside the container)"
EOF
chmod +x "$OUT/run-frontend.sh"

cat > "$OUT/README.txt" <<EOF
Frontend-only offline bundle
============================

What's inside:
  frontend-image.tar   docker image ($IMAGE_TAG)
  run-frontend.sh      one-command launcher

On the offline PC:
  ./run-frontend.sh

Then open http://<this-host-ip>:5173 in a browser.

Requirements on the offline PC:
  - docker engine installed
  - backend running natively on the host, listening on 0.0.0.0:8000
    (binding to 127.0.0.1 will NOT work — the container needs to reach
    the host via host.docker.internal which routes through the docker bridge)

Override the port with PORT=8080 ./run-frontend.sh
EOF

echo ""
echo "done. ship the entire directory ./$OUT/ to the offline PC."
echo "or gzip first:  tar czf ${OUT}.tar.gz $OUT/"
