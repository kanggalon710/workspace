import { useState, useEffect } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Wifi, WifiOff, Power, Loader2, Eye, EyeOff, CheckCircle2, Edit3 } from "lucide-react";
import { LoadingState } from "./shared";

export function WifiTab({ apiFetch, me, qc }: any) {
  const ontMatched = me?.ont?.matched === true;
  const pppoeOnline = me?.pppoe?.online === true;
  const [restartConfirm, setRestartConfirm] = useState(false);

  const { data: wifiInfo, isLoading: wifiLoading, refetch: refetchWifi } = useQuery<any>({
    queryKey: ["portal-wifi-info"],
    queryFn: () => apiFetch("/api/portal/wifi/info"),
    enabled: ontMatched,
    staleTime: 30_000,
    retry: false,
  });

  const restartMut = useMutation({
    mutationFn: () => apiFetch("/api/portal/ont/restart", { method: "POST" }),
    onSuccess: (r: any) => { toast.success(r.message ?? "Perintah restart dikirim"); setRestartConfirm(false); },
    onError: (e: any) => { toast.error(e.message); setRestartConfirm(false); },
  });

  if (!ontMatched) {
    return (
      <Card>
        <CardContent className="p-8">
          <EmptyState
            icon={WifiOff}
            title="Perangkat ONT Belum Terdeteksi"
            description="Fitur kelola WiFi aktif ketika perangkat ONT terhubung ke sistem JABNET. Hubungi CS bila memerlukan bantuan."
          />
        </CardContent>
      </Card>
    );
  }

  const usable: any[] = wifiInfo?.usable ?? [];
  const isDualBand = usable.length >= 2;
  const anyEnabled = usable.some((i: any) => i.enabled);
  const status = pppoeOnline && anyEnabled ? "active" : pppoeOnline ? "partial" : "offline";

  return (
    <div className="space-y-4 md:space-y-5">
      {/* WiFi hero */}
      <Card>
        <CardContent className="p-5 md:p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                status === "active" ? "bg-emerald-500" : status === "partial" ? "bg-amber-500" : "bg-slate-400"
              } text-white shadow-sm`}>
                <Wifi className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Jaringan WiFi
                </div>
                <div className="text-lg font-bold">
                  {status === "active" ? "Aktif" : status === "partial" ? "Partial" : "Offline"}
                </div>
              </div>
            </div>
            {isDualBand && <Badge variant="secondary" className="text-[10px]">Dual Band</Badge>}
          </div>

          {wifiLoading ? (
            <div className="py-8"><LoadingState /></div>
          ) : usable.length === 0 ? (
            <EmptyState icon={WifiOff} title="Tidak ada interface WiFi aktif" description="Hubungi support untuk pemeriksaan perangkat." />
          ) : (
            <div className="space-y-3">
              {usable.map((iface: any) => (
                <WifiInterfaceCard
                  key={iface.index}
                  iface={iface}
                  apiFetch={apiFetch}
                  onUpdated={() => {
                    qc.invalidateQueries({ queryKey: ["portal-wifi-info"] });
                    setTimeout(() => refetchWifi(), 5000);
                  }}
                />
              ))}
            </div>
          )}

          <div className="mt-4 p-3 rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-200/50 dark:border-sky-900/50 flex items-start gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
            <div className="text-[11px] text-sky-800 dark:text-sky-200">
              Perubahan SSID/password aktif dalam 1-2 menit. Perangkat yang sudah terhubung perlu re-connect.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Restart ONT */}
      <Card>
        <CardContent className="p-5 md:p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/40 flex items-center justify-center shrink-0">
              <Power className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold">Restart Perangkat ONT</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Coba gunakan saat koneksi lambat atau tidak stabil. Internet putus sekitar 1-2 menit. Dibatasi maksimal 1× per jam.
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full mt-4 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40"
            onClick={() => setRestartConfirm(true)}
            disabled={restartMut.isPending}
          >
            {restartMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Power className="h-4 w-4 mr-2" />}
            Restart ONT Sekarang
          </Button>
        </CardContent>
      </Card>

      {/* Restart confirm dialog */}
      <Dialog open={restartConfirm} onOpenChange={setRestartConfirm}>
        <DialogContent className="max-w-sm w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>Konfirmasi Restart ONT</DialogTitle>
            <DialogDescription>
              Koneksi internet akan terputus sekitar 1-2 menit. Semua perangkat di rumah perlu re-connect.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="outline" onClick={() => setRestartConfirm(false)} className="flex-1">Batal</Button>
            <Button onClick={() => restartMut.mutate()} disabled={restartMut.isPending} className="flex-1 bg-rose-600 hover:bg-rose-700">
              {restartMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Ya, Restart
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function WifiInterfaceCard({ iface, onUpdated, apiFetch }: any) {
  const [editMode, setEditMode] = useState<"ssid" | "password" | null>(null);
  const [newSsid, setNewSsid] = useState(iface.ssid ?? "");
  const [newPassword, setNewPassword] = useState(iface.password ?? "");
  const [showPw, setShowPw] = useState(false);

  useEffect(() => { if (editMode !== "ssid") setNewSsid(iface.ssid ?? ""); }, [iface.ssid, editMode]);
  useEffect(() => { if (editMode !== "password") setNewPassword(iface.password ?? ""); }, [iface.password, editMode]);

  const changeSsidMut = useMutation({
    mutationFn: (ssid: string) => apiFetch("/api/portal/wifi/ssid", {
      method: "POST",
      body: JSON.stringify({ newSsid: ssid, wlanIndex: iface.index }),
    }),
    onSuccess: (r: any) => { toast.success(r.message ?? `SSID ${iface.band} diperbarui`); setEditMode(null); onUpdated(); },
    onError: (e: any) => toast.error(e.message),
  });

  const changePwMut = useMutation({
    mutationFn: (pw: string) => apiFetch("/api/portal/wifi/password", {
      method: "POST",
      body: JSON.stringify({ newPassword: pw, wlanIndex: iface.index }),
    }),
    onSuccess: (r: any) => { toast.success(r.message ?? `Password ${iface.band} diperbarui`); setEditMode(null); onUpdated(); },
    onError: (e: any) => toast.error(e.message),
  });

  const mutPending = changeSsidMut.isPending || changePwMut.isPending;
  const bandColor = iface.band === "5GHz"
    ? "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 border-violet-200 dark:border-violet-900"
    : "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border-sky-200 dark:border-sky-900";

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${bandColor}`}>
            {iface.band} · WLAN{iface.index}
          </span>
          {iface.securityMode && (
            <span className="text-[10px] text-muted-foreground font-mono">{iface.securityMode}</span>
          )}
        </div>
        <Badge className={`text-[10px] ${iface.enabled ? "bg-emerald-500" : "bg-slate-400"}`}>
          {iface.enabled ? "ON" : "OFF"}
        </Badge>
      </div>

      <div className="p-4 space-y-3">
        {/* SSID */}
        {editMode === "ssid" ? (
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Nama WiFi (SSID)</label>
            <Input value={newSsid} onChange={(e) => setNewSsid(e.target.value)} maxLength={32} placeholder="Nama WiFi baru" autoFocus className="mt-1 font-mono" />
            <div className="flex gap-2 mt-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => { setEditMode(null); setNewSsid(iface.ssid ?? ""); }}>Batal</Button>
              <Button size="sm" className="flex-1" disabled={!newSsid.trim() || newSsid.trim().length < 3 || mutPending} onClick={() => changeSsidMut.mutate(newSsid.trim())}>
                {changeSsidMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Simpan
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Nama WiFi</div>
              <div className="font-mono text-sm font-semibold truncate">{iface.ssid || "-"}</div>
            </div>
            <Button size="sm" variant="ghost" className="text-sky-600 dark:text-sky-400 hover:text-sky-700" onClick={() => { setEditMode("ssid"); setNewSsid(iface.ssid ?? ""); }}>
              <Edit3 className="h-3.5 w-3.5 mr-1" /> Ubah
            </Button>
          </div>
        )}

        {/* Password */}
        {editMode === "password" ? (
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Password Baru</label>
            <div className="relative mt-1">
              <Input
                type={showPw ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                maxLength={63}
                placeholder="Min. 8 karakter"
                autoFocus
                className="font-mono pr-10"
              />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Minimal 8 karakter. Disarankan kombinasi huruf dan angka.</p>
            <div className="flex gap-2 mt-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => { setEditMode(null); setNewPassword(iface.password ?? ""); }}>Batal</Button>
              <Button size="sm" className="flex-1" disabled={newPassword.length < 8 || mutPending} onClick={() => changePwMut.mutate(newPassword)}>
                {changePwMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Simpan
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Password</div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold truncate">
                  {iface.password ? (showPw ? iface.password : "•".repeat(Math.min(12, iface.password.length || 8))) : "-"}
                </span>
                {iface.password && (
                  <button type="button" onClick={() => setShowPw(!showPw)} className="text-muted-foreground hover:text-foreground">
                    {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            </div>
            <Button size="sm" variant="ghost" className="text-sky-600 dark:text-sky-400 hover:text-sky-700" onClick={() => { setEditMode("password"); setNewPassword(iface.password ?? ""); }}>
              <Edit3 className="h-3.5 w-3.5 mr-1" /> Ubah
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// TICKETS TAB
// =====================================================================
