import { useOdps, useOdcs, useOdpUtilization } from "@/hooks/useAssets";
import { AssetTable, type ColumnDef } from "@/components/shared/AssetTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Odp, InsertOdp } from "@shared/schema";
import { reverseGeocode } from "@/lib/geocode";
import { garutDistricts, resolveDistrict, getVillages } from "@/lib/garut-demography";
import { AssetPhotosGallery } from "@/components/shared/AssetPhotosGallery";
import { api } from "@/lib/api";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";

// ==================== CONNECTED CUSTOMERS ====================

interface OdpCustomer {
  id: number;
  customerId: string;
  name: string;
  connStatus: "active" | "isolir" | "suspend" | "terminated" | "unknown";
  portNumber: number | null;
  package: string | null;
  phone: string | null;
}

// Peta status koneksi pelanggan → badge design-system (selaras customerConnStatus server).
const CONN_BADGE: Record<OdpCustomer["connStatus"], { variant: StatusVariant; label: string }> = {
  active: { variant: "success", label: "Aktif" },
  isolir: { variant: "danger", label: "Isolir" },
  suspend: { variant: "warning", label: "Suspend" },
  terminated: { variant: "neutral", label: "Terminated" },
  unknown: { variant: "neutral", label: "?" },
};

function OdpCustomersList({ odpId, capacity }: { odpId: number; capacity: number }) {
  const { data: customers = [], isLoading } = useQuery<OdpCustomer[]>({
    queryKey: ["/api/odps", odpId, "customers"],
    queryFn: () => api.get<OdpCustomer[]>(`/odps/${odpId}/customers`),
    enabled: odpId > 0,
  });

  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold">
        Pelanggan Terhubung{" "}
        <span className="text-muted-foreground font-normal">({customers.length}/{capacity} port)</span>
      </Label>
      {isLoading ? (
        <div className="text-xs text-muted-foreground">Memuat pelanggan...</div>
      ) : customers.length === 0 ? (
        <div className="text-xs text-muted-foreground border border-dashed rounded-md p-3 text-center">
          Belum ada pelanggan terhubung ke ODP ini.
        </div>
      ) : (
        <ul className="max-h-64 overflow-y-auto no-scrollbar divide-y divide-border rounded-md border border-border">
          {customers.map((c) => {
            const badge = CONN_BADGE[c.connStatus] ?? CONN_BADGE.unknown;
            return (
              <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="w-9 shrink-0 text-center font-mono-tight text-xs text-muted-foreground">
                  {c.portNumber != null ? `#${c.portNumber}` : "-"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{c.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {c.customerId}{c.package ? ` · ${c.package}` : ""}
                  </div>
                </div>
                <StatusBadge variant={badge.variant} label={badge.label} size="sm" />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}


// ==================== USAGE BAR ====================

function UsageBar({ used, capacity }: { used: number; capacity: number }) {
  const pct = capacity > 0 ? Math.round((used / capacity) * 100) : 0;
  // hijau >=80%, kuning 50-79%, merah <50%, biru 100%
  const color =
    pct >= 100 ? "#3B82F6" :
    pct >= 80 ? "#22C55E" :
    pct >= 50 ? "#EAB308" : "#EF4444";
  return (
    <div style={{ minWidth: 110 }}>
      <div className="flex justify-between text-xs mb-0.5">
        <span>{used}/{capacity} port</span>
        <span style={{ color, fontWeight: 600 }}>{pct}%</span>
      </div>
      <div style={{ height: 5, background: "#e5e7eb", borderRadius: 3 }}>
        <div style={{ height: 5, borderRadius: 3, width: `${Math.min(pct, 100)}%`, background: color }} />
      </div>
    </div>
  );
}

// ==================== FORM ====================

function OdpForm({
  item, onSubmit, isPending,
}: {
  item: Odp | null;
  onSubmit: (data: InsertOdp) => void;
  isPending: boolean;
}) {
  const { register, handleSubmit, reset, setValue, watch } = useForm<InsertOdp>();
  const { data: odcs } = useOdcs();
  const watchedLat = watch("lat");
  const watchedLng = watch("lng");
  const watchedDistrict = watch("district" as any);

  useEffect(() => {
    if (item) {
      reset({
        name: item.name,
        code: item.code,
        odcId: item.odcId ?? undefined,
        lat: item.lat ?? undefined,
        lng: item.lng ?? undefined,
        capacity: item.capacity ?? 8,
        splitterType: item.splitterType ?? "",
        status: item.status ?? "active",
        address: item.address ?? "",
        district: (item as any).district ?? "",
        village: (item as any).village ?? "",
        notes: item.notes ?? "",
      });
    } else {
      reset({ name: "", code: "", status: "active", capacity: 8 });
    }
  }, [item, reset]);

  // Auto-detect kecamatan from koordinat
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

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Nama ODP</Label>
          <Input {...register("name")} required placeholder="ODP Tarogong 1-A" />
        </div>
        <div className="space-y-2">
          <Label>Kode</Label>
          <Input {...register("code")} required placeholder="ODP-001" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>ODC Induk</Label>
        <select {...register("odcId", { valueAsNumber: true })} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
          <option value="">Pilih ODC...</option>
          {odcs?.map((o) => (
            <option key={o.id} value={o.id}>{o.name} ({o.code})</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label>Alamat</Label>
        <Input {...register("address")} placeholder="Jl. Raya..." />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Latitude</Label>
          <Input {...register("lat", { valueAsNumber: true })} type="number" step="any" />
        </div>
        <div className="space-y-2">
          <Label>Longitude</Label>
          <Input {...register("lng", { valueAsNumber: true })} type="number" step="any" />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Deteksi otomatis kecamatan dari koordinat</span>
        <Button type="button" variant="outline" size="sm" onClick={detectLocation}>
           Deteksi Lokasi
        </Button>
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
          <Label>Kapasitas (Total Port)</Label>
          <Input {...register("capacity", { valueAsNumber: true })} type="number" />
        </div>
        <div className="space-y-2">
          <Label>Splitter</Label>
          <select {...register("splitterType")} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
            <option value="">Pilih...</option>
            <option value="1:4">1:4</option>
            <option value="1:8">1:8</option>
            <option value="1:16">1:16</option>
            <option value="1:32">1:32</option>
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Status</Label>
        <select {...register("status")} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
          <option value="active">Active</option>
          <option value="maintenance">Maintenance</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label>Catatan</Label>
        <Textarea {...register("notes")} />
      </div>
      {item && (
        <div className="pt-2 border-t border-border">
          {/* Baris foto identik dengan panel /map (geser horizontal) - sumber data sama */}
          <AssetPhotosGallery assetType="odp" assetId={item.id} layout="scroll" />
        </div>
      )}
      {item && (
        <div className="pt-2 border-t border-border">
          {/* Pelanggan yang terhubung ke ODP ini (di bawah foto) */}
          <OdpCustomersList odpId={item.id} capacity={item.capacity ?? 0} />
        </div>
      )}
      {/* Tombol simpan sticky di dasar dialog (negatif margin membatalkan p-6 DialogContent)
          agar user tidak perlu scroll sampai bawah untuk update. */}
      <div className="sticky bottom-0 -mx-6 -mb-6 border-t border-border bg-background px-6 py-3">
        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? "Menyimpan..." : item ? "Update" : "Simpan"}
        </Button>
      </div>
    </form>
  );
}

// ==================== PAGE ====================

export default function OdpsPage() {
  const { data, isLoading, create, update, remove } = useOdps();
  const { data: utilData } = useOdpUtilization();

  // Build utilization map from real-time data
  const utilMap = new Map<number, { usedPorts: number }>();
  utilData?.odps.forEach((u) => utilMap.set(u.id, { usedPorts: u.usedPorts }));

  // Build filter options dynamically
  const districts = Array.from(new Set((data || []).map(o => (o as any).district?.trim() || "").filter(Boolean))).sort();
  const statusOptions = [
    { value: "active", label: "Active" },
    { value: "maintenance", label: "Maintenance" },
    { value: "inactive", label: "Inactive" },
  ];

  const columns: ColumnDef<Odp>[] = [
    { key: "code", label: "Kode" },
    { key: "name", label: "Nama" },
    { key: "district" as any, label: "Kecamatan", render: (item) => (item as any).district || <span className="text-muted-foreground text-xs">-</span> },
    { key: "splitterType", label: "Splitter" },
    {
      key: "capacity", label: "Port Usage",
      render: (item) => {
        const used = utilMap.get(item.id)?.usedPorts ?? item.usedCapacity ?? 0;
        return <UsageBar used={used} capacity={item.capacity ?? 0} />;
      },
    },
    { key: "status", label: "Status" },
  ];

  return (
    <AssetTable<Odp>
      title="ODP"
      description="Optical Distribution Point - titik distribusi terdekat ke pelanggan"
      data={data}
      isLoading={isLoading}
      columns={columns}
      filters={[
        { key: "status", label: "Semua Status", options: statusOptions },
        { key: "district", label: "Semua Kecamatan", options: districts.map(d => ({ value: d, label: d })) },
      ]}
      renderForm={(item, onSubmit, isPending) => (
        <OdpForm item={item} onSubmit={onSubmit} isPending={isPending} />
      )}
      onCreate={(d) => create.mutateAsync(d)}
      onUpdate={(id, d) => update.mutateAsync({ id, data: d })}
      onDelete={(id) => remove.mutateAsync(id)}
    />
  );
}
