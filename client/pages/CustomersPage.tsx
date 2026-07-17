import { useState, useMemo, useCallback, useRef } from "react";
import { useCustomers, useOdps, useOdpUtilization } from "@/hooks/useAssets";
import { useAuth } from "@/context/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { reverseGeocode } from "@/lib/geocode";
import { garutDistricts, resolveDistrict, getVillages } from "@/lib/garut-demography";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { useEffect } from "react";
import type { Customer, InsertCustomer } from "@shared/schema";
import {
  Users, RefreshCw, Search, Plus, Pencil, Trash2, WifiOff, CheckCircle, AlertCircle,
  Clock, MapPin, ChevronDown, ChevronUp, Filter, X, ChevronLeft, ChevronRight, Download,
  Building2, Home, Lock, Unlock, ShieldCheck,
  Eye, EyeOff, Wifi, Shield, Info, Monitor, Activity, ExternalLink, Loader2, Check,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { SearchableOdpSelect } from "@/components/shared/SearchableOdpSelect";
import { OpenInChatwootButton } from "@/components/chatwoot/OpenInChatwootButton";
import { ChatwootSyncButton } from "@/components/chatwoot/ChatwootSyncButton";
import { useChatwootStatus, useCustomerConversations, useSyncBulkContacts } from "@/hooks/useChatwoot";
import { ConversationList } from "@/components/chatwoot/ConversationList";
import { ConversationThread } from "@/components/chatwoot/ConversationThread";
import { ChatwootContactCard } from "@/components/chatwoot/ChatwootContactCard";

// Field labels for the lock UI
const LOCKABLE_FIELDS: { key: string; label: string }[] = [
  { key: "name", label: "Nama" },
  { key: "phone", label: "Telepon" },
  { key: "email", label: "Email" },
  { key: "address", label: "Alamat" },
  { key: "lat", label: "Latitude" },
  { key: "lng", label: "Longitude" },
  { key: "package", label: "Paket" },
  { key: "district", label: "Kecamatan" },
  { key: "village", label: "Desa/Kelurahan" },
  { key: "customerType", label: "Jenis" },
];

function parseOverrides(c: Customer | any): string[] {
  try {
    const v = (c as any).manualOverrides;
    if (!v) return [];
    return Array.isArray(v) ? v : JSON.parse(v);
  } catch { return []; }
}

// ==================== FORM ====================

function CustomerForm({ item, onSubmit, isPending }: { item: Customer | null; onSubmit: (data: InsertCustomer) => void; isPending: boolean }) {
  const { register, handleSubmit, reset, setValue, watch } = useForm<InsertCustomer>();
  const watchedLat = watch("lat");
  const watchedLng = watch("lng");

  const detectLocation = useCallback(async () => {
    const lat = Number(watchedLat);
    const lng = Number(watchedLng);
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;
    const geo = await reverseGeocode(lat, lng);
    if (geo) {
      if (geo.district) {
        const d = resolveDistrict(geo.district);
        if (d) setValue("district" as any, d);
      }
      if (geo.village) setValue("village" as any, geo.village);
      if (!watch("address") && geo.formatted) setValue("address", geo.formatted);
    }
  }, [watchedLat, watchedLng, setValue, watch]);
  const { data: odps } = useOdps();
  const { data: odpUtil } = useOdpUtilization();
  const watchedOdpId = watch("odpId");
  const watchedStatus = watch("status");
  const watchedCustomerType = watch("customerType" as any);
  const watchedDistrict = watch("district" as any);

  // PPPoE state
  const [showPppoePassword, setShowPppoePassword] = useState(false);
  const watchedPppoeRouterId = watch("pppoeRouterId" as any);

  const { data: mikrotikRouters } = useQuery<{ id: number; name: string; host: string }[]>({
    queryKey: ["/api/mikrotik/routers"],
    queryFn: () => api.get("/mikrotik/routers"),
  });

  const { data: mikrotikProfiles } = useQuery<{ name: string }[]>({
    queryKey: ["/api/mikrotik/routers", watchedPppoeRouterId, "ppp/profile"],
    queryFn: () => api.get(`/mikrotik/routers/${watchedPppoeRouterId}/ppp/profile`),
    enabled: !!watchedPppoeRouterId,
  });

  // Auto-fill port saat ODP dipilih (hanya untuk pelanggan baru)
  useEffect(() => {
    if (!item && watchedOdpId) {
      const odpData = odpUtil?.odps.find((o) => o.id === watchedOdpId);
      if (odpData?.nextPort) {
        setValue("portNumber", odpData.nextPort);
      }
    }
  }, [watchedOdpId, odpUtil, item, setValue]);

  useEffect(() => {
    if (item) {
      const anyItem = item as any;
      reset({
        name: item.name, customerId: item.customerId,
        odpId: item.odpId ?? undefined, portNumber: item.portNumber ?? undefined,
        address: item.address ?? "", lat: item.lat ?? undefined, lng: item.lng ?? undefined,
        package: item.package ?? "", status: item.status ?? "active",
        phone: item.phone ?? "", notes: item.notes ?? "",
        email: anyItem.email ?? "",
        customerType: anyItem.customerType ?? "rumahan",
        district: anyItem.district ?? "",
        village: anyItem.village ?? "",
        pppoeRouterId: anyItem.pppoeRouterId ?? undefined,
        pppoeUsername: anyItem.pppoeUsername ?? "",
        pppoePassword: anyItem.pppoePassword ?? "",
        pppoeProfile: anyItem.pppoeProfile ?? "",
      } as any);
    } else {
      reset({ name: "", customerId: "", status: "active", customerType: "rumahan", pppoeUsername: "", pppoePassword: "", pppoeProfile: "" } as any);
    }
  }, [item, reset]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Identitas */}
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Identitas Pelanggan</div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Nama Lengkap</Label>
          <Input {...register("name")} required placeholder="Ahmad Suryadi" />
        </div>
        <div className="space-y-2">
          <Label>ID Pelanggan</Label>
          <Input {...register("customerId")} required placeholder="122400001" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label>Jenis Pelanggan</Label>
          <Select value={(watchedCustomerType as string) ?? "rumahan"} onValueChange={(v) => setValue("customerType" as any, v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="rumahan">Rumahan</SelectItem>
              <SelectItem value="bisnis">Bisnis</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Telepon</Label>
          <Input {...register("phone")} placeholder="0812xxxxxxxx" />
        </div>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input {...register("email" as any)} type="email" placeholder="email@example.com" />
        </div>
      </div>

      {/* Alamat */}
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1">Alamat Pemasangan</div>
      <div className="space-y-2">
        <Label>Alamat</Label>
        <Input {...register("address")} placeholder="Kp. Contoh RT/RW 001/002 Desa..." />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Kecamatan</Label>
          <select {...register("district" as any, { onChange: () => setValue("village" as any, "") })} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
            <option value="">Pilih...</option>
            {garutDistricts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Kelurahan / Desa</Label>
          <select {...register("village" as any)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" disabled={!watchedDistrict}>
            <option value="">Pilih...</option>
            {getVillages(watchedDistrict).map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Latitude</Label>
          <Input {...register("lat", { valueAsNumber: true })} type="number" step="any" placeholder="-7.196..." />
        </div>
        <div className="space-y-2">
          <Label>Longitude</Label>
          <Input {...register("lng", { valueAsNumber: true })} type="number" step="any" placeholder="107.881..." />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Auto-isi kecamatan & kelurahan dari koordinat</span>
        <Button type="button" variant="outline" size="sm" onClick={detectLocation}>
          📍 Deteksi Lokasi
        </Button>
      </div>

      {/* Layanan */}
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1">Layanan Internet</div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Paket Layanan</Label>
          <Input {...register("package")} placeholder="Promo Moon, Happy Home, MOON..." />
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={watchedStatus ?? "active"} onValueChange={(v) => setValue("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Aktif</SelectItem>
              <SelectItem value="suspended">Isolir</SelectItem>
              <SelectItem value="inactive">Non-Aktif</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Akun PPPoE */}
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1">Akun PPPoE</div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Router MikroTik</Label>
          <Select
            value={watchedPppoeRouterId?.toString() ?? "__none__"}
            onValueChange={(v) => {
              setValue("pppoeRouterId" as any, v === "__none__" ? undefined : parseInt(v));
              setValue("pppoeProfile" as any, "");
            }}
          >
            <SelectTrigger><SelectValue placeholder="Pilih Router..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">-- Belum dipilih --</SelectItem>
              {mikrotikRouters?.map((r) => (
                <SelectItem key={r.id} value={r.id.toString()}>{r.name} ({r.host})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Profile MikroTik</Label>
          <Select
            value={watch("pppoeProfile" as any) || "__none__"}
            onValueChange={(v) => setValue("pppoeProfile" as any, v === "__none__" ? "" : v)}
            disabled={!watchedPppoeRouterId}
          >
            <SelectTrigger><SelectValue placeholder={watchedPppoeRouterId ? "Pilih Profile..." : "Pilih router dulu"} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">-- Pilih Profile --</SelectItem>
              {mikrotikProfiles?.map((p) => (
                <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Username PPPoE</Label>
          <Input {...register("pppoeUsername" as any)} placeholder="username-pppoe" />
        </div>
        <div className="space-y-2">
          <Label>Password PPPoE</Label>
          <div className="relative">
            <Input
              {...register("pppoePassword" as any)}
              type={showPppoePassword ? "text" : "password"}
              placeholder="password"
              className="pr-9"
            />
            <button
              type="button"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowPppoePassword(!showPppoePassword)}
              tabIndex={-1}
            >
              {showPppoePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Serial Number ONT (opsional)</Label>
        <Input {...register("ontSerialNumber" as any)} placeholder="FHTTC1234567" className="font-mono" />
        <p className="text-[10px] text-muted-foreground">SN perangkat ONT untuk pencocokan dengan GenieACS</p>
      </div>

      {/* Infrastruktur */}
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1">Infrastruktur FTTH</div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>ODP</Label>
          <Select
            value={watchedOdpId?.toString() ?? "__none__"}
            onValueChange={(v) => setValue("odpId", v === "__none__" ? undefined : parseInt(v))}
          >
            <SelectTrigger><SelectValue placeholder="Pilih ODP..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Belum dihubungkan —</SelectItem>
              {odps?.map((o) => {
                const util = odpUtil?.odps.find((u) => u.id === o.id);
                const used = util?.usedPorts ?? 0;
                const cap = util?.capacity ?? o.capacity ?? 8;
                const isFull = used >= cap;
                return (
                  <SelectItem key={o.id} value={o.id.toString()} disabled={isFull}>
                    <span className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full inline-block shrink-0 ${
                          isFull ? "bg-red-500" : used / cap >= 0.75 ? "bg-yellow-500" : "bg-green-500"
                        }`}
                      />
                      {o.name} — {used}/{cap} port
                      {isFull ? " (Penuh)" : util?.nextPort ? ` · next: ${util.nextPort}` : ""}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {watchedOdpId && (() => {
            const util = odpUtil?.odps.find((u) => u.id === watchedOdpId);
            if (!util) return null;
            const pct = util.usedPct ?? 0;
            const barColor = pct >= 100 ? "bg-red-500" : pct >= 75 ? "bg-yellow-500" : "bg-green-500";
            return (
              <div className="space-y-1 pt-1">
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>{util.usedPorts}/{util.capacity} port terpakai</span>
                  <span>{pct}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
              </div>
            );
          })()}
        </div>
        <div className="space-y-2">
          <Label>Nomor Port ODP</Label>
          <Input {...register("portNumber", { valueAsNumber: true })} type="number" placeholder="1" min="1" />
          {!item && watchedOdpId && odpUtil?.odps.find((u) => u.id === watchedOdpId)?.nextPort && (
            <p className="text-[11px] text-green-600 dark:text-green-400">
              ✓ Port {odpUtil?.odps.find((u) => u.id === watchedOdpId)?.nextPort} terisi otomatis
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Catatan</Label>
        <Textarea {...register("notes")} placeholder="Catatan tambahan..." />
      </div>

      {/* Lock info panel — only when editing */}
      {item && (() => {
        const locks = parseOverrides(item);
        if (locks.length === 0) {
          return (
            <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/30 p-3 text-xs">
              <div className="flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-blue-700 dark:text-blue-300">Proteksi Sync Otomatis</p>
                  <p className="text-blue-600/80 dark:text-blue-400/80 mt-0.5">
                    Field yang Anda ubah akan otomatis dilindungi dari sync billing berikutnya. Status, harga billing & info pembayaran tetap akan diperbarui.
                  </p>
                </div>
              </div>
            </div>
          );
        }
        return (
          <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/30 p-3 text-xs">
            <div className="flex items-start gap-2">
              <Lock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-amber-700 dark:text-amber-300">
                  {locks.length} field dilindungi dari sync billing
                </p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {locks.map(f => {
                    const lbl = LOCKABLE_FIELDS.find(l => l.key === f)?.label ?? f;
                    return (
                      <Badge key={f} variant="outline" className="text-[10px] border-amber-400 text-amber-700 dark:text-amber-300">
                        <Lock className="h-2.5 w-2.5 mr-1" /> {lbl}
                      </Badge>
                    );
                  })}
                </div>
                <p className="text-amber-600/80 dark:text-amber-400/80 mt-1.5">
                  Field ini tidak akan ketimpa saat sync billing. Klik "Reset Proteksi" di tabel untuk membuka kunci.
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Menyimpan..." : item ? "Update Pelanggan" : "Simpan Pelanggan"}
      </Button>
    </form>
  );
}

// ==================== STATUS BADGE ====================

function StatusBadge({ status }: { status: string | null }) {
  if (status === "active") return <Badge className="bg-green-500 text-white">Aktif</Badge>;
  if (status === "suspended") return <Badge className="bg-yellow-500 text-white">Isolir</Badge>;
  return <Badge variant="secondary">Non-Aktif</Badge>;
}

// ==================== SYNC MODAL ====================

function SyncModal({ open, onClose, onSync }: { open: boolean; onClose: () => void; onSync: () => Promise<any> }) {
  const [step, setStep] = useState<"confirm" | "syncing" | "done">("confirm");
  const [result, setResult] = useState<any>(null);

  const handleSync = async () => {
    setStep("syncing");
    try {
      const r = await onSync();
      setResult(r);
      setStep("done");
    } catch (e: any) {
      toast.error(e.message);
      setStep("confirm");
    }
  };

  const handleClose = () => {
    setStep("confirm");
    setResult(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Sinkronisasi Data Pelanggan</DialogTitle>
          <DialogDescription>
            Ambil data terbaru dari Billing JABNET
          </DialogDescription>
        </DialogHeader>

        {step === "confirm" && (
          <div className="space-y-4">
            <div className="rounded-lg border p-4 space-y-2 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <RefreshCw className="h-4 w-4 text-primary" />
                Yang akan dilakukan:
              </div>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                <li>Ambil semua pelanggan aktif dari billing.jabnet.id</li>
                <li>Pelanggan baru &rarr; otomatis ditambahkan</li>
                <li>Pelanggan lama &rarr; data diperbarui (nama, paket, status, alamat, koordinat)</li>
                <li>Penghubungan ke ODP tetap tersimpan</li>
              </ul>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={handleClose}>Batal</Button>
              <Button className="flex-1" onClick={handleSync}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Mulai Sinkronisasi
              </Button>
            </div>
          </div>
        )}

        {step === "syncing" && (
          <div className="py-8 text-center space-y-3">
            <RefreshCw className="h-8 w-8 mx-auto text-primary animate-spin" />
            <p className="font-medium">Mengambil data dari billing...</p>
            <p className="text-sm text-muted-foreground">Proses ini mungkin memakan waktu beberapa detik</p>
          </div>
        )}

        {step === "done" && result && (
          <div className="space-y-4">
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-2 text-green-600 font-medium">
                <CheckCircle className="h-5 w-5" />
                Sinkronisasi berhasil!
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 p-3">
                  <div className="text-2xl font-bold text-blue-600">{result.total}</div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </div>
                <div className="rounded-md bg-green-50 dark:bg-green-950/30 p-3">
                  <div className="text-2xl font-bold text-green-600">{result.created}</div>
                  <div className="text-xs text-muted-foreground">Baru</div>
                </div>
                <div className="rounded-md bg-orange-50 dark:bg-orange-950/30 p-3">
                  <div className="text-2xl font-bold text-orange-600">{result.updated}</div>
                  <div className="text-xs text-muted-foreground">Diperbarui</div>
                </div>
              </div>
              {result.errors > 0 && (
                <p className="text-xs text-destructive">{result.errors} data gagal disinkronisasi</p>
              )}
            </div>
            <Button className="w-full" onClick={handleClose}>Selesai</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ==================== DISTRICT SUMMARY ====================

interface DistrictSummary {
  district: string;
  total: number;
  active: number;
  suspended: number;
  inactive: number;
  rumahan: number;
  bisnis: number;
  villages: { name: string; total: number; active: number; suspended: number }[];
}

function DistrictCard({
  d, isExpanded, onToggle, onFilterDistrict, onFilterVillage,
}: {
  d: DistrictSummary; isExpanded: boolean; onToggle: () => void;
  onFilterDistrict: (district: string) => void; onFilterVillage: (district: string, village: string) => void;
}) {
  const activePct = d.total > 0 ? Math.round((d.active / d.total) * 100) : 0;
  const suspendedPct = d.total > 0 ? Math.round((d.suspended / d.total) * 100) : 0;

  return (
    <div className="rounded-xl border overflow-hidden">
      <button onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/30 transition-colors">
        <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center shrink-0">
          <MapPin className="h-5 w-5 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm truncate">{d.district || "Tanpa Kecamatan"}</span>
            <Badge variant="outline" className="text-[10px] shrink-0">{d.villages.length} desa</Badge>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-muted-foreground">{d.total} pelanggan</span>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span className="text-[10px] text-muted-foreground">{d.active}</span>
            </div>
            {d.suspended > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                <span className="text-[10px] text-muted-foreground">{d.suspended}</span>
              </div>
            )}
          </div>
          {/* Mini progress bar */}
          <div className="flex h-1.5 rounded-full overflow-hidden mt-1.5 bg-muted">
            {activePct > 0 && <div className="h-full bg-green-500" style={{ width: `${activePct}%` }} />}
            {suspendedPct > 0 && <div className="h-full bg-yellow-500" style={{ width: `${suspendedPct}%` }} />}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); onFilterDistrict(d.district); }}>
            <Filter className="h-3 w-3 mr-1" /> Filter
          </Button>
          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t px-3 py-2 space-y-1 bg-muted/20">
          <div className="flex items-center gap-4 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            <span className="flex-1">Desa / Kelurahan</span>
            <span className="w-14 text-center">Total</span>
            <span className="w-14 text-center">Aktif</span>
            <span className="w-14 text-center">Isolir</span>
            <span className="w-14"></span>
          </div>
          {d.villages.sort((a, b) => b.total - a.total).map(v => (
            <div key={v.name} className="flex items-center gap-4 px-2 py-1.5 rounded-lg hover:bg-muted/50 transition-colors">
              <span className="flex-1 text-xs font-medium truncate">{v.name || "Tidak diketahui"}</span>
              <span className="w-14 text-center text-xs font-bold">{v.total}</span>
              <span className="w-14 text-center text-xs text-green-600 font-medium">{v.active}</span>
              <span className="w-14 text-center text-xs text-yellow-600 font-medium">{v.suspended > 0 ? v.suspended : "—"}</span>
              <Button variant="ghost" size="sm" className="h-6 w-14 px-1 text-[10px]"
                onClick={() => onFilterVillage(d.district, v.name)}>
                Lihat
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-4 px-2 py-1.5 border-t mt-1">
            <span className="flex-1 text-xs font-bold">Total</span>
            <span className="w-14 text-center text-xs font-bold">{d.total}</span>
            <span className="w-14 text-center text-xs font-bold text-green-600">{d.active}</span>
            <span className="w-14 text-center text-xs font-bold text-yellow-600">{d.suspended > 0 ? d.suspended : "—"}</span>
            <span className="w-14"></span>
          </div>
          {/* Type breakdown */}
          <div className="flex gap-3 px-2 pt-1">
            <div className="flex items-center gap-1.5">
              <Home className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Rumahan: {d.rumahan}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Bisnis: {d.bisnis}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== EXPORT HELPER ====================

function exportCustomersCSV(customers: Customer[], odpMap: Map<number, string>) {
  const headers = ["ID Pelanggan", "Nama", "Jenis", "Paket", "Status", "Telepon", "Email", "Alamat", "Kecamatan", "Desa/Kelurahan", "ODP", "Port", "Lat", "Lng"];
  const rows = customers.map(c => {
    const anyC = c as any;
    return [
      c.customerId, c.name, anyC.customerType ?? "", c.package ?? "",
      c.status === "active" ? "Aktif" : c.status === "suspended" ? "Isolir" : "Non-Aktif",
      c.phone ?? "", anyC.email ?? "", c.address ?? "",
      anyC.district ?? "", anyC.village ?? "",
      c.odpId ? (odpMap.get(c.odpId) ?? `ODP #${c.odpId}`) : "",
      c.portNumber ?? "", c.lat ?? "", c.lng ?? "",
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
  });
  const csv = [headers.map(h => `"${h}"`).join(","), ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pelanggan_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

// ==================== PAGINATION CONSTANTS ====================
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

// ========================================================================
// v4.1.3+: CustomerLocalEditForm — hanya edit 6 field LOCAL (koordinat, ODP,
// ONT SN, notes). Semua field billing (nama, phone, alamat, paket, dll)
// sync dari billing.jabnet.id dan TIDAK bisa diubah di FTTH Tools.
// ========================================================================

function CustomerLocalEditForm({
  item, onSubmit, isPending,
}: {
  item: Customer;
  onSubmit: (data: Partial<InsertCustomer>) => void;
  isPending: boolean;
}) {
  const anyItem = item as any;
  const [lat, setLat] = useState<string>(item.lat?.toString() ?? "");
  const [lng, setLng] = useState<string>(item.lng?.toString() ?? "");
  const [odpId, setOdpId] = useState<number | null>(item.odpId ?? null);
  const [portNumber, setPortNumber] = useState<string>(item.portNumber?.toString() ?? "");
  const [ontSerialNumber, setOntSerialNumber] = useState<string>(anyItem.ontSerialNumber ?? "");
  const [notes, setNotes] = useState<string>(item.notes ?? "");

  const { data: odps } = useOdps();
  const { data: odpUtil } = useOdpUtilization();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = { notes, ontSerialNumber };
    payload.lat = lat.trim() ? Number(lat) : null;
    payload.lng = lng.trim() ? Number(lng) : null;
    payload.odpId = odpId;
    payload.portNumber = portNumber.trim() ? Number(portNumber) : null;
    onSubmit(payload);
  };

  const detectGps = () => {
    if (!navigator.geolocation) return toast.error("Browser tidak support GPS");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLat(pos.coords.latitude.toFixed(6)); setLng(pos.coords.longitude.toFixed(6)); toast.success("Lokasi GPS terdeteksi"); },
      (err) => toast.error(`GPS error: ${err.message}`),
      { enableHighAccuracy: true },
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Info readonly dari billing */}
      <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <Info className="h-3.5 w-3.5 text-amber-600" />
          <span className="font-semibold text-amber-700 dark:text-amber-400">Data Sync dari Billing (Read-Only)</span>
          <Badge variant="outline" className="text-[9px] ml-auto">billing.jabnet.id</Badge>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <div><span className="text-muted-foreground">Nama:</span> <span className="font-medium">{item.name ?? "—"}</span></div>
          <div><span className="text-muted-foreground">Customer ID:</span> <span className="font-mono">{item.customerId}</span></div>
          <div><span className="text-muted-foreground">Phone:</span> <span className="font-mono">{item.phone ?? "—"}</span></div>
          <div><span className="text-muted-foreground">Email:</span> <span className="font-mono">{anyItem.email ?? "—"}</span></div>
          <div className="col-span-2"><span className="text-muted-foreground">Alamat:</span> {item.address ?? "—"}</div>
          <div><span className="text-muted-foreground">Paket:</span> {item.package ?? "—"}</div>
          <div><span className="text-muted-foreground">Status:</span> <span className={item.isIsolir === 1 ? "text-red-600" : "text-green-600"}>{item.status ?? "—"}{item.isIsolir === 1 ? " (isolir)" : ""}</span></div>
          <div><span className="text-muted-foreground">Kecamatan:</span> {anyItem.district ?? "—"}</div>
          <div><span className="text-muted-foreground">Kelurahan:</span> {anyItem.village ?? "—"}</div>
          <div><span className="text-muted-foreground">Tipe:</span> {anyItem.customerType ?? "—"}</div>
          <div><span className="text-muted-foreground">Install:</span> {item.installDate ?? "—"}</div>
          <div><span className="text-muted-foreground">PPPoE:</span> <span className="font-mono text-[11px]">{anyItem.pppoeUsername ?? "—"}</span></div>
          <div><span className="text-muted-foreground">Harga:</span> Rp {(item.billingPrice ?? 0).toLocaleString("id-ID")}</div>
        </div>
        <div className="text-[10px] text-muted-foreground pt-1 border-t">
          Data di atas di-sync dari billing setiap beberapa menit. Perubahan harus dilakukan di <a href="https://billing.jabnet.id" target="_blank" rel="noreferrer" className="underline">panel billing</a>.
        </div>
      </div>

      {/* Field editable local */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5 text-primary" />
          Data Lokal FTTH Tools (Editable)
        </div>

        {/* Koordinat */}
        <div className="space-y-2 mb-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Koordinat Peta</Label>
            <Button type="button" size="sm" variant="outline" className="h-7 text-[10px]" onClick={detectGps}>
              <MapPin className="h-3 w-3 mr-1" /> Deteksi GPS
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="-7.xxxxxx (Lat)"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className="font-mono text-xs"
            />
            <Input
              placeholder="107.xxxxxx (Lng)"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Untuk plot di peta jaringan, coverage check, dan ODP mapping. Kosongkan kalau belum diketahui.
          </p>
        </div>

        {/* ODP mapping */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <Label className="text-xs">ODP</Label>
            <SearchableOdpSelect
              value={odpId}
              onChange={setOdpId}
              odps={odps ?? []}
            />
          </div>
          <div>
            <Label className="text-xs">Port Number</Label>
            <Input
              type="number"
              min="1"
              placeholder="1, 2, 3, ..."
              value={portNumber}
              onChange={(e) => setPortNumber(e.target.value)}
              className="font-mono"
            />
          </div>
        </div>

        {/* ONT Serial Number */}
        <div className="space-y-1 mb-3">
          <Label className="text-xs">ONT Serial Number (GenieACS)</Label>
          <Input
            placeholder="e.g. 485754436B477B10"
            value={ontSerialNumber}
            onChange={(e) => setOntSerialNumber(e.target.value)}
            className="font-mono uppercase"
          />
          <p className="text-[10px] text-muted-foreground">
            Untuk match ke device GenieACS kalau bridging via pppoeUsername gagal. Opsional.
          </p>
        </div>

        {/* Notes */}
        <div className="space-y-1">
          <Label className="text-xs">Catatan Internal Tim</Label>
          <Textarea
            placeholder="Catatan teknisi/NOC (mis. akses masuk lewat jalan kiri, bawa tangga 4m, dll)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="text-sm"
          />
        </div>
      </div>

      <div className="flex gap-2 pt-3 border-t">
        <Button type="submit" disabled={isPending} className="flex-1">
          {isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Menyimpan...</> : <>Simpan Data Lokal</>}
        </Button>
      </div>
    </form>
  );
}

// ==================== MAIN PAGE ====================

export default function CustomersPage() {
  const { canWrite } = useAuth();
  const canEditCustomers = canWrite("customers");
  const canBillingSync = canWrite("billing_sync");
  const [billingSyncing, setBillingSyncing] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());
  const { data: cooldown, refetch: refetchCooldown } = useQuery<any>({
    queryKey: ["/api/billing/sync/cooldown"],
    queryFn: () => api.get<any>("/billing/sync/cooldown"),
    enabled: canBillingSync,
    refetchInterval: 60_000,
  });
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const nextAt = cooldown?.nextAvailableAt ? new Date(cooldown.nextAvailableAt).getTime() : 0;
  const remainingMs = Math.max(0, nextAt - nowTick);
  const onCooldown = remainingMs > 0;
  const mmss = `${Math.floor(remainingMs / 60000)}:${String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, "0")}`;

  const handleBillingSync = async () => {
    setBillingSyncing(true);
    try {
      const r: any = await api.post("/billing/sync", {});
      toast.success(`Sync selesai — ${r?.updated ?? 0} diperbarui, ${r?.created ?? 0} dibuat`, {
        description: `Total ${r?.total ?? 0} pelanggan · error ${r?.errors ?? 0}`,
      });
      refetchCooldown();
    } catch (err: any) {
      toast.error((err && err.message) || "Sync gagal");
      refetchCooldown();
    } finally { setBillingSyncing(false); }
  };
  const { data: customers, isLoading, create, update, remove } = useCustomers();
  const { data: odps } = useOdps();

  // Deep-link support: kalau URL punya ?q=xxx, auto-populate search (untuk jump dari GenieACS page)
  const initialSearch = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("q") ?? ""
    : "";
  const [search, setSearch] = useState(initialSearch);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDistrict, setFilterDistrict] = useState("all");
  const [filterVillage, setFilterVillage] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterPackage, setFilterPackage] = useState("all");
  const [filterOdp, setFilterOdp] = useState("all");
  const [filterBilling, setFilterBilling] = useState("all");
  // v4.2.5: filter status integrasi (PPPoE + GenieACS ONT)
  // values: "all" | "fully" | "pppoe_only" | "ont_only" | "none" | "pppoe_offline" | "ont_offline"
  const [filterIntegration, setFilterIntegration] = useState("all");
  // v4.2.5: dialog audit integrasi (auto-pair fuzzy match)
  const [auditDialogOpen, setAuditDialogOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showDistrictView, setShowDistrictView] = useState(false);
  const [expandedDistrict, setExpandedDistrict] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<Customer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortBy, setSortBy] = useState<"name" | "district" | "package" | "status">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  // unlockTarget removed — billing sync protection no longer needed
  const queryClient = useQueryClient();

  const odpMap = useMemo(() => {
    const m = new Map<number, string>();
    odps?.forEach((o) => m.set(o.id, o.name));
    return m;
  }, [odps]);

  // PPPoE active sessions — fetch all active sessions every 30s
  // v4.1.2: sekarang simpan full session data (IP, MAC, uptime, traffic) bukan cuma name,
  // agar bisa di-display di detail dialog tanpa fetch ulang.
  type PppSession = {
    id?: string; name?: string; service?: string; callerId?: string;
    "caller-id"?: string; address?: string; uptime?: string;
    limitBytesIn?: number; limitBytesOut?: number; sessionId?: string;
    encoding?: string; radius?: boolean;
  };
  const { data: sessionGroups } = useQuery<{ routerId: number; routerName: string; sessions: PppSession[] }[]>({
    queryKey: ["/api/mikrotik/sessions/active"],
    queryFn: () => api.get("/mikrotik/sessions/active"),
    refetchInterval: 30000,
  });

  // Build TWO maps: one untuk quick online check, satu untuk full session lookup
  const { onlineUsernames, sessionByPppoe, sessionRouterByPppoe } = useMemo(() => {
    const online = new Set<string>();
    const byPppoe = new Map<string, PppSession>();
    const routerByPppoe = new Map<string, { routerId: number; routerName: string }>();
    sessionGroups?.forEach((g) => {
      g.sessions?.forEach((sess) => {
        if (sess.name) {
          const key = sess.name.toLowerCase(); // case-insensitive
          online.add(sess.name);
          online.add(key);
          byPppoe.set(key, sess);
          routerByPppoe.set(key, { routerId: g.routerId, routerName: g.routerName });
        }
      });
    });
    return { onlineUsernames: online, sessionByPppoe: byPppoe, sessionRouterByPppoe: routerByPppoe };
  }, [sessionGroups]);

  // Helper: lookup session case-insensitive
  const findSession = (pppoe?: string | null): PppSession | undefined => {
    if (!pppoe) return undefined;
    return sessionByPppoe.get(pppoe.toLowerCase()) ?? sessionByPppoe.get(pppoe);
  };
  const isOnline = (pppoe?: string | null): boolean => {
    if (!pppoe) return false;
    return onlineUsernames.has(pppoe) || onlineUsernames.has(pppoe.toLowerCase());
  };

  // GenieACS ONT status for all customers
  const { data: ontStatusData } = useQuery<{ configured: boolean; statuses: Record<number, {
    matched: boolean; matchBy: "pppoe" | "sn" | null; ontStatus: "online" | "offline" | null;
    ontSerialNumber: string | null; ontDeviceId: string | null; ontManufacturer: string | null;
    ontModel: string | null; ontRxPower: string | null; ontIpAddress: string | null; ontLastInform: string | null;
  }>; totalDevices?: number }>({
    queryKey: ["/api/customers/ont-status"],
    queryFn: () => api.get("/customers/ont-status"),
    refetchInterval: 60000, // check every 60s
    retry: false,
  });
  const ontStatuses = ontStatusData?.statuses || {};

  // MikroTik routers for display names in detail dialog
  const { data: mkRouters } = useQuery<{ id: number; name: string; host: string }[]>({
    queryKey: ["/api/mikrotik/routers"],
    queryFn: () => api.get("/mikrotik/routers"),
  });

  const routerMap = useMemo(() => {
    const m = new Map<number, string>();
    mkRouters?.forEach((r) => m.set(r.id, r.name));
    return m;
  }, [mkRouters]);

  // Detail dialog state
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);
  const [detailTab, setDetailTab] = useState<"info" | "pppoe" | "komunikasi">("info");
  const { data: chatwootStatus } = useChatwootStatus();
  const chatwootReady = !!chatwootStatus?.enabled && !!chatwootStatus?.configured;
  const bulkSync = useSyncBulkContacts();
  const [detailShowPassword, setDetailShowPassword] = useState(false);

  // Extract unique values from data for filter dropdowns
  const filterOptions = useMemo(() => {
    const all = customers ?? [];
    const districts = new Set<string>();
    const villages = new Map<string, Set<string>>();
    const packages = new Set<string>();
    const odpIds = new Set<number>();

    for (const c of all) {
      const anyC = c as any;
      const d = (anyC.district ?? "").trim();
      const v = (anyC.village ?? "").trim();
      if (d) {
        districts.add(d);
        if (!villages.has(d)) villages.set(d, new Set());
        if (v) villages.get(d)!.add(v);
      }
      if (c.package) packages.add(c.package);
      if (c.odpId) odpIds.add(c.odpId);
    }

    return {
      districts: [...districts].sort(),
      villagesByDistrict: Object.fromEntries([...villages.entries()].map(([d, vs]) => [d, [...vs].sort()])),
      packages: [...packages].sort(),
      odpIds: [...odpIds].sort(),
    };
  }, [customers]);

  // Available villages based on selected district
  const availableVillages = useMemo(() => {
    if (filterDistrict === "all") return [];
    return filterOptions.villagesByDistrict[filterDistrict] ?? [];
  }, [filterDistrict, filterOptions]);

  // Stats
  const stats = useMemo(() => {
    const all = customers ?? [];
    return {
      total: all.length,
      active: all.filter((c) => c.status === "active").length,
      suspended: all.filter((c) => c.status === "suspended").length,
      inactive: all.filter((c) => c.status === "inactive").length,
      rumahan: all.filter((c) => (c as any).customerType === "rumahan").length,
      bisnis: all.filter((c) => (c as any).customerType === "bisnis").length,
    };
  }, [customers]);

  // District summaries
  const districtSummaries = useMemo<DistrictSummary[]>(() => {
    const all = customers ?? [];
    const map = new Map<string, Customer[]>();
    for (const c of all) {
      const d = ((c as any).district ?? "").trim() || "";
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(c);
    }
    return [...map.entries()].map(([district, custs]) => {
      const villageMap = new Map<string, Customer[]>();
      for (const c of custs) {
        const v = ((c as any).village ?? "").trim() || "";
        if (!villageMap.has(v)) villageMap.set(v, []);
        villageMap.get(v)!.push(c);
      }
      return {
        district,
        total: custs.length,
        active: custs.filter(c => c.status === "active").length,
        suspended: custs.filter(c => c.status === "suspended").length,
        inactive: custs.filter(c => c.status !== "active" && c.status !== "suspended").length,
        rumahan: custs.filter(c => (c as any).customerType === "rumahan").length,
        bisnis: custs.filter(c => (c as any).customerType === "bisnis").length,
        villages: [...villageMap.entries()].map(([name, vCusts]) => ({
          name,
          total: vCusts.length,
          active: vCusts.filter(c => c.status === "active").length,
          suspended: vCusts.filter(c => c.status === "suspended").length,
        })),
      };
    }).sort((a, b) => b.total - a.total);
  }, [customers]);

  // Active filter count
  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (filterStatus !== "all") c++;
    if (filterDistrict !== "all") c++;
    if (filterVillage !== "all") c++;
    if (filterType !== "all") c++;
    if (filterPackage !== "all") c++;
    if (filterOdp !== "all") c++;
    if (filterBilling !== "all") c++;
    if (filterIntegration !== "all") c++;
    return c;
  }, [filterStatus, filterDistrict, filterVillage, filterType, filterPackage, filterOdp, filterBilling, filterIntegration]);

  const clearAllFilters = () => {
    setFilterStatus("all");
    setFilterDistrict("all");
    setFilterVillage("all");
    setFilterType("all");
    setFilterPackage("all");
    setFilterOdp("all");
    setFilterBilling("all");
    setFilterIntegration("all");
    setSearch("");
    setPage(1);
  };

  // Filter
  const filtered = useMemo(() => {
    let list = customers ?? [];

    if (filterStatus !== "all") list = list.filter((c) => c.status === filterStatus);

    if (filterDistrict !== "all") {
      list = list.filter(c => ((c as any).district ?? "").trim() === filterDistrict);
    }
    if (filterVillage !== "all") {
      list = list.filter(c => ((c as any).village ?? "").trim() === filterVillage);
    }
    if (filterType !== "all") {
      list = list.filter(c => ((c as any).customerType ?? "rumahan") === filterType);
    }
    if (filterPackage !== "all") {
      list = list.filter(c => c.package === filterPackage);
    }
    if (filterOdp !== "all") {
      list = list.filter(c => c.odpId === Number(filterOdp));
    }
    if (filterBilling !== "all") {
      if (filterBilling === "lunas") list = list.filter(c => (c as any).billingStatus !== "belum_lunas");
      else if (filterBilling === "belum_lunas") list = list.filter(c => (c as any).billingStatus === "belum_lunas");
      else if (filterBilling === "no_odp") list = list.filter(c => !c.odpId);
    }

    // v4.2.5: filter status integrasi (PPPoE MikroTik + ONT GenieACS)
    if (filterIntegration !== "all") {
      list = list.filter((c) => {
        const anyC = c as any;
        const hasPppoe = !!anyC.pppoeUsername;
        const pppoeOnline = hasPppoe && isOnline(anyC.pppoeUsername);
        const ont = ontStatuses[c.id];
        const ontMatched = !!ont?.matched;
        const ontOnline = ontMatched && ont.ontStatus === "online";
        switch (filterIntegration) {
          case "fully":         return hasPppoe && ontMatched;
          case "pppoe_only":    return hasPppoe && !ontMatched;
          case "ont_only":      return !hasPppoe && ontMatched;
          case "none":          return !hasPppoe && !ontMatched;
          case "pppoe_online":  return pppoeOnline;
          case "pppoe_offline": return hasPppoe && !pppoeOnline;
          case "ont_online":    return ontOnline;
          case "ont_offline":   return ontMatched && !ontOnline;
          default: return true;
        }
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        c.customerId.toLowerCase().includes(q) ||
        (c.address ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").includes(q) ||
        ((c as any).district ?? "").toLowerCase().includes(q) ||
        ((c as any).village ?? "").toLowerCase().includes(q)
      );
    }

    // Sort
    list = [...list].sort((a, b) => {
      let va = "", vb = "";
      if (sortBy === "name") { va = a.name; vb = b.name; }
      else if (sortBy === "district") { va = (a as any).district ?? ""; vb = (b as any).district ?? ""; }
      else if (sortBy === "package") { va = a.package ?? ""; vb = b.package ?? ""; }
      else if (sortBy === "status") { va = a.status ?? ""; vb = b.status ?? ""; }
      const cmp = va.localeCompare(vb, "id");
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [customers, search, filterStatus, filterDistrict, filterVillage, filterType, filterPackage, filterOdp, filterBilling, filterIntegration, ontStatuses, onlineUsernames, sortBy, sortDir]);

  // Filtered stats
  const filteredStats = useMemo(() => {
    return {
      total: filtered.length,
      active: filtered.filter(c => c.status === "active").length,
      suspended: filtered.filter(c => c.status === "suspended").length,
    };
  }, [filtered]);

  // v4.2.5: Integration breakdown (full dataset, bukan filtered)
  const integrationStats = useMemo(() => {
    const all = customers ?? [];
    let fully = 0, pppoeOnly = 0, ontOnly = 0, none = 0;
    let pppoeOnline = 0, ontOnline = 0;
    for (const c of all) {
      const anyC = c as any;
      const hasPppoe = !!anyC.pppoeUsername;
      const ont = ontStatuses[c.id];
      const ontMatched = !!ont?.matched;
      if (hasPppoe && ontMatched) fully++;
      else if (hasPppoe && !ontMatched) pppoeOnly++;
      else if (!hasPppoe && ontMatched) ontOnly++;
      else none++;
      if (hasPppoe && isOnline(anyC.pppoeUsername)) pppoeOnline++;
      if (ontMatched && ont.ontStatus === "online") ontOnline++;
    }
    return { total: all.length, fully, pppoeOnly, ontOnly, none, pppoeOnline, ontOnline };
  }, [customers, ontStatuses, onlineUsernames]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedList = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, filterStatus, filterDistrict, filterVillage, filterType, filterPackage, filterOdp, filterBilling, filterIntegration, pageSize]);

  // Reset village when district changes
  useEffect(() => { setFilterVillage("all"); }, [filterDistrict]);

  const handleCreate = async (data: InsertCustomer) => {
    setIsPending(true);
    try {
      await create.mutateAsync(data);
      toast.success("Pelanggan berhasil ditambahkan");
      setFormOpen(false);
    } catch (e: any) { toast.error(e.message); }
    finally { setIsPending(false); }
  };

  const handleUpdate = async (data: Partial<InsertCustomer>) => {
    if (!editItem) return;
    setIsPending(true);
    try {
      await update.mutateAsync({ id: editItem.id, data: data as InsertCustomer });
      toast.success("Data pelanggan diperbarui");
      setEditItem(null);
    } catch (e: any) { toast.error(e.message); }
    finally { setIsPending(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Pelanggan dihapus");
    } catch (e: any) { toast.error(e.message); }
    finally { setDeleteTarget(null); }
  };

  // Isolir / Activate PPPoE from detail dialog
  const [pppoeActionPending, setPppoeActionPending] = useState(false);
  const handlePppoeToggle = async (customer: Customer, action: "isolir" | "activate") => {
    setPppoeActionPending(true);
    try {
      const newStatus = action === "isolir" ? "suspended" : "active";
      const newIsIsolir = action === "isolir" ? 1 : 0;
      await update.mutateAsync({ id: customer.id, data: { status: newStatus, isIsolir: newIsIsolir } as any });
      toast.success(action === "isolir" ? "Pelanggan berhasil diisolir" : "Pelanggan berhasil diaktifkan");
      // Refresh the detail dialog with updated data
      const updatedCustomers = queryClient.getQueryData<Customer[]>(["customers"]);
      const updated_ = updatedCustomers?.find((c) => c.id === customer.id);
      if (updated_) setDetailCustomer(updated_);
      queryClient.invalidateQueries({ queryKey: ["/api/mikrotik/sessions/active"] });
    } catch (e: any) { toast.error(e.message); }
    finally { setPppoeActionPending(false); }
  };

  const handleFilterFromDistrict = (district: string) => {
    setFilterDistrict(district);
    setFilterVillage("all");
    setShowDistrictView(false);
    setShowFilters(true);
  };

  const handleFilterFromVillage = (district: string, village: string) => {
    setFilterDistrict(district);
    setFilterVillage(village);
    setShowDistrictView(false);
    setShowFilters(true);
  };

  const handleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
  };

  // Format currency
  const formatRp = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

  const SortIcon = ({ col }: { col: typeof sortBy }) => {
    if (sortBy !== col) return null;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3 inline ml-0.5" /> : <ChevronDown className="h-3 w-3 inline ml-0.5" />;
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Pelanggan</h1>
          <p className="text-muted-foreground text-sm">Data pelanggan FTTH JABNET — tersinkronisasi dengan billing</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => exportCustomersCSV(filtered, odpMap)}>
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
{/* v4.1.3+: Tambah pelanggan DISABLED — billing.jabnet.id adalah source of truth.
              Admin register pelanggan di billing, lalu sync worker auto-import ke FTTH Tools. */}
          {canEditCustomers && (
            <Button size="sm" variant="outline" onClick={() => {
              alert("Pelanggan baru harus ditambahkan via billing.jabnet.id\n\nSetelah terdaftar, data akan otomatis sync ke FTTH Tools dalam 1-10 menit.\nSetelah masuk, teknisi bisa set koordinat peta & ODP mapping di halaman ini.");
            }}>
              <Plus className="h-4 w-4 mr-1" />
              Tambah (via Billing)
            </Button>
          )}
          {canBillingSync && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleBillingSync}
              disabled={billingSyncing || onCooldown}
              title={onCooldown ? `Tersedia lagi dalam ${mmss}` : "Tarik data terbaru dari billing"}
            >
              {billingSyncing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              {onCooldown ? `Sinkron (${mmss})` : "Sinkron dengan Billing"}
            </Button>
          )}
          {chatwootReady && canWrite("chatwoot") && (
            <Button type="button" variant="outline" size="sm" loading={bulkSync.isPending}
              onClick={() => {
                const ids = filtered.map((c: any) => c.id).slice(0, 200);
                if (!ids.length) return;
                bulkSync.mutate(ids, {
                  onSuccess: (r) => toast.success(`Sync Chatwoot: ${r.synced} sukses, ${r.failed} gagal`),
                  onError: (e: any) => toast.error(e.message || "Gagal sync massal"),
                });
              }}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Sync ke Chatwoot
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {[
          { label: "Total", value: stats.total, icon: Users, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30", filter: "all" as const },
          { label: "Aktif", value: stats.active, icon: CheckCircle, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30", filter: "active" as const },
          { label: "Isolir", value: stats.suspended, icon: WifiOff, color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-950/30", filter: "suspended" as const },
          { label: "Non-Aktif", value: stats.inactive, icon: AlertCircle, color: "text-gray-500", bg: "bg-gray-50 dark:bg-gray-950/30", filter: "inactive" as const },
          { label: "Rumahan", value: stats.rumahan, icon: Home, color: "text-indigo-600", bg: "bg-indigo-50 dark:bg-indigo-950/30", filter: "type:rumahan" as const },
          { label: "Bisnis", value: stats.bisnis, icon: Building2, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950/30", filter: "type:bisnis" as const },
        ].map((s) => (
          <Card key={s.label} className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => {
              if (s.filter.startsWith("type:")) {
                setFilterType(s.filter.replace("type:", ""));
                setFilterStatus("all");
              } else {
                setFilterStatus(s.filter);
                setFilterType("all");
              }
            }}>
            <CardContent className={`p-3 rounded-lg ${s.bg}`}>
              <div className="flex items-center gap-2">
                <s.icon className={`h-5 w-5 ${s.color} opacity-70 shrink-0`} />
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground truncate">{s.label}</p>
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Toggle views: District View | Filter */}
      <div className="flex items-center gap-2">
        <Button variant={showDistrictView ? "default" : "outline"} size="sm"
          onClick={() => { setShowDistrictView(!showDistrictView); if (!showDistrictView) setShowFilters(false); }}>
          <MapPin className="h-3.5 w-3.5 mr-1" />
          Per Kecamatan
          <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5">{filterOptions.districts.length}</Badge>
        </Button>
        <Button variant={showFilters ? "default" : "outline"} size="sm"
          onClick={() => { setShowFilters(!showFilters); if (!showFilters) setShowDistrictView(false); }}>
          <Filter className="h-3.5 w-3.5 mr-1" />
          Filter
          {activeFilterCount > 0 && (
            <Badge variant="destructive" className="ml-1.5 text-[10px] px-1.5">{activeFilterCount}</Badge>
          )}
        </Button>
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-xs text-muted-foreground">
            <X className="h-3 w-3 mr-1" /> Reset Filter
          </Button>
        )}
      </div>

      {/* District Summary View */}
      {showDistrictView && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
            Ringkasan {districtSummaries.length} Kecamatan — Klik untuk detail desa/kelurahan
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {districtSummaries.map(d => (
              <DistrictCard key={d.district} d={d}
                isExpanded={expandedDistrict === d.district}
                onToggle={() => setExpandedDistrict(expandedDistrict === d.district ? null : d.district)}
                onFilterDistrict={handleFilterFromDistrict}
                onFilterVillage={handleFilterFromVillage}
              />
            ))}
          </div>
        </div>
      )}

      {/* Filters Panel */}
      {showFilters && (
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {/* Search */}
              <div className="col-span-2 sm:col-span-1">
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Pencarian</Label>
                <div className="relative mt-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Nama, ID, alamat, telepon..." value={search} onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-9 text-sm" />
                </div>
              </div>

              {/* Status */}
              <div>
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Status</SelectItem>
                    <SelectItem value="active">Aktif</SelectItem>
                    <SelectItem value="suspended">Isolir</SelectItem>
                    <SelectItem value="inactive">Non-Aktif</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Kecamatan */}
              <div>
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Kecamatan</Label>
                <Select value={filterDistrict} onValueChange={setFilterDistrict}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Kecamatan</SelectItem>
                    {filterOptions.districts.map(d => {
                      const count = (customers ?? []).filter(c => ((c as any).district ?? "").trim() === d).length;
                      return <SelectItem key={d} value={d}>{d} ({count})</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Desa/Kelurahan */}
              <div>
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Desa / Kelurahan</Label>
                <Select value={filterVillage} onValueChange={setFilterVillage} disabled={filterDistrict === "all"}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Desa</SelectItem>
                    {availableVillages.map(v => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Jenis Pelanggan */}
              <div>
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Jenis</Label>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Jenis</SelectItem>
                    <SelectItem value="rumahan">Rumahan</SelectItem>
                    <SelectItem value="bisnis">Bisnis</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Paket */}
              <div>
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Paket</Label>
                <Select value={filterPackage} onValueChange={setFilterPackage}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Paket</SelectItem>
                    {filterOptions.packages.map(p => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* ODP — searchable */}
              <div>
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">ODP</Label>
                <div className="mt-1">
                  <SearchableOdpSelect
                    value={filterOdp === "all" ? null : Number(filterOdp)}
                    onChange={(id) => setFilterOdp(id == null ? "all" : String(id))}
                    odps={filterOptions.odpIds
                      .map((id) => {
                        const o = odps?.find((x) => x.id === id);
                        return o ? { id: o.id, name: o.name, code: (o as any).code ?? null } : null;
                      })
                      .filter(Boolean) as Array<{ id: number; name: string; code: string | null }>}
                    placeholder="Semua ODP"
                    nullLabel="Semua ODP"
                  />
                </div>
              </div>

              {/* Billing / Khusus */}
              <div>
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Khusus</Label>
                <Select value={filterBilling} onValueChange={setFilterBilling}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua</SelectItem>
                    <SelectItem value="belum_lunas">Belum Lunas</SelectItem>
                    <SelectItem value="lunas">Lunas / OK</SelectItem>
                    <SelectItem value="no_odp">Belum Ada ODP</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* v4.2.5: Status Integrasi (PPPoE + GenieACS) */}
              <div>
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Integrasi</Label>
                <Select value={filterIntegration} onValueChange={setFilterIntegration}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua</SelectItem>
                    <SelectItem value="fully">✓ Lengkap (PPPoE + ONT)</SelectItem>
                    <SelectItem value="pppoe_only">PPPoE saja (tanpa ONT)</SelectItem>
                    <SelectItem value="ont_only">ONT saja (tanpa PPPoE)</SelectItem>
                    <SelectItem value="none">Belum dihubungkan</SelectItem>
                    <SelectItem value="pppoe_online">PPPoE Online</SelectItem>
                    <SelectItem value="pppoe_offline">PPPoE Offline</SelectItem>
                    <SelectItem value="ont_online">ONT Online</SelectItem>
                    <SelectItem value="ont_offline">ONT Offline</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick search when filter panel is closed */}
      {!showFilters && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Cari nama, ID, alamat, telepon, kecamatan..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          {/* Quick district filter pills */}
          {filterDistrict !== "all" && (
            <Badge variant="secondary" className="flex items-center gap-1 h-9 px-3 cursor-pointer"
              onClick={() => setFilterDistrict("all")}>
              <MapPin className="h-3 w-3" /> {filterDistrict} <X className="h-3 w-3 ml-1" />
            </Badge>
          )}
          {filterVillage !== "all" && (
            <Badge variant="secondary" className="flex items-center gap-1 h-9 px-3 cursor-pointer"
              onClick={() => setFilterVillage("all")}>
              {filterVillage} <X className="h-3 w-3 ml-1" />
            </Badge>
          )}
        </div>
      )}

      {/* v4.2.5: KPI breakdown integrasi — clickable filter pills */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Status Integrasi PPPoE & ONT</span>
          <div className="flex items-center gap-2">
            {integrationStats.pppoeOnly > 0 && (
              <button
                onClick={() => setAuditDialogOpen(true)}
                className="text-[10px] px-2 py-1 rounded bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 font-bold uppercase tracking-wider transition-colors"
                title={`Cari kandidat ONT untuk ${integrationStats.pppoeOnly} customer "PPPoE saja"`}
              >
                ⚡ Audit & Auto-Pair ONT
              </button>
            )}
            {filterIntegration !== "all" && (
              <button
                onClick={() => setFilterIntegration("all")}
                className="text-[10px] text-primary hover:underline font-semibold flex items-center gap-1"
              >
                <X className="h-3 w-3" /> Reset filter
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0">
          {[
            { key: "fully",      label: "Lengkap",         icon: "✓", value: integrationStats.fully,     hint: "PPPoE + ONT terdeteksi", tone: "emerald" },
            { key: "pppoe_only", label: "PPPoE saja",      icon: "📶", value: integrationStats.pppoeOnly, hint: "Tidak ada ONT di GenieACS", tone: "amber" },
            { key: "ont_only",   label: "ONT saja",        icon: "🖥", value: integrationStats.ontOnly,   hint: "Tidak ada PPPoE", tone: "sky" },
            { key: "none",       label: "Belum dihubungkan", icon: "—", value: integrationStats.none,      hint: "Tidak ada PPPoE & ONT", tone: "rose" },
          ].map((kpi) => {
            const isActive = filterIntegration === kpi.key;
            const toneClass =
              kpi.tone === "emerald" ? (isActive ? "bg-emerald-50 dark:bg-emerald-950/30 border-l-4 border-l-emerald-500" : "hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20") :
              kpi.tone === "amber"   ? (isActive ? "bg-amber-50 dark:bg-amber-950/30 border-l-4 border-l-amber-500"     : "hover:bg-amber-50/40 dark:hover:bg-amber-950/20") :
              kpi.tone === "sky"     ? (isActive ? "bg-sky-50 dark:bg-sky-950/30 border-l-4 border-l-sky-500"           : "hover:bg-sky-50/40 dark:hover:bg-sky-950/20") :
                                       (isActive ? "bg-rose-50 dark:bg-rose-950/30 border-l-4 border-l-rose-500"        : "hover:bg-rose-50/40 dark:hover:bg-rose-950/20");
            const valueColor =
              kpi.tone === "emerald" ? "text-emerald-700 dark:text-emerald-400" :
              kpi.tone === "amber"   ? "text-amber-700 dark:text-amber-400" :
              kpi.tone === "sky"     ? "text-sky-700 dark:text-sky-400" :
                                       "text-rose-700 dark:text-rose-400";
            const pct = integrationStats.total > 0 ? Math.round((kpi.value / integrationStats.total) * 100) : 0;
            return (
              <button
                key={kpi.key}
                onClick={() => setFilterIntegration(isActive ? "all" : kpi.key)}
                className={cn("text-left px-4 py-3 transition-all active:scale-[0.99]", toneClass)}
                title={kpi.hint}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
                    <span className="text-base">{kpi.icon}</span> {kpi.label}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground tabular-nums">{pct}%</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className={cn("text-2xl font-bold tabular-nums", valueColor)}>{kpi.value.toLocaleString("id-ID")}</span>
                  <span className="text-[10px] text-muted-foreground">customer</span>
                </div>
              </button>
            );
          })}
        </div>
        {/* Sub row: PPPoE/ONT online realtime */}
        <div className="px-4 py-2 border-t bg-muted/20 flex items-center gap-4 flex-wrap text-[11px]">
          <button onClick={() => setFilterIntegration(filterIntegration === "pppoe_online" ? "all" : "pppoe_online")} className={cn("flex items-center gap-1.5 hover:text-emerald-600", filterIntegration === "pppoe_online" && "text-emerald-700 font-bold")}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> PPPoE Online: <span className="font-mono tabular-nums font-semibold">{integrationStats.pppoeOnline.toLocaleString("id-ID")}</span>
          </button>
          <button onClick={() => setFilterIntegration(filterIntegration === "pppoe_offline" ? "all" : "pppoe_offline")} className={cn("flex items-center gap-1.5 hover:text-rose-600", filterIntegration === "pppoe_offline" && "text-rose-700 font-bold")}>
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" /> PPPoE Offline: <span className="font-mono tabular-nums font-semibold">{integrationStats.fully + integrationStats.pppoeOnly - integrationStats.pppoeOnline}</span>
          </button>
          <span className="text-muted-foreground/40">·</span>
          <button onClick={() => setFilterIntegration(filterIntegration === "ont_online" ? "all" : "ont_online")} className={cn("flex items-center gap-1.5 hover:text-emerald-600", filterIntegration === "ont_online" && "text-emerald-700 font-bold")}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> ONT Online: <span className="font-mono tabular-nums font-semibold">{integrationStats.ontOnline.toLocaleString("id-ID")}</span>
          </button>
          <button onClick={() => setFilterIntegration(filterIntegration === "ont_offline" ? "all" : "ont_offline")} className={cn("flex items-center gap-1.5 hover:text-rose-600", filterIntegration === "ont_offline" && "text-rose-700 font-bold")}>
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" /> ONT Offline: <span className="font-mono tabular-nums font-semibold">{integrationStats.fully + integrationStats.ontOnly - integrationStats.ontOnline}</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              {filtered.length} pelanggan
              {activeFilterCount > 0 && (
                <span className="text-xs font-normal text-muted-foreground ml-2">
                  ({filteredStats.active} aktif, {filteredStats.suspended} isolir)
                </span>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">Per halaman:</span>
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Memuat data...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {search || activeFilterCount > 0 ? (
                <div className="space-y-2">
                  <p>Tidak ada pelanggan sesuai filter</p>
                  <Button variant="outline" size="sm" onClick={clearAllFilters}>
                    <X className="h-4 w-4 mr-1" /> Reset Semua Filter
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p>Belum ada data pelanggan</p>
                  <Button size="sm" onClick={() => setFormOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Tambah Pelanggan
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
                      onClick={() => handleSort("name")}>
                      ID / Nama <SortIcon col="name" />
                    </th>
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
                      onClick={() => handleSort("district")}>
                      Kecamatan / Desa <SortIcon col="district" />
                    </th>
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
                      onClick={() => handleSort("package")}>
                      Paket <SortIcon col="package" />
                    </th>
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">ODP / Port</th>
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
                      onClick={() => handleSort("status")}>
                      Status <SortIcon col="status" />
                    </th>
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Koneksi</th>
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Telepon</th>
                    <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedList.map((c) => {
                    const anyC = c as any;
                    const locks = parseOverrides(c);
                    return (
                      <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium">{c.name}</span>
                            {locks.length > 0 && (
                              <span title={`${locks.length} field dilindungi: ${locks.map(f => LOCKABLE_FIELDS.find(l => l.key === f)?.label ?? f).join(", ")}`}>
                                <Lock className="h-3 w-3 text-amber-600" />
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono">{c.customerId}</div>
                          {anyC.customerType && (
                            <Badge variant="outline" className="text-[9px] mt-0.5">
                              {anyC.customerType === "bisnis" ? "Bisnis" : "Rumahan"}
                            </Badge>
                          )}
                        </td>
                        <td className="py-2.5 px-4">
                          {anyC.district ? (
                            <div>
                              <div className="text-xs font-medium">{anyC.district}</div>
                              {anyC.village && <div className="text-[11px] text-muted-foreground">{anyC.village}</div>}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4">
                          {c.package ? (
                            <div>
                              <Badge variant="outline" className="text-xs">{c.package}</Badge>
                              {anyC.billingPrice ? <div className="text-xs text-muted-foreground mt-1">{formatRp(anyC.billingPrice)}</div> : null}
                            </div>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-2.5 px-4">
                          {c.odpId ? (
                            <div>
                              <div className="text-xs font-medium">{odpMap.get(c.odpId) ?? `ODP #${c.odpId}`}</div>
                              {c.portNumber && <div className="text-xs text-muted-foreground">Port {c.portNumber}</div>}
                            </div>
                          ) : <span className="text-xs text-muted-foreground">Belum dihubungkan</span>}
                        </td>
                        <td className="py-2.5 px-4">
                          <StatusBadge status={c.status} />
                          {anyC.billingStatus === "belum_lunas" && (
                            <div className="text-xs text-orange-500 mt-1">Belum lunas</div>
                          )}
                        </td>
                        <td className="py-2.5 px-4">
                          {(() => {
                            const ont = ontStatuses[c.id];
                            const pppoeOnline = isOnline(anyC.pppoeUsername);
                            const session = findSession(anyC.pppoeUsername);
                            const isIsolir = anyC.isIsolir === 1;
                            return (
                              <div className="flex flex-col gap-1">
                                {/* PPPoE status */}
                                {anyC.pppoeUsername ? (
                                  isIsolir ? (
                                    <Badge className="bg-red-500 text-white text-[10px] w-fit"><Shield className="h-3 w-3 mr-1" />Isolir</Badge>
                                  ) : pppoeOnline ? (
                                    <Badge className="bg-green-500 text-white text-[10px] w-fit" title={`IP: ${session?.address ?? '?'}\nUptime: ${session?.uptime ?? '?'}\nMAC: ${session?.callerId ?? session?.['caller-id'] ?? '?'}`}>
                                      <Wifi className="h-3 w-3 mr-1" />PPPoE Online
                                      {session?.address ? ` (${session.address})` : ""}
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-[10px] w-fit"><WifiOff className="h-3 w-3 mr-1" />PPPoE Offline</Badge>
                                  )
                                ) : null}
                                {/* Uptime row kalau online */}
                                {pppoeOnline && session?.uptime ? (
                                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                    <Clock className="h-2.5 w-2.5" /> {session.uptime}
                                  </span>
                                ) : null}
                                {/* ONT/ACS status */}
                                {ont?.matched ? (
                                  <Badge variant="outline" className={`text-[10px] w-fit ${ont.ontStatus === "online" ? "border-green-300 text-green-700 bg-green-50" : "border-red-300 text-red-700 bg-red-50"}`}>
                                    <Monitor className="h-3 w-3 mr-1" />
                                    ONT {ont.ontStatus === "online" ? "Online" : "Offline"}
                                    {ont.ontRxPower ? ` (${ont.ontRxPower}dBm)` : ""}
                                  </Badge>
                                ) : !anyC.pppoeUsername ? (
                                  <span className="text-xs text-muted-foreground">—</span>
                                ) : null}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="py-2.5 px-4 text-muted-foreground text-xs">{c.phone ?? "—"}</td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600"
                              title="Detail pelanggan"
                              onClick={() => { setDetailCustomer(c); setDetailTab("info"); setDetailShowPassword(false); }}>
                              <Info className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditItem(c)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(c)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>

        {/* Pagination */}
        {filtered.length > pageSize && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <p className="text-xs text-muted-foreground">
              Menampilkan {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} dari {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1}
                onClick={() => setPage(1)}>
                <ChevronLeft className="h-3 w-3" /><ChevronLeft className="h-3 w-3 -ml-2" />
              </Button>
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              {/* Page numbers */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) pageNum = i + 1;
                else if (page <= 3) pageNum = i + 1;
                else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
                else pageNum = page - 2 + i;
                return (
                  <Button key={pageNum} variant={page === pageNum ? "default" : "outline"}
                    size="icon" className="h-7 w-7 text-xs" onClick={() => setPage(pageNum)}>
                    {pageNum}
                  </Button>
                );
              })}
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages}
                onClick={() => setPage(totalPages)}>
                <ChevronRight className="h-3 w-3" /><ChevronRight className="h-3 w-3 -ml-2" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* v4.2.5: Audit Integrasi dialog */}
      <IntegrationAuditDialog open={auditDialogOpen} onClose={() => setAuditDialogOpen(false)} />

      {/* Create Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tambah Pelanggan</DialogTitle>
            <DialogDescription>Entry manual data pelanggan</DialogDescription>
          </DialogHeader>
          <CustomerForm item={null} onSubmit={handleCreate} isPending={isPending} />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog — v4.1.3+: hanya edit 6 field local, sisanya read-only dari billing */}
      <Dialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Data Lokal Pelanggan</DialogTitle>
            <DialogDescription>
              {editItem?.name} ({editItem?.customerId}) — field data billing hanya bisa diubah di <a href="https://billing.jabnet.id" target="_blank" rel="noreferrer" className="underline text-primary">billing.jabnet.id</a>
            </DialogDescription>
          </DialogHeader>
          {editItem && <CustomerLocalEditForm item={editItem} onSubmit={handleUpdate} isPending={isPending} />}
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailCustomer} onOpenChange={(o) => { if (!o) setDetailCustomer(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <Info className="h-5 w-5 text-blue-600" />
                  {detailCustomer?.name}
                </DialogTitle>
                <DialogDescription>{detailCustomer?.customerId}</DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                <ChatwootSyncButton customerId={(detailCustomer as any)?.id} alreadySynced={!!(detailCustomer as any)?.chatwootContactId} size="sm" />
                <OpenInChatwootButton target="contacts" size="sm" />
              </div>
            </div>
          </DialogHeader>

          {/* Tab buttons */}
          <div className="flex gap-1 border-b pb-0">
            <button
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${detailTab === "info" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              onClick={() => setDetailTab("info")}
            >
              Informasi
            </button>
            <button
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${detailTab === "pppoe" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              onClick={() => setDetailTab("pppoe")}
            >
              PPPoE & MikroTik
            </button>
            {chatwootReady && (
              <button
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${detailTab === "komunikasi" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                onClick={() => setDetailTab("komunikasi")}
              >
                Komunikasi
              </button>
            )}
          </div>

          {detailCustomer && detailTab === "info" && (() => {
            const dc = detailCustomer as any;
            return (
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground">Nama</span>
                    <p className="font-medium">{dc.name}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">ID Pelanggan</span>
                    <p className="font-medium font-mono">{dc.customerId}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Jenis</span>
                    <p>{dc.customerType === "bisnis" ? "Bisnis" : "Rumahan"}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Telepon</span>
                    <p>{dc.phone || "—"}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Email</span>
                    <p>{dc.email || "—"}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Status</span>
                    <div className="mt-0.5"><StatusBadge status={dc.status} /></div>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                    <div className="col-span-2">
                      <span className="text-xs text-muted-foreground">Alamat</span>
                      <p>{dc.address || "—"}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Kecamatan</span>
                      <p>{dc.district || "—"}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Desa / Kelurahan</span>
                      <p>{dc.village || "—"}</p>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                    <div>
                      <span className="text-xs text-muted-foreground">Paket Layanan</span>
                      <p>{dc.package || "—"}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Harga Billing</span>
                      <p>{dc.billingPrice ? formatRp(dc.billingPrice) : "—"}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Status Billing</span>
                      <p>{dc.billingStatus === "belum_lunas" ? "Belum Lunas" : dc.billingStatus === "lunas" ? "Lunas" : dc.billingStatus || "—"}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Tanggal Pasang</span>
                      <p>{dc.installDate || "—"}</p>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                    <div>
                      <span className="text-xs text-muted-foreground">ODP</span>
                      <p>{dc.odpId ? (odpMap.get(dc.odpId) ?? `ODP #${dc.odpId}`) : "—"}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Nomor Port</span>
                      <p>{dc.portNumber ?? "—"}</p>
                    </div>
                  </div>
                </div>

                {dc.notes && (
                  <div className="border-t pt-3">
                    <span className="text-xs text-muted-foreground">Catatan</span>
                    <p className="text-sm whitespace-pre-wrap">{dc.notes}</p>
                  </div>
                )}
              </div>
            );
          })()}

          {detailCustomer && detailTab === "pppoe" && (() => {
            const dc = detailCustomer as any;
            if (!dc.pppoeUsername) {
              return (
                <div className="py-10 text-center space-y-3">
                  <WifiOff className="h-10 w-10 mx-auto text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground text-sm">Belum ada akun PPPoE.</p>
                  <p className="text-muted-foreground text-xs">Edit pelanggan untuk menambahkan.</p>
                  <Button variant="outline" size="sm" onClick={() => { setDetailCustomer(null); setEditItem(detailCustomer); }}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Edit Pelanggan
                  </Button>
                </div>
              );
            }

            const online = isOnline(dc.pppoeUsername);
            const session = findSession(dc.pppoeUsername);
            const sessionRouter = dc.pppoeUsername ? sessionRouterByPppoe.get(dc.pppoeUsername.toLowerCase()) : null;
            const isIsolir = dc.isIsolir === 1;

            return (
              <div className="space-y-4 pt-2">
                {/* Status badge */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-muted-foreground">Status Koneksi:</span>
                  {isIsolir ? (
                    <Badge className="bg-red-500 text-white"><Shield className="h-3 w-3 mr-1" />Isolir</Badge>
                  ) : online ? (
                    <Badge className="bg-green-500 text-white"><Wifi className="h-3 w-3 mr-1" />Online</Badge>
                  ) : (
                    <Badge variant="secondary"><WifiOff className="h-3 w-3 mr-1" />Offline</Badge>
                  )}
                  {online && session?.uptime && (
                    <Badge variant="outline" className="text-[10px]">
                      <Clock className="h-3 w-3 mr-1" /> {session.uptime}
                    </Badge>
                  )}
                  {sessionRouter && (
                    <Badge variant="outline" className="text-[10px]">
                      Router: {sessionRouter.routerName}
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground">Username PPPoE</span>
                    <p className="font-medium font-mono">{dc.pppoeUsername}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Password PPPoE</span>
                    <div className="flex items-center gap-2">
                      <p className="font-mono">{detailShowPassword ? (dc.pppoePassword || "—") : "********"}</p>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => setDetailShowPassword(!detailShowPassword)}
                      >
                        {detailShowPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Profile / Paket MikroTik</span>
                    <p>{dc.pppoeProfile || "—"}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Router</span>
                    <p>{dc.pppoeRouterId ? (routerMap.get(dc.pppoeRouterId) ?? `Router #${dc.pppoeRouterId}`) : "—"}</p>
                  </div>
                </div>

                {/* ── LIVE SESSION DATA (v4.1.2) — muncul hanya kalau online ── */}
                {online && session && (
                  <div className="border-t pt-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-green-600" />
                      <span className="text-xs font-semibold">Sesi PPPoE Aktif (MikroTik)</span>
                      <Badge variant="outline" className="text-[10px] ml-auto border-green-300 text-green-700 bg-green-50">
                        ● Live
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                      <div>
                        <span className="text-xs text-muted-foreground">IP Address</span>
                        <p className="font-mono text-xs">{session.address || "—"}</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">MAC Address</span>
                        <p className="font-mono text-xs">{session.callerId || (session as any)["caller-id"] || "—"}</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">Uptime</span>
                        <p className="text-xs">{session.uptime || "—"}</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">Service</span>
                        <p className="text-xs uppercase">{session.service || "—"}</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">Session ID</span>
                        <p className="font-mono text-[10px]">{session.sessionId || session.id || "—"}</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">RADIUS</span>
                        <p className="text-xs">{session.radius ? "Ya" : "Tidak"}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* ONT / GenieACS Info */}
                {(() => {
                  const ont = ontStatuses[detailCustomer!.id];
                  if (!ont?.matched) return (
                    <div className="border-t pt-3">
                      <div className="rounded-lg border bg-muted/30 p-3 text-center">
                        <Monitor className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                        <p className="text-xs text-muted-foreground">Perangkat ONT tidak terdeteksi</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Pastikan PPPoE username atau SN ONT sesuai dengan data di GenieACS</p>
                      </div>
                    </div>
                  );
                  return (
                    <div className="border-t pt-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Monitor className="h-4 w-4 text-primary" />
                        <span className="text-xs font-semibold">Perangkat ONT (GenieACS)</span>
                        <Badge variant="outline" className={`text-[10px] ml-auto ${ont.ontStatus === "online" ? "border-green-300 text-green-700 bg-green-50" : "border-red-300 text-red-700 bg-red-50"}`}>
                          {ont.ontStatus === "online" ? "● Online" : "● Offline"}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                        <div><span className="text-xs text-muted-foreground">Serial Number</span><p className="font-mono text-xs">{ont.ontSerialNumber || "—"}</p></div>
                        <div><span className="text-xs text-muted-foreground">Manufacturer / Model</span><p className="text-xs">{ont.ontManufacturer || "—"} {ont.ontModel || ""}</p></div>
                        <div><span className="text-xs text-muted-foreground">IP Address</span><p className="font-mono text-xs">{ont.ontIpAddress || "—"}</p></div>
                        <div><span className="text-xs text-muted-foreground">RX Power</span><p className={`text-xs font-mono font-medium ${parseFloat(ont.ontRxPower || "0") > -25 ? "text-green-600" : parseFloat(ont.ontRxPower || "0") > -28 ? "text-amber-600" : "text-red-600"}`}>{ont.ontRxPower ? `${ont.ontRxPower} dBm` : "—"}</p></div>
                        <div><span className="text-xs text-muted-foreground">Last Inform</span><p className="text-xs">{ont.ontLastInform ? new Date(ont.ontLastInform).toLocaleString("id-ID") : "—"}</p></div>
                        <div><span className="text-xs text-muted-foreground">Cocok via</span><p className="text-xs">{ont.matchBy === "pppoe" ? "PPPoE Username" : "Serial Number"}</p></div>
                      </div>
                      {/* Deep link ke GenieACS page */}
                      <div className="flex gap-2 pt-2">
                        <Button variant="outline" size="sm" onClick={() => { setDetailCustomer(null); window.location.href = `/devices?q=${encodeURIComponent(ont.ontSerialNumber || dc.pppoeUsername || "")}`; }}>
                          <ExternalLink className="h-3.5 w-3.5 mr-1" /> Detail di GenieACS
                        </Button>
                      </div>
                    </div>
                  );
                })()}

                {/* Action buttons */}
                <div className="border-t pt-3 flex gap-2">
                  {isIsolir || dc.status === "suspended" ? (
                    <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" disabled={pppoeActionPending}
                      onClick={() => handlePppoeToggle(detailCustomer!, "activate")}>
                      <Wifi className="h-3.5 w-3.5 mr-1" />
                      {pppoeActionPending ? "Memproses..." : "Aktifkan"}
                    </Button>
                  ) : (
                    <Button size="sm" variant="destructive" disabled={pppoeActionPending}
                      onClick={() => handlePppoeToggle(detailCustomer!, "isolir")}>
                      <Shield className="h-3.5 w-3.5 mr-1" />
                      {pppoeActionPending ? "Memproses..." : "Isolir"}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => { setDetailCustomer(null); setEditItem(detailCustomer); }}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Edit PPPoE
                  </Button>
                </div>
              </div>
            );
          })()}

          {detailCustomer && detailTab === "komunikasi" && (
            <CustomerCommunication customerId={(detailCustomer as any).id} />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Pelanggan?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" ({deleteTarget?.customerId}) akan dihapus permanen beserta akun PPPoE-nya jika ada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// v4.2.5: Integration Audit Dialog — fuzzy match customer "PPPoE saja" ke device GenieACS
// ─────────────────────────────────────────────────────────────────────────

// v4.2.10: prefer PON Serial format saat ada (yang OLT register-kan), fallback ke factory serial.
// PON serial format: vendor prefix (4 chars) + 8 hex MAC. Contoh: ZXICAEE7F72F, FHTTC127A7C1.
function pickBestSerial(c: AuditCandidate): string | null {
  return c.devicePonSerialNumber || c.deviceSerialNumber;
}

interface AuditCandidate {
  deviceId: string;
  devicePppoe: string;
  deviceSerialNumber: string | null;
  devicePonSerialNumber: string | null;
  deviceStatus: "online" | "offline" | null;
  deviceManufacturer: string | null;
  deviceModel: string | null;
  confidence: number;
  matchMethod: "alphanumeric" | "leading_zero" | "substring" | "levenshtein";
}
interface AuditItem {
  customerId: number;
  customerName: string;
  customerBillingId: string;
  customerPppoe: string;
  candidates: AuditCandidate[];
}
interface AuditResponse {
  totalUnmatched: number;
  totalDevices: number;
  devicesWithPppoe: number;
  withCandidate: number;
  highConfidenceCount: number;
  noCandidate: number;
  items: AuditItem[];
}

const METHOD_LABELS: Record<string, string> = {
  alphanumeric: "Strip simbol",
  leading_zero: "Strip 0 awal",
  substring: "Substring",
  levenshtein: "Mirip (typo)",
};

function IntegrationAuditDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [selections, setSelections] = useState<Map<number, string>>(new Map());
  const [confidenceFilter, setConfidenceFilter] = useState<number>(0);

  const { data: audit, isLoading, refetch } = useQuery<AuditResponse>({
    queryKey: ["/api/customers/integration-audit"],
    queryFn: () => api.get<AuditResponse>("/customers/integration-audit"),
    enabled: open,
    staleTime: 60_000,
  });

  // Pre-fill selections: top candidate untuk semua high-confidence (>= 90)
  useEffect(() => {
    if (!audit?.items) return;
    setSelections((prev) => {
      const next = new Map(prev);
      for (const item of audit.items) {
        if (next.has(item.customerId)) continue;
        const top = item.candidates[0];
        const sn = top ? pickBestSerial(top) : null;
        if (top && top.confidence >= 90 && sn) {
          next.set(item.customerId, sn);
        }
      }
      return next;
    });
  }, [audit?.items]);

  const pairMut = useMutation({
    mutationFn: (pairs: Array<{ customerId: number; deviceSerialNumber: string }>) =>
      api.post<{ success: number; failed: number }>("/customers/auto-pair-ont", { pairs }),
    onSuccess: (r: any) => {
      const data = r?.data ?? r;
      toast.success(`${data?.success ?? 0} customer berhasil di-pair ke ONT`);
      qc.invalidateQueries({ queryKey: ["/api/customers/ont-status"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      refetch();
      setSelections(new Map());
      onClose();
    },
    onError: (e: any) => toast.error(e.message || "Gagal apply pairing"),
  });

  const filteredItems = useMemo(() => {
    if (!audit?.items) return [];
    return audit.items.filter((item) => {
      if (confidenceFilter === 0) return true;
      return item.candidates.some((c) => c.confidence >= confidenceFilter);
    });
  }, [audit?.items, confidenceFilter]);

  const selectedCount = selections.size;
  const totalCandidates = audit?.withCandidate ?? 0;

  function applySelections() {
    const pairs: Array<{ customerId: number; deviceSerialNumber: string }> = [];
    for (const [cid, sn] of selections) {
      if (sn) pairs.push({ customerId: cid, deviceSerialNumber: sn });
    }
    if (pairs.length === 0) {
      toast.error("Tidak ada pairing yang dipilih");
      return;
    }
    if (!confirm(`Apply ${pairs.length} pairing ONT? Customer akan dapat ontSerialNumber yang ke-link ke device GenieACS.`)) return;
    pairMut.mutate(pairs);
  }

  function selectAllHighConfidence() {
    if (!audit?.items) return;
    const next = new Map(selections);
    let added = 0;
    for (const item of audit.items) {
      const top = item.candidates[0];
      const sn = top ? pickBestSerial(top) : null;
      if (top && top.confidence >= 90 && sn && !next.has(item.customerId)) {
        next.set(item.customerId, sn);
        added++;
      }
    }
    setSelections(next);
    toast.success(`${added} pairing high-confidence dipilih`);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-5 py-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <span className="text-amber-500">⚡</span> Audit & Auto-Pair ONT
          </DialogTitle>
          <DialogDescription>
            Cari pasangan ONT dari GenieACS untuk customer yang punya PPPoE tapi belum match. Pakai fuzzy matching.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex-1 grid place-items-center py-16">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-xs">Scanning {(audit as any)?.totalUnmatched ?? "..."} customer + {(audit as any)?.totalDevices ?? "..."} device GenieACS...</span>
            </div>
          </div>
        ) : !audit ? (
          <div className="flex-1 grid place-items-center py-16">
            <span className="text-sm text-muted-foreground">Gagal memuat audit. GenieACS mungkin belum dikonfigurasi.</span>
          </div>
        ) : (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 border-b">
              <div className="px-4 py-3">
                <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Customer Unmatched</div>
                <div className="text-2xl font-bold tabular-nums text-foreground mt-0.5">{audit.totalUnmatched.toLocaleString("id-ID")}</div>
              </div>
              <div className="px-4 py-3">
                <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Punya Kandidat</div>
                <div className="text-2xl font-bold tabular-nums text-emerald-600 mt-0.5">{audit.withCandidate.toLocaleString("id-ID")}</div>
              </div>
              <div className="px-4 py-3">
                <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Confident ≥90%</div>
                <div className="text-2xl font-bold tabular-nums text-amber-600 mt-0.5">{audit.highConfidenceCount.toLocaleString("id-ID")}</div>
              </div>
              <div className="px-4 py-3">
                <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Tidak Ada Match</div>
                <div className="text-2xl font-bold tabular-nums text-rose-600 mt-0.5">{audit.noCandidate.toLocaleString("id-ID")}</div>
              </div>
            </div>

            {/* Toolbar */}
            <div className="flex items-center justify-between gap-2 px-5 py-2.5 border-b bg-muted/30 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase font-bold text-muted-foreground">Filter:</span>
                {[
                  { val: 0, label: "Semua" },
                  { val: 90, label: "≥ 90%" },
                  { val: 80, label: "≥ 80%" },
                  { val: 70, label: "≥ 70%" },
                ].map((f) => (
                  <button
                    key={f.val}
                    onClick={() => setConfidenceFilter(f.val)}
                    className={cn(
                      "text-[11px] px-2 py-1 rounded font-semibold",
                      confidenceFilter === f.val ? "bg-primary text-primary-foreground" : "bg-card border hover:bg-muted",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                {audit.highConfidenceCount > 0 && (
                  <Button size="sm" variant="outline" onClick={selectAllHighConfidence} className="h-7 text-xs">
                    Pilih semua ≥90%
                  </Button>
                )}
                {selectedCount > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => setSelections(new Map())} className="h-7 text-xs text-muted-foreground">
                    Reset pilihan
                  </Button>
                )}
              </div>
            </div>

            {/* Items list */}
            <div className="flex-1 overflow-y-auto">
              {filteredItems.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground text-sm">
                  {audit.withCandidate === 0
                    ? "Tidak ada kandidat ditemukan. Mungkin GenieACS kosong atau PPPoE username terlalu beda."
                    : "Tidak ada item match filter ini"}
                </div>
              ) : (
                <div className="divide-y">
                  {filteredItems.map((item) => {
                    const selected = selections.get(item.customerId);
                    const isSelected = !!selected;
                    return (
                      <div key={item.customerId} className={cn(
                        "px-5 py-3 transition-colors",
                        isSelected ? "bg-emerald-50/40 dark:bg-emerald-950/15" : "hover:bg-muted/30",
                      )}>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm text-foreground">{item.customerName}</span>
                              <span className="text-[10px] font-mono text-muted-foreground">#{item.customerBillingId}</span>
                              {isSelected && <Badge className="bg-emerald-500 text-white text-[9px] uppercase tracking-wider px-1.5 py-0 border-0">✓ akan di-pair</Badge>}
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                              PPPoE customer: <span className="font-mono font-semibold text-foreground/80">{item.customerPppoe}</span>
                            </div>
                          </div>
                          {item.candidates.length === 0 && (
                            <span className="text-[10px] uppercase tracking-wider font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 px-1.5 py-0.5 rounded shrink-0">
                              Tidak ada match
                            </span>
                          )}
                        </div>

                        {item.candidates.length > 0 && (
                          <div className="space-y-1.5 ml-3 pl-3 border-l-2 border-muted">
                            {item.candidates.map((c) => {
                              const bestSn = pickBestSerial(c);
                              const isThisSelected = selected === bestSn;
                              const confTone = c.confidence >= 90 ? "emerald" : c.confidence >= 80 ? "amber" : "zinc";
                              return (
                                <button
                                  key={c.deviceId}
                                  onClick={() => {
                                    const next = new Map(selections);
                                    if (isThisSelected) next.delete(item.customerId);
                                    else if (bestSn) next.set(item.customerId, bestSn);
                                    setSelections(next);
                                  }}
                                  disabled={!bestSn}
                                  className={cn(
                                    "w-full text-left px-3 py-2 rounded-md flex items-center gap-3 transition-all",
                                    isThisSelected ? "bg-emerald-100 dark:bg-emerald-950/40 ring-2 ring-emerald-400" : "bg-muted/40 hover:bg-muted/70",
                                    !bestSn && "opacity-50 cursor-not-allowed",
                                  )}
                                >
                                  <div className={cn(
                                    "px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tabular-nums shrink-0",
                                    confTone === "emerald" && "bg-emerald-500 text-white",
                                    confTone === "amber" && "bg-amber-500 text-white",
                                    confTone === "zinc" && "bg-zinc-400 text-white",
                                  )}>
                                    {c.confidence}%
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-mono text-xs font-semibold text-foreground truncate">{c.devicePppoe}</span>
                                      {c.deviceStatus === "online" ? (
                                        <span className="text-[9px] uppercase tracking-wider font-bold px-1 py-0 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">Online</span>
                                      ) : c.deviceStatus === "offline" ? (
                                        <span className="text-[9px] uppercase tracking-wider font-bold px-1 py-0 rounded bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400">Offline</span>
                                      ) : null}
                                      <span className="text-[9px] uppercase tracking-wider font-semibold px-1 py-0 rounded bg-zinc-100 dark:bg-zinc-800 text-muted-foreground">
                                        {METHOD_LABELS[c.matchMethod]}
                                      </span>
                                    </div>
                                    <div className="text-[10px] text-muted-foreground mt-0.5 flex flex-col gap-0.5">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        {c.devicePonSerialNumber && (
                                          <span className="font-mono">
                                            <span className="text-emerald-600 font-bold">PON SN:</span> {c.devicePonSerialNumber}
                                            <span className="text-emerald-700 dark:text-emerald-400 ml-1 text-[9px]">(yang OLT register)</span>
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        {c.deviceSerialNumber && c.deviceSerialNumber !== c.devicePonSerialNumber && (
                                          <span className="font-mono opacity-70">
                                            <span className="text-zinc-500">Factory SN:</span> {c.deviceSerialNumber}
                                          </span>
                                        )}
                                        {c.deviceManufacturer && <span>· {c.deviceManufacturer} {c.deviceModel}</span>}
                                      </div>
                                    </div>
                                  </div>
                                  <div className={cn(
                                    "h-5 w-5 rounded-full border-2 grid place-items-center shrink-0",
                                    isThisSelected ? "bg-emerald-500 border-emerald-500" : "border-muted-foreground/30",
                                  )}>
                                    {isThisSelected && <Check className="h-3 w-3 text-white" />}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t bg-muted/30 flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">
                <span className="font-bold text-foreground tabular-nums">{selectedCount}</span> dipilih dari {totalCandidates.toLocaleString("id-ID")} kandidat
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>Tutup</Button>
                <Button
                  onClick={applySelections}
                  disabled={selectedCount === 0 || pairMut.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {pairMut.isPending ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Apply...</> : <>⚡ Apply {selectedCount} Pairing</>}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Tab "Komunikasi" di detail pelanggan: cari kontak Chatwoot via phone, tampilkan
 *  daftar percakapan + thread (read-only). Komponen di-reuse dari /communications. */
function CustomerCommunication({ customerId }: { customerId: number }) {
  const { data, isLoading } = useCustomerConversations(customerId);
  const [active, setActive] = useState<number | null>(null);

  if (!isLoading && data && data.contactId == null) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Belum ada kontak Chatwoot untuk pelanggan ini.</p>;
  }
  return (
    <section aria-label="Komunikasi" className="space-y-2 pt-2">
      {data?.contactId != null && <ChatwootContactCard contactName={data.contactName} />}
      {active == null ? (
        <ConversationList conversations={data?.conversations ?? []} isLoading={isLoading} onSelect={setActive} />
      ) : (
        <>
          <button type="button" className="text-xs text-muted-foreground" onClick={() => setActive(null)}>← Daftar percakapan</button>
          <div className="max-h-80 overflow-y-auto"><ConversationThread conversationId={active} conversation={data?.conversations?.find((c) => c.id === active)} /></div>
        </>
      )}
    </section>
  );
}
