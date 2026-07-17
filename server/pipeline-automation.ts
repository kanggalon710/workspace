import { storage } from "./storage.js";
import {
  matchStageEnterRules, buildTargetTitle, pickMappedValues,
  parseActionConfig, parseConditionGroups, evaluateConditionGroups,
  parseTimeTriggerConfig, isTimeRuleDue, conditionsUseBilling,
} from "./pipeline-automation-helpers.js";
import { withMitra } from "./tenant-context.js";
import type { PipelineCard, PipelineRule, PipelineRuleAction, NotifyConfig } from "../shared/schema.js";
import { eventRuleMatches } from "../shared/pipelineEventTriggers.js";
import { parseSpawnLineageConfig, masterForSpawn } from "../shared/linkedCardActions.js";
import { parseRecurrence, dedupBeforeFire, recordAfterFire } from "../shared/ruleRecurrence.js";

function buildWebhookPayload(rule: PipelineRule, card: PipelineCard, values: Record<number, string>, firedAt: string) {
  return {
    event: "pipeline.automation",
    ruleId: rule.id, ruleName: rule.name ?? null,
    card: { id: card.id, title: card.title, pipelineId: card.pipelineId, stageId: card.stageId, assigneeId: card.assigneeId ?? null },
    values, firedAt,
  };
}

/** Best-effort outbound webhook POST. ~5s timeout. Never throws. Returns true on any HTTP response. */
export async function postPipelineWebhook(url: string, payload: any): Promise<boolean> {
  let u: URL;
  try { u = new URL(url); } catch { console.warn(`[automation] webhook: invalid URL ${url}`); return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") { console.warn(`[automation] webhook: non-http(s) URL ${url}`); return false; }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: ctrl.signal });
    return true;
  } catch (e: any) {
    console.warn(`[automation] webhook POST ${url} failed: ${e?.message}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Run a single action against a card. Returns true if it mutated. Loop-safe (storage-direct). */
export async function applyAction(action: PipelineRuleAction, rule: PipelineRule, card: PipelineCard, actorId: number): Promise<boolean> {
  if (action.actionType === "create_card") {
    const targetStages = await storage.listStages(action.targetPipelineId!);
    if (!targetStages.some((s) => s.id === action.targetStageId)) {
      console.warn(`[automation] action ${action.id}: target stage ${action.targetStageId} no longer exists — skipped`);
      return false;
    }
    const assigneeId = (action.copyAssignee && card.assigneeId && await storage.canUserAccessPipeline(card.assigneeId, action.targetPipelineId!))
      ? card.assigneeId : null;
    if (action.copyAssignee && card.assigneeId && assigneeId === null) {
      console.warn(`[automation] action ${action.id}: assignee ${card.assigneeId} lacks access to pipeline ${action.targetPipelineId} — created unassigned`);
    }

    // SP3a: opt-in lineage. With reuseExisting, bind to an existing sibling instead of duplicating.
    const lineage = parseSpawnLineageConfig(action.actionConfig);
    let targetCard;
    if (lineage?.reuseExisting) {
      const masterId = masterForSpawn(card.masterCardId, card.id);
      const existing = await storage.getSiblingCardInPipeline(masterId, action.targetPipelineId!);
      if (existing) targetCard = existing;
    }
    if (!targetCard) {
      targetCard = await storage.createCard(action.targetPipelineId!, {
        stageId: action.targetStageId!,
        title: buildTargetTitle(action.titleTemplate, card.title),
        description: `Dibuat otomatis dari kartu #${card.id}`,
        assigneeId,
        ...(lineage ? {
          masterCardId: masterForSpawn(card.masterCardId, card.id),
          originCardId: card.id,
          relationType: lineage.relationType,
        } : {}),
      }, actorId);
    }

    const maps = await storage.getActionFieldMaps(action.id);
    if (maps.length) {
      const srcVals = await storage.getCardValues(card.id);
      const targetFieldIds = new Set((await storage.listFields(action.targetPipelineId!)).map((f) => f.id));
      const validMaps = maps.filter((m) => targetFieldIds.has(m.targetFieldId));
      const writes = pickMappedValues(validMaps, srcVals);
      if (writes.length) await storage.setCardValues(targetCard.id, writes);
    }
    return true;
  }
  if (action.actionType === "move_linked") {
    if (!action.targetPipelineId || !action.targetStageId) {
      console.warn(`[automation] action ${action.id}: move_linked needs target pipeline + stage — skipped`);
      return false;
    }
    const masterId = masterForSpawn(card.masterCardId, card.id);
    const sibling = await storage.getSiblingCardInPipeline(masterId, action.targetPipelineId, card.id);
    if (!sibling) {
      console.warn(`[automation] action ${action.id}: no linked card in pipeline ${action.targetPipelineId} — skipped`);
      return false;
    }
    const stages = await storage.listStages(action.targetPipelineId);
    if (!stages.some((s) => s.id === action.targetStageId)) {
      console.warn(`[automation] action ${action.id}: move_linked target stage missing — skipped`);
      return false;
    }
    if (sibling.stageId === action.targetStageId) return false; // already there → no-op
    await storage.moveCard(sibling.id, action.targetStageId, undefined, actorId); // storage-direct → no re-dispatch (loop-safe)
    return true;
  }
  if (action.actionType === "set_field_linked") {
    if (!action.targetPipelineId) {
      console.warn(`[automation] action ${action.id}: set_field_linked needs target pipeline — skipped`);
      return false;
    }
    const masterId = masterForSpawn(card.masterCardId, card.id);
    const sibling = await storage.getSiblingCardInPipeline(masterId, action.targetPipelineId, card.id);
    if (!sibling) {
      console.warn(`[automation] action ${action.id}: no linked card in pipeline ${action.targetPipelineId} — skipped`);
      return false;
    }
    const maps = await storage.getActionFieldMaps(action.id);
    if (!maps.length) return false;
    const srcVals = await storage.getCardValues(card.id);
    const targetFieldIds = new Set((await storage.listFields(action.targetPipelineId)).map((f) => f.id));
    const writes = pickMappedValues(maps.filter((m) => targetFieldIds.has(m.targetFieldId)), srcVals);
    if (!writes.length) return false;
    await storage.setCardValues(sibling.id, writes); // storage-direct → no field_updated dispatch → loop-safe
    return true;
  }
  if (action.actionType === "assign_linked") {
    if (!action.targetPipelineId) {
      console.warn(`[automation] action ${action.id}: assign_linked needs target pipeline — skipped`);
      return false;
    }
    const masterId = masterForSpawn(card.masterCardId, card.id);
    const sibling = await storage.getSiblingCardInPipeline(masterId, action.targetPipelineId, card.id);
    if (!sibling) {
      console.warn(`[automation] action ${action.id}: no linked card in pipeline ${action.targetPipelineId} — skipped`);
      return false;
    }
    const newAssignee = card.assigneeId ?? null;
    if (newAssignee != null && !(await storage.canUserAccessPipeline(newAssignee, action.targetPipelineId))) {
      console.warn(`[automation] action ${action.id}: assignee ${newAssignee} lacks access to pipeline ${action.targetPipelineId} — skipped`);
      return false;
    }
    if (sibling.assigneeId === newAssignee) return false; // no-op
    await storage.updateCard(sibling.id, { assigneeId: newAssignee }, actorId); // storage-direct → no re-dispatch
    return true;
  }
  if (action.actionType === "set_field") {
    const cfg = parseActionConfig("set_field", action.actionConfig) as { fieldId: number; value: string } | null;
    const fieldIds = new Set((await storage.listFields(card.pipelineId)).map((f) => f.id));
    if (cfg && fieldIds.has(cfg.fieldId)) {
      await storage.setCardValues(card.id, [{ fieldId: cfg.fieldId, value: cfg.value }]);
      return true;
    }
    console.warn(`[automation] action ${action.id}: set_field config invalid or field missing — skipped`);
    return false;
  }
  if (action.actionType === "move_stage") {
    const cfg = parseActionConfig("move_stage", action.actionConfig) as { stageId: number } | null;
    const stageIds = new Set((await storage.listStages(card.pipelineId)).map((s) => s.id));
    if (cfg && stageIds.has(cfg.stageId) && cfg.stageId !== card.stageId) {
      await storage.moveCard(card.id, cfg.stageId, undefined, actorId);
      return true;
    }
    console.warn(`[automation] action ${action.id}: move_stage config invalid, stage missing, or no-op — skipped`);
    return false;
  }
  if (action.actionType === "assign") {
    const cfg = parseActionConfig("assign", action.actionConfig) as { assigneeId: number | null } | null;
    if (!cfg) { console.warn(`[automation] action ${action.id}: assign config invalid — skipped`); return false; }
    if (cfg.assigneeId != null && !(await storage.canUserAccessPipeline(cfg.assigneeId, card.pipelineId))) {
      console.warn(`[automation] action ${action.id}: assignee ${cfg.assigneeId} lacks access to pipeline ${card.pipelineId} — skipped`);
      return false;
    }
    await storage.updateCard(card.id, { assigneeId: cfg.assigneeId }, actorId);
    return true;
  }
  if (action.actionType === "notify") {
    const cfg = parseActionConfig("notify", action.actionConfig) as NotifyConfig | null;
    if (!cfg) { console.warn(`[automation] notify action ${action.id}: config invalid — skipped`); return false; }
    let acted = false;
    if (cfg.channels.includes("bell")) {
      const userId = cfg.bellTarget === "user" ? cfg.bellUserId
        : cfg.bellTarget === "creator" ? rule.createdBy
        : card.assigneeId;
      if (userId != null) {
        await storage.createNotification({
          userId, type: "automation",
          title: buildTargetTitle(cfg.bellTitle || "Otomasi: {title}", card.title),
          message: cfg.bellMessage ? buildTargetTitle(cfg.bellMessage, card.title) : undefined,
          link: `/pipelines/${card.pipelineId}?card=${card.id}`, entityType: "pipeline_card", entityId: card.id, fromUserId: actorId,
        });
        acted = true;
      } else {
        console.warn(`[automation] notify action ${action.id}: bell target has no recipient — skipped bell`);
      }
    }
    if (cfg.channels.includes("webhook") && cfg.webhookUrl) {
      const values = await storage.getCardValues(card.id);
      const ok = await postPipelineWebhook(cfg.webhookUrl, buildWebhookPayload(rule, card, values, new Date().toISOString()));
      if (ok) acted = true;
    }
    return acted;
  }
  return false;
}

/** Run ALL of a rule's actions in order. Returns true if ANY action mutated. */
export async function applyRuleActions(rule: PipelineRule, card: PipelineCard, actorId: number): Promise<boolean> {
  const actions = await storage.listRuleActions(rule.id);
  let acted = false;
  for (const action of actions) {
    try {
      if (await applyAction(action, rule, card, actorId)) acted = true;
    } catch (e: any) {
      console.warn(`[automation] rule ${rule.id} action ${action.id} failed: ${e?.message}`);
    }
  }
  return acted;
}

/** Evaluate a set of rules against a card: conditions → actions.
 *  dedup=true keeps once-per-card behavior (stage_enter); dedup=false fires every time (events). */
async function runRulesForCard(
  rules: PipelineRule[],
  card: PipelineCard,
  actorId: number,
  opts: { dedup: boolean },
): Promise<void> {
  for (const rule of rules) {
    const mode = parseRecurrence((rule as any).recurrence);
    if (opts.dedup && dedupBeforeFire(mode) && await storage.hasRuleFired(rule.id, card.id)) continue;
    const groups = parseConditionGroups(rule.conditions);
    if (groups.length) {
      // Re-read per rule so a prior rule's set_field is visible to a later rule's condition
      // (preserves the original stage-enter behavior).
      const rec = await storage.getCardValues(card.id);
      const vals = new Map<number, string>(Object.entries(rec).map(([k, v]) => [Number(k), String(v)]));
      const snapshot = conditionsUseBilling(groups) ? await storage.getCardCollectionSnapshot(card.id) : null;
      if (!evaluateConditionGroups(groups, vals, snapshot)) continue;
    }
    const acted = await applyRuleActions(rule, card, actorId);
    if (opts.dedup && recordAfterFire(mode) && acted) await storage.recordRuleFire(rule.id, card.id);
  }
}

/**
 * Run "card entered stage" automations for a card. Best-effort: never throws to the caller.
 * Loop-safe: all mutations call storage directly and do NOT re-invoke this service.
 */
export async function runStageEnterAutomations(card: PipelineCard, actorId: number): Promise<void> {
  try {
    const rules = matchStageEnterRules(await storage.listRules(card.pipelineId), card.stageId);
    await runRulesForCard(rules, card, actorId, { dedup: true });
  } catch (e: any) {
    console.warn(`[automation] runStageEnterAutomations failed for card ${card?.id}: ${e?.message}`);
  }
}

/**
 * Dispatch a card event (card_updated | assignee_changed | field_updated) to matching rules.
 * Fires every occurrence (no dedup). Best-effort: never throws.
 * Loop-safe: only called from user-facing routes, never from automation's own mutations.
 */
export async function dispatchCardEvent(
  eventType: string,
  card: PipelineCard,
  actorId: number,
  ctx?: { changedFieldIds?: number[] },
): Promise<void> {
  try {
    const all = await storage.listRules(card.pipelineId);
    const matched = all.filter((r) => r.enabled === 1 && eventRuleMatches(r, eventType, ctx));
    await runRulesForCard(matched, card, actorId, { dedup: false });
  } catch (e: any) {
    console.warn(`[automation] dispatchCardEvent(${eventType}) failed for card ${card?.id}: ${e?.message}`);
  }
}

/** One evaluation pass over ALL enabled time-trigger rules (every mitra).
 *  Driven by the cron-hit tick endpoint. Best-effort: never throws. */
export async function runTimeTriggers(): Promise<{ evaluated: number; fired: number }> {
  let evaluated = 0, fired = 0;
  let rules: PipelineRule[] = [];
  try {
    rules = await storage.listAllTimeRules();
  } catch (e: any) {
    console.warn(`[automation] runTimeTriggers: listAllTimeRules failed: ${e?.message}`);
    return { evaluated, fired };
  }

  // group rules by mitra so storage auto-scoping is correct inside tenantContext.run
  const byMitra = new Map<number, PipelineRule[]>();
  for (const r of rules) {
    const list = byMitra.get(r.mitraId) ?? [];
    list.push(r);
    byMitra.set(r.mitraId, list);
  }

  const now = new Date();
  for (const [mitraId, mitraRules] of byMitra) {
    await withMitra(mitraId, async () => {
      for (const rule of mitraRules) {
        try {
          const cfg = parseTimeTriggerConfig(rule.triggerConfig);
          if (!cfg) continue;
          const groups = parseConditionGroups(rule.conditions);
          const cards = await storage.listCards(rule.pipelineId);
          // Batch the per-card reads once per rule (anti-N+1): fires keyed by cardId, and — only when
          // conditions/field_date need them — all card values for the pipeline in one query.
          const fires = await storage.getRuleFiresForRule(rule.id);
          const valuesByCard = (groups.length || cfg.anchor === "field_date")
            ? await storage.getAllCardValuesForPipeline(rule.pipelineId)
            : null;
          for (const card of cards) {
            // optional stage scope
            if (rule.triggerStageId != null && card.stageId !== rule.triggerStageId) continue;
            try {
              const fire = fires.get(card.id) ?? null;
              if (cfg.repeat === "once" && fire) continue;

              const values = new Map<number, string>();
              if (valuesByCard) {
                const rec = valuesByCard.get(card.id);
                if (rec) for (const [k, v] of Object.entries(rec)) values.set(Number(k), String(v));
              }
              const snapshot = (groups.length && conditionsUseBilling(groups)) ? await storage.getCardCollectionSnapshot(card.id) : null;
              if (groups.length && !evaluateConditionGroups(groups, values, snapshot)) continue;

              evaluated++;
              if (!isTimeRuleDue(cfg, { createdAt: card.createdAt, stageEnteredAt: card.stageEnteredAt }, values, now, fire?.firedAt ?? null)) continue;

              const acted = await applyRuleActions(rule, card, rule.createdBy);
              if (acted) { await storage.recordOrTouchRuleFire(rule.id, card.id); fired++; }
            } catch (e: any) {
              console.warn(`[automation] time rule ${rule.id} card ${card.id} failed: ${e?.message}`);
            }
          }
        } catch (e: any) {
          console.warn(`[automation] time rule ${rule.id} failed: ${e?.message}`);
        }
      }
    });
  }
  return { evaluated, fired };
}
