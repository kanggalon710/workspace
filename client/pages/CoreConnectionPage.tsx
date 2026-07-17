import { useState, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import {
  useCoreConnections, useOtbs, useBestrays, useSplitters,
  useOdps, useCustomers, useCables, useCableCores,
} from "@/hooks/useAssets";
import type { CoreConnection, InsertCoreConnection } from "@shared/schema";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Search, X } from "lucide-react";

// ==================== TYPES ====================

type FromType = "otb" | "bestray" | "splitter_output" | "odp";
type ToType = "bestray" | "splitter_input" | "odp" | "customer";

const FROM_TYPE_OPTIONS: { value: FromType; label: string }[] = [
  { value: "otb", label: "OTB" },
  { value: "bestray", label: "Bestray" },
  { value: "splitter_output", label: "Splitter Output" },
  { value: "odp", label: "ODP" },
];

const TO_TYPE_OPTIONS: { value: ToType; label: string }[] = [
  { value: "bestray", label: "Bestray" },
  { value: "splitter_input", label: "Splitter Input" },
  { value: "odp", label: "ODP" },
  { value: "customer", label: "Pelanggan" },
];

// ==================== HELPER: Entity Name Resolver ====================

function useEntityNameResolver() {
  const { data: otbs } = useOtbs();
  const { data: bestrays } = useBestrays();
  const { data: splitters } = useSplitters();
  const { data: odps } = useOdps();
  const { data: customers } = useCustomers();

  const resolve = useCallback(
    (type: string, id: number): string => {
      switch (type) {
        case "otb": {
          const item = otbs?.find((o) => o.id === id);
          return item ? item.name : `OTB #${id}`;
        }
        case "bestray": {
          const item = bestrays?.find((b) => b.id === id);
          return item ? (item.label ?? `Slot ${item.slotNumber}`) : `Bestray #${id}`;
        }
        case "splitter_output":
        case "splitter_input": {
          const item = splitters?.find((s) => s.id === id);
          return item ? `${item.name} (${item.ratio})` : `Splitter #${id}`;
        }
        case "odp": {
          const item = odps?.find((o) => o.id === id);
          return item ? item.name : `ODP #${id}`;
        }
        case "customer": {
          const item = customers?.find((c) => c.id === id);
          return item ? item.name : `Pelanggan #${id}`;
        }
        default:
          return `#${id}`;
      }
    },
    [otbs, bestrays, splitters, odps, customers],
  );

  return resolve;
}

// ==================== VISUAL CONNECTION PATH ====================

function ConnectionPath({ connections }: { connections: CoreConnection[] }) {
  const counts = useMemo(() => {
    const fromTypes = connections.map((c) => c.fromType);
    const toTypes = connections.map((c) => c.toType);
    const all = [...fromTypes, ...toTypes];
    return {
      otb: new Set(connections.filter((c) => c.fromType === "otb").map((c) => c.fromId)).size,
      bestray: new Set([
        ...connections.filter((c) => c.fromType === "bestray").map((c) => c.fromId),
        ...connections.filter((c) => c.toType === "bestray").map((c) => c.toId),
      ]).size,
      splitter: new Set([
        ...connections.filter((c) => c.fromType === "splitter_output").map((c) => c.fromId),
        ...connections.filter((c) => c.toType === "splitter_input").map((c) => c.toId),
      ]).size,
      odp: new Set([
        ...connections.filter((c) => c.fromType === "odp").map((c) => c.fromId),
        ...connections.filter((c) => c.toType === "odp").map((c) => c.toId),
      ]).size,
      customer: new Set(connections.filter((c) => c.toType === "customer").map((c) => c.toId)).size,
    };
  }, [connections]);

  const nodes = [
    { label: "OTB", count: counts.otb, color: "bg-blue-500" },
    { label: "Bestray", count: counts.bestray, color: "bg-green-500" },
    { label: "Splitter", count: counts.splitter, color: "bg-yellow-500" },
    { label: "ODP", count: counts.odp, color: "bg-orange-500" },
    { label: "Pelanggan", count: counts.customer, color: "bg-red-500" },
  ];

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Hierarki Koneksi FTTH
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {nodes.map((node, i) => (
            <div key={node.label} className="flex items-center gap-2">
              <div className="flex flex-col items-center">
                <div
                  className={`${node.color} text-white rounded-lg px-4 py-2 text-center min-w-[90px]`}
                >
                  <div className="font-semibold text-sm">{node.label}</div>
                  <div className="text-xs opacity-90">{node.count} terhubung</div>
                </div>
              </div>
              {i < nodes.length - 1 && (
                <span className="text-muted-foreground text-lg font-bold">&rarr;</span>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ==================== CONNECTION FORM ====================

function ConnectionForm({
  item,
  onSubmit,
  isPending,
  defaultFromType,
  defaultFromId,
}: {
  item: CoreConnection | null;
  onSubmit: (data: InsertCoreConnection) => void;
  isPending: boolean;
  defaultFromType?: FromType;
  defaultFromId?: string;
}) {
  const { data: otbs } = useOtbs();
  const { data: bestrays } = useBestrays();
  const { data: splitters } = useSplitters();
  const { data: odps } = useOdps();
  const { data: customers } = useCustomers();
  const { data: cableCores } = useCableCores();

  const [label, setLabel] = useState(item?.label ?? "");
  const [fromType, setFromType] = useState<FromType>(
    (item?.fromType as FromType) ?? defaultFromType ?? "otb"
  );
  const [fromId, setFromId] = useState<string>(
    item?.fromId?.toString() ?? defaultFromId ?? ""
  );
  const [fromPort, setFromPort] = useState<string>(item?.fromPort?.toString() ?? "1");
  const [toType, setToType] = useState<ToType>((item?.toType as ToType) ?? "bestray");
  const [toId, setToId] = useState<string>(item?.toId?.toString() ?? "");
  const [toPort, setToPort] = useState<string>(item?.toPort?.toString() ?? "");
  const [cableCoreId, setCableCoreId] = useState<string>(item?.cableCoreId?.toString() ?? "");
  const [splitterId, setSplitterId] = useState<string>(item?.splitterId?.toString() ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");

  const fromOptions = useMemo(() => {
    switch (fromType) {
      case "otb":
        return (otbs ?? []).map((o) => ({ value: o.id.toString(), label: o.name }));
      case "bestray":
        return (bestrays ?? []).map((b) => ({
          value: b.id.toString(),
          label: b.label ?? `Slot ${b.slotNumber}`,
        }));
      case "splitter_output":
        return (splitters ?? []).map((s) => ({
          value: s.id.toString(),
          label: `${s.name} (${s.ratio})`,
        }));
      case "odp":
        return (odps ?? []).map((o) => ({ value: o.id.toString(), label: o.name }));
      default:
        return [];
    }
  }, [fromType, otbs, bestrays, splitters, odps]);

  const toOptions = useMemo(() => {
    switch (toType) {
      case "bestray":
        return (bestrays ?? []).map((b) => ({
          value: b.id.toString(),
          label: b.label ?? `Slot ${b.slotNumber}`,
        }));
      case "splitter_input":
        return (splitters ?? []).map((s) => ({
          value: s.id.toString(),
          label: `${s.name} (${s.ratio})`,
        }));
      case "odp":
        return (odps ?? []).map((o) => ({ value: o.id.toString(), label: o.name }));
      case "customer":
        return (customers ?? []).map((c) => ({
          value: c.id.toString(),
          label: `${c.name} (${c.customerId})`,
        }));
      default:
        return [];
    }
  }, [toType, bestrays, splitters, odps, customers]);

  const availableCores = useMemo(
    () => (cableCores ?? []).filter((c) => c.status === "available"),
    [cableCores],
  );

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromId || !toId) return;

    const data: InsertCoreConnection = {
      label: label || null,
      fromType,
      fromId: parseInt(fromId),
      fromPort: parseInt(fromPort) || 1,
      toType,
      toId: parseInt(toId),
      toPort: toPort ? parseInt(toPort) : null,
      cableCoreId: cableCoreId ? parseInt(cableCoreId) : null,
      splitterId: splitterId ? parseInt(splitterId) : null,
      notes: notes || null,
    };
    onSubmit(data);
  };

  return (
    <form onSubmit={handleFormSubmit} className="space-y-4">
      {/* Label */}
      <div className="space-y-2">
        <Label>Label (opsional)</Label>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Koneksi OTB-01 ke Bestray A"
        />
      </div>

      {/* FROM */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label>Tipe Asal</Label>
          <Select value={fromType} onValueChange={(v) => { setFromType(v as FromType); setFromId(""); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FROM_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Perangkat Asal</Label>
          <Select value={fromId} onValueChange={setFromId}>
            <SelectTrigger><SelectValue placeholder="Pilih..." /></SelectTrigger>
            <SelectContent>
              {fromOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Port Asal</Label>
          <Input
            type="number"
            min={1}
            value={fromPort}
            onChange={(e) => setFromPort(e.target.value)}
            required
          />
        </div>
      </div>

      {/* TO */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label>Tipe Tujuan</Label>
          <Select value={toType} onValueChange={(v) => { setToType(v as ToType); setToId(""); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TO_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Perangkat Tujuan</Label>
          <Select value={toId} onValueChange={setToId}>
            <SelectTrigger><SelectValue placeholder="Pilih..." /></SelectTrigger>
            <SelectContent>
              {toOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Port Tujuan (opsional)</Label>
          <Input
            type="number"
            min={1}
            value={toPort}
            onChange={(e) => setToPort(e.target.value)}
          />
        </div>
      </div>

      {/* Cable Core & Splitter */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Cable Core (opsional)</Label>
          <Select value={cableCoreId || "__none__"} onValueChange={(v) => setCableCoreId(v === "__none__" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Pilih core..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Tidak ada —</SelectItem>
              {availableCores.map((core) => (
                <SelectItem key={core.id} value={core.id.toString()}>
                  Tube {core.tubeNumber} / Core {core.coreNumber} ({core.coreColor})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Splitter (opsional)</Label>
          <Select value={splitterId || "__none__"} onValueChange={(v) => setSplitterId(v === "__none__" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Pilih splitter..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Tidak ada —</SelectItem>
              {(splitters ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id.toString()}>
                  {s.name} ({s.ratio})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label>Catatan</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Catatan tambahan..."
        />
      </div>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Menyimpan..." : item ? "Update Koneksi" : "Simpan Koneksi"}
      </Button>
    </form>
  );
}

// ==================== MAIN PAGE ====================

export default function CoreConnectionPage() {
  const { data: connections, isLoading, create, update, remove } = useCoreConnections();
  const resolveName = useEntityNameResolver();
  const { data: cableCores } = useCableCores();

  // Read URL params for pre-filling from OTB Manager shortcut
  const urlParams = new URLSearchParams(window.location.search);
  const preFromType = urlParams.get("fromType") as FromType | null;
  const preFromId = urlParams.get("fromId") ?? "";
  const autoOpen = urlParams.get("autoOpen") === "1";

  const [dialogOpen, setDialogOpen] = useState(autoOpen);
  const [editItem, setEditItem] = useState<CoreConnection | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CoreConnection | null>(null);

  const handleCreate = () => {
    setEditItem(null);
    setDialogOpen(true);
  };

  const handleEdit = (conn: CoreConnection) => {
    setEditItem(conn);
    setDialogOpen(true);
  };

  const handleSubmit = async (data: InsertCoreConnection) => {
    if (editItem) {
      await update.mutateAsync({ id: editItem.id, data });
    } else {
      await create.mutateAsync(data);
    }
    setDialogOpen(false);
    setEditItem(null);
  };

  const handleDelete = async () => {
    if (deleteTarget) {
      await remove.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");

  const getCableCoreName = (coreId: number | null) => {
    if (!coreId) return null;
    const core = cableCores?.find((c) => c.id === coreId);
    if (!core) return `Core #${coreId}`;
    return `T${core.tubeNumber}/C${core.coreNumber} (${core.coreColor})`;
  };

  const allConnections = connections ?? [];

  // Filter connections: if coming from OTB shortcut, auto-filter by that OTB
  const [activeFilter, setActiveFilter] = useState<{ type: string; id: string } | null>(
    preFromType && preFromId ? { type: preFromType, id: preFromId } : null
  );

  const list = useMemo(() => {
    let filtered = allConnections;
    // Apply entity filter
    if (activeFilter) {
      filtered = filtered.filter(
        (c) =>
          (c.fromType === activeFilter.type && c.fromId.toString() === activeFilter.id) ||
          (c.toType === activeFilter.type && c.toId.toString() === activeFilter.id)
      );
    }
    // Apply text search
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter((c) => {
        const fromName = resolveName(c.fromType, c.fromId).toLowerCase();
        const toName = resolveName(c.toType, c.toId).toLowerCase();
        const label = (c.label ?? "").toLowerCase();
        return fromName.includes(q) || toName.includes(q) || label.includes(q);
      });
    }
    return filtered;
  }, [allConnections, activeFilter, search, resolveName]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Koneksi Core</h1>
          <p className="text-muted-foreground text-sm">
            Pemetaan koneksi fiber core antar perangkat FTTH
          </p>
        </div>
        <Button onClick={handleCreate}>+ Tambah Koneksi</Button>
      </div>

      {/* Active Filter Notice */}
      {activeFilter && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-sm">
          <Badge variant="default" className="text-xs">
            Filter Aktif
          </Badge>
          <span>
            Menampilkan koneksi dari/ke{" "}
            <strong>
              {activeFilter.type.toUpperCase()} #{activeFilter.id}
              {" — "}{resolveName(activeFilter.type, parseInt(activeFilter.id))}
            </strong>
          </span>
          <button
            className="ml-auto text-muted-foreground hover:text-foreground"
            onClick={() => {
              setActiveFilter(null);
              setLocation("/core-connections");
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Visual Path */}
      <ConnectionPath connections={allConnections} />

      {/* Connection Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <CardTitle>
              Daftar Koneksi ({list.length}{activeFilter ? ` dari ${allConnections.length}` : ""})
            </CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari koneksi..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Memuat data...</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {search || activeFilter
                ? "Tidak ada koneksi yang sesuai filter."
                : "Belum ada koneksi. Klik \"+ Tambah Koneksi\" untuk memulai."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 pr-4 font-medium">Label</th>
                    <th className="pb-2 pr-4 font-medium">Dari</th>
                    <th className="pb-2 pr-4 font-medium">Ke</th>
                    <th className="pb-2 pr-4 font-medium">Cable Core</th>
                    <th className="pb-2 font-medium text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((conn) => (
                    <tr key={conn.id} className="border-b last:border-0">
                      <td className="py-3 pr-4">
                        {conn.label ? (
                          <span className="font-medium">{conn.label}</span>
                        ) : (
                          <span className="text-muted-foreground italic">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {conn.fromType.replace("_", " ").toUpperCase()}
                          </Badge>
                          <span>{resolveName(conn.fromType, conn.fromId)} :{conn.fromPort}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {conn.toType.replace("_", " ").toUpperCase()}
                          </Badge>
                          <span>
                            {resolveName(conn.toType, conn.toId)}
                            {conn.toPort != null ? ` :${conn.toPort}` : ""}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        {conn.cableCoreId ? (
                          <Badge variant="secondary" className="text-xs">
                            {getCableCoreName(conn.cableCoreId)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(conn)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => setDeleteTarget(conn)}
                          >
                            Hapus
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editItem ? "Edit Koneksi" : "Tambah Koneksi Baru"}
            </DialogTitle>
            <DialogDescription>
              {!editItem && preFromType && preFromId
                ? `Membuat koneksi dari ${preFromType.toUpperCase()} #${preFromId}. Pilih tujuan koneksi di bawah.`
                : "Hubungkan dua perangkat dengan menentukan port asal dan tujuan."}
            </DialogDescription>
          </DialogHeader>
          <ConnectionForm
            key={editItem?.id ?? "new"}
            item={editItem}
            onSubmit={handleSubmit}
            isPending={create.isPending || update.isPending}
            defaultFromType={!editItem && preFromType ? preFromType : undefined}
            defaultFromId={!editItem && preFromId ? preFromId : undefined}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Koneksi?</AlertDialogTitle>
            <AlertDialogDescription>
              Koneksi {deleteTarget?.label ? `"${deleteTarget.label}"` : `#${deleteTarget?.id}`} akan
              dihapus secara permanen. Tindakan ini tidak bisa dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
