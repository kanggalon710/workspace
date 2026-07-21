/** KPI Otomatis (data-driven): skor kinerja karyawan dihitung dari metrik kerja
 *  NYATA (output ops + kehadiran) dibanding target per role, bukan penilaian
 *  subjektif manual. Logika murni supaya bisa di-unit-test tanpa DB. */

export type KpiMetricKind = "count" | "rate";

export type KpiMetricDef = {
  key: string;          // tickets | leads | collections | canvassing | attendance | punctual
  label: string;
  kind: KpiMetricKind;  // count = dibanding target; rate = sudah 0-100
  target?: number;      // untuk kind "count": nilai target 100%
  weight: number;       // bobot relatif (>0)
};

export type KpiRoleTemplate = {
  role: string;         // kunci role user (marketing, teknisi, finance, cs, noc, ...)
  label: string;
  metrics: KpiMetricDef[];
};

export type KpiMetricResult = {
  key: string; label: string; kind: KpiMetricKind;
  value: number; target: number | null; weight: number; score: number; // score 0-100
};
export type KpiResult = { total: number; breakdown: KpiMetricResult[] };

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Skor 1 metrik (0-100). count: value/target; rate: value apa adanya (di-clamp). */
export function scoreMetric(m: KpiMetricDef, value: number): number {
  const v = Number.isFinite(value) ? value : 0;
  if (m.kind === "rate") return Math.round(clamp(v, 0, 100));
  const t = Number(m.target ?? 0);
  if (t > 0) return Math.round(clamp((v / t) * 100, 0, 100));
  return v > 0 ? 100 : 0; // tanpa target: ada output = 100
}

/** Hitung KPI total tertimbang (0-100) + rincian per metrik. */
export function computeKpiScore(template: KpiRoleTemplate, metricValues: Record<string, number>): KpiResult {
  const metrics = (template.metrics ?? []).filter((m) => Number(m.weight) > 0);
  const breakdown: KpiMetricResult[] = metrics.map((m) => {
    const value = Number(metricValues[m.key] ?? 0);
    const score = scoreMetric(m, value);
    return { key: m.key, label: m.label, kind: m.kind, value, target: m.kind === "count" ? (m.target ?? null) : null, weight: m.weight, score };
  });
  const totalWeight = breakdown.reduce((s, b) => s + b.weight, 0);
  const total = totalWeight > 0 ? Math.round(breakdown.reduce((s, b) => s + b.score * b.weight, 0) / totalWeight) : 0;
  return { total, breakdown };
}

/** Pilih template untuk role tertentu; fallback ke template "default". */
export function templateForRole(templates: KpiRoleTemplate[], role: string): KpiRoleTemplate {
  const r = String(role ?? "").toLowerCase();
  return templates.find((t) => t.role === r) ?? templates.find((t) => t.role === "default") ?? { role: "default", label: "Default", metrics: [] };
}

// Template default per role (HR bisa ubah target/bobot; disimpan di app_settings).
export const DEFAULT_KPI_TEMPLATES: KpiRoleTemplate[] = [
  { role: "marketing", label: "Marketing", metrics: [
    { key: "leads", label: "Lead Closing", kind: "count", target: 8, weight: 40 },
    { key: "canvassing", label: "Laporan Canvassing", kind: "count", target: 40, weight: 30 },
    { key: "attendance", label: "Kehadiran", kind: "rate", weight: 20 },
    { key: "punctual", label: "Ketepatan Jam", kind: "rate", weight: 10 },
  ] },
  { role: "marketing_spv", label: "Marketing SPV", metrics: [
    { key: "leads", label: "Lead Closing", kind: "count", target: 12, weight: 45 },
    { key: "canvassing", label: "Laporan Canvassing", kind: "count", target: 30, weight: 25 },
    { key: "attendance", label: "Kehadiran", kind: "rate", weight: 20 },
    { key: "punctual", label: "Ketepatan Jam", kind: "rate", weight: 10 },
  ] },
  { role: "teknisi", label: "Teknisi", metrics: [
    { key: "tickets", label: "Work Order Selesai", kind: "count", target: 20, weight: 50 },
    { key: "attendance", label: "Kehadiran", kind: "rate", weight: 30 },
    { key: "punctual", label: "Ketepatan Jam", kind: "rate", weight: 20 },
  ] },
  { role: "operator", label: "Operator Teknis", metrics: [
    { key: "tickets", label: "Work Order Selesai", kind: "count", target: 15, weight: 45 },
    { key: "attendance", label: "Kehadiran", kind: "rate", weight: 35 },
    { key: "punctual", label: "Ketepatan Jam", kind: "rate", weight: 20 },
  ] },
  { role: "finance", label: "Keuangan", metrics: [
    { key: "collections", label: "Collection Lunas", kind: "count", target: 30, weight: 50 },
    { key: "attendance", label: "Kehadiran", kind: "rate", weight: 30 },
    { key: "punctual", label: "Ketepatan Jam", kind: "rate", weight: 20 },
  ] },
  { role: "cs", label: "Layanan Pelanggan", metrics: [
    { key: "tickets", label: "Tiket Ditangani", kind: "count", target: 15, weight: 40 },
    { key: "attendance", label: "Kehadiran", kind: "rate", weight: 30 },
    { key: "punctual", label: "Ketepatan Jam", kind: "rate", weight: 30 },
  ] },
  { role: "noc", label: "NOC", metrics: [
    { key: "tickets", label: "Eskalasi Ditangani", kind: "count", target: 10, weight: 30 },
    { key: "attendance", label: "Kehadiran", kind: "rate", weight: 40 },
    { key: "punctual", label: "Ketepatan Jam", kind: "rate", weight: 30 },
  ] },
  { role: "default", label: "Umum (role lain)", metrics: [
    { key: "attendance", label: "Kehadiran", kind: "rate", weight: 60 },
    { key: "punctual", label: "Ketepatan Jam", kind: "rate", weight: 40 },
  ] },
];
