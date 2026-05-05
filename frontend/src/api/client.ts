import type {
  AppSettings,
  AppSettingsUpdate,
  Camera,
  CameraCreate,
  CameraUpdate,
  DetectionEvent,
  Stats,
} from "./types";

const BASE = "/api";

async function http<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const headers = new Headers(init?.headers);
  let body = init?.body;
  if (init?.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers, body });
  if (!res.ok) {
    // Surface FastAPI's `{"detail": "..."}` body verbatim when it's there;
    // fall back to `${status} ${statusText}` otherwise.
    const text = await res.text();
    let detail = `${res.status} ${res.statusText}`;
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed.detail === "string") detail = parsed.detail;
    } catch {
      if (text) detail = text;
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// Cameras ---------------------------------------------------------------

export const listCameras = (opts: { includeDeleted?: boolean } = {}) =>
  http<Camera[]>(
    `/cameras${opts.includeDeleted ? "?include_deleted=true" : ""}`,
  );

export const createCamera = (payload: CameraCreate) =>
  http<Camera>("/cameras", { method: "POST", json: payload });

export const updateCamera = (id: string, payload: CameraUpdate) =>
  http<Camera>(`/cameras/${id}`, { method: "PATCH", json: payload });

export const deleteCamera = (id: string) =>
  http<void>(`/cameras/${id}`, { method: "DELETE" });

// MJPEG preview — drop straight into <img src={...}>. Append a cache-buster
// query string so React remounting forces the browser to open a fresh
// connection rather than reusing a stale one.
export const cameraPreviewUrl = (id: string, nonce?: string | number) =>
  `${BASE}/cameras/${id}/preview${nonce !== undefined ? `?t=${nonce}` : ""}`;

// Events ----------------------------------------------------------------

export interface EventQuery {
  camera_id?: string;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
  include_deleted_cameras?: boolean;
}

export const listEvents = (q: EventQuery = {}) => {
  const params = new URLSearchParams();
  if (q.camera_id) params.set("camera_id", q.camera_id);
  if (q.since) params.set("since", q.since);
  if (q.until) params.set("until", q.until);
  if (q.limit !== undefined) params.set("limit", String(q.limit));
  if (q.offset !== undefined) params.set("offset", String(q.offset));
  if (q.include_deleted_cameras) params.set("include_deleted_cameras", "true");
  const qs = params.toString();
  return http<DetectionEvent[]>(`/events${qs ? `?${qs}` : ""}`);
};

export const getEvent = (id: string) => http<DetectionEvent>(`/events/${id}`);

export const eventClipUrl = (id: string) => `${BASE}/events/${id}/clip`;
export const eventThumbnailUrl = (id: string) => `${BASE}/events/${id}/thumbnail`;

// Stats -----------------------------------------------------------------

export const getStats = () => http<Stats>("/stats");

// Settings --------------------------------------------------------------

export const getSettings = () => http<AppSettings>("/settings");

export const updateSettings = (payload: AppSettingsUpdate) =>
  http<AppSettings>("/settings", { method: "PATCH", json: payload });

export const resetSettings = () =>
  http<AppSettings>("/settings/reset", { method: "POST" });
