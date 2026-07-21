// server/lead-intake.ts
import { storage } from "./storage.js";
import {
  parseLeadTriggerConfig, leadRuleMatchesSource, resolveDuplicateAction,
  leadToFieldValues, leadTitle, type IntakeLead,
} from "../shared/leadIntake.js";
import type { RuleTriggerType, NotifyConfig } from "../shared/schema.js";
import { parseConditionGroups, buildTargetTitle } from "./pipeline-automation-helpers.js";
import { evaluateLeadConditionGroups } from "../shared/leadConditions.js";
import { postPipelineWebhook } from "./pipeline-automation.js";

/** Map eventType lead → triggerType rule. */
const EVENT_TO_TRIGGER: Record<string, RuleTriggerType> = {
  created: "lead_created",
  updated: "lead_updated",
  assigned: "lead_assigned",
  stage_changed: "lead_stage_changed",
  converted: "lead_converted",
};

/** Notify untuk rule lead (bell + webhook). Best-effort: NEVER throws. */
async function runLeadNotify(notify: NotifyConfig, lead: IntakeLead, cardId: number | null, rule: any, actorId: number): Promise<void> {
  try {
    if (notify.channels?.includes("bell")) {
      const userId = notify.bellTarget === "user" ? notify.bellUserId
        : notify.bellTarget === "creator" ? rule.createdBy
        : lead.assignedTo;
      if (userId != null) {
        // Arahkan ke kartu di pipeline leads (bukan /leads lama). Fallback /leads kalau rule tak punya pipeline.
        const pipelineId = Number((rule as any)?.pipelineId) || null;
        const link = pipelineId
          ? (cardId ? `/pipelines/${pipelineId}?card=${cardId}` : `/pipelines/${pipelineId}`)
          : "/leads";
        await storage.createNotification({
          userId: Number(userId), type: "automation",
          title: buildTargetTitle(notify.bellTitle || "Lead: {title}", lead.name ?? `Lead #${lead.id}`),
          message: notify.bellMessage ? buildTargetTitle(notify.bellMessage, lead.name ?? "") : undefined,
          link, entityType: "lead", entityId: lead.id, fromUserId: actorId,
        });
      }
    }
    if (notify.channels?.includes("webhook") && notify.webhookUrl) {
      await postPipelineWebhook(notify.webhookUrl, {
        event: "lead.automation", ruleId: rule.id, ruleName: rule.name ?? null,
        leadId: lead.id, leadName: lead.name ?? null, source: lead.source ?? null,
        campaign: lead.campaign ?? null, cardId, firedAt: new Date().toISOString(),
      });
    }
  } catch (e: any) {
    console.warn(`[lead-intake] notify rule ${rule?.id} (lead ${lead?.id}) failed: ${e?.message}`);
  }
}

/** Jalankan semua rule lead-trigger yang cocok untuk event ini. Best-effort per rule.
 *  MUST dipanggil di dalam withMitra(lead.mitraId, ...) - semua query storage pakai getMitraId(). */
export async function runLeadIntake(eventType: string, lead: IntakeLead, actorId: number): Promise<void> {
  const triggerType = EVENT_TO_TRIGGER[eventType];
  if (!triggerType) return;
  const rules = await storage.listLeadRules(triggerType);
  if (!rules.length) return;

  // Lookup actor once for audit log username/userName fields.
  const actor = await storage.getUser(actorId);
  const auditUsername = actor?.username ?? `(user:${actorId})`;
  const auditUserName = actor?.name ?? auditUsername;

  for (const rule of rules) {
    try {
      let createdCardId: number | null = null;
      const cfg = parseLeadTriggerConfig((rule as any).triggerConfig);
      if (!cfg || !cfg.entryStageId) continue;
      if (!leadRuleMatchesSource(cfg.sources, lead.source)) continue;
      const condGroups = parseConditionGroups((rule as any).conditions);
      if (condGroups.length && !evaluateLeadConditionGroups(condGroups, lead)) continue;

      const pipelineId = (rule as any).pipelineId as number;

      const fields = await storage.listFields(pipelineId);
      const fieldTypeById: Record<number, string> = {};
      for (const f of fields) fieldTypeById[f.id] = (f as any).type;

      let odpNameById: Record<number, string> | undefined;
      if (cfg.fieldMap.some((m) => m.attr === "odpId") && lead.odpId != null) {
        const odps = await storage.getOdps();
        odpNameById = {};
        for (const o of odps) odpNameById[o.id] = (o as any).name;
      }

      let existingCardId: number | null = null;
      if (cfg.dedupBy === "phone") {
        const phoneMap = cfg.fieldMap.find((m) => m.attr === "phone");
        const phone = (lead.phone ?? "").trim();
        if (phoneMap && phone) {
          const ids = await storage.findCardIdsByFieldValue(pipelineId, phoneMap.targetFieldId, phone);
          existingCardId = ids[0] ?? null;
        }
      } else {
        const links = await storage.getLeadCardLinks(lead.id);
        const link = links.find((l) => (l as any).ruleId === rule.id) ?? null;
        existingCardId = link ? (link as any).cardId : null;
      }

      const decision = resolveDuplicateAction(cfg.onDuplicate, existingCardId != null);
      if (decision === "skip") continue;
      const values = leadToFieldValues(lead, cfg.fieldMap, fieldTypeById, odpNameById);

      if (decision === "create") {
        const assigneeId = (lead.assignedTo != null && await storage.canUserAccessPipeline(lead.assignedTo, pipelineId))
          ? lead.assignedTo : null;
        const card = await storage.createCard(pipelineId, {
          stageId: cfg.entryStageId,
          title: leadTitle(lead, cfg.titleSource),
          description: `Dibuat otomatis dari lead #${lead.id}`,
          assigneeId,
          sourceRuleId: rule.id,
        }, actorId);
        createdCardId = card.id;
        if (values.length) await storage.setCardValues(card.id, values);
        await storage.createLeadCardLink({ leadId: lead.id, cardId: card.id, ruleId: rule.id });
        await storage.createAuditLog({
          userId: actorId,
          username: auditUsername,
          userName: auditUserName,
          action: "AUTOMATION",
          entityType: "pipeline_card",
          entityId: card.id,
          entityName: card.title,
          details: JSON.stringify({ leadId: lead.id, ruleId: rule.id, event: triggerType, mode: "create" }),
          createdAt: new Date().toISOString(),
        });
      } else if (decision === "update" && existingCardId != null) {
        if (values.length) {
          await storage.setCardValues(existingCardId, values);
          await storage.createAuditLog({
            userId: actorId,
            username: auditUsername,
            userName: auditUserName,
            action: "AUTOMATION",
            entityType: "pipeline_card",
            entityId: existingCardId,
            entityName: leadTitle(lead, cfg.titleSource),
            details: JSON.stringify({ leadId: lead.id, ruleId: rule.id, event: triggerType, mode: "update" }),
            createdAt: new Date().toISOString(),
          });
        }
      } else if (decision === "reopen" && existingCardId != null) {
        const stages = await storage.listStages(pipelineId);
        const reopenTo = cfg.reopenStageId ?? cfg.entryStageId;
        let changed = false;
        if (stages.some((s) => s.id === reopenTo)) {
          await storage.moveCard(existingCardId, reopenTo, undefined, actorId);
          changed = true;
        }
        if (values.length) {
          await storage.setCardValues(existingCardId, values);
          changed = true;
        }
        if (changed) {
          await storage.createAuditLog({
            userId: actorId,
            username: auditUsername,
            userName: auditUserName,
            action: "AUTOMATION",
            entityType: "pipeline_card",
            entityId: existingCardId,
            entityName: leadTitle(lead, cfg.titleSource),
            details: JSON.stringify({ leadId: lead.id, ruleId: rule.id, event: triggerType, mode: "reopen" }),
            createdAt: new Date().toISOString(),
          });
        }
      }
      if (cfg.notify) {
        const notifyCardId = createdCardId ?? existingCardId ?? null;
        await runLeadNotify(cfg.notify, lead, notifyCardId, rule, actorId);
      }
    } catch (e: any) {
      console.warn(`[lead-intake] rule ${rule.id} (lead ${lead?.id}) failed: ${e?.message}`);
    }
  }
}
