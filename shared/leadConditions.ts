/** Pure: kondisi atribut lead untuk rule lead-trigger. No DB, no I/O.
 *  Extend pola source:"billing" → source:"lead", dievaluasi terhadap objek lead saat intake. */
import type { RuleConditionOp, RuleCondition } from "./schema.js";
import { canonicalLeadSource } from "./leadSources.js";
import type { IntakeLead } from "./leadIntake.js";

/** Operator generik untuk kondisi (di-EKSTRAK dari evaluateConditions; dipakai bersama evaluator card). */
export function applyConditionOp(stored: string, op: RuleConditionOp, target: string): boolean {
  const s = String(stored ?? "").trim();
  const t = String(target ?? "").trim();
  switch (op) {
    case "eq": return s.toLowerCase() === t.toLowerCase();
    case "neq": return s.toLowerCase() !== t.toLowerCase();
    case "contains": return s.toLowerCase().includes(t.toLowerCase());
    case "gt": { const a = Number(s), b = Number(t); return !Number.isNaN(a) && !Number.isNaN(b) && a > b; }
    case "lt": { const a = Number(s), b = Number(t); return !Number.isNaN(a) && !Number.isNaN(b) && a < b; }
    case "empty": return s === "";
    case "not_empty": return s !== "";
    default: return false;
  }
}

export interface LeadConditionAttr { key: string; label: string; ops: RuleConditionOp[] }

const EQ = ["eq", "neq"] as RuleConditionOp[];
const TEXT = ["eq", "neq", "contains"] as RuleConditionOp[];
const NUM = ["gt", "lt"] as RuleConditionOp[];
const EXISTS = ["empty", "not_empty"] as RuleConditionOp[];

export const LEAD_CONDITION_ATTRS: LeadConditionAttr[] = [
  { key: "source", label: "Sumber", ops: EQ },
  { key: "category", label: "Kategori", ops: EQ },
  { key: "district", label: "Kecamatan", ops: TEXT },
  { key: "village", label: "Desa/Kelurahan", ops: TEXT },
  { key: "priority", label: "Prioritas", ops: EQ },
  { key: "distanceMeters", label: "Jarak ke ODP (m)", ops: NUM },
  { key: "odpId", label: "Nearest ODP", ops: EXISTS },
  { key: "campaign", label: "Campaign", ops: TEXT },
  { key: "adSet", label: "Ad Set", ops: TEXT },
  { key: "adName", label: "Ad Name", ops: TEXT },
];

export function leadConditionAttrValid(attr: string): boolean {
  return LEAD_CONDITION_ATTRS.some((a) => a.key === attr);
}
export function opValidForAttr(attr: string, op: RuleConditionOp): boolean {
  const a = LEAD_CONDITION_ATTRS.find((x) => x.key === attr);
  return !!a && a.ops.includes(op);
}

/** Nilai attr lead sebagai string untuk dibandingkan. source→kanonik; odpId→id atau "" (utk empty/not_empty). */
export function leadConditionRaw(lead: IntakeLead, attr: string): string {
  if (attr === "source") return canonicalLeadSource(lead.source);
  if (attr === "odpId") return lead.odpId != null ? String(lead.odpId) : "";
  const v = (lead as any)[attr];
  return v == null ? "" : String(v);
}

export function compareLeadAttr(lead: IntakeLead, attr: string, op: RuleConditionOp, value?: string): boolean {
  return applyConditionOp(leadConditionRaw(lead, attr), op, value ?? "");
}

/** OR-of-AND terhadap lead. Group kosong/none → true. Hanya menilai kondisi source:"lead". */
export function evaluateLeadConditionGroups(groups: RuleCondition[][], lead: IntakeLead): boolean {
  if (!groups || groups.length === 0) return true;
  return groups.some((g) => g.every((c) => {
    if (c.source !== "lead") return true;
    return compareLeadAttr(lead, String(c.attr), c.op, c.value);
  }));
}
