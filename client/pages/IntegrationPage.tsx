import { useState, useEffect } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { usePipelines, useCollectionsEngineMode, useSetCollectionsEngineMode, type CollectionsEngineMode } from "@/hooks/usePipelines";
import { toast } from "sonner";
import { Link2, Map, Router, FileSpreadsheet, ChevronDown, ChevronUp, CheckCircle2, XCircle, AlertTriangle, Loader2, ExternalLink, BookOpen, Globe, Copy, Zap, Eye, EyeOff, Save, TestTube, ArrowRight, Cpu, MessageCircle, Send, Database, RefreshCw, Activity, Bot, Users, Building2, ChevronLeft } from "lucide-react";
import { ToggleSwitch, PasswordInput, IntegrationStatusBadge, MethodBadge, FeatureBadges, GuideStep, getSettingValue, API_ENDPOINTS, INTEGRATION_SECTIONS, type MikrotikRouter, type SettingItem } from "./integration/shared";
import { OmnichannelIntegrationCard } from "./integration/OmnichannelIntegrationCard";

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

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
  const [billNightlyHour, setBillNightlyHour] = useState("2");
  const [billTenantGapMin, setBillTenantGapMin] = useState("5");
  const [billInited, setBillInited] = useState(false);
  const [billSaving, setBillSaving] = useState(false);
  const [billSyncing, setBillSyncing] = useState(false);
  const [billReconciling, setBillReconciling] = useState(false);

  useEffect(() => {
    if (allSettings && !billInited) {
      setBillEnabled(
        getSettingValue(allSettings, "billing_sync_enabled", "true") === "true"
      );
      setBillNightlyHour(getSettingValue(allSettings, "billing_sync_nightly_hour", "2"));
      setBillTenantGapMin(String(Math.round((Number(getSettingValue(allSettings, "billing_sync_tenant_gap_seconds", "300")) || 300) / 60)));
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
        { key: "billing_sync_nightly_hour", value: String(Math.min(23, Math.max(0, Number(billNightlyHour) || 2))), category: "billing", label: "Jam Sync Harian (0-23)" },
        { key: "billing_sync_tenant_gap_seconds", value: String(Math.max(0, Math.round((Number(billTenantGapMin) || 5) * 60))), category: "billing", label: "Jeda Antar-Tenant (detik)" },
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
                {billStatus?.nextRunAt && (
                  <> · sync otomatis berikutnya: <span className="font-mono-tight text-foreground">{new Date(billStatus.nextRunAt).toLocaleString("id-ID")}</span></>
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
                Worker menarik data billing.jabnet.id sekali sehari untuk semua tenant (jadwal di bawah).
              </div>
            </div>
            <ToggleSwitch checked={billEnabled} onChange={setBillEnabled} />
          </div>

          {/* Nightly schedule config */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Jam Sync Harian (0-23)</Label>
              <Input
                type="number"
                min={0}
                max={23}
                value={billNightlyHour}
                onChange={(e) => setBillNightlyHour(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">Waktu server. Sync semua tenant sekali sehari (default 02:00).</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Jeda Antar-Tenant (menit)</Label>
              <Input
                type="number"
                min={0}
                value={billTenantGapMin}
                onChange={(e) => setBillTenantGapMin(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">Tunggu sekian menit sebelum sync tenant berikutnya (default 5).</p>
            </div>
          </div>

          {/* Feature tags */}
          <div className="flex gap-2 flex-wrap text-xs">
            <Badge variant="outline">Auto-isolir</Badge>
            <Badge variant="outline">Auto-buka Collection</Badge>
            <Badge variant="outline">Manual Override Lock</Badge>
            <Badge variant="outline">Reconciliation</Badge>
            <Badge variant="outline">Sync Harian (Nightly)</Badge>
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

