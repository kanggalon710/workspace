/**
 * v4.2.20 (PRD WA Feature v2): Nomor Whatsapp
 * Multi-device support dengan 12 provider gateway (6 unofficial + 6 official).
 * Form dinamis: field config berubah sesuai provider yang dipilih.
 */

import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  Plus, Trash2, Edit3, Send, MessageCircle, Loader2, AlertCircle, CheckCircle2,
  XCircle, Smartphone, Search, ChevronRight, ArrowLeft, Save, Info, QrCode,
  Power, Inbox, Phone, RefreshCw, Copy, Link2,
} from "lucide-react";

interface WaProvider {
  key: string;
  label: string;
  channel: "unofficial" | "official";
  fields: string[];
}

interface WaDevice {
  id: number;
  name: string;
  phone: string;
  provider: string;
  providerChannel: string;
  config: string | null;
  delaySeconds: number;
  isActive: number;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  // v4.2.21
  connectionStatus?: string; // unknown | connected | disconnect | qr_pending
  lastQrAt?: string | null;
  lastQrData?: string | null;
  webhookToken?: string | null;
  webhookUrl?: string | null;
  deviceInfo?: string | null;
}

const FIELD_LABELS: Record<string, { label: string; placeholder: string; isSecret?: boolean; helpText?: string }> = {
  apiKey: { label: "API Key", placeholder: "Masukkan API key...", isSecret: true, helpText: "API key dari dashboard provider Anda" },
  url: { label: "URL Provider", placeholder: "Contoh: https://wa.billingjagoan.com", helpText: "Base URL gateway (tanpa trailing slash)" },
  token: { label: "Token", placeholder: "Masukkan token...", isSecret: true },
  secret: { label: "Secret", placeholder: "Masukkan secret...", isSecret: true },
  deviceId: { label: "Device ID", placeholder: "Device ID dari provider" },
  numberKey: { label: "Number Key", placeholder: "Number key dari Watzap" },
  channelId: { label: "Channel ID", placeholder: "Channel ID" },
  pageId: { label: "Page ID", placeholder: "Pancake page ID" },
  subdomain: { label: "Subdomain", placeholder: "Kommo subdomain (mis: mycompany)" },
};

const DELAY_OPTIONS = [1, 2, 3, 5, 8, 10, 15, 20, 25, 30];

export default function NomorWhatsappPage() {
  const qc = useQueryClient();
  const [view, setView] = useState<"list" | "form">("list");
  const [editing, setEditing] = useState<WaDevice | null>(null);
  const [search, setSearch] = useState("");
  // v4.2.21: MPWA QR modal
  const [qrOpen, setQrOpen] = useState(false);
  const [qrDeviceId, setQrDeviceId] = useState<number | null>(null);

  const { data: devices = [], isLoading } = useQuery<WaDevice[]>({
    queryKey: ["wa-devices"],
    queryFn: () => api.get("/whatsapp/devices"),
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return devices;
    const q = search.toLowerCase();
    return devices.filter(d =>
      d.name.toLowerCase().includes(q) ||
      d.phone.includes(q) ||
      d.provider.toLowerCase().includes(q)
    );
  }, [devices, search]);

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/whatsapp/devices/${id}`),
    onSuccess: () => { toast.success("Device dihapus"); qc.invalidateQueries({ queryKey: ["wa-devices"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (view === "form") {
    return <DeviceForm device={editing} onBack={() => { setView("list"); setEditing(null); }} />;
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4 max-w-7xl">
      {/* Breadcrumb */}
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        <MessageCircle className="h-3 w-3" />
        <span>Whatsapp</span>
        <ChevronRight className="h-3 w-3" />
        <span>Nomor Whatsapp</span>
        <ChevronRight className="h-3 w-3" />
        <span className="font-bold">List</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="rounded-lg bg-gradient-to-br from-violet-100 to-purple-200 p-2.5 shrink-0">
            <Smartphone className="h-5 w-5 text-violet-700" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight-display truncate">Nomor Whatsapp</h1>
            <p className="text-sm text-muted-foreground truncate">Daftar device gateway WhatsApp aktif</p>
          </div>
        </div>
        <Button
          onClick={() => { setEditing(null); setView("form"); }}
          className="bg-violet-600 hover:bg-violet-700"
          leftIcon={<Plus className="h-3.5 w-3.5" />}
        >
          Tambah Baru
        </Button>
      </div>

      {/* Card */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-bold text-sm">List Nomor Whatsapp</h2>
          <div className="relative flex-1 min-w-[140px] sm:flex-none">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Cari..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 text-sm w-full sm:w-56 h-8"
            />
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <Smartphone className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <div className="font-bold">Belum ada device terdaftar</div>
            <div className="text-xs text-muted-foreground mt-1">Klik "Tambah Baru" untuk mendaftarkan gateway WhatsApp pertama.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-muted/30 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left w-12">NO</th>
                <th className="px-4 py-2 text-left">NAMA DEVICE</th>
                <th className="px-4 py-2 text-left">NOMOR TELEPON</th>
                <th className="px-4 py-2 text-left">PROVIDER WHATSAPP</th>
                <th className="px-4 py-2 text-left">STATUS</th>
                <th className="px-4 py-2 text-right">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((d, i) => (
                <tr key={d.id} className="hover:bg-muted/20 transition">
                  <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{i + 1}</td>
                  <td className="px-4 py-2.5 font-semibold">{d.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{d.phone}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs font-mono uppercase">{d.provider}</span>
                    <span className={cn(
                      "ml-2 text-[9px] px-1 py-0.5 rounded font-bold uppercase",
                      d.providerChannel === "official" ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700"
                    )}>
                      {d.providerChannel}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {d.isActive ? (
                      d.lastError ? (
                        <span className="inline-flex items-center gap-1 text-xs text-rose-600">
                          <XCircle className="h-3 w-3" /> Error
                        </span>
                      ) : d.lastSuccessAt ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                          <CheckCircle2 className="h-3 w-3" /> Aktif
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
                          <AlertCircle className="h-3 w-3" /> Belum dipakai
                        </span>
                      )
                    ) : (
                      <span className="text-xs text-zinc-400">Nonaktif</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {d.provider === "mpwa" && (
                      <Button
                        size="icon-xs" variant="ghost"
                        onClick={() => { setQrDeviceId(d.id); setQrOpen(true); }}
                        title="Cek status MPWA + webhook setup"
                      >
                        <Info className="h-3.5 w-3.5 text-violet-600" />
                      </Button>
                    )}
                    <Button size="icon-xs" variant="ghost" onClick={() => { setEditing(d); setView("form"); }} title="Edit">
                      <Edit3 className="h-3.5 w-3.5 text-blue-600" />
                    </Button>
                    <Button
                      size="icon-xs" variant="ghost"
                      onClick={() => { if (confirm(`Hapus device "${d.name}"?`)) deleteMut.mutate(d.id); }}
                      title="Hapus"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* v4.2.21: QR Connect Modal */}
      {qrOpen && qrDeviceId && (
        <MpwaConnectModal deviceId={qrDeviceId} onClose={() => { setQrOpen(false); setQrDeviceId(null); }} />
      )}
    </div>
  );
}

// -----------------------------------------------------------------
// v4.2.21: MPWA Device Status Modal
//
// PENTING: Connection ke WhatsApp di-manage di MPWA panel (mpwa.jabnet.id).
// JABNET hanya pakai API key untuk consume MPWA API (kirim/terima pesan).
// Modal ini cuma untuk:
// 1. Cek status koneksi (live dari /info-devices)
// 2. Setup webhook URL untuk terima pesan masuk
// 3. Tools: check-number, test send
// 4. Reconnect via QR (HANYA kalau device disconnect - opsional fallback)
// -----------------------------------------------------------------
function MpwaConnectModal({ deviceId, onClose }: { deviceId: number; onClose: () => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"status" | "webhook" | "tools" | "reconnect">("status");

  const { data: device } = useQuery<WaDevice>({
    queryKey: ["wa-device", deviceId],
    queryFn: () => api.get(`/whatsapp/devices/${deviceId}`),
    refetchInterval: 10_000,
  });

  // Auto-fetch live status saat modal pertama buka
  const infoMut = useMutation<any, Error>({
    mutationFn: () => api.get<any>(`/whatsapp/devices/${deviceId}/info`),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["wa-device", deviceId] });
      // v4.2.21: tampilkan MPWA error message kalau status: false
      if (data && data.status === false) {
        const msg = typeof data.msg === "string" ? data.msg : JSON.stringify(data.msg ?? "Unknown");
        toast.error(`MPWA: ${msg}`);
      } else if (data && data.status === true) {
        toast.success("Status di-update");
      }
    },
    onError: (e: any) => toast.error(`Refresh gagal: ${e.message}`),
  });
  useEffect(() => {
    // Auto-fetch sekali saat modal open
    infoMut.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  const generateQrMut = useMutation<any, Error, boolean>({
    mutationFn: (force: boolean = false) => api.post<{ status: boolean; qrcode?: string; msg?: string }>(`/whatsapp/devices/${deviceId}/qr`, { force }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["wa-device", deviceId] });
      qc.invalidateQueries({ queryKey: ["wa-devices"] });
      if (data?.qrcode) toast.info("Scan QR untuk reconnect device");
      else if (data?.msg) toast.success(data.msg);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const logoutMut = useMutation({
    mutationFn: () => api.post(`/whatsapp/devices/${deviceId}/logout`, {}),
    onSuccess: () => { toast.success("Device di-disconnect"); qc.invalidateQueries({ queryKey: ["wa-device", deviceId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const webhookMut = useMutation({
    mutationFn: () => api.post<{ token: string; webhookUrl: string }>(`/whatsapp/devices/${deviceId}/webhook-token`, {}),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["wa-device", deviceId] });
      toast.success("Webhook URL ter-generate. Copy & paste ke MPWA panel.");
      // Auto-copy ke clipboard
      try { navigator.clipboard.writeText(data?.webhookUrl ?? ""); } catch {}
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [checkPhone, setCheckPhone] = useState("");
  const checkNumberMut = useMutation({
    mutationFn: () => api.post<any>(`/whatsapp/devices/${deviceId}/check-number`, { phone: checkPhone }),
    onError: (e: any) => toast.error(e.message),
  });

  const statusConfig: Record<string, { label: string; color: string; icon: any; desc: string }> = {
    connected: { label: "Connected", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2, desc: "Device aktif di MPWA, siap kirim/terima pesan." },
    qr_pending: { label: "Need Scan", color: "bg-amber-100 text-amber-700", icon: QrCode, desc: "Device perlu di-scan QR untuk reconnect." },
    disconnect: { label: "Disconnect", color: "bg-rose-100 text-rose-700", icon: XCircle, desc: "Device tidak aktif di MPWA. Reconnect via QR atau dari MPWA panel." },
    unknown: { label: "Cek Status", color: "bg-zinc-100 text-zinc-700", icon: AlertCircle, desc: "Status belum di-cek. Klik 'Refresh' atau cek di MPWA panel." },
  };
  const status = statusConfig[device?.connectionStatus ?? "unknown"] ?? statusConfig.unknown;
  const StatusIcon = status.icon;
  const isConnected = device?.connectionStatus === "connected";

  // Parse cached device info dari MPWA
  let info: any = null;
  try { if (device?.deviceInfo) info = JSON.parse(device.deviceInfo); } catch {}

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="h-4 w-4 text-violet-600" />
            {device?.name ?? "Loading..."}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 text-xs">
            <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold uppercase tracking-wider", status.color)}>
              <StatusIcon className="h-3 w-3" /> {status.label}
            </span>
            {device?.phone && <span className="font-mono">{device.phone}</span>}
            <span className="text-muted-foreground">· via MPWA API</span>
          </DialogDescription>
        </DialogHeader>

        {/* Tabs - default Status */}
        <div className="flex gap-1 border-b">
          {([
            { key: "status", label: "Status", icon: Info },
            { key: "webhook", label: "Webhook", icon: Link2 },
            { key: "tools", label: "Tools", icon: Phone },
            { key: "reconnect", label: "Reconnect", icon: QrCode },
          ] as const).map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "px-3 py-2 text-xs font-bold uppercase tracking-wider transition border-b-2 flex items-center gap-1.5",
                  tab === t.key ? "border-violet-600 text-violet-600" : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-3 w-3" />
                {t.label}
                {t.key === "reconnect" && !isConnected && device?.connectionStatus && device?.connectionStatus !== "unknown" && (
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="mt-3 space-y-3">
          {/* STATUS Tab (default) */}
          {tab === "status" && (
            <div className="space-y-3">
              {/* Info box: how MPWA works */}
              <div className="rounded-md bg-sky-50/40 border border-sky-200 px-3 py-2 text-[11px] text-sky-900 leading-snug">
                <strong>ℹ Cara kerja:</strong> Device WhatsApp di-manage di <strong>mpwa.jabnet.id</strong>{" "}
                (scan QR, link device, dst.). JABNET hanya pakai <code className="font-mono bg-sky-100 px-1 rounded">api_key</code>{" "}
                + nomor device untuk consume API kirim/terima pesan. Tidak perlu scan ulang QR di sini.
              </div>

              {/* Status banner */}
              <div className={cn(
                "rounded-md border-2 p-4 flex items-start gap-3",
                isConnected ? "border-emerald-200 bg-emerald-50/40" :
                device?.connectionStatus === "disconnect" ? "border-rose-200 bg-rose-50/40" :
                "border-zinc-200 bg-zinc-50/40"
              )}>
                <StatusIcon className={cn(
                  "h-8 w-8 shrink-0",
                  isConnected ? "text-emerald-600" :
                  device?.connectionStatus === "disconnect" ? "text-rose-600" :
                  "text-zinc-500"
                )} />
                <div className="flex-1">
                  <div className={cn(
                    "font-bold text-sm",
                    isConnected ? "text-emerald-900" :
                    device?.connectionStatus === "disconnect" ? "text-rose-900" :
                    "text-zinc-700"
                  )}>
                    {status.label}
                  </div>
                  <div className="text-xs mt-0.5 text-muted-foreground">{status.desc}</div>
                  {device?.lastSuccessAt && (
                    <div className="text-[10px] text-muted-foreground mt-1.5">
                      Last successful send: {new Date(device.lastSuccessAt).toLocaleString("id-ID")}
                    </div>
                  )}
                </div>
                <Button
                  size="xs" variant="ghost"
                  onClick={() => infoMut.mutate()}
                  loading={infoMut.isPending}
                  leftIcon={<RefreshCw className="h-3 w-3" />}
                >
                  Refresh
                </Button>
              </div>

              {/* v4.2.21: MPWA response error banner - kalau refresh balikin status: false */}
              {infoMut.data && (infoMut.data as any).status === false && (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-900">
                  <div className="font-bold flex items-center gap-1.5 mb-1">
                    <XCircle className="h-3.5 w-3.5" />
                    MPWA Error Response
                  </div>
                  <div className="font-mono text-[11px] break-all">
                    {typeof (infoMut.data as any).msg === "string"
                      ? (infoMut.data as any).msg
                      : JSON.stringify((infoMut.data as any).msg ?? (infoMut.data as any))}
                  </div>
                  {(infoMut.data as any)._meta && (
                    <div className="text-[10px] text-rose-700 mt-1.5">
                      Endpoint: <code className="font-mono">{(infoMut.data as any)._meta.baseUrl}{(infoMut.data as any)._meta.endpointTried}</code>
                    </div>
                  )}
                  <details className="mt-1.5">
                    <summary className="text-[10px] cursor-pointer">Lihat raw response</summary>
                    <pre className="text-[10px] font-mono whitespace-pre-wrap leading-tight mt-1 max-h-40 overflow-y-auto bg-white/50 rounded p-1.5">
                      {JSON.stringify(infoMut.data, null, 2)}
                    </pre>
                  </details>
                  <div className="text-[10px] mt-2 text-rose-800">
                    <strong>Kemungkinan penyebab:</strong>
                    <ul className="list-disc ml-4 mt-0.5">
                      <li>API key salah atau expired</li>
                      <li>Nomor device tidak terdaftar di akun MPWA Anda</li>
                      <li>URL MPWA salah (cek di Integrations)</li>
                      <li>Endpoint <code>/info-devices</code> mungkin butuh <code>/public/</code> prefix di instance MPWA tertentu</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* Quick info kalau ada */}
              {info && (
                <div className="rounded-md border bg-muted/10 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Detail dari MPWA</div>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <div><dt className="text-muted-foreground inline">Status MPWA:</dt> <dd className="inline font-mono">{info.status ?? "-"}</dd></div>
                    <div><dt className="text-muted-foreground inline">Webhook:</dt> <dd className="inline font-mono text-[10px] break-all">{info.webhook || "(belum diset)"}</dd></div>
                    {info.reply_when && <div><dt className="text-muted-foreground inline">Reply Mode:</dt> <dd className="inline font-mono">{info.reply_when}</dd></div>}
                    {info.reject_call != null && <div><dt className="text-muted-foreground inline">Reject Call:</dt> <dd className="inline font-mono">{info.reject_call ? "Yes" : "No"}</dd></div>}
                  </dl>
                  <details className="mt-2">
                    <summary className="text-[10px] text-muted-foreground cursor-pointer">Lihat raw JSON</summary>
                    <pre className="text-[10px] font-mono whitespace-pre-wrap leading-relaxed mt-1 max-h-48 overflow-y-auto">
                      {JSON.stringify(info, null, 2)}
                    </pre>
                  </details>
                </div>
              )}

              {/* Last error tersimpan */}
              {device?.lastError && !infoMut.data && (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
                  <strong>Last error:</strong> {device.lastError}
                  {device.lastErrorAt && <div className="text-[10px] text-rose-700 mt-0.5">{new Date(device.lastErrorAt).toLocaleString("id-ID")}</div>}
                </div>
              )}

              {/* Manage di MPWA panel */}
              <a
                href="https://mpwa.jabnet.id"
                target="_blank"
                rel="noreferrer"
                className="block text-center text-xs text-violet-600 hover:underline pt-2"
              >
                Buka MPWA Panel → mpwa.jabnet.id (kelola device, scan QR, dst.)
              </a>
            </div>
          )}

          {/* Webhook Tab */}
          {tab === "webhook" && (
            <div className="space-y-3">
              <div className="rounded-md bg-sky-50/40 border border-sky-200 px-3 py-2 text-xs text-sky-900">
                <strong>Webhook</strong> memungkinkan JABNET menerima pesan masuk dari pelanggan secara real-time
                (untuk auto-reply, ticketing, atau chatbot). Generate webhook URL di sini lalu paste ke MPWA panel
                (mpwa.jabnet.id → Device → Webhook URL).
              </div>

              {device?.webhookToken ? (
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider">Webhook URL</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      value={`${window.location.origin}/api/whatsapp/webhook/mpwa/${device.webhookToken}`}
                      readOnly
                      className="text-xs font-mono"
                    />
                    <Button
                      size="icon-xs" variant="ghost" aria-label="Salin URL webhook"
                      onClick={() => {
                        const url = `${window.location.origin}/api/whatsapp/webhook/mpwa/${device.webhookToken}`;
                        navigator.clipboard.writeText(url).then(() => toast.success("URL di-copy"));
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Paste URL ini ke field Webhook di MPWA dashboard untuk device {device.phone}.
                  </p>
                  <Button
                    size="xs" variant="ghost"
                    onClick={() => { if (confirm("Regenerate webhook token? URL lama akan invalid.")) webhookMut.mutate(); }}
                    className="text-rose-600 mt-2"
                  >
                    Regenerate Token
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  onClick={() => webhookMut.mutate()}
                  loading={webhookMut.isPending}
                  leftIcon={<Link2 className="h-3 w-3" />}
                >
                  Generate Webhook URL
                </Button>
              )}
            </div>
          )}

          {/* Tools Tab */}
          {tab === "tools" && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider">Check Number - Verifikasi Nomor WhatsApp</label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    type="tel"
                    placeholder="081234567890"
                    value={checkPhone}
                    onChange={(e) => setCheckPhone(e.target.value)}
                    className="text-sm font-mono"
                  />
                  <Button
                    size="sm" variant="ghost-primary"
                    onClick={() => checkNumberMut.mutate()}
                    disabled={!checkPhone || checkNumberMut.isPending}
                    loading={checkNumberMut.isPending}
                  >
                    Check
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Sebelum broadcast skala besar, cek dulu nomor tujuan terdaftar di WhatsApp untuk hemat quota.
                </p>
                {checkNumberMut.data && (
                  <div className={cn(
                    "mt-2 rounded-md border px-3 py-2 text-xs",
                    (checkNumberMut.data as any)?.msg?.exists
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-rose-200 bg-rose-50 text-rose-900"
                  )}>
                    {(checkNumberMut.data as any)?.msg?.exists
                      ? <><CheckCircle2 className="inline h-3.5 w-3.5 mr-1" /> Nomor terdaftar di WhatsApp · JID: <code className="font-mono">{(checkNumberMut.data as any).msg.jid}</code></>
                      : <><XCircle className="inline h-3.5 w-3.5 mr-1" /> Nomor tidak terdaftar di WhatsApp</>}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Reconnect Tab - opsional fallback kalau device disconnect */}
          {tab === "reconnect" && (
            <div className="space-y-3">
              {isConnected ? (
                <div className="rounded-md border-2 border-emerald-200 bg-emerald-50/40 p-4 text-center">
                  <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto mb-2" />
                  <div className="font-bold text-emerald-900">Device sudah Connected</div>
                  <div className="text-xs text-emerald-700 mt-1">Tidak perlu scan QR. Kalau mau force disconnect:</div>
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => { if (confirm("Disconnect device dari MPWA?")) logoutMut.mutate(); }}
                    loading={logoutMut.isPending}
                    leftIcon={<Power className="h-3 w-3" />}
                    className="mt-3 text-rose-600"
                  >
                    Disconnect Device
                  </Button>
                </div>
              ) : (
                <>
                  <div className="rounded-md bg-amber-50/40 border border-amber-200 px-3 py-2 text-xs text-amber-900 leading-snug">
                    <strong> Reconnect via QR - opsional</strong><br />
                    Idealnya reconnect dilakukan langsung di <strong>mpwa.jabnet.id</strong> (panel resmi).
                    Tool ini cuma alternatif kalau Anda mau request QR dari sini tanpa buka panel MPWA.
                  </div>

                  {device?.lastQrData ? (
                    <div className="text-center">
                      <div className="inline-block p-4 bg-white border-2 border-violet-200 rounded-lg">
                        <img src={device.lastQrData} alt="QR Code" className="w-64 h-64 mx-auto" />
                      </div>
                      <div className="text-xs text-muted-foreground mt-2 text-left max-w-xs mx-auto">
                        1. Buka WhatsApp di HP → Menu → <em>Linked Devices</em><br />
                        2. Tap <em>Link a Device</em> → scan QR di atas<br />
                        3. Klik "Cek Status" di bawah setelah scan
                      </div>
                      <Button
                        size="sm" variant="ghost-primary"
                        onClick={() => generateQrMut.mutate(false)}
                        loading={generateQrMut.isPending}
                        leftIcon={<RefreshCw className="h-3 w-3" />}
                        className="mt-3"
                      >
                        Cek Status / Refresh QR
                      </Button>
                    </div>
                  ) : (
                    <div className="rounded-md border-2 border-dashed p-6 text-center">
                      <QrCode className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                      <div className="font-bold">Request QR Code dari MPWA</div>
                      <div className="text-xs text-muted-foreground mt-1 mb-3">
                        Klik untuk request QR baru. Setelah scan, status auto-update.
                      </div>
                      <Button
                        onClick={() => generateQrMut.mutate(false)}
                        loading={generateQrMut.isPending}
                        leftIcon={<QrCode className="h-3.5 w-3.5" />}
                        className="bg-violet-600 hover:bg-violet-700"
                      >
                        Request QR
                      </Button>
                      <div className="text-[10px] text-muted-foreground mt-3">
                        <a href="https://mpwa.jabnet.id" target="_blank" rel="noreferrer" className="text-violet-600 hover:underline">
                          atau scan langsung di MPWA panel →
                        </a>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Tutup</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------
// Form Tambah / Edit
// -----------------------------------------------------------------
function DeviceForm({ device, onBack }: { device: WaDevice | null; onBack: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!device;
  const [name, setName] = useState(device?.name ?? "");
  const [phone, setPhone] = useState(device?.phone ?? "");
  const [provider, setProvider] = useState(device?.provider ?? "");
  const [delay, setDelay] = useState(device?.delaySeconds ?? 2);
  const [config, setConfig] = useState<Record<string, string>>(() => {
    if (!device?.config) return {};
    try { return JSON.parse(device.config); } catch { return {}; }
  });
  const [testPhone, setTestPhone] = useState("");
  const [showTest, setShowTest] = useState(false);

  const { data: providers = [] } = useQuery<WaProvider[]>({
    queryKey: ["wa-providers"],
    queryFn: () => api.get("/whatsapp/providers"),
  });

  const unofficial = providers.filter(p => p.channel === "unofficial");
  const official = providers.filter(p => p.channel === "official");
  const selectedProvider = providers.find(p => p.key === provider);

  const saveMut = useMutation({
    mutationFn: () => {
      const body = { name, phone, provider, delaySeconds: delay, config };
      return isEdit
        ? api.put(`/whatsapp/devices/${device!.id}`, body)
        : api.post("/whatsapp/devices", body);
    },
    onSuccess: () => {
      toast.success(isEdit ? "Device diperbarui" : "Device ditambahkan");
      qc.invalidateQueries({ queryKey: ["wa-devices"] });
      onBack();
    },
    onError: (e: any) => toast.error(e.message || "Gagal simpan"),
  });

  const testMut = useMutation({
    mutationFn: () => api.post(`/whatsapp/devices/${device!.id}/test`, { phone: testPhone }),
    onSuccess: (data: any) => {
      toast.success(data?.sent ? "Pesan test terkirim!" : `Gagal: ${data?.error}`);
      setShowTest(false); setTestPhone("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  function handleSubmit() {
    if (!name.trim()) return toast.error("Nama device wajib");
    if (!phone.trim()) return toast.error("Nomor telepon wajib");
    if (!provider) return toast.error("Pilih provider WhatsApp");
    // Validate required config fields
    if (selectedProvider) {
      for (const f of selectedProvider.fields) {
        if (!config[f] || !config[f].trim()) {
          return toast.error(`Field "${FIELD_LABELS[f]?.label ?? f}" wajib`);
        }
      }
    }
    saveMut.mutate();
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4 max-w-4xl">
      {/* Breadcrumb */}
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        <MessageCircle className="h-3 w-3" />
        <span>Whatsapp</span>
        <ChevronRight className="h-3 w-3" />
        <button onClick={onBack} className="hover:text-foreground">Nomor Whatsapp</button>
        <ChevronRight className="h-3 w-3" />
        <span className="font-bold">{isEdit ? "Edit" : "Form"}</span>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={onBack} className="rounded-md hover:bg-muted p-2 -ml-2"><ArrowLeft className="h-4 w-4" /></button>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight-display">
          {isEdit ? `Edit: ${device!.name}` : "Tambah Nomor Whatsapp Baru"}
        </h1>
      </div>

      {/* Section 1: Info Provider */}
      <div className="rounded-md border bg-orange-50/40 border-orange-200 px-4 py-3">
        <div className="flex items-start gap-2">
          <Info className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
          <div className="text-xs text-orange-900 leading-relaxed">
            <strong>Sebelum menambahkan Nomor Whatsapp</strong> pastikan Anda telah memiliki paket berlangganan salah satu layanan WhatsApp berikut:
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
              <div>
                <strong className="text-sky-700">Unofficial (6):</strong>
                <div className="text-[11px] text-muted-foreground">{unofficial.map(p => p.label).join(", ")}</div>
              </div>
              <div>
                <strong className="text-emerald-700">Official (6):</strong>
                <div className="text-[11px] text-muted-foreground">{official.map(p => p.label).join(", ")}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Pilih Layanan */}
      <div className="rounded-xl border bg-card p-4">
        <h2 className="font-bold text-sm mb-3">Pilih Layanan Whatsapp</h2>
        <select
          value={provider}
          onChange={(e) => { setProvider(e.target.value); setConfig({}); }}
          disabled={isEdit}
          className="w-full px-3 py-2 rounded-md border bg-background text-sm"
        >
          <option value="">- Pilih provider -</option>
          <optgroup label="Unofficial (6 provider)">
            {unofficial.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </optgroup>
          <optgroup label="Official (6 provider)">
            {official.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </optgroup>
        </select>
        {isEdit && <p className="text-[10px] text-muted-foreground mt-1 italic">Provider tidak bisa diganti setelah device dibuat.</p>}
      </div>

      {/* Section 3 & 4 hanya muncul setelah pilih provider */}
      {provider && (
        <>
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <h2 className="font-bold text-sm">Data Perangkat</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider">
                  Nama Perangkat <span className="text-rose-600">*</span>
                  <Info className="inline h-3 w-3 ml-1 text-muted-foreground" />
                </label>
                <Input
                  placeholder="Masukkan nama device.."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="text-sm mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider">
                  Nomor Telepon <span className="text-rose-600">*</span>
                </label>
                <Input
                  placeholder="Masukkan nomor telepon.."
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="text-sm font-mono mt-1"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">Format: 62xxx (tanpa + atau 0)</p>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider">
                  Delay <Info className="inline h-3 w-3 ml-1 text-muted-foreground" />
                </label>
                <select
                  value={delay}
                  onChange={(e) => setDelay(Number(e.target.value))}
                  className="w-full mt-1 px-3 py-2 rounded-md border bg-background text-sm"
                >
                  {DELAY_OPTIONS.map(d => (
                    <option key={d} value={d}>{d} detik</option>
                  ))}
                </select>
                <p className="text-[10px] text-muted-foreground mt-0.5">Jeda antar pesan untuk mencegah banned.</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4 space-y-3">
            <h2 className="font-bold text-sm">Data Provider <span className="text-xs font-normal text-muted-foreground">({selectedProvider?.label})</span></h2>
            {selectedProvider?.fields.map(f => {
              const fl = FIELD_LABELS[f] ?? { label: f, placeholder: "" };
              return (
                <div key={f}>
                  <label className="text-xs font-bold uppercase tracking-wider">
                    {fl.label} <span className="text-rose-600">*</span>
                  </label>
                  <Input
                    type={fl.isSecret ? "password" : "text"}
                    placeholder={fl.placeholder}
                    value={config[f] ?? ""}
                    onChange={(e) => setConfig(c => ({ ...c, [f]: e.target.value }))}
                    className="text-sm font-mono mt-1"
                  />
                  {fl.helpText && <p className="text-[10px] text-muted-foreground mt-0.5">{fl.helpText}</p>}
                </div>
              );
            })}
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between gap-2 sticky bottom-0 bg-background/95 backdrop-blur py-3 -mx-1 px-1 border-t z-10 flex-wrap">
            <div className="flex gap-2 flex-wrap">
              <Button
                onClick={handleSubmit}
                loading={saveMut.isPending}
                className="bg-violet-600 hover:bg-violet-700"
                leftIcon={<Save className="h-3.5 w-3.5" />}
              >
                Simpan Nomor
              </Button>
              <Button variant="ghost" onClick={onBack} className="text-rose-600">
                Kembali
              </Button>
            </div>
            {isEdit && (
              <Button variant="ghost" onClick={() => setShowTest(true)} leftIcon={<Send className="h-3.5 w-3.5" />}>
                Kirim Test
              </Button>
            )}
          </div>
        </>
      )}

      {/* Test modal */}
      <Dialog open={showTest} onOpenChange={(o) => { if (!o) setShowTest(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Kirim Test ke 1 Nomor</DialogTitle>
            <DialogDescription>Test koneksi device "{device?.name}" - kirim pesan test ke nomor tujuan.</DialogDescription>
          </DialogHeader>
          <Input
            type="tel"
            placeholder="62812..."
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            className="text-sm font-mono"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowTest(false)}>Batal</Button>
            <Button onClick={() => testMut.mutate()} disabled={!testPhone.trim() || testMut.isPending} loading={testMut.isPending}>
              Kirim Test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
