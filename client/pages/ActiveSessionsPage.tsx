import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Activity, RefreshCw, Loader2, Search, X, Wifi, WifiOff,
  Users, Clock, ArrowUpFromLine, ArrowDownToLine, Unplug,
  Server, AlertTriangle, Timer, Network, Signal,
} from "lucide-react";

interface RouterSessionGroup {
  routerId: number;
  routerName: string;
  sessions: PppSession[];
  error?: string;
}

interface PppSession {
  id: string;
  ".id"?: string;
  name: string;
  service: string;
  callerId?: string;
  "caller-id"?: string;
  address?: string;
  uptime?: string;
  encoding?: string;
  sessionId?: string;
  "session-id"?: string;
  limitBytesIn?: number | string;
  limitBytesOut?: number | string;
  "limit-bytes-in"?: string;
  "limit-bytes-out"?: string;
  [key: string]: any;
}

type FlatSession = PppSession & { routerId: number; routerName: string };

interface SafeRouter {
  id: number;
  name: string;
  host: string;
}

function formatBytes(bytes: string | number | undefined): string {
  if (!bytes) return "0 B";
  const b = typeof bytes === "string" ? parseInt(bytes) : bytes;
  if (isNaN(b) || b === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatUptime(uptime: string | undefined): string {
  if (!uptime) return "—";
  return uptime
    .replace(/(\d+)w/g, "$1w ")
    .replace(/(\d+)d/g, "$1d ")
    .replace(/(\d+)h/g, "$1h ")
    .replace(/(\d+)m/g, "$1m ")
    .replace(/(\d+)s/g, "$1s")
    .trim();
}

function uptimeToSeconds(uptime: string | undefined): number {
  if (!uptime) return 0;
  let total = 0;
  const w = uptime.match(/(\d+)w/); if (w) total += parseInt(w[1]) * 604800;
  const d = uptime.match(/(\d+)d/); if (d) total += parseInt(d[1]) * 86400;
  const h = uptime.match(/(\d+)h/); if (h) total += parseInt(h[1]) * 3600;
  const m = uptime.match(/(\d+)m/); if (m) total += parseInt(m[1]) * 60;
  const s = uptime.match(/(\d+)s/); if (s) total += parseInt(s[1]);
  return total;
}

export default function ActiveSessionsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [routerFilter, setRouterFilter] = useState<string>("all");
  const [disconnectTarget, setDisconnectTarget] = useState<{
    routerId: number; routerName: string; sessionId: string; username: string;
  } | null>(null);

  // Fetch all routers (for filter dropdown)
  const { data: routers } = useQuery<SafeRouter[]>({
    queryKey: ["/api/mikrotik/routers"],
    queryFn: () => api.get<SafeRouter[]>("/mikrotik/routers"),
  });

  // Fetch active sessions from all routers
  const { data: sessionGroups, isLoading, isRefetching } = useQuery<RouterSessionGroup[]>({
    queryKey: ["/api/mikrotik/sessions/active"],
    queryFn: () => api.get<RouterSessionGroup[]>("/mikrotik/sessions/active"),
    refetchInterval: 30000, // auto-refresh every 30s
  });

  const disconnectMut = useMutation({
    mutationFn: (d: { routerId: number; sessionId: string }) =>
      api.post(`/mikrotik/routers/${d.routerId}/ppp/disconnect`, { sessionId: d.sessionId }),
    onSuccess: () => {
      toast.success("Sesi berhasil diputus");
      setDisconnectTarget(null);
      queryClient.invalidateQueries({ queryKey: ["/api/mikrotik/sessions/active"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Flatten + filter sessions
  const { allSessions, stats, routerErrors } = useMemo(() => {
    if (!sessionGroups) return { allSessions: [], stats: { total: 0, routers: 0, errors: 0 }, routerErrors: [] };
    const q = search.trim().toLowerCase();
    const flat: FlatSession[] = [];
    const errors: Array<{ name: string; error: string }> = [];
    let routerCount = 0;

    for (const group of sessionGroups) {
      if (group.error) {
        errors.push({ name: group.routerName, error: group.error });
        continue;
      }
      if (routerFilter !== "all" && group.routerId !== parseInt(routerFilter)) continue;
      routerCount++;
      for (const s of group.sessions) {
        if (q) {
          const hay = [s.name, s.address, s.callerId || s["caller-id"], s.service].filter(Boolean).join(" ").toLowerCase();
          if (!hay.includes(q)) continue;
        }
        flat.push({ ...s, routerId: group.routerId, routerName: group.routerName } as FlatSession);
      }
    }

    // Sort by uptime descending (longest first)
    flat.sort((a, b) => uptimeToSeconds(b.uptime) - uptimeToSeconds(a.uptime));

    return {
      allSessions: flat,
      stats: { total: flat.length, routers: routerCount, errors: errors.length },
      routerErrors: errors,
    };
  }, [sessionGroups, search, routerFilter]);

  const hasActiveFilter = search || routerFilter !== "all";

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">Sesi Aktif PPPoE</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Pantau semua koneksi PPPoE yang sedang aktif dari seluruh router MikroTik.
          </p>
        </div>
        <Button
          variant="outline" className="gap-2 shrink-0"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/mikrotik/sessions/active"] })}
          disabled={isRefetching}
        >
          {isRefetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Users} label="Total Online" value={stats.total} color="text-green-600" bg="bg-green-500/10" />
        <StatCard icon={Server} label="Router Aktif" value={stats.routers} color="text-blue-600" bg="bg-blue-500/10" />
        <StatCard icon={AlertTriangle} label="Router Error" value={stats.errors} color="text-red-600" bg="bg-red-500/10" />
        <div className="flex items-center gap-3 p-4 rounded-xl border border-border/60">
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
            <Timer className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-[11px] uppercase text-muted-foreground font-semibold">Auto-refresh</p>
            <p className="text-sm font-bold text-foreground">30 detik</p>
          </div>
        </div>
      </div>

      {/* Router Errors */}
      {routerErrors.length > 0 && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-4 space-y-1">
            <p className="text-xs font-semibold text-red-600 dark:text-red-400 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> Router tidak bisa dihubungi:
            </p>
            {routerErrors.map((e, i) => (
              <p key={i} className="text-xs text-red-600/80 dark:text-red-400/80 pl-5">
                <b>{e.name}</b>: {e.error}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Filter Bar */}
      <Card className="border-border/60">
        <CardContent className="p-3 md:p-4">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari username, IP address, MAC..."
                className="pl-9 h-9"
              />
              {search && (
                <button type="button" onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {routers && routers.length > 1 && (
              <select
                value={routerFilter} onChange={(e) => setRouterFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="all">Semua Router</option>
                {routers.map(r => (
                  <option key={r.id} value={String(r.id)}>{r.name}</option>
                ))}
              </select>
            )}
            {hasActiveFilter && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setRouterFilter("all"); }} className="gap-1 h-9">
                <X className="h-3.5 w-3.5" /> Reset
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Menampilkan <span className="font-semibold text-foreground">{allSessions.length}</span> sesi aktif
            {isRefetching && <span className="ml-2 text-primary">Memperbarui...</span>}
          </p>
        </CardContent>
      </Card>

      {/* Sessions Table */}
      {isLoading ? (
        <Card className="animate-pulse"><CardContent className="p-5"><div className="h-48 bg-muted rounded" /></CardContent></Card>
      ) : allSessions.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <WifiOff className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              {hasActiveFilter ? "Tidak ada sesi yang cocok dengan filter." : "Tidak ada sesi PPPoE aktif saat ini."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-[11px] uppercase text-muted-foreground font-semibold tracking-wider">
                <tr>
                  <th className="text-left py-3 px-4">Username</th>
                  <th className="text-left py-3 px-4 hidden md:table-cell">IP Address</th>
                  <th className="text-left py-3 px-4 hidden lg:table-cell">MAC (Caller-ID)</th>
                  <th className="text-left py-3 px-4">Uptime</th>
                  <th className="text-left py-3 px-4 hidden md:table-cell">Service</th>
                  <th className="text-left py-3 px-4 hidden xl:table-cell">Router</th>
                  <th className="text-right py-3 px-4">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {allSessions.map((s, i) => (
                  <tr key={`${s.routerId}-${s.id || s[".id"]}-${i}`} className="border-t border-border/60 hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                          <Signal className="h-3.5 w-3.5 text-green-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{s.name}</p>
                          <p className="text-[10px] text-muted-foreground font-mono md:hidden">{s.address || "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 hidden md:table-cell">
                      <span className="text-xs font-mono">{s.address || "—"}</span>
                    </td>
                    <td className="py-2.5 px-4 hidden lg:table-cell">
                      <span className="text-xs font-mono text-muted-foreground">{s.callerId || s["caller-id"] || "—"}</span>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs font-mono">{formatUptime(s.uptime)}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 hidden md:table-cell">
                      <Badge variant="outline" className="text-[10px] h-5">
                        {s.service || "pppoe"}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-4 hidden xl:table-cell">
                      <span className="text-xs text-muted-foreground">{s.routerName}</span>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <Button
                        variant="outline" size="sm"
                        className="h-7 text-xs gap-1 text-red-500 hover:bg-red-500/10 hover:text-red-600"
                        onClick={() => setDisconnectTarget({
                          routerId: s.routerId, routerName: s.routerName,
                          sessionId: s.id || s[".id"] || "", username: s.name,
                        })}
                      >
                        <Unplug className="h-3 w-3" /> Putus
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Disconnect Confirm */}
      <Dialog open={!!disconnectTarget} onOpenChange={(o) => !o && setDisconnectTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Unplug className="h-5 w-5 text-red-500" /> Putuskan Sesi PPPoE?
            </DialogTitle>
            <DialogDescription>
              User <b>{disconnectTarget?.username}</b> akan diputus dari <b>{disconnectTarget?.routerName}</b>.
              Perangkat akan otomatis mencoba reconnect jika auto-dial aktif.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setDisconnectTarget(null)}>Batal</Button>
            <Button
              variant="destructive"
              onClick={() => disconnectTarget && disconnectMut.mutate({
                routerId: disconnectTarget.routerId,
                sessionId: disconnectTarget.sessionId,
              })}
              disabled={disconnectMut.isPending}
              className="gap-2"
            >
              {disconnectMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Putuskan Sesi
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, bg }: {
  icon: any; label: string; value: number; color: string; bg: string;
}) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold leading-none">{label}</p>
          <p className="text-2xl font-bold text-foreground mt-1 leading-none tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
