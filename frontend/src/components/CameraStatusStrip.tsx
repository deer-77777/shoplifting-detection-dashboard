import { useCameras } from "../hooks/useCameras";
import { StatusDot } from "./StatusDot";
import { useI18n } from "../i18n";

export function CameraStatusStrip() {
  const { data, isLoading } = useCameras();
  const { t } = useI18n();
  const cameras = data ?? [];

  if (isLoading) {
    return (
      <div className="surface px-3 py-2.5 text-mono text-[12px] text-[var(--color-text-dim)]">
        {t("strip.loading")}
      </div>
    );
  }

  if (cameras.length === 0) {
    return (
      <div className="surface px-3 py-2.5 text-mono text-[12px] text-[var(--color-text-dim)]">
        {t("strip.empty")}
      </div>
    );
  }

  return (
    <div className="surface flex flex-wrap gap-x-5 gap-y-2 px-3 py-2.5">
      {cameras.map((c) => (
        <div key={c.id} className="flex items-center gap-2 text-[14px]">
          <StatusDot status={c.status} />
          <span className="font-medium">{c.name}</span>
          <span className="label-mono">
            {t(`status.${c.status}` as
              | "status.offline"
              | "status.connecting"
              | "status.online"
              | "status.error")}
          </span>
        </div>
      ))}
    </div>
  );
}
