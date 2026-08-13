import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  MessageCircle, Plus, Pencil, Trash2, Send, Search, Loader2,
  CheckCircle2, AlertTriangle, XCircle, Copy, Lock, FileText,
  RefreshCw, Settings, Sparkles, ExternalLink, Filter,
} from "lucide-react";

interface MpwaTemplate {
  id: number;
  key: string;
  name: string;
  description: string | null;
  content: string;
  placeholders: string | null;        // JSON array string
  category: string;
  isSystem: number;
  createdAt: string;
  updatedAt: string | null;
}

interface MpwaStatus {
  configured: boolean;
  url: string | null;
  senderNumber: string | null;
  lastSuccess: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  deviceStatus: { connected?: boolean; phoneNumber?: string } | null;
}

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  auth:          { label: "Auth & OTP",        color: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300" },
  loyalty:       { label: "Loyalty / Sahabat", color: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300" },
  notification:  { label: "Notifikasi",        color: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" },
  billing:       { label: "Billing",           color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" },
  general:       { label: "General",           color: "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-300" },
};

function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "-";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m}m lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}j lalu`;
  return `${Math.floor(h / 24)}h lalu`;
}

function parsePlaceholders(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export default function MpwaPage() {
  const { canWrite } = useAuth();
  const canEdit = canWrite("mpwa");
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [editingTemplate, setEditingTemplate] = useState<MpwaTemplate | null>(null);
  const [newTemplateOpen, setNewTemplateOpen] = useState(false);
  const [testTemplate, setTestTemplate] = useState<MpwaTemplate | null>(null);

  const { data: templates = [], isLoading: tplLoading, refetch: refetchTpl } = useQuery<MpwaTemplate[]>({
    queryKey: ["/api/mpwa/templates"],
    queryFn: () => api.get<MpwaTemplate[]>("/mpwa/templates"),
    refetchInterval: 60_000,
  });

  const { data: status, refetch: refetchStatus } = useQuery<MpwaStatus>({
    queryKey: ["/api/mpwa/status"],
    queryFn: () => api.get<MpwaStatus>("/mpwa/status"),
    refetchInterval: 30_000,
    retry: false,
  });

  const filtered = useMemo(() => {
    let list = templates ?? [];
    if (categoryFilter !== "all") list = list.filter(t => t.category === categoryFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(t =>
        t.key.toLowerCase().includes(q)
        || t.name.toLowerCase().includes(q)
        || (t.description ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [templates, search, categoryFilter]);

  const categories = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of templates ?? []) counts[t.category] = (counts[t.category] ?? 0) + 1;
    return counts;
  }, [templates]);

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/mpwa/templates/${id}`),
    onSuccess: () => {
      toast.success("Template dihapus");
      qc.invalidateQueries({ queryKey: ["/api/mpwa/templates"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden bg-slate-50/40 dark:bg-slate-950/40">
      {/* Header */}
      <div className="px-4 md:px-6 pt-3 md:pt-4 space-y-3 md:space-y-4 shrink-0 bg-background border-b">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-sm shrink-0">
              <MessageCircle className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg md:text-xl font-bold tracking-tight">MPWA WhatsApp Gateway</h1>
                <StatusPill status={status} />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Kelola template pesan WA - OTP, loyalty, billing, notifikasi.
              </p>
            </div>
          </div>
          <div className="flex gap-1.5 items-center shrink-0">
            <Button size="sm" variant="outline" onClick={() => { refetchTpl(); refetchStatus(); }} className="h-8">
              <RefreshCw className="h-4 w-4 md:mr-1.5" />
              <span className="hidden md:inline">Refresh</span>
            </Button>
            {canEdit && (
              <Button size="sm" onClick={() => setNewTemplateOpen(true)} className="h-8 gap-1.5">
                <Plus className="h-4 w-4" />
                Template Baru
              </Button>
            )}
          </div>
        </div>

        {/* Stats + warnings */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <StatBox label="Total Template" value={templates.length} icon={<FileText className="h-3.5 w-3.5" />} />
          <StatBox label="System" value={templates.filter(t => t.isSystem === 1).length} icon={<Lock className="h-3.5 w-3.5" />} tone="slate" />
          <StatBox label="Custom" value={templates.filter(t => t.isSystem !== 1).length} icon={<Sparkles className="h-3.5 w-3.5" />} tone="emerald" />
          <StatBox
            label="Last Sukses"
            value={fmtRelative(status?.lastSuccess)}
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            tone={status?.lastSuccess ? "emerald" : "slate"}
            isText
          />
        </div>

        {!status?.configured && (
          <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 text-xs">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-amber-800 dark:text-amber-200">MPWA belum dikonfigurasi</p>
              <p className="text-amber-700 dark:text-amber-300 mt-0.5">
                Setup URL + API token + nomor sender di <a href="/integrations" className="underline font-medium">Integrasi API</a>.
                Saat ini OTP berjalan di mode dev (ke-log ke console server).
              </p>
            </div>
          </div>
        )}
        {status?.lastError && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900 text-xs">
            <XCircle className="h-3.5 w-3.5 text-rose-600 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-rose-800 dark:text-rose-200">Error terakhir{" "}
                <span className="font-normal text-rose-600 dark:text-rose-400 ml-1">({fmtRelative(status.lastErrorAt)})</span>
              </p>
              <p className="text-rose-700 dark:text-rose-300 mt-0.5 line-clamp-2">{status.lastError}</p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap pb-1">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Cari template (key, nama, deskripsi)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <div className="flex gap-1 p-1 bg-muted/50 rounded-lg overflow-x-auto no-scrollbar">
            <CategoryChip
              active={categoryFilter === "all"}
              label="Semua"
              count={templates.length}
              onClick={() => setCategoryFilter("all")}
            />
            {Object.keys(CATEGORY_LABELS).map(c => (
              <CategoryChip
                key={c}
                active={categoryFilter === c}
                label={CATEGORY_LABELS[c].label}
                count={categories[c] ?? 0}
                onClick={() => setCategoryFilter(c)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Templates list */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-3 md:py-4 kanban-scrollbar">
        {tplLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <div className="font-semibold text-sm">
                {search || categoryFilter !== "all" ? "Tidak ada template match filter" : "Belum ada template"}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {!search && categoryFilter === "all" && canEdit && "Klik 'Template Baru' untuk mulai."}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2 md:gap-3">
            {filtered.map(t => (
              <TemplateRow
                key={t.id}
                template={t}
                canEdit={canEdit}
                onEdit={() => setEditingTemplate(t)}
                onDelete={() => {
                  if (confirm(`Hapus template "${t.name}"?`)) deleteMut.mutate(t.id);
                }}
                onTest={() => setTestTemplate(t)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      {editingTemplate && (
        <TemplateDialog
          template={editingTemplate}
          onClose={() => setEditingTemplate(null)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["/api/mpwa/templates"] }); setEditingTemplate(null); }}
        />
      )}
      {/* New Dialog */}
      {newTemplateOpen && (
        <TemplateDialog
          template={null}
          onClose={() => setNewTemplateOpen(false)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["/api/mpwa/templates"] }); setNewTemplateOpen(false); }}
        />
      )}
      {/* Test Dialog */}
      {testTemplate && (
        <TestTemplateDialog
          template={testTemplate}
          configured={!!status?.configured}
          onClose={() => setTestTemplate(null)}
        />
      )}
    </div>
  );
}

// --- Sub-components -----------------------------------------------

function StatusPill({ status }: { status: MpwaStatus | undefined }) {
  if (!status) return null;
  if (!status.configured) {
    return (
      <Badge variant="outline" className="text-amber-600 border-amber-200 text-[10px]">
        <AlertTriangle className="h-3 w-3 mr-1" /> Dev mode
      </Badge>
    );
  }
  if (status.deviceStatus?.connected) {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 text-[10px]">
        <CheckCircle2 className="h-3 w-3 mr-1" /> Online
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-rose-600 border-rose-200 text-[10px]">
      <XCircle className="h-3 w-3 mr-1" /> Offline
    </Badge>
  );
}

function StatBox({
  label, value, icon, tone = "default", isText = false,
}: {
  label: string; value: number | string; icon: React.ReactNode; tone?: "default" | "slate" | "emerald"; isText?: boolean;
}) {
  const toneCls = tone === "emerald" ? "text-emerald-700 dark:text-emerald-300"
    : tone === "slate" ? "text-slate-700 dark:text-slate-300"
    : "text-foreground";
  return (
    <Card>
      <CardContent className="p-2.5 md:p-3">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          {icon} {label}
        </div>
        <div className={`font-bold mt-1 leading-tight ${isText ? "text-xs md:text-sm font-mono-tight" : "text-lg md:text-xl tabular-nums"} ${toneCls}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function CategoryChip({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-all ${
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      <span className="ml-1 opacity-60 font-normal">({count})</span>
    </button>
  );
}

function TemplateRow({
  template, canEdit, onEdit, onDelete, onTest,
}: {
  template: MpwaTemplate; canEdit: boolean; onEdit: () => void; onDelete: () => void; onTest: () => void;
}) {
  const cat = CATEGORY_LABELS[template.category] ?? CATEGORY_LABELS.general;
  const placeholders = parsePlaceholders(template.placeholders);
  return (
    <Card className="hover:shadow-sm transition-all">
      <CardContent className="p-3 md:p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${cat.color}`}>{cat.label}</span>
              {template.isSystem === 1 && (
                <Badge variant="outline" className="text-[10px] text-slate-600 border-slate-300">
                  <Lock className="h-2.5 w-2.5 mr-0.5" /> System
                </Badge>
              )}
              <span className="font-mono text-[11px] text-muted-foreground">{template.key}</span>
            </div>
            <div className="font-semibold text-sm">{template.name}</div>
            {template.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{template.description}</p>
            )}
            <div className="mt-2 p-2 rounded-md bg-muted/40 border text-xs font-mono whitespace-pre-wrap line-clamp-3 text-muted-foreground">
              {template.content}
            </div>
            {placeholders.length > 0 && (
              <div className="flex items-center gap-1 mt-2 flex-wrap">
                <span className="text-[10px] text-muted-foreground">Placeholders:</span>
                {placeholders.map(p => (
                  <code key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300 font-mono">
                    {`{${p}}`}
                  </code>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            <Button size="sm" variant="outline" onClick={onTest} className="h-7 text-[10px] gap-1">
              <Send className="h-3 w-3" /> Test
            </Button>
            {canEdit && (
              <>
                <Button size="sm" variant="ghost" onClick={onEdit} className="h-7 text-[10px] gap-1">
                  <Pencil className="h-3 w-3" /> Edit
                </Button>
                {template.isSystem !== 1 && (
                  <Button size="sm" variant="ghost" onClick={onDelete} className="h-7 text-[10px] gap-1 text-destructive hover:text-destructive">
                    <Trash2 className="h-3 w-3" /> Hapus
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// -- Edit/Create Template Dialog -----------------------------------
function TemplateDialog({
  template, onClose, onSaved,
}: {
  template: MpwaTemplate | null; onClose: () => void; onSaved: () => void;
}) {
  const isNew = !template;
  const [form, setForm] = useState({
    key: template?.key ?? "",
    name: template?.name ?? "",
    description: template?.description ?? "",
    content: template?.content ?? "",
    placeholders: parsePlaceholders(template?.placeholders ?? null).join(", "),
    category: template?.category ?? "general",
  });

  const placeholdersInContent = useMemo(() => {
    const matches = form.content.match(/\{(\w+)\}/g) ?? [];
    return [...new Set(matches.map(m => m.slice(1, -1)))];
  }, [form.content]);

  const saveMut = useMutation({
    mutationFn: () => {
      const body = {
        ...(isNew ? { key: form.key.trim() } : {}),
        name: form.name.trim(),
        description: form.description.trim() || null,
        content: form.content,
        placeholders: form.placeholders.split(",").map(p => p.trim()).filter(Boolean),
        category: form.category,
      };
      if (isNew) return api.post("/mpwa/templates", body);
      return api.put(`/mpwa/templates/${template!.id}`, body);
    },
    onSuccess: () => {
      toast.success(isNew ? "Template baru ditambahkan" : "Template ter-update");
      onSaved();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl dialog-w max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "Template Baru" : `Edit: ${template?.name}`}</DialogTitle>
          <DialogDescription>
            {template?.isSystem === 1
              ? "Template sistem - key tidak bisa diubah, kategori tetap. Hanya nama, deskripsi, dan content yang bisa di-edit."
              : "Atur isi pesan + placeholder yang akan di-substitute saat kirim."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {isNew && (
            <div>
              <Label className="text-xs">Key (unique, lowercase + underscore) *</Label>
              <Input
                value={form.key}
                onChange={(e) => setForm(f => ({ ...f, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") }))}
                placeholder="welcome_new_customer"
                className="font-mono text-sm mt-1"
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Nama *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Welcome Customer Baru"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Kategori</Label>
              <select
                value={form.category}
                onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                disabled={template?.isSystem === 1}
                className="w-full border rounded-md h-9 px-2 text-sm bg-background mt-1 disabled:opacity-60"
              >
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Deskripsi</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Pesan welcome saat customer baru aktif"
              className="mt-1 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Pesan (gunakan <code className="font-mono text-[10px] bg-muted px-1 rounded">{`{placeholder}`}</code>)</Label>
            <Textarea
              value={form.content}
              onChange={(e) => setForm(f => ({ ...f, content: e.target.value }))}
              rows={8}
              placeholder="Halo {nama},\nTerima kasih sudah berlangganan..."
              className="mt-1 font-mono text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Daftar Placeholder (comma-separated)</Label>
            <Input
              value={form.placeholders}
              onChange={(e) => setForm(f => ({ ...f, placeholders: e.target.value }))}
              placeholder="nama, otp, kode"
              className="mt-1 text-sm font-mono"
            />
            {placeholdersInContent.length > 0 && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Auto-detect dari content: {placeholdersInContent.map(p => <code key={p} className="font-mono mx-0.5">{`{${p}}`}</code>)}
                {" "}
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, placeholders: placeholdersInContent.join(", ") }))}
                  className="text-sky-600 hover:underline ml-1"
                >
                  pakai ini
                </button>
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={onClose}>Batal</Button>
            <Button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || !form.name.trim() || !form.content.trim() || (isNew && !form.key.trim())}
            >
              {saveMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {isNew ? "Buat" : "Simpan"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// -- Test Send Dialog ----------------------------------------------
function TestTemplateDialog({
  template, configured, onClose,
}: {
  template: MpwaTemplate; configured: boolean; onClose: () => void;
}) {
  const placeholders = parsePlaceholders(template.placeholders);
  const [phone, setPhone] = useState("");
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(placeholders.map(p => [p, ""]))
  );

  const previewContent = useMemo(() => {
    let msg = template.content;
    for (const [k, v] of Object.entries(values)) {
      msg = msg.replace(new RegExp(`\\{${k}\\}`, "g"), v || `{${k}}`);
    }
    return msg;
  }, [template.content, values]);

  const sendMut = useMutation({
    mutationFn: () => api.post("/mpwa/test", {
      phone: phone.trim(),
      message: previewContent,
    }),
    onSuccess: (r: any) => {
      toast.success(r?.message ?? "Pesan test terkirim");
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg dialog-w max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-emerald-600" /> Test Kirim - {template.name}
          </DialogTitle>
          <DialogDescription>
            Isi nomor tujuan + nilai placeholder. Pesan akan dikirim langsung via MPWA gateway.
          </DialogDescription>
        </DialogHeader>
        {!configured && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-xs">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-800 dark:text-amber-200">MPWA belum dikonfigurasi</p>
              <p className="text-amber-700 dark:text-amber-300">
                Setup di <a href="/integrations" className="underline">Integrasi API</a> dulu.
              </p>
            </div>
          </div>
        )}
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nomor HP Tujuan *</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="08123456789 / 628123456789"
              className="mt-1 font-mono"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Format bebas (08xx atau 628xx) - auto normalize.</p>
          </div>
          {placeholders.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1.5">
                Nilai Placeholder
                <span className="text-[10px] text-muted-foreground font-normal">({placeholders.length} total)</span>
              </Label>
              <div className="grid gap-2 max-h-48 overflow-y-auto border rounded-md p-2">
                {placeholders.map(p => (
                  <div key={p} className="flex items-center gap-2">
                    <code className="text-[11px] px-2 py-0.5 rounded bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300 font-mono shrink-0 min-w-20">
                      {`{${p}}`}
                    </code>
                    <Input
                      value={values[p] ?? ""}
                      onChange={(e) => setValues(v => ({ ...v, [p]: e.target.value }))}
                      placeholder={`isi nilai untuk ${p}`}
                      className="text-sm h-8"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <Label className="text-xs flex items-center gap-1.5">
              Preview Pesan
              <button
                onClick={() => { navigator.clipboard.writeText(previewContent); toast.success("Disalin"); }}
                className="text-[10px] text-sky-600 hover:underline inline-flex items-center gap-0.5"
              >
                <Copy className="h-2.5 w-2.5" /> Salin
              </button>
            </Label>
            <div className="mt-1 p-3 rounded-md bg-muted/40 border text-xs font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
              {previewContent}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={onClose}>Batal</Button>
            <Button
              onClick={() => sendMut.mutate()}
              disabled={sendMut.isPending || !phone.trim() || !configured}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Kirim Test
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
