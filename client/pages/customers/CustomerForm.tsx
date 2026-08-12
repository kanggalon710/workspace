import { useState, useCallback } from "react";
import { useOdps, useOdpUtilization } from "@/hooks/useAssets";
import { useQuery } from "@tanstack/react-query";
import { reverseGeocode } from "@/lib/geocode";
import { garutDistricts, resolveDistrict, getVillages } from "@/lib/garut-demography";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { useEffect } from "react";
import type { Customer, InsertCustomer } from "@shared/schema";
import { Home, Lock, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { api } from "@/lib/api";
import { LOCKABLE_FIELDS, parseOverrides } from "./shared";

export function CustomerForm({ item, onSubmit, isPending }: { item: Customer | null; onSubmit: (data: InsertCustomer) => void; isPending: boolean }) {
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
           Deteksi Lokasi
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
              <SelectItem value="__none__">- Belum dihubungkan -</SelectItem>
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
                      {o.name} - {used}/{cap} port
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

      {/* Lock info panel - only when editing */}
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

