import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Camera, MapPin, Calendar, User as UserIcon, AlertTriangle, Info, ShieldAlert,
  Trash2, ExternalLink, Search, X, RefreshCw, Loader2, FileText, Image as ImageIcon,
  TrendingUp, Clock, Download,
} from "lucide-react";
import { getAuthHeaders } from "@/lib/api";

// --- Types -----------------------------------------------------------------
interface Report {
  id: number;
  sessionId: number;
  userId: number;
  type: string;
  title: string;
  description: string | null;
  lat: number | null;
  lng: number | null;
  odpId: number | null;
  odpName: string | null;
  odpCode: string | null;
  severity: string;
  createdAt: string;
  hasPhoto: boolean;
  userName: string;
  userUsername: string;
}

interface ReportStats {
  total: number;
  withPhoto: number;
  critical: number;
  today: number;
  uniqueReporters: number;
}

// --- Config -----------------------------------------------------------------
const SEVERITY_CFG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  info: { label: "Info", color: "text-blue-700 dark:text-blue-300", bg: "bg-blue-100 dark:bg-blue-950/40", icon: Info },
  warning: { label: "Warning", color: "text-amber-700 dark:text-amber-300", bg: "bg-amber-100 dark:bg-amber-950/40", icon: AlertTriangle },
  critical: { label: "Kritis", color: "text-red-700 dark:text-red-300", bg: "bg-red-100 dark:bg-red-950/40", icon: ShieldAlert },
};

const TYPE_LABELS: Record<string, string> = {
  area_sepi: "Area Sepi",
  area_ramai: "Area Ramai",
  kendala: "Kendala",
  prospek_besar: "Prospek Besar",
  kompetitor: "Kompetitor",
  laporan_umum: "Laporan Umum",
  infrastruktur: "Infrastruktur",
};

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtRelative(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "baru saja";
  if (mins < 60) return `${mins}m lalu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}j lalu`;
  const days = Math.floor(hrs / 24);
  return `${days}h lalu`;
}

// --- Main Page -------------------------------------------------------------
export default function CanvassingReportsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isSupervisor = user?.role === "System-Admin"
                    || user?.role === "Admin"
                    || user?.role === "admin"
                    || user?.role === "Administrator" /* legacy */
                    || user?.role === "marketing_spv";

  const [sinceDays, setSinceDays] = useState(30);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<number | "all">("all");
  const [photoFilter, setPhotoFilter] = useState<"all" | "with" | "without">("all");
  const [searchQ, setSearchQ] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [zoomPhoto, setZoomPhoto] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      // Pakai qs yang sama → filter CSV sesuai filter list yang aktif
      const res = await fetch(`/api/marketing/canvassing/reports/export?${qs}`, {
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) throw new Error("Export gagal");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ts = new Date().toISOString().slice(0, 10);
      a.download = `laporan-lapangan-${ts}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`${reports.length} laporan diexport`);
    } catch (e: any) {
      toast.error(e?.message || "Gagal export");
    } finally {
      setExporting(false);
    }
  };

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(searchQ.trim()), 400);
    return () => clearTimeout(t);
  }, [searchQ]);

  // Build query string
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set("sinceDays", String(sinceDays));
    if (typeFilter !== "all") p.set("type", typeFilter);
    if (severityFilter !== "all") p.set("severity", severityFilter);
    if (userFilter !== "all") p.set("userId", String(userFilter));
    if (photoFilter === "with") p.set("hasPhoto", "true");
    if (photoFilter === "without") p.set("hasPhoto", "false");
    if (searchDebounced) p.set("search", searchDebounced);
    return p.toString();
  }, [sinceDays, typeFilter, severityFilter, userFilter, photoFilter, searchDebounced]);

  const { data: reports = [], isLoading, refetch, isFetching } = useQuery<Report[]>({
    queryKey: ["/api/marketing/canvassing/reports", qs],
    queryFn: () => api.get<Report[]>(`/marketing/canvassing/reports?${qs}`),
    staleTime: 30_000,
  });

  const { data: stats } = useQuery<ReportStats>({
    queryKey: ["/api/marketing/canvassing/reports/stats", sinceDays],
    queryFn: () => api.get<ReportStats>(`/marketing/canvassing/reports/stats?sinceDays=${sinceDays}`),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["users_list"],
    queryFn: () => api.get<any[]>("/users"),
    staleTime: 5 * 60_000,
    enabled: isSupervisor,
  });

  const marketingUsers = useMemo(
    () => users.filter((u: any) => ["marketing", "marketing_spv", "admin"].includes(u.role)),
    [users]
  );

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/marketing/canvassing/logs/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/marketing/canvassing/reports"] });
      qc.invalidateQueries({ queryKey: ["/api/marketing/canvassing/reports/stats"] });
      toast.success("Laporan dihapus");
      setDeleteId(null);
      setSelectedId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Uniques from loaded data for filter options
  const uniqueTypes = useMemo(() => Array.from(new Set(reports.map(r => r.type))).sort(), [reports]);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
      {/* Header */}
      <div className="px-4 md:px-6 pt-4 md:pt-6 space-y-4 shrink-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Camera className="h-6 w-6 text-blue-500" />
              Laporan Lapangan
              {!isSupervisor && <Badge variant="secondary" className="text-[10px]">Laporan Saya</Badge>}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isSupervisor
                ? "Review laporan + foto dari tim canvassing lapangan. Klik kartu untuk lihat detail & foto bukti."
                : "Laporan lapangan yang kamu submit selama canvassing."}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            {/* Period selector */}
            <div className="flex rounded-md border overflow-hidden text-xs">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setSinceDays(d)}
                  className={`px-3 py-1.5 ${sinceDays === d ? "bg-primary text-primary-foreground" : "bg-transparent"}`}
                >
                  {d} hari
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportCsv}
              disabled={exporting || reports.length === 0}
              title="Download CSV sesuai filter aktif"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              <span className="ml-1 hidden sm:inline">Export CSV</span>
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
                <FileText className="h-3 w-3" /> Total
              </div>
              <div className="text-2xl font-bold mt-0.5 text-indigo-500">{stats?.total ?? 0}</div>
              <div className="text-[10px] text-muted-foreground">{sinceDays} hari terakhir</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
                <Clock className="h-3 w-3" /> Hari Ini
              </div>
              <div className="text-2xl font-bold mt-0.5 text-emerald-500">{stats?.today ?? 0}</div>
              <div className="text-[10px] text-muted-foreground">laporan baru</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
                <Camera className="h-3 w-3" /> Dengan Foto
              </div>
              <div className="text-2xl font-bold mt-0.5 text-blue-500">{stats?.withPhoto ?? 0}</div>
              <div className="text-[10px] text-muted-foreground">
                {stats?.total ? `${Math.round((stats.withPhoto / stats.total) * 100)}% dari total` : "-"}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
                <AlertTriangle className="h-3 w-3" /> Kritis
              </div>
              <div className="text-2xl font-bold mt-0.5 text-red-500">{stats?.critical ?? 0}</div>
              <div className="text-[10px] text-muted-foreground">butuh follow up</div>
            </CardContent>
          </Card>
        </div>

        {/* Filter bar */}
        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Cari judul / deskripsi..."
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              className="pl-7 h-8 text-xs"
            />
            {searchQ && (
              <button onClick={() => setSearchQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs">
            <option value="all">Semua Jenis</option>
            {uniqueTypes.map(t => <option key={t} value={t}>{TYPE_LABELS[t] ?? t}</option>)}
          </select>
          <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs">
            <option value="all">Semua Severity</option>
            <option value="critical">Kritis</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
          <select value={photoFilter} onChange={(e) => setPhotoFilter(e.target.value as any)}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs">
            <option value="all">Semua Foto</option>
            <option value="with">Dengan Foto</option>
            <option value="without">Tanpa Foto</option>
          </select>
          {isSupervisor && (
            <select value={String(userFilter)} onChange={(e) => setUserFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="h-8 rounded-md border border-input bg-transparent px-2 text-xs">
              <option value="all">Semua Tim</option>
              {marketingUsers.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
          {(typeFilter !== "all" || severityFilter !== "all" || photoFilter !== "all" || userFilter !== "all" || searchQ) && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => {
              setTypeFilter("all"); setSeverityFilter("all"); setPhotoFilter("all"); setUserFilter("all"); setSearchQ("");
            }}>
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* List view - row-based, click to open detail popup */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 kanban-scrollbar">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <FileText className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">Tidak ada laporan</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              {searchQ || typeFilter !== "all" || severityFilter !== "all"
                ? "Coba ubah filter atau reset"
                : "Laporan dari tim canvassing akan muncul di sini"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* List header - visual scan helper */}
            <div className="hidden md:grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-3 px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold border-b">
              <div className="w-12">Foto</div>
              <div>Judul & Jenis</div>
              <div className="min-w-[90px]">Severity</div>
              <div className="min-w-[120px]">Pelapor</div>
              <div className="min-w-[120px]">Waktu</div>
              <div className="min-w-[120px]">Lokasi</div>
            </div>
            {reports.map((r) => (
              <ReportListRow key={r.id} report={r} onClick={() => setSelectedId(r.id)} />
            ))}
          </div>
        )}
      </div>

      {/* Detail dialog */}
      <ReportDetailDialog
        id={selectedId}
        reports={reports}
        onClose={() => setSelectedId(null)}
        onDelete={(id) => setDeleteId(id)}
        onZoomPhoto={(url) => setZoomPhoto(url)}
        canDelete={(r) => isSupervisor || r.userId === user?.id}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Laporan?</AlertDialogTitle>
            <AlertDialogDescription>
              Laporan akan dihapus permanen beserta foto bukti. Tindakan ini tidak bisa dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMut.mutate(deleteId)}
              className="bg-red-500 hover:bg-red-600"
            >
              Hapus Permanen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Fullscreen photo zoom */}
      {zoomPhoto && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center cursor-pointer"
          onClick={() => setZoomPhoto(null)}
        >
          <button
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm text-white flex items-center justify-center hover:bg-white/20"
            onClick={(e) => { e.stopPropagation(); setZoomPhoto(null); }}
          >
            <X className="h-5 w-5" />
          </button>
          <img src={zoomPhoto} alt="Zoom" className="max-w-full max-h-full object-contain" onClick={(e) => e.stopPropagation()} />
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-xs">
            Klik di luar untuk tutup
          </div>
        </div>
      )}
    </div>
  );
}

// --- ReportListRow ---------------------------------------------------------
// Row-based list - foto thumbnail kecil di kiri, click buka popup detail
function ReportListRow({ report, onClick }: { report: Report; onClick: () => void }) {
  const sev = SEVERITY_CFG[report.severity] ?? SEVERITY_CFG.info;
  const SevIcon = sev.icon;

  // Foto di-serve langsung sebagai binary via /api/.../photo endpoint (browser cache jalan)
  const photoUrl = report.hasPhoto ? `/api/marketing/canvassing/reports/${report.id}/photo` : null;

  return (
    <div
      onClick={onClick}
      className="grid grid-cols-[auto_1fr_auto] md:grid-cols-[auto_1fr_auto_auto_auto_auto] gap-3 items-center px-3 py-2.5 rounded-lg border bg-card hover:bg-muted/40 hover:border-primary/30 cursor-pointer transition-colors"
    >
      {/* Thumbnail 48px */}
      <div className={`w-12 h-12 rounded-md overflow-hidden flex items-center justify-center shrink-0 ${sev.bg}`}>
        {photoUrl ? (
          <img src={photoUrl} alt={report.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <SevIcon className={`h-5 w-5 ${sev.color}`} />
        )}
      </div>

      {/* Title + type */}
      <div className="min-w-0">
        <div className="font-semibold text-sm truncate">{report.title}</div>
        <div className="text-[11px] text-muted-foreground truncate">
          {TYPE_LABELS[report.type] ?? report.type}
          {report.description && ` · ${report.description.slice(0, 60)}${report.description.length > 60 ? "…" : ""}`}
        </div>
      </div>

      {/* Severity badge (mobile: hidden, tampil di row bawah; desktop: inline) */}
      <div className="hidden md:block">
        <Badge className={`${sev.bg} ${sev.color} text-[10px] border-0 font-bold whitespace-nowrap`}>
          <SevIcon className="h-3 w-3 mr-1" /> {sev.label}
        </Badge>
      </div>

      {/* Reporter (desktop only) */}
      <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground min-w-[110px]">
        <UserIcon className="h-3 w-3 shrink-0" />
        <span className="truncate">{report.userName}</span>
      </div>

      {/* Time (desktop only) */}
      <div className="hidden md:block text-xs text-muted-foreground min-w-[100px]" title={fmtDateTime(report.createdAt)}>
        {fmtRelative(report.createdAt)}
      </div>

      {/* Location (desktop only) */}
      <div className="hidden md:flex items-center gap-1 text-[11px] text-muted-foreground min-w-[110px] max-w-[140px]">
        {report.odpName ? (
          <>
            <MapPin className="h-3 w-3 text-primary/70 shrink-0" />
            <span className="truncate">{report.odpName}</span>
          </>
        ) : report.lat && report.lng ? (
          <>
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="font-mono truncate">{report.lat.toFixed(3)}, {report.lng.toFixed(3)}</span>
          </>
        ) : (
          <span className="italic">-</span>
        )}
      </div>

      {/* Chevron (mobile only - indicator it's clickable) */}
      <div className="md:hidden text-muted-foreground">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
}

// --- Detail Dialog ---------------------------------------------------------
function ReportDetailDialog({
  id, reports, onClose, onDelete, onZoomPhoto, canDelete,
}: {
  id: number | null;
  reports: Report[];
  onClose: () => void;
  onDelete: (id: number) => void;
  onZoomPhoto: (url: string) => void;
  canDelete: (r: Report) => boolean;
}) {
  const report = id ? reports.find(r => r.id === id) : null;

  const photoUrl = id && report?.hasPhoto ? `/api/marketing/canvassing/reports/${id}/photo` : null;

  if (!report) return null;

  const sev = SEVERITY_CFG[report.severity] ?? SEVERITY_CFG.info;
  const SevIcon = sev.icon;

  return (
    <Dialog open={!!id} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-hidden flex flex-col p-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <DialogTitle className="truncate">{report.title}</DialogTitle>
              <DialogDescription className="flex items-center gap-2 flex-wrap mt-1">
                <Badge className={`${sev.bg} ${sev.color} text-[10px] border-0 font-bold`}>
                  <SevIcon className="h-3 w-3 mr-1" /> {sev.label}
                </Badge>
                <span className="text-[11px] text-muted-foreground">
                  {TYPE_LABELS[report.type] ?? report.type} · #{report.id}
                </span>
              </DialogDescription>
            </div>
            {canDelete(report) && (
              <Button size="icon" variant="ghost" onClick={() => onDelete(report.id)} className="text-red-500 hover:bg-red-500/10 shrink-0">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4 mt-3">
          {/* Photo */}
          {photoUrl ? (
            <div
              className="rounded-lg overflow-hidden bg-muted cursor-pointer group relative"
              onClick={() => onZoomPhoto(photoUrl)}
            >
              <img src={photoUrl} alt={report.title} className="w-full max-h-[50vh] object-contain" />
              <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm text-white text-[10px] px-2 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                Klik untuk zoom
              </div>
            </div>
          ) : (
            <div className={`rounded-lg p-8 text-center ${sev.bg}`}>
              <SevIcon className={`h-12 w-12 mx-auto ${sev.color}`} />
              <p className={`text-xs font-bold uppercase tracking-wide mt-2 ${sev.color}`}>Tidak ada foto bukti</p>
            </div>
          )}

          {/* Description */}
          {report.description && (
            <div className="bg-muted/30 rounded-md p-3">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Deskripsi</Label>
              <p className="text-sm mt-1 whitespace-pre-wrap break-words">{report.description}</p>
            </div>
          )}

          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-muted/30 rounded-md px-2 py-1.5">
              <div className="text-[10px] text-muted-foreground flex items-center gap-1"><UserIcon className="h-3 w-3" /> Dilaporkan Oleh</div>
              <div className="font-medium truncate">{report.userName}</div>
              <div className="text-[10px] text-muted-foreground">@{report.userUsername}</div>
            </div>
            <div className="bg-muted/30 rounded-md px-2 py-1.5">
              <div className="text-[10px] text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> Waktu Laporan</div>
              <div className="font-medium">{fmtRelative(report.createdAt)}</div>
              <div className="text-[10px] text-muted-foreground">{fmtDateTime(report.createdAt)}</div>
            </div>
            {report.odpName && (
              <div className="bg-muted/30 rounded-md px-2 py-1.5 col-span-2">
                <div className="text-[10px] text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> ODP Terdekat</div>
                <div className="font-medium truncate">{report.odpName}</div>
                {report.odpCode && <div className="text-[10px] text-muted-foreground font-mono">{report.odpCode}</div>}
              </div>
            )}
            {report.lat != null && report.lng != null && (
              <div className="bg-muted/30 rounded-md px-2 py-1.5 col-span-2">
                <div className="text-[10px] text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> Koordinat GPS</div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <span className="font-mono text-[11px]">{report.lat.toFixed(6)}, {report.lng.toFixed(6)}</span>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${report.lat},${report.lng}`}
                    target="_blank" rel="noreferrer"
                    className="text-primary text-[10px] hover:underline inline-flex items-center gap-1"
                  >
                    Buka di Maps <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
