import type { Customer } from "@shared/schema";

export const LOCKABLE_FIELDS: { key: string; label: string }[] = [
  { key: "name", label: "Nama" },
  { key: "phone", label: "Telepon" },
  { key: "email", label: "Email" },
  { key: "address", label: "Alamat" },
  { key: "lat", label: "Latitude" },
  { key: "lng", label: "Longitude" },
  { key: "package", label: "Paket" },
  { key: "district", label: "Kecamatan" },
  { key: "village", label: "Desa/Kelurahan" },
  { key: "customerType", label: "Jenis" },
];

export function parseOverrides(c: Customer | any): string[] {
  try {
    const v = (c as any).manualOverrides;
    if (!v) return [];
    return Array.isArray(v) ? v : JSON.parse(v);
  } catch { return []; }
}

export interface DistrictSummary {
  district: string;
  total: number;
  active: number;
  suspended: number;
  inactive: number;
  rumahan: number;
  bisnis: number;
  villages: { name: string; total: number; active: number; suspended: number }[];
}

export function exportCustomersCSV(customers: Customer[], odpMap: Map<number, string>) {
  const headers = ["ID Pelanggan", "Nama", "Jenis", "Paket", "Status", "Telepon", "Email", "Alamat", "Kecamatan", "Desa/Kelurahan", "ODP", "Port", "Lat", "Lng"];
  const rows = customers.map(c => {
    const anyC = c as any;
    return [
      c.customerId, c.name, anyC.customerType ?? "", c.package ?? "",
      c.status === "active" ? "Aktif" : c.status === "suspended" ? "Isolir" : "Non-Aktif",
      c.phone ?? "", anyC.email ?? "", c.address ?? "",
      anyC.district ?? "", anyC.village ?? "",
      c.odpId ? (odpMap.get(c.odpId) ?? `ODP #${c.odpId}`) : "",
      c.portNumber ?? "", c.lat ?? "", c.lng ?? "",
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
  });
  const csv = [headers.map(h => `"${h}"`).join(","), ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pelanggan_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}


export const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];
