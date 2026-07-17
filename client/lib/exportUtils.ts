// ── CSV Export Utilities ──────────────────────────────────────────────────

function escapeCsv(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export function toCsvBlob(headers: string[], rows: (string | number | null | undefined)[][]): Blob {
  const lines = [
    headers.map(h => escapeCsv(h)).join(","),
    ...rows.map(row => row.map(v => escapeCsv(String(v ?? ""))).join(",")),
  ];
  // BOM for Excel compatibility
  const bom = "\uFEFF";
  return new Blob([bom + lines.join("\n")], { type: "text/csv;charset=utf-8" });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadCSV(headers: string[], rows: (string | number | null | undefined)[][], filename: string): void {
  downloadBlob(toCsvBlob(headers, rows), filename);
}

// ── Pre-formatted Export Helpers ─────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  new: "Prospek Baru", contacted: "Dihubungi", interested: "Tertarik",
  negotiation: "Negosiasi", won: "Closing", lost: "Tidak Jadi",
};
const CATEGORY_LABELS: Record<string, string> = {
  rumahan: "Rumahan", bisnis: "Bisnis/Toko", perkantoran: "Perkantoran",
  sekolah: "Sekolah/Kampus", lainnya: "Lainnya",
};
const SOURCE_LABELS: Record<string, string> = {
  canvassing: "Canvassing", prospect_finder: "Finder", referral: "Referral", inbound: "Inbound",
};

export function exportLeads(leads: any[], filename?: string): void {
  const headers = ["Nama", "Telepon", "Alamat", "Kategori", "Stage", "Sumber", "ODP", "Kecamatan", "Desa", "Tanggal"];
  const rows = leads.map(l => [
    l.name,
    l.phone ?? "",
    l.address ?? "",
    CATEGORY_LABELS[l.category] ?? l.category ?? "",
    STAGE_LABELS[l.stage] ?? l.stage ?? "",
    SOURCE_LABELS[l.source] ?? l.source ?? "",
    l.odpName ?? "",
    l.district ?? "",
    l.village ?? "",
    l.createdAt ? new Date(l.createdAt).toLocaleDateString("id-ID") : "",
  ]);
  downloadCSV(headers, rows, filename ?? `leads_${new Date().toISOString().slice(0, 10)}.csv`);
}

const LOG_TYPE_LABELS: Record<string, string> = {
  area_sepi: "Area Sepi", akses_sulit: "Akses Sulit", kompetitor: "Kompetitor",
  infrastruktur: "Infrastruktur", potensi_tinggi: "Potensi Tinggi", lainnya: "Lainnya",
};
const SEVERITY_LABELS: Record<string, string> = {
  info: "Info", warning: "Perhatian", critical: "Kritis",
};

export function exportFieldReports(logs: any[], filename?: string): void {
  const headers = ["Tanggal", "Waktu", "Jenis", "Judul", "Deskripsi", "Tingkat", "ODP", "Jarak ODP (m)", "Lat", "Lng", "Pelapor"];
  const rows = logs.map(l => {
    const d = l.createdAt ? new Date(l.createdAt) : null;
    return [
      d ? d.toLocaleDateString("id-ID") : "",
      d ? d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "",
      LOG_TYPE_LABELS[l.type] ?? l.type ?? "",
      l.title ?? "",
      l.description ?? "",
      SEVERITY_LABELS[l.severity] ?? l.severity ?? "",
      l.odpName ?? "",
      l.distanceMeters ?? "",
      l.lat ?? "",
      l.lng ?? "",
      l.userName ?? "",
    ];
  });
  downloadCSV(headers, rows, filename ?? `laporan_lapangan_${new Date().toISOString().slice(0, 10)}.csv`);
}

export function exportDashboardSummary(data: any, filename?: string): void {
  const headers = ["Metrik", "Nilai"];
  const rows: (string | number)[][] = [
    ["Total Lead", data.totalLeads],
    ["Lead Aktif", data.activeLeads],
    ["Won", data.wonLeads],
    ["Lost", data.lostLeads],
    ["Konversi (%)", data.conversionRate],
    ["Lead Bulan Ini", data.thisMonthLeads],
    ["Lead Minggu Ini", data.thisWeekLeads],
    ["Growth (%)", data.growth],
    ["Sesi Aktif", data.activeSessions],
    ["Total Sesi", data.totalSessions],
    ["Laporan Lapangan", data.fieldReportCount ?? 0],
    ["", ""],
    ["=== PIPELINE ===", ""],
    ...(data.pipeline ?? []).map((p: any) => [p.label, p.count]),
    ["", ""],
    ["=== KATEGORI ===", ""],
    ...Object.entries(data.byCategory ?? {}).map(([k, v]) => [CATEGORY_LABELS[k] ?? k, v as number]),
    ["", ""],
    ["=== SUMBER ===", ""],
    ...Object.entries(data.bySource ?? {}).map(([k, v]) => [SOURCE_LABELS[k] ?? k, v as number]),
  ];
  downloadCSV(headers, rows, filename ?? `dashboard_summary_${new Date().toISOString().slice(0, 10)}.csv`);
}
