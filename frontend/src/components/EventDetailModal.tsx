import { format } from "date-fns";
import { Link } from "react-router-dom";
import { eventClipUrl } from "../api/client";
import { useEvent } from "../hooks/useEvents";
import { Modal } from "./Modal";
import { useI18n } from "../i18n";

export function EventDetailModal({
  eventId,
  onClose,
}: {
  eventId: string | null;
  onClose: () => void;
}) {
  const { data: ev, isLoading } = useEvent(eventId);
  const { t } = useI18n();

  return (
    <Modal
      open={!!eventId}
      onClose={onClose}
      title={ev ? `${t("event.title")} ${ev.id.slice(0, 8)}` : t("event.title")}
      width={760}
    >
      {isLoading || !ev ? (
        <div className="text-mono text-[13px] text-[var(--color-text-dim)]">
          {t("event.loading")}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="bg-black aspect-video w-full">
            <video
              src={eventClipUrl(ev.id)}
              controls
              autoPlay
              className="w-full h-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-[14px]">
            <Field label={t("event.field.eventId")} value={ev.id} mono />
            <Field
              label={t("event.field.camera")}
              value={
                <span className="inline-flex items-center gap-2">
                  {ev.camera_deleted ? (
                    <span className="text-[var(--color-text-dim)]">
                      {ev.camera_name ?? ev.camera_id}
                    </span>
                  ) : (
                    <Link
                      to="/cameras"
                      className="hover:text-[var(--color-accent)]"
                    >
                      {ev.camera_name ?? ev.camera_id}
                    </Link>
                  )}
                  {ev.camera_deleted && (
                    <span className="text-mono text-[10px] uppercase tracking-widest px-1.5 py-0.5 border border-[var(--color-accent-dim)] text-[var(--color-accent)]">
                      {t("events.deletedTag")}
                    </span>
                  )}
                </span>
              }
            />
            <Field
              label={t("event.field.trackId")}
              value={`#${ev.track_id}`}
              mono
            />
            <Field
              label={t("event.field.peakConf")}
              value={ev.peak_confidence.toFixed(3)}
              mono
            />
            <Field
              label={t("event.field.startedAt")}
              value={format(new Date(ev.started_at), "yyyy-MM-dd HH:mm:ss")}
              mono
            />
            <Field
              label={t("event.field.endedAt")}
              value={format(new Date(ev.ended_at), "yyyy-MM-dd HH:mm:ss")}
              mono
            />
            <Field
              label={t("event.field.trajectory")}
              value={t("event.trajectorySamples", {
                n: ev.bbox_trajectory.length,
              })}
              mono
            />
            <Field
              label={t("event.field.created")}
              value={format(new Date(ev.created_at), "yyyy-MM-dd HH:mm:ss")}
              mono
            />
          </div>
        </div>
      )}
    </Modal>
  );
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="label-mono">{label}</div>
      <div className={`${mono ? "text-mono" : ""} text-[14px] truncate`}>
        {value}
      </div>
    </div>
  );
}
