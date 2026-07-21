/** Compute a pipeline's metrics over the permission-filtered card set. */
import type { Request } from "express";
import { storage } from "./storage.js";
import { parseConditionGroups, evaluateConditionGroups } from "./pipeline-automation-helpers.js";
import { aggregate, formatMetricValue, type MetricAggregation, type MetricType } from "../shared/pipelineMetrics.js";
import { cardPassesFilter } from "../shared/cardRowFilter.js";
import { resolveTimeWindow, dateInWindow } from "../shared/metricTimeWindow.js";
import { evaluateFormula } from "../shared/metricFormula.js";

export interface MetricResult {
  id: number;
  name: string;
  description: string | null;
  icon: string | null;
  color: string;
  type: string;
  value: number;
  formatted: string;
}

export async function computeAllPipelineMetrics(
  req: Request,
  pipelineId: number,
  rowFilter: import("../shared/fieldRules.js").FieldRuleCondition[][] | null,
  ctx?: { preset: string; from?: string | null; to?: string | null } | null,
): Promise<MetricResult[]> {
  const defs = (await storage.listMetricDefs(pipelineId)).filter((d) => d.visible === 1);
  if (defs.length === 0) return [];
  const cards = await storage.listCards(pipelineId);
  const valuesByCard = await storage.getCardValuesForPipeline(pipelineId);
  const nowMs = Date.now();

  // Permission row-level filter - only cards the requester may see.
  // cardPassesFilter expects FieldRuleCtx.values as Map<number, string>, so convert from Record.
  const visibleCards = cards.filter((c) => {
    const rec = valuesByCard.get(c.id) ?? {};
    const vals = new Map<number, string>(
      Object.entries(rec).map(([k, v]) => [Number(k), String(v)]),
    );
    return cardPassesFilter(rowFilter, { values: vals, stageId: (c as any).stageId });
  });

  const out: MetricResult[] = [];
  for (const def of defs) {
    try {
      const stageIds: number[] = def.stageIds ? JSON.parse(def.stageIds) : [];
      const groups = parseConditionGroups(def.conditions);
      const matching = visibleCards.filter((c) => {
        if (stageIds.length && !stageIds.includes((c as any).stageId)) return false;
        if (groups.length) {
          const rec = valuesByCard.get(c.id) ?? {};
          const vals = new Map<number, string>(
            Object.entries(rec).map(([k, v]) => [Number(k), String(v)]),
          );
          if (!evaluateConditionGroups(groups, vals)) return false;
        }
        return true;
      });

      // MP2 time window: only metrics with a timeField are time-aware.
      const timeField = (def as any).timeField as string | null;
      let timed = matching;
      if (timeField && timeField !== "none") {
        // Strip-context override wins when present and not "all"; else the metric's own preset.
        const win =
          ctx && ctx.preset && ctx.preset !== "all"
            ? resolveTimeWindow(ctx.preset, nowMs, ctx.from, ctx.to)
            : resolveTimeWindow((def as any).timePreset ?? "all", nowMs, (def as any).timeFrom, (def as any).timeTo);
        if (win) {
          timed = matching.filter((c) => {
            let dateStr: string | null | undefined;
            if (timeField === "created") dateStr = (c as any).createdAt;
            else if (timeField === "updated") dateStr = (c as any).updatedAt ?? (c as any).createdAt;
            else if (timeField.startsWith("field:")) {
              const fid = Number(timeField.slice(6));
              dateStr = (valuesByCard.get(c.id) ?? {})[fid];
            }
            return dateInWindow(dateStr, win);
          });
        }
      }

      let value = 0;
      if (def.source === "formula") {
        const terms: any[] = (def as any).terms ? JSON.parse((def as any).terms) : [];
        const values: Record<string, number> = {};
        for (const t of terms) {
          const tStages: number[] = Array.isArray(t.stageIds) ? t.stageIds : [];
          const tGroups = parseConditionGroups(t.conditions ? JSON.stringify(t.conditions) : null);
          const tCards = timed.filter((c) => {
            if (tStages.length && !tStages.includes((c as any).stageId)) return false;
            if (tGroups.length) {
              const rec = valuesByCard.get(c.id) ?? {};
              const vals = new Map<number, string>(Object.entries(rec).map(([k, v]) => [Number(k), String(v)]));
              if (!evaluateConditionGroups(tGroups, vals)) return false;
            }
            return true;
          });
          if (t.source === "field_agg" && t.fieldId != null) {
            values[t.key] = aggregate(
              tCards.map((c) => (valuesByCard.get(c.id) ?? {})[t.fieldId as number] ?? null),
              t.aggregation as MetricAggregation,
            );
          } else {
            values[t.key] = tCards.length;
          }
        }
        value = evaluateFormula((def as any).formula ?? "", values); // throws on bad expr → caught → zero tile
      } else if (def.source === "field_agg" && def.fieldId != null) {
        const vals = timed.map(
          (c) => (valuesByCard.get(c.id) ?? {})[def.fieldId as number] ?? null,
        );
        value = aggregate(vals, def.aggregation as MetricAggregation);
      } else {
        value = timed.length; // card_count / stage_count
      }

      out.push({
        id: def.id,
        name: def.name,
        description: def.description,
        icon: def.icon,
        color: def.color,
        type: def.type,
        value,
        formatted: formatMetricValue(value, {
          type: def.type as MetricType,
          prefix: def.prefix,
          suffix: def.suffix,
          decimals: def.decimals,
        }),
      });
    } catch {
      out.push({
        id: def.id,
        name: def.name,
        description: def.description,
        icon: def.icon,
        color: def.color,
        type: def.type,
        value: 0,
        formatted: formatMetricValue(0, { type: def.type as MetricType }),
      });
    }
  }
  return out;
}
