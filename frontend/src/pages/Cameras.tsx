import { useEffect, useState } from "react";
import { format } from "date-fns";
import {
  useCameras,
  useCreateCamera,
  useDeleteCamera,
  useUpdateCamera,
} from "../hooks/useCameras";
import type { Camera } from "../api/types";
import { Modal } from "../components/Modal";
import { StatusDot } from "../components/StatusDot";
import { PageHeader } from "./Live";
import { useI18n } from "../i18n";

function maskRtsp(url: string): string {
  return url.replace(
    /(rtsps?:\/\/)([^:/?#@]+):([^@]+)@/,
    (_m, scheme, user) => `${scheme}${user}:****@`,
  );
}

export function CamerasPage() {
  const { data: cameras } = useCameras();
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Camera | null>(null);
  const [deleting, setDeleting] = useState<Camera | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("cameras.title")} subtitle={t("cameras.subtitle")} />

      <div className="flex justify-end">
        <button
          type="button"
          className="btn btn-accent"
          onClick={() => setAdding(true)}
        >
          {t("cameras.add")}
        </button>
      </div>

      <div className="surface overflow-hidden">
        <table className="w-full text-[14px]">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
            <tr className="label-mono">
              <th className="text-left px-3 py-2.5 w-20">
                {t("cameras.col.status")}
              </th>
              <th className="text-left px-3 py-2.5">
                {t("cameras.col.name")}
              </th>
              <th className="text-left px-3 py-2.5">
                {t("cameras.col.rtsp")}
              </th>
              <th className="text-left px-3 py-2.5 w-48">
                {t("cameras.col.lastSeen")}
              </th>
              <th className="text-left px-3 py-2.5 w-32">
                {t("cameras.col.enabled")}
              </th>
              <th className="text-right px-3 py-2.5 w-48">
                {t("cameras.col.actions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {cameras?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center label-mono">
                  {t("cameras.empty")}
                </td>
              </tr>
            )}
            {cameras?.map((c) => (
              <tr
                key={c.id}
                className="border-t border-[var(--color-border)]"
                title={c.last_error ?? undefined}
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <StatusDot status={c.status} />
                    <span className="label-mono">
                      {t(`status.${c.status}` as
                        | "status.offline"
                        | "status.connecting"
                        | "status.online"
                        | "status.error")}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 font-medium">{c.name}</td>
                <td className="px-3 py-2.5 text-mono truncate max-w-[420px]">
                  {maskRtsp(c.rtsp_url)}
                </td>
                <td className="px-3 py-2.5 text-mono">
                  {c.last_seen_at
                    ? format(new Date(c.last_seen_at), "yyyy-MM-dd HH:mm:ss")
                    : "—"}
                </td>
                <td className="px-3 py-2.5">
                  <EnableToggle camera={c} />
                </td>
                <td className="px-3 py-2.5 text-right space-x-2">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setEditing(c)}
                  >
                    {t("cameras.action.edit")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => setDeleting(c)}
                  >
                    {t("cameras.action.delete")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adding && (
        <CameraFormModal mode="create" onClose={() => setAdding(false)} />
      )}
      {editing && (
        <CameraFormModal
          mode="edit"
          initial={editing}
          onClose={() => setEditing(null)}
        />
      )}
      <DeleteConfirmModal
        camera={deleting}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

function EnableToggle({ camera }: { camera: Camera }) {
  const update = useUpdateCamera();
  const { t } = useI18n();
  return (
    <button
      type="button"
      className={`text-mono text-[12px] uppercase tracking-widest px-2 py-1 border ${
        camera.enabled
          ? "border-[var(--color-success)] text-[var(--color-success)]"
          : "border-[var(--color-border-strong)] text-[var(--color-text-muted)]"
      }`}
      onClick={() =>
        update.mutate({
          id: camera.id,
          payload: { enabled: !camera.enabled },
        })
      }
      disabled={update.isPending}
    >
      {camera.enabled
        ? t("cameras.toggle.enabled")
        : t("cameras.toggle.disabled")}
    </button>
  );
}

type FormProps =
  | { mode: "create"; onClose: () => void; initial?: undefined }
  | { mode: "edit"; onClose: () => void; initial: Camera };

function CameraFormModal(props: FormProps) {
  const { mode, onClose, initial } = props;
  const { t } = useI18n();
  const create = useCreateCamera();
  const update = useUpdateCamera();
  const [name, setName] = useState(initial?.name ?? "");
  const [rtsp, setRtsp] = useState(initial?.rtsp_url ?? "");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) {
      setName(initial.name);
      setRtsp(initial.rtsp_url);
      setEnabled(initial.enabled);
    }
    setError(null);
  }, [initial?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (mode === "edit") {
        await update.mutateAsync({
          id: initial.id,
          payload: { name, rtsp_url: rtsp, enabled },
        });
      } else {
        await create.mutateAsync({ name, rtsp_url: rtsp, enabled });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "request failed");
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={
        mode === "edit"
          ? t("cameras.form.edit.title")
          : t("cameras.form.add.title")
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="label-mono">{t("cameras.form.name")}</label>
          <input
            className="input"
            style={{ fontFamily: "var(--font-sans)" }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("cameras.form.namePlaceholder")}
            required
            maxLength={200}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="label-mono">{t("cameras.form.rtsp")}</label>
          <input
            className="input"
            value={rtsp}
            onChange={(e) => setRtsp(e.target.value)}
            placeholder="rtsp://user:pass@10.0.1.42:554/Streaming/Channels/101"
            required
          />
          <div className="label-mono mt-1">{t("cameras.form.rtspHint")}</div>
        </div>
        <label className="flex items-center gap-2 text-[14px]">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          {t("cameras.form.enabled")}
        </label>
        {error && (
          <div className="text-[13px] text-[var(--color-accent)] text-mono break-words">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 mt-2">
          <button type="button" className="btn" onClick={onClose}>
            {t("cameras.form.cancel")}
          </button>
          <button
            type="submit"
            className="btn btn-accent"
            disabled={create.isPending || update.isPending}
          >
            {mode === "edit"
              ? t("cameras.form.save")
              : t("cameras.form.submit")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteConfirmModal({
  camera,
  onClose,
}: {
  camera: Camera | null;
  onClose: () => void;
}) {
  const del = useDeleteCamera();
  const { t } = useI18n();
  return (
    <Modal
      open={!!camera}
      onClose={onClose}
      title={t("cameras.delete.title")}
      width={460}
    >
      {camera && (
        <div className="flex flex-col gap-3">
          <div className="text-[15px]">
            {t("cameras.delete.confirm", { name: camera.name })}
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <button type="button" className="btn" onClick={onClose}>
              {t("cameras.form.cancel")}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={del.isPending}
              onClick={async () => {
                await del.mutateAsync(camera.id);
                onClose();
              }}
            >
              {t("cameras.action.delete")}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
