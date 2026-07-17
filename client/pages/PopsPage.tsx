import { usePops } from "@/hooks/useAssets";
import { AssetTable, type ColumnDef } from "@/components/shared/AssetTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { useEffect } from "react";
import type { Pop, InsertPop } from "@shared/schema";
import { reverseGeocode } from "@/lib/geocode";
import { garutDistricts, resolveDistrict, getVillages } from "@/lib/garut-demography";

const columns: ColumnDef<Pop>[] = [
  { key: "code", label: "Kode" },
  { key: "name", label: "Nama" },
  { key: "address", label: "Alamat" },
  {
    key: "ports", label: "Port",
    render: (item) => `${item.usedPorts ?? 0}/${item.totalPorts ?? 0}`,
  },
  { key: "status", label: "Status" },
];

function PopForm({
  item,
  onSubmit,
  isPending,
}: {
  item: Pop | null;
  onSubmit: (data: InsertPop) => void;
  isPending: boolean;
}) {
  const { register, handleSubmit, reset, setValue, watch } = useForm<InsertPop>();
  const watchedDistrict = watch("district");

  useEffect(() => {
    if (item) {
      reset({
        name: item.name,
        code: item.code,
        address: item.address ?? "",
        lat: item.lat ?? undefined,
        lng: item.lng ?? undefined,
        totalPorts: item.totalPorts ?? 0,
        usedPorts: item.usedPorts ?? 0,
        status: item.status ?? "active",
        district: item.district ?? "",
        village: item.village ?? "",
        notes: item.notes ?? "",
      });
    } else {
      reset({ name: "", code: "", status: "active", totalPorts: 0, usedPorts: 0, district: "", village: "" });
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
          <Label>Nama POP</Label>
          <Input {...register("name")} required placeholder="POP Tarogong" />
        </div>
        <div className="space-y-2">
          <Label>Kode</Label>
          <Input {...register("code")} required placeholder="POP-001" />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Kecamatan dari koordinat</span>
        <Button type="button" variant="outline" size="sm" onClick={detectLocation}>
          📍 Deteksi Lokasi
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
        <Input {...register("address")} placeholder="Jl. Raya Tarogong No. 1" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Latitude</Label>
          <Input {...register("lat", { valueAsNumber: true })} type="number" step="any" placeholder="-7.22" />
        </div>
        <div className="space-y-2">
          <Label>Longitude</Label>
          <Input {...register("lng", { valueAsNumber: true })} type="number" step="any" placeholder="107.90" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Total Port</Label>
          <Input {...register("totalPorts", { valueAsNumber: true })} type="number" />
        </div>
        <div className="space-y-2">
          <Label>Port Terpakai</Label>
          <Input {...register("usedPorts", { valueAsNumber: true })} type="number" />
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
        <Textarea {...register("notes")} placeholder="Catatan tambahan..." />
      </div>
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Menyimpan..." : item ? "Update" : "Simpan"}
      </Button>
    </form>
  );
}

export default function PopsPage() {
  const { data, isLoading, create, update, remove } = usePops();

  return (
    <AssetTable<Pop>
      title="POP"
      description="Point of Presence — titik awal jaringan FTTH"
      data={data}
      isLoading={isLoading}
      columns={columns}
      renderForm={(item, onSubmit, isPending) => (
        <PopForm item={item} onSubmit={onSubmit} isPending={isPending} />
      )}
      onCreate={(d) => create.mutateAsync(d)}
      onUpdate={(id, d) => update.mutateAsync({ id, data: d })}
      onDelete={(id) => remove.mutateAsync(id)}
    />
  );
}
