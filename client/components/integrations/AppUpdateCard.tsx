/** Pembaruan Aplikasi (v5.7): cek versi terbaru di GitHub + tombol update sekali klik.
 *  Terlihat hanya untuk admin (endpoint check/apply admin-only). Update = server git reset
 *  ke branch deploy (payload pre-built) + restart Passenger - tanpa SSH ke cPanel. */
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw, DownloadCloud, CheckCircle2, AlertTriangle, GitBranch, Clock, Settings2, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

type BuildInfo = {
  version: string | null; sourceSha: string | null; sourceShaShort: string | null;
  buildTime: string | null; buildEnv: string | null; buildSourceBranch: string | null; gitHead: string | null;
  restartSupported?: boolean;
};
type CheckResult = {
  current: BuildInfo;
  remote: { sourceShaShort: string | null; buildTime: string | null; commitDate: string | null; commitMessage: string | null };
  updateAvailable: boolean; reason: string;
  enabled: boolean; repo: string; branch: string; tokenSet: boolean;
};
type ApplyStep = { step: string; ok: boolean; output: string };
type ApplyResult = { ok: boolean; steps: ApplyStep[]; restartTriggered: boolean; newBuild: BuildInfo };

const fmtTime = (iso: string | null | undefined) => {
  if (!iso) return "-";
  try { return new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }); } catch { return String(iso); }
};

const REASON_LABEL: Record<string, string> = {
  up_to_date: "Aplikasi sudah versi terbaru.",
  source_sha_differs: "Versi baru tersedia (build sumber berbeda).",
  git_head_differs: "Versi baru tersedia (commit berbeda).",
  repo_not_set: "Repo update belum diatur.",
  remote_unreachable: "Tidak bisa menghubungi GitHub - cek token/repo/branch.",
  no_local_build_meta: "Metadata build lokal tidak ada (mungkin mode dev).",
};

export function AppUpdateCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = !!user && (user.isSystemAdmin || user.role === "admin" || user.role === "Administrator");

  const [showConfig, setShowConfig] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);

  // Config draft (diisi dari hasil check).
  const [enabled, setEnabled] = useState(false);
  const [repo, setRepo] = useState("kanggalon710/workspace");
  const [branch, setBranch] = useState("deploy");
  const [token, setToken] = useState("");
  const [tokenSet, setTokenSet] = useState(false);

  const { data: check, isFetching, refetch } = useQuery<CheckResult>({
    queryKey: ["/api/system/update/check"],
    queryFn: () => api.get<CheckResult>("/system/update/check"),
    enabled: isAdmin,
    staleTime: 5 * 60_000,
    retry: false,
  });

  useEffect(() => {
    if (check) {
      setEnabled(check.enabled);
      setRepo(check.repo || "kanggalon710/workspace");
      setBranch(check.branch || "deploy");
      setTokenSet(check.tokenSet);
    }
  }, [check]);

  const saveConfig = useMutation({
    mutationFn: async () => {
      const settings: Array<{ key: string; value: string; category: string; label: string }> = [
        { key: "self_update_enabled", value: enabled ? "true" : "false", category: "update", label: "Update Otomatis Aktif" },
        { key: "self_update_repo", value: repo.trim(), category: "update", label: "Repo GitHub" },
        { key: "self_update_branch", value: branch.trim(), category: "update", label: "Branch Deploy" },
      ];
      if (token.trim()) settings.push({ key: "self_update_github_token", value: token.trim(), category: "update", label: "GitHub Token" });
      await api.put("/settings/bulk", { settings });
    },
    onSuccess: () => {
      toast.success("Pengaturan update disimpan");
      setToken("");
      qc.invalidateQueries({ queryKey: ["/api/settings"] });
      refetch();
    },
    onError: (e: any) => toast.error(e?.message || "Gagal menyimpan"),
  });

  const applyUpdate = useMutation({
    mutationFn: () => api.post<ApplyResult>("/system/update/apply", {}),
    onSuccess: (r) => {
      setApplyResult(r);
      setConfirmOpen(false);
      if (r.ok) toast.success(r.restartTriggered ? "Update diterapkan - aplikasi restart sebentar lagi" : "Update diterapkan");
      else toast.warning("Update selesai dengan sebagian langkah gagal - lihat detail");
      qc.invalidateQueries({ queryKey: ["/api/system/version"] });
    },
    onError: (e: any) => { setConfirmOpen(false); toast.error(e?.message || "Gagal update"); },
  });

  if (!isAdmin) return null;

  const cur = check?.current;
  const updateAvailable = check?.updateAvailable ?? false;

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <DownloadCloud className="h-4 w-4 text-primary" /> Pembaruan Aplikasi
          </h3>
          {updateAvailable ? (
            <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300">Versi baru</Badge>
          ) : check ? (
            <Badge className="bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-300">Terbaru</Badge>
          ) : null}
        </div>

        {/* Versi sekarang vs terbaru */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
            <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Versi Terpasang</p>
            <p className="font-mono-tight text-sm">{cur?.version ?? "-"} <span className="text-muted-foreground">({cur?.sourceShaShort ?? "?"})</span></p>
            <p className="flex items-center gap-1 text-muted-foreground"><Clock className="h-3 w-3" /> {fmtTime(cur?.buildTime)}</p>
            {cur?.buildEnv && <p className="flex items-center gap-1 text-muted-foreground"><GitBranch className="h-3 w-3" /> {cur.buildEnv} · {cur.buildSourceBranch ?? "-"}</p>}
          </div>
          <div className={`rounded-lg border p-3 space-y-1 ${updateAvailable ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900" : "bg-muted/30"}`}>
            <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Versi Terbaru (GitHub)</p>
            <p className="font-mono-tight text-sm">{check?.remote.sourceShaShort ?? "-"}</p>
            <p className="flex items-center gap-1 text-muted-foreground"><Clock className="h-3 w-3" /> {fmtTime(check?.remote.buildTime ?? check?.remote.commitDate)}</p>
            <p className="text-muted-foreground line-clamp-1">{check?.remote.commitMessage ?? ""}</p>
          </div>
        </div>

        {/* Status + aksi */}
        <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-2.5 text-xs">
          {updateAvailable
            ? <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            : <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />}
          <span className="text-muted-foreground">{REASON_LABEL[check?.reason ?? ""] ?? "Belum dicek."}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} leftIcon={isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}>
            {isFetching ? "Mengecek..." : "Cek Pembaruan"}
          </Button>
          <Button
            variant={updateAvailable ? "default" : "outline"} size="sm"
            onClick={() => { setApplyResult(null); setConfirmOpen(true); }}
            disabled={!check?.enabled || applyUpdate.isPending}
            leftIcon={<DownloadCloud className="h-3.5 w-3.5" />}
            title={!check?.enabled ? "Aktifkan update otomatis dulu di Pengaturan Update" : undefined}
          >
            Update Sekarang
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowConfig((v) => !v)} leftIcon={<Settings2 className="h-3.5 w-3.5" />}>
            Pengaturan Update
          </Button>
        </div>

        {!check?.enabled && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            Tombol "Update Sekarang" nonaktif. Aktifkan lewat "Pengaturan Update" agar bisa diklik.
          </p>
        )}

        {/* Config */}
        {showConfig && (
          <div className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <Label className="text-xs">Aktifkan Update Sekali Klik</Label>
                <p className="text-[11px] text-muted-foreground">Izinkan server menarik versi terbaru + restart otomatis.</p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Repo GitHub (owner/repo)</Label>
                <Input inputSize="sm" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="kanggalon710/workspace" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Branch Deploy</Label>
                <Input inputSize="sm" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="deploy" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">GitHub Token {tokenSet && <span className="text-green-600">(tersimpan)</span>}</Label>
              <Input inputSize="sm" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={tokenSet ? "•••••••• (kosongkan = tak berubah)" : "Wajib untuk repo privat"} />
              <p className="text-[11px] text-muted-foreground">Personal Access Token (baca repo) untuk cek versi repo privat.</p>
            </div>
            <Button size="sm" onClick={() => saveConfig.mutate()} disabled={saveConfig.isPending} loading={saveConfig.isPending}>
              Simpan Pengaturan
            </Button>
          </div>
        )}

        {/* Hasil apply */}
        {applyResult && (
          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-xs font-semibold">Hasil Update</p>
            <div className="space-y-1.5">
              {applyResult.steps.map((s, i) => (
                <div key={i} className="text-[11px]">
                  <div className="flex items-center gap-1.5 font-medium">
                    {s.ok ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : <AlertTriangle className="h-3 w-3 text-red-600" />}
                    {s.step}
                  </div>
                  {s.output && <pre className="mt-0.5 whitespace-pre-wrap break-words rounded bg-muted/50 p-1.5 text-[10px] text-muted-foreground max-h-24 overflow-auto">{s.output}</pre>}
                </div>
              ))}
            </div>
            {applyResult.restartTriggered && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">Aplikasi akan reload pada akses berikutnya. Muat ulang halaman setelah beberapa detik.</p>
            )}
          </div>
        )}
      </CardContent>

      {/* Konfirmasi update */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update aplikasi sekarang?</DialogTitle>
            <DialogDescription className="text-xs">
              Server akan menarik versi terbaru dari branch <strong>{check?.branch}</strong>, memasang dependency bila berubah,
              lalu me-restart aplikasi. Proses beberapa detik - jangan tutup halaman.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(false)} disabled={applyUpdate.isPending}>Batal</Button>
            <Button size="sm" onClick={() => applyUpdate.mutate()} disabled={applyUpdate.isPending} loading={applyUpdate.isPending} leftIcon={<DownloadCloud className="h-3.5 w-3.5" />}>
              Ya, Update Sekarang
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
