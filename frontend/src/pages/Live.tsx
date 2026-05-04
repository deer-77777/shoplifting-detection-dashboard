import { useEffect, useState } from "react";
import { useEvents } from "../hooks/useEvents";
import { useCameras } from "../hooks/useCameras";
import { useEventStream } from "../hooks/useEventStream";
import { useToast } from "../components/Toast";
import { CameraStatusStrip } from "../components/CameraStatusStrip";
import { AlertBanner } from "../components/AlertBanner";
import { EventCard } from "../components/EventCard";
import { EventDetailModal } from "../components/EventDetailModal";
import { useI18n } from "../i18n";

export function LivePage() {
  const { data: events } = useEvents({ limit: 20 });
  const { data: cameras } = useCameras();
  const { subscribe } = useEventStream();
  const toast = useToast();
  const { t } = useI18n();
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    return subscribe((m) => {
      if (m.type !== "event.confirmed") return;
      const cam = cameras?.find((c) => c.id === m.event.camera_id);
      toast.show({
        level: "alert",
        title: t("toast.incident.title", {
          camera: cam?.name ?? t("toast.unknownCamera"),
        }),
        body: t("toast.incident.body", {
          id: m.event.track_id,
          conf: m.event.peak_confidence.toFixed(2),
        }),
      });
    });
  }, [subscribe, toast, cameras, t]);

  const cameraName = (id: string) =>
    cameras?.find((c) => c.id === id)?.name;

  return (
    <div className="flex flex-col gap-5">
      <AlertBanner />

      <PageHeader title={t("live.title")} subtitle={t("live.subtitle")} />

      <CameraStatusStrip />

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-[16px] font-semibold">{t("live.recent")}</h2>
          <span className="label-mono">{t("live.recent.range")}</span>
        </div>
        {!events || events.length === 0 ? (
          <div className="surface px-4 py-12 text-center">
            <div className="text-[15px] text-[var(--color-text-dim)]">
              {t("live.empty.title")}
            </div>
            <div className="label-mono mt-2">{t("live.empty.body")}</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {events.map((e) => (
              <EventCard
                key={e.id}
                event={e}
                cameraName={cameraName(e.camera_id)}
                onClick={() => setSelected(e.id)}
              />
            ))}
          </div>
        )}
      </section>

      <EventDetailModal
        eventId={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="flex items-baseline justify-between border-b border-[var(--color-border)] pb-4">
      <div>
        <h1 className="text-[24px] font-semibold leading-tight">{title}</h1>
        {subtitle && <div className="label-mono mt-2">{subtitle}</div>}
      </div>
      <div className="text-mono text-[12px] text-[var(--color-text-muted)]">
        {new Date().toISOString().slice(0, 19).replace("T", " ")}Z
      </div>
    </header>
  );
}
