/** Gather collection metrics for a pipeline (current tenant) - storage + the pure aggregator. */
import { storage } from "./storage.js";
import { buildCollectionSnapshot } from "../shared/collectionMetrics.js";
import { computeCollectionMetrics, type CollectionMetrics, type MetricsSnapshot } from "../shared/collectionDashboard.js";

export async function getCollectionMetrics(pipelineId: number): Promise<CollectionMetrics> {
  const now = Date.now();
  const [cardsRaw, { config }, stagesRaw] = await Promise.all([
    storage.getCardsWithCustomer(pipelineId),
    storage.getCollectionConfig(pipelineId),
    storage.listStages(pipelineId),
  ]);
  const custIds = Array.from(new Set((cardsRaw as any[]).map((c) => c.sourceCustomerId).filter((v): v is number => v != null)));
  const customers = await storage.getCustomersByIds(custIds);
  const snapshotByCustomer = new Map<number, MetricsSnapshot>();
  for (const c of customers.values() as any) {
    const s = buildCollectionSnapshot({ dueDate: c.dueDate, billingPrice: c.billingPrice, billingStatus: c.billingStatus, lastPaymentDate: c.lastPaymentDate }, now);
    snapshotByCustomer.set(c.id, { daysOverdue: s.daysOverdue, outstandingAmount: s.outstandingAmount, billingStatus: s.billingStatus });
  }
  const cards = (cardsRaw as any[]).map((c) => ({ stageId: c.stageId as number, sourceCustomerId: (c.sourceCustomerId ?? null) as number | null }));
  const stages = (stagesRaw as any[]).map((s) => ({ id: s.id as number, label: s.label as string }));
  return computeCollectionMetrics({ cards, snapshotByCustomer, paidStageId: config?.paidStageId ?? null, writeoffStageId: config?.writeoffStageId ?? null, stages });
}
