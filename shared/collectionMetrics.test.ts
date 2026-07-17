import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COLLECTION_ATTRS, isPaidStatus, computeDaysOverdue, buildCollectionSnapshot, attrValue, compareAttr,
} from "./collectionMetrics.js";
import { resolveCollectionStatus } from "./collectionMetrics.js";

const DAY = 86400000;
const NOW = Date.parse("2026-01-31T00:00:00Z");

test("COLLECTION_ATTRS has the 7 customer-derived keys", () => {
  assert.deepEqual(COLLECTION_ATTRS.map((a) => a.key),
    ["days_overdue", "outstanding_amount", "invoice_due_date", "last_payment_date", "billing_status", "collection_status", "writeoff_status"]);
});

test("isPaidStatus: lunas/paid (case-insensitive, trimmed) only", () => {
  assert.equal(isPaidStatus("lunas"), true);
  assert.equal(isPaidStatus(" PAID "), true);
  assert.equal(isPaidStatus("overdue"), false);
  assert.equal(isPaidStatus(null), false);
});

test("computeDaysOverdue: none/future → 0, past → floor days", () => {
  assert.equal(computeDaysOverdue(null, NOW), 0);
  assert.equal(computeDaysOverdue("not-a-date", NOW), 0);
  assert.equal(computeDaysOverdue("2026-02-10", NOW), 0);
  assert.equal(computeDaysOverdue("2026-01-21T00:00:00Z", NOW), 10);
});

test("buildCollectionSnapshot: paid → outstanding 0; unpaid → billingPrice; null price → 0", () => {
  const paid = buildCollectionSnapshot({ dueDate: "2026-01-21", billingPrice: 150000, billingStatus: "lunas", lastPaymentDate: "2026-01-22" }, NOW);
  assert.equal(paid.outstandingAmount, 0);
  assert.equal(paid.daysOverdue, 10);
  const unpaid = buildCollectionSnapshot({ dueDate: "2026-01-21", billingPrice: 150000, billingStatus: "overdue", lastPaymentDate: null }, NOW);
  assert.equal(unpaid.outstandingAmount, 150000);
  const noPrice = buildCollectionSnapshot({ dueDate: null, billingPrice: null, billingStatus: "overdue", lastPaymentDate: null }, NOW);
  assert.equal(noPrice.outstandingAmount, 0);
  assert.equal(noPrice.invoiceDueDate, null);
});

test("attrValue maps snapshot fields", () => {
  const s = buildCollectionSnapshot({ dueDate: "2026-01-21", billingPrice: 150000, billingStatus: "overdue", lastPaymentDate: "2026-01-01" }, NOW);
  assert.equal(attrValue(s, "days_overdue"), 10);
  assert.equal(attrValue(s, "outstanding_amount"), 150000);
  assert.equal(attrValue(s, "billing_status"), "overdue");
});

test("compareAttr: numeric attrs compare numerically", () => {
  const s = buildCollectionSnapshot({ dueDate: "2026-01-21", billingPrice: 150000, billingStatus: "overdue", lastPaymentDate: null }, NOW);
  assert.equal(compareAttr(s, "days_overdue", "gt", "7"), true);
  assert.equal(compareAttr(s, "days_overdue", "gt", "30"), false);
  assert.equal(compareAttr(s, "days_overdue", "lt", "30"), true);
  assert.equal(compareAttr(s, "days_overdue", "eq", "10"), true);
  assert.equal(compareAttr(s, "outstanding_amount", "gt", "0"), true);
});

test("compareAttr: text attrs compare as strings; empty/not_empty + missing", () => {
  const s = buildCollectionSnapshot({ dueDate: null, billingPrice: 0, billingStatus: "overdue", lastPaymentDate: null }, NOW);
  assert.equal(compareAttr(s, "billing_status", "eq", "OVERDUE"), true);
  assert.equal(compareAttr(s, "billing_status", "contains", "due"), true);
  assert.equal(compareAttr(s, "last_payment_date", "empty", undefined), true);
  assert.equal(compareAttr(s, "billing_status", "not_empty", undefined), true);
  assert.equal(compareAttr(s, "invoice_due_date", "gt", "2026-01-01"), false);
});

test("compareAttr: unknown attr or unknown op → false", () => {
  const s = buildCollectionSnapshot({ dueDate: "2026-01-21", billingPrice: 1, billingStatus: "overdue", lastPaymentDate: null }, NOW);
  assert.equal(compareAttr(s, "nope" as any, "eq", "x"), false);
});

test("COLLECTION_ATTRS includes collection_status + writeoff_status", () => {
  const keys = COLLECTION_ATTRS.map((a) => a.key);
  assert.ok(keys.includes("collection_status"));
  assert.ok(keys.includes("writeoff_status"));
});

test("resolveCollectionStatus: disabled / writeoff / paid / in_collection", () => {
  assert.deepEqual(resolveCollectionStatus(5, { enabled: false, paidStageId: 2, writeoffStageId: 3 }), { collectionStatus: "none", writeoffStatus: "0" });
  assert.deepEqual(resolveCollectionStatus(3, { enabled: true, paidStageId: 2, writeoffStageId: 3 }), { collectionStatus: "writeoff", writeoffStatus: "1" });
  assert.deepEqual(resolveCollectionStatus(2, { enabled: true, paidStageId: 2, writeoffStageId: 3 }), { collectionStatus: "paid", writeoffStatus: "0" });
  assert.deepEqual(resolveCollectionStatus(9, { enabled: true, paidStageId: 2, writeoffStageId: 3 }), { collectionStatus: "in_collection", writeoffStatus: "0" });
});

test("buildCollectionSnapshot defaults status fields", () => {
  const s = buildCollectionSnapshot({ dueDate: null, billingPrice: 0, billingStatus: "overdue", lastPaymentDate: null }, Date.parse("2026-01-31T00:00:00Z"));
  assert.equal(s.collectionStatus, "none");
  assert.equal(s.writeoffStatus, "0");
});
