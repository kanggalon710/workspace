import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ClipboardList, Calendar, Users, TrendingUp, MapPin,
  ChevronDown, ChevronUp, Search, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// -- Types -------------------------------------------------------------------
interface LeadEntry {
  id: number;
  name: string;
  stage: string;
  category: string;
  district?: string;
}

interface LogEntry {
  id: number;
  type: string;
  title: string;
  severity: string;
  createdAt: string;
}

interface DailySummary {
  userId: number;
  userName: string;
  date: string; // YYYY-MM-DD
  sessionCount: number;
  totalDurationMinutes: number;
  totalLeads: number;
  totalClosing: number;
  totalLogs: number;
  totalCritical: number;
  areas: string[];
  sessions: {
    id: number; name: string | null; startedAt: string; endedAt: string | null;
    durationMinutes: number; leadCount: number; closingCount: number;
    logCount: number; criticalLogCount: number; areas: string[];
    leads: LeadEntry[]; logs: LogEntry[];
  }[];
}

interface KPI {
  sessionsThisMonth: number;
  leadsPerSession: number;
  conversionRate: number;
  odpCovered: number;
  odpTotal: number;
  odpCoveragePercent: number;
  canvassRadiusM: number;
  uncoveredOdps: { id: number; name: string; district: string | null }[];
  totalDurationMinutes: number;
  totalLeads: number;
  totalClosing: number;
}

interface LeaderboardEntry {
  userId: number;
  name: string;
  sessions: number;
  leads: number;
  closing: number;
  rate: number;
}

interface HistoryResponse {
  range?: { from: string; to: string };
  sessions: DailySummary[];
  kpi: KPI;
  leaderboard: LeaderboardEntry[];
}

// -- Date range presets -------------------------------------------------------
type RangePreset = "7d" | "30d" | "month" | "custom";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function computeRange(preset: RangePreset, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date();
  const to = isoDate(now);
  if (preset === "7d") return { from: isoDate(new Date(now.getTime() - 6 * 86400000)), to };
  if (preset === "30d") return { from: isoDate(new Date(now.getTime() - 29 * 86400000)), to };
  if (preset === "month") return { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to };
  // custom
  return { from: customFrom, to: customTo };
}

const RANGE_LABELS: Record<RangePreset, string> = {
  "7d": "7 hari",
  "30d": "30 hari",
  month: "Bulan ini",
  custom: "Custom",
};

// -- Helpers -----------------------------------------------------------------
function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} menit`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} jam ${m} menit` : `${h} jam`;
}

function formatDurationShort(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}.${Math.round((m / 60) * 10)} jam` : `${h} jam`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const STAGE_LABELS: Record<string, string> = {
  new: "Prospek Baru",
  contacted: "Dihubungi",
  interested: "Tertarik",
  negotiation: "Negosiasi",
  won: "Closing",
  lost: "Tidak Jadi",
};

const STAGE_COLORS: Record<string, string> = {
  new: "bg-gray-100 text-gray-700",
  contacted: "bg-blue-100 text-blue-700",
  interested: "bg-purple-100 text-purple-700",
  negotiation: "bg-amber-100 text-amber-700",
  won: "bg-green-100 text-green-700",
  lost: "bg-red-100 text-red-700",
};

const LOG_TYPE_LABELS: Record<string, string> = {
  area_sepi: "Area Sepi",
  akses_sulit: "Akses Sulit",
  kompetitor: "Kompetitor",
  infrastruktur: "Infrastruktur",
  potensi_tinggi: "Potensi Tinggi",
  lainnya: "Lainnya",
};

const LOG_TYPE_COLORS: Record<string, string> = {
  area_sepi: "bg-gray-100 text-gray-700",
  akses_sulit: "bg-red-100 text-red-700",
  kompetitor: "bg-orange-100 text-orange-700",
  infrastruktur: "bg-blue-100 text-blue-700",
  potensi_tinggi: "bg-green-100 text-green-700",
  lainnya: "bg-gray-100 text-gray-700",
};

const SEVERITY_COLORS: Record<string, string> = {
  info: "bg-blue-100 text-blue-700",
  warning: "bg-amber-100 text-amber-700",
  critical: "bg-red-100 text-red-700",
};

const SEVERITY_LABELS: Record<string, string> = {
  info: "Info",
  warning: "Perhatian",
  critical: "Kritis",
};

const CAT_LABELS: Record<string, string> = {
  rumahan: "Rumahan",
  bisnis: "Bisnis",
  perkantoran: "Perkantoran",
  sekolah: "Sekolah",
  lainnya: "Lainnya",
};

const CAT_COLORS: Record<string, string> = {
  rumahan: "bg-green-100 text-green-700",
  bisnis: "bg-amber-100 text-amber-700",
  perkantoran: "bg-blue-100 text-blue-700",
  sekolah: "bg-purple-100 text-purple-700",
  lainnya: "bg-gray-100 text-gray-700",
};

// -- Skeleton ----------------------------------------------------------------
function CardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="h-4 bg-gray-200 rounded animate-pulse w-2/3" />
        <div className="h-3 bg-gray-200 rounded animate-pulse w-1/2" />
        <div className="h-3 bg-gray-200 rounded animate-pulse w-3/4" />
      </CardContent>
    </Card>
  );
}

function KpiSkeleton() {
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="h-3 bg-gray-200 rounded animate-pulse w-1/2" />
        <div className="h-6 bg-gray-200 rounded animate-pulse w-1/3" />
      </CardContent>
    </Card>
  );
}

// -- Component ---------------------------------------------------------------
export default function CanvassingHistoryPage() {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [userFilter, setUserFilter] = useState("all");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(0);

  // Date range filter
  const [rangePreset, setRangePreset] = useState<RangePreset>("30d");
  const [customFrom, setCustomFrom] = useState(() => isoDate(new Date(Date.now() - 29 * 86400000)));
  const [customTo, setCustomTo] = useState(() => isoDate(new Date()));
  const range = useMemo(
    () => computeRange(rangePreset, customFrom, customTo),
    [rangePreset, customFrom, customTo]
  );
  const rangeValid = !!range.from && !!range.to && range.from <= range.to;

  const { data, isLoading } = useQuery<HistoryResponse>({
    queryKey: ["canvassing_history", range.from, range.to],
    queryFn: () =>
      api.get<HistoryResponse>(
        `/marketing/canvassing/history?from=${range.from}&to=${range.to}`
      ),
    enabled: rangeValid,
    refetchInterval: 60_000,
  });

  const filteredSessions = useMemo(() => {
    if (!data?.sessions) return [];
    let list = data.sessions;

    if (userFilter !== "all") {
      const uid = parseInt(userFilter);
      list = list.filter((s) => s.userId === uid);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.userName.toLowerCase().includes(q) ||
          s.areas.some(a => a.toLowerCase().includes(q)) ||
          s.date.includes(q)
      );
    }

    return list;
  }, [data, userFilter, search]);

  // Pagination
  const totalFiltered = filteredSessions.length;
  const totalPages = Math.ceil(totalFiltered / pageSize);
  const paginatedSessions = useMemo(() => {
    const start = page * pageSize;
    return filteredSessions.slice(start, start + pageSize);
  }, [filteredSessions, page, pageSize]);

  const kpi = data?.kpi;
  const leaderboard = data?.leaderboard ?? [];
  const maxLeads = Math.max(...leaderboard.map((e) => e.leads), 1);
  const rangeShort =
    rangePreset === "month" ? "Bulan Ini"
    : rangePreset === "7d" ? "7 Hari"
    : rangePreset === "30d" ? "30 Hari"
    : "Periode Ini";

  return (
    <div className="min-h-screen bg-[#faf9f8] p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* -- Header -------------------------------------------------------- */}
      <div>
        <div className="flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-[#350800]" />
          <h1 className="text-xl md:text-2xl font-bold text-[#350800]">
            Riwayat Canvassing
          </h1>
        </div>
        <p className="text-sm text-[#755750] mt-1">
          Histori kunjungan tim dan performa canvassing
        </p>
      </div>

      {/* -- Range Filter -------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-[#755750]">
          <Calendar className="h-4 w-4" /> Periode
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["7d", "30d", "month", "custom"] as RangePreset[]).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={rangePreset === p ? "default" : "outline"}
              onClick={() => { setRangePreset(p); setPage(0); }}
            >
              {RANGE_LABELS[p]}
            </Button>
          ))}
        </div>
        {rangePreset === "custom" && (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={customFrom}
              max={customTo || undefined}
              onChange={(e) => { setCustomFrom(e.target.value); setPage(0); }}
              className="w-[150px]"
            />
            <span className="text-xs text-[#827472]">s/d</span>
            <Input
              type="date"
              value={customTo}
              min={customFrom || undefined}
              onChange={(e) => { setCustomTo(e.target.value); setPage(0); }}
              className="w-[150px]"
            />
          </div>
        )}
      </div>
      {!rangeValid && (
        <p className="text-xs text-red-600">Tanggal mulai harus sebelum atau sama dengan tanggal akhir.</p>
      )}

      {/* -- KPI Cards ----------------------------------------------------- */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <KpiSkeleton key={i} />
          ))}
        </div>
      ) : kpi ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-blue-200 bg-blue-50/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-blue-600 mb-1">
                  <Calendar className="h-4 w-4" />
                  <span className="text-xs font-medium">Sesi {rangeShort}</span>
                </div>
                <p className="text-2xl font-bold text-blue-700">
                  {kpi.sessionsThisMonth}
                </p>
              </CardContent>
            </Card>

            <Card className="border-green-200 bg-green-50/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-green-600 mb-1">
                  <Users className="h-4 w-4" />
                  <span className="text-xs font-medium">Lead per Sesi</span>
                </div>
                <p className="text-2xl font-bold text-green-700">
                  {kpi.leadsPerSession.toFixed(1)}
                </p>
              </CardContent>
            </Card>

            <Card className="border-purple-200 bg-purple-50/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-purple-600 mb-1">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs font-medium">Conversion Rate</span>
                </div>
                <p className="text-2xl font-bold text-purple-700">
                  {kpi.conversionRate.toFixed(1)}%
                </p>
              </CardContent>
            </Card>

            <Card className="border-amber-200 bg-amber-50/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-amber-600 mb-1">
                  <MapPin className="h-4 w-4" />
                  <span className="text-xs font-medium">Area ODP Tercanvass</span>
                </div>
                <p className="text-2xl font-bold text-amber-700">
                  {kpi.odpCovered}<span className="text-sm font-normal text-amber-500">/{kpi.odpTotal}</span>
                </p>
                <div className="mt-1.5">
                  <div className="h-1.5 bg-amber-200 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${Math.min(kpi.odpCoveragePercent, 100)}%` }} />
                  </div>
                  <p className="text-[10px] text-amber-600 mt-0.5">{kpi.odpCoveragePercent}% area sudah dikanvass</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-[#755750]">
            Total: {kpi.totalLeads} lead, {kpi.totalClosing} closing,{" "}
            {formatDurationShort(kpi.totalDurationMinutes)} di lapangan
            {data?.range ? ` (${formatDate(data.range.from)} - ${formatDate(data.range.to)})` : ""}
            {" "}• Radius canvass: {kpi.canvassRadiusM}m per ODP
          </p>

          {/* ODP Belum Tercanvass */}
          {kpi.uncoveredOdps && kpi.uncoveredOdps.length > 0 && (
            <Card className="border-orange-200 bg-orange-50/30">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-orange-600" />
                    <span className="text-xs font-bold text-orange-800">ODP Belum Tercanvass ({kpi.odpTotal - kpi.odpCovered})</span>
                  </div>
                  <span className="text-[10px] text-orange-500">Prioritas area canvassing berikutnya</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {kpi.uncoveredOdps.map(odp => (
                    <Badge key={odp.id} variant="outline" className="text-[10px] border-orange-300 text-orange-700 bg-white">
                      {odp.name}{odp.district ? ` • ${odp.district}` : ""}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : null}

      {/* -- Filter Bar ---------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#827472]" />
          <Input
            placeholder="Cari sesi, area, atau nama..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={userFilter} onValueChange={(v) => { setUserFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="Semua Tim" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Tim</SelectItem>
            {leaderboard.map((u) => (
              <SelectItem key={u.userId} value={String(u.userId)}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
          <SelectTrigger className="w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10 / hal</SelectItem>
            <SelectItem value="20">20 / hal</SelectItem>
            <SelectItem value="50">50 / hal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Result count */}
      <p className="text-xs text-[#827472]">{totalFiltered} sesi ditemukan{totalPages > 1 ? ` • Halaman ${page + 1} dari ${totalPages}` : ""}</p>

      {/* -- Session List -------------------------------------------------- */}
      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)
        ) : paginatedSessions.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <ClipboardList className="h-10 w-10 text-[#d3c3c0] mx-auto mb-3" />
              <p className="text-[#755750] font-medium">
                Tidak ada riwayat canvassing pada periode ini
              </p>
              <p className="text-xs text-[#827472] mt-1">
                Coba ubah filter periode atau pencarian
              </p>
            </CardContent>
          </Card>
        ) : (
          paginatedSessions.map((day) => {
            const numKey = day.userId * 1000000 + parseInt(day.date.replace(/-/g, "").slice(-6) || "0");
            const isExp = expandedId === numKey;
            return (
              <Card key={`${day.userId}-${day.date}`} className="overflow-hidden">
                <button
                  className="w-full text-left p-4 hover:bg-[#f4f3f2] transition-colors"
                  onClick={() => setExpandedId(isExp ? null : numKey)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      {/* User + date */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[#350800] text-sm">{day.userName}</span>
                        <Badge variant="outline" className="text-[10px]">{formatDate(day.date)}</Badge>
                        <span className="text-xs text-[#827472]">{day.sessionCount} sesi • {formatDurationShort(day.totalDurationMinutes)} lalu</span>
                      </div>

                      {/* Areas visited */}
                      {day.areas.length > 0 && (
                        <div className="flex items-center gap-1 text-xs text-[#504442] flex-wrap">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {day.areas.map((a, i) => (
                            <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">{a}</Badge>
                          ))}
                        </div>
                      )}

                      {/* Stats */}
                      <div className="flex items-center gap-3 text-xs text-[#504442] flex-wrap">
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{day.totalLeads} lead</span>
                        <span className="flex items-center gap-1 text-green-600">✓ {day.totalClosing} closing</span>
                        <span className="flex items-center gap-1"><ClipboardList className="h-3 w-3" />{day.totalLogs} laporan</span>
                        {day.totalCritical > 0 && <span className="flex items-center gap-1 text-red-600"><AlertTriangle className="h-3 w-3" />{day.totalCritical} kritis</span>}
                      </div>
                    </div>
                    <div className="shrink-0 pt-1">
                      {isExp ? <ChevronUp className="h-4 w-4 text-[#827472]" /> : <ChevronDown className="h-4 w-4 text-[#827472]" />}
                    </div>
                  </div>
                </button>

                {/* Expanded: per-session breakdown within the day */}
                {isExp && (
                  <div className="border-t px-4 pb-4 space-y-4 pt-3">
                    {day.sessions.map((sess, si) => (
                      <div key={sess.id} className="space-y-2">
                        <div className="flex items-center gap-2 text-xs">
                          <Badge variant="outline" className="text-[10px]">Sesi {si + 1}</Badge>
                          <span className="text-[#827472]">{formatTime(sess.startedAt)}{sess.endedAt ? ` - ${formatTime(sess.endedAt)}` : ""} ({formatDurationShort(sess.durationMinutes)} lalu)</span>
                          {sess.areas.length > 0 && <span className="text-[#504442]"> {sess.areas.join(", ")}</span>}
                        </div>

                        {/* Leads in this session */}
                        {sess.leads.length > 0 && (
                          <div className="ml-4 space-y-1">
                            {sess.leads.map(lead => (
                              <div key={lead.id} className="flex items-center gap-2 text-xs bg-[#f4f3f2] rounded px-2 py-1.5">
                                <span className="font-medium text-[#350800] flex-1">{lead.name}</span>
                                {lead.district && <span className="text-[#827472]">{lead.district}</span>}
                                <span className={cn("px-1.5 py-0.5 rounded-full text-[10px] font-medium", CAT_COLORS[lead.category] ?? "bg-gray-100 text-gray-700")}>{CAT_LABELS[lead.category] ?? lead.category}</span>
                                <span className={cn("px-1.5 py-0.5 rounded-full text-[10px] font-medium", STAGE_COLORS[lead.stage] ?? "bg-gray-100 text-gray-700")}>{STAGE_LABELS[lead.stage] ?? lead.stage}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Logs in this session */}
                        {sess.logs.length > 0 && (
                          <div className="ml-4 space-y-1">
                            {sess.logs.map(log => (
                              <div key={log.id} className="flex items-center gap-2 text-xs bg-amber-50 rounded px-2 py-1.5">
                                <span className={cn("px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0", LOG_TYPE_COLORS[log.type] ?? "bg-gray-100 text-gray-700")}>{LOG_TYPE_LABELS[log.type] ?? log.type}</span>
                                <span className="flex-1 text-[#350800] truncate">{log.title}</span>
                                <span className={cn("px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0", SEVERITY_COLORS[log.severity] ?? "bg-gray-100 text-gray-700")}>{SEVERITY_LABELS[log.severity] ?? log.severity}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {sess.leads.length === 0 && sess.logs.length === 0 && (
                          <p className="ml-4 text-xs text-[#827472] italic">Tidak ada lead atau laporan</p>
                        )}

                        {si < day.sessions.length - 1 && <hr className="border-dashed" />}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>

      {/* -- Pagination ---------------------------------------------------- */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Sebelumnya</Button>
          <span className="text-xs text-[#827472]">Hal {page + 1} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Selanjutnya</Button>
        </div>
      )}

      {/* -- Leaderboard --------------------------------------------------- */}
      {leaderboard.length > 0 && (
        <Card>
          <CardContent className="p-4 md:p-6">
            <h3 className="text-base font-semibold text-[#350800] mb-4">
              Peringkat Tim
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-[#827472]">
                    <th className="pb-2 pr-4 w-10">#</th>
                    <th className="pb-2 pr-4">Nama</th>
                    <th className="pb-2 pr-4 text-center">Sesi</th>
                    <th className="pb-2 pr-4 text-center">Lead</th>
                    <th className="pb-2 pr-4 text-center">Closing</th>
                    <th className="pb-2 pr-4 text-center">Rate</th>
                    <th className="pb-2 w-32 hidden sm:table-cell">Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry, idx) => {
                    const rank = idx + 1;
                    const medal =
                      rank === 1
                        ? "\uD83E\uDD47"
                        : rank === 2
                        ? "\uD83E\uDD48"
                        : rank === 3
                        ? "\uD83E\uDD49"
                        : String(rank);
                    const rateColor =
                      entry.rate >= 30
                        ? "text-green-600"
                        : entry.rate >= 15
                        ? "text-amber-600"
                        : "text-red-600";
                    const barPct = Math.round(
                      (entry.leads / maxLeads) * 100
                    );
                    const barColor =
                      entry.rate >= 30
                        ? "bg-green-500"
                        : entry.rate >= 15
                        ? "bg-amber-500"
                        : "bg-red-400";

                    return (
                      <tr key={entry.userId} className="border-b last:border-0">
                        <td className="py-2.5 pr-4 text-center font-medium">
                          {medal}
                        </td>
                        <td className="py-2.5 pr-4 font-medium text-[#350800]">
                          {entry.name}
                        </td>
                        <td className="py-2.5 pr-4 text-center text-[#504442]">
                          {entry.sessions}
                        </td>
                        <td className="py-2.5 pr-4 text-center text-[#504442]">
                          {entry.leads}
                        </td>
                        <td className="py-2.5 pr-4 text-center text-[#504442]">
                          {entry.closing}
                        </td>
                        <td
                          className={cn(
                            "py-2.5 pr-4 text-center font-semibold",
                            rateColor
                          )}
                        >
                          {entry.rate.toFixed(1)}%
                        </td>
                        <td className="py-2.5 hidden sm:table-cell">
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={cn("h-2 rounded-full", barColor)}
                              style={{ width: `${barPct}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
