import { useEffect, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { ja, enUS } from "date-fns/locale";
import { useEventStream } from "../hooks/useEventStream";
import { useCameras } from "../hooks/useCameras";
import { useI18n } from "../i18n";

const AUTO_DISMISS_MS = 8000;

export function AlertBanner() {
  const { lastEvent } = useEventStream();
  const { data: cameras } = useCameras();
  const { t, lang } = useI18n();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!lastEvent) return;
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [lastEvent]);

  if (!visible || !lastEvent) return null;

  const camera = cameras?.find((c) => c.id === lastEvent.camera_id);
  const ts = new Date(lastEvent.started_at);
  const locale = lang === "jp" ? ja : enUS;

  return (
    <div
      className="flash-banner border border-[var(--color-accent)] text-[var(--color-on-accent)] px-4 py-3.5 flex items-center gap-4"
      role="alert"
    >
      <div className="text-mono text-[12px] uppercase tracking-widest font-semibold">
        {t("alert.label")}
      </div>
      <div className="h-6 w-px bg-[var(--color-on-accent)]/40" />
      <div className="flex-1 flex items-baseline gap-3">
        <div className="font-semibold text-[15px]">
          {t("alert.title", {
            camera: camera?.name ?? t("alert.unknownCamera"),
          })}
        </div>
        <div className="text-mono text-[12px]">
          conf {lastEvent.peak_confidence.toFixed(2)} · track #
          {lastEvent.track_id} ·{" "}
          {formatDistanceToNowStrict(ts, { addSuffix: true, locale })}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setVisible(false)}
        className="text-mono text-[12px] font-semibold uppercase tracking-widest"
      >
        {t("alert.dismiss")}
      </button>
    </div>
  );
}
