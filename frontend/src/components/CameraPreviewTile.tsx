import { useEffect, useMemo, useState } from "react";
import type { Camera } from "../api/types";
import { cameraPreviewUrl } from "../api/client";
import { StatusDot } from "./StatusDot";
import { useI18n } from "../i18n";

export function CameraPreviewTile({
  camera,
  onExpand,
  compact = false,
}: {
  camera: Camera;
  onExpand?: (cam: Camera) => void;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const nonce = useMemo(() => camera.rtsp_url, [camera.rtsp_url]);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  // Reset when status flips back to non-online so the next online transition
  // re-shows the "Connecting…" overlay until frames flow again. Depend on the
  // primitive `status`, not the whole camera object — TanStack Query refetch
  // creates new object refs that would otherwise spuriously reset `loaded`.
  useEffect(() => {
    if (camera.status !== "online") {
      setLoaded(false);
      setErrored(false);
    }
  }, [camera.status]);

  const isOnline = camera.status === "online";
  const showStream = isOnline && !errored;

  return (
    <button
      type="button"
      onClick={() => onExpand?.(camera)}
      className="surface text-left w-full flex flex-col group hover:border-[var(--color-accent)] transition-colors"
      title={camera.last_error ?? camera.name}
    >
      <div className="aspect-video w-full bg-black overflow-hidden relative">
        {showStream && (
          <img
            src={cameraPreviewUrl(camera.id, nonce)}
            alt={`${camera.name} live preview`}
            className="w-full h-full object-cover"
            onLoad={() => setLoaded(true)}
            onError={() => setErrored(true)}
          />
        )}

        {(!showStream || !loaded) && (
          <div className="absolute inset-0 flex items-center justify-center label-mono text-[var(--color-text-muted)] pointer-events-none">
            {!isOnline
              ? t(`status.${camera.status}` as
                  | "status.offline"
                  | "status.connecting"
                  | "status.online"
                  | "status.error")
              : errored
                ? t("status.error")
                : t("preview.connecting")}
          </div>
        )}

        {/* Top-left: status dot + camera name */}
        <div className="absolute top-2 left-2 flex items-center gap-2 bg-[var(--color-bg)]/75 backdrop-blur-sm px-2 py-1 rounded-sm">
          <StatusDot status={camera.status} size={compact ? 7 : 8} />
          <span className={`text-mono font-medium ${compact ? "text-[10px]" : "text-[11px]"}`}>
            {camera.name}
          </span>
        </div>

        {/* Top-right: LIVE indicator (online only) */}
        {showStream && loaded && (
          <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-[var(--color-bg)]/75 backdrop-blur-sm px-2 py-1 rounded-sm">
            <span
              className="status-dot pulse-accent"
              style={{ background: "var(--color-accent)" }}
            />
            <span className="text-mono text-[10px] font-semibold uppercase tracking-widest">
              LIVE
            </span>
          </div>
        )}

        {/* Hover overlay: 'Click to expand' affordance */}
        <div className="absolute inset-0 bg-[var(--color-bg)]/0 group-hover:bg-[var(--color-bg)]/20 transition-colors pointer-events-none flex items-center justify-center opacity-0 group-hover:opacity-100">
          <span className="label-mono bg-[var(--color-bg)]/85 px-2 py-1 rounded-sm">
            {t("preview.expand")}
          </span>
        </div>
      </div>
    </button>
  );
}
