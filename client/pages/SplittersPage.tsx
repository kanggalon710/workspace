import { useSplitters, usePops, useOdcs, useOdps } from "@/hooks/useAssets";
import { AssetTable, type ColumnDef } from "@/components/shared/AssetTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { useEffect, useState } from "react";
import type { Splitter, InsertSplitter } from "@shared/schema";

const RATIOS = ["1:2", "1:4", "1:8", "1:16", "1:32"] as const;
const LOCATION_TYPES = ["otb", "odc", "odp", "field"] as const;
const LOCATION_TYPE_LABELS: Record<string, string> = {
  otb: "OTB",
  odc: "ODC",
  odp: "ODP",
  field: "Lapangan",
};

const columns: ColumnDef<Splitter>[] = [
  { key: "name", label: "Nama" },
  {
    key: "ratio",
    label: "Rasio",
    render: (item) => <Badge variant="secondary">{item.ratio}</Badge>,
  },
  {
    key: "locationType",
    label: "Lokasi",
    render: (item) =>
      `${LOCATION_TYPE_LABELS[item.locationType] ?? item.locationType} #${item.locationId}`,
  },
  { key: "status", label: "Status" },
];

function SplitterForm({
  item,
  onSubmit,
  isPending,
}: {
  item: Splitter | null;
  onSubmit: (data: InsertSplitter) => void;
  isPending: boolean;
}) {
  const { register, handleSubmit, reset, setValue, watch } = useForm<InsertSplitter>();
  const locationType = watch("locationType");

  const { data: pops } = usePops();
  const { data: odcs } = useOdcs();
  const { data: odps } = useOdps();

  const [currentLocationType, setCurrentLocationType] = useState<string>(
    item?.locationType ?? "otb"
  );

  useEffect(() => {
    if (item) {
      reset({
        name: item.name,
        ratio: item.ratio,
        locationType: item.locationType,
        locationId: item.locationId,
        inputCoreId: item.inputCoreId ?? undefined,
        lat: item.lat ?? undefined,
        lng: item.lng ?? undefined,
        status: item.status ?? "active",
        notes: item.notes ?? "",
      });
      setCurrentLocationType(item.locationType);
    } else {
      reset({
        name: "",
        ratio: "1:8",
        locationType: "otb",
        locationId: 0,
        status: "active",
      });
      setCurrentLocationType("otb");
    }
  }, [item, reset]);

  useEffect(() => {
    if (locationType) {
      setCurrentLocationType(locationType);
    }
  }, [locationType]);

  const locationOptions = (() => {
    switch (currentLocationType) {
      case "otb":
        return pops?.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` })) ?? [];
      case "odc":
        return odcs?.map((o) => ({ value: o.id, label: `${o.code} — ${o.name}` })) ?? [];
      case "odp":
        return odps?.map((o) => ({ value: o.id, label: `${o.code} — ${o.name}` })) ?? [];
      default:
        return [];
    }
  })();

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label>Nama Splitter</Label>
        <Input {...register("name")} required placeholder="SPL-ODC01-01" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Rasio</Label>
          <select
            {...register("ratio")}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
          >
            {RATIOS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <select
            {...register("status")}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
          >
            <option value="active">Active</option>
            <option value="maintenance">Maintenance</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Tipe Lokasi</Label>
          <select
            {...register("locationType")}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
          >
            {LOCATION_TYPES.map((lt) => (
              <option key={lt} value={lt}>
                {LOCATION_TYPE_LABELS[lt]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Lokasi</Label>
          {currentLocationType === "field" ? (
            <Input
              {...register("locationId", { valueAsNumber: true })}
              type="number"
              placeholder="ID lokasi lapangan"
              required
            />
          ) : (
            <select
              {...register("locationId", { valueAsNumber: true })}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              required
            >
              <option value="">Pilih lokasi...</option>
              {locationOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Input Core ID (opsional)</Label>
        <Input
          {...register("inputCoreId", { valueAsNumber: true })}
          type="number"
          placeholder="ID core input"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Latitude</Label>
          <Input
            {...register("lat", { valueAsNumber: true })}
            type="number"
            step="any"
            placeholder="-7.22"
          />
        </div>
        <div className="space-y-2">
          <Label>Longitude</Label>
          <Input
            {...register("lng", { valueAsNumber: true })}
            type="number"
            step="any"
            placeholder="107.90"
          />
        </div>
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

export default function SplittersPage() {
  const { data, isLoading, create, update, remove } = useSplitters();

  return (
    <AssetTable<Splitter>
      title="Splitter"
      description="Splitter optik — pembagi sinyal di jaringan FTTH"
      data={data}
      isLoading={isLoading}
      columns={columns}
      renderForm={(item, onSubmit, isPending) => (
        <SplitterForm item={item} onSubmit={onSubmit} isPending={isPending} />
      )}
      onCreate={(d) => create.mutateAsync(d)}
      onUpdate={(id, d) => update.mutateAsync({ id, data: d })}
      onDelete={(id) => remove.mutateAsync(id)}
    />
  );
}
