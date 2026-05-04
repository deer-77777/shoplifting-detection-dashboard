import { useQuery } from "@tanstack/react-query";
import { getEvent, listEvents } from "../api/client";
import type { EventQuery } from "../api/client";

export const eventsKey = (q: EventQuery = {}) => ["events", q] as const;

export function useEvents(q: EventQuery = {}) {
  return useQuery({
    queryKey: eventsKey(q),
    queryFn: () => listEvents(q),
  });
}

export function useEvent(id: string | null) {
  return useQuery({
    queryKey: ["event", id],
    queryFn: () => getEvent(id as string),
    enabled: !!id,
  });
}
