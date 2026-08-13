import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Activity, Users, Trophy, Clock, TrendingUp, RefreshCw, Filter, Loader2,
  UserCheck, Zap, Calendar as CalIcon, BarChart3, Trash2, Info,
} from "lucide-react";
import { toast } from "sonner";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend,
} from "recharts";

interface AuditLog {
  id: number;
  userId: number | null;
  username: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: number | null;
  entityName: string | null;
  details: string | null;
  createdAt: string | null;
}

interface TopUser {
  userId: number;
  username: string;
  userName: string;
  actionCount: number;
  loginCount: number;
  lastSeen: string | null;
}

interface TopFeature {
  entityType: string;
  action: string;
  count: number;
}

interface DailyActivity {
  date: string;
  actions: number;
  logins: number;
  uniqueUsers: number;
}

interface ActivityStats {
  totalActions: number;
  totalLogins: number;
  activeUsers: number;
  topUsers: TopUser[];
  topFeatures: TopFeature[];
  dailyActivity: DailyActivity[];
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-success/15 text-success",
  UPDATE: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  DELETE: "bg-destructive/15 text-destructive",
  LOGIN: "bg-success/15 text-success",
  LOGOUT: "bg-muted text-muted-foreground",
  LOGIN_FAILED: "bg-warning/15 text-warning",
  LOGIN_BLOCKED: "bg-destructive/15 text-destructive",
  SYNC: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
  TRIGGER: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
  CLEANUP: "bg-muted text-muted-foreground",
};

const ENTITY_LABELS: Record<string, string> = {
  auth: "Autentikasi",
  user: "User",
  role: "Role",
  customer: "Pelanggan",
  collection: "Collection",
  collection_settings: "Collection Settings",
  collection_thresholds: "Collection Threshold",
  lead: "Lead",
  ticket: "Tiket",
  pop: "POP", odc: "ODC", odp: "ODP", pole: "Tiang",
  cable: "Kabel", otb: "OTB", bestray: "Bestray",
  splitter: "Splitter", cable_core: "Core",
  core_connection: "Koneksi Core",
  profile: "Profil",
  mikrotik_router: "MikroTik",
  device: "Device GenieACS",
  mpwa_template: "Template MPWA",
  mpwa: "MPWA",
  billing: "Billing Sync",
  audit_logs: "Audit",
};

function fmtDateTime(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}
function fmtDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtRelative(iso: string | null) {
  if (!iso) return "-";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "baru saja";
  if (mins < 60) return `${mins}m lalu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}j lalu`;
  const days = Math.floor(hrs / 24);
  return `${days}h lalu`;
}

export default function AuditLogPage() {
  const [sinceDays, setSinceDays] = useState(7);
  const [actionFilter, setActionFilter] = useState("ALL");
  const [entityFilter, setEntityFilter] = useState("ALL");
  const [userFilter, setUserFilter] = useState<number | "ALL">("ALL");
  const qc = useQueryClient();

  // Stats (top of page - productivity dashboard)
  const { data: stats, isLoading: statsLoading } = useQuery<ActivityStats>({
    queryKey: ["/api/activity/stats", sinceDays],
    queryFn: () => api.get<ActivityStats>(`/activity/stats?sinceDays=${sinceDays}`),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  // Raw log (bottom - with filter)
  const qParams = new URLSearchParams();
  qParams.set("limit", "500");
  qParams.set("sinceDays", String(sinceDays));
  if (userFilter !== "ALL") qParams.set("userId", String(userFilter));
  if (actionFilter !== "ALL") qParams.set("action", actionFilter);
  if (entityFilter !== "ALL") qParams.set("entityType", entityFilter);

  const { data: logs = [], isLoading: logsLoading, refetch } = useQuery<AuditLog[]>({
    queryKey: ["/api/audit-logs", qParams.toString()],
    queryFn: () => api.get<AuditLog[]>(`/audit-logs?${qParams.toString()}`),
    staleTime: 30_000,
  });

  const uniqueActions = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => set.add(l.action));
    return Array.from(set).sort();
  }, [logs]);

  const uniqueEntities = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => set.add(l.entityType));
    return Array.from(set).sort();
  }, [logs]);

  const cleanupMut = useMutation({
    mutationFn: () => api.post<{ deleted: number }>("/activity/cleanup-sync-logs", {}),
    onSuccess: (data: any) => {
      toast.success(`${data.deleted ?? 0} row billing-sync worker dihapus dari audit log`);
      qc.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      qc.invalidateQueries({ queryKey: ["/api/activity/stats"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const featureColors = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4"];

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
      {/* Header */}
      <div className="px-4 md:px-6 pt-4 md:pt-6 space-y-4 shrink-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-6 w-6 text-indigo-500" />
              Activity & Productivity
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Monitor login, penggunaan fitur, dan produktivitas tim. Sync billing otomatis tidak masuk log (cuma notifikasi kalau gagal).
            </p>
          </div>
          <div className="flex gap-2 items-center">
            {/* Period selector */}
            <div className="flex rounded-md border overflow-hidden text-xs">
              {[1, 7, 30].map((d) => (
                <button
                  key={d}
                  onClick={() => setSinceDays(d)}
                  className={`px-3 py-1.5 ${sinceDays === d ? "bg-primary text-primary-foreground" : "bg-transparent"}`}
                >
                  {d === 1 ? "24 jam" : `${d} hari`}
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={() => { refetch(); qc.invalidateQueries({ queryKey: ["/api/activity/stats"] }); }}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => cleanupMut.mutate()} disabled={cleanupMut.isPending} title="Hapus baris SYNC billing yang masih ada di log (one-time cleanup)">
              {cleanupMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase">
                <Zap className="h-3 w-3" /> Total Aktivitas
              </div>
              <div className="text-2xl font-bold mt-1 text-indigo-500">
                {statsLoading ? "-" : (stats?.totalActions ?? 0).toLocaleString("id-ID")}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">semua action</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase">
                <UserCheck className="h-3 w-3" /> Login
              </div>
              <div className="text-2xl font-bold mt-1 text-success">
                {statsLoading ? "-" : (stats?.totalLogins ?? 0).toLocaleString("id-ID")}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">kali login</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase">
                <Users className="h-3 w-3" /> User Aktif
              </div>
              <div className="text-2xl font-bold mt-1 text-warning">
                {statsLoading ? "-" : stats?.activeUsers ?? 0}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">user unik</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase">
                <Trophy className="h-3 w-3" /> Paling Rajin
              </div>
              <div className="text-sm font-bold mt-1 text-orange-500 truncate">
                {statsLoading ? "-" : stats?.topUsers?.[0]?.userName ?? "-"}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {stats?.topUsers?.[0] ? `${stats.topUsers[0].actionCount} aksi` : "belum ada data"}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Content scrollable */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-6 space-y-4 mt-4 kanban-scrollbar">
        {/* Daily activity chart + Top features */}
        <div className="grid md:grid-cols-3 gap-3">
          <Card className="md:col-span-2">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">Aktivitas Harian</span>
                </div>
                <span className="text-[10px] text-muted-foreground">{sinceDays} hari terakhir</span>
              </div>
              {statsLoading ? (
                <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading...
                </div>
              ) : !stats?.dailyActivity?.length ? (
                <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">
                  Belum ada data
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={stats.dailyActivity}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => fmtDate(d).replace(/\s\d{4}$/, "")} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ fontSize: 12 }}
                      labelFormatter={(d) => fmtDate(d as string)}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="actions" fill="#3b82f6" name="Total Aksi" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="logins" fill="#10b981" name="Login" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="uniqueUsers" fill="#f59e0b" name="User Unik" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Fitur Paling Sering Dipakai</span>
              </div>
              {statsLoading ? (
                <div className="py-4 flex items-center justify-center text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : !stats?.topFeatures?.length ? (
                <p className="text-xs text-muted-foreground text-center py-6">Belum ada data</p>
              ) : (
                <div className="space-y-1.5">
                  {stats.topFeatures.slice(0, 8).map((f, i) => {
                    const pct = stats.topFeatures[0] ? (f.count / stats.topFeatures[0].count) * 100 : 0;
                    return (
                      <div key={`${f.entityType}-${f.action}`} className="relative">
                        <div className="flex justify-between items-center text-xs mb-0.5 relative z-10 px-2 py-1">
                          <span className="truncate">
                            <span className="font-medium">{ENTITY_LABELS[f.entityType] ?? f.entityType}</span>
                            <span className="text-muted-foreground ml-1 text-[10px]">({f.action})</span>
                          </span>
                          <span className="font-mono tabular-nums font-bold ml-2 shrink-0">{f.count}</span>
                        </div>
                        <div
                          className="absolute top-0 left-0 h-full rounded transition-all"
                          style={{
                            width: `${pct}%`,
                            background: `${featureColors[i % featureColors.length]}15`,
                            borderLeft: `2px solid ${featureColors[i % featureColors.length]}`,
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Top Users leaderboard */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Leaderboard Produktivitas</span>
              <span className="text-[10px] text-muted-foreground ml-auto">{sinceDays} hari terakhir · klik untuk filter</span>
            </div>
            {statsLoading ? (
              <div className="py-4 flex items-center justify-center text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : !stats?.topUsers?.length ? (
              <p className="text-xs text-muted-foreground text-center py-6">Belum ada aktivitas user</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-2 pr-2 font-medium">#</th>
                      <th className="py-2 pr-2 font-medium">User</th>
                      <th className="py-2 pr-2 font-medium text-right">Aksi</th>
                      <th className="py-2 pr-2 font-medium text-right">Login</th>
                      <th className="py-2 pr-2 font-medium">Terakhir Aktif</th>
                      <th className="py-2 font-medium">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.topUsers.map((u, i) => {
                      const isTop = i === 0;
                      return (
                        <tr
                          key={u.userId}
                          className={`border-b hover:bg-muted/40 transition-colors cursor-pointer ${userFilter === u.userId ? "bg-primary/10" : ""}`}
                          onClick={() => setUserFilter(userFilter === u.userId ? "ALL" : u.userId)}
                        >
                          <td className="py-2 pr-2">
                            {isTop ? <Trophy className="h-4 w-4 text-warning" /> : <span className="text-muted-foreground">{i + 1}</span>}
                          </td>
                          <td className="py-2 pr-2">
                            <div className="font-medium">{u.userName}</div>
                            <div className="text-[10px] text-muted-foreground">@{u.username}</div>
                          </td>
                          <td className="py-2 pr-2 text-right font-mono font-bold tabular-nums">{u.actionCount.toLocaleString("id-ID")}</td>
                          <td className="py-2 pr-2 text-right font-mono tabular-nums text-success">{u.loginCount}</td>
                          <td className="py-2 pr-2 text-muted-foreground">
                            <div>{fmtRelative(u.lastSeen)}</div>
                            <div className="text-[10px]">{fmtDateTime(u.lastSeen)}</div>
                          </td>
                          <td className="py-2">
                            <Button
                              size="sm"
                              variant={userFilter === u.userId ? "default" : "outline"}
                              className="h-6 text-[10px] px-2"
                              onClick={(e) => { e.stopPropagation(); setUserFilter(userFilter === u.userId ? "ALL" : u.userId); }}
                            >
                              {userFilter === u.userId ? "✓ Filter ON" : "Filter"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Log filter + table */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Log Detail</span>
              <Badge variant="secondary" className="text-[10px]">{logs.length} rows</Badge>
              <div className="ml-auto flex gap-2 flex-wrap">
                {userFilter !== "ALL" && (
                  <Badge variant="secondary" className="text-[10px] gap-1">
                    User: {stats?.topUsers.find(u => u.userId === userFilter)?.userName ?? `#${userFilter}`}
                    <button onClick={() => setUserFilter("ALL")} className="hover:text-destructive">×</button>
                  </Badge>
                )}
                <select
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                  className="h-7 rounded-md border border-input bg-transparent px-2 text-xs"
                >
                  <option value="ALL">Semua Action</option>
                  {uniqueActions.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <select
                  value={entityFilter}
                  onChange={(e) => setEntityFilter(e.target.value)}
                  className="h-7 rounded-md border border-input bg-transparent px-2 text-xs"
                >
                  <option value="ALL">Semua Fitur</option>
                  {uniqueEntities.map((e) => <option key={e} value={e}>{ENTITY_LABELS[e] ?? e}</option>)}
                </select>
              </div>
            </div>

            {logsLoading ? (
              <div className="py-8 flex items-center justify-center text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading...
              </div>
            ) : logs.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                <Info className="h-6 w-6 mx-auto mb-2 opacity-40" />
                Tidak ada log yang match filter
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4 px-4">
                <table className="w-full text-xs">
                  <thead className="text-left text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-2 pr-2 font-medium whitespace-nowrap">Waktu</th>
                      <th className="py-2 pr-2 font-medium">User</th>
                      <th className="py-2 pr-2 font-medium">Action</th>
                      <th className="py-2 pr-2 font-medium">Fitur</th>
                      <th className="py-2 pr-2 font-medium">Target</th>
                      <th className="py-2 font-medium">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((l) => {
                      const colorClass = ACTION_COLORS[l.action] ?? "bg-muted text-muted-foreground";
                      let detailsStr = "";
                      if (l.details) {
                        try {
                          const obj = JSON.parse(l.details);
                          detailsStr = Object.entries(obj).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ");
                        } catch {
                          detailsStr = l.details;
                        }
                      }
                      return (
                        <tr key={l.id} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="py-2 pr-2 whitespace-nowrap">
                            <div>{fmtDateTime(l.createdAt)}</div>
                            <div className="text-[10px] text-muted-foreground">{fmtRelative(l.createdAt)}</div>
                          </td>
                          <td className="py-2 pr-2">
                            <div className="font-medium truncate max-w-[140px]" title={l.userName ?? l.username}>
                              {l.userName ?? l.username}
                            </div>
                            <div className="text-[10px] text-muted-foreground">@{l.username}</div>
                          </td>
                          <td className="py-2 pr-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${colorClass}`}>
                              {l.action}
                            </span>
                          </td>
                          <td className="py-2 pr-2 text-muted-foreground">
                            {ENTITY_LABELS[l.entityType] ?? l.entityType}
                          </td>
                          <td className="py-2 pr-2 truncate max-w-[140px]" title={l.entityName ?? `#${l.entityId ?? "-"}`}>
                            {l.entityName ?? (l.entityId ? `#${l.entityId}` : "-")}
                          </td>
                          <td className="py-2 text-muted-foreground text-[11px] max-w-md truncate" title={detailsStr}>
                            {detailsStr || "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
