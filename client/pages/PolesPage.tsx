import { usePoles } from "@/hooks/useAssets";
import { AssetTable, type ColumnDef } from "@/components/shared/AssetTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { useEffect } from "react";
import type { Pole, InsertPole } from "@shared/schema";
import { AssetPhotosGallery } from "@/components/shared/AssetPhotosGallery";

const columns: ColumnDef<Pole>[] = [
  { key: "code", label: "Kode" },
  { key: "name", label: "Nama" },
  { key: "type", label: "Tipe" },
  {
    key: "height", label: "Tinggi",
    render: (item) => item.height ? `${item.height}m` : "-",
  },
  { key: "status", label: "Status" },
];

function PoleForm({
  item, onSubmit, isPending,
}: {
  item: Pole | null;
  onSubmit: (data: InsertPole) => void;
  isPending: boolean;
}) {
  const { register, handleSubmit, reset } = useForm<InsertPole>();

  useEffect(() => {
    if (item) {
      reset({
        name: item.name,
        code: item.code,
        lat: item.lat ?? undefined,
        lng: item.lng ?? undefined,
        type: item.type ?? "",
        height: item.height ?? undefined,
        status: item.status ?? "active",
        notes: item.notes ?? "",
      });
    } else {
      reset({ name: "", code: "", status: "active" });
    }
  }, [item, reset]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Nama Tiang</Label>
          <Input {...register("name")} required placeholder="Tiang Tarogong 1" />
        </div>
        <div className="space-y-2">
          <Label>Kode</Label>
          <Input {...register("code")} required placeholder="TG-001" />
        </div>
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
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Tipe</Label>
          <select {...register("type")} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
            <option value="">Pilih tipe...</option>
            <option value="beton">Beton</option>
            <option value="besi">Besi</option>
            <option value="kayu">Kayu</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>Tinggi (meter)</Label>
          <Input {...register("height", { valueAsNumber: true })} type="number" step="0.1" placeholder="9" />
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
          <AssetPhotosGallery assetType="pole" assetId={item.id} layout="scroll" />
        </div>
      )}
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Menyimpan..." : item ? "Update" : "Simpan"}
      </Button>
    </form>
  );
}

export default function PolesPage() {
  const { data, isLoading, create, update, remove } = usePoles();

  return (
    <AssetTable<Pole>
      title="Tiang"
      deletePermissionKey="poles"
      description="Data tiang jaringan FTTH"
      data={data}
      isLoading={isLoading}
      columns={columns}
      renderForm={(item, onSubmit, isPending) => (
        <PoleForm item={item} onSubmit={onSubmit} isPending={isPending} />
      )}
      onCreate={(d) => create.mutateAsync(d)}
      onUpdate={(id, d) => update.mutateAsync({ id, data: d })}
      onDelete={(id) => remove.mutateAsync(id)}
    />
  );
}
