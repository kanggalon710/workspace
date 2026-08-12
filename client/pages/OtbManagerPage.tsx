import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useOtbs, useCoreConnections, useCoreConnectionsByEntity } from "@/hooks/useAssets";
import { usePops } from "@/hooks/useAssets";
import { useForm } from "react-hook-form";
import type { Otb, InsertOtb, Pop } from "@shared/schema";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Search, Box, Eye, Link2, ChevronRight, Info } from "lucide-react";
import { getStatusBadgeVariant, getUsagePercentage } from "@/lib/utils";
import { toast } from "sonner";

// --- Core port status types ---
type CoreStatus = "available" | "used" | "reserved" | "broken";

const coreStatusColors: Record<CoreStatus, string> = {
  available: "bg-green-500",
  used: "bg-red-500",
  reserved: "bg-yellow-500",
  broken: "bg-gray-400",
};

const coreStatusLabels: Record<CoreStatus, string> = {
  available: "Tersedia",
  used: "Terpakai",
  reserved: "Direservasi",
  broken: "Rusak",
};

// Build core statuses from real core_connections data
function buildCoreStatuses(totalCores: number, usedPorts: Set<number>): CoreStatus[] {
  const statuses: CoreStatus[] = [];
  for (let i = 1; i <= totalCores; i++) {
    statuses.push(usedPorts.has(i) ? "used" : "available");
  }
  return statuses;
}

// --- OTB Form ---
function OtbForm({
  item,
  pops,
  onSubmit,
  isPending,
}: {
  item: Otb | null;
  pops: Pop[];
  onSubmit: (data: InsertOtb) => void;
  isPending: boolean;
}) {
  const { register, handleSubmit, reset, setValue, watch } = useForm<InsertOtb>();
  const watchedPopId = watch("popId");
  const watchedTotalCores = watch("totalCores");
  const watchedStatus = watch("status");

  useEffect(() => {
    if (item) {
      reset({
        name: item.name,
        popId: item.popId,
        totalCores: item.totalCores,
        status: item.status ?? "active",
        notes: item.notes ?? "",
      });
    } else {
      reset({ name: "", popId: undefined as any, totalCores: 12, status: "active", notes: "" });
    }
  }, [item, reset]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label>Nama OTB</Label>
        <Input {...register("name")} required placeholder="OTB-POP01-A" />
      </div>

      <div className="space-y-2">
        <Label>POP</Label>
        <Select
          value={watchedPopId?.toString() ?? ""}
          onValueChange={(v) => setValue("popId", parseInt(v))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Pilih POP" />
          </SelectTrigger>
          <SelectContent>
            {pops.map((pop) => (
              <SelectItem key={pop.id} value={pop.id.toString()}>
                {pop.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Total Core</Label>
        <Select
          value={watchedTotalCores?.toString() ?? "12"}
          onValueChange={(v) => setValue("totalCores", parseInt(v))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Pilih jumlah core" />
          </SelectTrigger>
          <SelectContent>
            {[12, 24, 48, 96].map((n) => (
              <SelectItem key={n} value={n.toString()}>
                {n} Core
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Status</Label>
        <Select
          value={watchedStatus ?? "active"}
          onValueChange={(v) => setValue("status", v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
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

// --- Core Port Grid ---
function CorePortGrid({ totalCores, otbId, otbName }: { totalCores: number; otbId: number; otbName: string }) {
  const { data: connections } = useCoreConnectionsByEntity("otb", otbId);

  const usedPorts = useMemo(() => {
    const ports = new Set<number>();
    connections?.forEach((conn) => {
      if (conn.fromType === "otb" && conn.fromId === otbId) ports.add(conn.fromPort);
      if (conn.toType === "otb" && conn.toId === otbId && conn.toPort) ports.add(conn.toPort);
    });
    return ports;
  }, [connections, otbId]);

  const cores = useMemo(() => buildCoreStatuses(totalCores, usedPorts), [totalCores, usedPorts]);

  const counts = useMemo(() => {
    const c: Record<CoreStatus, number> = { available: 0, used: 0, reserved: 0, broken: 0 };
    cores.forEach((s) => c[s]++);
    return c;
  }, [cores]);

  // Determine grid columns based on total
  const gridCols = totalCores <= 12 ? "grid-cols-6" : totalCores <= 24 ? "grid-cols-8" : "grid-cols-12";

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg">{otbName} - Layout Port</h3>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-sm">
        {(Object.keys(coreStatusColors) as CoreStatus[]).map((status) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-sm ${coreStatusColors[status]}`} />
            <span>
              {coreStatusLabels[status]} ({counts[status]})
            </span>
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className={`grid ${gridCols} gap-1.5`}>
        {cores.map((status, idx) => (
          <div
            key={idx}
            className={`aspect-square rounded-sm flex items-center justify-center text-[10px] font-mono text-white ${coreStatusColors[status]} cursor-default transition-transform hover:scale-110`}
            title={`Core ${idx + 1}: ${coreStatusLabels[status]}`}
          >
            {idx + 1}
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="text-sm text-muted-foreground">
        Terpakai: <span className="font-medium text-foreground">{counts.used}</span> / {totalCores} core
        {" | "}Tersedia: <span className="font-medium text-foreground">{counts.available}</span>
        {" | "}Reserved: <span className="font-medium text-foreground">{counts.reserved}</span>
        {" | "}Rusak: <span className="font-medium text-foreground">{counts.broken}</span>
      </div>
    </div>
  );
}

// --- Usage Bar ---
function UsageBar({ used, total }: { used: number; total: number }) {
  const pct = getUsagePercentage(used, total);
  const color = pct > 80 ? "bg-red-500" : pct > 50 ? "bg-yellow-500" : "bg-green-500";

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{used}/{total} core</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// --- Workflow Guide ---
const WORKFLOW_STEPS = [
  { step: 1, title: "POP", desc: "Daftarkan POP sebagai induk", menu: "Aset Jaringan → POP", color: "bg-blue-500" },
  { step: 2, title: "OTB", desc: "Tambah OTB di sini", menu: "OTB Manager (halaman ini)", color: "bg-indigo-500" },
  { step: 3, title: "Kabel", desc: "Daftarkan kabel fisik, core auto-generate", menu: "Aset Jaringan → Kabel", color: "bg-purple-500" },
  { step: 4, title: "Bestray", desc: "Tambah bestray/slot di POP", menu: "Core Management → Bestray", color: "bg-green-500" },
  { step: 5, title: "Splitter", desc: "Tambah splitter (1:4, 1:8, dst)", menu: "Core Management → Splitter", color: "bg-yellow-500" },
  { step: 6, title: "Koneksi Core", desc: "Hubungkan OTB → Bestray → Splitter → ODP → Pelanggan", menu: "Core Management → Koneksi Core", color: "bg-orange-500" },
];

function WorkflowGuide() {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900 overflow-hidden transition-all duration-300">
      <CardHeader className="pb-3 cursor-pointer select-none" onClick={() => setIsCollapsed(!isCollapsed)}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <CardTitle className="text-sm text-blue-800 dark:text-blue-300">
              Panduan Urutan Entry Data
            </CardTitle>
          </div>
          <button className="text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 p-1 rounded-full transition-colors">
            <svg
              className={`h-4 w-4 transform transition-transform duration-200 ${isCollapsed ? '' : 'rotate-180'}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </CardHeader>

      <div className={`transition-all duration-300 ease-in-out ${isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[500px] opacity-100'}`}>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            {WORKFLOW_STEPS.map((s, i) => (
              <div key={s.step} className="flex items-center gap-2">
                <div className="flex flex-col items-center text-center min-w-[90px]">
                  <div className={`${s.color} text-white rounded-lg px-3 py-1.5 w-full`}>
                    <div className="font-bold text-xs">{s.step}. {s.title}</div>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1 leading-tight max-w-[90px]">
                    {s.desc}
                  </div>
                </div>
                {i < WORKFLOW_STEPS.length - 1 && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mb-4" />
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-blue-700 dark:text-blue-400 mt-3">
             Gunakan tombol <strong>"Tambah Koneksi"</strong> di setiap kartu OTB untuk langsung membuat koneksi core dari OTB tersebut.
          </p>
        </CardContent>
      </div>
    </Card>
  );
}

// --- Main Page ---
export default function OtbManagerPage() {
  const { data: otbs, isLoading: otbsLoading, create, update, remove } = useOtbs();
  const { data: pops, isLoading: popsLoading } = usePops();
  const [, setLocation] = useLocation();

  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<Otb | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [viewOtb, setViewOtb] = useState<Otb | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [showGuide, setShowGuide] = useState(true);

  const isLoading = otbsLoading || popsLoading;

  // Build a POP lookup map
  const popMap = useMemo(() => {
    const m = new Map<number, Pop>();
    pops?.forEach((p) => m.set(p.id, p));
    return m;
  }, [pops]);

  // Fetch all core connections to calculate used ports per OTB
  const { data: allConnections } = useCoreConnections();

  const usedCoresMap = useMemo(() => {
    const m = new Map<number, number>();
    otbs?.forEach((otb) => m.set(otb.id, 0));
    allConnections?.forEach((conn) => {
      if (conn.fromType === "otb") {
        m.set(conn.fromId, (m.get(conn.fromId) ?? 0) + 1);
      }
      if (conn.toType === "otb" && conn.toPort) {
        m.set(conn.toId, (m.get(conn.toId) ?? 0) + 1);
      }
    });
    return m;
  }, [otbs, allConnections]);

  // Filter OTBs by search
  const filtered = useMemo(() => {
    if (!otbs) return [];
    if (!search) return otbs;
    const q = search.toLowerCase();
    return otbs.filter((otb) => {
      const popName = popMap.get(otb.popId)?.name ?? "";
      return (
        otb.name.toLowerCase().includes(q) ||
        popName.toLowerCase().includes(q) ||
        (otb.notes ?? "").toLowerCase().includes(q)
      );
    });
  }, [otbs, search, popMap]);

  // Group by POP
  const grouped = useMemo(() => {
    const groups = new Map<number, { pop: Pop | undefined; otbs: Otb[] }>();
    filtered.forEach((otb) => {
      if (!groups.has(otb.popId)) {
        groups.set(otb.popId, { pop: popMap.get(otb.popId), otbs: [] });
      }
      groups.get(otb.popId)!.otbs.push(otb);
    });
    return Array.from(groups.values()).sort((a, b) =>
      (a.pop?.name ?? "").localeCompare(b.pop?.name ?? "")
    );
  }, [filtered, popMap]);

  // Handlers
  const handleCreate = async (formData: InsertOtb) => {
    setIsPending(true);
    try {
      await create.mutateAsync(formData);
      toast.success("OTB berhasil ditambahkan");
      setFormOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Gagal menambahkan OTB");
    } finally {
      setIsPending(false);
    }
  };

  const handleUpdate = async (formData: InsertOtb) => {
    if (!editItem) return;
    setIsPending(true);
    try {
      await update.mutateAsync({ id: editItem.id, data: formData });
      toast.success("OTB berhasil diupdate");
      setEditItem(null);
    } catch (e: any) {
      toast.error(e.message || "Gagal mengupdate OTB");
    } finally {
      setIsPending(false);
    }
  };

  const handleDelete = async () => {
    if (deleteId === null) return;
    try {
      await remove.mutateAsync(deleteId);
      toast.success("OTB berhasil dihapus");
    } catch (e: any) {
      toast.error(e.message || "Gagal menghapus OTB");
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">OTB Manager</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Optical Termination Box - kelola port core di setiap POP
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)} className="shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          Tambah OTB
        </Button>
      </div>

      {/* Workflow Guide */}
      <WorkflowGuide />

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Cari OTB atau POP..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-5 bg-muted rounded w-32" />
                <div className="h-4 bg-muted rounded w-20 mt-2" />
              </CardHeader>
              <CardContent>
                <div className="h-2 bg-muted rounded w-full mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {search
              ? "Tidak ada OTB ditemukan untuk pencarian ini"
              : "Belum ada OTB. Klik \"Tambah OTB\" untuk memulai."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ pop, otbs: groupOtbs }) => (
            <div key={pop?.id ?? 0}>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Box className="h-5 w-5 text-muted-foreground" />
                {pop?.name ?? "POP Tidak Diketahui"}
                <Badge variant="outline" className="ml-1 font-normal">
                  {groupOtbs.length} OTB
                </Badge>
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {groupOtbs.map((otb) => {
                  const used = usedCoresMap.get(otb.id) ?? 0;
                  return (
                    <Card
                      key={otb.id}
                      className="hover:shadow-md transition-shadow cursor-pointer group"
                      onClick={() => setViewOtb(otb)}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-base">{otb.name}</CardTitle>
                            <CardDescription>{otb.totalCores} Core</CardDescription>
                          </div>
                          <Badge variant={getStatusBadgeVariant(otb.status ?? "active")}>
                            {otb.status ?? "active"}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <UsageBar used={used} total={otb.totalCores} />

                        {otb.notes && (
                          <p className="text-xs text-muted-foreground line-clamp-2">{otb.notes}</p>
                        )}

                        {/* Action buttons */}
                        <div className="flex items-center gap-1 pt-1 opacity-0 group-hover:opacity-100 transition-opacity flex-wrap">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewOtb(otb);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Port
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-primary hover:text-primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              setLocation(`/core-connections?fromType=otb&fromId=${otb.id}&autoOpen=1`);
                            }}
                          >
                            <Link2 className="h-4 w-4 mr-1" />
                            Koneksi
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Edit OTB"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditItem(otb);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Hapus OTB"
                            className="text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteId(otb.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Total */}
      <p className="text-xs text-muted-foreground">
        Total: {filtered.length} OTB di {grouped.length} POP
      </p>

      {/* Create Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tambah OTB</DialogTitle>
            <DialogDescription>Isi form di bawah untuk menambah OTB baru</DialogDescription>
          </DialogHeader>
          <OtbForm item={null} pops={pops ?? []} onSubmit={handleCreate} isPending={isPending} />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit OTB</DialogTitle>
            <DialogDescription>Ubah data OTB</DialogDescription>
          </DialogHeader>
          <OtbForm item={editItem} pops={pops ?? []} onSubmit={handleUpdate} isPending={isPending} />
        </DialogContent>
      </Dialog>

      {/* Port Detail Dialog */}
      <Dialog open={!!viewOtb} onOpenChange={(open) => !open && setViewOtb(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detail Port OTB</DialogTitle>
            <DialogDescription>
              {viewOtb && popMap.get(viewOtb.popId)?.name} - {viewOtb?.name}
            </DialogDescription>
          </DialogHeader>
          {viewOtb && (
            <div className="space-y-4">
              <CorePortGrid totalCores={viewOtb.totalCores} otbId={viewOtb.id} otbName={viewOtb.name} />
              <div className="pt-2 border-t">
                <Button
                  className="w-full"
                  onClick={() => {
                    setViewOtb(null);
                    setLocation(`/core-connections?fromType=otb&fromId=${viewOtb.id}&autoOpen=1`);
                  }}
                >
                  <Link2 className="h-4 w-4 mr-2" />
                  Tambah Koneksi dari OTB ini
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus OTB?</AlertDialogTitle>
            <AlertDialogDescription>
              Data yang dihapus tidak dapat dikembalikan. Apakah Anda yakin?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
