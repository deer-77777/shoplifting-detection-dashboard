import { useEffect, useState } from "react";
import type { Camera } from "../api/types";
import { cameraPreviewUrl } from "../api/client";
import { StatusDot } from "./StatusDot";
import { useI18n } from "../i18n";

export function CameraFullscreenModal({
  camera,
  onClose,
}: {
  camera: Camera | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [loaded, setLoaded] = useState(false);
  const id = camera?.id;

  // Depend on the camera id, not the camera object reference: TanStack Query
  // refetches produce new object references for the same logical camera and
  // would otherwise reset `loaded` mid-stream.
  useEffect(() => {
    setLoaded(false);
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id, onClose]);

  if (!camera) return null;

  const isOnline = camera.status === "online";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="surface w-[min(96vw,1600px)] h-[min(94vh,1000px)] flex flex-col">
        {/* header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <StatusDot status={camera.status} size={10} />
            <div className="text-[16px] font-semibold truncate">
              {camera.name}
            </div>
            <span className="label-mono">
              {t(`status.${camera.status}` as
                | "status.offline"
                | "status.connecting"
                | "status.online"
                | "status.error")}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--color-text-dim)] hover:text-[var(--color-text)] text-base px-2"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* video area: flex-1 min-h-0 so it grows to fill remaining height
            without overflowing the modal; img uses max-w/h-full so it
            scales down to fit while preserving aspect ratio. */}
        <div className="flex-1 min-h-0 bg-black relative flex items-center justify-center">
          {isOnline && (
            <img
              src={cameraPreviewUrl(camera.id, camera.rtsp_url)}
              alt={`${camera.name} live preview`}
              className="max-w-full max-h-full"
              onLoad={() => setLoaded(true)}
            />
          )}
          {(!isOnline || !loaded) && (
            <div className="absolute inset-0 flex items-center justify-center label-mono text-[var(--color-text-muted)]">
              {!isOnline
                ? t(`status.${camera.status}` as
                    | "status.offline"
                    | "status.connecting"
                    | "status.online"
                    | "status.error")
                : t("preview.connecting")}
            </div>
          )}
          {isOnline && loaded && (
            <div className="absolute top-3 right-3 flex items-center gap-2 bg-black/70 backdrop-blur-sm px-3 py-1.5 rounded-sm">
              <span
                className="status-dot pulse-accent"
                style={{ background: "var(--color-accent)" }}
              />
              <span className="text-mono text-[12px] font-semibold uppercase tracking-widest text-white">
                LIVE
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
