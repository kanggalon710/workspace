// Pure form-state helpers for the pipeline rule dialog — no React.
// SoC: hydration (ruleToDraft) + validation/body (draftToPayload) live here so
// the same logic drives BOTH create and edit, and can be reasoned about in isolation.
import type { PipelineRuleActionType, SetFieldConfig, MoveStageConfig, AssignConfig } from "@shared/schema";
import type { RuleWithMaps, RuleActionView } from "@/hooks/usePipelines";
import type { DraftCondition } from "./ConditionsBuilder";
import type { RuleRecurrence } from "@shared/ruleRecurrence";
import { parseRecurrence } from "@shared/ruleRecurrence";
import { notifyConfigToDraft, notifyDraftToConfig, emptyNotifyDraft, type NotifyDraft } from "@shared/notifyConfig";

// ── condition serialization helper ───────────────────────────────────────────
function buildConditionGroups(conditions: DraftCondition[][]) {
  return conditions
    .map((g) =>
      g
        .filter((c) => (c.source === "billing" || c.source === "lead") ? !!c.attr : c.fieldId !== "")
        .map((c) => (c.source === "billing" || c.source === "lead")
          ? { source: c.source, attr: c.attr, op: c.op, ...(c.op === "empty" || c.op === "not_empty" ? {} : { value: c.value }) }
          : { fieldId: Number(c.fieldId), op: c.op, ...(c.op === "empty" || c.op === "not_empty" ? {} : { value: c.value }) }),
    )
    .filter((g) => g.length > 0);
}

// ── billing_sync field-map row ───────────────────────────────────────────────
export type BillingFieldMapRow = {
  _key: string;
  attr: string;         // key from BILLING_ATTRS
  targetFieldId: string; // stringified number or ""
};

let _billingRowSeq = 0;
export function emptyBillingRow(): BillingFieldMapRow {
  return { _key: `bfm${_billingRowSeq++}`, attr: "", targetFieldId: "" };
}

// ── lead_* field-map row ─────────────────────────────────────────────────────
export type LeadFieldMapRow = {
  _key: string;
  attr: string;         // key from LEAD_ATTRS
  targetFieldId: string; // stringified number or ""
};

let _leadRowSeq = 0;
export function emptyLeadRow(): LeadFieldMapRow {
  return { _key: `lfm${_leadRowSeq++}`, attr: "", targetFieldId: "" };
}

export type ActionDraft = {
  _key: string;
  actionType: PipelineRuleActionType;
  targetPipelineId: string;
  targetStageId: string;
  titleTemplate: string;
  copyAssignee: boolean;
  relationType: string;   // "" | mirror | duplicate | linked | child  (create_card lineage)
  reuseExisting: boolean; // create_card: bind to an existing linked card
  maps: { sourceFieldId: number | ""; targetFieldId: number | "" }[];
  setFieldId: string;
  setFieldValue: string;
  moveStageId: string;
  assignUserId: string;
  notifyBell: boolean;
  notifyWebhook: boolean;
  bellTarget: "assignee" | "user" | "creator";
  bellUserId: string;
  bellTitle: string;
  bellMessage: string;
  webhookUrl: string;
};

let _actionKeySeq = 0;
export function emptyAction(): ActionDraft {
  return { _key: `a${_actionKeySeq++}`, actionType: "create_card", targetPipelineId: "", targetStageId: "", titleTemplate: "", copyAssignee: false, relationType: "", reuseExisting: false, maps: [], setFieldId: "", setFieldValue: "", moveStageId: "", assignUserId: "", notifyBell: true, notifyWebhook: false, bellTarget: "assignee", bellUserId: "", bellTitle: "", bellMessage: "", webhookUrl: "" };
}

/** Map one server action row back into an editable ActionDraft. Shared by all trigger branches. */
function actionToDraft(a: RuleActionView): ActionDraft {
  const act = emptyAction();
  act.actionType = a.actionType as PipelineRuleActionType;
  if (a.actionType === "create_card") {
    act.targetPipelineId = a.targetPipelineId != null ? String(a.targetPipelineId) : "";
    act.targetStageId = a.targetStageId != null ? String(a.targetStageId) : "";
    act.titleTemplate = a.titleTemplate ?? "";
    act.copyAssignee = a.copyAssignee === 1;
    act.maps = (a.fieldMaps ?? []).map((m) => ({ sourceFieldId: m.sourceFieldId, targetFieldId: m.targetFieldId }));
    const lc = (a.actionConfig ?? null) as { relationType?: string; reuseExisting?: boolean } | null;
    act.relationType = lc?.relationType ?? "";
    act.reuseExisting = lc?.reuseExisting === true;
  } else if (a.actionType === "move_linked") {
    act.targetPipelineId = a.targetPipelineId != null ? String(a.targetPipelineId) : "";
    act.targetStageId = a.targetStageId != null ? String(a.targetStageId) : "";
  } else if (a.actionType === "set_field_linked") {
    act.targetPipelineId = a.targetPipelineId != null ? String(a.targetPipelineId) : "";
    act.maps = (a.fieldMaps ?? []).map((m) => ({ sourceFieldId: m.sourceFieldId, targetFieldId: m.targetFieldId }));
  } else if (a.actionType === "assign_linked") {
    act.targetPipelineId = a.targetPipelineId != null ? String(a.targetPipelineId) : "";
  } else if (a.actionType === "set_field") {
    const cfg = a.actionConfig as SetFieldConfig | null;
    act.setFieldId = cfg ? String(cfg.fieldId) : "";
    act.setFieldValue = cfg?.value ?? "";
  } else if (a.actionType === "move_stage") {
    const cfg = a.actionConfig as MoveStageConfig | null;
    act.moveStageId = cfg ? String(cfg.stageId) : "";
  } else if (a.actionType === "assign") {
    const cfg = a.actionConfig as AssignConfig | null;
    act.assignUserId = cfg && cfg.assigneeId != null ? String(cfg.assigneeId) : "";
  } else if (a.actionType === "notify") {
    const nd = notifyConfigToDraft(a.actionConfig as any);
    act.notifyBell = nd.notifyBell; act.notifyWebhook = nd.notifyWebhook; act.bellTarget = nd.bellTarget;
    act.bellUserId = nd.bellUserId; act.bellTitle = nd.bellTitle; act.bellMessage = nd.bellMessage; act.webhookUrl = nd.webhookUrl;
  }
  return act;
}

export type RuleDraft = {
  triggerType: "stage_enter" | "time" | "billing_sync" | "card_updated" | "assignee_changed" | "field_updated"
    | "lead_created" | "lead_updated" | "lead_assigned" | "lead_stage_changed" | "lead_converted";
  triggerStageId: string;
  anchor: "stage_entered" | "card_created" | "field_date";
  anchorFieldId: string;
  offsetN: string;
  offsetUnit: "hours" | "days";
  direction: "after" | "before";
  repeat: "once" | "every";
  repeatEveryN: string;
  scopeStageId: string;
  actions: ActionDraft[];
  conditions: DraftCondition[][];
  // billing_sync sub-form
  billingFilterCustomerType: string;
  billingFilterStatus: string;
  billingFilterIsIsolir: "" | "0" | "1";
  billingFilterBillingStatus: string;
  billingFilterMinOverdueDays: string;
  billingOverdueFromAttr: string;
  billingEntryStageId: string;
  billingResolveStageId: string;
  billingTitleSource: string;
  billingFieldMap: BillingFieldMapRow[];
  // field_updated sub-form
  fieldUpdatedFieldId: string;
  // lead_* sub-form
  leadSources: string[];
  leadEntryStageId: string;
  leadTitleSource: string;
  leadFieldMap: LeadFieldMapRow[];
  leadOnDuplicate: "create" | "update" | "ignore" | "reopen";
  leadDedupBy: "lead_id" | "phone";
  leadReopenStageId: string;
  leadNotify: NotifyDraft;
  recurrence: RuleRecurrence;
};

export function emptyDraft(): RuleDraft {
  return {
    triggerType: "stage_enter",
    triggerStageId: "",
    anchor: "stage_entered",
    anchorFieldId: "",
    offsetN: "3",
    offsetUnit: "days",
    direction: "after",
    repeat: "once",
    repeatEveryN: "1",
    scopeStageId: "",
    actions: [emptyAction()],
    conditions: [],
    billingFilterCustomerType: "",
    billingFilterStatus: "",
    billingFilterIsIsolir: "",
    billingFilterBillingStatus: "",
    billingFilterMinOverdueDays: "",
    billingOverdueFromAttr: "dueDate",
    billingEntryStageId: "",
    billingResolveStageId: "",
    billingTitleSource: "name",
    billingFieldMap: [],
    fieldUpdatedFieldId: "",
    leadSources: [], leadEntryStageId: "", leadTitleSource: "name", leadFieldMap: [],
    leadOnDuplicate: "ignore", leadDedupBy: "lead_id", leadReopenStageId: "",
    leadNotify: emptyNotifyDraft(),
    recurrence: "once",
  };
}

/** Map a server rule back into editable form values (edit-mode hydration). */
export function ruleToDraft(r: RuleWithMaps): RuleDraft {
  const d = emptyDraft();
  if (r.triggerType === "card_updated" || r.triggerType === "assignee_changed" || r.triggerType === "field_updated") {
    d.triggerType = r.triggerType as "card_updated" | "assignee_changed" | "field_updated";
    if (r.triggerType === "field_updated") {
      const tc = r.triggerConfig as any;
      d.fieldUpdatedFieldId = tc?.fieldId != null ? String(tc.fieldId) : "";
    }
    d.actions = (r.actions ?? []).map(actionToDraft);
    if (d.actions.length === 0) d.actions = [emptyAction()];
    d.conditions = (r.conditions?.groups ?? []).map((g) =>
      g.map((c) => ({ source: ((c as any).source as DraftCondition["source"]) ?? "field", fieldId: typeof c.fieldId === "number" ? c.fieldId : "", attr: (c as any).attr, op: c.op, value: c.value ?? "" })),
    );
    d.recurrence = parseRecurrence((r as any).recurrence);
    return d;
  }
  if (r.triggerType === "billing_sync") {
    d.triggerType = "billing_sync";
    // targetStageId is the entry stage for billing_sync (at rule level, not inside actions)
    d.billingEntryStageId = r.targetStageId != null ? String(r.targetStageId) : "";
    const tc = r.triggerConfig as any;
    if (tc) {
      const f = tc.filter ?? {};
      d.billingFilterCustomerType = f.customerType ?? "";
      d.billingFilterStatus = f.status ?? "";
      d.billingFilterBillingStatus = f.billingStatus ?? "";
      d.billingFilterIsIsolir = f.isIsolir === 0 ? "0" : f.isIsolir === 1 ? "1" : "";
      d.billingFilterMinOverdueDays = f.minDaysOverdue != null ? String(f.minDaysOverdue) : "";
      d.billingOverdueFromAttr = f.overdueFromAttr || "dueDate";
      d.billingResolveStageId = tc.resolveStageId != null ? String(tc.resolveStageId) : "";
      d.billingTitleSource = tc.titleSource ?? "name";
      d.billingFieldMap = (tc.fieldMap ?? []).map((row: any) =>
        ({ _key: `bfm${_billingRowSeq++}`, attr: row.attr ?? "", targetFieldId: row.targetFieldId != null ? String(row.targetFieldId) : "" })
      );
    }
    d.recurrence = parseRecurrence((r as any).recurrence);
    return d;
  }
  if (String(r.triggerType ?? "").startsWith("lead_")) {
    d.triggerType = r.triggerType as any;
    let c: any = {};
    try { c = r.triggerConfig ? (typeof r.triggerConfig === "string" ? JSON.parse(r.triggerConfig) : r.triggerConfig) : {}; } catch { c = {}; }
    d.leadSources = Array.isArray(c.sources) ? c.sources.map(String) : [];
    d.leadEntryStageId = c.entryStageId != null ? String(c.entryStageId) : "";
    d.leadTitleSource = c.titleSource || "name";
    d.leadFieldMap = Array.isArray(c.fieldMap) ? c.fieldMap.map((m: any) => ({ _key: `lfm${_leadRowSeq++}`, attr: String(m.attr), targetFieldId: String(m.targetFieldId) })) : [];
    d.leadOnDuplicate = ["create", "update", "ignore", "reopen"].includes(c.onDuplicate) ? c.onDuplicate : "ignore";
    d.leadDedupBy = c.dedupBy === "phone" ? "phone" : "lead_id";
    d.leadReopenStageId = c.reopenStageId != null ? String(c.reopenStageId) : "";
    d.conditions = (r.conditions?.groups ?? []).map((g: any[]) =>
      g.map((c: any) => ({ source: (c.source as DraftCondition["source"]) ?? "field", fieldId: typeof c.fieldId === "number" ? c.fieldId : "", attr: c.attr, op: c.op, value: c.value ?? "" })));
    d.leadNotify = notifyConfigToDraft(c.notify ?? null);
    return d;
  }
  d.triggerType = r.triggerType === "time" ? "time" : "stage_enter";
  if (d.triggerType === "time") {
    if (r.triggerConfig) {
      const c = r.triggerConfig;
      d.anchor = c.anchor;
      d.anchorFieldId = c.fieldId != null ? String(c.fieldId) : "";
      d.offsetN = String(c.offsetN);
      d.offsetUnit = c.offsetUnit;
      d.direction = c.direction;
      d.repeat = c.repeat;
      d.repeatEveryN = c.repeatEveryN != null ? String(c.repeatEveryN) : "1";
    }
    d.scopeStageId = r.triggerStageId != null ? String(r.triggerStageId) : "";
  } else {
    d.triggerStageId = r.triggerStageId != null ? String(r.triggerStageId) : "";
  }

  d.actions = (r.actions ?? []).map(actionToDraft);
  if (d.actions.length === 0) d.actions = [emptyAction()];

  d.conditions = (r.conditions?.groups ?? []).map((g) =>
    g.map((c) => ({ source: ((c as any).source as DraftCondition["source"]) ?? "field", fieldId: typeof c.fieldId === "number" ? c.fieldId : "", attr: (c as any).attr, op: c.op, value: c.value ?? "" })),
  );
  d.recurrence = parseRecurrence((r as any).recurrence);
  return d;
}

/** Validate a draft and build the create/update request body. Single source of truth. */
export function draftToPayload(d: RuleDraft):
  | { ok: true; payload: Record<string, any> }
  | { ok: false; error: string } {
  let triggerPart: Record<string, any>;
  if (d.triggerType === "card_updated" || d.triggerType === "assignee_changed" || d.triggerType === "field_updated") {
    triggerPart = { triggerType: d.triggerType };
    if (d.triggerType === "field_updated") {
      triggerPart.triggerConfig = { fieldId: d.fieldUpdatedFieldId ? Number(d.fieldUpdatedFieldId) : null };
    }
    // fall through to shared conditions + actions validation below
  } else if (d.triggerType === "billing_sync") {
    if (!d.billingEntryStageId) return { ok: false, error: "Pilih stage masuk (entry) untuk billing_sync" };
    const filter: Record<string, any> = {};
    if (d.billingFilterCustomerType.trim()) filter.customerType = d.billingFilterCustomerType.trim();
    if (d.billingFilterStatus.trim()) filter.status = d.billingFilterStatus.trim();
    if (d.billingFilterBillingStatus.trim()) filter.billingStatus = d.billingFilterBillingStatus.trim();
    if (d.billingFilterIsIsolir === "0") filter.isIsolir = 0;
    else if (d.billingFilterIsIsolir === "1") filter.isIsolir = 1;
    const minOd = Number(d.billingFilterMinOverdueDays);
    if (Number.isFinite(minOd) && minOd > 0) {
      filter.minDaysOverdue = minOd;
      if (d.billingOverdueFromAttr && d.billingOverdueFromAttr !== "dueDate") filter.overdueFromAttr = d.billingOverdueFromAttr;
    }
    const triggerConfig: Record<string, any> = {
      filter,
      resolveStageId: d.billingResolveStageId ? Number(d.billingResolveStageId) : null,
      titleSource: d.billingTitleSource || "name",
      fieldMap: d.billingFieldMap
        .filter((row) => row.attr && row.targetFieldId)
        .map((row) => ({ attr: row.attr, targetFieldId: Number(row.targetFieldId) })),
    };
    return { ok: true, payload: { triggerType: "billing_sync", targetStageId: Number(d.billingEntryStageId), triggerConfig } };
  } else if (String(d.triggerType).startsWith("lead_")) {
    if (!d.leadEntryStageId) return { ok: false, error: "Pilih stage masuk (entry) untuk trigger lead" };
    if (d.leadOnDuplicate === "reopen" && !d.leadReopenStageId) return { ok: false, error: "Pilih stage 'buka lagi' untuk mode reopen" };
    let leadNotify: any = undefined;
    if (d.leadNotify.notifyBell || d.leadNotify.notifyWebhook) {
      const r = notifyDraftToConfig(d.leadNotify);
      if (!r.ok) return { ok: false, error: r.error };
      leadNotify = r.config;
    }
    const triggerConfig = {
      sources: d.leadSources,
      entryStageId: Number(d.leadEntryStageId),
      titleSource: d.leadTitleSource || "name",
      fieldMap: d.leadFieldMap.filter((m) => m.attr && m.targetFieldId).map((m) => ({ attr: m.attr, targetFieldId: Number(m.targetFieldId) })),
      onDuplicate: d.leadOnDuplicate,
      dedupBy: d.leadDedupBy,
      reopenStageId: d.leadReopenStageId ? Number(d.leadReopenStageId) : null,
      ...(leadNotify !== undefined ? { notify: leadNotify } : {}),
    };
    const leadConditionGroups = buildConditionGroups(d.conditions);
    return { ok: true, payload: { triggerType: d.triggerType, triggerConfig, conditions: leadConditionGroups.length ? { groups: leadConditionGroups } : null } };
  } else if (d.triggerType === "stage_enter") {
    if (!d.triggerStageId) return { ok: false, error: "Pilih stage trigger" };
    triggerPart = { triggerType: "stage_enter", triggerStageId: Number(d.triggerStageId) };
  } else {
    if (d.anchor === "field_date" && !d.anchorFieldId) return { ok: false, error: "Pilih field tanggal untuk anchor" };
    const n = Number(d.offsetN);
    if (!Number.isFinite(n) || n < 0) return { ok: false, error: "Offset harus angka ≥ 0" };
    const cfg: Record<string, any> = { anchor: d.anchor, offsetN: n, offsetUnit: d.offsetUnit, direction: d.direction, repeat: d.repeat };
    if (d.anchor === "field_date") cfg.fieldId = Number(d.anchorFieldId);
    if (d.repeat === "every") {
      const e = Number(d.repeatEveryN);
      if (!Number.isFinite(e) || e <= 0) return { ok: false, error: "Interval ulang harus > 0" };
      cfg.repeatEveryN = e;
    }
    triggerPart = { triggerType: "time", triggerStageId: d.scopeStageId ? Number(d.scopeStageId) : null, triggerConfig: cfg };
  }

  const conditionGroups = buildConditionGroups(d.conditions);

  const actions: Record<string, any>[] = [];
  for (const a of d.actions) {
    if (a.actionType === "create_card") {
      if (!a.targetPipelineId || !a.targetStageId) return { ok: false, error: "Lengkapi target create_card sebelum menyimpan" };
      actions.push({
        actionType: "create_card",
        targetPipelineId: Number(a.targetPipelineId),
        targetStageId: Number(a.targetStageId),
        titleTemplate: a.titleTemplate.trim() || null,
        copyAssignee: a.copyAssignee ? 1 : 0,
        actionConfig: a.relationType ? { relationType: a.relationType, reuseExisting: a.reuseExisting } : null,
        fieldMaps: a.maps
          .filter((r) => r.sourceFieldId !== "" && r.targetFieldId !== "")
          .map((r) => ({ sourceFieldId: Number(r.sourceFieldId), targetFieldId: Number(r.targetFieldId) })),
      });
    } else if (a.actionType === "move_linked") {
      if (!a.targetPipelineId || !a.targetStageId) return { ok: false, error: "Lengkapi target pindah-tertaut sebelum menyimpan" };
      actions.push({
        actionType: "move_linked",
        targetPipelineId: Number(a.targetPipelineId),
        targetStageId: Number(a.targetStageId),
      });
    } else if (a.actionType === "set_field_linked") {
      if (!a.targetPipelineId) return { ok: false, error: "Lengkapi pipeline target (set field tertaut)" };
      actions.push({
        actionType: "set_field_linked",
        targetPipelineId: Number(a.targetPipelineId),
        fieldMaps: a.maps
          .filter((r) => r.sourceFieldId !== "" && r.targetFieldId !== "")
          .map((r) => ({ sourceFieldId: Number(r.sourceFieldId), targetFieldId: Number(r.targetFieldId) })),
      });
    } else if (a.actionType === "assign_linked") {
      if (!a.targetPipelineId) return { ok: false, error: "Lengkapi pipeline target (sinkron assignee)" };
      actions.push({ actionType: "assign_linked", targetPipelineId: Number(a.targetPipelineId) });
    } else if (a.actionType === "set_field") {
      if (!a.setFieldId) return { ok: false, error: "Pilih field tujuan (set_field)" };
      actions.push({ actionType: "set_field", actionConfig: { fieldId: Number(a.setFieldId), value: a.setFieldValue } });
    } else if (a.actionType === "move_stage") {
      if (!a.moveStageId) return { ok: false, error: "Pilih stage tujuan (move_stage)" };
      actions.push({ actionType: "move_stage", actionConfig: { stageId: Number(a.moveStageId) } });
    } else if (a.actionType === "assign") {
      actions.push({ actionType: "assign", actionConfig: { assigneeId: a.assignUserId ? Number(a.assignUserId) : null } });
    } else if (a.actionType === "notify") {
      const r = notifyDraftToConfig(a);
      if (!r.ok) return { ok: false, error: r.error };
      actions.push({ actionType: "notify", actionConfig: r.config });
    } else {
      return { ok: false, error: "Tipe aksi tidak dikenal" };
    }
  }
  if (actions.length === 0) return { ok: false, error: "Minimal satu aksi wajib" };
  return { ok: true, payload: { ...triggerPart, conditions: conditionGroups.length ? { groups: conditionGroups } : null, actions, recurrence: d.recurrence } };
}
