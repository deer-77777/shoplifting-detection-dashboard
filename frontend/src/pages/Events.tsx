import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useCameras } from "../hooks/useCameras";
import { useEvents } from "../hooks/useEvents";
import { eventThumbnailUrl } from "../api/client";
import { EventDetailModal } from "../components/EventDetailModal";
import { PageHeader } from "./Live";
import { useI18n } from "../i18n";

const PAGE_SIZE = 50;

export function EventsPage() {
  const { data: cameras } = useCameras();
  const { t } = useI18n();
  const [cameraId, setCameraId] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  const query = useMemo(
    () => ({
      camera_id: cameraId || undefined,
      since: from ? new Date(from).toISOString() : undefined,
      until: to ? new Date(to).toISOString() : undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [cameraId, from, to, page],
  );

  const { data: events, isLoading } = useEvents(query);
  const cameraName = (id: string) =>
    cameras?.find((c) => c.id === id)?.name ?? id.slice(0, 8);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("events.title")} subtitle={t("events.subtitle")} />

      <div className="surface flex flex-wrap items-end gap-3 p-4">
        <div className="flex flex-col gap-1.5">
          <label className="label-mono">{t("events.filter.camera")}</label>
          <select
            className="input min-w-[200px]"
            value={cameraId}
            onChange={(e) => {
              setCameraId(e.target.value);
              setPage(0);
            }}
          >
            <option value="">{t("events.filter.allCameras")}</option>
            {cameras?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="label-mono">{t("events.filter.from")}</label>
          <input
            type="datetime-local"
            className="input"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="label-mono">{t("events.filter.to")}</label>
          <input
            type="datetime-local"
            className="input"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setCameraId("");
            setFrom("");
            setTo("");
            setPage(0);
          }}
        >
          {t("events.filter.reset")}
        </button>
      </div>

      <div className="surface overflow-hidden">
        <table className="w-full text-[14px]">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
            <tr className="label-mono">
              <th className="text-left px-3 py-2.5 w-24">
                {t("events.col.thumb")}
              </th>
              <th className="text-left px-3 py-2.5">
                {t("events.col.started")}
              </th>
              <th className="text-left px-3 py-2.5">
                {t("events.col.camera")}
              </th>
              <th className="text-left px-3 py-2.5">
                {t("events.col.track")}
              </th>
              <th className="text-left px-3 py-2.5">{t("events.col.conf")}</th>
              <th className="text-left px-3 py-2.5">
                {t("events.col.duration")}
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center label-mono">
                  {t("events.loading")}
                </td>
              </tr>
            )}
            {!isLoading && (events?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center label-mono">
                  {t("events.empty")}
                </td>
              </tr>
            )}
            {events?.map((ev) => {
              const dur =
                (new Date(ev.ended_at).getTime() -
                  new Date(ev.started_at).getTime()) /
                1000;
              return (
                <tr
                  key={ev.id}
                  className="border-t border-[var(--color-border)] hover:bg-[var(--color-surface-2)] cursor-pointer"
                  onClick={() => setSelected(ev.id)}
                >
                  <td className="px-3 py-2.5">
                    <img
                      src={eventThumbnailUrl(ev.id)}
                      alt=""
                      className="w-20 h-12 object-cover bg-black"
                      loading="lazy"
                    />
                  </td>
                  <td className="px-3 py-2.5 text-mono">
                    {format(new Date(ev.started_at), "yyyy-MM-dd HH:mm:ss")}
                  </td>
                  <td className="px-3 py-2.5">{cameraName(ev.camera_id)}</td>
                  <td className="px-3 py-2.5 text-mono">#{ev.track_id}</td>
                  <td className="px-3 py-2.5 text-mono">
                    {ev.peak_confidence.toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 text-mono">{dur.toFixed(1)}s</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <div className="label-mono">
          {t("events.page", { p: page + 1, n: events?.length ?? 0 })}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            {t("events.prev")}
          </button>
          <button
            type="button"
            className="btn"
            disabled={(events?.length ?? 0) < PAGE_SIZE}
            onClick={() => setPage((p) => p + 1)}
          >
            {t("events.next")}
          </button>
        </div>
      </div>

      <EventDetailModal
        eventId={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
