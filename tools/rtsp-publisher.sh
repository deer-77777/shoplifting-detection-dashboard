#!/usr/bin/env bash
# Pushes a stream into $RTSP_DEST. Source priority:
#   1. ./images/  — slideshow of every JPG/PNG (3s per image; great for
#                   testing a model trained on still images)
#   2. first video file in $VIDEO_DIR (mp4/mkv/mov/avi)
#   3. testsrc fallback so the publisher always has *something* to push
set -euo pipefail

DEST="${RTSP_DEST:-rtsp://mediamtx:8554/stream1}"
VIDEO_DIR="${VIDEO_DIR:-/test}"
IMG_DIR="$VIDEO_DIR/images"
SLIDE_SECS="${SLIDE_SECONDS:-3}"   # how long each image is shown
OUT_W="${OUT_W:-1280}"
OUT_H="${OUT_H:-720}"
OUT_FPS="${OUT_FPS:-15}"

build_concat_list() {
    local dir="$1" out="$2"
    : > "$out"
    shopt -s nullglob nocaseglob
    local files=( "$dir"/*.jpg "$dir"/*.jpeg "$dir"/*.png "$dir"/*.bmp )
    shopt -u nocaseglob
    if [[ ${#files[@]} -eq 0 ]]; then
        return 1
    fi
    # ffmpeg concat demuxer: each file followed by `duration N`, with the
    # final file repeated without `duration` so the encoder can flush.
    local last=""
    for f in "${files[@]}"; do
        printf "file '%s'\nduration %s\n" "$f" "$SLIDE_SECS" >> "$out"
        last="$f"
    done
    printf "file '%s'\n" "$last" >> "$out"
    echo "${#files[@]}"
}

# ---- mode 1: images/ slideshow -------------------------------------------
if [[ -d "$IMG_DIR" ]]; then
    LIST=$(mktemp /tmp/slideshow.XXXX.txt)
    if N=$(build_concat_list "$IMG_DIR" "$LIST"); then
        echo "[rtsp-publisher] slideshow: $N images from $IMG_DIR -> $DEST"
        echo "[rtsp-publisher]   ${SLIDE_SECS}s per image, ${OUT_W}x${OUT_H} @ ${OUT_FPS} fps"
        VF="scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=decrease,pad=${OUT_W}:${OUT_H}:(ow-iw)/2:(oh-ih)/2,fps=${OUT_FPS}"
        exec ffmpeg -hide_banner -loglevel warning \
            -re -stream_loop -1 -f concat -safe 0 -i "$LIST" \
            -vf "$VF" \
            -c:v libx264 -preset ultrafast -tune stillimage -pix_fmt yuv420p -g $((OUT_FPS*2)) \
            -an \
            -f rtsp -rtsp_transport tcp "$DEST"
    fi
fi

# ---- mode 2: first video file --------------------------------------------
VIDEO=""
shopt -s nullglob nocaseglob
for f in "$VIDEO_DIR"/*.mp4 "$VIDEO_DIR"/*.mkv "$VIDEO_DIR"/*.mov "$VIDEO_DIR"/*.avi; do
    VIDEO="$f"
    break
done
shopt -u nocaseglob

if [[ -n "$VIDEO" ]]; then
    echo "[rtsp-publisher] looping $VIDEO -> $DEST"
    exec ffmpeg -hide_banner -loglevel warning \
        -re -stream_loop -1 -i "$VIDEO" \
        -c:v libx264 -preset ultrafast -tune zerolatency -pix_fmt yuv420p -g 30 \
        -an \
        -f rtsp -rtsp_transport tcp "$DEST"
fi

# ---- mode 3: testsrc fallback --------------------------------------------
echo "[rtsp-publisher] no images/ folder and no video file in $VIDEO_DIR — falling back to testsrc"
exec ffmpeg -hide_banner -loglevel warning \
    -re -stream_loop -1 \
    -f lavfi -i "testsrc=size=1280x720:rate=15" \
    -c:v libx264 -preset ultrafast -tune zerolatency -pix_fmt yuv420p -g 30 \
    -an \
    -f rtsp -rtsp_transport tcp "$DEST"
