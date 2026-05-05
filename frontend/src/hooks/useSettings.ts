import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getSettings,
  resetSettings,
  updateSettings,
} from "../api/client";
import type { AppSettings, AppSettingsUpdate } from "../api/types";

const KEY = ["settings"] as const;

export function useSettings() {
  return useQuery<AppSettings>({
    queryKey: KEY,
    queryFn: getSettings,
    staleTime: 30_000,
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: AppSettingsUpdate) => updateSettings(payload),
    onSuccess: (data) => qc.setQueryData(KEY, data),
  });
}

export function useResetSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => resetSettings(),
    onSuccess: (data) => qc.setQueryData(KEY, data),
  });
}
