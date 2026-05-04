import type { CameraStatus } from "../api/types";

const COLOR: Record<CameraStatus, string> = {
  online: "var(--color-success)",
  connecting: "var(--color-warning)",
  offline: "var(--color-text-muted)",
  error: "var(--color-accent)",
};

export function StatusDot({
  status,
  size = 10,
  pulse = false,
}: {
  status: CameraStatus;
  size?: number;
  pulse?: boolean;
}) {
  return (
    <span
      className={`inline-block rounded-full ${pulse && status === "online" ? "pulse-accent" : ""}`}
      style={{
        width: size,
        height: size,
        background: COLOR[status],
      }}
      aria-label={status}
    />
  );
}
