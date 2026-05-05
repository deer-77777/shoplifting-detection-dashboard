import { useEffect, useState } from "react";
import { useEvents } from "../hooks/useEvents";
import { useCameras } from "../hooks/useCameras";
import { useEventStream } from "../hooks/useEventStream";
import { useToast } from "../components/Toast";
import { CameraPreviewTile } from "../components/CameraPreviewTile";
import { CameraFullscreenModal } from "../components/CameraFullscreenModal";
import { AlertBanner } from "../components/AlertBanner";
import { EventCard } from "../components/EventCard";
import { EventDetailModal } from "../components/EventDetailModal";
import { useI18n } from "../i18n";
import type { Camera } from "../api/types";

export function LivePage() {
  const { data: events } = useEvents({ limit: 20 });
  const { data: cameras } = useCameras();
  const { subscribe } = useEventStream();
  const toast = useToast();
  const { t } = useI18n();
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [expandedCamera, setExpandedCamera] = useState<Camera | null>(null);

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

  const cameraName = (id: string) => cameras?.find((c) => c.id === id)?.name;

  const total = cameras?.length ?? 0;
  const online =
    cameras?.filter((c) => c.status === "online").length ?? 0;

  // Adaptive grid: bias toward tile size, not column count. With 1 camera the
  // tile fills the column; with 2-3 it's two-up; with 4+ it's three-up at xl.
  const gridCols =
    total <= 1
      ? "grid-cols-1"
      : total <= 4
        ? "grid-cols-1 sm:grid-cols-2"
        : "grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3";

  return (
    <div className="flex flex-col gap-5">
      <AlertBanner />

      <PageHeader
        title={t("live.title")}
        subtitle={t("live.subtitle")}
        rhs={
          total > 0 && (
            <div className="flex items-center gap-2 label-mono">
              <span
                className="status-dot"
                style={{
                  background:
                    online === total
                      ? "var(--color-success)"
                      : online === 0
                        ? "var(--color-accent)"
                        : "var(--color-warning)",
                }}
              />
              <span>
                {t("live.online")} {online}
                <span className="text-[var(--color-text-muted)]"> / {total}</span>
              </span>
            </div>
          )
        }
      />

      {total === 0 ? (
        <div className="surface px-4 py-12 text-center">
          <div className="text-[15px] text-[var(--color-text-dim)]">
            {t("live.noCameras.title")}
          </div>
          <div className="label-mono mt-2">{t("live.noCameras.body")}</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
          {/* LEFT: camera wall */}
          <section className="min-w-0">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-[16px] font-semibold">{t("live.previews")}</h2>
              <span className="label-mono">{t("live.previews.range")}</span>
            </div>
            <div className={`grid ${gridCols} gap-3`}>
              {cameras!.map((c) => (
                <CameraPreviewTile
                  key={c.id}
                  camera={c}
                  onExpand={setExpandedCamera}
                  compact={total > 4}
                />
              ))}
            </div>
          </section>

          {/* RIGHT: events feed (sticky on wide viewports) */}
          <aside className="min-w-0 xl:sticky xl:top-4 xl:self-start xl:max-h-[calc(100vh-2rem)] xl:overflow-auto flex flex-col">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-[16px] font-semibold">{t("live.recent")}</h2>
              <span className="label-mono">{t("live.recent.range")}</span>
            </div>
            {!events || events.length === 0 ? (
              <div className="surface px-4 py-10 text-center">
                <div className="text-[14px] text-[var(--color-text-dim)]">
                  {t("live.empty.title")}
                </div>
                <div className="label-mono mt-2">{t("live.empty.body")}</div>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {events.map((e) => (
                  <EventCard
                    key={e.id}
                    event={e}
                    cameraName={cameraName(e.camera_id)}
                    onClick={() => setSelectedEvent(e.id)}
                  />
                ))}
              </div>
            )}
          </aside>
        </div>
      )}

      <EventDetailModal
        eventId={selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
      <CameraFullscreenModal
        camera={expandedCamera}
        onClose={() => setExpandedCamera(null)}
      />
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  rhs,
}: {
  title: string;
  subtitle?: string;
  rhs?: React.ReactNode;
}) {
  return (
    <header className="flex items-center justify-between border-b border-[var(--color-border)] pb-4 gap-4">
      <div className="min-w-0">
        <h1 className="text-[24px] font-semibold leading-tight">{title}</h1>
        {subtitle && <div className="label-mono mt-2">{subtitle}</div>}
      </div>
      <div className="flex items-center gap-4 shrink-0">
        {rhs}
        <div className="text-mono text-[12px] text-[var(--color-text-muted)] hidden md:block">
          {new Date().toISOString().slice(0, 19).replace("T", " ")}Z
        </div>
      </div>
    </header>
  );
}
