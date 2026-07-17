import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCollectionMetrics } from "./collectionDashboard.js";

const stages = [{ id: 10, label: "Follow Up 1" }, { id: 20, label: "Lunas" }, { id: 30, label: "Write Off" }];
const snap = (daysOverdue: number, outstandingAmount: number, billingStatus = "overdue") => ({ daysOverdue, outstandingAmount, billingStatus });

test("empty → zeros, successRate null", () => {
  const m = computeCollectionMetrics({ cards: [], snapshotByCustomer: new Map(), paidStageId: 20, writeoffStageId: 30, stages });
  assert.equal(m.totalCards, 0);
  assert.equal(m.activeCount, 0);
  assert.equal(m.successRate, null);
  assert.deepEqual(m.aging.map((b) => b.count), [0, 0, 0, 0, 0, 0]);
});

test("counts, outstanding (active only), successRate, aging bands, byStage", () => {
  const cards = [
    { stageId: 10, sourceCustomerId: 1 },
    { stageId: 10, sourceCustomerId: 2 },
    { stageId: 20, sourceCustomerId: 3 },
    { stageId: 30, sourceCustomerId: 4 },
    { stageId: 10, sourceCustomerId: 5 },
  ];
  const snapshotByCustomer = new Map<number, any>([
    [1, snap(5, 100000)], [2, snap(40, 200000)], [3, snap(0, 0, "lunas")], [4, snap(200, 500000)], [5, snap(0, 50000)],
  ]);
  const m = computeCollectionMetrics({ cards, snapshotByCustomer, paidStageId: 20, writeoffStageId: 30, stages });
  assert.equal(m.totalCards, 5);
  assert.equal(m.activeCount, 3);
  assert.equal(m.paidCount, 1);
  assert.equal(m.writeoffCount, 1);
  assert.equal(m.totalOutstanding, 350000);
  assert.equal(m.successRate, 0.5);
  assert.deepEqual(m.aging.map((b) => [b.label, b.count]), [["0", 1], ["1-7", 1], ["8-30", 0], ["31-60", 1], ["61-90", 0], ["90+", 0]]);
  const fu1 = m.byStage.find((s) => s.stageId === 10);
  assert.equal(fu1?.count, 3);
  assert.equal(fu1?.label, "Follow Up 1");
});

test("card with missing snapshot: counted in totals/byStage, excluded from aging + outstanding", () => {
  const m = computeCollectionMetrics({ cards: [{ stageId: 10, sourceCustomerId: 99 }], snapshotByCustomer: new Map(), paidStageId: 20, writeoffStageId: 30, stages });
  assert.equal(m.totalCards, 1);
  assert.equal(m.activeCount, 1);
  assert.equal(m.totalOutstanding, 0);
  assert.deepEqual(m.aging.map((b) => b.count), [0, 0, 0, 0, 0, 0]);
});
