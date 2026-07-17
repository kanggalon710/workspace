import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import type { PermissionLevel } from "@shared/schema";

export interface RolePresetDTO {
  id: number;
  mitraId: number;
  scope: "global" | "tenant";
  name: string;
  description: string | null;
  icon: string | null;
  color: string;
  permissions: Record<string, PermissionLevel>;
  isSystem: number;
  isActive: number;
  isDefault: number;
}

export function useApplicablePresets() {
  return useQuery<RolePresetDTO[]>({
    queryKey: ["/api/role-presets"],
    queryFn: () => api.get<RolePresetDTO[]>("/role-presets"),
  });
}

export function useManageablePresets(enabled: boolean) {
  return useQuery<RolePresetDTO[]>({
    queryKey: ["/api/role-presets", "manage"],
    queryFn: () => api.get<RolePresetDTO[]>("/role-presets?manage=1"),
    enabled,
  });
}

export function useRolePresetMutations() {
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: ["/api/role-presets"] });
  const onError = (e: any) => toast.error(e?.message ?? "Gagal memproses preset");
  return {
    create: useMutation({ mutationFn: (d: any) => api.post("/role-presets", d), onSuccess: inv, onError }),
    update: useMutation({ mutationFn: ({ id, ...d }: any) => api.put(`/role-presets/${id}`, d), onSuccess: inv, onError }),
    remove: useMutation({ mutationFn: (id: number) => api.delete(`/role-presets/${id}`), onSuccess: inv, onError }),
    setDefault: useMutation({ mutationFn: (id: number) => api.post(`/role-presets/${id}/default`, {}), onSuccess: inv, onError }),
  };
}
