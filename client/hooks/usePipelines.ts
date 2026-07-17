import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, getAuthHeaders } from "@/lib/api";
import { compressImage } from "@/lib/imageCompress";
import type { Pipeline, PipelineStage, PipelineCard, PipelineField, PipelineRule, RuleCondition, TimeTriggerConfig } from "@shared/schema";
import type { RelationEntityType } from "@shared/cardRelations";

export type PipelineWithStages = Pipeline & { stages: PipelineStage[]; fields: PipelineField[]; level?: "view" | "edit"; capabilities?: string[] };
export type PipelineAccessData = { restricted: boolean; grants: { roleId: number; capabilities: string[]; cardFilter?: any[] | null }[] };
export type PipelineCardWithValues = PipelineCard & { values?: Record<number, string> };
export type RuleFieldMap = {
  id: number; sourceFieldId: number; targetFieldId: number;
  sourceFieldLabel?: string; sourceFieldType?: string | null;
  targetFieldLabel?: string; targetFieldType?: string | null;
};
export type RuleConditionWithLabel = RuleCondition & { fieldLabel?: string };
export type RuleActionView = {
  id: number; position: number; actionType: string;
  actionConfig: any | null;
  targetPipelineId: number | null; targetStageId: number | null;
  titleTemplate: string | null; copyAssignee: number;
  setFieldLabel?: string; setFieldType?: string | null;
  moveStageName?: string; assigneeName?: string;
  targetPipelineName?: string; targetStageName?: string;
  notifyLabel?: string;
  fieldMaps: RuleFieldMap[];
};
export type RuleWithMaps = Omit<PipelineRule, "triggerConfig"> & {
  // P4b-1 within-card conditions (server-enriched) — P4d-3: grouped
  conditions?: { groups: RuleConditionWithLabel[][] };
  // P4c time triggers (server-enriched)
  triggerConfig?: TimeTriggerConfig | null;
  triggerFieldLabel?: string;
  triggerStageScopeName?: string;
  // P4d-1 multi-action: per-action enriched view replaces single-action fields
  actions?: RuleActionView[];
};
export type CardDetail = PipelineCard & {
  comments: { id: number; authorId: number; authorName?: string; body: string; type?: string; photoPath: string | null; attachments?: CardAttachment[]; createdAt: string }[];
  activity: { id: number; actorId: number; type: string; detail: string | null; createdAt: string }[];
  followers: { id: number; userId: number }[];
  fields: PipelineField[];
  values: Record<number, string>;
};
export type AssignableUser = { id: number; name: string | null; username: string; role: string; mitraId: number | null; mitraName: string | null };

export type CardRelation = {
  id: number | null;
  entityType: RelationEntityType;
  entityId: number;
  label: string | null;
  entityLabel: string;
  entitySubtitle: string | null;
  pipelineId: number | null;
  implicit: boolean;
};

export type RelationSearchResult = { id: number; label: string; subtitle: string | null; pipelineId?: number };

const KEY = "pipelines";

export function usePipelines(includeArchived = false) {
  return useQuery({
    queryKey: [KEY, "list", includeArchived],
    queryFn: () => api.get<(Pipeline & { level?: "view" | "edit"; restricted?: number; capabilities?: string[] })[]>(`/pipelines${includeArchived ? "?archived=1" : ""}`),
  });
}

export function usePipeline(id: number | null) {
  return useQuery({
    queryKey: [KEY, "one", id],
    queryFn: () => api.get<PipelineWithStages>(`/pipelines/${id}`),
    enabled: !!id,
  });
}

export function usePipelineCards(id: number | null) {
  return useQuery({
    queryKey: [KEY, "cards", id],
    queryFn: () => api.get<PipelineCardWithValues[]>(`/pipelines/${id}/cards`),
    enabled: !!id,
  });
}

export function useAssignableUsers(crossTenant?: boolean) {
  return useQuery({
    queryKey: [KEY, "assignable-users", crossTenant ? "cross" : "own"],
    queryFn: () => api.get<AssignableUser[]>(`/pipelines/assignable-users${crossTenant ? "?scope=cross" : ""}`),
  });
}

export function useCard(cardId: number | null) {
  return useQuery({
    queryKey: [KEY, "card", cardId],
    queryFn: () => api.get<CardDetail>(`/pipelines/cards/${cardId}`),
    enabled: !!cardId,
  });
}

export function useFields(pipelineId: number | null) {
  return useQuery({
    queryKey: [KEY, "fields", pipelineId],
    queryFn: () => api.get<PipelineField[]>(`/pipelines/${pipelineId}/fields`),
    enabled: !!pipelineId,
  });
}

export function useRules(pipelineId: number | null) {
  return useQuery({
    queryKey: [KEY, "rules", pipelineId],
    queryFn: () => api.get<RuleWithMaps[]>(`/pipelines/${pipelineId}/rules`),
    enabled: !!pipelineId,
  });
}

export function usePipelineAccess(pipelineId: number | null) {
  return useQuery({
    queryKey: [KEY, "access", pipelineId],
    queryFn: () => api.get<PipelineAccessData>(`/pipelines/${pipelineId}/access`),
    enabled: !!pipelineId,
  });
}

export function usePipelineMutations(pipelineId?: number) {
  const qc = useQueryClient();
  const invalidate = () => { qc.invalidateQueries({ queryKey: [KEY] }); };
  return {
    createPipeline: useMutation({ mutationFn: (b: any) => api.post("/pipelines", b), onSuccess: invalidate }),
    updatePipeline: useMutation({ mutationFn: ({ id, ...b }: any) => api.patch(`/pipelines/${id}`, b), onSuccess: invalidate }),
    archivePipeline: useMutation({ mutationFn: (id: number) => api.post(`/pipelines/${id}/archive`, {}), onSuccess: invalidate }),
    deletePipeline: useMutation({ mutationFn: (id: number) => api.delete(`/pipelines/${id}`), onSuccess: invalidate }),
    createStage: useMutation({ mutationFn: (b: any) => api.post(`/pipelines/${pipelineId}/stages`, b), onSuccess: invalidate }),
    updateStage: useMutation({ mutationFn: ({ stageId, ...b }: any) => api.patch(`/pipelines/${pipelineId}/stages/${stageId}`, b), onSuccess: invalidate }),
    deleteStage: useMutation({ mutationFn: (stageId: number) => api.delete(`/pipelines/${pipelineId}/stages/${stageId}`), onSuccess: invalidate }),
    reorderStages: useMutation({
      mutationFn: (orderedIds: number[]) =>
        api.post(`/pipelines/${pipelineId}/stages/reorder`, { orderedIds }),
      // Optimistic: reorder the cached pipeline's stages immediately so columns snap.
      onMutate: async (orderedIds: number[]) => {
        const key = [KEY, "one", pipelineId];
        await qc.cancelQueries({ queryKey: key });
        const prev = qc.getQueryData<PipelineWithStages>(key);
        if (prev?.stages) {
          const byId = new Map(prev.stages.map((s) => [s.id, s]));
          const reordered = [
            ...orderedIds.map((id) => byId.get(id)).filter((s): s is PipelineStage => !!s),
            ...prev.stages.filter((s) => !orderedIds.includes(s.id)),
          ];
          qc.setQueryData<PipelineWithStages>(key, { ...prev, stages: reordered });
        }
        return { prev };
      },
      onError: (_e, _vars, ctx) => {
        if (ctx?.prev) qc.setQueryData([KEY, "one", pipelineId], ctx.prev);
      },
      onSettled: invalidate,
    }),
    createCard: useMutation({ mutationFn: (b: any) => api.post(`/pipelines/${pipelineId}/cards`, b), onSuccess: invalidate }),
    updateCard: useMutation({ mutationFn: ({ cardId, ...b }: any) => api.patch(`/pipelines/cards/${cardId}`, b), onSuccess: invalidate }),
    moveCard: useMutation({ mutationFn: ({ cardId, toStageId, toPosition }: any) => api.post(`/pipelines/cards/${cardId}/move`, { toStageId, toPosition }), onSuccess: invalidate }),
    deleteCard: useMutation({ mutationFn: (cardId: number) => api.delete(`/pipelines/cards/${cardId}`), onSuccess: invalidate }),
    addComment: useMutation({
      mutationFn: async ({ cardId, body, type, files }: { cardId: number; body: string; type?: string; files?: File[] }) => {
        const form = new FormData();
        form.append("body", body ?? "");
        form.append("type", type ?? "note");
        for (const f of files ?? []) {
          if (f.type === "image/jpeg") {
            try {
              const r = await compressImage(f, { maxDim: 1920, maxBytes: 1_500_000 });
              form.append("files", await dataUrlToFile(r.dataUrl, f.name));
              continue;
            } catch { /* fall through: upload original */ }
          }
          form.append("files", f);
        }
        const res = await fetch(`/api/pipelines/cards/${cardId}/comments`, {
          method: "POST", headers: { ...getAuthHeaders() }, body: form,
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || "Gagal mengirim");
        return json.data;
      },
      onSuccess: invalidate,
    }),
    addFollower: useMutation({ mutationFn: ({ cardId, userId }: any) => api.post(`/pipelines/cards/${cardId}/followers`, { userId }), onSuccess: invalidate }),
    removeFollower: useMutation({ mutationFn: ({ cardId, userId }: any) => api.delete(`/pipelines/cards/${cardId}/followers/${userId}`), onSuccess: invalidate }),
    createField: useMutation({ mutationFn: (b: any) => api.post(`/pipelines/${pipelineId}/fields`, b), onSuccess: invalidate }),
    updateField: useMutation({ mutationFn: ({ fieldId, ...b }: any) => api.patch(`/pipelines/${pipelineId}/fields/${fieldId}`, b), onSuccess: invalidate }),
    deleteField: useMutation({ mutationFn: (fieldId: number) => api.delete(`/pipelines/${pipelineId}/fields/${fieldId}`), onSuccess: invalidate }),
    reorderFields: useMutation({
      mutationFn: (orderedIds: number[]) =>
        api.post(`/pipelines/${pipelineId}/fields/reorder`, { orderedIds }),
      // Optimistic: reorder the cached fields list immediately so the dialog snaps.
      onMutate: async (orderedIds: number[]) => {
        const key = [KEY, "fields", pipelineId];
        await qc.cancelQueries({ queryKey: key });
        const prev = qc.getQueryData<PipelineField[]>(key);
        if (prev) {
          const byId = new Map(prev.map((f) => [f.id, f]));
          const reordered = [
            ...orderedIds.map((id) => byId.get(id)).filter((f): f is PipelineField => !!f),
            ...prev.filter((f) => !orderedIds.includes(f.id)),
          ].map((f, i) => ({ ...f, position: i }));
          qc.setQueryData<PipelineField[]>(key, reordered);
        }
        return { prev };
      },
      onError: (_e, _vars, ctx: any) => {
        if (ctx?.prev) qc.setQueryData([KEY, "fields", pipelineId], ctx.prev);
      },
      onSettled: invalidate,
    }),
    setCardValues: useMutation({ mutationFn: ({ cardId, values }: any) => api.put(`/pipelines/cards/${cardId}/values`, { values }), onSuccess: invalidate }),
    setAccess: useMutation({ mutationFn: ({ pipelineId: pid, restricted, grants }: any) => api.put(`/pipelines/${pid}/access`, { restricted, grants }), onSuccess: invalidate }),
    createRule: useMutation({ mutationFn: (b: any) => api.post(`/pipelines/${pipelineId}/rules`, b), onSuccess: invalidate }),
    updateRule: useMutation({ mutationFn: ({ ruleId, ...b }: any) => api.patch(`/pipelines/${pipelineId}/rules/${ruleId}`, b), onSuccess: invalidate }),
    deleteRule: useMutation({ mutationFn: (ruleId: number) => api.delete(`/pipelines/${pipelineId}/rules/${ruleId}`), onSuccess: invalidate }),
  };
}

export function useImportCards(pipelineId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rows: any[]) =>
      api.post<{ created: number; skipped: number; errors: { index: number; reason: string }[] }>(
        `/pipelines/${pipelineId}/cards/import`,
        { rows },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, "cards", pipelineId] }),
  });
}

export async function downloadCardsCsv(pipelineId: number, pipelineName: string): Promise<void> {
  const blob = await api.getBlob(`/pipelines/${pipelineId}/cards/export`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${pipelineName.replace(/[^a-zA-Z0-9-_]+/g, "_")}-cards.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type PipelineTemplate = {
  id: number;
  name: string;
  description: string | null;
  icon: string | null;
  color: string;
  definition: string;
  isBuiltin: number;
  createdAt: string;
};

export function usePipelineTemplates() {
  return useQuery<PipelineTemplate[]>({
    queryKey: ["pipeline-templates"],
    queryFn: () => api.get<PipelineTemplate[]>(`/pipeline-templates`),
  });
}

export function useTemplateMutations() {
  const qc = useQueryClient();
  const inv = () => {
    qc.invalidateQueries({ queryKey: ["pipeline-templates"] });
    qc.invalidateQueries({ queryKey: [KEY] });
  };
  return {
    apply: useMutation({ mutationFn: ({ id, ...b }: any) => api.post<Pipeline>(`/pipeline-templates/${id}/apply`, b), onSuccess: inv }),
    saveAs: useMutation({ mutationFn: (b: { fromPipelineId: number; name: string; description?: string }) => api.post<PipelineTemplate>(`/pipeline-templates`, b), onSuccess: inv }),
    remove: useMutation({ mutationFn: (id: number) => api.delete(`/pipeline-templates/${id}`), onSuccess: inv }),
  };
}

export function useCardRelations(cardId: number | null) {
  return useQuery({
    queryKey: ["card-relations", cardId],
    queryFn: () => api.get<CardRelation[]>(`/pipelines/cards/${cardId}/relations`),
    enabled: cardId != null,
  });
}

export interface RelatedCard {
  id: number; pipelineId: number; pipelineName: string; stageId: number; stageLabel: string;
  title: string; relationType: string | null; originCardId: number | null;
}

export function useRelatedCards(cardId: number | null) {
  return useQuery({
    queryKey: ["card-related", cardId],
    queryFn: () => api.get<RelatedCard[]>(`/pipelines/cards/${cardId}/related`),
    enabled: cardId != null,
  });
}

export type RoleBasic = { id: number; name: string };

export function useRoles() {
  return useQuery({
    queryKey: ["/api/roles"],
    queryFn: () => api.get<RoleBasic[]>("/roles"),
  });
}

// ── Collections engine-mode toggle (collections → pipeline cutover) ──────────
export type CollectionsEngineMode = "legacy" | "pipeline";
export type CollectionsEngineModeData = { mode: CollectionsEngineMode; pipelineId: number | null };

export function useCollectionsEngineMode() {
  return useQuery({
    queryKey: ["collections-engine-mode"],
    queryFn: () => api.get<CollectionsEngineModeData>(`/collections/engine-mode`),
  });
}

export function useSetCollectionsEngineMode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { mode: CollectionsEngineMode; pipelineId?: number | null }) =>
      api.put<{ ok: boolean; mode: CollectionsEngineMode }>(`/collections/engine-mode`, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["collections-engine-mode"] }),
  });
}

export function useCardRelationMutations(cardId: number) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["card-relations", cardId] });
  return {
    add: useMutation({
      mutationFn: (body: { entityType: RelationEntityType; entityId: number; label?: string }) =>
        api.post<CardRelation>(`/pipelines/cards/${cardId}/relations`, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (relationId: number) =>
        api.delete(`/pipelines/cards/${cardId}/relations/${relationId}`),
      onSuccess: invalidate,
    }),
  };
}

export interface CardAttachment {
  id: number; cardId: number; pipelineId: number; fileName: string; filePath: string;
  mimeType: string; sizeBytes: number; kind: "image" | "file"; uploadedBy: number; createdAt: string;
}

export function useCardAttachments(cardId: number | null) {
  return useQuery({
    queryKey: ["card-attachments", cardId],
    queryFn: () => api.get<CardAttachment[]>(`/pipelines/cards/${cardId}/attachments`),
    enabled: cardId != null,
  });
}

// Convert a compressed dataURL back into a File for multipart upload.
async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], name, { type: blob.type });
}

export function useUploadAttachments(cardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (files: File[]) => {
      const form = new FormData();
      for (const f of files) {
        // Compress JPEGs to save disk; keep png/webp/docs as-is (preserve alpha / binary).
        if (f.type === "image/jpeg") {
          try {
            const r = await compressImage(f, { maxDim: 1920, maxBytes: 1_500_000 });
            form.append("files", await dataUrlToFile(r.dataUrl, f.name));
            continue;
          } catch { /* fall through: upload original */ }
        }
        form.append("files", f);
      }
      const res = await fetch(`/api/pipelines/cards/${cardId}/attachments`, {
        method: "POST",
        headers: { ...getAuthHeaders() }, // NO Content-Type — browser sets multipart boundary
        body: form,
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Upload gagal");
      return json.data as CardAttachment[];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["card-attachments", cardId] }),
  });
}

export function useDeleteAttachment(cardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/pipelines/attachments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["card-attachments", cardId] }),
  });
}

export interface CardAssignee { id: number; cardId: number; userId: number; createdAt: string }

export function useCardAssignees(cardId: number | null) {
  return useQuery({
    queryKey: ["card-assignees", cardId],
    queryFn: () => api.get<CardAssignee[]>(`/pipelines/cards/${cardId}/assignees`),
    enabled: cardId != null,
  });
}
export function useAddCardAssignee(cardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => api.post(`/pipelines/cards/${cardId}/assignees`, { userId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["card-assignees", cardId] }),
  });
}
export function useRemoveCardAssignee(cardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => api.delete(`/pipelines/cards/${cardId}/assignees/${userId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["card-assignees", cardId] }),
  });
}

export function useRetriggerCard(cardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/pipelines/cards/${cardId}/retrigger`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, "card", cardId] });
      qc.invalidateQueries({ queryKey: ["card-related", cardId] });
    },
  });
}

export interface BulkResult { processed: number; succeeded: number; failed: { cardId: number; reason: string }[] }

export function useBulkCardAction(pipelineId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { op: string; cardIds: number[]; payload?: any; runAutomation?: boolean; overwrite?: boolean }) =>
      api.post<BulkResult>(`/pipelines/${pipelineId}/cards/bulk`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, "cards", pipelineId] }),
  });
}

export interface CollectionMetricsData {
  totalCards: number; activeCount: number; paidCount: number; writeoffCount: number;
  totalOutstanding: number; successRate: number | null;
  aging: { label: string; count: number }[];
  byStage: { stageId: number; label: string; count: number }[];
}
export function useCollectionMetrics(pipelineId: number, enabled: boolean) {
  return useQuery({
    queryKey: ["/api/pipelines", pipelineId, "collection-metrics"],
    queryFn: () => api.get<CollectionMetricsData>(`/pipelines/${pipelineId}/collection-metrics`),
    enabled,
  });
}

export interface MetricResult { id: number; name: string; description: string | null; icon: string | null; color: string; type: string; value: number; formatted: string; }
export interface MetricTimeCtx { preset: string; from?: string | null; to?: string | null; }
export function usePipelineMetrics(pipelineId: number, ctx?: MetricTimeCtx | null) {
  const qs = (() => {
    if (!ctx || !ctx.preset || ctx.preset === "all") return "";
    const p = new URLSearchParams({ ctx: ctx.preset });
    if (ctx.preset === "custom") { if (ctx.from) p.set("from", ctx.from); if (ctx.to) p.set("to", ctx.to); }
    return `?${p.toString()}`;
  })();
  return useQuery({
    queryKey: ["/api/pipelines", pipelineId, "metrics", ctx?.preset ?? "all", ctx?.from ?? "", ctx?.to ?? ""],
    queryFn: () => api.get<MetricResult[]>(`/pipelines/${pipelineId}/metrics${qs}`),
  });
}
export function useMetricDefs(pipelineId: number, enabled: boolean) {
  return useQuery({ queryKey: ["/api/pipelines", pipelineId, "metric-defs"], queryFn: () => api.get<any[]>(`/pipelines/${pipelineId}/metric-defs`), enabled });
}
export function useSaveMetricDef(pipelineId: number) {
  const qc = useQueryClient();
  const inv = () => { qc.invalidateQueries({ queryKey: ["/api/pipelines", pipelineId, "metric-defs"] }); qc.invalidateQueries({ queryKey: ["/api/pipelines", pipelineId, "metrics"] }); };
  return {
    create: useMutation({ mutationFn: (body: any) => api.post(`/pipelines/${pipelineId}/metric-defs`, body), onSuccess: inv }),
    update: useMutation({ mutationFn: ({ id, body }: { id: number; body: any }) => api.patch(`/pipelines/${pipelineId}/metric-defs/${id}`, body), onSuccess: inv }),
    remove: useMutation({ mutationFn: (id: number) => api.delete(`/pipelines/${pipelineId}/metric-defs/${id}`), onSuccess: inv }),
  };
}

export function useCardLeadLink(cardId: number) {
  return useQuery<{ link: { leadId: number; cardId: number } | null }>({
    queryKey: ["card-lead-link", cardId],
    queryFn: () => api.get(`/pipelines/cards/${cardId}/lead-link`),
    enabled: cardId != null,
    retry: 0,
  });
}

export function useCreateLeadFromCard(cardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; phone?: string; address?: string; category?: string; district?: string; village?: string; lat?: number; lng?: number }) =>
      api.post(`/pipelines/cards/${cardId}/create-lead`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["card-lead-link", cardId] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}
