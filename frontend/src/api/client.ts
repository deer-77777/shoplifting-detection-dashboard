import type {
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
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// Cameras ---------------------------------------------------------------

export const listCameras = () => http<Camera[]>("/cameras");

export const createCamera = (payload: CameraCreate) =>
  http<Camera>("/cameras", { method: "POST", json: payload });

export const updateCamera = (id: string, payload: CameraUpdate) =>
  http<Camera>(`/cameras/${id}`, { method: "PATCH", json: payload });

export const deleteCamera = (id: string) =>
  http<void>(`/cameras/${id}`, { method: "DELETE" });

// Events ----------------------------------------------------------------

export interface EventQuery {
  camera_id?: string;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}

export const listEvents = (q: EventQuery = {}) => {
  const params = new URLSearchParams();
  if (q.camera_id) params.set("camera_id", q.camera_id);
  if (q.since) params.set("since", q.since);
  if (q.until) params.set("until", q.until);
  if (q.limit !== undefined) params.set("limit", String(q.limit));
  if (q.offset !== undefined) params.set("offset", String(q.offset));
  const qs = params.toString();
  return http<DetectionEvent[]>(`/events${qs ? `?${qs}` : ""}`);
};

export const getEvent = (id: string) => http<DetectionEvent>(`/events/${id}`);

export const eventClipUrl = (id: string) => `${BASE}/events/${id}/clip`;
export const eventThumbnailUrl = (id: string) => `${BASE}/events/${id}/thumbnail`;

// Stats -----------------------------------------------------------------

export const getStats = () => http<Stats>("/stats");
