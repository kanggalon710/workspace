import { useState } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Router, Copy, Zap, Eye, EyeOff, Cpu, MessageCircle, Send, Database, Bot, Webhook, MapPin, Wifi } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MikrotikRouter {
  id: number;
  name: string;
  host: string;
  port?: number;
  lastSeen: string | null;
  isActive: number | null;
}

export interface SettingItem {
  key: string;
  value: string;
  category?: string;
  label?: string;
}

// ---------------------------------------------------------------------------
// Toggle Switch (inline, no external dependency)
// ---------------------------------------------------------------------------

export function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`
        relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
        transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
        disabled:cursor-not-allowed disabled:opacity-50
        ${checked ? "bg-primary" : "bg-muted-foreground/30"}
      `}
    >
      <span
        className={`
          pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0
          transition duration-200 ease-in-out
          ${checked ? "translate-x-4" : "translate-x-0"}
        `}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Password Input with eye toggle
// ---------------------------------------------------------------------------

export function PasswordInput({
  value,
  onChange,
  placeholder,
  id,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  id?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted text-muted-foreground"
        tabIndex={-1}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status badge helper
// ---------------------------------------------------------------------------

// Adapter domain: status integrasi -> design-system StatusBadge (satu sumber warna).
export function IntegrationStatusBadge({
  status,
}: {
  status: "connected" | "inactive" | "config" | "available";
}) {
  switch (status) {
    case "connected":
      return <StatusBadge variant="success" label="Terhubung" />;
    case "inactive":
      return <StatusBadge variant="danger" label="Tidak Aktif" />;
    case "config":
      return <StatusBadge variant="warning" label="Perlu Konfigurasi" />;
    case "available":
      return <StatusBadge variant="info" label="Tersedia" icon={Zap} />;
  }
}

// ---------------------------------------------------------------------------
// Method badge for API reference
// ---------------------------------------------------------------------------

export function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    POST: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    PUT: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    DELETE:
      "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    PATCH:
      "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  };
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-mono font-bold ${colors[method] || "bg-gray-100 text-gray-800"}`}
    >
      {method}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Guide step component
// ---------------------------------------------------------------------------

export function GuideStep({ step, text }: { step: number; text: string }) {
  return (
    <div className="flex gap-3 items-start">
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
        {step}
      </span>
      <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Code snippet helper
// ---------------------------------------------------------------------------

export function CodeSnippet({ code }: { code: string }) {
  return (
    <div className="relative group">
      <pre className="bg-muted/50 rounded-md px-3 py-2 text-xs font-mono overflow-x-auto border whitespace-pre-wrap">
        {code}
      </pre>
      <button
        onClick={() => {
          navigator.clipboard.writeText(code);
          toast.success("Disalin ke clipboard");
        }}
        className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted"
        title="Salin"
      >
        <Copy className="h-3 w-3 text-muted-foreground" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feature badges
// ---------------------------------------------------------------------------

export function FeatureBadges({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <Badge
          key={item}
          variant="secondary"
          className="text-xs font-normal"
        >
          {item}
        </Badge>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// API Reference data
// ---------------------------------------------------------------------------

export const API_ENDPOINTS = [
  // Customer
  { method: "GET", path: "/api/customers", desc: "List pelanggan (dengan filter & pagination)" },
  { method: "POST", path: "/api/customers", desc: "Tambah pelanggan baru (auto-sync PPPoE)" },
  { method: "PUT", path: "/api/customers/:id", desc: "Update data pelanggan (auto-sync PPPoE)" },
  { method: "DELETE", path: "/api/customers/:id", desc: "Hapus pelanggan (auto-delete PPPoE secret)" },
  // MikroTik Router
  { method: "GET", path: "/api/mikrotik/routers", desc: "List router MikroTik" },
  { method: "POST", path: "/api/mikrotik/routers", desc: "Tambah router MikroTik baru" },
  { method: "PUT", path: "/api/mikrotik/routers/:id", desc: "Update konfigurasi router" },
  { method: "DELETE", path: "/api/mikrotik/routers/:id", desc: "Hapus router MikroTik" },
  { method: "POST", path: "/api/mikrotik/routers/:id/test", desc: "Test koneksi ke router" },
  // PPP Profile
  { method: "GET", path: "/api/mikrotik/routers/:id/ppp/profile", desc: "List PPP Profile (paket internet)" },
  { method: "POST", path: "/api/mikrotik/routers/:id/ppp/profile", desc: "Tambah PPP Profile baru" },
  { method: "PUT", path: "/api/mikrotik/routers/:id/ppp/profile/:name", desc: "Update PPP Profile" },
  { method: "DELETE", path: "/api/mikrotik/routers/:id/ppp/profile/:name", desc: "Hapus PPP Profile" },
  // PPP Secret
  { method: "GET", path: "/api/mikrotik/routers/:id/ppp/secret", desc: "List PPP Secret (akun PPPoE)" },
  { method: "POST", path: "/api/mikrotik/routers/:id/ppp/secret", desc: "Tambah PPP Secret baru" },
  { method: "PUT", path: "/api/mikrotik/routers/:id/ppp/secret/:name", desc: "Update PPP Secret" },
  { method: "DELETE", path: "/api/mikrotik/routers/:id/ppp/secret/:name", desc: "Hapus PPP Secret" },
  { method: "POST", path: "/api/mikrotik/routers/:id/ppp/secret/:name/toggle", desc: "Enable/Disable PPP Secret" },
  // Sessions, Resource, Interfaces
  { method: "GET", path: "/api/mikrotik/routers/:id/ppp/active", desc: "Sesi aktif PPPoE" },
  { method: "GET", path: "/api/mikrotik/routers/:id/system/resource", desc: "Resource sistem router (CPU, RAM, uptime)" },
  { method: "GET", path: "/api/mikrotik/routers/:id/interface", desc: "List interface jaringan router" },
  { method: "GET", path: "/api/mikrotik/routers/:id/queue/simple", desc: "List Simple Queue (bandwidth limit)" },
  { method: "GET", path: "/api/mikrotik/routers/:id/ip/dhcp-server/lease", desc: "List DHCP Lease" },
  { method: "GET", path: "/api/mikrotik/routers/:id/ip/arp", desc: "List ARP Table" },
  // Settings
  { method: "GET", path: "/api/settings", desc: "Ambil semua pengaturan (filter: ?category=xxx)" },
  { method: "PUT", path: "/api/settings", desc: "Simpan satu pengaturan { key, value, category }" },
  { method: "PUT", path: "/api/settings/bulk", desc: "Simpan banyak pengaturan sekaligus" },
  // Billing Sync
  { method: "POST", path: "/api/billing/sync", desc: "Sinkronisasi data pelanggan dari billing" },
  // Infrastructure
  { method: "GET", path: "/api/pops", desc: "List POP (Point of Presence)" },
  { method: "GET", path: "/api/odcs", desc: "List ODC (Optical Distribution Cabinet)" },
  { method: "GET", path: "/api/odps", desc: "List ODP (Optical Distribution Point)" },
  { method: "GET", path: "/api/cables", desc: "List kabel fiber optik" },
  // Export/Import
  { method: "GET", path: "/api/export/:type", desc: "Export data aset (CSV/Excel)" },
  { method: "POST", path: "/api/import/:type", desc: "Import data aset (CSV/Excel)" },
  // Logs
  { method: "GET", path: "/api/audit-logs", desc: "Log aktivitas pengguna" },
];

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

export function getSettingValue(
  settings: SettingItem[] | undefined,
  key: string,
  fallback = ""
): string {
  if (!settings) return fallback;
  const found = settings.find((s) => s.key === key);
  return found?.value ?? fallback;
}

// Daftar integrasi - tiap item = 1 "menu terpisah" (halaman /integrations/:key), pola
// seperti Beranda -> hub divisi. accent = warna aksen kartu hub.
export const INTEGRATION_SECTIONS: Array<{ key: string; label: string; desc: string; icon: any; accent: string }> = [
  { key: "maps",     label: "Google Maps",        desc: "API key peta & geolokasi aset jaringan",       icon: MapPin,        accent: "text-emerald-600 bg-emerald-500/10" },
  { key: "mikrotik", label: "MikroTik RouterOS",  desc: "Router, PPP secret, isolir profile",           icon: Wifi,          accent: "text-amber-600 bg-amber-500/10" },
  { key: "acs",      label: "GenieACS (TR-069)",  desc: "Konfigurasi WiFi ONT, reboot, RX power",       icon: Cpu,           accent: "text-sky-600 bg-sky-500/10" },
  { key: "billing",  label: "Billing Sync",       desc: "Sinkron billing.jabnet.id + migrasi collection", icon: Database,     accent: "text-indigo-600 bg-indigo-500/10" },
  { key: "whatsapp", label: "WhatsApp (MPWA)",    desc: "Gateway pesan & OTP pelanggan",                icon: MessageCircle, accent: "text-green-600 bg-green-500/10" },
  { key: "telegram", label: "Telegram Bot",       desc: "Notifikasi internal via bot",                  icon: Send,          accent: "text-cyan-600 bg-cyan-500/10" },
  { key: "meta",     label: "Meta Conversions",   desc: "Meta CAPI (Conversions API)",                  icon: Zap,           accent: "text-blue-600 bg-blue-500/10" },
  { key: "data",     label: "Data & API",         desc: "Export/Import data + referensi API internal",  icon: Webhook,       accent: "text-violet-600 bg-violet-500/10" },
];
