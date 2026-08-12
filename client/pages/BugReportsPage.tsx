import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { compressImage } from "@/lib/imageCompress";
import { Card, CardContent } from "@/components/ui/card";
import { FullBleedPage } from "@/components/ui/full-bleed-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Bug, Plus, Loader2, Camera, X, Trash2, User as UserIcon,
  Clock, MessageSquare, Send, CheckCircle2, AlertCircle, AlertTriangle,
  Play, Eye, UserCheck, Archive,
} from "lucide-react";

type Severity = "low" | "medium" | "high" | "critical";
type Status = "open" | "triaged" | "in_progress" | "resolved" | "closed" | "duplicate" | "wontfix";

const SEVERITY_CFG: Record<string, { label: string; color: string; ring: string }> = {
  low:      { label: "Low",      color: "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300",        ring: "ring-slate-400" },
  medium:   { label: "Medium",   color: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",             ring: "ring-sky-400" },
  high:     { label: "High",     color: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",    ring: "ring-amber-400" },
  critical: { label: "Critical", color: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",        ring: "ring-rose-500" },
};

const STATUS_CFG: Record<string, { label: string; color: string; icon: any }> = {
  open:        { label: "Baru",        color: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",         icon: AlertCircle },
  triaged:     { label: "Di-triage",   color: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300", icon: Eye },
  in_progress: { label: "Dikerjakan",  color: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300", icon: Play },
  resolved:    { label: "Selesai",     color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300", icon: CheckCircle2 },
  closed:      { label: "Ditutup",     color: "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-400",    icon: Archive },
  duplicate:   { label: "Duplikat",    color: "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-400",    icon: Archive },
  wontfix:     { label: "Won't fix",   color: "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-400",    icon: Archive },
};

export default function BugReportsPage() {
  const { user, canWrite } = useAuth();
  const canTriage = canWrite("bug_reports");
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [viewFor, setViewFor] = useState<any | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [mineOnly, setMineOnly] = useState(false);

  const { data: stats } = useQuery<any>({
    queryKey: ["/api/bugs/stats"],
    queryFn: () => api.get("/bugs/stats"),
    refetchInterval: 60_000,
  });

  const queryStr = [
    statusFilter !== "all" ? `status=${statusFilter}` : "",
    severityFilter !== "all" ? `severity=${severityFilter}` : "",
    mineOnly ? "mine=true" : "",
  ].filter(Boolean).join("&");

  const { data: list = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/bugs", statusFilter, severityFilter, mineOnly],
    queryFn: () => api.get<any[]>(`/bugs${queryStr ? "?" + queryStr : ""}`),
    refetchInterval: 60_000,
  });

  return (
    <FullBleedPage>
      {/* Header - sticky */}
      <div className="sticky top-0 z-10 px-4 md:px-6 pt-4 md:pt-6 pb-4 space-y-4 shrink-0 bg-background border-b">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 md:gap-4 min-w-0 flex-1">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center shadow-lg shrink-0">
              <Bug className="h-5 w-5 md:h-6 md:w-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">Bug Reports</h1>
              <p className="text-xs md:text-sm text-muted-foreground mt-0.5 md:mt-1 max-w-2xl">
                <span className="hidden md:inline">Lapor bug atau issue yang kamu temui. Admin akan triage dan update status.</span>
                <span className="md:hidden">Lapor & track bug</span>
              </p>
            </div>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="bg-rose-600 hover:bg-rose-700 shrink-0">
            <Plus className="h-4 w-4 md:mr-1.5" />
            <span className="hidden md:inline">Lapor Bug</span>
            <span className="md:hidden">Lapor</span>
          </Button>
        </div>

        {/* Stats - 2 cols mobile, 4 cols desktop */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
            <StatTile label="Total" value={stats.total} />
            <StatTile label="Menunggu Triage" value={stats.byStatus.open} tone="sky" />
            <StatTile label="Dikerjakan" value={stats.byStatus.inProgress} tone="amber" />
            <StatTile label="Critical/High" value={stats.openBySeverity.critical + stats.openBySeverity.high} tone="rose" urgent={(stats.openBySeverity.critical + stats.openBySeverity.high) > 0} />
          </div>
        )}

        {/* Filters - horizontal scroll di mobile */}
        <div className="overflow-x-auto no-scrollbar -mx-4 md:mx-0 px-4 md:px-0">
          <div className="flex items-center gap-2 w-fit md:w-full">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32 md:w-36 h-8 text-xs shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                {Object.entries(STATUS_CFG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-32 md:w-36 h-8 text-xs shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Severity</SelectItem>
                {Object.entries(SEVERITY_CFG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-1.5 text-xs whitespace-nowrap shrink-0 px-2">
              <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
              <span className="hidden sm:inline">Yang saya lapor saja</span>
              <span className="sm:hidden">Saya lapor</span>
            </label>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 md:overflow-y-auto px-4 md:px-6 py-4">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : list.length === 0 ? (
          <Card>
            <CardContent className="py-12 md:py-16 text-center">
              <Bug className="h-10 w-10 md:h-12 md:w-12 text-muted-foreground/40 mx-auto mb-3" />
              <div className="font-semibold text-sm">Tidak ada bug</div>
              <div className="text-xs text-muted-foreground mt-1 px-4">Klik "Lapor" kalau nemu issue</div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {list.map((b) => (
              <BugRow key={b.id} b={b} onClick={() => setViewFor(b)} />
            ))}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <CreateBugDialog
        open={createOpen} onClose={() => setCreateOpen(false)}
        onSaved={() => { qc.invalidateQueries({ queryKey: ["/api/bugs"] }); qc.invalidateQueries({ queryKey: ["/api/bugs/stats"] }); setCreateOpen(false); }}
      />

      {/* View/triage dialog */}
      <BugDetailDialog
        open={!!viewFor} onClose={() => setViewFor(null)}
        bugId={viewFor?.id}
        canTriage={canTriage}
        currentUserId={user?.id}
        onUpdated={() => {
          qc.invalidateQueries({ queryKey: ["/api/bugs"] });
          qc.invalidateQueries({ queryKey: ["/api/bugs/stats"] });
        }}
      />
    </FullBleedPage>
  );
}

// ---------------------------------------------------------------------
function StatTile({ label, value, tone, urgent }: any) {
  const colors: Record<string, string> = {
    sky: "text-sky-600 dark:text-sky-400",
    amber: "text-amber-600 dark:text-amber-400",
    rose: "text-rose-600 dark:text-rose-400",
  };
  return (
    <Card className={urgent ? "ring-2 ring-rose-500 animate-pulse" : ""}>
      <CardContent className="p-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold tabular-nums mt-1 ${tone ? colors[tone] : ""}`}>{value ?? 0}</div>
      </CardContent>
    </Card>
  );
}

function BugRow({ b, onClick }: any) {
  const sev = SEVERITY_CFG[b.severity] ?? SEVERITY_CFG.medium;
  const stat = STATUS_CFG[b.status] ?? STATUS_CFG.open;
  const StatIcon = stat.icon;
  return (
    <Card className="hover:shadow-sm transition-all cursor-pointer" onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-1 h-full self-stretch rounded-full ${
            b.severity === "critical" ? "bg-rose-500"
            : b.severity === "high" ? "bg-amber-500"
            : b.severity === "medium" ? "bg-sky-500" : "bg-slate-400"
          }`} style={{ minHeight: 40 }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-mono text-[10px] text-muted-foreground">#{b.id}</span>
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${sev.color}`}>
                {sev.label}
              </span>
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${stat.color}`}>
                <StatIcon className="h-3 w-3" /> {stat.label}
              </span>
              {b.affectedFeature && (
                <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">{b.affectedFeature}</span>
              )}
            </div>
            <h4 className="font-semibold text-sm">{b.title}</h4>
            {b.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{b.description}</p>}
            <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground flex-wrap">
              <span className="inline-flex items-center gap-1">
                <UserIcon className="h-3 w-3" /> {b.reporterName ?? "-"}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> {fmtRelative(b.createdAt)}
              </span>
              {b.assignedName && (
                <span className="inline-flex items-center gap-1 text-violet-600 dark:text-violet-400">
                  <UserCheck className="h-3 w-3" /> {b.assignedName}
                </span>
              )}
              {b.commentCount > 0 && (
                <span className="inline-flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" /> {b.commentCount}
                </span>
              )}
              {(b.photoPath || b.photoData) && (
                <span className="inline-flex items-center gap-1 text-sky-600">
                  <Camera className="h-3 w-3" /> foto
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------
function CreateBugDialog({ open, onClose, onSaved }: any) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [stepsToReproduce, setStepsToReproduce] = useState("");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [affectedFeature, setAffectedFeature] = useState("");
  const [photoData, setPhotoData] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(""); setDescription(""); setStepsToReproduce("");
      setSeverity("medium"); setAffectedFeature(""); setPhotoData(null);
    }
  }, [open]);

  const mut = useMutation({
    mutationFn: (data: any) => api.post("/bugs", data),
    onSuccess: () => { toast.success("Bug dilaporkan. Admin akan triage segera."); onSaved(); },
    onError: (e: any) => toast.error(e.message),
  });

  const handlePhoto = async (f: File) => {
    try {
      const r = await compressImage(f, { maxBytes: 500_000, maxDim: 1280 });
      setPhotoData(r.dataUrl);
    } catch (e: any) {
      toast.error("Gagal compress foto: " + e.message);
    }
  };

  const handleSubmit = () => {
    if (!title.trim()) { toast.error("Judul wajib diisi"); return; }
    mut.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      stepsToReproduce: stepsToReproduce.trim() || undefined,
      severity,
      affectedFeature: affectedFeature.trim() || undefined,
      photoData: photoData || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg w-[calc(100vw-2rem)] max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-5 md:px-6 pt-5 md:pt-6 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Bug className="h-5 w-5 text-rose-500" /> Lapor Bug Baru
          </DialogTitle>
          <DialogDescription>
            Jelaskan sespesifik mungkin biar bisa diperbaiki cepat. Screenshot sangat membantu.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 md:px-6 py-4 overflow-y-auto flex-1">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Judul *</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contoh: Form canvassing gagal submit saat input >5 prospek" maxLength={200} className="mt-1" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Severity</label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as Severity)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low - cosmetic</SelectItem>
                  <SelectItem value="medium">Medium - ganggu tapi workaround ada</SelectItem>
                  <SelectItem value="high">High - blocking pekerjaan</SelectItem>
                  <SelectItem value="critical">Critical - sistem down / data loss</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fitur Terdampak</label>
              <Input value={affectedFeature} onChange={(e) => setAffectedFeature(e.target.value)} placeholder="canvassing, billing, dll" className="mt-1" />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Deskripsi</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Apa yang terjadi? Apa yang diharapkan?" rows={3} className="mt-1" />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Langkah Reproduksi</label>
            <Textarea value={stepsToReproduce} onChange={(e) => setStepsToReproduce(e.target.value)} placeholder="1. Buka menu X...&#10;2. Klik tombol Y...&#10;3. Lihat error Z..." rows={3} className="mt-1 font-mono text-sm" />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Screenshot (opsional)</label>
            {photoData ? (
              <div className="relative mt-1">
                <img src={photoData} alt="Screenshot" className="w-full max-h-48 object-contain rounded-lg border" />
                <button onClick={() => setPhotoData(null)} className="absolute top-2 right-2 p-1 rounded-full bg-rose-500 text-white shadow-lg">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhoto(f); }} />
                <Button variant="outline" onClick={() => fileRef.current?.click()} className="w-full mt-1" type="button">
                  <Camera className="h-4 w-4 mr-1.5" /> Upload Screenshot
                </Button>
                <p className="text-[10px] text-muted-foreground mt-1">Auto-compress ke max 500KB</p>
              </>
            )}
          </div>
        </div>

        <div className="flex gap-2 justify-end px-5 md:px-6 py-3 border-t bg-muted/20 shrink-0">
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={handleSubmit} disabled={mut.isPending || !title.trim()} className="bg-rose-600 hover:bg-rose-700">
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Lapor Bug
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
function BugDetailDialog({ open, onClose, bugId, canTriage, currentUserId, onUpdated }: any) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/bugs", bugId],
    queryFn: () => api.get(`/bugs/${bugId}`),
    enabled: !!bugId && open,
  });

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
    queryFn: () => api.get<any[]>("/users"),
    enabled: canTriage && open,
    staleTime: 5 * 60_000,
  });

  const [comment, setComment] = useState("");
  const [statusEdit, setStatusEdit] = useState<Status | null>(null);
  const [assignEdit, setAssignEdit] = useState<number | null>(null);
  const [resolution, setResolution] = useState("");

  useEffect(() => {
    if (data?.bug) {
      setStatusEdit(data.bug.status);
      setAssignEdit(data.bug.assignedToUserId);
      setResolution(data.bug.resolution ?? "");
    }
  }, [data?.bug]);

  const qc = useQueryClient();

  const updateMut = useMutation({
    mutationFn: (patch: any) => api.patch(`/bugs/${bugId}`, patch),
    onSuccess: () => {
      toast.success("Bug diupdate");
      qc.invalidateQueries({ queryKey: ["/api/bugs", bugId] });
      onUpdated();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const commentMut = useMutation({
    mutationFn: (content: string) => api.post(`/bugs/${bugId}/comments`, { content }),
    onSuccess: () => {
      setComment("");
      qc.invalidateQueries({ queryKey: ["/api/bugs", bugId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/bugs/${bugId}`),
    onSuccess: () => {
      toast.success("Bug dihapus");
      onUpdated();
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!open) return null;

  const bug = data?.bug;
  const comments = data?.comments ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-5 md:px-6 pt-5 md:pt-6 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Bug className="h-5 w-5 text-rose-500" /> Detail Bug #{bug?.id ?? "..."}
          </DialogTitle>
        </DialogHeader>

        {isLoading || !bug ? (
          <div className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" /></div>
        ) : (
          <div className="space-y-4 px-5 md:px-6 py-4 overflow-y-auto flex-1">
            {/* Title + meta */}
            <div>
              <h3 className="font-bold text-lg">{bug.title}</h3>
              <div className="flex items-center gap-2 flex-wrap mt-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${SEVERITY_CFG[bug.severity]?.color ?? ""}`}>
                  {SEVERITY_CFG[bug.severity]?.label ?? bug.severity}
                </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_CFG[bug.status]?.color ?? ""}`}>
                  {STATUS_CFG[bug.status]?.label ?? bug.status}
                </span>
                {bug.affectedFeature && (
                  <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">{bug.affectedFeature}</span>
                )}
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-2 flex-wrap">
                <span className="inline-flex items-center gap-1"><UserIcon className="h-3 w-3" /> {bug.reporterName}</span>
                <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {new Date(bug.createdAt).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                {bug.assignedName && <span className="inline-flex items-center gap-1 text-violet-600"><UserCheck className="h-3 w-3" /> {bug.assignedName}</span>}
              </div>
            </div>

            {/* Description */}
            {bug.description && (
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Deskripsi</div>
                <div className="text-sm whitespace-pre-wrap">{bug.description}</div>
              </div>
            )}

            {bug.stepsToReproduce && (
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Langkah Reproduksi</div>
                <pre className="text-xs font-mono bg-muted p-3 rounded whitespace-pre-wrap">{bug.stepsToReproduce}</pre>
              </div>
            )}

            {(bug.photoPath || bug.photoData) && (
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Screenshot</div>
                <img src={`/api/bugs/${bug.id}/photo`} alt="Screenshot" className="w-full max-h-80 object-contain rounded-lg border" loading="lazy" />
              </div>
            )}

            {bug.browserInfo && (
              <div className="text-[10px] text-muted-foreground">
                <span className="font-semibold uppercase tracking-widest">Browser:</span>{" "}
                <code className="text-[10px]">{bug.browserInfo.slice(0, 150)}</code>
              </div>
            )}

            {/* Admin triage panel */}
            {canTriage && (
              <div className="border-t pt-4">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Triage (Admin)</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-muted-foreground">Status</label>
                    <Select value={statusEdit ?? bug.status} onValueChange={(v) => setStatusEdit(v as Status)}>
                      <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_CFG).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Assign ke</label>
                    <Select value={String(assignEdit ?? "")} onValueChange={(v) => setAssignEdit(v ? Number(v) : null)}>
                      <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Belum di-assign" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">- Unassign -</SelectItem>
                        {users.filter((u: any) => u.isActive).map((u: any) => (
                          <SelectItem key={u.id} value={String(u.id)}>{u.name} ({u.role})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {(statusEdit === "resolved" || statusEdit === "closed" || statusEdit === "wontfix" || statusEdit === "duplicate") && (
                  <div className="mt-3">
                    <label className="text-[10px] text-muted-foreground">Resolution / Note</label>
                    <Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} rows={2} className="mt-1 text-sm" placeholder="Apa yang diperbaiki? Atau kenapa di-close?" />
                  </div>
                )}
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    onClick={() => updateMut.mutate({
                      status: statusEdit,
                      assignedToUserId: assignEdit === 0 ? null : assignEdit,
                      resolution: resolution || undefined,
                    })}
                    disabled={updateMut.isPending}
                  >
                    {updateMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                    Simpan Triage
                  </Button>
                  <Button size="sm" variant="outline" className="text-rose-500" onClick={() => { if (confirm("Hapus bug permanen?")) deleteMut.mutate(); }}>
                    <Trash2 className="h-3 w-3 mr-1" /> Hapus
                  </Button>
                </div>
              </div>
            )}

            {/* Comments */}
            <div className="border-t pt-4">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                Diskusi ({comments.length})
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {comments.map((c: any) => (
                  <div key={c.id} className="p-3 rounded-lg bg-muted/40 text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-xs">{c.userName}</span>
                      <span className="text-[10px] text-muted-foreground">{fmtRelative(c.createdAt)}</span>
                    </div>
                    <div className="whitespace-pre-wrap">{c.content}</div>
                  </div>
                ))}
                {comments.length === 0 && <div className="text-xs text-muted-foreground italic">Belum ada komentar</div>}
              </div>
              <div className="flex gap-2 mt-3">
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Tulis komentar..." rows={2} className="text-sm flex-1" />
                <Button size="sm" onClick={() => commentMut.mutate(comment)} disabled={!comment.trim() || commentMut.isPending}>
                  {commentMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function fmtRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m}m lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}j lalu`;
  return `${Math.floor(h / 24)}h lalu`;
}
