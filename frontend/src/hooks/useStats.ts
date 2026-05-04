import { useQuery } from "@tanstack/react-query";
import { getStats } from "../api/client";

export const statsKey = ["stats"] as const;

export function useStats() {
  return useQuery({
    queryKey: statsKey,
    queryFn: getStats,
    refetchInterval: 10_000,
  });
}
