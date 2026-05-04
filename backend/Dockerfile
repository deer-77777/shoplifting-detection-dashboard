FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3.11 python3.11-venv python3-pip \
        libgl1 libglib2.0-0 \
        ffmpeg \
        ca-certificates \
        curl \
        tini \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.11 /usr/local/bin/python \
    && ln -sf /usr/bin/python3.11 /usr/local/bin/python3

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN python -m pip install --upgrade pip \
    && pip install --extra-index-url https://download.pytorch.org/whl/cu124 -r requirements.txt

# Pin Ultralytics' config dir inside the image and disable analytics so the
# model never tries to phone home at runtime. Pre-cache Arial.ttf in case any
# code path triggers the lazy font fetch.
ENV YOLO_CONFIG_DIR=/app/.config/Ultralytics \
    MPLCONFIGDIR=/app/.config/matplotlib
RUN mkdir -p $YOLO_CONFIG_DIR $MPLCONFIGDIR \
    && python -c "from ultralytics import settings; settings.update({'sync': False})" \
    && (curl -fsSL https://ultralytics.com/assets/Arial.ttf -o $YOLO_CONFIG_DIR/Arial.ttf \
        || echo 'arial fetch failed (non-fatal: only used for plotting)')

COPY . /app

RUN mkdir -p /app/storage/clips /app/storage/thumbnails \
    && chmod +x /app/entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/usr/bin/tini", "--", "/app/entrypoint.sh"]
