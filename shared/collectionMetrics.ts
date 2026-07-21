/** Pure collection metrics - no I/O. Derives billing values used by the pipeline automation engine. */
import type { RuleConditionOp } from "./schema.js";

export type CollectionAttrKey =
  | "days_overdue" | "outstanding_amount" | "invoice_due_date"
  | "last_payment_date" | "billing_status" | "collection_status" | "writeoff_status";

export interface CollectionAttrMeta {
  key: CollectionAttrKey;
  label: string;
  valueType: "number" | "currency" | "date" | "text";
}

export const COLLECTION_ATTRS: CollectionAttrMeta[] = [
  { key: "days_overdue", label: "Hari Overdue", valueType: "number" },
  { key: "outstanding_amount", label: "Tagihan Outstanding", valueType: "currency" },
  { key: "invoice_due_date", label: "Jatuh Tempo", valueType: "date" },
  { key: "last_payment_date", label: "Pembayaran Terakhir", valueType: "date" },
  { key: "billing_status", label: "Status Billing", valueType: "text" },
  { key: "collection_status", label: "Status Collection", valueType: "text" },
  { key: "writeoff_status", label: "Status Write-Off", valueType: "text" },
];

/** Minimal customer billing shape (subset of the customers row). */
export interface BillingCustomer {
  dueDate?: string | null;
  billingPrice?: number | null;
  billingStatus?: string | null;
  lastPaymentDate?: string | null;
}

export interface CollectionSnapshot {
  daysOverdue: number;
  outstandingAmount: number;
  invoiceDueDate: string | null;
  lastPaymentDate: string | null;
  billingStatus: string | null;
  collectionStatus: string | null;
  writeoffStatus: string | null;
}

export function isPaidStatus(status: string | null | undefined): boolean {
  const v = (status ?? "").trim().toLowerCase();
  return v === "lunas" || v === "paid";
}

/** floor((now - due)/day); 0 when no/invalid due date or not yet due. */
export function computeDaysOverdue(dueDate: string | null | undefined, nowMs: number): number {
  if (!dueDate) return 0;
  const due = Date.parse(dueDate);
  if (Number.isNaN(due)) return 0;
  const days = Math.floor((nowMs - due) / 86400000);
  return days > 0 ? days : 0;
}

export function buildCollectionSnapshot(c: BillingCustomer, nowMs: number): CollectionSnapshot {
  const paid = isPaidStatus(c.billingStatus);
  return {
    daysOverdue: computeDaysOverdue(c.dueDate ?? null, nowMs),
    outstandingAmount: paid ? 0 : (c.billingPrice ?? 0),
    invoiceDueDate: c.dueDate ?? null,
    lastPaymentDate: c.lastPaymentDate ?? null,
    billingStatus: c.billingStatus ?? null,
    collectionStatus: "none",
    writeoffStatus: "0",
  };
}

export function attrValue(snap: CollectionSnapshot, key: CollectionAttrKey): number | string | null {
  switch (key) {
    case "days_overdue": return snap.daysOverdue;
    case "outstanding_amount": return snap.outstandingAmount;
    case "invoice_due_date": return snap.invoiceDueDate;
    case "last_payment_date": return snap.lastPaymentDate;
    case "billing_status": return snap.billingStatus;
    case "collection_status": return snap.collectionStatus;
    case "writeoff_status": return snap.writeoffStatus;
    default: return null;
  }
}

/** Compare a snapshot attr against a rule value using an existing RuleConditionOp.
 *  Numeric attrs compare numerically; date/text compare as strings (ISO dates sort chronologically). */
export function compareAttr(
  snap: CollectionSnapshot,
  key: CollectionAttrKey,
  op: RuleConditionOp,
  value: string | undefined,
): boolean {
  const meta = COLLECTION_ATTRS.find((a) => a.key === key);
  if (!meta) return false;
  const v = attrValue(snap, key);
  const target = (value ?? "").trim();
  if (op === "empty") return v == null || v === "";
  if (op === "not_empty") return !(v == null || v === "");
  if (v == null) return false;

  if (meta.valueType === "number" || meta.valueType === "currency") {
    const a = Number(v); const b = Number(target);
    if (Number.isNaN(a) || Number.isNaN(b)) return false;
    switch (op) {
      case "eq": return a === b;
      case "neq": return a !== b;
      case "gt": return a > b;
      case "lt": return a < b;
      case "contains": return String(a).includes(target);
      default: return false;
    }
  }
  const sv = String(v);
  switch (op) {
    case "eq": return sv.toLowerCase() === target.toLowerCase();
    case "neq": return sv.toLowerCase() !== target.toLowerCase();
    case "contains": return sv.toLowerCase().includes(target.toLowerCase());
    case "gt": return sv > target;
    case "lt": return sv < target;
    default: return false;
  }
}

/** Card-stage + config → collection status. Used by getCardCollectionSnapshot (card context). */
export function resolveCollectionStatus(
  cardStageId: number,
  cfg: { enabled: boolean; paidStageId: number | null; writeoffStageId: number | null } | null,
): { collectionStatus: string; writeoffStatus: string } {
  if (!cfg || !cfg.enabled) return { collectionStatus: "none", writeoffStatus: "0" };
  if (cfg.writeoffStageId != null && cardStageId === cfg.writeoffStageId) return { collectionStatus: "writeoff", writeoffStatus: "1" };
  if (cfg.paidStageId != null && cardStageId === cfg.paidStageId) return { collectionStatus: "paid", writeoffStatus: "0" };
  return { collectionStatus: "in_collection", writeoffStatus: "0" };
}
