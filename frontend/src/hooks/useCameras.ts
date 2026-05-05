import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCamera,
  deleteCamera,
  listCameras,
  updateCamera,
} from "../api/client";
import type { CameraCreate, CameraUpdate } from "../api/types";

export const camerasKey = (includeDeleted = false) =>
  ["cameras", { includeDeleted }] as const;

export function useCameras(opts: { includeDeleted?: boolean } = {}) {
  const includeDeleted = !!opts.includeDeleted;
  return useQuery({
    queryKey: camerasKey(includeDeleted),
    queryFn: () => listCameras({ includeDeleted }),
    refetchInterval: 5_000,
  });
}

export function useCreateCamera() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CameraCreate) => createCamera(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cameras"] }),
  });
}

export function useUpdateCamera() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CameraUpdate }) =>
      updateCamera(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cameras"] }),
  });
}

export function useDeleteCamera() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCamera(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cameras"] }),
  });
}
