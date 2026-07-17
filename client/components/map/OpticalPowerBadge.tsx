import { classifyOpticalPower, OPTICAL_LEVEL_META, type OpticalThresholds, DEFAULT_OPTICAL_THRESHOLDS } from "@shared/opticalPower";

const LEVEL_CLS: Record<string, string> = {
  good: "bg-success/10 text-success",
  warn: "bg-warning/15 text-warning",
  crit: "bg-destructive/15 text-destructive",
  unknown: "bg-muted text-muted-foreground",
};

/** Badge dBm dengan indikator warna hijau/kuning/merah — threshold dari server (configurable). */
export function OpticalPowerBadge({ value, kind, thresholds = DEFAULT_OPTICAL_THRESHOLDS }: {
  value: string | number | null | undefined;
  kind: "RX" | "TX";
  thresholds?: OpticalThresholds;
}) {
  // TX tidak diklasifikasikan seperti RX — tampil netral kalau ada.
  const level = kind === "RX" ? classifyOpticalPower(value, thresholds) : (value ? "good" : "unknown");
  const cls = kind === "RX" ? LEVEL_CLS[level] : "bg-muted text-foreground/80";
  const text = value !== null && value !== undefined && value !== "" ? `${value} dBm` : "—";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${cls}`}
      title={kind === "RX" ? `RX ${text} · ${OPTICAL_LEVEL_META[level].label} (warn ≤ ${thresholds.warn}, crit ≤ ${thresholds.crit} dBm)` : `TX ${text}`}
    >
      {kind} {text}
    </span>
  );
}
