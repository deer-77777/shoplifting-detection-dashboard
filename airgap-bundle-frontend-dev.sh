#!/usr/bin/env bash
# Build a "dev" frontend docker image that contains source code, node_modules,
# and nginx — so the offline PC can edit files inside the container and
# rebuild without internet access. Larger than airgap-bundle-frontend.sh
# (~400 MB image, ~150 MB gzipped) but lets you make changes offline.
#
# Usage:
#   ./airgap-bundle-frontend-dev.sh [output-dir]

set -euo pipefail

OUT="${1:-airgap-bundle-frontend-dev}"
HERE="$(cd "$(dirname "$0")" && pwd)"
IMAGE_TAG="lossprev/frontend-standalone-dev:1.0"

mkdir -p "$OUT"

echo "[1/3] building dev frontend image ($IMAGE_TAG)..."
docker build \
    -f "$HERE/frontend/Dockerfile.dev" \
    -t "$IMAGE_TAG" \
    "$HERE/frontend"

echo "[2/3] saving image → $OUT/frontend-dev-image.tar ..."
docker save "$IMAGE_TAG" -o "$OUT/frontend-dev-image.tar"

echo "[3/3] writing run-frontend-dev.sh + README.txt ..."

cat > "$OUT/run-frontend-dev.sh" <<'EOF'
#!/usr/bin/env bash
# Run this on the offline PC. Loads the dev frontend image and starts it.
# The container includes /app (source + node_modules + dist + nginx).
# Edit files inside, run `rebuild`, refresh browser.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
IMAGE_TAG="lossprev/frontend-standalone-dev:1.0"
CONTAINER="lp_frontend"
PORT="${PORT:-5173}"

echo "[1/2] loading image from frontend-dev-image.tar ..."
docker load -i "$HERE/frontend-dev-image.tar"

echo "[2/2] (re)starting container $CONTAINER on port $PORT ..."
docker rm -f "$CONTAINER" 2>/dev/null || true
docker run -d \
    --name "$CONTAINER" \
    --restart unless-stopped \
    --add-host=host.docker.internal:host-gateway \
    -p "$PORT:80" \
    "$IMAGE_TAG"

cat <<MSG

frontend is up: http://<this-host-ip>:$PORT
logs:           docker logs -f $CONTAINER

editing source code on this offline PC:
  docker exec -it $CONTAINER sh           # shell into the container
  cd /app/src                              # source lives here
  vi App.tsx                               # edit with busybox vi
  exit
  docker exec $CONTAINER rebuild           # runs npm run build
  # refresh browser to see changes

backend must listen on 0.0.0.0:8000 (not 127.0.0.1) — the container
proxies /api/ → http://host.docker.internal:8000/api/
MSG
EOF
chmod +x "$OUT/run-frontend-dev.sh"

cat > "$OUT/README.txt" <<EOF
Frontend-only offline bundle (DEV — includes source + node_modules)
====================================================================

What's inside:
  frontend-dev-image.tar  docker image ($IMAGE_TAG)
                          contains: source code + node_modules + nginx + node
  run-frontend-dev.sh     one-command launcher

On the offline PC:
  ./run-frontend-dev.sh

Then open http://<this-host-ip>:5173 in a browser.

To edit source code on the offline PC:

  docker exec -it lp_frontend sh
  cd /app/src
  vi App.tsx            # busybox vi is available
  exit
  docker exec lp_frontend rebuild

  Then refresh the browser.

To copy a file out, edit on the host, and copy back:

  docker cp lp_frontend:/app/src/App.tsx ./App.tsx
  # edit ./App.tsx with whatever editor you like
  docker cp ./App.tsx lp_frontend:/app/src/App.tsx
  docker exec lp_frontend rebuild

To bind-mount your own source folder over the baked-in one (advanced):

  docker run -d --name lp_frontend \\
      --add-host=host.docker.internal:host-gateway \\
      -p 5173:80 \\
      -v /path/to/your/src:/app/src \\
      $IMAGE_TAG
  docker exec lp_frontend rebuild

Requirements on the offline PC:
  - docker engine installed
  - backend listening on 0.0.0.0:8000 (NOT 127.0.0.1:8000)

Override the listening port with PORT=8080 ./run-frontend-dev.sh
EOF

echo ""
echo "done. ship the entire directory ./$OUT/ to the offline PC."
echo "or gzip first:  tar czf ${OUT}.tar.gz $OUT/"
