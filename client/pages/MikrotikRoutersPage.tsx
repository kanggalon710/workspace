import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Wifi, Plus, Edit, Trash2, RefreshCw, Loader2, CheckCircle2,
  XCircle, Cpu, HardDrive, Clock, Server, Eye, EyeOff,
  Shield, AlertTriangle, Activity, Info, Power,
} from "lucide-react";

interface SafeRouter {
  id: number;
  name: string;
  host: string;
  port: number | null;
  username: string;
  useSsl: number | null;
  isActive: number | null;
  routerOsVersion: string | null;
  boardName: string | null;
  identity: string | null;
  lastSeen: string | null;
  notes: string | null;
  createdAt: string | null;
}

interface TestResult {
  identity: string;
  version: string;
  boardName: string;
  architecture: string;
  cpuCount: string | number;
  cpuLoad: string | number;
  freeMemory: string | number;
  totalMemory: string | number;
  freeHdd: string | number;
  totalHdd: string | number;
  uptime: string;
  platform: string;
}

interface SystemResource {
  [key: string]: any;
}

const EMPTY_FORM = {
  name: "", host: "", port: "8728", username: "admin", password: "",
  useSsl: false, notes: "",
};

function formatBytes(bytes: string | number): string {
  const b = typeof bytes === "string" ? parseInt(bytes) : bytes;
  if (isNaN(b) || b === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatUptime(uptime: string): string {
  if (!uptime) return "-";
  // RouterOS uptime: "2w3d12h30m15s" or "12h30m15s"
  return uptime.replace(/(\d+)w/g, "$1 minggu ").replace(/(\d+)d/g, "$1 hari ")
    .replace(/(\d+)h/g, "$1j ").replace(/(\d+)m/g, "$1m ").replace(/(\d+)s/g, "$1s").trim();
}

function relativeTime(iso: string | null): string {
  if (!iso) return "Belum pernah";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return "baru saja";
    if (min < 60) return `${min}m lalu`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `${hrs}j lalu`;
    const days = Math.floor(hrs / 24);
    return `${days}h lalu`;
  } catch { return "-"; }
}

export default function MikrotikRoutersPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRouter, setEditRouter] = useState<SafeRouter | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [resourceDialogId, setResourceDialogId] = useState<number | null>(null);

  const { data: routers, isLoading } = useQuery<SafeRouter[]>({
    queryKey: ["/api/mikrotik/routers"],
    queryFn: () => api.get<SafeRouter[]>("/mikrotik/routers"),
  });

  const { data: resourceData, isLoading: resourceLoading } = useQuery<SystemResource>({
    queryKey: ["/api/mikrotik/routers", resourceDialogId, "resource"],
    queryFn: () => api.get<SystemResource>(`/mikrotik/routers/${resourceDialogId}/resource`),
    enabled: !!resourceDialogId,
  });

  const createMut = useMutation({
    mutationFn: (d: any) => api.post("/mikrotik/routers", d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mikrotik/routers"] });
      toast.success("Router berhasil ditambahkan");
      setDialogOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...d }: any) => api.put(`/mikrotik/routers/${id}`, d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mikrotik/routers"] });
      toast.success("Router berhasil diupdate");
      setDialogOpen(false); setEditRouter(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/mikrotik/routers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mikrotik/routers"] });
      toast.success("Router berhasil dihapus");
      setDeleteId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const testMut = useMutation({
    mutationFn: (id: number) => api.post<TestResult>(`/mikrotik/routers/${id}/test`, {}),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/mikrotik/routers"] });
      setTestResult(data);
      toast.success("Koneksi berhasil!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const testAdHocMut = useMutation({
    mutationFn: (d: any) => api.post<TestResult>("/mikrotik/test-connection", d),
    onSuccess: (data) => {
      setTestResult(data);
      toast.success("Koneksi berhasil!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const setField = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  const openCreate = () => {
    setEditRouter(null);
    setForm(EMPTY_FORM);
    setTestResult(null);
    setShowPassword(false);
    setDialogOpen(true);
  };

  const openEdit = (r: SafeRouter) => {
    setEditRouter(r);
    setForm({
      name: r.name, host: r.host, port: String(r.port || 443),
      username: r.username, password: "",
      useSsl: r.useSsl !== 0, notes: r.notes || "",
    });
    setTestResult(null);
    setShowPassword(false);
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.host.trim() || !form.username.trim()) {
      return toast.error("Nama, Host, dan Username wajib diisi");
    }
    if (!editRouter && !form.password) {
      return toast.error("Password wajib diisi untuk router baru");
    }
    const payload: any = {
      name: form.name.trim(), host: form.host.trim(),
      port: parseInt(form.port) || 443, username: form.username.trim(),
      useSsl: form.useSsl, notes: form.notes.trim() || null,
    };
    if (form.password) payload.password = form.password;
    if (editRouter) {
      updateMut.mutate({ id: editRouter.id, ...payload });
    } else {
      createMut.mutate(payload);
    }
  };

  const handleTestFromForm = () => {
    if (!form.host.trim() || !form.username.trim()) {
      return toast.error("Host dan Username wajib diisi untuk test koneksi");
    }
    if (!editRouter && !form.password) {
      return toast.error("Password wajib diisi");
    }
    // If editing and no new password, test the saved router
    if (editRouter && !form.password) {
      testMut.mutate(editRouter.id);
    } else {
      testAdHocMut.mutate({
        host: form.host.trim(), port: parseInt(form.port) || 443,
        username: form.username.trim(), password: form.password,
        useSsl: form.useSsl,
      });
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Wifi className="h-5 w-5 text-primary" />
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">Router MikroTik</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Kelola koneksi ke router MikroTik untuk integrasi billing & monitoring PPPoE.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" /> Tambah Router
        </Button>
      </div>

      {/* Router Cards */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map(i => (
            <Card key={i} className="animate-pulse"><CardContent className="p-5"><div className="h-40 bg-muted rounded" /></CardContent></Card>
          ))}
        </div>
      ) : !routers || routers.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <Wifi className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground mb-3">Belum ada router yang terdaftar.</p>
            <Button onClick={openCreate} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" /> Tambah Router Pertama
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {routers.map(r => {
            const isOnline = r.lastSeen && (Date.now() - new Date(r.lastSeen).getTime()) < 300000;
            return (
              <Card key={r.id} className={`border-border/60 transition-all hover:shadow-md ${r.isActive === 0 ? "opacity-60" : ""}`}>
                <CardContent className="p-5 space-y-4">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                        isOnline ? "bg-success/10" : "bg-muted"
                      }`}>
                        <Server className={`h-6 w-6 ${isOnline ? "text-success" : "text-muted-foreground"}`} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-foreground truncate">{r.name}</h3>
                        <p className="text-xs text-muted-foreground font-mono">{r.host}:{r.port || 443}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isOnline ? (
                        <Badge variant="outline" className="text-[10px] border-success/30 text-success gap-1">
                          <CheckCircle2 className="h-2.5 w-2.5" /> Online
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] border-muted text-muted-foreground gap-1">
                          <XCircle className="h-2.5 w-2.5" /> Offline
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Info Grid */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <InfoCell icon={Shield} label="Identity" value={r.identity} />
                    <InfoCell icon={Info} label="RouterOS" value={r.routerOsVersion} />
                    <InfoCell icon={Cpu} label="Board" value={r.boardName} />
                    <InfoCell icon={Clock} label="Terakhir terlihat" value={relativeTime(r.lastSeen)} />
                  </div>

                  {r.notes && (
                    <p className="text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2 italic">{r.notes}</p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-1.5 pt-2 border-t border-border/60">
                    <Button
                      variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1.5"
                      onClick={() => testMut.mutate(r.id)}
                      disabled={testMut.isPending}
                    >
                      {testMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      Test Koneksi
                    </Button>
                    <Button
                      variant="outline" size="sm" className="h-8 text-xs gap-1.5"
                      onClick={() => setResourceDialogId(r.id)}
                    >
                      <Activity className="h-3 w-3" /> Resource
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(r)} title="Edit">
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="outline" size="sm"
                      className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteId(r.id)} title="Hapus"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* === Create/Edit Dialog === */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) { setDialogOpen(false); setEditRouter(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editRouter ? <Edit className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editRouter ? `Edit: ${editRouter.name}` : "Tambah Router MikroTik"}
            </DialogTitle>
            <DialogDescription>
              Masukkan kredensial RouterOS REST API (port 443 HTTPS atau port kustom)
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Nama Router <span className="text-destructive">*</span></Label>
              <Input value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="Router POP-A Garut" required />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs">IP / Hostname <span className="text-destructive">*</span></Label>
                <Input value={form.host} onChange={(e) => setField("host", e.target.value)} placeholder="192.168.88.1" required />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Port</Label>
                <Input type="number" value={form.port} onChange={(e) => setField("port", e.target.value)} placeholder="443" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Username API <span className="text-destructive">*</span></Label>
                <Input value={form.username} onChange={(e) => setField("username", e.target.value)} placeholder="admin" required />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Password {!editRouter && <span className="text-destructive">*</span>}</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => setField("password", e.target.value)}
                    placeholder={editRouter ? "Kosongkan jika tidak diubah" : "Password API"}
                    required={!editRouter}
                    className="pr-9"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="useSsl" checked={form.useSsl}
                onChange={(e) => setField("useSsl", e.target.checked)} className="rounded" />
              <Label htmlFor="useSsl" className="text-xs cursor-pointer">Gunakan HTTPS (SSL) - disarankan</Label>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Catatan</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setField("notes", e.target.value)}
                placeholder="Lokasi, fungsi, atau keterangan tambahan (opsional)" />
            </div>

            {/* Test Result */}
            {testResult && (
              <div className="bg-success/10 border border-success/30 rounded-lg p-3 space-y-1">
                <p className="text-xs font-semibold text-success flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Koneksi berhasil
                </p>
                <div className="grid grid-cols-2 gap-1 text-[11px] text-foreground/80">
                  <span>Identity: <b>{testResult.identity}</b></span>
                  <span>Version: <b>{testResult.version}</b></span>
                  <span>Board: <b>{testResult.boardName}</b></span>
                  <span>CPU: <b>{testResult.cpuCount}x ({testResult.cpuLoad}%)</b></span>
                  <span>RAM: <b>{formatBytes(testResult.freeMemory)} free</b></span>
                  <span>Uptime: <b>{formatUptime(testResult.uptime)}</b></span>
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-between pt-2 border-t">
              <Button type="button" variant="outline" size="sm" className="gap-1.5"
                onClick={handleTestFromForm}
                disabled={testAdHocMut.isPending || testMut.isPending}>
                {(testAdHocMut.isPending || testMut.isPending) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Test Koneksi
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); setEditRouter(null); }}>Batal</Button>
                <Button type="submit" disabled={createMut.isPending || updateMut.isPending} className="gap-2">
                  {(createMut.isPending || updateMut.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editRouter ? "Simpan" : "Tambah"}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* === Resource Dialog === */}
      <Dialog open={!!resourceDialogId} onOpenChange={(o) => !o && setResourceDialogId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" /> System Resource
            </DialogTitle>
            <DialogDescription>
              {routers?.find(r => r.id === resourceDialogId)?.name || "Router"}
            </DialogDescription>
          </DialogHeader>
          {resourceLoading ? (
            <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>
          ) : resourceData ? (() => {
            // Support both camelCase (RouterOS API) and dash-case (REST API) field names
            const d = resourceData;
            const cpuLoad = Number(d.cpuLoad ?? d["cpu-load"] ?? 0);
            const totalMem = Number(d.totalMemory ?? d["total-memory"] ?? 0);
            const freeMem = Number(d.freeMemory ?? d["free-memory"] ?? 0);
            const totalHdd = Number(d.totalHddSpace ?? d["total-hdd-space"] ?? 0);
            const freeHdd = Number(d.freeHddSpace ?? d["free-hdd-space"] ?? 0);
            const usedMem = totalMem - freeMem;
            const usedHdd = totalHdd - freeHdd;
            return (
              <div className="space-y-3">
                <ResourceBar label="CPU" value={cpuLoad} unit="%" color="bg-blue-500" />
                <ResourceBar
                  label="RAM"
                  value={totalMem > 0 ? Math.round((usedMem / totalMem) * 100) : 0}
                  unit={`${formatBytes(usedMem)} / ${formatBytes(totalMem)}`}
                  color="bg-purple-500"
                />
                <ResourceBar
                  label="Disk"
                  value={totalHdd > 0 ? Math.round((usedHdd / totalHdd) * 100) : 0}
                  unit={`${formatBytes(usedHdd)} / ${formatBytes(totalHdd)}`}
                  color="bg-warning"
                />
                <div className="grid grid-cols-2 gap-3 pt-2 border-t text-xs">
                  <div><span className="text-muted-foreground">Uptime:</span> <b>{formatUptime(d.uptime || "")}</b></div>
                  <div><span className="text-muted-foreground">Version:</span> <b>{d.version}</b></div>
                  <div><span className="text-muted-foreground">Board:</span> <b>{d.boardName || d["board-name"]}</b></div>
                  <div><span className="text-muted-foreground">Arch:</span> <b>{d.architectureName || d["architecture-name"]}</b></div>
                  <div><span className="text-muted-foreground">CPU:</span> <b>{d.cpu} ({d.cpuCount || d["cpu-count"]}x {d.cpuFrequency || d["cpu-frequency"]}MHz)</b></div>
                  <div><span className="text-muted-foreground">Platform:</span> <b>{d.platform}</b></div>
                </div>
              </div>
            );
          })() : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-warning" />
              Tidak dapat mengambil data resource
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* === Delete Confirm === */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" /> Hapus Router?
            </DialogTitle>
            <DialogDescription>Router akan dihapus dari daftar. Ini tidak mengubah konfigurasi di router fisik.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setDeleteId(null)}>Batal</Button>
            <Button variant="destructive" onClick={() => deleteId && deleteMut.mutate(deleteId)} disabled={deleteMut.isPending} className="gap-2">
              {deleteMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Hapus
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// -- Sub components --
function InfoCell({ icon: Icon, label, value }: { icon: any; label: string; value: string | null }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <span className="text-muted-foreground">{label}: </span>
        <span className={`font-medium ${value ? "text-foreground" : "text-muted-foreground/50 italic"}`}>
          {value || "-"}
        </span>
      </div>
    </div>
  );
}

function ResourceBar({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted-foreground">{unit}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color} ${clamped > 80 ? "animate-pulse" : ""}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <div className="text-right text-[10px] text-muted-foreground tabular-nums">{clamped}%</div>
    </div>
  );
}
