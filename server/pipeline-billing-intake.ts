import { storage } from "./storage.js";
import {
  customerMatchesFilter,
  customerToFieldValues,
  customerTitle,
  type IntakeCustomer,
  type BillingFilter,
} from "../shared/pipelineBillingIntake.js";

interface IntakeConfig {
  filter: BillingFilter;
  resolveStageId: number | null;
  titleSource: string;
  fieldMap: { attr: string; targetFieldId: number }[];
}

function parseConfig(raw: string | null): IntakeConfig | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw);
    if (!c || typeof c !== "object") return null;
    return {
      filter: (c.filter ?? {}) as BillingFilter,
      resolveStageId: c.resolveStageId != null ? Number(c.resolveStageId) : null,
      titleSource: typeof c.titleSource === "string" && c.titleSource ? c.titleSource : "name",
      fieldMap: Array.isArray(c.fieldMap)
        ? c.fieldMap.filter((m: any) => m && m.attr && m.targetFieldId).map((m: any) => ({ attr: String(m.attr), targetFieldId: Number(m.targetFieldId) }))
        : [],
    };
  } catch { return null; }
}

function toIntakeCustomer(c: any): IntakeCustomer {
  return {
    id: c.id, name: c.name, customerId: c.customerId, phone: c.phone, email: c.email,
    package: c.package, billingPrice: c.billingPrice, billingStatus: c.billingStatus,
    dueDate: c.dueDate, isolirDate: c.isolirDate, address: c.address, district: c.district,
    village: c.village, customerType: c.customerType, status: c.status, installDate: c.installDate,
    pppoeUsername: c.pppoeUsername, ontSerialNumber: c.ontSerialNumber, isIsolir: c.isIsolir,
    lat: c.lat, lng: c.lng,
  };
}

/** Reconcile billing_sync rules for the CURRENT tenant (call inside withMitra).
 *  Create a card for each matching customer without an active card; move an active card
 *  whose customer no longer matches to the rule's resolve stage. */
export async function runBillingIntakeRules(): Promise<{ created: number; resolved: number }> {
  const result = { created: 0, resolved: 0 };
  const rules = await storage.listBillingSyncRules();
  if (rules.length === 0) return result;

  // System actor for auto-created cards — createdBy is an audit field only (platform owner).
  const systemUserId = 1;
  const nowMs = Date.now(); // basis hitung "hari overdue" untuk filter.minDaysOverdue
  const customers = (await storage.getCustomers()).map(toIntakeCustomer);

  for (const rule of rules) {
    const cfg = parseConfig((rule as any).triggerConfig);
    if (!cfg) continue;
    const entryStageId = (rule as any).targetStageId as number | null;
    if (!entryStageId) continue;

    // Target field types (for date-value normalization in customerToFieldValues).
    const targetFields = await storage.listFields((rule as any).pipelineId);
    const fieldTypeById: Record<number, string> = {};
    for (const f of targetFields) fieldTypeById[f.id] = (f as any).type;

    const sourceCards = await storage.getSourceCardsForRule(rule.id);
    const activeByCustomer = new Map<number, { id: number; stageId: number }>();
    for (const card of sourceCards) {
      const cid = (card as any).sourceCustomerId as number | null;
      if (cid == null) continue;
      if (cfg.resolveStageId != null && card.stageId === cfg.resolveStageId) continue;
      activeByCustomer.set(cid, { id: card.id, stageId: card.stageId });
    }

    for (const c of customers) {
      const matches = customerMatchesFilter(c, cfg.filter, nowMs);
      const active = activeByCustomer.get(c.id);
      if (matches && !active) {
        const card = await storage.createCard((rule as any).pipelineId, {
          stageId: entryStageId,
          title: customerTitle(c, cfg.titleSource),
          sourceCustomerId: c.id,
          sourceRuleId: rule.id,
        }, systemUserId);
        const values = customerToFieldValues(c, cfg.fieldMap, fieldTypeById);
        if (values.length) await storage.setCardValues(card.id, values);
        result.created++;
      } else if (!matches && active && cfg.resolveStageId != null) {
        await storage.moveCard(active.id, cfg.resolveStageId, undefined, systemUserId);
        result.resolved++;
      }
    }
  }
  return result;
}
