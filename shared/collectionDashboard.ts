/** Pure collection dashboard aggregation — no I/O. */

export interface MetricsCard { stageId: number; sourceCustomerId: number | null; }
export interface MetricsSnapshot { daysOverdue: number; outstandingAmount: number; billingStatus: string | null; }
export interface AgingBucket { label: string; count: number; }
export interface CollectionMetrics {
  totalCards: number;
  activeCount: number;
  paidCount: number;
  writeoffCount: number;
  totalOutstanding: number;
  successRate: number | null;
  aging: AgingBucket[];
  byStage: { stageId: number; label: string; count: number }[];
}

const BANDS: { label: string; test: (d: number) => boolean }[] = [
  { label: "0", test: (d) => d === 0 },
  { label: "1-7", test: (d) => d >= 1 && d <= 7 },
  { label: "8-30", test: (d) => d >= 8 && d <= 30 },
  { label: "31-60", test: (d) => d >= 31 && d <= 60 },
  { label: "61-90", test: (d) => d >= 61 && d <= 90 },
  { label: "90+", test: (d) => d > 90 },
];

export function computeCollectionMetrics(input: {
  cards: MetricsCard[];
  snapshotByCustomer: Map<number, MetricsSnapshot>;
  paidStageId: number | null;
  writeoffStageId: number | null;
  stages: { id: number; label: string }[];
}): CollectionMetrics {
  const { cards, snapshotByCustomer, paidStageId, writeoffStageId, stages } = input;
  const labelOf = new Map(stages.map((s) => [s.id, s.label]));
  const aging = BANDS.map((b) => ({ label: b.label, count: 0 }));
  const byStageMap = new Map<number, number>();

  let activeCount = 0, paidCount = 0, writeoffCount = 0, totalOutstanding = 0;
  for (const card of cards) {
    byStageMap.set(card.stageId, (byStageMap.get(card.stageId) ?? 0) + 1);
    const isPaid = paidStageId != null && card.stageId === paidStageId;
    const isWriteoff = writeoffStageId != null && card.stageId === writeoffStageId;
    if (isPaid) paidCount++;
    else if (isWriteoff) writeoffCount++;
    else {
      activeCount++;
      const snap = card.sourceCustomerId != null ? snapshotByCustomer.get(card.sourceCustomerId) : undefined;
      if (snap) {
        totalOutstanding += snap.outstandingAmount;
        const bi = BANDS.findIndex((b) => b.test(snap.daysOverdue));
        if (bi >= 0) aging[bi].count++;
      }
    }
  }
  const terminal = paidCount + writeoffCount;
  const successRate = terminal > 0 ? paidCount / terminal : null;
  const byStage = [...byStageMap.entries()].map(([stageId, count]) => ({ stageId, count, label: labelOf.get(stageId) ?? `Stage #${stageId}` }));
  return { totalCards: cards.length, activeCount, paidCount, writeoffCount, totalOutstanding, successRate, aging, byStage };
}
