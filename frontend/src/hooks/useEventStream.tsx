import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { WsMessage } from "../api/types";
import { camerasKey } from "./useCameras";
import { statsKey } from "./useStats";

type ConnectionState = "connecting" | "open" | "closed";

type EventConfirmed = Extract<WsMessage, { type: "event.confirmed" }>;

interface EventStreamCtx {
  connectionState: ConnectionState;
  lastEvent: EventConfirmed["event"] | null;
  subscribe: (fn: (m: WsMessage) => void) => () => void;
}

const Ctx = createContext<EventStreamCtx | null>(null);

function wsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/ws/events`;
}

export function EventStreamProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");
  const [lastEvent, setLastEvent] = useState<EventConfirmed["event"] | null>(
    null,
  );
  const subscribers = useRef(new Set<(m: WsMessage) => void>());

  const subscribe = useCallback((fn: (m: WsMessage) => void) => {
    subscribers.current.add(fn);
    return () => {
      subscribers.current.delete(fn);
    };
  }, []);

  useEffect(() => {
    let stopped = false;
    let attempt = 0;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (stopped) return;
      setConnectionState("connecting");
      const sock = new WebSocket(wsUrl());
      ws = sock;

      sock.onopen = () => {
        if (stopped) {
          sock.close();
          return;
        }
        attempt = 0;
        setConnectionState("open");
      };

      sock.onmessage = (ev) => {
        let msg: WsMessage;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.type === "ping") return;

        if (msg.type === "event.confirmed") {
          setLastEvent(msg.event);
          qc.invalidateQueries({ queryKey: ["events"] });
          qc.invalidateQueries({ queryKey: statsKey });
        } else if (msg.type === "camera.status") {
          qc.invalidateQueries({ queryKey: camerasKey });
        }

        for (const fn of subscribers.current) {
          try {
            fn(msg);
          } catch {
            /* swallow subscriber errors */
          }
        }
      };

      sock.onclose = () => {
        if (stopped) return;
        setConnectionState("closed");
        attempt += 1;
        const delay = Math.min(1000 * 2 ** Math.min(attempt, 5), 30_000);
        reconnectTimer = window.setTimeout(connect, delay);
      };

      sock.onerror = () => {
        try {
          sock.close();
        } catch {
          /* ignore */
        }
      };
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  }, [qc]);

  const value = useMemo(
    () => ({ connectionState, lastEvent, subscribe }),
    [connectionState, lastEvent, subscribe],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEventStream(): EventStreamCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("EventStreamProvider missing");
  return ctx;
}
