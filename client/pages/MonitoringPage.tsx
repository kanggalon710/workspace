import { useState, useRef, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Activity,
  RefreshCw,
  Loader2,
  Cpu,
  HardDrive,
  Clock,
  Server,
  Wifi,
  Network,
  Search,
  MonitorDot,
  ArrowDownToLine,
  ArrowUpFromLine,
  BarChart3,
  ScrollText,
  AlertTriangle,
  Info,
  ChevronDown,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SafeRouter {
  id: number;
  name: string;
  host: string;
  identity?: string | null;
  [key: string]: any;
}

interface SystemResource {
  [key: string]: any;
}

interface InterfaceInfo {
  id: string;
  name: string;
  type: string;
  running?: boolean;
  disabled?: boolean;
  mtu?: number;
  macAddress?: string;
  rxByte?: number;
  txByte?: number;
  [key: string]: any;
}

interface LogEntry {
  id: string;
  time?: string;
  topics?: string;
  message?: string;
  [key: string]: any;
}

interface TrafficPoint {
  time: string;
  rxMbps: number;
  txMbps: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ResourceBar({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: number;
  unit: string;
  color: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{unit}</span>
      </div>
      <div className="h-2.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <p className="text-right text-xs text-muted-foreground mt-0.5">
        {value}%
      </p>
    </div>
  );
}

function formatBytes(bytes: number | string | undefined): string {
  if (bytes === undefined || bytes === null) return "0 B";
  const b = typeof bytes === "string" ? parseInt(bytes) : bytes;
  if (isNaN(b) || b === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatUptime(uptime: string | undefined): string {
  if (!uptime) return "\u2014";
  return uptime
    .replace(/(\d+)w/g, "$1 minggu ")
    .replace(/(\d+)d/g, "$1 hari ")
    .replace(/(\d+)h/g, "$1j ")
    .replace(/(\d+)m/g, "$1m ")
    .replace(/(\d+)s/g, "$1d")
    .trim();
}

function getTopicColor(topics: string | undefined): string {
  if (!topics) return "";
  const t = topics.toLowerCase();
  if (t.includes("error") || t.includes("critical")) return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  if (t.includes("warning")) return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  if (t.includes("system")) return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
  if (t.includes("info")) return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MonitoringPage() {
  const [selectedRouter, setSelectedRouter] = useState<string>("");
  const [selectedInterface, setSelectedInterface] = useState<string>("");
  const [logFilter, setLogFilter] = useState("");
  const [chartTick, setChartTick] = useState(0);

  const trafficRef = useRef<TrafficPoint[]>([]);
  const lastBytesRef = useRef<{ rx: number; tx: number; ts: number } | null>(null);

  const routerId = selectedRouter ? parseInt(selectedRouter) : null;

  // ---- Routers list ----
  const {
    data: routers = [],
    isLoading: loadingRouters,
  } = useQuery<SafeRouter[]>({
    queryKey: ["mikrotik-routers"],
    queryFn: () => api.get("/mikrotik/routers"),
  });

  // ---- System Resource ----
  const {
    data: resource,
    isLoading: loadingResource,
    refetch: refetchResource,
  } = useQuery<SystemResource>({
    queryKey: ["mikrotik-resource", routerId],
    queryFn: () => api.get(`/mikrotik/routers/${routerId}/resource`),
    enabled: !!routerId,
    refetchInterval: 10000,
  });

  // ---- Interfaces ----
  const {
    data: interfaces = [],
    isLoading: loadingInterfaces,
  } = useQuery<InterfaceInfo[]>({
    queryKey: ["mikrotik-interfaces", routerId],
    queryFn: () => api.get(`/mikrotik/routers/${routerId}/interfaces`),
    enabled: !!routerId,
    refetchInterval: 10000,
  });

  // ---- PPPoE active ----
  const { data: pppActive } = useQuery<any>({
    queryKey: ["mikrotik-ppp-active", routerId],
    queryFn: () => api.get(`/mikrotik/routers/${routerId}/ppp/active`),
    enabled: !!routerId,
    refetchInterval: 10000,
  });

  // ---- IP Pools ----
  const { data: ipPools } = useQuery<any>({
    queryKey: ["mikrotik-ip-pool", routerId],
    queryFn: () => api.get(`/mikrotik/routers/${routerId}/ip/pool`),
    enabled: !!routerId,
    refetchInterval: 30000,
  });

  // ---- Logs ----
  const {
    data: logs = [],
    isLoading: loadingLogs,
  } = useQuery<LogEntry[]>({
    queryKey: ["mikrotik-logs", routerId],
    queryFn: () => api.get(`/mikrotik/routers/${routerId}/log?limit=100`),
    enabled: !!routerId,
    refetchInterval: 15000,
  });

  // ---- Traffic polling for selected interface ----
  useQuery<InterfaceInfo[]>({
    queryKey: ["mikrotik-traffic-poll", routerId, selectedInterface],
    queryFn: async () => {
      const data = await api.get<InterfaceInfo[]>(`/mikrotik/routers/${routerId}/interfaces`);
      // Process traffic delta in queryFn (not select) to ensure consistent side effects
      const iface = data.find((i: any) => i.name === selectedInterface);
      if (iface) {
        const now = Date.now();
        // Try multiple field names (routeros-client returns camelCase)
        const rxByte = Number((iface as any).rxByte ?? (iface as any)["rx-byte"] ?? 0);
        const txByte = Number((iface as any).txByte ?? (iface as any)["tx-byte"] ?? 0);

        if (lastBytesRef.current && rxByte > 0) {
          const dt = (now - lastBytesRef.current.ts) / 1000;
          if (dt > 1) { // Minimum 1 second between polls
            const rxDelta = rxByte - lastBytesRef.current.rx;
            const txDelta = txByte - lastBytesRef.current.tx;
            // Only add point if delta is positive (counter reset = skip)
            if (rxDelta >= 0 && txDelta >= 0) {
              const rxMbps = parseFloat(((rxDelta * 8) / dt / 1_000_000).toFixed(2));
              const txMbps = parseFloat(((txDelta * 8) / dt / 1_000_000).toFixed(2));
              const d = new Date();
              const timeStr = `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`;
              trafficRef.current = [...trafficRef.current.slice(-59), { time: timeStr, rxMbps, txMbps }];
              setChartTick((t) => t + 1);
            }
          }
        }
        lastBytesRef.current = { rx: rxByte, tx: txByte, ts: now };
      }
      return data;
    },
    enabled: !!routerId && !!selectedInterface,
    refetchInterval: 5000,
  });

  // Reset traffic data when interface or router changes
  const handleInterfaceChange = useCallback((val: string) => {
    setSelectedInterface(val);
    trafficRef.current = [];
    lastBytesRef.current = null;
    setChartTick(0);
  }, []);

  const handleRouterChange = useCallback((val: string) => {
    setSelectedRouter(val);
    setSelectedInterface("");
    trafficRef.current = [];
    lastBytesRef.current = null;
    setChartTick(0);
  }, []);

  // ---- Computed values ----
  const cpuLoad = resource ? parseInt(resource.cpuLoad || resource["cpu-load"] || "0") : 0;
  const totalMem = resource ? parseInt(resource.totalMemory || resource["total-memory"] || "0") : 0;
  const freeMem = resource ? parseInt(resource.freeMemory || resource["free-memory"] || "0") : 0;
  const usedMem = totalMem - freeMem;
  const memPercent = totalMem > 0 ? Math.round((usedMem / totalMem) * 100) : 0;

  const totalHdd = resource ? parseInt(resource.totalHddSpace || resource["total-hdd-space"] || "0") : 0;
  const freeHdd = resource ? parseInt(resource.freeHddSpace || resource["free-hdd-space"] || "0") : 0;
  const usedHdd = totalHdd - freeHdd;
  const diskPercent = totalHdd > 0 ? Math.round((usedHdd / totalHdd) * 100) : 0;

  const pppCount = Array.isArray(pppActive) ? pppActive.length : (typeof pppActive === "number" ? pppActive : 0);
  const poolList = Array.isArray(ipPools) ? ipPools : [];
  const interfaceCount = interfaces.length;

  const filteredLogs = useMemo(() => {
    if (!logFilter.trim()) return logs;
    const q = logFilter.toLowerCase();
    return logs.filter(
      (l) =>
        l.message?.toLowerCase().includes(q) ||
        l.topics?.toLowerCase().includes(q) ||
        l.time?.toLowerCase().includes(q)
    );
  }, [logs, logFilter]);

  const trafficData = trafficRef.current;
  const latestTraffic = trafficData.length > 0 ? trafficData[trafficData.length - 1] : null;

  // Force chartTick usage so React doesn't optimize it away
  void chartTick;

  const handleRefreshAll = () => {
    refetchResource();
    toast.success("Data diperbarui");
  };

  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ---- Section 1: Top Bar ---- */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <MonitorDot className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Monitoring</h1>
            <p className="text-muted-foreground text-sm">
              Dashboard pemantauan MikroTik real-time
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Select value={selectedRouter} onValueChange={handleRouterChange}>
            <SelectTrigger className="w-full sm:w-[240px]">
              <SelectValue placeholder="Pilih router..." />
            </SelectTrigger>
            <SelectContent>
              {routers.map((r) => (
                <SelectItem key={r.id} value={String(r.id)}>
                  {r.name} ({r.host})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            aria-label="Segarkan semua"
            onClick={handleRefreshAll}
            disabled={!routerId}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ---- No router selected ---- */}
      {!routerId && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Server className="h-16 w-16 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold mb-1">Belum Ada Router Dipilih</h3>
            <p className="text-muted-foreground text-sm max-w-md">
              Silakan pilih router MikroTik dari dropdown di atas untuk memulai monitoring.
            </p>
          </CardContent>
        </Card>
      )}

      {routerId && (
        <>
          {/* ---- Section 2: System Resource ---- */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Cpu className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">System Resource</h2>
                {loadingResource && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-2" />
                )}
              </div>

              {!resource && loadingResource ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : resource ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Resource Bars */}
                  <div className="space-y-4">
                    <ResourceBar
                      label="CPU"
                      value={cpuLoad}
                      unit={`${cpuLoad}%`}
                      color="bg-blue-500"
                    />
                    <ResourceBar
                      label="RAM"
                      value={memPercent}
                      unit={`${formatBytes(usedMem)} / ${formatBytes(totalMem)}`}
                      color="bg-purple-500"
                    />
                    <ResourceBar
                      label="Disk"
                      value={diskPercent}
                      unit={`${formatBytes(usedHdd)} / ${formatBytes(totalHdd)}`}
                      color="bg-amber-500"
                    />
                  </div>

                  {/* Info Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                      {
                        label: "Uptime",
                        value: formatUptime(resource.uptime),
                        icon: Clock,
                      },
                      {
                        label: "Versi",
                        value: resource.version || resource.routerOsVersion || "\u2014",
                        icon: Info,
                      },
                      {
                        label: "Board",
                        value: resource.boardName || resource["board-name"] || "\u2014",
                        icon: HardDrive,
                      },
                      {
                        label: "Arsitektur",
                        value: resource.architectureName || resource["architecture-name"] || "\u2014",
                        icon: Cpu,
                      },
                      {
                        label: "Platform",
                        value: resource.platform || "\u2014",
                        icon: Server,
                      },
                      {
                        label: "Identity",
                        value: resource.identity || "\u2014",
                        icon: MonitorDot,
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/50"
                      >
                        <item.icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">{item.label}</p>
                          <p className="text-sm font-medium truncate">{item.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center py-8 text-muted-foreground">
                  <AlertTriangle className="h-8 w-8 mb-2" />
                  <p className="text-sm">Gagal memuat data resource</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ---- Section 3: Summary Cards ---- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* PPPoE Online */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">PPPoE Online</p>
                    <p className="text-3xl font-bold mt-1">{pppCount}</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <Wifi className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Sesi PPPoE aktif saat ini</p>
              </CardContent>
            </Card>

            {/* IP Pool */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">IP Pool</p>
                    <p className="text-3xl font-bold mt-1">{poolList.length}</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <Network className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
                {poolList.length > 0 ? (
                  <div className="mt-2 space-y-0.5">
                    {poolList.slice(0, 2).map((p: any, i: number) => (
                      <p key={i} className="text-xs text-muted-foreground truncate">
                        {p.name}: {p.ranges || p.range || "\u2014"}
                      </p>
                    ))}
                    {poolList.length > 2 && (
                      <p className="text-xs text-muted-foreground">
                        +{poolList.length - 2} pool lainnya
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-2">Tidak ada pool</p>
                )}
              </CardContent>
            </Card>

            {/* Total Interface */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Interface</p>
                    <p className="text-3xl font-bold mt-1">{interfaceCount}</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                    <Activity className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {interfaces.filter((i) => i.running).length} aktif,{" "}
                  {interfaces.filter((i) => i.disabled).length} nonaktif
                </p>
              </CardContent>
            </Card>

            {/* Auto-refresh indicator */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Auto-Refresh</p>
                    <p className="text-lg font-bold mt-1 text-green-600 dark:text-green-400">
                      Aktif
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <RefreshCw className="h-6 w-6 text-emerald-600 dark:text-emerald-400 animate-spin" style={{ animationDuration: "3s" }} />
                  </div>
                </div>
                <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  <p>Resource & Interface: 10 dtk</p>
                  <p>Traffic: 5 dtk | Log: 15 dtk</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ---- Section 4: Traffic Chart ---- */}
          <Card>
            <CardContent className="p-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold">Traffic Real-time</h2>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <Select
                    value={selectedInterface}
                    onValueChange={handleInterfaceChange}
                  >
                    <SelectTrigger className="w-full sm:w-[220px]">
                      <SelectValue placeholder="Pilih interface..." />
                    </SelectTrigger>
                    <SelectContent>
                      {interfaces.map((iface) => (
                        <SelectItem key={iface.name} value={iface.name}>
                          {iface.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {!selectedInterface ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mb-3 opacity-40" />
                  <p className="text-sm">Pilih interface untuk melihat traffic real-time</p>
                </div>
              ) : (
                <>
                  {/* Current throughput display */}
                  {latestTraffic && (
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                        <ArrowDownToLine className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        <div>
                          <p className="text-xs text-muted-foreground">Download (RX)</p>
                          <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                            {latestTraffic.rxMbps.toFixed(2)} Mbps
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-orange-50 dark:bg-orange-950/30">
                        <ArrowUpFromLine className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                        <div>
                          <p className="text-xs text-muted-foreground">Upload (TX)</p>
                          <p className="text-xl font-bold text-orange-600 dark:text-orange-400">
                            {latestTraffic.txMbps.toFixed(2)} Mbps
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="h-[300px] w-full">
                    {trafficData.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin mb-2" />
                        <p className="text-sm">Mengumpulkan data traffic...</p>
                        <p className="text-xs mt-1">Data pertama muncul setelah ~10 detik</p>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={trafficData}
                          margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                          <XAxis
                            dataKey="time"
                            tick={{ fontSize: 11 }}
                            interval="preserveStartEnd"
                          />
                          <YAxis
                            tick={{ fontSize: 11 }}
                            unit=" Mbps"
                            width={80}
                          />
                          <Tooltip
                            contentStyle={{
                              borderRadius: "8px",
                              fontSize: "12px",
                            }}
                            formatter={(value: number, name: string) => [
                              `${value.toFixed(2)} Mbps`,
                              name === "rxMbps" ? "Download" : "Upload",
                            ]}
                          />
                          <Legend
                            formatter={(value) =>
                              value === "rxMbps" ? "Download (RX)" : "Upload (TX)"
                            }
                          />
                          <Line
                            type="monotone"
                            dataKey="rxMbps"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            dot={false}
                            name="rxMbps"
                          />
                          <Line
                            type="monotone"
                            dataKey="txMbps"
                            stroke="#f97316"
                            strokeWidth={2}
                            dot={false}
                            name="txMbps"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Histori 5 menit terakhir (maks. 60 titik data, polling setiap 5 detik)
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* ---- Section 5: Interface Table ---- */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Network className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Daftar Interface</h2>
                {loadingInterfaces && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-2" />
                )}
                <Badge variant="secondary" className="ml-auto">
                  {interfaceCount} interface
                </Badge>
              </div>

              {!interfaces.length && loadingInterfaces ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : interfaces.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-muted-foreground">
                  <Network className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">Tidak ada interface ditemukan</p>
                </div>
              ) : (
                <div className="overflow-x-auto -mx-5">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left px-5 py-2.5 font-medium">Nama</th>
                        <th className="text-left px-3 py-2.5 font-medium">Tipe</th>
                        <th className="text-left px-3 py-2.5 font-medium">Status</th>
                        <th className="text-right px-3 py-2.5 font-medium">TX</th>
                        <th className="text-right px-3 py-2.5 font-medium">RX</th>
                        <th className="text-right px-3 py-2.5 font-medium">MTU</th>
                        <th className="text-left px-3 py-2.5 font-medium hidden md:table-cell">
                          MAC Address
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {interfaces.map((iface) => (
                        <tr
                          key={iface.id || iface.name}
                          className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                        >
                          <td className="px-5 py-2.5 font-mono font-medium">
                            {iface.name}
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge variant="outline" className="text-xs">
                              {iface.type}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5">
                            {iface.disabled ? (
                              <Badge className="bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 text-xs">
                                Disabled
                              </Badge>
                            ) : iface.running ? (
                              <Badge className="bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 text-xs">
                                Running
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">
                                Idle
                              </Badge>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs">
                            {formatBytes(iface.txByte)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs">
                            {formatBytes(iface.rxByte)}
                          </td>
                          <td className="px-3 py-2.5 text-right text-xs">
                            {iface.mtu || "\u2014"}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-xs hidden md:table-cell">
                            {iface.macAddress || iface["mac-address"] || "\u2014"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ---- Section 6: Log Viewer ---- */}
          <Card>
            <CardContent className="p-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <ScrollText className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold">Log Router</h2>
                  {loadingLogs && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-2" />
                  )}
                </div>

                <div className="relative w-full sm:w-[280px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Filter log..."
                    value={logFilter}
                    onChange={(e) => setLogFilter(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              {!logs.length && loadingLogs ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-muted-foreground">
                  <ScrollText className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">
                    {logFilter ? "Tidak ada log yang sesuai filter" : "Tidak ada log ditemukan"}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto -mx-5 max-h-[400px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b bg-muted/80 backdrop-blur">
                        <th className="text-left px-5 py-2 font-medium w-[140px]">Waktu</th>
                        <th className="text-left px-3 py-2 font-medium w-[140px]">Topik</th>
                        <th className="text-left px-3 py-2 font-medium">Pesan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLogs.map((log, idx) => (
                        <tr
                          key={log.id || idx}
                          className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                        >
                          <td className="px-5 py-2 text-xs text-muted-foreground font-mono whitespace-nowrap">
                            {log.time || "\u2014"}
                          </td>
                          <td className="px-3 py-2">
                            {log.topics ? (
                              <div className="flex flex-wrap gap-1">
                                {log.topics.split(",").map((topic, i) => (
                                  <span
                                    key={i}
                                    className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${getTopicColor(topic.trim())}`}
                                  >
                                    {topic.trim()}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">\u2014</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {log.message || "\u2014"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="text-xs text-muted-foreground mt-3 text-center">
                Menampilkan {filteredLogs.length} dari {logs.length} entri log (auto-refresh 15 detik)
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
