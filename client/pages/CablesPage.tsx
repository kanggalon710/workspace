import { useCables } from "@/hooks/useAssets";
import { AssetTable, type ColumnDef } from "@/components/shared/AssetTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { useEffect } from "react";
import type { Cable, InsertCable } from "@shared/schema";

const columns: ColumnDef<Cable>[] = [
  { key: "code", label: "Kode" },
  { key: "name", label: "Nama" },
  { key: "cableType", label: "Tipe" },
  {
    key: "core", label: "Core",
    render: (item) => `${item.usedCore ?? 0}/${item.totalCore ?? 0}`,
  },
  {
    key: "tube", label: "Tube",
    render: (item) => `${item.usedTube ?? 0}/${item.totalTube ?? 0}`,
  },
  {
    key: "lengthMeters", label: "Panjang",
    render: (item) => item.lengthMeters ? `${item.lengthMeters}m` : "-",
  },
  { key: "status", label: "Status" },
];

function CableForm({
  item, onSubmit, isPending,
}: {
  item: Cable | null;
  onSubmit: (data: InsertCable) => void;
  isPending: boolean;
}) {
  const { register, handleSubmit, reset } = useForm<InsertCable>();

  useEffect(() => {
    if (item) {
      reset({
        name: item.name,
        code: item.code,
        cableType: (item.cableType ?? "") as any,
        totalCore: item.totalCore ?? 0,
        usedCore: item.usedCore ?? 0,
        totalTube: item.totalTube ?? 0,
        usedTube: item.usedTube ?? 0,
        lengthMeters: item.lengthMeters ?? undefined,
        startPoint: item.startPoint ?? "",
        endPoint: item.endPoint ?? "",
        pathCoordinates: item.pathCoordinates ?? "",
        status: item.status ?? "active",
        notes: item.notes ?? "",
      });
    } else {
      reset({ name: "", code: "", status: "active", totalCore: 0, usedCore: 0, totalTube: 0, usedTube: 0 });
    }
  }, [item, reset]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Nama Kabel</Label>
          <Input {...register("name")} required placeholder="Kabel Feeder POP-ODC1" />
        </div>
        <div className="space-y-2">
          <Label>Kode</Label>
          <Input {...register("code")} required placeholder="KBL-001" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Tipe Kabel</Label>
        <select {...register("cableType")} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
          <option value="">Pilih tipe...</option>
          <option value="feeder">Feeder</option>
          <option value="distribution">Distribution</option>
          <option value="drop">Drop</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Total Core</Label>
          <Input {...register("totalCore", { valueAsNumber: true })} type="number" />
        </div>
        <div className="space-y-2">
          <Label>Core Terpakai</Label>
          <Input {...register("usedCore", { valueAsNumber: true })} type="number" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Total Tube</Label>
          <Input {...register("totalTube", { valueAsNumber: true })} type="number" />
        </div>
        <div className="space-y-2">
          <Label>Tube Terpakai</Label>
          <Input {...register("usedTube", { valueAsNumber: true })} type="number" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Panjang (meter)</Label>
        <Input {...register("lengthMeters", { valueAsNumber: true })} type="number" step="0.1" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Titik Awal (JSON)</Label>
          <Input {...register("startPoint")} placeholder='{"type":"pop","id":1}' />
        </div>
        <div className="space-y-2">
          <Label>Titik Akhir (JSON)</Label>
          <Input {...register("endPoint")} placeholder='{"type":"odc","id":1}' />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Path Coordinates (JSON array)</Label>
        <Textarea {...register("pathCoordinates")} placeholder='[[-7.22,107.90],[-7.23,107.91]]' rows={3} />
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
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Menyimpan..." : item ? "Update" : "Simpan"}
      </Button>
    </form>
  );
}

export default function CablesPage() {
  const { data, isLoading, create, update, remove } = useCables();

  return (
    <AssetTable<Cable>
      title="Kabel"
      description="Data kabel fiber optik - core/tube usage tracking"
      data={data}
      isLoading={isLoading}
      columns={columns}
      renderForm={(item, onSubmit, isPending) => (
        <CableForm item={item} onSubmit={onSubmit} isPending={isPending} />
      )}
      onCreate={(d) => create.mutateAsync(d)}
      onUpdate={(id, d) => update.mutateAsync({ id, data: d })}
      onDelete={(id) => remove.mutateAsync(id)}
    />
  );
}
