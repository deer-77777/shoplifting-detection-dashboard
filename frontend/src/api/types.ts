export type CameraStatus = "offline" | "connecting" | "online" | "error";

export interface Camera {
  id: string;
  name: string;
  rtsp_url: string;
  status: CameraStatus;
  last_seen_at: string | null;
  last_error: string | null;
  enabled: boolean;
  created_at: string;
}

export interface CameraCreate {
  name: string;
  rtsp_url: string;
  enabled?: boolean;
}

export interface CameraUpdate {
  name?: string;
  rtsp_url?: string;
  enabled?: boolean;
}

export interface BboxTrajectoryEntry {
  t: number;
  bbox: [number, number, number, number];
  conf: number;
}

export interface DetectionEvent {
  id: string;
  camera_id: string;
  camera_name?: string | null;
  track_id: number;
  started_at: string;
  ended_at: string;
  peak_confidence: number;
  bbox_trajectory: BboxTrajectoryEntry[];
  clip_path: string;
  thumbnail_path: string;
  created_at: string;
}

export interface DayBucket {
  day: string;
  count: number;
}

export interface CameraBucket {
  camera_id: string;
  camera_name: string;
  count: number;
}

export interface Stats {
  total_events: number;
  events_today: number;
  events_last_7_days: number;
  online_cameras: number;
  total_cameras: number;
  by_day: DayBucket[];
  by_camera: CameraBucket[];
}

// WebSocket message envelopes.
export type WsMessage =
  | { type: "ping" }
  | {
      type: "event.confirmed";
      event: {
        id: string;
        camera_id: string;
        track_id: number;
        started_at: string;
        ended_at: string;
        peak_confidence: number;
        clip_path: string;
        thumbnail_path: string;
      };
    }
  | {
      type: "camera.status";
      camera_id: string;
      status: CameraStatus;
      last_seen_at?: string | null;
      last_error?: string | null;
    };
