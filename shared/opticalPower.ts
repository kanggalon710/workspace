/** Pure optical-power (dBm) classification. Thresholds are CONFIGURABLE per ISP via
 *  app_settings (optical_rx_warn / optical_rx_crit) - never hardcode in UI; defaults
 *  mirror the legacy hardcoded values (-25 / -28) used by GenieACS page + portal. */

export type OpticalLevel = "good" | "warn" | "crit" | "unknown";
export type OpticalThresholds = { warn: number; crit: number };

export const DEFAULT_OPTICAL_THRESHOLDS: OpticalThresholds = { warn: -25, crit: -28 };

export function classifyOpticalPower(
  value: number | string | null | undefined,
  t: OpticalThresholds,
): OpticalLevel {
  if (value === null || value === undefined || value === "") return "unknown";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "unknown";
  if (n >= t.warn) return "good";
  if (n >= t.crit) return "warn";
  return "crit";
}

export const OPTICAL_LEVEL_META: Record<OpticalLevel, { label: string; variant: "success" | "warning" | "danger" | "neutral" }> = {
  good:    { label: "Normal",   variant: "success" },
  warn:    { label: "Warning",  variant: "warning" },
  crit:    { label: "Critical", variant: "danger" },
  unknown: { label: "N/A",      variant: "neutral" },
};
