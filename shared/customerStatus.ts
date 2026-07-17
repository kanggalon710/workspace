/** Pure classification of a customer's connection status for badges/metrics.
 *  Shared client + server (ODP detail panel, map, counts). No React, no DB. */

export type CustomerConnStatus = "active" | "isolir" | "suspend" | "terminated" | "unknown";

const ACTIVE = new Set(["active", "aktif"]);
const SUSPEND = new Set(["suspend", "suspended"]);
const TERMINATED = new Set(["terminated", "terminate", "terminasi", "churn"]);

export function customerConnStatus(c: { isIsolir?: number | null; status?: string | null }): CustomerConnStatus {
  if ((c.isIsolir ?? 0) === 1) return "isolir";
  const s = c.status?.trim().toLowerCase();
  if (!s) return "unknown";
  if (ACTIVE.has(s)) return "active";
  if (s === "isolir") return "isolir";
  if (SUSPEND.has(s)) return "suspend";
  if (TERMINATED.has(s)) return "terminated";
  return "unknown";
}

/** Badge label + StatusBadge variant per status. */
export const CUSTOMER_STATUS_META: Record<CustomerConnStatus, { label: string; variant: "success" | "danger" | "warning" | "neutral" }> = {
  active:     { label: "Aktif",     variant: "success" },
  isolir:     { label: "Isolir",    variant: "danger" },
  suspend:    { label: "Suspend",   variant: "warning" },
  terminated: { label: "Terminasi", variant: "neutral" },
  unknown:    { label: "Unknown",   variant: "neutral" },
};
