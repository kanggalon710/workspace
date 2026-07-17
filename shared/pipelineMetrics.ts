/** Pure pipeline-metrics helpers — no I/O. */

export type MetricSource = "card_count" | "stage_count" | "field_agg" | "formula";
export type MetricAggregation = "count" | "sum" | "avg" | "min" | "max" | "distinct";
export type MetricType = "number" | "currency" | "percentage";

export const METRIC_SOURCES: { source: MetricSource; label: string }[] = [
  { source: "card_count", label: "Jumlah Kartu" },
  { source: "stage_count", label: "Jumlah Kartu per Stage" },
  { source: "field_agg", label: "Agregasi Field" },
  { source: "formula", label: "Formula" },
];
export const METRIC_AGGREGATIONS: { aggregation: MetricAggregation; label: string }[] = [
  { aggregation: "count", label: "Count" },
  { aggregation: "sum", label: "Sum" },
  { aggregation: "avg", label: "Average" },
  { aggregation: "min", label: "Min" },
  { aggregation: "max", label: "Max" },
  { aggregation: "distinct", label: "Distinct Count" },
];
export const METRIC_TYPES: { type: MetricType; label: string }[] = [
  { type: "number", label: "Angka" },
  { type: "currency", label: "Rupiah" },
  { type: "percentage", label: "Persen" },
];
export const METRIC_ICONS = ["Database", "Users", "Wallet", "Phone", "BarChart3", "AlertCircle", "CheckCircle2", "XCircle", "Calendar", "TrendingUp", "Clock", "Star"];
export const METRIC_COLORS = ["primary", "success", "warning", "danger", "info", "violet", "neutral"];

// Contract: number/currency field values are stored MACHINE-formatted by FieldValueInput's
// <input type="number"> — i.e. "." is the decimal separator and there are NO thousands separators
// ("1000000", "1234.5"). We strip stray symbols (e.g. a "Rp " prefix / spaces) but keep "." as the
// decimal. id-ID-formatted strings ("1.000.000") are NOT expected here; such a value parses to null
// and is skipped from numeric aggregation (use a number/currency field for SUM/AVG, not a text field).
function toNum(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Aggregate raw values. Numeric aggs skip non-numeric; count = non-empty count; distinct = distinct non-empty. */
export function aggregate(values: (string | number | null | undefined)[], agg: MetricAggregation): number {
  if (agg === "count") return values.filter((v) => v != null && v !== "").length;
  if (agg === "distinct") return new Set(values.filter((v) => v != null && v !== "").map(String)).size;
  const nums = values.map(toNum).filter((n): n is number => n != null);
  if (nums.length === 0) return 0;
  switch (agg) {
    case "sum": return nums.reduce((a, b) => a + b, 0);
    case "avg": return nums.reduce((a, b) => a + b, 0) / nums.length;
    case "min": return Math.min(...nums);
    case "max": return Math.max(...nums);
    default: return 0;
  }
}

/** Format a numeric value for display. */
export function formatMetricValue(value: number, opts: { type: MetricType; prefix?: string | null; suffix?: string | null; decimals?: number | null }): string {
  const decimals = opts.decimals ?? (opts.type === "currency" ? 0 : value % 1 === 0 ? 0 : 2);
  const num = value.toLocaleString("id-ID", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  let out = num;
  if (opts.type === "currency") out = "Rp " + num;
  else if (opts.type === "percentage") out = num + "%";
  if (opts.prefix) out = opts.prefix + out;
  if (opts.suffix) out = out + opts.suffix;
  return out;
}
