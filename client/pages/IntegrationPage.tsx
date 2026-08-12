import { useState, useEffect } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { useLocation, useRoute } from "wouter";
import { DevDbSyncCard } from "@/components/integrations/DevDbSyncCard";
import { AppUpdateCard } from "@/components/integrations/AppUpdateCard";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import {
  usePipelines,
  useCollectionsEngineMode,
  useSetCollectionsEngineMode,
  type CollectionsEngineMode,
} from "@/hooks/usePipelines";
import { toast } from "sonner";
import { OpenInChatwootButton } from "@/components/chatwoot/OpenInChatwootButton";
import {
  Link2,
  Map,
  Router,
  CreditCard,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  ExternalLink,
  BookOpen,
  Globe,
  Copy,
  Zap,
  Eye,
  EyeOff,
  Save,
  TestTube,
  ArrowRight,
  Cpu,
  MessageCircle,
  Send,
  Database,
  RefreshCw,
  Activity,
  Bot,
  MessageSquare,
  Plus,
  Trash2,
  Webhook,
  User as UserIcon,
  Users,
  Building2,
  MapPin,
  Wifi,
  ChevronLeft,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MikrotikRouter {
  id: number;
  name: string;
  host: string;
  port?: number;
  lastSeen: string | null;
  isActive: number | null;
}

interface SettingItem {
  key: string;
  value: string;
  category?: string;
  label?: string;
}

// ---------------------------------------------------------------------------
// Toggle Switch (inline, no external dependency)
// ---------------------------------------------------------------------------

function ToggleSwitch({
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

function PasswordInput({
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
function IntegrationStatusBadge({
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

function MethodBadge({ method }: { method: string }) {
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

function GuideStep({ step, text }: { step: number; text: string }) {
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

function CodeSnippet({ code }: { code: string }) {
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

function FeatureBadges({ items }: { items: string[] }) {
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

const API_ENDPOINTS = [
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

function getSettingValue(
  settings: SettingItem[] | undefined,
  key: string,
  fallback = ""
): string {
  if (!settings) return fallback;
  const found = settings.find((s) => s.key === key);
  return found?.value ?? fallback;
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

// Daftar integrasi - tiap item = 1 "menu terpisah" (halaman /integrations/:key), pola
// seperti Beranda -> hub divisi. accent = warna aksen kartu hub.
const INTEGRATION_SECTIONS: Array<{ key: string; label: string; desc: string; icon: any; accent: string }> = [
  { key: "maps",     label: "Google Maps",        desc: "API key peta & geolokasi aset jaringan",       icon: MapPin,        accent: "text-emerald-600 bg-emerald-500/10" },
  { key: "mikrotik", label: "MikroTik RouterOS",  desc: "Router, PPP secret, isolir profile",           icon: Wifi,          accent: "text-amber-600 bg-amber-500/10" },
  { key: "acs",      label: "GenieACS (TR-069)",  desc: "Konfigurasi WiFi ONT, reboot, RX power",       icon: Cpu,           accent: "text-sky-600 bg-sky-500/10" },
  { key: "billing",  label: "Billing Sync",       desc: "Sinkron billing.jabnet.id + migrasi collection", icon: Database,     accent: "text-indigo-600 bg-indigo-500/10" },
  { key: "whatsapp", label: "WhatsApp (MPWA)",    desc: "Gateway pesan & OTP pelanggan",                icon: MessageCircle, accent: "text-green-600 bg-green-500/10" },
  { key: "telegram", label: "Telegram Bot",       desc: "Notifikasi internal via bot",                  icon: Send,          accent: "text-cyan-600 bg-cyan-500/10" },
  { key: "meta",     label: "Meta Conversions",   desc: "Meta CAPI (Conversions API)",                  icon: Zap,           accent: "text-blue-600 bg-blue-500/10" },
  { key: "data",     label: "Data & API",         desc: "Export/Import data + referensi API internal",  icon: Webhook,       accent: "text-violet-600 bg-violet-500/10" },
];

export default function IntegrationPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const activeMitraId = user?.activeMitraId ?? 1;
  const isSystemAdmin = !!user?.isSystemAdmin;

  // Guide toggles
  const [expandedGuides, setExpandedGuides] = useState<Record<string, boolean>>(
    {}
  );
  const [showApiRef, setShowApiRef] = useState(false);
  const toggleGuide = (key: string) =>
    setExpandedGuides((prev) => ({ ...prev, [key]: !prev[key] }));

  // Navigasi integrasi berbasis route: /integrations = hub kartu, /integrations/:key = 1 menu.
  const [, navigate] = useLocation();
  const [, catParams] = useRoute("/integrations/:cat");
  const cat = catParams?.cat ?? null;
  const isHub = !cat;
  const show = (c: string) => cat === c;
  const activeSection = INTEGRATION_SECTIONS.find((s) => s.key === cat);

  // ---------------------------------------------------------------------------
  // Fetch all settings
  // ---------------------------------------------------------------------------
  const { data: allSettings, isLoading: settingsLoading } = useQuery<
    SettingItem[]
  >({
    queryKey: ["/api/settings"],
    queryFn: () => api.get<SettingItem[]>("/settings"),
    staleTime: 30_000,
    retry: 1,
  });

  // ---------------------------------------------------------------------------
  // Fetch MikroTik routers
  // ---------------------------------------------------------------------------
  const { data: routers = [] } = useQuery<MikrotikRouter[]>({
    queryKey: ["mikrotik-routers-integration"],
    queryFn: () => api.get<MikrotikRouter[]>("/mikrotik/routers"),
    staleTime: 30_000,
    retry: 1,
  });

  // ---------------------------------------------------------------------------
  // Save setting mutation
  // ---------------------------------------------------------------------------
  const saveMutation = useMutation({
    mutationFn: (setting: {
      key: string;
      value: string;
      category: string;
      label?: string;
    }) => api.put("/settings", setting),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
  });

  const saveBulkMutation = useMutation({
    mutationFn: (
      settings: { key: string; value: string; category: string; label?: string }[]
    ) => api.put("/settings/bulk", { settings }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
  });

  // ---------------------------------------------------------------------------
  // Google Maps local state
  // ---------------------------------------------------------------------------
  const [gmapsApiKey, setGmapsApiKey] = useState("");
  const [gmapsSaving, setGmapsSaving] = useState(false);

  useEffect(() => {
    if (allSettings) {
      setGmapsApiKey(getSettingValue(allSettings, "google_maps_api_key"));
    }
  }, [allSettings]);

  const gmapsConnected =
    typeof window !== "undefined" && !!(window as any).google?.maps;

  // ---------------------------------------------------------------------------
  // Real-time connection checks (actual ping to services)
  // ---------------------------------------------------------------------------
  // MikroTik: test first active router
  const { data: mtLiveStatus } = useQuery({
    queryKey: ["/api/mikrotik/live-check", routers[0]?.id],
    queryFn: async () => {
      if (!routers[0]?.id) return { connected: false };
      try {
        await api.post(`/mikrotik/routers/${routers[0].id}/test`, {});
        return { connected: true };
      } catch { return { connected: false }; }
    },
    enabled: routers.length > 0,
    refetchInterval: 60000, // check every 60s
    retry: false,
  });

  // GenieACS: test connection
  const { data: genieLiveStatus } = useQuery<{ connected: boolean; configured: boolean; total?: number; error?: string }>({
    queryKey: ["/api/genieacs/live-check"],
    queryFn: async () => {
      const host = (allSettings || []).find((s: any) => s.key === "genieacs_host")?.value;
      if (!host) return { connected: false, configured: false };
      try {
        // /genieacs/stats kini melempar kalau respon bukan array NBI → badge jujur.
        const stats = await api.get<{ total: number; online: number; offline: number }>("/genieacs/stats");
        return { connected: true, configured: true, total: stats.total };
      } catch (e: any) { return { connected: false, configured: true, error: e?.message as string }; }
    },
    enabled: !!allSettings,
    refetchInterval: 60000,
    retry: false,
  });

  const handleSaveGmaps = async () => {
    setGmapsSaving(true);
    try {
      await saveMutation.mutateAsync({
        key: "google_maps_api_key",
        value: gmapsApiKey,
        category: "google_maps",
        label: "Google Maps API Key",
      });
      toast.success("API Key Google Maps berhasil disimpan.");
    } catch (err: any) {
      toast.error(`Gagal menyimpan: ${err.message}`);
    } finally {
      setGmapsSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // MikroTik local state
  // ---------------------------------------------------------------------------
  const [mtDefaultPort, setMtDefaultPort] = useState("8728");
  const [mtTimeout, setMtTimeout] = useState("15");
  const [mtAutoSync, setMtAutoSync] = useState(false);
  const [mtSaving, setMtSaving] = useState(false);
  const [testingRouterId, setTestingRouterId] = useState<number | null>(null);

  useEffect(() => {
    if (allSettings) {
      setMtDefaultPort(
        getSettingValue(allSettings, "mikrotik_default_port", "8728")
      );
      setMtTimeout(getSettingValue(allSettings, "mikrotik_timeout", "15"));
      setMtAutoSync(
        getSettingValue(allSettings, "mikrotik_auto_sync_pppoe", "false") ===
          "true"
      );
    }
  }, [allSettings]);

  const connectedRouters = routers.filter((r) => {
    if (!r.lastSeen || !r.isActive) return false;
    const diff = Date.now() - new Date(r.lastSeen).getTime();
    return diff < 10 * 60 * 1000;
  });

  const mikrotikStatus: "connected" | "inactive" | "config" =
    mtLiveStatus?.connected
      ? "connected"
      : routers.length > 0
        ? "inactive"
        : "config";

  const handleSaveMikrotik = async () => {
    setMtSaving(true);
    try {
      await saveBulkMutation.mutateAsync([
        {
          key: "mikrotik_default_port",
          value: mtDefaultPort,
          category: "mikrotik",
          label: "Default API Port",
        },
        {
          key: "mikrotik_timeout",
          value: mtTimeout,
          category: "mikrotik",
          label: "Default Timeout (detik)",
        },
        {
          key: "mikrotik_auto_sync_pppoe",
          value: mtAutoSync ? "true" : "false",
          category: "mikrotik",
          label: "Auto-sync PPPoE",
        },
      ]);
      toast.success("Pengaturan MikroTik berhasil disimpan.");
    } catch (err: any) {
      toast.error(`Gagal menyimpan: ${err.message}`);
    } finally {
      setMtSaving(false);
    }
  };

  const handleTestRouter = async (router: MikrotikRouter) => {
    setTestingRouterId(router.id);
    try {
      await api.post(`/mikrotik/routers/${router.id}/test`, {});
      toast.success(`Koneksi ke ${router.name} berhasil!`);
    } catch (err: any) {
      toast.error(`Gagal koneksi ke ${router.name}: ${err.message}`);
    } finally {
      setTestingRouterId(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Billing local state
  // ---------------------------------------------------------------------------
  // GenieACS
  const [genieHost, setGenieHost] = useState("");
  const [geniePort, setGeniePort] = useState("7557");
  const [genieUser, setGenieUser] = useState("");
  const [geniePass, setGeniePass] = useState("");
  const [opticalWarn, setOpticalWarn] = useState("");
  const [opticalCrit, setOpticalCrit] = useState("");
  const [genieInited, setGenieInited] = useState(false);

  // Meta CAPI
  const [metaPixelId, setMetaPixelId] = useState("");
  const [metaAccessToken, setMetaAccessToken] = useState("");
  const [metaInited, setMetaInited] = useState(false);

  // -- MPWA (WhatsApp Gateway) --
  const [mpwaEnabled, setMpwaEnabled] = useState(false);
  const [mpwaUrl, setMpwaUrl] = useState("https://mpwa.jabnet.id");
  const [mpwaToken, setMpwaToken] = useState("");
  const [mpwaSenderNumber, setMpwaSenderNumber] = useState("");
  // v4.2.19: native button endpoint (opsional, untuk broadcast button)
  const [mpwaButtonEndpoint, setMpwaButtonEndpoint] = useState("");
  const [mpwaInited, setMpwaInited] = useState(false);
  const [mpwaShowToken, setMpwaShowToken] = useState(false);
  const [mpwaTestPhone, setMpwaTestPhone] = useState("");
  const [mpwaTesting, setMpwaTesting] = useState(false);
  const [mpwaSaving, setMpwaSaving] = useState(false);

  // MPWA live status query
  const { data: mpwaStatus, refetch: refetchMpwaStatus } = useQuery<any>({
    queryKey: ["/api/mpwa/status"],
    queryFn: () => api.get<any>("/mpwa/status"),
    refetchInterval: 60_000,
    retry: false,
  });

  // -- Telegram Bot --
  const [tgEnabled, setTgEnabled] = useState(false);
  const [tgToken, setTgToken] = useState("");
  const [tgShowToken, setTgShowToken] = useState(false);
  const [tgTestChatId, setTgTestChatId] = useState("");
  const [tgSaving, setTgSaving] = useState(false);
  const [tgTesting, setTgTesting] = useState(false);

  const { data: tgConfig, refetch: refetchTgConfig } = useQuery<any>({
    queryKey: ["/api/telegram/config"],
    queryFn: () => api.get<any>("/telegram/config"),
    refetchInterval: 60_000,
    retry: false,
  });

  useEffect(() => {
    if (tgConfig) {
      setTgEnabled(!!tgConfig.enabled);
      setTgToken(tgConfig.botToken || "");
    }
  }, [tgConfig]);

  useEffect(() => {
    if (allSettings && !genieInited) {
      setGenieHost(getSettingValue(allSettings, "genieacs_host"));
      setGeniePort(getSettingValue(allSettings, "genieacs_port", "7557"));
      setGenieUser(getSettingValue(allSettings, "genieacs_username"));
      setGeniePass(getSettingValue(allSettings, "genieacs_password"));
      setOpticalWarn(getSettingValue(allSettings, "optical_rx_warn"));
      setOpticalCrit(getSettingValue(allSettings, "optical_rx_crit"));
      setGenieInited(true);
    }
    if (allSettings && !metaInited) {
      setMetaPixelId(getSettingValue(allSettings, "meta_pixel_id"));
      setMetaAccessToken(getSettingValue(allSettings, "meta_access_token"));
      setMetaInited(true);
    }
    if (allSettings && !mpwaInited) {
      setMpwaEnabled(getSettingValue(allSettings, "mpwa_enabled", "false") === "true");
      setMpwaUrl(getSettingValue(allSettings, "mpwa_url", "https://mpwa.jabnet.id"));
      setMpwaToken(getSettingValue(allSettings, "mpwa_token"));
      setMpwaSenderNumber(getSettingValue(allSettings, "mpwa_sender_number"));
      setMpwaButtonEndpoint(getSettingValue(allSettings, "mpwa_button_endpoint", ""));
      setMpwaInited(true);
    }
  }, [allSettings, genieInited, metaInited, mpwaInited]);

  // -- Billing Sync (billing.jabnet.id) --
  const [billEnabled, setBillEnabled] = useState(true);
  const [billPeakSec, setBillPeakSec] = useState("60");
  const [billOffSec, setBillOffSec] = useState("600");
  const [billPeakStart, setBillPeakStart] = useState("8");
  const [billPeakEnd, setBillPeakEnd] = useState("17");
  const [billInited, setBillInited] = useState(false);
  const [billSaving, setBillSaving] = useState(false);
  const [billSyncing, setBillSyncing] = useState(false);
  const [billReconciling, setBillReconciling] = useState(false);

  useEffect(() => {
    if (allSettings && !billInited) {
      setBillEnabled(
        getSettingValue(allSettings, "billing_sync_enabled", "true") === "true"
      );
      setBillPeakSec(getSettingValue(allSettings, "billing_sync_interval_peak", "60"));
      setBillOffSec(getSettingValue(allSettings, "billing_sync_interval_off", "600"));
      setBillPeakStart(getSettingValue(allSettings, "billing_sync_peak_start", "8"));
      setBillPeakEnd(getSettingValue(allSettings, "billing_sync_peak_end", "17"));
      setBillInited(true);
    }
  }, [allSettings, billInited]);

  const { data: billStatus, refetch: refetchBillStatus } = useQuery<any>({
    queryKey: ["/api/billing/sync/status"],
    queryFn: () => api.get<any>("/billing/sync/status"),
    refetchInterval: 30_000,
    retry: false,
  });

  const { data: billHealth, refetch: refetchBillHealth } = useQuery<any>({
    queryKey: ["/api/billing/sync/health"],
    queryFn: () => api.get<any>("/billing/sync/health"),
    refetchInterval: 60_000,
    retry: false,
  });

  const handleSaveBilling = async () => {
    setBillSaving(true);
    try {
      await saveBulkMutation.mutateAsync([
        { key: "billing_sync_enabled", value: billEnabled ? "true" : "false", category: "billing", label: "Billing Sync Aktif" },
        { key: "billing_sync_interval_peak", value: String(Math.max(30, Number(billPeakSec) || 60)), category: "billing", label: "Interval Peak (detik)" },
        { key: "billing_sync_interval_off", value: String(Math.max(60, Number(billOffSec) || 600)), category: "billing", label: "Interval Off-peak (detik)" },
        { key: "billing_sync_peak_start", value: String(Math.min(23, Math.max(0, Number(billPeakStart) || 8))), category: "billing", label: "Peak Start (jam)" },
        { key: "billing_sync_peak_end", value: String(Math.min(23, Math.max(0, Number(billPeakEnd) || 17))), category: "billing", label: "Peak End (jam)" },
      ]);
      toast.success("Konfigurasi billing sync disimpan");
      refetchBillStatus();
    } catch (err: any) {
      toast.error(`Gagal menyimpan: ${err.message}`);
    } finally {
      setBillSaving(false);
    }
  };

  const handleSyncNow = async () => {
    setBillSyncing(true);
    try {
      const result: any = await api.post("/billing/sync", {});
      toast.success(
        `Sync selesai - ${result?.updated ?? 0} updated, ${result?.created ?? 0} created`,
        { description: `Total ${result?.total ?? 0} pelanggan · error: ${result?.errors ?? 0}` }
      );
      refetchBillStatus();
      refetchBillHealth();
    } catch (err: any) {
      toast.error(`Sync gagal: ${err.message}`);
    } finally {
      setBillSyncing(false);
    }
  };

  const handleReconcile = async () => {
    setBillReconciling(true);
    try {
      const result: any = await api.post("/billing/sync/reconcile", {});
      toast.success(
        `Reconcile: ${result?.fixesApplied ?? 0} perbaikan dari ${result?.mismatchesFound ?? 0} mismatch`
      );
      refetchBillHealth();
    } catch (err: any) {
      toast.error(`Reconcile gagal: ${err.message}`);
    } finally {
      setBillReconciling(false);
    }
  };

  // ---------------------------------------------------------------------------
  // JABNET-root per-mitra billing management
  // ---------------------------------------------------------------------------
  const [selBillingMitra, setSelBillingMitra] = useState<string>("");
  const [selBillingId, setSelBillingId] = useState("");
  const [billMitraSaving, setBillMitraSaving] = useState(false);
  const [billMitraTesting, setBillMitraTesting] = useState(false);
  const [billMitraSyncing, setBillMitraSyncing] = useState(false);
  const [billMitraTestResult, setBillMitraTestResult] = useState<any | null>(null);

  const { data: billingMitras, refetch: refetchBillingMitras } = useQuery<any>({
    queryKey: ["/api/billing/mitras"],
    queryFn: () => api.get<any>("/billing/mitras"),
    enabled: isSystemAdmin,
    staleTime: 30_000,
  });
  const billingMitraList: any[] = billingMitras?.mitras ?? [];

  // When a mitra is picked, prefill its current billing_id
  useEffect(() => {
    if (!selBillingMitra) { setSelBillingId(""); setBillMitraTestResult(null); return; }
    const m = billingMitraList.find((x) => String(x.mitraId) === selBillingMitra);
    setSelBillingId(m?.billingId ?? "");
    setBillMitraTestResult(null);
  }, [selBillingMitra, billingMitras]);

  const handleSaveBillingMitra = async () => {
    if (!selBillingMitra) return;
    setBillMitraSaving(true);
    try {
      await api.put(`/billing/mitras/${selBillingMitra}`, { billingId: selBillingId.trim() || null });
      toast.success("Billing ID tersimpan");
      refetchBillingMitras();
    } catch (err: any) { toast.error(`Gagal menyimpan: ${err.message}`); }
    finally { setBillMitraSaving(false); }
  };

  const handleTestBillingMitra = async () => {
    if (!selBillingMitra) return;
    setBillMitraTesting(true);
    setBillMitraTestResult(null);
    try {
      const result: any = await api.post(`/billing/mitras/${selBillingMitra}/test`, { billingId: selBillingId.trim() });
      setBillMitraTestResult(result);
      if (result?.ok) toast.success(`Berhasil - ${result.totalFound} pelanggan ditemukan`);
      else toast.warning("Reseller ID ini tidak mengembalikan pelanggan");
    } catch (err: any) { toast.error(err.message ?? "Test gagal"); }
    finally { setBillMitraTesting(false); }
  };

  const handleSyncBillingMitra = async () => {
    if (!selBillingMitra) return;
    setBillMitraSyncing(true);
    try {
      const result: any = await api.post(`/billing/mitras/${selBillingMitra}/sync`, {});
      toast.success(`Sync selesai - ${result?.updated ?? 0} updated, ${result?.created ?? 0} created`, {
        description: `Total ${result?.total ?? 0} · error ${result?.errors ?? 0}`,
      });
      refetchBillingMitras();
    } catch (err: any) { toast.error(`Sync gagal: ${err.message}`); }
    finally { setBillMitraSyncing(false); }
  };

  // ---------------------------------------------------------------------------
  // Collections engine-mode (collections → pipeline cutover)
  // ---------------------------------------------------------------------------
  const { data: engineMode } = useCollectionsEngineMode();
  const { data: pipelinesList } = usePipelines();
  const setEngineMode = useSetCollectionsEngineMode();

  const [colMode, setColMode] = useState<CollectionsEngineMode>("legacy");
  const [colPipelineId, setColPipelineId] = useState<string>("");
  const [colModeInited, setColModeInited] = useState(false);

  useEffect(() => {
    if (engineMode && !colModeInited) {
      setColMode(engineMode.mode);
      setColPipelineId(engineMode.pipelineId != null ? String(engineMode.pipelineId) : "");
      setColModeInited(true);
    }
  }, [engineMode, colModeInited]);

  const colPipelineMissing = colMode === "pipeline" && !colPipelineId;

  const handleSaveEngineMode = async () => {
    if (colPipelineMissing) {
      toast.error("Pilih pipeline tujuan dulu untuk mode Pipeline.");
      return;
    }
    try {
      await setEngineMode.mutateAsync({
        mode: colMode,
        pipelineId: colMode === "pipeline" ? Number(colPipelineId) : null,
      });
      toast.success(
        colMode === "pipeline"
          ? "Collections kini dikelola di pipeline."
          : "Collections kembali ke mode Legacy.",
      );
    } catch (err: any) {
      toast.error(`Gagal menyimpan: ${err.message}`);
    }
  };

  // ---------------------------------------------------------------------------
  // Export/Import local state
  // ---------------------------------------------------------------------------
  const [exportFormat, setExportFormat] = useState("csv");
  const [exportAutoBackup, setExportAutoBackup] = useState(false);
  const [exportBackupInterval, setExportBackupInterval] = useState("7");
  const [exportSaving, setExportSaving] = useState(false);

  useEffect(() => {
    if (allSettings) {
      setExportFormat(
        getSettingValue(allSettings, "export_default_format", "csv")
      );
      setExportAutoBackup(
        getSettingValue(allSettings, "export_auto_backup", "false") === "true"
      );
      setExportBackupInterval(
        getSettingValue(allSettings, "export_backup_interval", "7")
      );
    }
  }, [allSettings]);

  const handleSaveExport = async () => {
    setExportSaving(true);
    try {
      await saveBulkMutation.mutateAsync([
        {
          key: "export_default_format",
          value: exportFormat,
          category: "export",
          label: "Default Format",
        },
        {
          key: "export_auto_backup",
          value: exportAutoBackup ? "true" : "false",
          category: "export",
          label: "Auto-Backup",
        },
        {
          key: "export_backup_interval",
          value: exportBackupInterval,
          category: "export",
          label: "Backup Interval (hari)",
        },
      ]);
      toast.success("Pengaturan export berhasil disimpan.");
    } catch (err: any) {
      toast.error(`Gagal menyimpan: ${err.message}`);
    } finally {
      setExportSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // -- A2: ringkasan System Health - gabungan sinyal live yang sudah dihitung di halaman ini --
  const healthItems: Array<{ label: string; status: "ok" | "warn" | "down" | "off"; detail: string }> = [
    {
      label: "GenieACS",
      status: genieLiveStatus?.connected ? "ok" : genieLiveStatus?.configured ? "down" : "off",
      detail: genieLiveStatus?.connected
        ? `${genieLiveStatus.total ?? 0} perangkat`
        : genieLiveStatus?.configured
          ? (genieLiveStatus.error || "Tidak terhubung")
          : "Belum dikonfigurasi",
    },
    {
      label: "MikroTik",
      status: routers.length === 0 ? "off" : mtLiveStatus?.connected ? "ok" : "down",
      detail: routers.length === 0 ? "Belum ada router" : mtLiveStatus?.connected ? `${routers.length} router aktif` : "Tidak terhubung",
    },
    {
      label: "WhatsApp (MPWA)",
      status: !mpwaStatus?.configured ? "off" : mpwaStatus?.deviceStatus === "connected" ? "ok" : "warn",
      detail: !mpwaStatus?.configured ? "Belum dikonfigurasi" : mpwaStatus?.deviceStatus === "connected" ? "Device terhubung" : (mpwaStatus?.deviceStatus ? `Device: ${mpwaStatus.deviceStatus}` : "Aktif"),
    },
    {
      label: "Billing Sync",
      status: !billHealth ? "off" : (billHealth.drift ?? 0) > 0 ? "warn" : "ok",
      detail: !billHealth ? "-" : `drift ${billHealth.drift ?? 0} · stale ${billHealth.staleSyncCount ?? 0}`,
    },
  ];
  const healthTone: Record<"ok" | "warn" | "down" | "off", { dot: string; text: string }> = {
    ok:   { dot: "bg-green-500", text: "text-green-600 dark:text-green-400" },
    warn: { dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
    down: { dot: "bg-red-500",   text: "text-red-600 dark:text-red-400" },
    off:  { dot: "bg-muted-foreground/50", text: "text-muted-foreground" },
  };
  const healthDownCount = healthItems.filter((h) => h.status === "down").length;
  const healthWarnCount = healthItems.filter((h) => h.status === "warn").length;

  return (
    <div className="space-y-6">
      {/* ================================================================= */}
      {/* Header                                                            */}
      {/* ================================================================= */}
      <div className="flex items-center gap-3">
        {activeSection ? (
          <>
            <button type="button" onClick={() => navigate("/integrations")} aria-label="Kembali ke Integrasi"
              className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center hover:bg-muted/70 shrink-0">
              <ChevronLeft className="h-5 w-5 text-foreground" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <button type="button" onClick={() => navigate("/integrations")} className="hover:text-foreground">Integrasi</button>
                <span>/</span>
                <span className="text-foreground font-medium truncate">{activeSection.label}</span>
              </div>
              <h1 className="text-xl font-bold text-foreground truncate">{activeSection.label}</h1>
              <p className="text-sm text-muted-foreground truncate">{activeSection.desc}</p>
            </div>
          </>
        ) : (
          <>
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Link2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Integrasi API</h1>
              <p className="text-sm text-muted-foreground">
                Pilih integrasi untuk diatur - tiap aplikasi punya menu sendiri.
              </p>
            </div>
          </>
        )}
      </div>

      {/* Hub (tanpa :cat): ringkasan + kartu tiap integrasi. Detail (/integrations/:cat):
          hanya section yang cocok yang tampil (via show(cat)). */}
      {isHub && (<>
      {/* ================================================================= */}
      {/* A2 - System Health (ringkasan status semua integrasi inti)        */}
      {/* ================================================================= */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> System Health
            </h3>
            {healthDownCount > 0 ? (
              <Badge className="bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300">
                <XCircle className="h-3 w-3 mr-1" />{healthDownCount} bermasalah
              </Badge>
            ) : healthWarnCount > 0 ? (
              <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300">
                <AlertTriangle className="h-3 w-3 mr-1" />{healthWarnCount} perlu perhatian
              </Badge>
            ) : (
              <Badge className="bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-300">
                <CheckCircle2 className="h-3 w-3 mr-1" />Semua sehat
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {healthItems.map((it) => (
              <div key={it.label} className="flex items-start gap-2 rounded-lg border p-3">
                <span className={`mt-1 inline-block h-2.5 w-2.5 rounded-full shrink-0 ${healthTone[it.status].dot}`} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">{it.label}</p>
                  <p className={`text-[11px] truncate ${healthTone[it.status].text}`}>{it.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <DevDbSyncCard />

      {/* Pembaruan Aplikasi - cek versi GitHub + update sekali klik (admin) */}
      <AppUpdateCard />

      {/* Kartu tiap integrasi - klik menuju halaman menu-nya sendiri (/integrations/:key) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {INTEGRATION_SECTIONS.map((sec) => (
          <button key={sec.key} type="button" onClick={() => navigate(`/integrations/${sec.key}`)}
            className="group flex items-start gap-3.5 rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/40 hover:shadow-elev-md">
            <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${sec.accent}`}>
              <sec.icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 text-sm font-bold">
                {sec.label}
                <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{sec.desc}</span>
            </span>
          </button>
        ))}
      </div>
      </>)}

      {/* ================================================================= */}
      {/* Card 1 - Google Maps Platform                                     */}
      {/* ================================================================= */}
      {show("maps") && (
      <Card>
        <CardContent className="p-6 space-y-5">
          {/* Header row */}
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Map className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">
                  Google Maps Platform
                </h3>
                <p className="text-xs text-muted-foreground">
                  Maps JavaScript API, Places API, Geocoding API
                </p>
              </div>
            </div>
            <IntegrationStatusBadge status={gmapsConnected ? "connected" : "config"} />
          </div>

          {/* Form fields */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="gmaps-api-key">API Key</Label>
              <PasswordInput
                id="gmaps-api-key"
                value={gmapsApiKey}
                onChange={setGmapsApiKey}

              />
                <p className="text-[11px] text-muted-foreground leading-snug mt-1">
                  Default memakai API Google Maps milik <strong>JABNET</strong> (sudah disediakan). Isi kolom ini dengan API key milik Anda sendiri untuk memakai kuota Anda. <strong>Kosongkan</strong> kolom lalu simpan untuk kembali memakai API JABNET.
                </p>
                <span className={`inline-flex items-center gap-1 text-[10px] font-medium mt-1 px-2 py-0.5 rounded-full ${(gmapsApiKey ?? "").trim() ? "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300" : "bg-muted text-muted-foreground"}`}>
                  {(gmapsApiKey ?? "").trim() ? "Memakai API key Anda sendiri" : "Sedang memakai: API JABNET (default)"}
                </span>
            </div>

            <div className="space-y-2">
              <Label>Libraries</Label>
              <div className="flex gap-1.5">
                <Badge variant="secondary" className="text-xs">
                  places
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  geometry
                </Badge>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Fitur yang digunakan</Label>
              <FeatureBadges
                items={["Maps JS API", "Places API", "Geocoding API"]}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={handleSaveGmaps}
              disabled={gmapsSaving || settingsLoading}
            >
              {gmapsSaving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              Simpan
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                window.open(
                  "https://console.cloud.google.com/apis/dashboard",
                  "_blank"
                )
              }
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              Google Cloud Console
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleGuide("gmaps")}
            >
              <BookOpen className="h-4 w-4 mr-1" />
              {expandedGuides.gmaps ? "Tutup Panduan" : "Panduan Setup"}
            </Button>
          </div>

          {/* Guide */}
          {expandedGuides.gmaps && (
            <div className="space-y-3 pt-3 border-t">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                Panduan Setup
              </h4>
              <div className="space-y-2.5">
                <GuideStep
                  step={1}
                  text="Buka Google Cloud Console -> APIs & Services."
                />
                <GuideStep
                  step={2}
                  text="Aktifkan Maps JavaScript API, Places API, Geocoding API."
                />
                <GuideStep
                  step={3}
                  text="Buat API Key baru -> Batasi key ke domain aplikasi untuk keamanan."
                />
                <GuideStep
                  step={4}
                  text="Paste API Key di form di atas."
                />
                <GuideStep
                  step={5}
                  text="Klik Simpan -> Restart server untuk menerapkan perubahan."
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* ================================================================= */}
      {/* Card 2 - MikroTik RouterOS                                        */}
      {/* ================================================================= */}
      {show("mikrotik") && (
      <Card>
        <CardContent className="p-6 space-y-5">
          {/* Header row */}
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <Router className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">
                  MikroTik RouterOS
                </h3>
                <p className="text-xs text-muted-foreground">
                  RouterOS API (Binary) &mdash; {routers.length} router
                  terdaftar
                </p>
              </div>
            </div>
            <IntegrationStatusBadge status={mikrotikStatus} />
          </div>

          {/* Connected routers list */}
          {routers.length > 0 && (
            <div className="space-y-2">
              <Label>Router Terdaftar</Label>
              <div className="border rounded-lg divide-y overflow-hidden">
                {routers.map((r) => {
                  const isOnline =
                    r.isActive &&
                    r.lastSeen &&
                    Date.now() - new Date(r.lastSeen).getTime() <
                      10 * 60 * 1000;
                  return (
                    <div
                      key={r.id}
                      className="flex items-center justify-between px-3 py-2.5 text-sm hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`flex-shrink-0 w-2 h-2 rounded-full ${isOnline ? "bg-green-500" : "bg-red-400"}`}
                        />
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">
                            {r.name}
                          </p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {r.host}
                            {r.port ? `:${r.port}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge
                          variant="secondary"
                          className={`text-xs ${isOnline ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}
                        >
                          {isOnline ? "Online" : "Offline"}
                        </Badge>
                        {r.lastSeen && (
                          <span className="text-xs text-muted-foreground hidden sm:inline">
                            {new Date(r.lastSeen).toLocaleString("id-ID")}
                          </span>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={testingRouterId === r.id}
                          onClick={() => handleTestRouter(r)}
                        >
                          {testingRouterId === r.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <TestTube className="h-3 w-3 mr-1" />
                          )}
                          Test Koneksi
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {routers.length === 0 && (
            <div className="border rounded-lg p-4 text-center text-sm text-muted-foreground bg-muted/20">
              Belum ada router MikroTik. Tambahkan melalui halaman Billing
              &rarr; Router MikroTik.
            </div>
          )}

          {/* Default settings */}
          <div className="space-y-4">
            <Label className="text-sm font-semibold">
              Pengaturan Default
            </Label>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="mt-port">Default API Port</Label>
                <Input
                  id="mt-port"
                  type="number"
                  value={mtDefaultPort}
                  onChange={(e) => setMtDefaultPort(e.target.value)}

                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mt-timeout">Default Timeout (detik)</Label>
                <Input
                  id="mt-timeout"
                  type="number"
                  value={mtTimeout}
                  onChange={(e) => setMtTimeout(e.target.value)}

                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ToggleSwitch checked={mtAutoSync} onChange={setMtAutoSync} />
              <Label className="cursor-pointer" onClick={() => setMtAutoSync(!mtAutoSync)}>
                Auto-sync PPPoE saat data pelanggan berubah
              </Label>
            </div>
          </div>

          {/* Fitur tersedia */}
          <div className="space-y-2">
            <Label>Fitur Tersedia</Label>
            <FeatureBadges
              items={[
                "PPP Secret CRUD",
                "PPP Profile CRUD",
                "Active Sessions",
                "System Resource",
                "Interface Monitoring",
                "Simple Queue",
                "DHCP",
                "ARP",
                "Logs",
              ]}
            />
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={handleSaveMikrotik}
              disabled={mtSaving || settingsLoading}
            >
              {mtSaving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              Simpan Pengaturan
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                window.location.href = "/billing/routers";
              }}
            >
              Kelola Router
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleGuide("mikrotik")}
            >
              <BookOpen className="h-4 w-4 mr-1" />
              {expandedGuides.mikrotik ? "Tutup Panduan" : "Panduan Setup"}
            </Button>
          </div>

          {/* Guide */}
          {expandedGuides.mikrotik && (
            <div className="space-y-3 pt-3 border-t">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                Panduan Setup
              </h4>
              <div className="space-y-2.5">
                <GuideStep
                  step={1}
                  text="Di MikroTik WinBox: System -> Users -> buat user baru khusus API (group: full)."
                />
                <GuideStep
                  step={2}
                  text="IP -> Services -> aktifkan api (port 8728) atau api-ssl (port 8729)."
                />
                <GuideStep
                  step={3}
                  text="Pastikan firewall mengizinkan port API dari IP server FTTH Tools."
                />
                <GuideStep
                  step={4}
                  text="Di FTTH Tools: Billing -> Router MikroTik -> Tambah Router."
                />
                <GuideStep
                  step={5}
                  text="Test koneksi -> jika berhasil, semua fitur otomatis aktif."
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* ================================================================= */}
      {/* Card 2b - GenieACS TR-069                                         */}
      {/* ================================================================= */}
      {show("acs") && (
      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center">
                <Cpu className="h-5 w-5 text-teal-600" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">GenieACS TR-069</h3>
                <p className="text-xs text-muted-foreground">Auto Configuration Server</p>
              </div>
            </div>
            {genieLiveStatus?.connected ? (
              <Badge className="bg-green-100 text-green-800 border-green-200">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Terhubung{typeof genieLiveStatus.total === "number" ? ` · ${genieLiveStatus.total} perangkat` : ""}
              </Badge>
            ) : genieLiveStatus?.configured ? (
              <Badge className="bg-red-100 text-red-800 border-red-200"><XCircle className="h-3 w-3 mr-1" />Tidak Aktif</Badge>
            ) : (
              <Badge variant="outline" className="text-amber-600 border-amber-200"><AlertTriangle className="h-3 w-3 mr-1" />Belum Dikonfigurasi</Badge>
            )}
          </div>

          <p className="text-sm text-muted-foreground">Manajemen perangkat CPE/ONT via protokol TR-069. Bridge ke billing via PPPoE username.</p>

          {/* Sebab disconnect ditampilkan apa adanya (mis. salah port / auth) - bukan badge merah tanpa info. */}
          {!genieLiveStatus?.connected && genieLiveStatus?.configured && genieLiveStatus?.error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 p-3 text-xs text-red-700 dark:text-red-400">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{genieLiveStatus.error}</span>
            </div>
          )}

          <div className="grid gap-3">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Host</Label>
              <Input

                value={genieHost}
                onChange={(e) => setGenieHost(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Port</Label>
                <Input

                  value={geniePort}
                  onChange={(e) => setGeniePort(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Username</Label>
                <Input

                  value={genieUser}
                  onChange={(e) => setGenieUser(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Password</Label>
                <Input
                  type="password"

                  value={geniePass}
                  onChange={(e) => setGeniePass(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Threshold RX Warning (dBm)</Label>
                <Input
                  type="number"
                  step="0.5"
                  placeholder="-25"
                  value={opticalWarn}
                  onChange={(e) => setOpticalWarn(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Threshold RX Critical (dBm)</Label>
                <Input
                  type="number"
                  step="0.5"
                  placeholder="-28"
                  value={opticalCrit}
                  onChange={(e) => setOpticalCrit(e.target.value)}
                />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Threshold optical power dipakai indikator warna (hijau/kuning/merah) di panel ODP map. Kosongkan untuk default (-25 / -28).
            </p>
          </div>

          <div className="flex gap-2 flex-wrap text-xs">
            <Badge variant="outline">Device Management</Badge>
            <Badge variant="outline">PPPoE Bridge</Badge>
            <Badge variant="outline">Signal Monitoring</Badge>
            <Badge variant="outline">WiFi Config</Badge>
            <Badge variant="outline">Tag Management</Badge>
            <Badge variant="outline">Reboot/Summon</Badge>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={async () => {
                if (!genieHost) { toast.error("Host wajib diisi"); return; }
                try {
                  await api.put("/settings/bulk", { settings: [
                    { key: "genieacs_host", value: genieHost, category: "genieacs", label: "GenieACS Host" },
                    { key: "genieacs_port", value: geniePort || "7557", category: "genieacs", label: "GenieACS Port" },
                    { key: "genieacs_username", value: genieUser, category: "genieacs", label: "GenieACS Username" },
                    { key: "genieacs_password", value: geniePass, category: "genieacs", label: "GenieACS Password" },
                    { key: "optical_rx_warn", value: opticalWarn, category: "genieacs", label: "Optical RX warning (dBm)" },
                    { key: "optical_rx_crit", value: opticalCrit, category: "genieacs", label: "Optical RX critical (dBm)" },
                  ]});
                  toast.success("Konfigurasi GenieACS disimpan");
                  queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/genieacs/live-check"] });
                } catch (e: any) { toast.error(e.message || "Gagal menyimpan"); }
              }}
            >
              <Save className="h-3.5 w-3.5 mr-1" /> Simpan
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                if (!genieHost) { toast.error("Host wajib diisi"); return; }
                try {
                  const r: any = await api.post("/genieacs/test", { host: genieHost, port: Number(geniePort) || 7557, username: genieUser, password: geniePass });
                  toast.success(`Koneksi GenieACS berhasil - ${r?.deviceCount ?? 0} perangkat (${r?.online ?? 0} online).`);
                  queryClient.invalidateQueries({ queryKey: ["/api/genieacs/live-check"] });
                } catch (e: any) { toast.error(e.message || "Koneksi gagal"); }
              }}
            >
              Test Koneksi
            </Button>
            <Button size="sm" variant="outline-primary" onClick={() => window.location.href = "/devices"}>
              Buka Perangkat ONT →
            </Button>
          </div>
        </CardContent>
      </Card>
      )}

      {/* ================================================================= */}
      {/* Card - Billing Sync (billing.jabnet.id) - JABNET-root only        */}
      {/* ================================================================= */}
      {isSystemAdmin && show("billing") && (
      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                <Database className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Billing Sync</h3>
                <p className="text-xs text-muted-foreground">
                  Tarik data pelanggan dari <code className="font-mono">billing.jabnet.id</code> &amp; auto-kelola isolir/tagihan
                </p>
              </div>
            </div>
            {!billEnabled ? (
              <Badge variant="outline" className="text-amber-600 border-amber-200">
                <AlertTriangle className="h-3 w-3 mr-1" />Dinonaktifkan
              </Badge>
            ) : billStatus?.stale ? (
              <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300">
                <AlertTriangle className="h-3 w-3 mr-1" />Stale ({billStatus?.staleMinutes ?? "?"} mnt)
              </Badge>
            ) : billStatus?.lastStatus === "success" ? (
              <Badge className="bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-300">
                <CheckCircle2 className="h-3 w-3 mr-1" />Terhubung
              </Badge>
            ) : billStatus?.lastStatus === "error" ? (
              <Badge className="bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300">
                <XCircle className="h-3 w-3 mr-1" />Error
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />Memuat...
              </Badge>
            )}
          </div>

          {/* Sync health stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Pelanggan</div>
              <div className="text-lg font-bold tabular-nums mt-0.5">{billHealth?.customersTotal ?? "-"}</div>
            </div>
            <div className="rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/60 dark:border-amber-900/60 p-3">
              <div className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400 font-semibold">Isolir</div>
              <div className="text-lg font-bold tabular-nums text-amber-700 dark:text-amber-300 mt-0.5">{billHealth?.isolirCount ?? "-"}</div>
            </div>
            <div className="rounded-lg border bg-rose-50/50 dark:bg-rose-950/20 border-rose-200/60 dark:border-rose-900/60 p-3">
              <div className="text-[10px] uppercase tracking-wider text-rose-700 dark:text-rose-400 font-semibold">Open Collection</div>
              <div className="text-lg font-bold tabular-nums text-rose-700 dark:text-rose-300 mt-0.5">{billHealth?.openCollectionsCount ?? "-"}</div>
            </div>
            <div className={`rounded-lg border p-3 ${
              (billHealth?.drift ?? 0) > 0
                ? "bg-red-50/60 dark:bg-red-950/20 border-red-200/70 dark:border-red-900/60"
                : "bg-green-50/50 dark:bg-green-950/20 border-green-200/60 dark:border-green-900/60"
            }`}>
              <div className={`text-[10px] uppercase tracking-wider font-semibold ${
                (billHealth?.drift ?? 0) > 0 ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400"
              }`}>Drift</div>
              <div className={`text-lg font-bold tabular-nums mt-0.5 ${
                (billHealth?.drift ?? 0) > 0 ? "text-red-700 dark:text-red-300" : "text-green-700 dark:text-green-300"
              }`}>{billHealth?.drift ?? "-"}</div>
            </div>
          </div>

          {/* Last sync info */}
          {billStatus?.lastSuccessAt && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Activity className="h-3.5 w-3.5" />
              <span>
                Sync terakhir:{" "}
                <span className="font-mono-tight text-foreground">
                  {new Date(billStatus.lastSuccessAt).toLocaleString("id-ID")}
                </span>
                {billStatus?.currentIntervalSec && (
                  <> · interval aktif: <span className="font-mono-tight">{billStatus.currentIntervalSec}s</span></>
                )}
              </span>
            </div>
          )}

          {billStatus?.lastError && billStatus?.lastStatus === "error" && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/5 border border-destructive/20 text-xs">
              <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="font-semibold text-destructive">Error terakhir</div>
                <div className="text-muted-foreground line-clamp-2">{billStatus.lastError}</div>
              </div>
            </div>
          )}

          {/* -- Billing config: JABNET-root manages every mitra's billing_id -- */}
          {!isSystemAdmin ? null : (
          <section id="billing-mitra-admin" className="rounded-lg border bg-gradient-to-br from-sky-50/60 to-blue-50/40 dark:from-sky-950/20 dark:to-blue-950/10 border-sky-200/60 dark:border-sky-900/40 p-4 space-y-3">
            <header className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-sky-500/15 flex items-center justify-center">
                <Building2 className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              </span>
              <div>
                <h3 className="text-sm font-semibold">Billing Sync - Kelola per Mitra</h3>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Pilih mitra lalu atur Billing ID (reseller_id) billing.jabnet.id. Hanya JABNET yang bisa mengatur ini.
                </p>
              </div>
            </header>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Mitra</Label>
              <Combobox
                options={billingMitraList.map((m) => ({
                  value: String(m.mitraId),
                  label: `${m.name}${m.isJabnet ? " (root)" : ""}`,
                  description: m.isJabnet ? "Billing root · reseller_id 12" : `Billing ID: ${m.billingId || "-"} · ${m.customerCount} pelanggan`,
                }))}
                value={selBillingMitra}
                onChange={setSelBillingMitra}
                searchPlaceholder="Cari mitra..."
              />
            </div>

            {selBillingMitra && billingMitraList.find((x) => String(x.mitraId) === selBillingMitra)?.isJabnet ? (
              <div className="rounded-lg border border-info/30 bg-info/5 p-3 text-[11px] text-muted-foreground">
                JABNET adalah billing provider root - memakai <strong>reseller_id = 12</strong> dengan token dari server <code className="font-mono">.env</code>. Tidak ada yang perlu diatur di sini.
              </div>
            ) : selBillingMitra ? (
              <>
                <div className="space-y-1.5 max-w-xs">
                  <Label htmlFor="bill-mitra-id" className="text-xs font-medium">Billing ID <span className="text-destructive">*</span></Label>
                  <Input id="bill-mitra-id" inputMode="numeric" value={selBillingId} onChange={(e) => setSelBillingId(e.target.value)} placeholder="mis. 27" />
                  <p className="text-[11px] text-muted-foreground"><code className="font-mono">kode_reseller</code> di billing.jabnet.id</p>
                </div>

                {billMitraTestResult && (
                  <div className={`rounded-md border p-3 text-xs ${billMitraTestResult.ok ? "bg-green-50/60 dark:bg-green-950/20 border-green-200/60" : "bg-amber-50/60 dark:bg-amber-950/20 border-amber-200/60"}`}>
                    <div className="flex items-center gap-2 font-semibold">
                      {billMitraTestResult.ok ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
                      {billMitraTestResult.ok ? `${billMitraTestResult.totalFound} pelanggan ditemukan` : "Tidak ada pelanggan"}
                      <span className="text-muted-foreground font-normal">· {billMitraTestResult.elapsedMs}ms</span>
                    </div>
                    {Array.isArray(billMitraTestResult.sample) && billMitraTestResult.sample.length > 0 && (
                      <ul className="mt-1 space-y-0.5 font-mono-tight text-[11px]">
                        {billMitraTestResult.sample.map((s: any) => (
                          <li key={s.customer_id}>{s.customer_id} · {s.nama} · {s.paket}{s.is_isolir ? <span className="ml-1 text-amber-600">[isolir]</span> : null}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" onClick={handleSaveBillingMitra} disabled={billMitraSaving}>
                    {billMitraSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}Konfirmasi
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleTestBillingMitra} disabled={billMitraTesting}>
                    {billMitraTesting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <TestTube className="h-4 w-4 mr-1" />}Test
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleSyncBillingMitra} disabled={billMitraSyncing}>
                    {billMitraSyncing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}Tarik Pelanggan
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground">Pilih mitra untuk mulai.</p>
            )}
          </section>
          )}


          {/* Enable toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div className="min-w-0">
              <div className="text-sm font-semibold">Aktifkan Auto-sync</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Worker akan polling billing.jabnet.id sesuai interval di bawah.
              </div>
            </div>
            <ToggleSwitch checked={billEnabled} onChange={setBillEnabled} />
          </div>

          {/* Interval config */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Interval Peak (detik)</Label>
              <Input
                type="number"
                min={30}
                value={billPeakSec}
                onChange={(e) => setBillPeakSec(e.target.value)}

              />
              <p className="text-[11px] text-muted-foreground">Min 30 detik. Aktif di jam sibuk.</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Interval Off-peak (detik)</Label>
              <Input
                type="number"
                min={60}
                value={billOffSec}
                onChange={(e) => setBillOffSec(e.target.value)}

              />
              <p className="text-[11px] text-muted-foreground">Min 60 detik. Aktif di luar jam sibuk.</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Peak Start (jam)</Label>
              <Input
                type="number"
                min={0}
                max={23}
                value={billPeakStart}
                onChange={(e) => setBillPeakStart(e.target.value)}

              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Peak End (jam)</Label>
              <Input
                type="number"
                min={0}
                max={23}
                value={billPeakEnd}
                onChange={(e) => setBillPeakEnd(e.target.value)}

              />
            </div>
          </div>

          {/* Feature tags */}
          <div className="flex gap-2 flex-wrap text-xs">
            <Badge variant="outline">Auto-isolir</Badge>
            <Badge variant="outline">Auto-buka Collection</Badge>
            <Badge variant="outline">Manual Override Lock</Badge>
            <Badge variant="outline">Reconciliation</Badge>
            <Badge variant="outline">Smart Interval</Badge>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 items-center">
            <Button size="sm" onClick={handleSaveBilling} disabled={billSaving || settingsLoading}>
              {billSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              Simpan
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSyncNow}
              disabled={billSyncing || !billEnabled}
            >
              {billSyncing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Sync Sekarang
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleReconcile}
              disabled={billReconciling}
              title="Cek & perbaiki mismatch antara isolir vs collection"
            >
              {billReconciling ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <AlertTriangle className="h-4 w-4 mr-1" />}
              Reconcile
            </Button>
            <Button size="sm" variant="outline-primary" onClick={() => (window.location.href = "/customers")}>
              Buka Pelanggan
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1.5">
            <p className="font-semibold text-foreground">Cara kerja singkat:</p>
            <ul className="space-y-1 text-muted-foreground list-disc ml-4">
              <li>Worker polling <code className="font-mono">billing.jabnet.id</code> setiap 60s di jam sibuk, 600s di luar.</li>
              <li>Field billing-critical (isolir, tagihan, jatuh tempo) selalu sync ke FTTH Tools.</li>
              <li>Field info (alamat, telepon) respect <em>manual override lock</em> per pelanggan.</li>
              <li>Reconcile otomatis tiap cycle + manual trigger untuk perbaiki drift.</li>
            </ul>
          </div>
        </CardContent>
      </Card>
      )}

      {/* ================================================================= */}
      {/* Card - Migrasi Collections ke Pipeline                            */}
      {/* ================================================================= */}
      {show("billing") && (
      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
                <Activity className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">
                  Migrasi Collections ke Pipeline
                </h3>
                <p className="text-xs text-muted-foreground">
                  Pindahkan penagihan ke engine pipeline (reversible)
                </p>
              </div>
            </div>
            <Badge
              className={
                engineMode?.mode === "pipeline"
                  ? "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400 border-violet-200 dark:border-violet-800"
                  : "bg-muted text-muted-foreground"
              }
            >
              {engineMode?.mode === "pipeline" ? "Mode: Pipeline" : "Mode: Legacy"}
            </Badge>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="col-mode">Engine Mode</Label>
              <Select
                value={colMode}
                onValueChange={(v) => setColMode(v as CollectionsEngineMode)}
              >
                <SelectTrigger id="col-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="legacy">Legacy (board collection lama)</SelectItem>
                  <SelectItem value="pipeline">Pipeline</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="col-pipeline">Pipeline Tujuan</Label>
              <Select
                value={colPipelineId}
                onValueChange={setColPipelineId}
                disabled={colMode !== "pipeline"}
              >
                <SelectTrigger id="col-pipeline">
                  <SelectValue placeholder="Pilih pipeline…" />
                </SelectTrigger>
                <SelectContent>
                  {(pipelinesList ?? []).map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {colPipelineMissing && (
                <p className="text-[11px] text-destructive">
                  Pilih pipeline tujuan untuk mode Pipeline.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1.5">
            <p className="font-semibold text-foreground">Catatan:</p>
            <ul className="space-y-1 text-muted-foreground list-disc ml-4">
              <li>
                <strong>Prasyarat:</strong> pipeline tujuan harus punya rule{" "}
                <code className="font-mono bg-muted px-1 rounded">billing_sync</code> agar
                penagihan otomatis berjalan.
              </li>
              <li>Mode Pipeline mengalihkan halaman <code className="font-mono">/collections</code> ke board pipeline tujuan.</li>
              <li><strong>Rollback:</strong> cukup pilih kembali <strong>Legacy</strong> - auto-open & reconcile lama langsung aktif lagi.</li>
            </ul>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={handleSaveEngineMode}
              disabled={setEngineMode.isPending || colPipelineMissing}
            >
              {setEngineMode.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              Simpan
            </Button>
          </div>
        </CardContent>
      </Card>
      )}

      {/* ================================================================= */}
      {/* Card - MPWA (WhatsApp Gateway)                                    */}
      {/* ================================================================= */}
      {show("whatsapp") && (
      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <MessageCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">MPWA WhatsApp Gateway</h3>
                <p className="text-xs text-muted-foreground">Kirim OTP, notifikasi billing, broadcast via WhatsApp</p>
              </div>
            </div>
            {mpwaStatus?.deviceStatus?.connected ? (
              <Badge className="bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-300">
                <CheckCircle2 className="h-3 w-3 mr-1" />Device Online
              </Badge>
            ) : mpwaStatus?.configured ? (
              <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300">
                <AlertTriangle className="h-3 w-3 mr-1" />Device Offline
              </Badge>
            ) : (
              <Badge variant="outline" className="text-amber-600 border-amber-200">
                <AlertTriangle className="h-3 w-3 mr-1" />Belum Dikonfigurasi
              </Badge>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            Gateway API untuk kirim WhatsApp via device bot. Wajib aktif supaya OTP portal pelanggan terkirim,
            notifikasi tagihan, dan broadcast announcement jalan.
          </p>

          {/* Enable toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div className="min-w-0">
              <div className="text-sm font-semibold">Aktifkan MPWA Gateway</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Saat nonaktif, OTP akan di-log ke console (mode dev).
              </div>
            </div>
            <ToggleSwitch checked={mpwaEnabled} onChange={setMpwaEnabled} />
          </div>

          <div className="grid gap-3">
            <div className="space-y-2">
              <Label className="text-xs font-medium">MPWA URL (Base API)</Label>
              <Input

                value={mpwaUrl}
                onChange={(e) => setMpwaUrl(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Base URL MPWA server, biasanya <code className="font-mono">https://mpwa.jabnet.id</code>
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">API Token / API Key</Label>
              <div className="relative">
                <Input
                  type={mpwaShowToken ? "text" : "password"}

                  value={mpwaToken}
                  onChange={(e) => setMpwaToken(e.target.value)}
                  className="pr-10 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setMpwaShowToken(!mpwaShowToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={mpwaShowToken ? "Sembunyikan" : "Tampilkan"}
                >
                  {mpwaShowToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Token otentikasi untuk hit API MPWA. Rahasia - jangan share.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">Nomor Pengirim (Device WhatsApp)</Label>
              <Input

                value={mpwaSenderNumber}
                onChange={(e) => setMpwaSenderNumber(e.target.value)}
                className="font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                Nomor WhatsApp device yang sudah terdaftar di MPWA, format <code className="font-mono">62xxx</code> (tanpa +).
              </p>
            </div>

            {/* v4.2.19: Native button endpoint (opsional, override default /public/send-button) */}
            <div className="space-y-2 md:col-span-2">
              <Label className="text-xs font-medium">Native Button Endpoint <span className="text-muted-foreground">(opsional override)</span></Label>
              <Input

                value={mpwaButtonEndpoint}
                onChange={(e) => setMpwaButtonEndpoint(e.target.value)}
                className="font-mono text-xs"
              />
              <div className="text-[11px] text-muted-foreground leading-snug">
                <strong>Default (kosong):</strong> sistem pakai <code className="font-mono bg-muted px-1 rounded">/public/send-button</code> - endpoint resmi MPWA Jabnet.<br />
                Cara kerja: <strong>kalau template punya image attachment, button dikirim sebagai native interactive button di WhatsApp</strong>. Kalau enggak ada image, fallback ke text format.<br />
                <em>Override:</em> isi path lain kalau MPWA Anda pakai endpoint custom (mis. <code className="font-mono">/send-message-button</code>).
              </div>
            </div>
          </div>

          {/* Feature tags */}
          <div className="flex gap-2 flex-wrap text-xs">
            <Badge variant="outline">OTP Portal</Badge>
            <Badge variant="outline">Notifikasi Billing</Badge>
            <Badge variant="outline">Broadcast Pengumuman</Badge>
            <Badge variant="outline">Auto-reply</Badge>
            <Badge variant="outline">Template Variable</Badge>
          </div>

          {/* Last success/error indicators */}
          {(mpwaStatus?.lastSuccess || mpwaStatus?.lastError) && (
            <div className="grid sm:grid-cols-2 gap-2 text-xs">
              {mpwaStatus?.lastSuccess && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-success/5 border border-success/20">
                  <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-semibold text-success">Sukses terakhir</div>
                    <div className="text-muted-foreground font-mono-tight text-[11px] truncate">
                      {new Date(mpwaStatus.lastSuccess).toLocaleString("id-ID")}
                    </div>
                  </div>
                </div>
              )}
              {mpwaStatus?.lastError && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/5 border border-destructive/20">
                  <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-semibold text-destructive">Error terakhir</div>
                    <div className="text-muted-foreground text-[11px] line-clamp-2">
                      {mpwaStatus.lastError}
                    </div>
                    {mpwaStatus.lastErrorAt && (
                      <div className="text-muted-foreground/70 font-mono-tight text-[10px] mt-0.5">
                        {new Date(mpwaStatus.lastErrorAt).toLocaleString("id-ID")}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap items-center">
            <Button
              size="sm"
              onClick={async () => {
                if (!mpwaUrl) { toast.error("URL MPWA wajib diisi"); return; }
                if (mpwaEnabled && !mpwaToken) { toast.error("Token wajib diisi kalau gateway diaktifkan"); return; }
                setMpwaSaving(true);
                try {
                  await api.put("/mpwa/config", {
                    enabled: mpwaEnabled,
                    url: mpwaUrl.trim(),
                    token: mpwaToken.trim(),
                    senderNumber: mpwaSenderNumber.trim(),
                    buttonEndpoint: mpwaButtonEndpoint.trim(),
                  });
                  toast.success("Konfigurasi MPWA disimpan");
                  queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/mpwa/status"] });
                } catch (e: any) {
                  toast.error(e.message || "Gagal menyimpan");
                } finally {
                  setMpwaSaving(false);
                }
              }}
              disabled={mpwaSaving}
            >
              {mpwaSaving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
              Simpan
            </Button>

            {/* Test connection with phone input */}
            <div className="inline-flex items-center gap-1.5 border rounded-md bg-background pl-2">
              <Input

                value={mpwaTestPhone}
                onChange={(e) => setMpwaTestPhone(e.target.value)}
                className="h-8 w-32 sm:w-36 border-0 shadow-none focus-visible:ring-0 font-mono text-xs p-0"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const phone = mpwaTestPhone.trim().replace(/\D/g, "");
                  if (!phone || phone.length < 10) {
                    toast.error("Nomor test minimal 10 digit (format 62xxx)");
                    return;
                  }
                  if (!mpwaStatus?.configured && !mpwaUrl) {
                    toast.error("Simpan konfigurasi dulu sebelum test");
                    return;
                  }
                  setMpwaTesting(true);
                  try {
                    const result: any = await api.post("/mpwa/test", { phone });
                    toast.success(result?.message || `Test pesan terkirim ke ${phone}`);
                    refetchMpwaStatus();
                  } catch (e: any) {
                    toast.error(e.message || "Koneksi gagal");
                  } finally {
                    setMpwaTesting(false);
                  }
                }}
                disabled={mpwaTesting}
                className="h-8 border-0 rounded-l-none border-l"
              >
                {mpwaTesting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                Test
              </Button>
            </div>

            <Button size="sm" variant="outline-primary" onClick={() => window.location.href = "/mpwa"}>
              Buka Template MPWA →
            </Button>
          </div>
        </CardContent>
      </Card>
      )}

      {/* ================================================================= */}
      {/* Card - Telegram Bot                                                */}
      {/* ================================================================= */}
      {show("telegram") && (
      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center">
                <Bot className="h-5 w-5 text-sky-600 dark:text-sky-400" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Telegram Bot</h3>
                <p className="text-xs text-muted-foreground">
                  Push notifikasi per-user (staff) ke Telegram. Marketing, canvassing, ticket, dan lainnya.
                </p>
              </div>
            </div>
            {tgConfig?.botToken && tgEnabled ? (
              <Badge className="bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-300">
                <CheckCircle2 className="h-3 w-3 mr-1" />Aktif
              </Badge>
            ) : tgConfig?.botToken ? (
              <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300">
                <AlertTriangle className="h-3 w-3 mr-1" />Dinonaktifkan
              </Badge>
            ) : (
              <Badge variant="outline" className="text-amber-600 border-amber-200">
                <AlertTriangle className="h-3 w-3 mr-1" />Belum Dikonfigurasi
              </Badge>
            )}
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div className="min-w-0">
              <div className="text-sm font-semibold">Aktifkan Telegram Bot</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Saat nonaktif, pairing & notif tidak jalan. Setting per-user tetap tersimpan.
              </div>
            </div>
            <ToggleSwitch checked={tgEnabled} onChange={setTgEnabled} />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium">Bot Token (dari @BotFather)</Label>
            <div className="relative">
              <Input
                type={tgShowToken ? "text" : "password"}

                value={tgToken}
                onChange={(e) => setTgToken(e.target.value)}
                className="pr-10 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setTgShowToken(!tgShowToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {tgShowToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Bikin bot: chat <code className="font-mono">@BotFather</code> → <code className="font-mono">/newbot</code> → ikuti instruksi → copy token.
            </p>
          </div>

          {tgConfig?.botUsername && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900 text-xs">
              <Bot className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
              <span>
                Bot: <code className="font-mono font-semibold text-foreground">@{tgConfig.botUsername}</code>
                {" - staff bisa connect dari halaman "}
                <a href="/profile" className="text-sky-600 hover:underline">Profile</a>
              </span>
            </div>
          )}

          <div className="flex gap-2 flex-wrap text-xs">
            <Badge variant="outline">Lead Assigned</Badge>
            <Badge variant="outline">Lead Hot/Won</Badge>
            <Badge variant="outline">Canvassing Report</Badge>
            <Badge variant="outline">Sahabat Referral</Badge>
            <Badge variant="outline">Collection Promise</Badge>
            <Badge variant="outline">Ticket Assigned</Badge>
          </div>

          {tgConfig?.lastSuccessAt && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              <span>
                Kirim terakhir:{" "}
                <span className="font-mono-tight text-foreground">
                  {new Date(tgConfig.lastSuccessAt).toLocaleString("id-ID")}
                </span>
              </span>
            </div>
          )}
          {tgConfig?.lastError && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/5 border border-destructive/20 text-xs">
              <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="font-semibold text-destructive">Error terakhir</div>
                <div className="text-muted-foreground line-clamp-2">{tgConfig.lastError}</div>
              </div>
            </div>
          )}

          <div className="flex gap-2 flex-wrap items-center">
            <Button
              size="sm"
              onClick={async () => {
                setTgSaving(true);
                try {
                  await api.put("/telegram/config", { enabled: tgEnabled, botToken: tgToken.trim() });
                  toast.success("Konfigurasi Telegram disimpan");
                  refetchTgConfig();
                } catch (e: any) {
                  toast.error(e.message || "Gagal simpan");
                } finally {
                  setTgSaving(false);
                }
              }}
              disabled={tgSaving}
            >
              {tgSaving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
              Simpan
            </Button>

            <div className="inline-flex items-center gap-1.5 border rounded-md bg-background pl-2">
              <Input

                value={tgTestChatId}
                onChange={(e) => setTgTestChatId(e.target.value)}
                className="h-8 w-32 sm:w-40 border-0 shadow-none focus-visible:ring-0 font-mono text-xs p-0"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const cid = tgTestChatId.trim();
                  if (!cid) return toast.error("chat_id wajib (ambil dari user atau @userinfobot di Telegram)");
                  setTgTesting(true);
                  try {
                    await api.post("/telegram/test", { chatId: cid });
                    toast.success(`Test pesan terkirim ke ${cid}`);
                    refetchTgConfig();
                  } catch (e: any) {
                    toast.error(e.message || "Test gagal");
                  } finally {
                    setTgTesting(false);
                  }
                }}
                disabled={tgTesting}
                className="h-8 border-0 rounded-l-none border-l"
              >
                {tgTesting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                Test
              </Button>
            </div>

            <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="ghost">
                @BotFather <ExternalLink className="h-3.5 w-3.5 ml-1" />
              </Button>
            </a>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1.5">
            <p className="font-semibold text-foreground">Setup quick:</p>
            <ol className="space-y-1 text-muted-foreground list-decimal ml-4">
              <li>Chat <code className="font-mono">@BotFather</code> → <code className="font-mono">/newbot</code> → ikuti instruksi.</li>
              <li>Copy bot token → paste di form → Simpan (otomatis verify via getMe).</li>
              <li>Set webhook: <code className="font-mono text-[10px]">https://api.telegram.org/bot&lt;TOKEN&gt;/setWebhook?url=&lt;APP_URL&gt;/api/telegram/webhook</code></li>
              <li>Aktifkan toggle di atas. Staff connect dari halaman Profile mereka.</li>
            </ol>
          </div>
        </CardContent>
      </Card>
      )}

      {/* ================================================================= */}
      {/* Card - Omnichannel Integration (v4.2.5)                               */}
      {/* ================================================================= */}
      <OmnichannelIntegrationCard />

      {/* ================================================================= */}
      {/* Card - Meta Conversions API (CAPI)                                 */}
      {/* ================================================================= */}
      {show("meta") && (
      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Zap className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Meta Conversions API</h3>
                <p className="text-xs text-muted-foreground">Tracking konversi iklan → pelanggan</p>
              </div>
            </div>
            {metaPixelId && metaAccessToken ? (
              <Badge className="bg-green-100 text-green-800 border-green-200"><CheckCircle2 className="h-3 w-3 mr-1" />Aktif</Badge>
            ) : (
              <Badge variant="outline" className="text-amber-600 border-amber-200"><AlertTriangle className="h-3 w-3 mr-1" />Belum Dikonfigurasi</Badge>
            )}
          </div>

          <p className="text-sm text-muted-foreground">Kirim event konversi (Lead, Purchase) ke Meta untuk optimasi delivery iklan. Meta akan cari audiens yang mirip orang yang benar-benar jadi pelanggan.</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Meta Pixel ID</Label>
              <Input value={metaPixelId} onChange={e => setMetaPixelId(e.target.value)} className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Access Token</Label>
              <Input type="password" value={metaAccessToken} onChange={e => setMetaAccessToken(e.target.value)} />
            </div>
          </div>

          <div className="flex gap-2 flex-wrap text-xs">
            <Badge variant="outline">Lead Event</Badge>
            <Badge variant="outline">Purchase Event</Badge>
            <Badge variant="outline">SHA-256 Hashing</Badge>
            <Badge variant="outline">Offline Conversions</Badge>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={async () => {
              if (!metaPixelId) { toast.error("Pixel ID wajib diisi"); return; }
              try {
                await api.put("/settings/bulk", { settings: [
                  { key: "meta_pixel_id", value: metaPixelId, category: "meta_capi", label: "Meta Pixel ID" },
                  { key: "meta_access_token", value: metaAccessToken, category: "meta_capi", label: "Meta Access Token" },
                ]});
                toast.success("Konfigurasi Meta CAPI disimpan");
                queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
              } catch { toast.error("Gagal menyimpan"); }
            }}>
              <Save className="h-3.5 w-3.5 mr-1" /> Simpan
            </Button>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1.5">
            <p className="font-semibold text-foreground">Event yang dikirim otomatis:</p>
            <div className="grid gap-1">
              <div className="flex items-center gap-1.5"><Badge variant="outline" className="text-[10px]">Lead</Badge><span>Saat prospek daftar dari landing page coverage check</span></div>
              <div className="flex items-center gap-1.5"><Badge variant="outline" className="text-[10px]">Purchase</Badge><span>Saat lead dikonversi menjadi pelanggan aktif</span></div>
            </div>
            <p className="text-muted-foreground mt-2">Data PII (nama, telepon, email) otomatis di-hash SHA-256 sebelum dikirim ke Meta.</p>
          </div>
        </CardContent>
      </Card>
      )}

      {/* ================================================================= */}
      {/* Card - Export / Import Data                                        */}
      {/* ================================================================= */}
      {show("data") && (
      <Card>
        <CardContent className="p-6 space-y-5">
          {/* Header row */}
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <FileSpreadsheet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">
                  Export / Import Data
                </h3>
                <p className="text-xs text-muted-foreground">
                  Backup dan migrasi data aset jaringan
                </p>
              </div>
            </div>
            <IntegrationStatusBadge status="connected" />
          </div>

          {/* Config fields */}
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="export-format">Default Format</Label>
                <Select value={exportFormat} onValueChange={setExportFormat}>
                  <SelectTrigger id="export-format">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="csv">CSV</SelectItem>
                    <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="export-interval">
                  Backup Interval (hari)
                </Label>
                <Input
                  id="export-interval"
                  type="number"
                  value={exportBackupInterval}
                  onChange={(e) => setExportBackupInterval(e.target.value)}

                  min={1}
                  disabled={!exportAutoBackup}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ToggleSwitch
                checked={exportAutoBackup}
                onChange={setExportAutoBackup}
              />
              <Label
                className="cursor-pointer"
                onClick={() => setExportAutoBackup(!exportAutoBackup)}
              >
                Auto-Backup otomatis
              </Label>
            </div>
          </div>

          {/* Data yang didukung */}
          <div className="space-y-2">
            <Label>Data Didukung</Label>
            <FeatureBadges
              items={[
                "Customers",
                "POPs",
                "ODCs",
                "ODPs",
                "Poles",
                "Cables",
              ]}
            />
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={handleSaveExport}
              disabled={exportSaving || settingsLoading}
            >
              {exportSaving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              Simpan
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                window.location.href = "/export-import";
              }}
            >
              Buka Export/Import
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </CardContent>
      </Card>
      )}

      {/* ================================================================= */}
      {/* Referensi API Internal (Collapsible)                              */}
      {/* ================================================================= */}
      {show("data") && (
      <Card>
        <CardContent className="p-6 space-y-4">
          <button
            onClick={() => setShowApiRef(!showApiRef)}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <Globe className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">
                  Referensi API Internal
                </h3>
                <p className="text-xs text-muted-foreground">
                  {API_ENDPOINTS.length} endpoint tersedia
                </p>
              </div>
            </div>
            {showApiRef ? (
              <ChevronUp className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            )}
          </button>

          {showApiRef && (
            <div className="pt-2 border-t">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground w-20">
                        Method
                      </th>
                      <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground">
                        Path
                      </th>
                      <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground hidden sm:table-cell">
                        Deskripsi
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {API_ENDPOINTS.map((ep, i) => (
                      <tr
                        key={i}
                        className="border-b border-muted/50 last:border-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="py-2 px-2">
                          <MethodBadge method={ep.method} />
                        </td>
                        <td className="py-2 px-2 font-mono text-xs text-foreground">
                          {ep.path}
                        </td>
                        <td className="py-2 px-2 text-xs text-muted-foreground hidden sm:table-cell">
                          {ep.desc}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mt-3 sm:hidden italic">
                Geser ke kanan untuk melihat deskripsi, atau putar layar ke
                landscape.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      )}
    </div>
  );
}

// -------------------------------------------------------------------------
// Omnichannel Integration Card (v4.2.5) - auto-create ticket dari conversation
// -------------------------------------------------------------------------

interface OmnichannelConfigData {
  id: number;
  enabled: number;
  baseUrl: string | null;
  accountId: string | null;
  apiAccessToken: string | null;  // masked
  webhookSecret: string | null;   // masked
  autoCreateOnKeyword: number;
  autoNotifyOnResolve: number;
  autoSyncContacts?: number;
  defaultCategoryId: number | null;
}

interface OmnichannelKeywordRule {
  id: number;
  keyword: string;
  categoryId: number;
  priority: string;
  isActive: number;
  sortOrder: number;
}

function OmnichannelIntegrationCard() {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const { canWrite } = useAuth();
  const { data, isLoading } = useQuery<{
    config: OmnichannelConfigData | null;
    rules: OmnichannelKeywordRule[];
    hasToken: boolean;
    hasSecret: boolean;
  }>({
    queryKey: ["/api/integrations/chatwoot/config"],
    queryFn: () => api.get("/integrations/chatwoot/config"),
  });

  const { data: categories = [] } = useQuery<Array<{ id: number; name: string; color: string | null }>>({
    queryKey: ["ticket-categories"],
    queryFn: () => api.get("/ticket-categories"),
  });

  const config = data?.config;
  const rules = data?.rules ?? [];
  const isConfigured = !!(config?.baseUrl && config.accountId && data?.hasToken);

  // Form state - local until save
  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [accountId, setAccountId] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [autoCreate, setAutoCreate] = useState(true);
  const [autoNotify, setAutoNotify] = useState(true);
  const [autoSyncContacts, setAutoSyncContacts] = useState(false);
  const [defaultCategoryId, setDefaultCategoryId] = useState<string>("");
  const [showToken, setShowToken] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [ruleKeyword, setRuleKeyword] = useState("");
  const [ruleCategoryId, setRuleCategoryId] = useState<string>("");
  const [rulePriority, setRulePriority] = useState("medium");

  useEffect(() => {
    if (config) {
      setEnabled(config.enabled === 1);
      setBaseUrl(config.baseUrl ?? "");
      setAccountId(config.accountId ?? "");
      setApiToken(config.apiAccessToken ?? "");
      setWebhookSecret(config.webhookSecret ?? "");
      setAutoCreate(config.autoCreateOnKeyword === 1);
      setAutoNotify(config.autoNotifyOnResolve === 1);
      setAutoSyncContacts(config.autoSyncContacts === 1);
      setDefaultCategoryId(config.defaultCategoryId ? String(config.defaultCategoryId) : "");
    }
  }, [config]);

  const saveMut = useMutation({
    mutationFn: () => api.put("/integrations/chatwoot/config", {
      enabled, baseUrl, accountId,
      apiAccessToken: apiToken && !apiToken.startsWith("••••") ? apiToken : undefined,
      webhookSecret: webhookSecret && !webhookSecret.startsWith("••••") ? webhookSecret : undefined,
      autoCreateOnKeyword: autoCreate,
      autoNotifyOnResolve: autoNotify,
      autoSyncContacts,
      defaultCategoryId: defaultCategoryId ? Number(defaultCategoryId) : null,
    }),
    onSuccess: () => {
      toast.success("Konfigurasi Omnichannel tersimpan");
      qc.invalidateQueries({ queryKey: ["/api/integrations/chatwoot/config"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const testMut = useMutation({
    mutationFn: () => api.post<{ success: boolean; account?: any; error?: string }>("/integrations/chatwoot/test", {}),
    onSuccess: (r: any) => {
      if (r?.success) toast.success(`✓ Koneksi OK · ${r.account?.name ?? "akun terhubung"}`);
      else toast.error(`Koneksi gagal: ${r?.error ?? "unknown"}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const createRuleMut = useMutation({
    mutationFn: () => api.post("/integrations/chatwoot/keyword-rules", {
      keyword: ruleKeyword.trim(),
      categoryId: Number(ruleCategoryId),
      priority: rulePriority,
      sortOrder: rules.length,
    }),
    onSuccess: () => {
      toast.success("Rule ditambahkan");
      qc.invalidateQueries({ queryKey: ["/api/integrations/chatwoot/config"] });
      setRuleKeyword(""); setRuleCategoryId(""); setShowRuleForm(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteRuleMut = useMutation({
    mutationFn: (id: number) => api.delete(`/integrations/chatwoot/keyword-rules/${id}`),
    onSuccess: () => {
      toast.success("Rule dihapus");
      qc.invalidateQueries({ queryKey: ["/api/integrations/chatwoot/config"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const webhookUrl = typeof window !== "undefined" ? `${window.location.origin}/api/integrations/chatwoot/webhook` : "/api/integrations/chatwoot/webhook";

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Omnichannel</h3>
              <p className="text-xs text-muted-foreground">Auto-create tiket dari conversation chat (WhatsApp/web widget)</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canWrite("chatwoot_settings") && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setLocation("/integrations/chatwoot/agents")}
                className="gap-1.5"
              >
                <Users className="h-3.5 w-3.5" />
                Pemetaan Agent
              </Button>
            )}
            <OpenInChatwootButton target="dashboard" size="sm" />
            {enabled && isConfigured ? (
              <Badge className="bg-green-100 text-green-800 border-green-200"><CheckCircle2 className="h-3 w-3 mr-1" />Aktif</Badge>
            ) : isConfigured ? (
              <Badge className="bg-zinc-100 text-zinc-700 border-zinc-200">Konfigurasi OK · Disabled</Badge>
            ) : (
              <Badge variant="outline" className="text-amber-600 border-amber-200"><AlertTriangle className="h-3 w-3 mr-1" />Belum Dikonfigurasi</Badge>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="h-32 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* Enable toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border">
              <div>
                <div className="text-sm font-semibold">Aktifkan Omnichannel Integration</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Saat aktif, conversation baru di Omnichannel otomatis bikin tiket di JABNET
                </div>
              </div>
              <ToggleSwitch checked={enabled} onChange={setEnabled} />
            </div>

            {/* Connection form */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold">Omnichannel URL</Label>
                  <Input
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}

                    className="mt-1 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Account ID</Label>
                  <Input
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}

                    className="mt-1 text-sm font-mono"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold">API Access Token</Label>
                <div className="relative mt-1">
                  <Input
                    type={showToken ? "text" : "password"}
                    value={apiToken}
                    onChange={(e) => setApiToken(e.target.value)}

                    className="text-sm font-mono pr-9"
                  />
                  <button onClick={() => setShowToken(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded">
                    {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Generate di Omnichannel: Profile (kanan atas) → Access Token. Pakai user agent dengan permission penuh.
                </p>
              </div>

              <div>
                <Label className="text-xs font-semibold">Webhook Secret <span className="text-muted-foreground/70">(opsional, untuk security)</span></Label>
                <div className="relative mt-1">
                  <Input
                    type={showSecret ? "text" : "password"}
                    value={webhookSecret}
                    onChange={(e) => setWebhookSecret(e.target.value)}

                    className="text-sm font-mono pr-9"
                  />
                  <button onClick={() => setShowSecret(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded">
                    {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Webhook URL display */}
            <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-950/20 border border-sky-200/60 dark:border-sky-900/60">
              <div className="text-xs font-bold uppercase tracking-wider text-sky-800 dark:text-sky-300 mb-1.5 flex items-center gap-1.5">
                <Webhook className="h-3.5 w-3.5" /> Webhook URL (paste di Omnichannel)
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono bg-card rounded px-2 py-1.5 border break-all">{webhookUrl}</code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success("URL disalin"); }}
                  className="h-7 text-xs"
                >
                  <Copy className="h-3 w-3 mr-1" /> Copy
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                Di Omnichannel: <strong>Settings → Integrations → Webhooks → Add new</strong>. Subscribe ke event <code className="font-mono bg-muted px-1 rounded">conversation_created</code> dan <code className="font-mono bg-muted px-1 rounded">message_created</code>.
              </p>
            </div>

            {/* Auto behaviors */}
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border">
                <div>
                  <div className="text-sm font-semibold">Auto-create tiket dari keyword</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Match message text dengan rules di bawah</div>
                </div>
                <ToggleSwitch checked={autoCreate} onChange={setAutoCreate} />
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border">
                <div>
                  <div className="text-sm font-semibold">Auto-notify ke Omnichannel saat tiket selesai</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Kirim private note ke conversation saat tiket di-resolve</div>
                </div>
                <ToggleSwitch checked={autoNotify} onChange={setAutoNotify} />
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border">
                <div>
                  <div className="text-sm font-semibold">Auto-sync kontak pelanggan (terjadwal)</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Worker berkala push pelanggan baru/berubah jadi Chatwoot contact (perlu CHATWOOT_CONTACT_SYNC_ENABLED di server)</div>
                </div>
                <ToggleSwitch checked={autoSyncContacts} onChange={setAutoSyncContacts} />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold">Kategori Default <span className="text-muted-foreground/70">(fallback kalau ngga match keyword)</span></Label>
              <Select value={defaultCategoryId || "_none"} onValueChange={(v) => setDefaultCategoryId(v === "_none" ? "" : v)}>
                <SelectTrigger className="mt-1 text-sm">
                  <SelectValue placeholder="Pilih kategori default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Tidak ada (skip kalau ngga match)</SelectItem>
                  {categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="flex-1">
                {saveMut.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
                Simpan
              </Button>
              <Button variant="outline" onClick={() => testMut.mutate()} disabled={testMut.isPending || !isConfigured}>
                {testMut.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <TestTube className="h-4 w-4 mr-1.5" />}
                Test
              </Button>
            </div>

            {/* Keyword rules */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-sm font-bold">Keyword Rules</div>
                  <div className="text-[11px] text-muted-foreground">Match incoming message → kategori + priority. Comma-separated keywords (case insensitive).</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setShowRuleForm(s => !s)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Rule
                </Button>
              </div>

              {showRuleForm && (
                <div className="p-3 rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 space-y-2 mb-3">
                  <Input
                    value={ruleKeyword}
                    onChange={(e) => setRuleKeyword(e.target.value)}

                    className="text-sm"
                  />
                  <div className="flex gap-2">
                    <Select value={ruleCategoryId} onValueChange={setRuleCategoryId}>
                      <SelectTrigger className="text-sm flex-1"><SelectValue placeholder="Kategori" /></SelectTrigger>
                      <SelectContent>{categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={rulePriority} onValueChange={setRulePriority}>
                      <SelectTrigger className="text-sm w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => createRuleMut.mutate()} disabled={!ruleKeyword.trim() || !ruleCategoryId || createRuleMut.isPending} className="flex-1">
                      {createRuleMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                      Tambah Rule
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowRuleForm(false)}>Batal</Button>
                  </div>
                </div>
              )}

              {rules.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-4 italic">Belum ada rule. Tambah dengan tombol di atas.</div>
              ) : (
                <div className="space-y-1.5">
                  {rules.map((rule) => {
                    const cat = categories.find(c => c.id === rule.categoryId);
                    return (
                      <div key={rule.id} className="flex items-center gap-2 p-2 rounded-lg border bg-card">
                        <span className="font-mono text-xs text-muted-foreground w-6">#{rule.sortOrder}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold truncate">{rule.keyword}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] px-1.5 py-0 rounded" style={{ background: `${cat?.color}20`, color: cat?.color || undefined }}>
                              {cat?.name ?? `Cat #${rule.categoryId}`}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0 rounded uppercase tracking-wider font-bold ${
                              rule.priority === "urgent" ? "bg-rose-100 text-rose-700" :
                              rule.priority === "high" ? "bg-orange-100 text-orange-700" :
                              rule.priority === "low" ? "bg-zinc-100 text-zinc-600" :
                              "bg-blue-100 text-blue-700"
                            }`}>
                              {rule.priority}
                            </span>
                          </div>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Hapus rule "${rule.keyword.split(",")[0]}..."?`)) deleteRuleMut.mutate(rule.id); }} className="h-7">
                          <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Help collapse */}
            <div className="border-t pt-3">
              <button onClick={() => setExpanded(s => !s)} className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground hover:text-foreground">
                <span className="flex items-center gap-1.5"><BookOpen className="h-3.5 w-3.5" /> Cara Setup di Omnichannel</span>
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              {expanded && (
                <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                  <GuideStep step={1} text="Login ke Omnichannel sebagai admin → Profile → Access Token (copy token)" />
                  <GuideStep step={2} text="Settings → Integrations → Webhooks → Add new webhook" />
                  <GuideStep step={3} text={`Paste URL: ${webhookUrl}`} />
                  <GuideStep step={4} text="Subscribe events: conversation_created, message_created (minimum)" />
                  <GuideStep step={5} text="Copy webhook secret yang Omnichannel generate, paste di field di atas" />
                  <GuideStep step={6} text="Save di JABNET, klik 'Test' untuk verify koneksi" />
                  <GuideStep step={7} text="Configure keyword rules - saat customer chat ada keyword 'gangguan' otomatis bikin tiket kategori Gangguan" />
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
