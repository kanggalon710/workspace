import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { FullBleedPage } from "@/components/ui/full-bleed-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  KeyRound, Plus, Copy, Trash2, Power, PowerOff, Eye, Activity,
  AlertTriangle, CheckCircle2, Shield, Clock, Loader2, Code,
  BookOpen, ExternalLink, Terminal,
} from "lucide-react";

const ALL_SCOPES = [
  { key: "marketing:read", label: "Marketing Bundle (Recommended)", desc: "Canvassing sessions + performance, prospects, lead funnel velocity, source attribution, per-staff scorecard, coverage by district, Sahabat funnel, GIS heatmap. Endpoint utama untuk AI daily analysis.",  recommended: true },
  { key: "reports:read", label: "Laporan Operasional Cross-domain", desc: "Ringkasan harian/mingguan lintas domain - canvassing, leads, collections, tickets, sahabat, payments"  },
  { key: "leads:read", label: "Pipeline Leads (Basic)", desc: "List leads, stats per stage/wilayah. Untuk deep-dive funnel & attribution pakai marketing:read"  },
  { key: "collections:read", label: "Pipeline Collection", desc: "List cases penagihan, stats outstanding, detail + activities"  },
  { key: "finance:read", label: "Revenue & Billing", desc: "MRR, ARPU, revenue-at-risk, billing status, collection recovery & aging. Agregat (tanpa PII). Untuk laporan keuangan harian→quarter."  },
  { key: "customers:read", label: "Subscriber Base", desc: "Jumlah pelanggan by status/paket/wilayah, aktivasi baru, net adds. Agregat (tanpa PII)."  },
  { key: "sahabat:read", label: "Program JABNET Sahabat (Basic)", desc: "Stats program, leaderboard, referral list. Untuk deep-dive funnel pakai marketing:read"  },
  { key: "tickets:read", label: "Work Orders / Tickets", desc: "Tiket aktif, stats per status, SLA info"  },
  { key: "divisions:read", label: "Analisa Divisi (Team Performance)", desc: "Output pekerjaan tim PER DIVISI (Marketing/Teknik/NOC/Layanan/Keuangan/HRD) - tiket/lead/collection/canvassing daily->weekly->monthly + snapshot KPI per divisi. GET /divisions & /divisions/:key. Untuk AI agent laporan mingguan tim.", recommended: true },
  { key: "teamspace:read", label: "Teamspace (Tugas & Kinerja Tim)", desc: "Ringkasan tugas per tim + kinerja per anggota (selesai/terlambat + output ops). Agregat, tanpa isi chat/dokumen."  },
];

export default function PublicApiPage() {
  const { canWrite, canRead: canReadFeature } = useAuth();
  const canEdit = canWrite("api_keys");
  const canRead = canReadFeature("api_keys");
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [viewKey, setViewKey] = useState<string | null>(null);
  const [viewKeyName, setViewKeyName] = useState<string>("");
  const [usageFor, setUsageFor] = useState<any | null>(null);
  const [docsOpen, setDocsOpen] = useState(false);

  const { data: keys = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/api-keys"],
    queryFn: () => api.get<any[]>("/api-keys"),
    enabled: canRead,
    refetchInterval: 60_000,
  });

  const { data: usage = [] } = useQuery<any[]>({
    queryKey: ["/api/api-keys", usageFor?.id, "usage"],
    queryFn: () => api.get<any[]>(`/api-keys/${usageFor.id}/usage?limit=100`),
    enabled: !!usageFor,
  });

  const createMut = useMutation({
    mutationFn: (data: any) => api.post<any>("/api-keys", data),
    onSuccess: (r) => {
      toast.success("API key berhasil dibuat");
      setViewKey(r.fullKey);
      setViewKeyName(r.name);
      qc.invalidateQueries({ queryKey: ["/api/api-keys"] });
      setCreateOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: (data: { id: number; enabled: boolean }) =>
      api.patch(`/api-keys/${data.id}`, { enabled: data.enabled }),
    onSuccess: () => {
      toast.success("Status key diubah");
      qc.invalidateQueries({ queryKey: ["/api/api-keys"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const revokeMut = useMutation({
    mutationFn: (data: { id: number; reason: string }) =>
      api.post(`/api-keys/${data.id}/revoke`, { reason: data.reason }),
    onSuccess: () => {
      toast.success("Key dicabut");
      qc.invalidateQueries({ queryKey: ["/api/api-keys"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api-keys/${id}`),
    onSuccess: () => {
      toast.success("Key dihapus");
      qc.invalidateQueries({ queryKey: ["/api/api-keys"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!canRead) {
    return (
      <div className="p-8 text-center">
        <Shield className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
        <div className="font-semibold">Akses Ditolak</div>
        <div className="text-xs text-muted-foreground mt-1">Anda tidak memiliki izin akses Public API</div>
      </div>
    );
  }

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <FullBleedPage>
      {/* Header - sticky */}
      <div className="sticky top-0 z-10 px-4 md:px-6 pt-4 md:pt-6 pb-4 space-y-4 shrink-0 bg-background border-b">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 md:gap-4 min-w-0 flex-1">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shrink-0">
              <KeyRound className="h-5 w-5 md:h-6 md:w-6 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl md:text-2xl font-bold tracking-tight">Public API</h1>
                <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 rounded">v1</span>
              </div>
              <p className="text-xs md:text-sm text-muted-foreground mt-0.5 md:mt-1 max-w-2xl">
                <span className="hidden md:inline">Integrasi ke OpenClaude, BI tool, atau analisis AI eksternal. Read-only, scoped, rate-limited.</span>
                <span className="md:hidden">Integrasi AI eksternal · read-only</span>
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={() => setDocsOpen(true)}>
              <BookOpen className="h-4 w-4 md:mr-1.5" />
              <span className="hidden md:inline">Dokumentasi</span>
            </Button>
            {canEdit && (
              <Button size="sm" onClick={() => setCreateOpen(true)} className="bg-indigo-600 hover:bg-indigo-700">
                <Plus className="h-4 w-4 md:mr-1.5" />
                <span className="hidden md:inline">Buat API Key</span>
                <span className="md:hidden">Buat</span>
              </Button>
            )}
          </div>
        </div>

        {/* Base URL info */}
        <Card>
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-sky-100 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                  <Terminal className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Base URL</div>
                  <div className="font-mono text-xs md:text-sm truncate">{baseUrl}/api/public/v1</div>
                </div>
              </div>
              <Button
                size="sm" variant="ghost" className="shrink-0 h-8 px-2"
                onClick={() => {
                  navigator.clipboard.writeText(`${baseUrl}/api/public/v1`);
                  toast.success("URL disalin");
                }}
              >
                <Copy className="h-3.5 w-3.5 md:mr-1.5" />
                <span className="hidden md:inline">Salin</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Key list */}
      <div className="flex-1 md:overflow-y-auto px-4 md:px-6 py-4">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : keys.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <KeyRound className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
              <div className="font-semibold text-sm">Belum ada API Key</div>
              <div className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                Buat API key untuk integrasi ke OpenClaude atau tool eksternal lain yang butuh akses read-only ke data ops.
              </div>
              {canEdit && (
                <Button onClick={() => setCreateOpen(true)} className="mt-4 bg-indigo-600 hover:bg-indigo-700">
                  <Plus className="h-4 w-4 mr-1.5" /> Buat API Key Pertama
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {keys.map((k) => <KeyCard
              key={k.id} apiKey={k} canEdit={canEdit}
              onView={() => setUsageFor(k)}
              onToggle={() => toggleMut.mutate({ id: k.id, enabled: !k.enabled })}
              onRevoke={() => {
                if (confirm(`Revoke API key "${k.name}"? Integrasi yang pakai key ini langsung berhenti.`)) {
                  revokeMut.mutate({ id: k.id, reason: "revoked via admin UI" });
                }
              }}
              onDelete={() => {
                if (confirm(`Hapus permanen key "${k.name}"? Tidak bisa di-undo.`)) {
                  deleteMut.mutate(k.id);
                }
              }}
            />)}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <CreateKeyDialog
        open={createOpen} onClose={() => setCreateOpen(false)}
        onCreate={(data: any) => createMut.mutate(data)}
        isPending={createMut.isPending}
      />

      {/* View full key ONCE */}
      <Dialog open={!!viewKey} onOpenChange={() => setViewKey(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              API Key Dibuat: {viewKeyName}
            </DialogTitle>
            <DialogDescription>
              Simpan key ini sekarang. Setelah dialog ditutup, key tidak akan ditampilkan lagi.
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 rounded-lg border-2 border-dashed border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
            <div className="flex items-start gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                One-time display - pastikan key sudah tersimpan di password manager / env var integrasi
              </div>
            </div>
            <div className="font-mono text-xs break-all select-all bg-background p-3 rounded border mt-2">
              {viewKey}
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => {
              navigator.clipboard.writeText(viewKey ?? "");
              toast.success("Key disalin");
            }}>
              <Copy className="h-4 w-4 mr-1.5" /> Salin Key
            </Button>
            <Button className="flex-1" onClick={() => setViewKey(null)}>
              Saya sudah menyimpan
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Usage log viewer */}
      <Dialog open={!!usageFor} onOpenChange={() => setUsageFor(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-sky-500" />
              Log Pemakaian: {usageFor?.name}
            </DialogTitle>
            <DialogDescription>
              100 request terakhir. Log disimpan 30 hari.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-auto">
            {usage.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">Belum ada log pemakaian</div>
            ) : (
              <table className="w-full text-xs min-w-[560px]">
                <thead className="sticky top-0 bg-background border-b">
                  <tr className="text-left text-muted-foreground">
                    <th className="py-2 px-2 font-semibold uppercase text-[10px]">Waktu</th>
                    <th className="py-2 px-2 font-semibold uppercase text-[10px]">Method</th>
                    <th className="py-2 px-2 font-semibold uppercase text-[10px]">Endpoint</th>
                    <th className="py-2 px-2 font-semibold uppercase text-[10px] text-right">Status</th>
                    <th className="py-2 px-2 font-semibold uppercase text-[10px] text-right">Ms</th>
                    <th className="py-2 px-2 font-semibold uppercase text-[10px]">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.map((u: any) => (
                    <tr key={u.id} className="border-b last:border-0">
                      <td className="py-1.5 px-2 text-muted-foreground whitespace-nowrap">{new Date(u.createdAt).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td>
                      <td className="py-1.5 px-2 font-mono font-semibold">{u.method}</td>
                      <td className="py-1.5 px-2 font-mono text-[11px] truncate max-w-xs">{u.endpoint}</td>
                      <td className={`py-1.5 px-2 text-right font-mono font-semibold ${u.statusCode >= 400 ? "text-rose-600" : "text-emerald-600"}`}>{u.statusCode}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{u.responseMs}</td>
                      <td className="py-1.5 px-2 font-mono text-[10px] text-muted-foreground">{u.ipAddress ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Docs dialog */}
      <DocsDialog open={docsOpen} onClose={() => setDocsOpen(false)} baseUrl={baseUrl} />
    </FullBleedPage>
  );
}

// =====================================================================
function KeyCard({ apiKey: k, canEdit, onView, onToggle, onRevoke, onDelete }: any) {
  const isExpired = k.expiresAt && new Date(k.expiresAt).getTime() < Date.now();
  const isRevoked = !!k.revokedAt;
  const scopes: string[] = Array.isArray(k.scopes) ? k.scopes : [];
  return (
    <Card className={`${!k.enabled || isRevoked ? "opacity-60" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="font-semibold text-sm">{k.name}</h3>
              {isRevoked ? (
                <Badge className="bg-rose-500 text-[10px]">Dicabut</Badge>
              ) : isExpired ? (
                <Badge className="bg-slate-500 text-[10px]">Expired</Badge>
              ) : k.enabled ? (
                <Badge className="bg-emerald-500 text-[10px]">Aktif</Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">Nonaktif</Badge>
              )}
              <span className="font-mono text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {k.keyPrefix}•••••••
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              {scopes.map((s) => (
                <span key={s} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300">
                  {s}
                </span>
              ))}
            </div>

            <div className="flex items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground mt-2 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <Activity className="h-3 w-3" />
                {k.totalRequests.toLocaleString("id-ID")} total requests
              </span>
              <span className="inline-flex items-center gap-1">
                <Shield className="h-3 w-3" />
                {k.rateLimit} req/menit
              </span>
              {k.lastUsedAt ? (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Terakhir pakai {fmtRelative(k.lastUsedAt)}
                </span>
              ) : (
                <span className="italic">Belum pernah digunakan</span>
              )}
              {k.expiresAt && (
                <span className={`inline-flex items-center gap-1 ${isExpired ? "text-rose-600" : ""}`}>
                  {isExpired ? "Expired" : "Expires"} {new Date(k.expiresAt).toLocaleDateString("id-ID")}
                </span>
              )}
            </div>

            {isRevoked && k.revokedReason && (
              <div className="mt-2 text-[11px] text-rose-600 dark:text-rose-400">
                Dicabut: {k.revokedReason} ({new Date(k.revokedAt).toLocaleDateString("id-ID")})
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button size="sm" variant="ghost" onClick={onView} title="Lihat log pemakaian">
              <Eye className="h-3.5 w-3.5" />
            </Button>
            {canEdit && !isRevoked && (
              <Button size="sm" variant="ghost" onClick={onToggle} title={k.enabled ? "Nonaktifkan" : "Aktifkan"}>
                {k.enabled ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5 text-emerald-600" />}
              </Button>
            )}
            {canEdit && !isRevoked && (
              <Button size="sm" variant="ghost" onClick={onRevoke} title="Revoke" className="text-amber-600 hover:text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" />
              </Button>
            )}
            {canEdit && (
              <Button size="sm" variant="ghost" onClick={onDelete} title="Hapus permanen" className="text-rose-600 hover:text-rose-700">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// =====================================================================
function CreateKeyDialog({ open, onClose, onCreate, isPending }: any) {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [rateLimit, setRateLimit] = useState(60);
  const [expiresAt, setExpiresAt] = useState("");

  const toggleScope = (s: string) => {
    setScopes((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    if (scopes.length === 0) return;
    onCreate({
      name: name.trim(),
      scopes,
      rateLimit,
      expiresAt: expiresAt || null,
    });
  };

  const reset = () => {
    setName(""); setScopes([]); setRateLimit(60); setExpiresAt("");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-lg dialog-w max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-5 md:px-6 pt-5 md:pt-6 pb-3 border-b shrink-0">
          <DialogTitle>Buat API Key Baru</DialogTitle>
          <DialogDescription>
            Pilih scopes yang dibutuhkan. Key bersifat read-only.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 md:px-6 py-4 overflow-y-auto flex-1">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nama</label>
            <Input
              placeholder="OpenClaude Daily, Grafana BI, dll"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              className="mt-1"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Label untuk identifikasi (tidak dikirim saat request)</p>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Scopes *</label>
            <div className="space-y-1.5 mt-1.5">
              {ALL_SCOPES.map((s: any) => (
                <label
                  key={s.key}
                  className={`flex items-start gap-2.5 p-2.5 md:p-3 rounded-lg border cursor-pointer transition-all ${
                    s.recommended
                      ? "border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-950/20 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                      : "hover:bg-muted/30"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={scopes.includes(s.key)}
                    onChange={() => toggleScope(s.key)}
                    className="mt-0.5 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="shrink-0">{s.icon}</span>
                      <span className="font-semibold text-sm">{s.label}</span>
                      {s.recommended && (
                        <span className="px-1.5 py-0.5 bg-indigo-600 text-white text-[9px] font-bold uppercase tracking-wider rounded shrink-0">
                          Recommended
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground mt-0.5">{s.key}</div>
                    <div className="text-[11px] text-muted-foreground mt-1 leading-snug">{s.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rate Limit</label>
              <Input
                type="number"
                min={1} max={6000}
                value={rateLimit}
                onChange={(e) => setRateLimit(Number(e.target.value))}
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">req/menit (default 60)</p>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Expires (opsional)</label>
              <Input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Kosong = tidak expired</p>
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-end px-5 md:px-6 py-3 border-t bg-muted/20 shrink-0">
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Batal</Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || scopes.length === 0 || isPending}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Buat Key
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
function DocsDialog({ open, onClose, baseUrl }: any) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-indigo-500" />
            Dokumentasi Public API
          </DialogTitle>
          <DialogDescription>
            Cara menggunakan API untuk integrasi eksternal (OpenClaude, BI tool, dll)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 text-sm">
          <Section title="1. Autentikasi">
            <p className="text-muted-foreground mb-2">Semua request (kecuali /health dan /schema) butuh header Authorization dengan API key Bearer token.</p>
            <CodeBlock code={`Authorization: Bearer jbk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`} />
          </Section>

          <Section title="2. Base URL">
            <CodeBlock code={`${baseUrl}/api/public/v1`} />
          </Section>

          <Section title="3. Endpoint Utama - Marketing Bundle">
            <p className="text-muted-foreground mb-2 text-xs">Untuk analisis AI harian, fokus di <strong>marketing:read</strong> - endpoint-nya sudah dense dan pre-analyzed.</p>
            <div className="space-y-2 text-xs">
              <EndpointRow method="GET" path="/marketing/overview" desc="Dense overview untuk AI: momentum, red flags, top performer, hot spots" scope="marketing:read" />
              <EndpointRow method="GET" path="/marketing/canvassing/sessions" desc="Canvassing sessions: active, today, per-canvasser stats" scope="marketing:read" />
              <EndpointRow method="GET" path="/marketing/canvassing/performance" desc="Per-canvasser matrix: sessions, duration, reports, prospects" scope="marketing:read" />
              <EndpointRow method="GET" path="/marketing/canvassing/reports" desc="Field reports BI (area_sepi, kompetitor, akses_sulit, dsb)" scope="marketing:read" />
              <EndpointRow method="GET" path="/marketing/prospects" desc="Prospect database. Filter: category, hasOdp, district" scope="marketing:read" />
              <EndpointRow method="GET" path="/marketing/prospects/stats" desc="Prospect stats: by category, ODP coverage, distance bucket" scope="marketing:read" />
              <EndpointRow method="GET" path="/marketing/leads/funnel" desc="Conversion funnel: per-stage velocity (avgDays), drop-off, top loss reasons" scope="marketing:read" />
              <EndpointRow method="GET" path="/marketing/leads/attribution" desc="Source attribution: prospect_finder vs canvassing vs referral vs inbound" scope="marketing:read" />
              <EndpointRow method="GET" path="/marketing/leads/performance" desc="Per-staff scorecard: assigned, won, conversion rate, activities (call/wa/visit)" scope="marketing:read" />
              <EndpointRow method="GET" path="/marketing/coverage" desc="Coverage per district: canvassing, leads, active customers, penetration" scope="marketing:read" />
              <EndpointRow method="GET" path="/marketing/heatmap" desc="GIS lat/lng untuk viz peta (prospects + leads + canvassing)" scope="marketing:read" />
              <EndpointRow method="GET" path="/marketing/sahabat/funnel" desc="Referral funnel: invited→registered→rewarded + per-tier breakdown" scope="marketing:read" />
            </div>
          </Section>

          <Section title="4. Endpoint Lainnya">
            <div className="space-y-2 text-xs">
              <EndpointRow method="GET" path="/health" desc="Health check (no auth)" />
              <EndpointRow method="GET" path="/schema" desc="Full endpoint list (no auth)" />
              <EndpointRow method="GET" path="/reports/daily" desc="Cross-domain summary hari ini" scope="reports:read" />
              <EndpointRow method="GET" path="/collections/stats" desc="Outstanding amount, avg age" scope="collections:read" />
              <EndpointRow method="GET" path="/sahabat/leaderboard" desc="Top Sahabat" scope="sahabat:read" />
              <EndpointRow method="GET" path="/tickets/stats" desc="Open tickets, SLA" scope="tickets:read" />
            </div>
          </Section>

          <Section title="5. Contoh curl - Marketing">
            <CodeBlock code={`# Marketing overview (paling penting untuk AI daily)
curl -H "Authorization: Bearer jbk_live_xxx" \\
  ${baseUrl}/api/public/v1/marketing/overview

# Canvassing performance 7 hari
curl -H "Authorization: Bearer jbk_live_xxx" \\
  "${baseUrl}/api/public/v1/marketing/canvassing/performance?from=2026-04-14T00:00:00Z"

# Lead funnel + drop-off analysis 30 hari
curl -H "Authorization: Bearer jbk_live_xxx" \\
  ${baseUrl}/api/public/v1/marketing/leads/funnel

# Coverage per district - untuk strategi ekspansi
curl -H "Authorization: Bearer jbk_live_xxx" \\
  ${baseUrl}/api/public/v1/marketing/coverage

# Sahabat referral funnel
curl -H "Authorization: Bearer jbk_live_xxx" \\
  ${baseUrl}/api/public/v1/marketing/sahabat/funnel`} />
          </Section>

          <Section title="6. Integrasi Claude API - Audit Harian Otomatis">
            <p className="text-muted-foreground mb-2 text-xs">
              Jadwalkan cron pagi → AI langsung kasih insight ke Telegram/WhatsApp admin:
            </p>
            <CodeBlock code={`import requests
import anthropic

# 1. Pull marketing overview (ONE CALL, semua insight)
headers = {"Authorization": "Bearer jbk_live_xxx"}
overview = requests.get(
    "${baseUrl}/api/public/v1/marketing/overview",
    headers=headers
).json()

# 2. Pull detail funnel + coverage untuk deep analysis
funnel = requests.get("${baseUrl}/api/public/v1/marketing/leads/funnel", headers=headers).json()
coverage = requests.get("${baseUrl}/api/public/v1/marketing/coverage", headers=headers).json()
canvas = requests.get("${baseUrl}/api/public/v1/marketing/canvassing/performance", headers=headers).json()

# 3. Kirim ke Claude - red flags & green lights sudah pre-computed
client = anthropic.Anthropic(api_key="sk-ant-...")
msg = client.messages.create(
    model="claude-opus-4-5",
    max_tokens=1500,
    messages=[{
        "role": "user",
        "content": f"""Analisa kinerja marketing JABNET (role: SPV Marketing).

OVERVIEW (sudah include red_flags + green_lights):
{overview}

LEAD FUNNEL:
{funnel}

COVERAGE PER KECAMATAN:
{coverage}

CANVASSING PERFORMANCE:
{canvas}

Output:
1. Apa prioritas #1 untuk besok? (1 kalimat)
2. Siapa top 3 performer hari ini + reasoning
3. Kecamatan mana yang underserved & butuh turun canvassing?
4. Lead di stage mana yang stuck & perlu intervensi?
5. 1 strategi konkret untuk meningkatkan conversion rate"""
    }]
)

# 4. Kirim hasil ke WA admin via MPWA
import json
analysis = msg.content[0].text
print(analysis)
# requests.post("https://mpwa.jabnet.id/send-message", json={...})`} />
          </Section>

          <Section title="7. Rate Limit & Error Codes">
            <div className="space-y-1 text-xs text-muted-foreground">
              <div><strong>200</strong> - success</div>
              <div><strong>401</strong> - invalid/missing/expired/revoked key</div>
              <div><strong>403</strong> - scope tidak mencukupi</div>
              <div><strong>404</strong> - resource tidak ditemukan</div>
              <div><strong>429</strong> - rate limit exceeded (header: Retry-After: 60)</div>
              <div><strong>500</strong> - internal error</div>
            </div>
          </Section>

          <Section title="8. Best Practices">
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>Simpan key di environment variable, jangan commit ke git</li>
              <li>1 key per integrasi - lebih mudah audit + revoke granular</li>
              <li>Batasi scope sesuai kebutuhan (least privilege)</li>
              <li>Set expires_at untuk key yang sementara</li>
              <li>Monitor log pemakaian di tab "Lihat Log" tiap key</li>
              <li>Cache response 5-15 menit di sisi consumer untuk hemat rate limit</li>
            </ul>
          </Section>

          <div className="flex justify-center pt-2">
            <a
              href={`${baseUrl}/api/public/v1/schema`}
              target="_blank" rel="noreferrer"
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
            >
              Lihat OpenAPI schema JSON <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="font-semibold text-sm mb-2">{title}</h4>
      <div>{children}</div>
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative group">
      <pre className="bg-slate-900 text-slate-100 p-3 rounded-lg text-[11px] font-mono overflow-x-auto">
        <code>{code}</code>
      </pre>
      <button
        onClick={() => { navigator.clipboard.writeText(code); toast.success("Disalin"); }}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-slate-300 p-1.5 rounded hover:bg-slate-700"
      >
        <Copy className="h-3 w-3" />
      </button>
    </div>
  );
}

function EndpointRow({ method, path, desc, scope }: { method: string; path: string; desc: string; scope?: string }) {
  return (
    <div className="flex items-start gap-2 p-2 rounded border bg-muted/20">
      <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold font-mono bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 rounded">
        {method}
      </span>
      <code className="font-mono text-[11px] text-foreground">{path}</code>
      <span className="text-[10px] text-muted-foreground flex-1">{desc}</span>
      {scope && (
        <span className="font-mono text-[9px] text-indigo-600 dark:text-indigo-400 shrink-0">{scope}</span>
      )}
    </div>
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
