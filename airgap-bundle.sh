#!/usr/bin/env bash
# Build all images on a machine WITH internet, then assemble a single folder
# you can ship to the air-gapped store host.
#
# Usage:
#   ./airgap-bundle.sh [output-dir]
#
# Result: <output-dir>/ contains everything the target host needs.

set -euo pipefail

OUT="${1:-airgap-bundle}"
HERE="$(cd "$(dirname "$0")" && pwd)"

if [[ ! -f "$HERE/best.pt" ]]; then
    echo "error: best.pt missing at repo root — copy your trained weights here first." >&2
    exit 1
fi

mkdir -p "$OUT"

echo "[1/4] building images (this takes a while; needs internet)..."
docker compose -f "$HERE/docker-compose.yml" build

echo "[2/4] saving images → $OUT/images.tar ..."
docker save \
    lossprev/backend:1.0 \
    lossprev/frontend:1.0 \
    postgres:16-alpine \
    -o "$OUT/images.tar"

echo "[3/4] copying compose config + best.pt + .env ..."
cp "$HERE/docker-compose.yml" "$OUT/docker-compose.yml"
cp "$HERE/best.pt"            "$OUT/best.pt"
if [[ -f "$HERE/.env" ]]; then
    cp "$HERE/.env" "$OUT/.env"
else
    cp "$HERE/.env.example" "$OUT/.env"
fi

cat > "$OUT/install.sh" <<'EOF'
#!/usr/bin/env bash
# Run this on the air-gapped target host. Prerequisites that must already be
# installed there: Docker engine + docker compose plugin + NVIDIA driver +
# nvidia-container-toolkit.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "[1/2] loading docker images from images.tar ..."
docker load -i "$HERE/images.tar"

echo "[2/2] starting stack ..."
cd "$HERE"
docker compose up -d

echo ""
echo "stack is up. dashboard: http://<this-host-ip>:5173"
echo "backend logs:  docker compose logs -f backend"
EOF
chmod +x "$OUT/install.sh"

echo "[4/4] done."
echo ""
echo "ship the entire directory ./$OUT/ to the store. on the target:"
echo "    cd $OUT && ./install.sh"
