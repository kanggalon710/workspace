/** Teamspace v5.0 Fase 1 — hooks untuk tim, Semua Tugas, checklist, label, dan aksi kartu.
 *  Pola identik dengan usePipelines.ts (TanStack Query + api helper). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Team, PipelineLabel, CardChecklist, CardChecklistItem, PipelineCard, PipelineStage } from "@shared/schema";

const KEY = "/api/teamspace";
const PIPE_KEY = "/api/pipelines";

export type TeamSummary = Team & {
  myRole: string | null;
  memberCount: number;
  enabledViews: string[];
  taskSummary: { total: number; done: number; overdue: number };
};

export type TeamDetail = TeamSummary & {
  canManage: boolean;
  members: TeamMemberRow[];
};

export interface TeamMemberRow {
  userId: number;
  teamRole: string;
  joinedAt: string;
  name: string;
  username: string;
  isActive: number | null;
}

export interface AllTasksResponse {
  teams: Array<{ id: number; name: string; color: string; icon: string | null; pipelineId: number }>;
  stages: Record<number, PipelineStage[]>;
  cards: Array<PipelineCard & {
    teamId: number | null;
    teamName: string | null;
    secondaryAssigneeIds: number[];
    labels: PipelineLabel[];
    checklistProgress: { done: number; total: number } | null;
  }>;
}

export function useMyTeams(opts?: { all?: boolean; archived?: boolean }) {
  const params = new URLSearchParams();
  if (opts?.all) params.set("all", "1");
  if (opts?.archived) params.set("archived", "1");
  const qs = params.toString() ? `?${params.toString()}` : "";
  return useQuery({
    queryKey: [KEY, "teams", opts?.all ?? false, opts?.archived ?? false],
    queryFn: () => api.get<TeamSummary[]>(`/teamspace/teams${qs}`),
  });
}

export function useTeam(id: number | null) {
  return useQuery({
    queryKey: [KEY, "team", id],
    queryFn: () => api.get<TeamDetail>(`/teamspace/teams/${id}`),
    enabled: !!id,
  });
}

export function useAllTasks() {
  return useQuery({
    queryKey: [KEY, "tasks"],
    queryFn: () => api.get<AllTasksResponse>(`/teamspace/tasks`),
    refetchInterval: 30_000, // pause-on-blur otomatis (default queryClient)
  });
}

export function useTeamMutations() {
  const qc = useQueryClient();
  const invalidate = () => { qc.invalidateQueries({ queryKey: [KEY] }); };
  return {
    createTeam: useMutation({
      mutationFn: (b: { name: string; description?: string; icon?: string; color?: string; type?: string; memberIds?: number[]; managerIds?: number[] }) =>
        api.post<TeamSummary>("/teamspace/teams", b),
      onSuccess: invalidate,
    }),
    updateTeam: useMutation({
      mutationFn: ({ id, ...b }: { id: number; name?: string; description?: string; icon?: string; color?: string; type?: string; enabledViews?: string[] }) =>
        api.patch<Team>(`/teamspace/teams/${id}`, b),
      onSuccess: invalidate,
    }),
    archiveTeam: useMutation({
      mutationFn: ({ id, archived }: { id: number; archived: boolean }) =>
        api.post(`/teamspace/teams/${id}/archive`, { archived }),
      onSuccess: invalidate,
    }),
    addMember: useMutation({
      mutationFn: ({ teamId, userId, role }: { teamId: number; userId: number; role: "manager" | "member" }) =>
        api.post(`/teamspace/teams/${teamId}/members`, { userId, role }),
      onSuccess: invalidate,
    }),
    setMemberRole: useMutation({
      mutationFn: ({ teamId, userId, role }: { teamId: number; userId: number; role: "manager" | "member" }) =>
        api.patch(`/teamspace/teams/${teamId}/members/${userId}`, { role }),
      onSuccess: invalidate,
    }),
    removeMember: useMutation({
      mutationFn: ({ teamId, userId }: { teamId: number; userId: number }) =>
        api.delete(`/teamspace/teams/${teamId}/members/${userId}`),
      onSuccess: invalidate,
    }),
  };
}

// ── Checklist (FR-406) ──

export type ChecklistWithItems = CardChecklist & { items: CardChecklistItem[] };

export function useCardChecklists(cardId: number | null) {
  return useQuery({
    queryKey: [PIPE_KEY, "checklists", cardId],
    queryFn: () => api.get<ChecklistWithItems[]>(`/pipelines/cards/${cardId}/checklists`),
    enabled: !!cardId,
  });
}

export function useChecklistMutations(cardId: number) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [PIPE_KEY, "checklists", cardId] });
    qc.invalidateQueries({ queryKey: [PIPE_KEY, "cards"] });   // progres badge board
    qc.invalidateQueries({ queryKey: [KEY, "tasks"] });
  };
  return {
    createChecklist: useMutation({ mutationFn: (title: string) => api.post(`/pipelines/cards/${cardId}/checklists`, { title }), onSuccess: invalidate }),
    renameChecklist: useMutation({ mutationFn: ({ id, title }: { id: number; title: string }) => api.patch(`/pipelines/checklists/${id}`, { title }), onSuccess: invalidate }),
    deleteChecklist: useMutation({ mutationFn: (id: number) => api.delete(`/pipelines/checklists/${id}`), onSuccess: invalidate }),
    addItem: useMutation({ mutationFn: ({ checklistId, text }: { checklistId: number; text: string }) => api.post(`/pipelines/checklists/${checklistId}/items`, { text }), onSuccess: invalidate }),
    toggleItem: useMutation({ mutationFn: ({ id, isChecked }: { id: number; isChecked: boolean }) => api.patch(`/pipelines/checklist-items/${id}`, { isChecked }), onSuccess: invalidate }),
    updateItemText: useMutation({ mutationFn: ({ id, text }: { id: number; text: string }) => api.patch(`/pipelines/checklist-items/${id}`, { text }), onSuccess: invalidate }),
    deleteItem: useMutation({ mutationFn: (id: number) => api.delete(`/pipelines/checklist-items/${id}`), onSuccess: invalidate }),
  };
}

// ── Label berwarna (FR-413) ──

export function usePipelineLabels(pipelineId: number | null) {
  return useQuery({
    queryKey: [PIPE_KEY, "labels", pipelineId],
    queryFn: () => api.get<PipelineLabel[]>(`/pipelines/${pipelineId}/labels`),
    enabled: !!pipelineId,
  });
}

export function useLabelMutations(pipelineId: number) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [PIPE_KEY, "labels", pipelineId] });
    qc.invalidateQueries({ queryKey: [PIPE_KEY, "cards"] });
    qc.invalidateQueries({ queryKey: [KEY, "tasks"] });
  };
  return {
    createLabel: useMutation({ mutationFn: (b: { name: string; colorHex?: string }) => api.post<PipelineLabel>(`/pipelines/${pipelineId}/labels`, b), onSuccess: invalidate }),
    updateLabel: useMutation({ mutationFn: ({ id, ...b }: { id: number; name?: string; colorHex?: string }) => api.patch(`/pipelines/labels/${id}`, b), onSuccess: invalidate }),
    deleteLabel: useMutation({ mutationFn: (id: number) => api.delete(`/pipelines/labels/${id}`), onSuccess: invalidate }),
    setCardLabels: useMutation({ mutationFn: ({ cardId, labelIds }: { cardId: number; labelIds: number[] }) => api.put(`/pipelines/cards/${cardId}/labels`, { labelIds }), onSuccess: invalidate }),
  };
}

// ── Aksi kartu: selesai / rahasia / arsip / salin ──

export function useCardActions(cardId: number) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [PIPE_KEY] });
    qc.invalidateQueries({ queryKey: [KEY, "tasks"] });
  };
  return {
    setCompleted: useMutation({ mutationFn: (completed: boolean) => api.post(`/pipelines/cards/${cardId}/complete`, { completed }), onSuccess: invalidate }),
    setPrivate: useMutation({ mutationFn: (isPrivate: boolean) => api.post(`/pipelines/cards/${cardId}/private`, { isPrivate }), onSuccess: invalidate }),
    setArchived: useMutation({ mutationFn: (archived: boolean) => api.post(`/pipelines/cards/${cardId}/archive`, { archived }), onSuccess: invalidate }),
    duplicate: useMutation({ mutationFn: () => api.post<PipelineCard>(`/pipelines/cards/${cardId}/duplicate`, {}), onSuccess: invalidate }),
  };
}

/** Palet ≥30 warna preset untuk label (FR-413). */
export const LABEL_COLOR_PALETTE = [
  "#EF4444", "#F97316", "#F59E0B", "#EAB308", "#84CC16", "#22C55E",
  "#10B981", "#14B8A6", "#06B6D4", "#0EA5E9", "#3B82F6", "#6366F1",
  "#8B5CF6", "#A855F7", "#D946EF", "#EC4899", "#F43F5E", "#DC2626",
  "#EA580C", "#D97706", "#CA8A04", "#65A30D", "#16A34A", "#059669",
  "#0D9488", "#0891B2", "#0284C7", "#2563EB", "#4F46E5", "#7C3AED",
  "#9333EA", "#C026D3", "#DB2777", "#E11D48", "#64748B", "#475569",
];

/** Warna preset tim. */
export const TEAM_COLOR_PALETTE = [
  "#8B5CF6", "#0EA5E9", "#22C55E", "#F59E0B", "#EF4444", "#EC4899",
  "#14B8A6", "#6366F1", "#F97316", "#64748B",
];
