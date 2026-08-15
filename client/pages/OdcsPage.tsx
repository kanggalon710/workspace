import { useOdcs, usePops } from "@/hooks/useAssets";
import { AssetTable, type ColumnDef } from "@/components/shared/AssetTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { useEffect } from "react";
import type { Odc, InsertOdc } from "@shared/schema";
import { reverseGeocode } from "@/lib/geocode";
import { garutDistricts, resolveDistrict, getVillages } from "@/lib/garut-demography";
import { AssetPhotosGallery } from "@/components/shared/AssetPhotosGallery";

const columns: ColumnDef<Odc>[] = [
  { key: "code", label: "Kode" },
  { key: "name", label: "Nama" },
  { key: "splitterType", label: "Splitter" },
  {
    key: "capacity", label: "Kapasitas",
    render: (item) => `${item.usedCapacity ?? 0}/${item.capacity ?? 0}`,
  },
  { key: "status", label: "Status" },
];

function OdcForm({
  item, onSubmit, isPending,
}: {
  item: Odc | null;
  onSubmit: (data: InsertOdc) => void;
  isPending: boolean;
}) {
  const { register, handleSubmit, reset, setValue, watch } = useForm<InsertOdc>();
  const watchedDistrict = watch("district");
  const { data: pops } = usePops();

  useEffect(() => {
    if (item) {
      reset({
        name: item.name,
        code: item.code,
        popId: item.popId ?? undefined,
        lat: item.lat ?? undefined,
        lng: item.lng ?? undefined,
        capacity: item.capacity ?? 0,
        usedCapacity: item.usedCapacity ?? 0,
        splitterType: item.splitterType ?? "",
        status: item.status ?? "active",
        district: item.district ?? "",
        village: item.village ?? "",
        address: item.address ?? "",
        notes: item.notes ?? "",
      });
    } else {
      reset({ name: "", code: "", status: "active", capacity: 0, usedCapacity: 0, district: "", village: "" });
    }
  }, [item, reset]);

  const detectLocation = async () => {
    const lat = watch("lat");
    const lng = watch("lng");
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;
    const geo = await reverseGeocode(lat, lng);
    if (geo) {
      if (geo.district) {
        const d = resolveDistrict(geo.district);
        if (d) setValue("district", d);
      }
      if (geo.village) setValue("village", geo.village);
      if (!watch("address") && geo.formatted) setValue("address", geo.formatted);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Nama ODC</Label>
          <Input {...register("name")} required placeholder="ODC Tarogong 1" />
        </div>
        <div className="space-y-2">
          <Label>Kode</Label>
          <Input {...register("code")} required placeholder="ODC-001" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>POP Induk</Label>
        <select {...register("popId", { valueAsNumber: true })} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
          <option value="">Pilih POP...</option>
          {pops?.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
          ))}
        </select>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Kecamatan dari koordinat</span>
        <Button type="button" variant="outline" size="sm" onClick={detectLocation}>
           Deteksi Lokasi
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Kecamatan</Label>
          <select {...register("district", { onChange: () => setValue("village", "") })} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
            <option value="">Pilih...</option>
            {garutDistricts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Kelurahan / Desa</Label>
          <select {...register("village")} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" disabled={!watchedDistrict}>
            <option value="">Pilih...</option>
            {getVillages(watchedDistrict).map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Alamat / Jalan Lengkap</Label>
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
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Kapasitas</Label>
          <Input {...register("capacity", { valueAsNumber: true })} type="number" />
        </div>
        <div className="space-y-2">
          <Label>Terpakai</Label>
          <Input {...register("usedCapacity", { valueAsNumber: true })} type="number" />
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
          <AssetPhotosGallery assetType="odc" assetId={item.id} layout="scroll" />
        </div>
      )}
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Menyimpan..." : item ? "Update" : "Simpan"}
      </Button>
    </form>
  );
}

export default function OdcsPage() {
  const { data, isLoading, create, update, remove } = useOdcs();

  return (
    <AssetTable<Odc>
      title="ODC"
      deletePermissionKey="odcs"
      description="Optical Distribution Cabinet - kabinet distribusi optik"
      data={data}
      isLoading={isLoading}
      columns={columns}
      renderForm={(item, onSubmit, isPending) => (
        <OdcForm item={item} onSubmit={onSubmit} isPending={isPending} />
      )}
      onCreate={(d) => create.mutateAsync(d)}
      onUpdate={(id, d) => update.mutateAsync({ id, data: d })}
      onDelete={(id) => remove.mutateAsync(id)}
    />
  );
}
