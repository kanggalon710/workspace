/** Struktur workspace berbasis DIVISI (restrukturisasi v5.1 - feedback user).
 *  Satu sumber kebenaran untuk: Sidebar, Beranda (pemilih divisi), dan
 *  DivisionHubPage (dashboard per divisi). Menambah/memindah modul cukup di sini. */
import {
  Megaphone, Wrench, Activity, Headset, Wallet, IdCard, UsersRound,
  Map, Radio, Box, CircleDot, Landmark, Cable, Server, Rows3, Split, Cpu, Link2,
  GitBranch, Calculator, FileSpreadsheet, BarChart3, MapPinned, Search, Contact,
  ClipboardList, Camera, TrendingUp, Users, MessageSquare, Package, AlertCircle,
  Heart, Wifi, MessageCircle, CheckSquare, Kanban, LayoutDashboard, KeyRound, CalendarCheck2,
  RefreshCw,
} from "lucide-react";

export type DivisionModule = {
  label: string;
  path?: string;
  icon: any;
  permission?: string;
  children?: DivisionModule[];
};

export type Division = {
  key: string;
  label: string;
  short: string;           // label pendek untuk kartu Beranda
  icon: any;
  accent: "primary" | "success" | "warning" | "info" | "violet" | "rose";
  description: string;
  modules: DivisionModule[];
};

export const DIVISIONS: Division[] = [
  {
    key: "marketing", label: "Marketing", short: "Marketing", icon: Megaphone, accent: "rose",
    description: "Akuisisi pelanggan: canvassing, leads, prospek, kampanye",
    modules: [
      { label: "Dashboard Marketing", path: "/marketing", icon: BarChart3, permission: "marketing_dashboard" },
      { label: "Canvassing Lapangan", path: "/canvassing", icon: MapPinned, permission: "canvassing" },
      { label: "Pipeline Lead (Canvassing)", path: "/leads", icon: Kanban, permission: "leads" },
      { label: "Pipeline Reaktivasi (Delegasi Collection)", path: "/collections/marketing", icon: RefreshCw, permission: "leads" },
      { label: "Prospect Finder", path: "/prospects", icon: Search, permission: "prospects" },
      { label: "Database Kontak", path: "/contacts", icon: Contact, permission: "contacts" },
      { label: "Riwayat Sesi", path: "/canvassing/history", icon: ClipboardList, permission: "canvassing" },
      { label: "Laporan Lapangan", path: "/canvassing/reports", icon: Camera, permission: "canvassing" },
      { label: "Area Insights", path: "/marketing/bisnis", icon: TrendingUp, permission: "marketing_dashboard" },
      { label: "Iklan & Kampanye", path: "/marketing/ads", icon: Megaphone, permission: "marketing_ads" },
    ],
  },
  {
    key: "teknik", label: "Operasional & Technical Support", short: "Teknik", icon: Wrench, accent: "warning",
    description: "Lapangan: peta jaringan, aset fisik, work order, tools jaringan",
    modules: [
      { label: "Peta Jaringan", path: "/map", icon: Map, permission: "map" },
      { label: "Work Order", path: "/tickets", icon: ClipboardList, permission: "tickets" },
      { label: "POP", path: "/pops", icon: Radio, permission: "pops" },
      { label: "ODC", path: "/odcs", icon: Box, permission: "odcs" },
      { label: "ODP", path: "/odps", icon: CircleDot, permission: "odps" },
      { label: "Tiang", path: "/poles", icon: Landmark, permission: "poles" },
      { label: "Kabel", path: "/cables", icon: Cable, permission: "cables" },
      {
        label: "Core Management", icon: Cpu,
        children: [
          { label: "OTB Manager", path: "/otb-manager", icon: Server, permission: "otbs" },
          { label: "Bestray", path: "/bestray-manager", icon: Rows3, permission: "bestrays" },
          { label: "Splitter", path: "/splitters", icon: Split, permission: "splitters" },
          { label: "Core Manager", path: "/cable-cores", icon: Cpu, permission: "cable_cores" },
          { label: "Koneksi Core", path: "/core-connections", icon: Link2, permission: "core_connections" },
        ],
      },
      {
        label: "Tools Jaringan", icon: Wrench,
        children: [
          { label: "Splitter Chain", path: "/splitter-chain", icon: GitBranch, permission: "splitter_chain" },
          { label: "Power Budget", path: "/power-budget", icon: Calculator, permission: "power_budget" },
          { label: "Export / Import", path: "/export-import", icon: FileSpreadsheet, permission: "export_import" },
        ],
      },
    ],
  },
  {
    key: "noc", label: "NOC", short: "NOC", icon: Activity, accent: "primary",
    description: "Monitoring jaringan: kesehatan infrastruktur, MikroTik, ONT",
    modules: [
      { label: "Dashboard Jaringan", path: "/dashboard-jaringan", icon: LayoutDashboard, permission: "dashboard" },
      { label: "Monitoring", path: "/billing/monitoring", icon: BarChart3, permission: "monitoring" },
      { label: "Sesi Aktif", path: "/billing/sessions", icon: Activity, permission: "sessions" },
      { label: "Perangkat ONT", path: "/devices", icon: Cpu, permission: "devices" },
      { label: "Router MikroTik", path: "/billing/routers", icon: Wifi, permission: "routers" },
      { label: "Pipeline NOC (Kustom)", path: "/pipelines/divisi/noc", icon: Kanban, permission: "pipelines" },
    ],
  },
  {
    key: "cs", label: "Layanan Pelanggan", short: "Layanan", icon: Headset, accent: "info",
    description: "Pelanggan: data, komunikasi, WhatsApp, loyalty JABNET Sahabat",
    modules: [
      { label: "Pelanggan", path: "/customers", icon: Users, permission: "customers" },
      { label: "Pipeline Reaktivasi (Delegasi Finance)", path: "/collections/cs", icon: RefreshCw, permission: "customers" },
      { label: "Komunikasi", path: "/communications", icon: MessageSquare, permission: "chatwoot" },
      { label: "JABNET Sahabat", path: "/loyalty", icon: Heart, permission: "loyalty_admin" },
      {
        label: "Whatsapp", icon: MessageCircle, permission: "whatsapp",
        children: [
          { label: "Nomor Whatsapp", path: "/whatsapp/devices", icon: MessageCircle, permission: "whatsapp" },
          { label: "Template Whatsapp", path: "/whatsapp/templates", icon: MessageCircle, permission: "whatsapp" },
          { label: "Phonebook", path: "/whatsapp/phonebook", icon: MessageCircle, permission: "phonebooks" },
          { label: "Broadcast Pelanggan", path: "/whatsapp/broadcast/pelanggan", icon: Megaphone, permission: "whatsapp" },
          { label: "Broadcast Reseller", path: "/whatsapp/broadcast/reseller", icon: Megaphone, permission: "whatsapp" },
        ],
      },
    ],
  },
  {
    key: "keuangan", label: "Keuangan", short: "Keuangan", icon: Wallet, accent: "success",
    description: "Penagihan & paket: collection pipeline, paket internet, billing",
    modules: [
      { label: "Collection (Penagihan)", path: "/collections", icon: AlertCircle, permission: "collections" },
      { label: "Paket Internet", path: "/billing/packages", icon: Package, permission: "packages" },
    ],
  },
  {
    key: "hrd", label: "HRD", short: "HRD", icon: IdCard, accent: "violet",
    description: "SDM: data karyawan, kehadiran, cuti, produktivitas staff",
    modules: [
      { label: "SDM (Karyawan, Kehadiran, Cuti)", path: "/hrd/sdm", icon: CalendarCheck2, permission: "hr_sdm" },
      { label: "Pipeline HRD (Kustom)", path: "/pipelines/divisi/hrd", icon: Kanban, permission: "pipelines" },
      { label: "Activity & Produktivitas", path: "/audit-logs", icon: ClipboardList, permission: "audit_logs" },
    ],
  },
  {
    key: "teamspace", label: "Teamspace", short: "Teamspace", icon: UsersRound, accent: "violet",
    description: "Kolaborasi lintas divisi: tugas tim, chat, jadwal, laporan kinerja",
    modules: [
      { label: "Semua Tugas", path: "/teamspace/tasks", icon: CheckSquare, permission: "team_tasks" },
      { label: "Tim Saya", path: "/teamspace/teams", icon: UsersRound, permission: "team_tasks" },
      { label: "Laporan Kinerja", path: "/teamspace/performance", icon: BarChart3, permission: "performance_reports" },
      { label: "Cheers", path: "/teamspace/cheers", icon: Heart, permission: "cheers" },
    ],
  },
];

/** Divisi utama per role default - user langsung diarahkan ke hub divisinya dari Beranda. */
export const ROLE_HOME_DIVISION: Record<string, string> = {
  marketing: "marketing",
  marketing_spv: "marketing",
  operator: "teknik",
  teknisi: "teknik",
  noc: "noc",
  cs: "cs",
  finance: "keuangan",
  hrd: "hrd",
};

export function getDivision(key: string | undefined): Division | undefined {
  return DIVISIONS.find((d) => d.key === key);
}
