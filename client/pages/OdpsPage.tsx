import { useOdps, useOdcs, useOdpUtilization } from "@/hooks/useAssets";
import { AssetTable, type ColumnDef } from "@/components/shared/AssetTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { useEffect, useCallback } from "react";
import type { Odp, InsertOdp } from "@shared/schema";
import { reverseGeocode } from "@/lib/geocode";
import { garutDistricts, resolveDistrict, getVillages } from "@/lib/garut-demography";
import { AssetPhotosGallery } from "@/components/shared/AssetPhotosGallery";


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
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Menyimpan..." : item ? "Update" : "Simpan"}
      </Button>
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
