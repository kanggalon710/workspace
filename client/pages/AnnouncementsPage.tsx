import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { FullBleedPage } from "@/components/ui/full-bleed-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AssigneePicker } from "@/components/pipelines/AssigneePicker";
import { toast } from "sonner";
import {
  Megaphone, Plus, Edit3, Trash2, Pin, Rocket, Bug as BugIcon,
  Settings as SettingsIcon, GraduationCap, Info, AlertTriangle, AlertCircle,
  Loader2, Eye, EyeOff, Send, Clock, User as UserIcon,
} from "lucide-react";

type Category = "feature_update" | "bug_fix" | "announcement" | "maintenance" | "training";
type Severity = "info" | "warning" | "critical";

const CATEGORY_CFG: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  feature_update: { label: "Fitur Baru", icon: Rocket, color: "text-sky-700 dark:text-sky-300", bg: "bg-sky-100 dark:bg-sky-950/40" },
  bug_fix: { label: "Perbaikan Bug", icon: BugIcon, color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-100 dark:bg-emerald-950/40" },
  announcement: { label: "Pengumuman", icon: Megaphone, color: "text-indigo-700 dark:text-indigo-300", bg: "bg-indigo-100 dark:bg-indigo-950/40" },
  maintenance: { label: "Maintenance", icon: SettingsIcon, color: "text-amber-700 dark:text-amber-300", bg: "bg-amber-100 dark:bg-amber-950/40" },
  training: { label: "Training", icon: GraduationCap, color: "text-violet-700 dark:text-violet-300", bg: "bg-violet-100 dark:bg-violet-950/40" },
};

const SEVERITY_CFG: Record<string, { label: string; icon: any; color: string }> = {
  info: { label: "Info", icon: Info, color: "text-sky-500" },
  warning: { label: "Warning", icon: AlertTriangle, color: "text-amber-500" },
  critical: { label: "Critical", icon: AlertCircle, color: "text-rose-500" },
};

export default function AnnouncementsPage() {
  const { canWrite } = useAuth();
  const isAdmin = canWrite("announcements_admin");
  const qc = useQueryClient();
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [editFor, setEditFor] = useState<any | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [showDrafts, setShowDrafts] = useState(false);

  const { data: list = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/announcements", showDrafts],
    queryFn: () => api.get<any[]>(`/announcements${isAdmin && showDrafts ? "?publishedOnly=false" : ""}`),
    refetchInterval: 60_000,
  });

  const filtered = categoryFilter === "all" ? list : list.filter((a: any) => a.category === categoryFilter);

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/announcements/${id}`),
    onSuccess: () => {
      toast.success("Pengumuman dihapus");
      qc.invalidateQueries({ queryKey: ["/api/announcements"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <FullBleedPage>
      {/* Header - sticky di mobile */}
      <div className="sticky top-0 z-10 px-4 md:px-6 pt-4 md:pt-6 pb-4 space-y-4 shrink-0 bg-background border-b">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 md:gap-4 min-w-0 flex-1">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shrink-0">
              <Megaphone className="h-5 w-5 md:h-6 md:w-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">Pengumuman & Update</h1>
              <p className="text-xs md:text-sm text-muted-foreground mt-0.5 md:mt-1 max-w-2xl">
                <span className="hidden md:inline">Informasi fitur baru, perbaikan bug, dan pengumuman penting dari admin.</span>
                <span className="md:hidden">Update fitur & info penting</span>
              </p>
            </div>
          </div>
          {isAdmin && (
            <Button size="sm" onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 shrink-0">
              <Plus className="h-4 w-4 md:mr-1.5" />
              <span className="hidden md:inline">Buat Pengumuman</span>
              <span className="md:hidden">Buat</span>
            </Button>
          )}
        </div>

        {/* Filter bar - horizontal scroll di mobile */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="overflow-x-auto no-scrollbar -mx-4 md:mx-0 px-4 md:px-0 flex-1 min-w-0">
            <div className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit">
              <FilterPill active={categoryFilter === "all"} onClick={() => setCategoryFilter("all")} label="Semua" />
              {Object.entries(CATEGORY_CFG).map(([key, cfg]) => (
                <FilterPill
                  key={key} active={categoryFilter === key}
                  onClick={() => setCategoryFilter(key)}
                  label={cfg.label} icon={cfg.icon}
                />
              ))}
            </div>
          </div>
          {isAdmin && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
              <input type="checkbox" checked={showDrafts} onChange={(e) => setShowDrafts(e.target.checked)} />
              <span className="hidden sm:inline">Tampilkan draft</span>
              <span className="sm:hidden">Draft</span>
            </label>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 md:overflow-y-auto px-4 md:px-6 py-4">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <Card className="max-w-3xl mx-auto">
            <CardContent className="py-12 md:py-16 text-center">
              <Megaphone className="h-10 w-10 md:h-12 md:w-12 text-muted-foreground/40 mx-auto mb-3" />
              <div className="font-semibold text-sm">Belum ada pengumuman</div>
              <div className="text-xs text-muted-foreground mt-1 px-4">
                {isAdmin ? "Klik \"Buat Pengumuman\" untuk mulai" : "Update akan muncul di sini kalau ada fitur baru atau info penting"}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3 max-w-3xl mx-auto">
            {filtered.map((a: any) => (
              <AnnouncementCard
                key={a.id} a={a} isAdmin={isAdmin}
                onEdit={() => setEditFor(a)}
                onDelete={() => { if (confirm("Hapus pengumuman ini?")) deleteMut.mutate(a.id); }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <EditDialog
        open={createOpen} onClose={() => setCreateOpen(false)}
        initial={null}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["/api/announcements"] });
          setCreateOpen(false);
        }}
      />
      <EditDialog
        open={!!editFor} onClose={() => setEditFor(null)}
        initial={editFor}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["/api/announcements"] });
          setEditFor(null);
        }}
      />
    </FullBleedPage>
  );
}

// ---------------------------------------------------------------------
function FilterPill({ active, onClick, label, icon: Ic }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {Ic && <Ic className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

function AnnouncementCard({ a, isAdmin, onEdit, onDelete }: any) {
  const cfg = CATEGORY_CFG[a.category] ?? CATEGORY_CFG.announcement;
  const sev = SEVERITY_CFG[a.severity] ?? SEVERITY_CFG.info;
  const CatIcon = cfg.icon;
  const SevIcon = sev.icon;
  const isDraft = !a.publishedAt;
  const pinnedUntil = a.pinnedUntil ? new Date(a.pinnedUntil).getTime() : 0;
  const isPinned = pinnedUntil > Date.now();

  return (
    <Card className={`${isDraft ? "opacity-70 border-dashed" : ""} ${isPinned ? "ring-1 ring-amber-300 dark:ring-amber-800" : ""}`}>
      <CardContent className="p-4 md:p-5">
        <div className="flex items-start gap-3 md:gap-4">
          <div className={`w-9 h-9 md:w-10 md:h-10 rounded-lg flex items-center justify-center shrink-0 ${cfg.bg}`}>
            <CatIcon className={`h-4 w-4 md:h-5 md:w-5 ${cfg.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.bg} ${cfg.color}`}>
                {cfg.label}
              </span>
              {a.severity !== "info" && (
                <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${sev.color}`}>
                  <SevIcon className="h-3 w-3" /> {sev.label}
                </span>
              )}
              {a.version && (
                <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded">{a.version}</span>
              )}
              {isPinned && (
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 font-semibold">
                  <Pin className="h-3 w-3" /> Pinned
                </span>
              )}
              {isDraft && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                  <EyeOff className="h-3 w-3" /> Draft
                </span>
              )}
            </div>
            <h3 className="font-bold text-base md:text-lg leading-tight mb-2 break-words">{a.title}</h3>
            <div className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed break-words">{a.content}</div>

            <div className="flex items-center gap-3 mt-3 md:mt-4 text-[11px] text-muted-foreground flex-wrap">
              <span className="inline-flex items-center gap-1">
                <UserIcon className="h-3 w-3" />
                {a.authorName ?? "Admin"}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {a.publishedAt ? new Date(a.publishedAt).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Belum dipublish"}
              </span>
            </div>
          </div>

          {isAdmin && (
            <div className="flex items-center gap-0.5 shrink-0 -mt-1 -mr-1">
              <Button size="sm" variant="ghost" onClick={onEdit} title="Edit" className="h-8 w-8 p-0">
                <Edit3 className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" onClick={onDelete} title="Hapus" className="h-8 w-8 p-0 text-rose-500 hover:text-rose-600">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------
function EditDialog({ open, onClose, initial, onSaved }: any) {
  const isEdit = !!initial;
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<Category>("announcement");
  const [severity, setSeverity] = useState<Severity>("info");
  const [version, setVersion] = useState("");
  const [publishNow, setPublishNow] = useState(true);
  const [pinnedUntil, setPinnedUntil] = useState("");
  // Teamspace FR-601..603: penerima terpilih + Rahasia + selesai otomatis
  const [recipients, setRecipients] = useState<string[]>([]);
  const [isConfidential, setIsConfidential] = useState(false);
  const [expiryPreset, setExpiryPreset] = useState<"" | "1" | "3" | "7">("");

  // Initialize when opened (re-run when initial changes)
  useEffect(() => {
    if (open && initial) {
      setTitle(initial.title); setContent(initial.content);
      setCategory(initial.category); setSeverity(initial.severity);
      setVersion(initial.version ?? "");
      setPublishNow(!!initial.publishedAt);
      setPinnedUntil(initial.pinnedUntil ? initial.pinnedUntil.slice(0, 16) : "");
      setRecipients((initial.recipientIds ?? []).map(String));
      setIsConfidential(initial.isConfidential === 1);
      setExpiryPreset("");
    } else if (open && !initial) {
      setTitle(""); setContent("");
      setCategory("announcement"); setSeverity("info");
      setVersion(""); setPublishNow(true); setPinnedUntil("");
      setRecipients([]); setIsConfidential(false); setExpiryPreset("");
    }
  }, [open, initial]);

  const mut = useMutation({
    mutationFn: (data: any) => isEdit
      ? api.patch(`/announcements/${initial.id}`, data)
      : api.post(`/announcements`, data),
    onSuccess: () => {
      toast.success(isEdit ? "Pengumuman diperbarui" : "Pengumuman dibuat");
      onSaved();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!title.trim() || !content.trim()) {
      toast.error("Judul dan konten wajib diisi");
      return;
    }
    if (isConfidential && recipients.length === 0) {
      toast.error("Pengumuman Rahasia butuh minimal satu penerima");
      return;
    }
    mut.mutate({
      title: title.trim(),
      content: content.trim(),
      category, severity, version: version.trim() || undefined,
      publishedAt: publishNow ? new Date().toISOString() : null,
      pinnedUntil: pinnedUntil || null,
      // Teamspace FR-601..603
      recipientIds: recipients.map(Number),
      isConfidential,
      expiresAt: expiryPreset ? new Date(Date.now() + Number(expiryPreset) * 86400_000).toISOString() : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-5 md:px-6 pt-5 md:pt-6 pb-3 border-b shrink-0">
          <DialogTitle>{isEdit ? "Edit Pengumuman" : "Buat Pengumuman Baru"}</DialogTitle>
          <DialogDescription>
            Pengumuman published akan broadcast ke semua staff via notifikasi bell.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 md:px-6 py-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kategori *</label>
              <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_CFG).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Severity</label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as Severity)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Info (default)</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Judul *</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contoh: JABNET Sahabat v1.2 - Voucher Rp 50K Live!" maxLength={200} className="mt-1" />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Konten *</label>
            <Textarea
              value={content} onChange={(e) => setContent(e.target.value)}
              placeholder="Jelaskan detail update, cara pakai, apa yang berubah..."
              rows={6}
              className="mt-1 text-sm"
            />
            <p className="text-[10px] text-muted-foreground mt-1">{content.length}/5000 karakter · Support newline</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Versi (opsional)</label>
              <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="v4.2.0" className="mt-1 font-mono" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pin sampai (opsional)</label>
              <Input type="datetime-local" value={pinnedUntil} onChange={(e) => setPinnedUntil(e.target.value)} className="mt-1" />
            </div>
          </div>

          {/* Teamspace FR-601..603: penerima terpilih + Rahasia + selesai otomatis */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Penerima (opsional)</label>
            <div className="mt-1">
              <AssigneePicker mode="multi" showSourceToggle={false} value={recipients} onChange={setRecipients} />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Kosong = broadcast ke semua staff. Terisi = notifikasi hanya ke penerima terpilih.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/30">
              <input type="checkbox" checked={isConfidential} onChange={(e) => setIsConfidential(e.target.checked)} className="mt-0.5" />
              <div>
                <div className="font-semibold text-sm"> Rahasia</div>
                <div className="text-[11px] text-muted-foreground">Hanya penerima terpilih yang bisa melihat - staff lain tidak melihat sama sekali.</div>
              </div>
            </label>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Selesai otomatis</label>
              <Select value={expiryPreset || "none"} onValueChange={(v) => setExpiryPreset(v === "none" ? "" : (v as any))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Manual (tidak expired)</SelectItem>
                  <SelectItem value="1">1 hari dari sekarang</SelectItem>
                  <SelectItem value="3">3 hari dari sekarang</SelectItem>
                  <SelectItem value="7">7 hari dari sekarang</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/30">
            <input type="checkbox" checked={publishNow} onChange={(e) => setPublishNow(e.target.checked)} className="mt-0.5" />
            <div>
              <div className="font-semibold text-sm flex items-center gap-1.5">
                <Send className="h-3.5 w-3.5" /> Publish sekarang
              </div>
              <div className="text-[11px] text-muted-foreground">
                {recipients.length > 0 ? `${recipients.length} penerima terpilih akan dapat notifikasi bell.` : "Semua staff akan langsung dapat notifikasi bell."} Uncheck untuk save sebagai draft.
              </div>
            </div>
          </label>
        </div>

        <div className="flex gap-2 justify-end px-5 md:px-6 py-3 border-t bg-muted/20 shrink-0">
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={handleSubmit} disabled={mut.isPending || !title.trim() || !content.trim()} className="bg-emerald-600 hover:bg-emerald-700">
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? "Simpan" : (publishNow ? "Publish" : "Simpan Draft")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
