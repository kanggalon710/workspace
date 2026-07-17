import { useState, useEffect } from "react";
import { useBestrays, useOdcs } from "@/hooks/useAssets";
import { useForm } from "react-hook-form";
import type { Bestray, InsertBestray, Odc } from "@shared/schema";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const statusLabels: Record<string, string> = {
  active: "Aktif",
  maintenance: "Pemeliharaan",
  inactive: "Nonaktif",
};

const statusColors: Record<string, string> = {
  active: "bg-green-500",
  maintenance: "bg-yellow-500",
  inactive: "bg-gray-400",
};

function BestrayForm({
  item,
  odcs,
  onSubmit,
  isPending,
}: {
  item: Bestray | null;
  odcs: Odc[];
  onSubmit: (data: InsertBestray) => void;
  isPending: boolean;
}) {
  const { register, handleSubmit, reset, setValue, watch } = useForm<InsertBestray>();
  const odcIdValue = watch("odcId");
  const totalPortsValue = watch("totalPorts");
  const statusValue = watch("status");

  useEffect(() => {
    if (item) {
      reset({
        odcId: item.odcId,
        slotNumber: item.slotNumber,
        label: item.label ?? "",
        totalPorts: item.totalPorts,
        status: item.status ?? "active",
        notes: item.notes ?? "",
      });
    } else {
      reset({
        odcId: undefined,
        slotNumber: 1,
        label: "",
        totalPorts: 12,
        status: "active",
        notes: "",
      });
    }
  }, [item, reset]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label>ODC</Label>
        <Select
          value={odcIdValue?.toString() ?? ""}
          onValueChange={(v) => setValue("odcId", Number(v))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Pilih ODC" />
          </SelectTrigger>
          <SelectContent>
            {odcs.map((odc) => (
              <SelectItem key={odc.id} value={odc.id.toString()}>
                {odc.name} ({odc.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Nomor Slot</Label>
          <Input
            {...register("slotNumber", { valueAsNumber: true })}
            type="number"
            min={1}
            required
            placeholder="1"
          />
        </div>
        <div className="space-y-2">
          <Label>Label</Label>
          <Input {...register("label")} placeholder="Slot A1" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Total Port</Label>
          <Select
            value={totalPortsValue?.toString() ?? "12"}
            onValueChange={(v) => setValue("totalPorts", Number(v))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Pilih jumlah port" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="4">4 Port</SelectItem>
              <SelectItem value="8">8 Port</SelectItem>
              <SelectItem value="12">12 Port</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            value={statusValue ?? "active"}
            onValueChange={(v) => setValue("status", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Pilih status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Aktif</SelectItem>
              <SelectItem value="maintenance">Pemeliharaan</SelectItem>
              <SelectItem value="inactive">Nonaktif</SelectItem>
            </SelectContent>
          </Select>
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

function BestrayCard({
  bestray,
  onEdit,
  onDelete,
}: {
  bestray: Bestray;
  onEdit: (b: Bestray) => void;
  onDelete: (id: number) => void;
}) {
  const status = bestray.status ?? "active";

  return (
    <Card className="w-48 shrink-0 cursor-pointer hover:shadow-md transition-shadow">
      <CardHeader className="p-3 pb-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground">
            Slot {bestray.slotNumber}
          </span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {bestray.totalPorts} port
          </Badge>
        </div>
        <CardTitle className="text-sm truncate">
          {bestray.label || `Slot ${bestray.slotNumber}`}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-1 space-y-2">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
          <span className="text-xs text-muted-foreground">
            {statusLabels[status] ?? status}
          </span>
        </div>

        {/* port usage indicator */}
        <div className="flex gap-0.5">
          {Array.from({ length: bestray.totalPorts }).map((_, i) => (
            <div
              key={i}
              className="h-1.5 flex-1 rounded-full bg-muted"
              title={`Port ${i + 1}`}
            />
          ))}
        </div>

        <div className="flex gap-1 pt-1">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-7 text-xs"
            onClick={() => onEdit(bestray)}
          >
            Edit
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="destructive"
                className="h-7 text-xs px-2"
              >
                Hapus
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Hapus Bestray?</AlertDialogTitle>
                <AlertDialogDescription>
                  Bestray "{bestray.label || `Slot ${bestray.slotNumber}`}" akan
                  dihapus secara permanen. Tindakan ini tidak dapat dibatalkan.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Batal</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(bestray.id)}>
                  Ya, Hapus
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

export default function BestrayManagerPage() {
  const { data: bestrays, isLoading, create, update, remove } = useBestrays();
  const { data: odcs } = useOdcs();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Bestray | null>(null);
  const [filterOdcId, setFilterOdcId] = useState<string>("all");

  const odcList = odcs ?? [];
  const bestrayList = bestrays ?? [];

  // group bestrays by ODC
  const grouped = bestrayList.reduce<Record<number, Bestray[]>>((acc, b) => {
    if (!acc[b.odcId]) acc[b.odcId] = [];
    acc[b.odcId].push(b);
    return acc;
  }, {});

  // sort each group by slotNumber
  for (const key of Object.keys(grouped)) {
    grouped[Number(key)].sort((a, b) => a.slotNumber - b.slotNumber);
  }

  const filteredOdcIds =
    filterOdcId === "all"
      ? Object.keys(grouped).map(Number)
      : [Number(filterOdcId)];

  function handleEdit(bestray: Bestray) {
    setEditItem(bestray);
    setDialogOpen(true);
  }

  function handleCreate() {
    setEditItem(null);
    setDialogOpen(true);
  }

  async function handleSubmit(data: InsertBestray) {
    if (editItem) {
      await update.mutateAsync({ id: editItem.id, data });
    } else {
      await create.mutateAsync(data);
    }
    setDialogOpen(false);
    setEditItem(null);
  }

  async function handleDelete(id: number) {
    await remove.mutateAsync(id);
  }

  const odcMap = odcList.reduce<Record<number, Odc>>((acc, o) => {
    acc[o.id] = o;
    return acc;
  }, {});

  if (isLoading) {
    return (
      <div className="p-6 text-center text-muted-foreground">Memuat data bestray...</div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bestray Manager</h1>
          <p className="text-sm text-muted-foreground">
            Kelola slot bestray di setiap ODC
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={filterOdcId} onValueChange={setFilterOdcId}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Filter ODC" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua ODC</SelectItem>
              {odcList.map((odc) => (
                <SelectItem key={odc.id} value={odc.id.toString()}>
                  {odc.name} ({odc.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleCreate}>+ Tambah Bestray</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editItem ? "Edit Bestray" : "Tambah Bestray Baru"}
                </DialogTitle>
              </DialogHeader>
              <BestrayForm
                item={editItem}
                odcs={odcList}
                onSubmit={handleSubmit}
                isPending={create.isPending || update.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Visual slot groups */}
      {filteredOdcIds.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Belum ada bestray. Klik "Tambah Bestray" untuk memulai.
          </CardContent>
        </Card>
      )}

      {filteredOdcIds.map((odcId) => {
        const odc = odcMap[odcId];
        const slots = grouped[odcId] ?? [];
        if (!odc && slots.length === 0) return null;

        return (
          <Card key={odcId}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {odc ? `${odc.name} (${odc.code})` : `ODC #${odcId}`}
                </CardTitle>
                <Badge variant="outline">{slots.length} slot</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {slots.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Belum ada slot bestray di ODC ini.
                </p>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {slots.map((b) => (
                    <BestrayCard
                      key={b.id}
                      bestray={b}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
