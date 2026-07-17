/**
 * v4.2.19: Broadcast Pelanggan — main hub
 *
 * 4 tabs:
 *   - Campaigns: list semua campaign + buat baru via wizard
 *   - Templates: CRUD template dengan button builder
 *   - Audiences: saved segments (system + custom)
 *   - History: detail per-campaign recipient log
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Megaphone, MessageSquare, Users, History, Plus, Trash2, Edit3, Send,
  Play, Pause, XCircle, CheckCircle2, Clock, Loader2, AlertCircle, RotateCcw,
  ChevronRight, Eye,
} from "lucide-react";
import { CampaignWizard } from "@/components/broadcast/CampaignWizard";
import { TemplateEditor, type TemplateData } from "@/components/broadcast/TemplateEditor";
import { AudienceBuilder, type AudienceFilter } from "@/components/broadcast/AudienceBuilder";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

type Tab = "campaigns" | "templates" | "audiences" | "history";

interface Campaign {
  id: number;
  name: string;
  description: string | null;
  templateId: number;
  audienceCount: number;
  status: string;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  createdAt: string;
  rateLimitMs: number;
}

interface Segment {
  id: number;
  name: string;
  description: string | null;
  filter: string;
  isSystem: number;
  lastCount: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  draft:      { label: "Draft",     color: "bg-zinc-100 text-zinc-700",      icon: Edit3 },
  scheduled:  { label: "Dijadwalkan", color: "bg-blue-100 text-blue-700",    icon: Clock },
  running:    { label: "Berjalan",  color: "bg-amber-100 text-amber-800",    icon: Play },
  completed:  { label: "Selesai",   color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  cancelled:  { label: "Dibatalkan", color: "bg-rose-100 text-rose-700",     icon: XCircle },
  failed:     { label: "Gagal",     color: "bg-rose-100 text-rose-700",      icon: AlertCircle },
};

export default function BroadcastPage() {
  const [tab, setTab] = useState<Tab>("campaigns");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<TemplateData | null>(null);
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [historyId, setHistoryId] = useState<number | null>(null);

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-gradient-to-br from-sky-100 to-blue-200 p-2.5">
          <Megaphone className="h-5 w-5 text-sky-700" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl md:text-2xl font-bold tracking-tight-display">Broadcast Pelanggan</h1>
          <p className="text-sm text-muted-foreground">Kirim pesan WhatsApp ke pelanggan tersegmentasi via MPWA gateway</p>
        </div>
        {tab === "campaigns" && (
          <Button onClick={() => setWizardOpen(true)} leftIcon={<Plus className="h-3.5 w-3.5" />}>
            Campaign Baru
          </Button>
        )}
        {tab === "templates" && (
          <Button onClick={() => { setEditTemplate(null); setTemplateEditorOpen(true); }} leftIcon={<Plus className="h-3.5 w-3.5" />}>
            Template Baru
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="inline-flex rounded-md border bg-card p-0.5">
        {([
          { key: "campaigns", label: "Campaigns", icon: Megaphone },
          { key: "templates", label: "Templates", icon: MessageSquare },
          { key: "audiences", label: "Audiences", icon: Users },
          { key: "history",   label: "History",   icon: History },
        ] as const).map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key as Tab)}
              className={cn(
                "px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded transition flex items-center gap-1.5",
                tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3 w-3" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "campaigns" && <CampaignsTab onOpenHistory={(id) => { setHistoryId(id); setTab("history"); }} />}
      {tab === "templates" && (
        <TemplatesTab
          onEdit={(t) => { setEditTemplate(t); setTemplateEditorOpen(true); }}
        />
      )}
      {tab === "audiences" && <AudiencesTab />}
      {tab === "history" && <HistoryTab initialCampaignId={historyId} />}

      <CampaignWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
      <TemplateEditor
        open={templateEditorOpen}
        onClose={() => { setTemplateEditorOpen(false); setEditTemplate(null); }}
        template={editTemplate}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// CAMPAIGNS TAB
// ─────────────────────────────────────────────────────────────────
function CampaignsTab({ onOpenHistory }: { onOpenHistory: (id: number) => void }) {
  const qc = useQueryClient();
  const { data: campaigns = [], isLoading } = useQuery<Campaign[]>({
    queryKey: ["broadcast-campaigns"],
    queryFn: () => api.get("/broadcast/campaigns"),
    refetchInterval: 10_000,
  });

  const startMut = useMutation({
    mutationFn: (id: number) => api.post(`/broadcast/campaigns/${id}/start`, {}),
    onSuccess: () => { toast.success("Campaign launched"); qc.invalidateQueries({ queryKey: ["broadcast-campaigns"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const cancelMut = useMutation({
    mutationFn: (id: number) => api.post(`/broadcast/campaigns/${id}/cancel`, {}),
    onSuccess: () => { toast.success("Campaign cancelled"); qc.invalidateQueries({ queryKey: ["broadcast-campaigns"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const retryMut = useMutation({
    mutationFn: (id: number) => api.post(`/broadcast/campaigns/${id}/retry`, {}),
    onSuccess: (data: any) => { toast.success(`Retry ${data?.retried ?? 0} recipient`); qc.invalidateQueries({ queryKey: ["broadcast-campaigns"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/broadcast/campaigns/${id}`),
    onSuccess: () => { toast.success("Campaign dihapus"); qc.invalidateQueries({ queryKey: ["broadcast-campaigns"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) {
    return <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (campaigns.length === 0) {
    return (
      <div className="rounded-xl border bg-card py-16 text-center">
        <Megaphone className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
        <div className="font-bold text-foreground">Belum ada campaign</div>
        <div className="text-xs text-muted-foreground mt-1">Klik "Campaign Baru" untuk mulai broadcast pertama.</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {campaigns.map(c => {
        const cfg = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.draft;
        const Icon = cfg.icon;
        const progress = c.audienceCount > 0
          ? Math.round(((c.sentCount + c.failedCount + c.skippedCount) / c.audienceCount) * 100)
          : 0;
        return (
          <div key={c.id} className="rounded-lg border bg-card overflow-hidden">
            <div className="px-4 py-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="font-bold">{c.name}</h3>
                  <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded", cfg.color)}>
                    <Icon className="h-3 w-3" /> {cfg.label}
                  </span>
                </div>
                {c.description && <div className="text-xs text-muted-foreground mb-1.5">{c.description}</div>}
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{c.audienceCount}</span>
                  <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3 w-3" />{c.sentCount} sent</span>
                  {c.failedCount > 0 && <span className="inline-flex items-center gap-1 text-rose-600"><XCircle className="h-3 w-3" />{c.failedCount} failed</span>}
                  {c.skippedCount > 0 && <span className="inline-flex items-center gap-1 text-amber-600">{c.skippedCount} skipped</span>}
                  {c.scheduledAt && c.status === "scheduled" && (
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(c.scheduledAt).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  )}
                </div>

                {/* Progress bar (running) */}
                {c.status === "running" && (
                  <div className="mt-2">
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{progress}% · {c.sentCount + c.failedCount}/{c.audienceCount}</div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {c.status === "draft" || c.status === "scheduled" ? (
                  <Button size="xs" variant="ghost-primary" onClick={() => startMut.mutate(c.id)} leftIcon={<Play className="h-3 w-3" />}>
                    Start
                  </Button>
                ) : null}
                {c.status === "running" && (
                  <Button size="xs" variant="ghost" onClick={() => cancelMut.mutate(c.id)} leftIcon={<XCircle className="h-3 w-3" />} className="text-rose-600">
                    Cancel
                  </Button>
                )}
                {c.status === "completed" && c.failedCount > 0 && (
                  <Button size="xs" variant="ghost" onClick={() => retryMut.mutate(c.id)} leftIcon={<RotateCcw className="h-3 w-3" />}>
                    Retry Failed
                  </Button>
                )}
                <Button size="xs" variant="ghost" onClick={() => onOpenHistory(c.id)} leftIcon={<Eye className="h-3 w-3" />}>
                  Detail
                </Button>
                {(c.status === "draft" || c.status === "cancelled" || c.status === "failed" || c.status === "completed") && (
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => { if (confirm(`Hapus campaign "${c.name}"?`)) deleteMut.mutate(c.id); }}
                    className="text-rose-600"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// TEMPLATES TAB
// ─────────────────────────────────────────────────────────────────
function TemplatesTab({ onEdit }: { onEdit: (t: TemplateData) => void }) {
  const qc = useQueryClient();
  const { data: templates = [], isLoading } = useQuery<TemplateData[]>({
    queryKey: ["mpwa-templates"],
    queryFn: () => api.get("/mpwa/templates"),
  });
  const [testPhone, setTestPhone] = useState("");
  const [testTemplate, setTestTemplate] = useState<TemplateData | null>(null);

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/mpwa/templates/${id}`),
    onSuccess: () => { toast.success("Template dihapus"); qc.invalidateQueries({ queryKey: ["mpwa-templates"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const testMut = useMutation({
    mutationFn: () => api.post("/broadcast/test", {
      phone: testPhone,
      templateId: testTemplate!.id,
      sampleVars: { nama: "Test User", customerId: "058500001", package: "10M", amount: "150000", dueDate: "31 Mei 2026", cs: "JABNET CS" },
    }),
    onSuccess: (data: any) => {
      toast.success(data?.sent ? "Pesan test terkirim!" : `Gagal: ${data?.error}`);
      setTestPhone(""); setTestTemplate(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {templates.map(t => (
          <div key={t.id} className="rounded-lg border bg-card overflow-hidden">
            <div className="px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-bold flex-1 truncate">{t.name}</h3>
                {t.isSystem === 1 && <span className="text-[9px] font-bold px-1 rounded bg-blue-100 text-blue-700">SYSTEM</span>}
                <span className="text-[10px] font-mono text-muted-foreground">{t.key}</span>
              </div>
              {t.description && <div className="text-xs text-muted-foreground mb-1.5">{t.description}</div>}
              <div className="text-xs line-clamp-2 bg-muted/30 rounded px-2 py-1.5 font-mono">{t.content}</div>
              <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-muted-foreground">
                {t.buttons && <span className="px-1 rounded bg-sky-100 text-sky-700">Tombol</span>}
                {t.mediaType && <span className="px-1 rounded bg-purple-100 text-purple-700">{t.mediaType}</span>}
                {t.footer && <span className="px-1 rounded bg-zinc-100 text-zinc-700">+ Footer</span>}
                <span className="ml-auto">{t.category}</span>
              </div>
              <div className="flex items-center gap-1 mt-2">
                <Button size="xs" variant="ghost-primary" onClick={() => onEdit(t)} leftIcon={<Edit3 className="h-3 w-3" />}>
                  Edit
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setTestTemplate(t)} leftIcon={<Send className="h-3 w-3" />}>
                  Kirim Test
                </Button>
                {t.isSystem !== 1 && (
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => { if (confirm(`Hapus template "${t.name}"?`)) deleteMut.mutate(t.id!); }}
                    className="text-rose-600 ml-auto"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Test send dialog */}
      <Dialog open={!!testTemplate} onOpenChange={(o) => { if (!o) setTestTemplate(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Kirim Test ke 1 Nomor</DialogTitle>
            <DialogDescription>
              Test rendering template "{testTemplate?.name}" — placeholder akan di-fill dengan sample data.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="tel"
            placeholder="08123456789 atau 6281xxx"
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            className="text-sm"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTestTemplate(null)}>Batal</Button>
            <Button
              onClick={() => testMut.mutate()}
              disabled={!testPhone.trim() || testMut.isPending}
              loading={testMut.isPending}
              leftIcon={<Send className="h-3.5 w-3.5" />}
            >
              Kirim Test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// AUDIENCES TAB
// ─────────────────────────────────────────────────────────────────
function AudiencesTab() {
  const qc = useQueryClient();
  const { data: segments = [], isLoading } = useQuery<Segment[]>({
    queryKey: ["broadcast-segments"],
    queryFn: () => api.get("/broadcast/segments"),
  });
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Segment | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [filter, setFilter] = useState<AudienceFilter>({ combine: "all", rules: [] });

  function openCreate() {
    setEditing(null); setName(""); setDescription("");
    setFilter({ combine: "all", rules: [] });
    setEditorOpen(true);
  }
  function openEdit(s: Segment) {
    setEditing(s); setName(s.name); setDescription(s.description ?? "");
    try { setFilter(JSON.parse(s.filter)); } catch { setFilter({ combine: "all", rules: [] }); }
    setEditorOpen(true);
  }

  const saveMut = useMutation({
    mutationFn: () => {
      const body = { name, description, filter };
      return editing
        ? api.put(`/broadcast/segments/${editing.id}`, body)
        : api.post("/broadcast/segments", body);
    },
    onSuccess: () => {
      toast.success(editing ? "Segment tersimpan" : "Segment dibuat");
      qc.invalidateQueries({ queryKey: ["broadcast-segments"] });
      setEditorOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/broadcast/segments/${id}`),
    onSuccess: () => { toast.success("Segment dihapus"); qc.invalidateQueries({ queryKey: ["broadcast-segments"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <>
      <div className="flex items-center justify-end mb-2">
        <Button onClick={openCreate} leftIcon={<Plus className="h-3.5 w-3.5" />}>Segment Baru</Button>
      </div>
      <div className="space-y-2">
        {segments.map(s => (
          <div key={s.id} className="rounded-lg border bg-card px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="font-bold">{s.name}</h3>
                {s.isSystem === 1 && <span className="text-[9px] font-bold px-1 rounded bg-blue-100 text-blue-700">SYSTEM</span>}
              </div>
              {s.description && <div className="text-xs text-muted-foreground">{s.description}</div>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button size="xs" variant="ghost" onClick={() => openEdit(s)} leftIcon={<Edit3 className="h-3 w-3" />} disabled={s.isSystem === 1}>
                {s.isSystem === 1 ? "View" : "Edit"}
              </Button>
              {s.isSystem !== 1 && (
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => { if (confirm(`Hapus segment "${s.name}"?`)) deleteMut.mutate(s.id); }}
                  className="text-rose-600"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={editorOpen} onOpenChange={(o) => { if (!o) setEditorOpen(false); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit Segment: ${editing.name}` : "Buat Segment Baru"}</DialogTitle>
            <DialogDescription>Saved segment bisa di-pakai berulang kali untuk campaign berbeda.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Nama segment" value={name} onChange={(e) => setName(e.target.value)} disabled={editing?.isSystem === 1} />
            <Input placeholder="Deskripsi (opsional)" value={description} onChange={(e) => setDescription(e.target.value)} disabled={editing?.isSystem === 1} />
            <AudienceBuilder value={filter} onChange={setFilter} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditorOpen(false)}>Batal</Button>
            {editing?.isSystem !== 1 && (
              <Button
                onClick={() => saveMut.mutate()}
                disabled={!name.trim() || filter.rules.length === 0 || saveMut.isPending}
                loading={saveMut.isPending}
              >
                Simpan Segment
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// HISTORY TAB
// ─────────────────────────────────────────────────────────────────
function HistoryTab({ initialCampaignId }: { initialCampaignId: number | null }) {
  const [campaignId, setCampaignId] = useState<number | null>(initialCampaignId);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const { data: campaigns = [] } = useQuery<Campaign[]>({
    queryKey: ["broadcast-campaigns"],
    queryFn: () => api.get("/broadcast/campaigns"),
  });

  const { data: detail } = useQuery<{ items: any[]; counts: any }>({
    queryKey: ["broadcast-recipients", campaignId, filterStatus],
    queryFn: () => api.get(`/broadcast/campaigns/${campaignId}/recipients?limit=200&status=${filterStatus === "all" ? "" : filterStatus}`),
    enabled: !!campaignId,
    refetchInterval: 5_000,
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-3">
      {/* Campaign list */}
      <div className="space-y-1.5">
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1 mb-1">Pilih Campaign</div>
        {campaigns.map(c => (
          <button
            key={c.id}
            onClick={() => setCampaignId(c.id)}
            className={cn(
              "w-full text-left rounded-md border px-3 py-2 transition",
              campaignId === c.id ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "hover:border-foreground/30"
            )}
          >
            <div className="text-sm font-bold truncate">{c.name}</div>
            <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground">
              <span>{c.status}</span>
              <span>·</span>
              <span>{c.sentCount}/{c.audienceCount}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Recipients table */}
      <div className="rounded-lg border bg-card">
        {!campaignId ? (
          <div className="py-16 text-center text-muted-foreground text-sm">Pilih campaign untuk lihat detail recipient.</div>
        ) : !detail ? (
          <div className="py-16 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <>
            <div className="px-4 py-2.5 border-b flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                {["all", "pending", "sent", "failed", "skipped"].map(s => (
                  <button
                    key={s}
                    onClick={() => setFilterStatus(s)}
                    className={cn(
                      "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider",
                      filterStatus === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/40"
                    )}
                  >
                    {s} {s !== "all" && (detail.counts as any)[s] != null ? `(${(detail.counts as any)[s]})` : ""}
                  </button>
                ))}
              </div>
            </div>
            <div className="max-h-[600px] overflow-y-auto divide-y">
              {detail.items.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground italic">Tidak ada recipient untuk filter ini</div>
              ) : detail.items.map((r: any) => (
                <div key={r.id} className="px-4 py-2 flex items-center gap-3 text-xs">
                  <div className={cn("h-2 w-2 rounded-full shrink-0",
                    r.status === "sent" ? "bg-emerald-500" :
                    r.status === "failed" ? "bg-rose-500" :
                    r.status === "skipped" ? "bg-amber-500" :
                    r.status === "sending" ? "bg-blue-500 animate-pulse" :
                    "bg-zinc-300"
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold truncate">{r.customerName ?? "—"}</span>
                      <span className="font-mono text-muted-foreground">{r.phone}</span>
                    </div>
                    {r.errorMessage && <div className="text-rose-600 text-[10px] mt-0.5 truncate">{r.errorMessage}</div>}
                  </div>
                  <div className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                    {r.sentAt ? new Date(r.sentAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
