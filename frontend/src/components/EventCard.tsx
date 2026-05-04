import { format, formatDistanceToNowStrict } from "date-fns";
import { ja, enUS } from "date-fns/locale";
import { eventThumbnailUrl } from "../api/client";
import type { DetectionEvent } from "../api/types";
import { useI18n } from "../i18n";

export function EventCard({
  event,
  cameraName,
  onClick,
}: {
  event: DetectionEvent;
  cameraName?: string;
  onClick?: () => void;
}) {
  const { t, lang } = useI18n();
  const started = new Date(event.started_at);
  const locale = lang === "jp" ? ja : enUS;
  return (
    <button
      type="button"
      onClick={onClick}
      className="surface text-left w-full flex items-stretch gap-3 p-3 hover:border-[var(--color-border-strong)] transition-colors"
    >
      <div className="w-36 h-24 shrink-0 bg-black overflow-hidden">
        <img
          src={eventThumbnailUrl(event.id)}
          alt="event thumbnail"
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div className="flex items-start justify-between gap-2">
          <div className="text-[15px] font-medium truncate">
            {cameraName ?? event.camera_name ?? t("event.unknownCamera")}
          </div>
          <div className="label-mono">
            conf {event.peak_confidence.toFixed(2)}
          </div>
        </div>
        <div className="flex items-center gap-3 text-mono text-[12px]">
          <span style={{ color: "var(--color-text-dim)" }}>
            {format(started, "yyyy-MM-dd HH:mm:ss")}
          </span>
          <span style={{ color: "var(--color-text-muted)" }}>
            ·{" "}
            {formatDistanceToNowStrict(started, {
              addSuffix: true,
              locale,
            })}
          </span>
        </div>
        <div className="label-mono">track #{event.track_id}</div>
      </div>
    </button>
  );
}
