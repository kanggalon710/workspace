import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Cpu,
  RefreshCw,
  Loader2,
  Search,
  Wifi,
  WifiOff,
  Signal,
  Thermometer,
  Tag,
  Trash2,
  RotateCcw,
  Download,
  Plus,
  X,
  ExternalLink,
  AlertTriangle,
  Monitor,
  Link2,
  Eye,
  EyeOff,
  Globe,
  Users,
  Zap,
  Save,
  Edit3,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WanConnection {
  type: string;
  name: string;
  status: string;
  externalIp: string;
  gateway: string;
  dns: string;
  username: string;
  uptime: string;
  macAddress: string;
  binding: string;
  lastError: string;
}

interface ConnectedHost {
  ipAddress: string;
  macAddress: string;
  hostName: string;
  interfaceType: string;
  active: boolean;
}

interface WifiInterface {
  index: number;
  ssid: string;
  password: string;
  enabled: boolean;
  securityMode: string;
}

interface ParsedDevice {
  deviceId: string;
  serialNumber: string;
  manufacturer: string;
  oui: string;
  productClass: string;
  macAddress: string;
  hardwareVersion: string;
  softwareVersion: string;
  status: "online" | "offline";
  lastInform: string | null;
  registeredAt: string | null;
  lastBootstrap: string | null;
  ipAddress: string;
  uptime: number;
  pppoeUsername: string;
  rxPower: string;
  temperature: string;
  wifiSsid: string[];
  connectedDevices: number;
  tags: string[];
  wanConnections: WanConnection[];
  connectedHosts: ConnectedHost[];
  wifiInterfaces: WifiInterface[];
  _raw?: any;
}

interface DeviceStats {
  total: number;
  online: number;
  offline: number;
}

interface SettingItem {
  key: string;
  value: string;
  category?: string;
}

interface CustomerMatch {
  id: number;
  name: string;
  customerId: string;
  phone: string | null;
  package: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatUptime(seconds: number): string {
  if (!seconds) return "\u2014";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d} hari ${h} jam ${m} menit`;
  if (h > 0) return `${h} jam ${m} menit`;
  return `${m} menit`;
}

function formatUptimeShort(seconds: number): string {
  if (!seconds) return "\u2014";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}h ${h}j`;
  if (h > 0) return `${h}j ${m}m`;
  return `${m}m`;
}

function rxPowerColor(dbm: string): string {
  const n = parseFloat(dbm);
  if (isNaN(n)) return "text-muted-foreground";
  if (n > -25) return "text-success";
  if (n > -28) return "text-warning";
  return "text-destructive";
}

function rxPowerBgColor(dbm: string): string {
  const n = parseFloat(dbm);
  if (isNaN(n)) return "bg-muted";
  if (n > -25) return "bg-success";
  if (n > -28) return "bg-warning";
  return "bg-destructive";
}

function formatDatetime(iso: string | null): string {
  if (!iso) return "\u2014";
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "\u2014";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GenieAcsDevicesPage() {
  const queryClient = useQueryClient();

  // Local state with debounced search. Deep-link: /devices?q=<serial|pppoe> auto-cari.
  const initialQ = typeof window !== "undefined" ? (new URLSearchParams(window.location.search).get("q") ?? "") : "";
  const [searchInput, setSearchInput] = useState(initialQ);
  const [search, setSearch] = useState(initialQ);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const handleSearchChange = useCallback((val: string) => {
    setSearchInput(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(val), 300);
  }, []);
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline" | "new_7d" | "new_30d">("all");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [newTag, setNewTag] = useState("");
  const [confirmReboot, setConfirmReboot] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  // v4.2.9: reset ke page 0 saat search berubah (supaya consistent saat clear search)
  useEffect(() => { setPage(0); }, [searchInput]);

  // Detail dialog tabs & state
  const [detailTab, setDetailTab] = useState<"overview" | "wan" | "wifi" | "hosts" | "actions">("overview");
  const [showPasswords, setShowPasswords] = useState<Record<number, boolean>>({});
  const [wifiEditIndex, setWifiEditIndex] = useState<number | null>(null);
  const [wanEditData, setWanEditData] = useState<{ wanIndex: number; name: string; username: string; password: string; enabled: boolean; mode: "add" | "edit"; connectionType?: string } | null>(null);
  const [wifiEditSsid, setWifiEditSsid] = useState("");
  const [wifiEditPassword, setWifiEditPassword] = useState("");

  // -- Settings check ------------------------------------------------------
  const { data: settings, isLoading: settingsLoading } = useQuery<SettingItem[]>({
    queryKey: ["/api/settings", "genieacs"],
    queryFn: () => api.get<SettingItem[]>("/settings?category=genieacs"),
  });

  const isConfigured = useMemo(() => {
    if (!settings) return false;
    return settings.some((s) => s.key === "genieacs_host" && s.value?.trim());
  }, [settings]);

  // -- Stats ---------------------------------------------------------------
  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery<DeviceStats>({
    queryKey: ["/api/genieacs/stats"],
    queryFn: () => api.get<DeviceStats>("/genieacs/stats"),
    enabled: isConfigured,
    refetchInterval: 30_000,
    retry: false,
  });

  // -- Device list ---------------------------------------------------------
  // v4.2.9: Kalau ada search query → kirim ke backend dengan limit besar (filter di GenieACS),
  //         tanpa search → paginate seperti biasa (50/page).
  const isSearching = !!search.trim();
  const {
    data: devices,
    isLoading: devicesLoading,
    isFetching: devicesFetching,
    isError: devicesIsError,
    error: devicesError,
  } = useQuery<ParsedDevice[]>({
    queryKey: ["/api/genieacs/devices", isSearching ? `search:${search}` : `page:${page}`],
    queryFn: () => {
      const limit = isSearching ? 1000 : PAGE_SIZE;
      const skip = isSearching ? 0 : page * PAGE_SIZE;
      const params = new URLSearchParams({ limit: String(limit), skip: String(skip) });
      if (isSearching) params.set("search", search.trim());
      return api.get<ParsedDevice[]>(`/genieacs/devices?${params}`);
    },
    enabled: isConfigured,
    retry: false,
  });

  // Pesan error gabungan (device list diprioritaskan). Ditampilkan apa adanya supaya sebab
  // sebenarnya (salah port/host, auth, timeout) kelihatan - bukan empty-state yang menyesatkan.
  const genieErrorMsg = devicesIsError
    ? ((devicesError as any)?.message as string | undefined)
    : statsError
      ? ((statsError as any)?.message as string | undefined)
      : undefined;

  // -- Detail device -------------------------------------------------------
  const {
    data: detailDevice,
    isLoading: detailLoading,
  } = useQuery<ParsedDevice>({
    queryKey: ["/api/genieacs/devices", detailId],
    queryFn: () => api.get<ParsedDevice>(`/genieacs/devices/${encodeURIComponent(detailId!)}`),
    enabled: !!detailId,
  });

  // -- Customers for PPPoE matching ----------------------------------------
  const { data: customers } = useQuery<any[]>({
    queryKey: ["customers"],
    queryFn: () => api.get<any[]>("/customers"),
    enabled: isConfigured,
  });

  const customerByPppoe = useMemo(() => {
    const map = new Map<string, CustomerMatch>();
    if (!customers) return map;
    for (const c of customers) {
      if (c.pppoeUsername) {
        map.set(c.pppoeUsername, {
          id: c.id,
          name: c.name,
          customerId: c.customerId,
          phone: c.phone ?? null,
          package: c.package ?? null,
        });
      }
    }
    return map;
  }, [customers]);

  // -- Filtered devices (client-side) --------------------------------------
  const filteredDevices = useMemo(() => {
    if (!devices) return [];
    let list = devices;

    if (statusFilter === "online" || statusFilter === "offline") {
      list = list.filter((d) => d.status === statusFilter);
    } else if (statusFilter === "new_7d" || statusFilter === "new_30d") {
      const days = statusFilter === "new_7d" ? 7 : 30;
      const cutoff = new Date(Date.now() - days * 86400000).toISOString();
      // Device baru = registered OR bootstrap dalam periode ini
      list = list.filter((d) =>
        (d.registeredAt && d.registeredAt >= cutoff) ||
        (d.lastBootstrap && d.lastBootstrap >= cutoff)
      );
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (d) =>
          d.serialNumber?.toLowerCase().includes(q) ||
          d.manufacturer?.toLowerCase().includes(q) ||
          d.macAddress?.toLowerCase().includes(q) ||
          d.pppoeUsername?.toLowerCase().includes(q) ||
          d.ipAddress?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [devices, search, statusFilter]);

  // -- Mutations -----------------------------------------------------------
  const summonMut = useMutation({
    mutationFn: (id: string) =>
      api.post(`/genieacs/devices/${encodeURIComponent(id)}/summon`, {}),
    onSuccess: () => toast.success("Summon berhasil dikirim"),
    onError: (e: any) => toast.error(e.message || "Gagal summon perangkat"),
  });

  const refreshMut = useMutation({
    mutationFn: (id: string) =>
      api.post(`/genieacs/devices/${encodeURIComponent(id)}/refresh`, {}),
    onSuccess: () => {
      toast.success("Refresh parameter berhasil");
      if (detailId) {
        queryClient.invalidateQueries({ queryKey: ["/api/genieacs/devices", detailId] });
      }
    },
    onError: (e: any) => toast.error(e.message || "Gagal refresh parameter"),
  });

  const rebootMut = useMutation({
    mutationFn: (id: string) =>
      api.post(`/genieacs/devices/${encodeURIComponent(id)}/reboot`, {}),
    onSuccess: () => {
      toast.success("Perangkat sedang di-reboot");
      setConfirmReboot(null);
    },
    onError: (e: any) => {
      toast.error(e.message || "Gagal reboot perangkat");
      setConfirmReboot(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/genieacs/devices/${encodeURIComponent(id)}`),
    onSuccess: () => {
      toast.success("Perangkat berhasil dihapus");
      setConfirmDelete(null);
      setDetailId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/genieacs/devices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/genieacs/stats"] });
    },
    onError: (e: any) => {
      toast.error(e.message || "Gagal menghapus perangkat");
      setConfirmDelete(null);
    },
  });

  const addTagMut = useMutation({
    mutationFn: ({ id, tag }: { id: string; tag: string }) =>
      api.post(`/genieacs/devices/${encodeURIComponent(id)}/tags`, { tag }),
    onSuccess: () => {
      toast.success("Tag berhasil ditambahkan");
      setNewTag("");
      if (detailId) {
        queryClient.invalidateQueries({ queryKey: ["/api/genieacs/devices", detailId] });
      }
    },
    onError: (e: any) => toast.error(e.message || "Gagal menambah tag"),
  });

  const removeTagMut = useMutation({
    mutationFn: ({ id, tag }: { id: string; tag: string }) =>
      api.delete(`/genieacs/devices/${encodeURIComponent(id)}/tags/${encodeURIComponent(tag)}`),
    onSuccess: () => {
      toast.success("Tag berhasil dihapus");
      if (detailId) {
        queryClient.invalidateQueries({ queryKey: ["/api/genieacs/devices", detailId] });
      }
    },
    onError: (e: any) => toast.error(e.message || "Gagal menghapus tag"),
  });

  const wifiEditMut = useMutation({
    mutationFn: ({ id, wlanIndex, ssid, password }: { id: string; wlanIndex: number; ssid: string; password: string }) =>
      api.post(`/genieacs/devices/${encodeURIComponent(id)}/wifi`, { wlanIndex, ssid, password }),
    onSuccess: () => {
      toast.success("WiFi berhasil diupdate");
      setWifiEditIndex(null);
      setWifiEditSsid("");
      setWifiEditPassword("");
      if (detailId) {
        queryClient.invalidateQueries({ queryKey: ["/api/genieacs/devices", detailId] });
      }
    },
    onError: (e: any) => toast.error(e.message || "Gagal mengupdate WiFi"),
  });

  const wanMut = useMutation({
    mutationFn: ({ deviceId, action, wanIndex, name, username, password, enabled, connectionType }: any) => {
      if (action === "add") {
        return api.post(`/genieacs/devices/${encodeURIComponent(deviceId)}/wan`, { wanIndex, name, username, password, enabled });
      }
      return api.put(`/genieacs/devices/${encodeURIComponent(deviceId)}/wan/${wanIndex}`, { name, username, password, enabled, connectionType });
    },
    onSuccess: () => {
      toast.success("WAN connection berhasil diupdate");
      setWanEditData(null);
      if (detailId) queryClient.invalidateQueries({ queryKey: ["/api/genieacs/devices", detailId] });
    },
    onError: (e: any) => toast.error(e.message || "Gagal mengupdate WAN"),
  });

  // -- Refresh all queries -------------------------------------------------
  function handleRefreshAll() {
    queryClient.invalidateQueries({ queryKey: ["/api/genieacs/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/genieacs/devices"] });
    toast.success("Memuat ulang data...");
  }

  // -- Loading gate --------------------------------------------------------
  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // -- Not configured ------------------------------------------------------
  if (!isConfigured) {
    return (
      <div className="space-y-6">
        <Header onRefresh={handleRefreshAll} refreshing={false} />
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <AlertTriangle className="h-12 w-12 text-warning" />
            <div className="text-center space-y-1">
              <h3 className="font-semibold text-lg">GenieACS belum dikonfigurasi</h3>
              <p className="text-muted-foreground text-sm">
                Atur koneksi GenieACS di halaman Integrasi API untuk mulai mengelola perangkat ONT/CPE.
              </p>
            </div>
            <Button asChild>
              <a href="/integrations">
                <Link2 className="mr-2 h-4 w-4" />
                Buka Halaman Integrasi
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // -- Detail modal matched customer ---------------------------------------
  const detailCustomer = detailDevice?.pppoeUsername
    ? customerByPppoe.get(detailDevice.pppoeUsername)
    : undefined;

  return (
    <div className="space-y-6">
      {/* Header */}
      <Header
        onRefresh={handleRefreshAll}
        refreshing={devicesFetching || statsLoading}
      />

      {/* Banner error koneksi GenieACS - tampilkan sebab asli, bukan list kosong palsu */}
      {genieErrorMsg && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-destructive mt-0.5" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-destructive">Gagal memuat perangkat dari GenieACS</p>
            <p className="text-destructive">{genieErrorMsg}</p>
            <p className="text-xs text-destructive/80">
              Cek konfigurasi di{" "}
              <a href="/integrations" className="underline font-medium">Integrasi API</a>
              {" "}- pastikan host/port mengarah ke NBI GenieACS (default port 7557, bukan port UI).
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total Perangkat"
          value={stats?.total}
          loading={statsLoading}
          color="blue"
        />
        <StatCard
          label="Online"
          value={stats?.online}
          loading={statsLoading}
          color="green"
        />
        <StatCard
          label="Offline"
          value={stats?.offline}
          loading={statsLoading}
          color="red"
        />
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cari serial, MAC, manufacturer..."
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as "all" | "online" | "offline")}
        >
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Status</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
            <SelectItem value="new_7d">Baru (7 hari)</SelectItem>
            <SelectItem value="new_30d">Baru (30 hari)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Device Table */}
      <Card>
        <CardContent className="p-0">
          {devicesLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Memuat perangkat...</span>
            </div>
          ) : devicesIsError ? (
            <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
              <AlertTriangle className="h-10 w-10 text-destructive" />
              <p className="text-sm text-destructive font-medium">Gagal memuat perangkat</p>
              <p className="text-xs max-w-md text-center">{genieErrorMsg}</p>
            </div>
          ) : filteredDevices.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
              <Monitor className="h-10 w-10" />
              <p className="text-sm">
                {search || statusFilter !== "all"
                  ? "Tidak ada perangkat yang cocok dengan filter."
                  : "Belum ada perangkat terdaftar."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left">
                    <th className="whitespace-nowrap px-4 py-3 font-medium text-xs">Perangkat</th>
                    <th className="whitespace-nowrap px-3 py-3 font-medium text-xs hidden md:table-cell">Model</th>
                    <th className="whitespace-nowrap px-3 py-3 font-medium text-xs hidden md:table-cell">Status</th>
                    <th className="whitespace-nowrap px-3 py-3 font-medium text-xs hidden lg:table-cell">IP</th>
                    <th className="whitespace-nowrap px-3 py-3 font-medium text-xs hidden lg:table-cell">Pelanggan</th>
                    <th className="whitespace-nowrap px-3 py-3 font-medium text-xs hidden xl:table-cell">Signal</th>
                    <th className="whitespace-nowrap px-3 py-3 font-medium text-xs hidden xl:table-cell">Uptime</th>
                    <th className="whitespace-nowrap px-3 py-3 font-medium text-xs text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDevices.map((d) => {
                    const matched = d.pppoeUsername
                      ? customerByPppoe.get(d.pppoeUsername)
                      : undefined;
                    const openDetail = () => { setDetailTab("overview"); setShowPasswords({}); setWifiEditIndex(null); setDetailId(d.deviceId); };

                    return (
                      <tr
                        key={d.deviceId}
                        className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={openDetail}
                      >
                        {/* Serial + info (mobile: stacked) */}
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${d.status === "online" ? "bg-success" : "bg-destructive"}`} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="font-mono font-semibold text-xs truncate">{d.serialNumber || "-"}</p>
                                {((d.registeredAt && (Date.now() - new Date(d.registeredAt).getTime()) < 7 * 86400000) ||
                                  (d.lastBootstrap && (Date.now() - new Date(d.lastBootstrap).getTime()) < 3 * 86400000)) && (
                                  <Badge className="bg-blue-500 text-white text-[8px] px-1 py-0 h-4 shrink-0">Baru</Badge>
                                )}
                              </div>
                              <p className="text-[10px] text-muted-foreground md:hidden truncate">
                                {d.manufacturer} {d.productClass} {d.ipAddress ? `• ${d.ipAddress}` : ""}
                              </p>
                              {d.pppoeUsername && (
                                <p className="text-[10px] text-muted-foreground md:hidden truncate">
                                  PPPoE: {matched ? <span className="text-success font-medium">{matched.name}</span> : d.pppoeUsername}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Manufacturer / Model */}
                        <td className="px-3 py-2.5 hidden md:table-cell">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs truncate max-w-[80px]">{d.manufacturer || "-"}</span>
                            {d.productClass && <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">{d.productClass}</Badge>}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-3 py-2.5 hidden md:table-cell">
                          <Badge variant="outline" className={`text-[10px] ${d.status === "online" ? "bg-success/10 text-success border-success/30" : "bg-destructive/10 text-destructive border-destructive/30"}`}>
                            {d.status === "online" ? "Online" : "Offline"}
                          </Badge>
                        </td>

                        {/* IP */}
                        <td className="px-3 py-2.5 hidden lg:table-cell">
                          <span className="font-mono text-xs">{d.ipAddress || "-"}</span>
                        </td>

                        {/* PPPoE */}
                        <td className="px-3 py-2.5 hidden lg:table-cell">
                          {matched ? (
                            <span className="text-xs text-success font-medium truncate block max-w-[120px]">{matched.name}</span>
                          ) : d.pppoeUsername ? (
                            <span className="text-xs text-muted-foreground font-mono truncate block max-w-[120px]">{d.pppoeUsername}</span>
                          ) : <span className="text-xs text-muted-foreground">-</span>}
                        </td>

                        {/* RX Power */}
                        <td className="px-3 py-2.5 hidden xl:table-cell">
                          <span className={`font-mono text-xs font-medium ${rxPowerColor(d.rxPower)}`}>
                            {d.rxPower ? `${d.rxPower}` : "-"}
                          </span>
                        </td>

                        {/* Uptime */}
                        <td className="px-3 py-2.5 hidden xl:table-cell">
                          <span className="text-xs text-muted-foreground">{formatUptimeShort(d.uptime)}</span>
                        </td>

                        {/* Quick actions */}
                        <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Summon"
                              onClick={(e) => { e.stopPropagation(); summonMut.mutate(d.deviceId); }}>
                              <Zap className="h-3.5 w-3.5 text-blue-600" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Reboot"
                              onClick={(e) => { e.stopPropagation(); setConfirmReboot(d.deviceId); }}>
                              <RotateCcw className="h-3.5 w-3.5 text-warning" />
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs hidden sm:inline-flex"
                              onClick={(e) => { e.stopPropagation(); openDetail(); }}>
                              Detail
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination - hidden saat searching (semua hasil sudah ke-filter di backend) */}
          {!devicesLoading && !isSearching && devices && devices.length >= PAGE_SIZE && (
            <div className="flex items-center justify-center gap-2 border-t px-4 py-3">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Sebelumnya
              </Button>
              <span className="text-xs text-muted-foreground">
                Halaman {page + 1}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={devices.length < PAGE_SIZE}
                onClick={() => setPage((p) => p + 1)}
              >
                Selanjutnya
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* -- Detail Dialog (JACS-style tabbed) ------------------------------- */}
      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cpu className="h-5 w-5" />
              Detail Perangkat
            </DialogTitle>
            <DialogDescription>
              Informasi lengkap dan aksi perangkat ONT/CPE
            </DialogDescription>
          </DialogHeader>

          {detailLoading || !detailDevice ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* -- Tab Navigation -- */}
              <div className="flex gap-1 border-b overflow-x-auto">
                {([
                  { key: "overview" as const, label: "Overview", icon: Monitor },
                  { key: "wan" as const, label: "WAN Connections", icon: Globe, badge: detailDevice.wanConnections?.length },
                  { key: "wifi" as const, label: "WiFi", icon: Wifi },
                  { key: "hosts" as const, label: "Connected Devices", icon: Users, badge: detailDevice.connectedHosts?.length },
                  { key: "actions" as const, label: "Actions", icon: Zap },
                ]).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setDetailTab(tab.key)}
                    className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                      detailTab === tab.key
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                    }`}
                  >
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                    {tab.badge != null && tab.badge > 0 && (
                      <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 h-4 min-w-[18px] flex items-center justify-center">
                        {tab.badge}
                      </Badge>
                    )}
                  </button>
                ))}
              </div>

              {/* -- Tab: Overview -- */}
              {detailTab === "overview" && (
                <div className="space-y-6">
                  {/* Two-column grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Left: Basic Information */}
                    <div className="space-y-4">
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Informasi Dasar</h4>
                      <div className="space-y-3">
                        <InfoItem label="Device ID" value={detailDevice.deviceId} mono />
                        <InfoItem label="Serial Number" value={detailDevice.serialNumber} mono />
                        <InfoItem label="MAC Address" value={detailDevice.macAddress} mono />
                        <InfoItem label="Last Inform" value={formatDatetime(detailDevice.lastInform)} />
                        <div className="space-y-0.5">
                          <div className="text-xs text-muted-foreground">Status</div>
                          <Badge
                            variant={detailDevice.status === "online" ? "default" : "destructive"}
                            className={detailDevice.status === "online" ? "bg-success hover:brightness-95" : ""}
                          >
                            {detailDevice.status === "online" ? "Online" : "Offline"}
                          </Badge>
                        </div>
                        <InfoItem label="Manufacturer" value={detailDevice.manufacturer} />
                        <InfoItem label="Product Class" value={detailDevice.productClass} />
                        <InfoItem label="OUI" value={detailDevice.oui} mono />
                      </div>
                    </div>

                    {/* Right: Hardware/Software */}
                    <div className="space-y-4">
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Hardware / Software</h4>
                      <div className="space-y-3">
                        <InfoItem label="Hardware Version" value={detailDevice.hardwareVersion} />
                        <InfoItem label="Software Version" value={detailDevice.softwareVersion} />
                        <InfoItem label="Uptime" value={formatUptime(detailDevice.uptime)} />
                      </div>

                      {/* Optical Information */}
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pt-2">Informasi Optik</h4>
                      <div className="space-y-3">
                        <div className="space-y-0.5">
                          <div className="text-xs text-muted-foreground">RX Power</div>
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-mono font-bold ${rxPowerColor(detailDevice.rxPower)}`}>
                              {detailDevice.rxPower || "\u2014"}
                            </span>
                            {detailDevice.rxPower && (
                              <>
                                <span className="text-xs text-muted-foreground">dBm</span>
                                <span className={`inline-block h-2 w-2 rounded-full ${rxPowerBgColor(detailDevice.rxPower)}`} />
                              </>
                            )}
                          </div>
                        </div>
                        <div className="space-y-0.5">
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <Thermometer className="h-3.5 w-3.5" />
                            Temperature
                          </div>
                          <div className="flex items-baseline gap-1">
                            <span className="text-sm font-mono font-bold">
                              {detailDevice.temperature || "\u2014"}
                            </span>
                            {detailDevice.temperature && (
                              <span className="text-xs text-muted-foreground">&deg;C</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Network Information */}
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pt-2">Informasi Jaringan</h4>
                      <div className="space-y-3">
                        <div className="space-y-0.5">
                          <div className="text-xs text-muted-foreground">IP TR069</div>
                          {detailDevice.ipAddress ? (
                            <a
                              href={`http://${detailDevice.ipAddress}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-mono text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                            >
                              {detailDevice.ipAddress}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-sm">{"\u2014"}</span>
                          )}
                        </div>
                        <InfoItem label="Device ID (TR069 URL)" value={detailDevice.deviceId} mono />
                      </div>
                    </div>
                  </div>

                  {/* Pelanggan Terhubung */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Pelanggan Terhubung</h4>
                    {detailCustomer ? (
                      <div className="rounded-lg border border-success/30 bg-success/10 p-3 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{detailCustomer.name}</span>
                          <Badge className="bg-success hover:brightness-95 text-[10px]">
                            Terhubung
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                          <span>ID: {detailCustomer.customerId}</span>
                          {detailCustomer.phone && <span>Telp: {detailCustomer.phone}</span>}
                          {detailCustomer.package && <span>Paket: {detailCustomer.package}</span>}
                        </div>
                      </div>
                    ) : detailDevice.pppoeUsername ? (
                      <div className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
                        PPPoE: <span className="font-mono text-xs text-foreground">{detailDevice.pppoeUsername}</span>
                      </div>
                    ) : (
                      <div className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
                        Tidak ada
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* -- Tab: WAN Connections -- */}
              {detailTab === "wan" && (
                <div className="space-y-3">
                  {/* Add WAN button */}
                  <div className="flex justify-end">
                    <Button size="sm" variant="outline" onClick={() => setWanEditData({ wanIndex: (detailDevice.wanConnections?.length || 0) + 1, name: "", username: "", password: "", enabled: true, mode: "add" })}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Tambah WAN
                    </Button>
                  </div>

                  {/* Add/Edit WAN inline form */}
                  {wanEditData && (
                    <Card className="border-2 border-primary/30">
                      <CardContent className="p-4 space-y-3">
                        <p className="text-xs font-semibold text-primary">{wanEditData.mode === "add" ? "Tambah WAN Connection" : "Edit WAN Connection"}</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-medium text-muted-foreground">Name</label>
                            <Input className="h-8 text-xs" placeholder="INTERNET_R_VID_100" value={wanEditData.name} onChange={e => setWanEditData(d => d ? { ...d, name: e.target.value } : d)} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-medium text-muted-foreground">WAN Index</label>
                            <Input className="h-8 text-xs" type="number" min={1} max={8} value={wanEditData.wanIndex} onChange={e => setWanEditData(d => d ? { ...d, wanIndex: Number(e.target.value) } : d)} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-medium text-muted-foreground">PPPoE Username</label>
                            <Input className="h-8 text-xs" placeholder="user@isp" value={wanEditData.username} onChange={e => setWanEditData(d => d ? { ...d, username: e.target.value } : d)} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-medium text-muted-foreground">PPPoE Password</label>
                            <Input className="h-8 text-xs" type="password" placeholder="password" value={wanEditData.password} onChange={e => setWanEditData(d => d ? { ...d, password: e.target.value } : d)} />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" disabled={wanMut.isPending} onClick={() => {
                            if (!wanEditData || !detailDevice) return;
                            if (wanEditData.mode === "add") {
                              wanMut.mutate({ deviceId: detailDevice.deviceId, action: "add", ...wanEditData });
                            } else {
                              wanMut.mutate({ deviceId: detailDevice.deviceId, action: "edit", ...wanEditData });
                            }
                          }}>
                            {wanMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                            {wanEditData.mode === "add" ? "Tambah" : "Simpan"}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setWanEditData(null)}>Batal</Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {(!detailDevice.wanConnections || detailDevice.wanConnections.length === 0) ? (
                    <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                      <Globe className="h-8 w-8" />
                      <p className="text-sm">Tidak ada koneksi WAN</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50 text-left">
                            <th className="whitespace-nowrap px-3 py-2 font-medium text-xs">Type</th>
                            <th className="whitespace-nowrap px-3 py-2 font-medium text-xs">Name</th>
                            <th className="whitespace-nowrap px-3 py-2 font-medium text-xs">Status</th>
                            <th className="whitespace-nowrap px-3 py-2 font-medium text-xs">External IP</th>
                            <th className="whitespace-nowrap px-3 py-2 font-medium text-xs">Username</th>
                            <th className="whitespace-nowrap px-3 py-2 font-medium text-xs">Uptime</th>
                            <th className="whitespace-nowrap px-3 py-2 font-medium text-xs text-right">Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailDevice.wanConnections.map((wan, i) => (
                            <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="px-3 py-2">
                                <Badge variant="outline" className="text-[10px]">{wan.type || "IP"}</Badge>
                              </td>
                              <td className="px-3 py-2 text-xs font-medium">{wan.name || "-"}</td>
                              <td className="px-3 py-2">
                                <Badge variant={wan.status?.toLowerCase() === "connected" ? "default" : "destructive"}
                                  className={`text-[10px] ${wan.status?.toLowerCase() === "connected" ? "bg-success hover:brightness-95" : ""}`}>
                                  {wan.status || "Unknown"}
                                </Badge>
                              </td>
                              <td className="px-3 py-2 font-mono text-xs">{wan.externalIp || "-"}</td>
                              <td className="px-3 py-2 text-xs">{wan.username || "-"}</td>
                              <td className="px-3 py-2 text-xs">{wan.uptime || "-"}</td>
                              <td className="px-3 py-2 text-right">
                                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2"
                                  onClick={() => setWanEditData({
                                    wanIndex: i + 1, name: wan.name || "", username: wan.username || "",
                                    password: "", enabled: wan.status?.toLowerCase() === "connected",
                                    mode: "edit", connectionType: wan.type === "PPPoE" ? "ppp" : "ip",
                                  })}>
                                  <Edit3 className="h-3 w-3 mr-1" /> Edit
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* -- Tab: WiFi -- */}
              {detailTab === "wifi" && (
                <div className="space-y-3">
                  {(!detailDevice.wifiInterfaces || detailDevice.wifiInterfaces.length === 0) ? (
                    <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                      <WifiOff className="h-8 w-8" />
                      <p className="text-sm">Tidak ada interface WiFi</p>
                    </div>
                  ) : (
                    detailDevice.wifiInterfaces.map((wf) => (
                      <Card key={wf.index} className="border">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Wifi className="h-4 w-4 text-blue-500" />
                              <span className="font-semibold text-base">{wf.ssid || `WLAN ${wf.index}`}</span>
                            </div>
                            <Badge
                              variant={wf.enabled ? "default" : "secondary"}
                              className={wf.enabled ? "bg-success hover:brightness-95 text-[10px]" : "text-[10px]"}
                            >
                              {wf.enabled ? "Enabled" : "Disabled"}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                            <div className="space-y-0.5">
                              <div className="text-xs text-muted-foreground">Password</div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs">
                                  {showPasswords[wf.index] ? wf.password || "\u2014" : "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"}
                                </span>
                                <button
                                  onClick={() => setShowPasswords((p) => ({ ...p, [wf.index]: !p[wf.index] }))}
                                  className="p-0.5 rounded hover:bg-muted"
                                >
                                  {showPasswords[wf.index] ? (
                                    <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                                  ) : (
                                    <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                                  )}
                                </button>
                              </div>
                            </div>
                            <InfoItem label="Security" value={wf.securityMode || "\u2014"} />
                          </div>

                          {/* Edit WiFi inline form */}
                          {wifiEditIndex === wf.index ? (
                            <div className="border-t pt-3 space-y-2">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <label className="text-xs font-medium">SSID Baru</label>
                                  <Input
                                    value={wifiEditSsid}
                                    onChange={(e) => setWifiEditSsid(e.target.value)}
                                    placeholder="SSID"
                                    className="h-8 text-sm"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-xs font-medium">Password Baru</label>
                                  <Input
                                    value={wifiEditPassword}
                                    onChange={(e) => setWifiEditPassword(e.target.value)}
                                    placeholder="Password"
                                    className="h-8 text-sm"
                                  />
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  disabled={(!wifiEditSsid.trim() && !wifiEditPassword.trim()) || wifiEditMut.isPending}
                                  onClick={() =>
                                    wifiEditMut.mutate({
                                      id: detailDevice.deviceId,
                                      wlanIndex: wf.index,
                                      ssid: wifiEditSsid.trim() || wf.ssid,
                                      password: wifiEditPassword.trim() || wf.password,
                                    })
                                  }
                                >
                                  {wifiEditMut.isPending ? (
                                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Save className="mr-1.5 h-3.5 w-3.5" />
                                  )}
                                  Simpan
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setWifiEditIndex(null);
                                    setWifiEditSsid("");
                                    setWifiEditPassword("");
                                  }}
                                >
                                  Batal
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setWifiEditIndex(wf.index);
                                setWifiEditSsid(wf.ssid);
                                setWifiEditPassword(wf.password);
                              }}
                            >
                              <Edit3 className="mr-1.5 h-3.5 w-3.5" />
                              Edit WiFi
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              )}

              {/* -- Tab: Connected Devices -- */}
              {detailTab === "hosts" && (
                <div className="space-y-3">
                  {(!detailDevice.connectedHosts || detailDevice.connectedHosts.length === 0) ? (
                    <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                      <Users className="h-8 w-8" />
                      <p className="text-sm">Tidak ada perangkat terhubung</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50 text-left">
                            <th className="whitespace-nowrap px-3 py-2 font-medium text-xs">IP Address</th>
                            <th className="whitespace-nowrap px-3 py-2 font-medium text-xs">MAC Address</th>
                            <th className="whitespace-nowrap px-3 py-2 font-medium text-xs">Hostname</th>
                            <th className="whitespace-nowrap px-3 py-2 font-medium text-xs">Interface</th>
                            <th className="whitespace-nowrap px-3 py-2 font-medium text-xs">Active</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailDevice.connectedHosts.map((host, i) => (
                            <tr key={i} className="border-b last:border-0">
                              <td className="px-3 py-2 font-mono text-xs">{host.ipAddress || "\u2014"}</td>
                              <td className="px-3 py-2 font-mono text-xs">{host.macAddress || "\u2014"}</td>
                              <td className="px-3 py-2 text-xs">{host.hostName || "\u2014"}</td>
                              <td className="px-3 py-2 text-xs">{host.interfaceType || "\u2014"}</td>
                              <td className="px-3 py-2">
                                <Badge
                                  variant={host.active ? "default" : "secondary"}
                                  className={`text-[10px] ${host.active ? "bg-success hover:brightness-95" : ""}`}
                                >
                                  {host.active ? "Active" : "Inactive"}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* -- Tab: Actions -- */}
              {detailTab === "actions" && (
                <div className="space-y-6">
                  {/* Action Buttons */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Aksi Perangkat</h4>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => summonMut.mutate(detailDevice.deviceId)}
                        disabled={summonMut.isPending}
                      >
                        {summonMut.isPending ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Summon Device
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => refreshMut.mutate(detailDevice.deviceId)}
                        disabled={refreshMut.isPending}
                      >
                        {refreshMut.isPending ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Refresh Parameters
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-warning/30 text-warning hover:bg-warning/10"
                        onClick={() => setConfirmReboot(detailDevice.deviceId)}
                        disabled={rebootMut.isPending}
                      >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                        Reboot Device
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setConfirmDelete(detailDevice.deviceId)}
                        disabled={deleteMut.isPending}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Delete Device
                      </Button>
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Tag className="h-4 w-4" />
                      Tags
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {(detailDevice.tags ?? []).map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="flex items-center gap-1 pr-1"
                        >
                          {tag}
                          <button
                            onClick={() =>
                              removeTagMut.mutate({ id: detailDevice.deviceId, tag })
                            }
                            className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                            disabled={removeTagMut.isPending}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                      {(detailDevice.tags ?? []).length === 0 && (
                        <span className="text-xs text-muted-foreground">Belum ada tag</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Tag baru..."
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        className="h-8 text-sm"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newTag.trim()) {
                            addTagMut.mutate({ id: detailDevice.deviceId, tag: newTag.trim() });
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        disabled={!newTag.trim() || addTagMut.isPending}
                        onClick={() =>
                          addTagMut.mutate({ id: detailDevice.deviceId, tag: newTag.trim() })
                        }
                      >
                        {addTagMut.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Plus className="h-3.5 w-3.5 mr-1" />
                        )}
                        Tambah
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* -- Reboot Confirmation ---------------------------------------------- */}
      <AlertDialog
        open={!!confirmReboot}
        onOpenChange={(o) => !o && setConfirmReboot(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Konfirmasi Reboot</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin me-reboot perangkat ini? Perangkat akan offline
              sementara selama proses reboot.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-warning hover:brightness-95"
              onClick={() => confirmReboot && rebootMut.mutate(confirmReboot)}
            >
              {rebootMut.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              )}
              Ya, Reboot
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* -- Delete Confirmation ---------------------------------------------- */}
      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Konfirmasi Hapus Perangkat</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus perangkat ini dari GenieACS? Tindakan ini
              tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:brightness-95"
              onClick={() => confirmDelete && deleteMut.mutate(confirmDelete)}
            >
              {deleteMut.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              Ya, Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Header({ onRefresh, refreshing }: { onRefresh: () => void; refreshing: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Cpu className="h-6 w-6" />
          Perangkat ONT
        </h1>
        <p className="text-sm text-muted-foreground">
          Manajemen perangkat CPE/ONT via GenieACS TR-069
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
        {refreshing ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="mr-1.5 h-4 w-4" />
        )}
        Refresh
      </Button>
    </div>
  );
}

function StatCard({
  label,
  value,
  loading,
  color,
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
  color: "blue" | "green" | "red";
}) {
  const colors = {
    blue: "border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30",
    green: "border-success/30 bg-success/10",
    red: "border-destructive/30 bg-destructive/10",
  };
  const textColors = {
    blue: "text-blue-700 dark:text-blue-400",
    green: "text-success",
    red: "text-destructive",
  };

  return (
    <Card className={`border ${colors[color]}`}>
      <CardContent className="p-4">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-bold ${textColors[color]}`}>
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            (value ?? 0).toLocaleString("id-ID")
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function InfoItem({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | undefined | null;
  mono?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-sm ${mono ? "font-mono" : ""}`}>{value || "\u2014"}</div>
    </div>
  );
}
