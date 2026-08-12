import { useState, useEffect, useMemo, useCallback } from "react";
import { useSplitters, usePops, useOtbs, useOdps, useCoreConnections } from "@/hooks/useAssets";
import { useForm } from "react-hook-form";
import type { Splitter, InsertSplitter, Pop, Otb, Odp } from "@shared/schema";
import { POWER_BUDGET, calculatePowerBudget } from "@shared/schema";

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
import { Plus, Pencil, Trash2, Search, GitBranch, Zap, Calculator, Download, X, Info } from "lucide-react";
import { getStatusBadgeVariant } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ==================== CONSTANTS ====================

const SPLITTER_RATIOS = ["1:2", "1:4", "1:8", "1:16", "1:32"] as const;

const LOCATION_TYPES = [
  { value: "pop", label: "POP" },
  { value: "odc", label: "ODC" },
  { value: "odp", label: "ODP" },
  { value: "field", label: "Lapangan" },
] as const;

const SPLITTER_LOSS_LABELS: Record<string, string> = {
  "1:2": "3.5 dB",
  "1:4": "7.0 dB",
  "1:8": "10.5 dB",
  "1:16": "13.5 dB",
  "1:32": "17.0 dB",
};

const LEVEL_COLORS = [
  { bg: "bg-blue-50 dark:bg-blue-950/50", border: "border-blue-500", text: "text-blue-700 dark:text-blue-300", dot: "bg-blue-500", label: "POP" },
  { bg: "bg-indigo-50 dark:bg-indigo-950/50", border: "border-indigo-500", text: "text-indigo-700 dark:text-indigo-300", dot: "bg-indigo-500", label: "OTB" },
  { bg: "bg-purple-50 dark:bg-purple-950/50", border: "border-purple-500", text: "text-purple-700 dark:text-purple-300", dot: "bg-purple-500", label: "Splitter L1" },
  { bg: "bg-violet-50 dark:bg-violet-950/50", border: "border-violet-500", text: "text-violet-700 dark:text-violet-300", dot: "bg-violet-500", label: "Splitter L2" },
  { bg: "bg-fuchsia-50 dark:bg-fuchsia-950/50", border: "border-fuchsia-500", text: "text-fuchsia-700 dark:text-fuchsia-300", dot: "bg-fuchsia-500", label: "Splitter L3" },
  { bg: "bg-green-50 dark:bg-green-950/50", border: "border-green-500", text: "text-green-700 dark:text-green-300", dot: "bg-green-500", label: "ODP" },
];

// ==================== SPLITTER FORM ====================

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
  const watchedRatio = watch("ratio");
  const watchedLocationType = watch("locationType");
  const watchedStatus = watch("status");

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
    } else {
      reset({
        name: "",
        ratio: "1:8",
        locationType: "odc",
        locationId: 0,
        status: "active",
        notes: "",
      });
    }
  }, [item, reset]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label>Nama Splitter</Label>
        <Input {...register("name")} required placeholder="SPL-ODC01-01" />
      </div>

      <div className="space-y-2">
        <Label>Rasio</Label>
        <Select
          value={watchedRatio ?? "1:8"}
          onValueChange={(v) => setValue("ratio", v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Pilih rasio" />
          </SelectTrigger>
          <SelectContent>
            {SPLITTER_RATIOS.map((r) => (
              <SelectItem key={r} value={r}>
                {r} (loss: {SPLITTER_LOSS_LABELS[r]})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Tipe Lokasi</Label>
          <Select
            value={watchedLocationType ?? "odc"}
            onValueChange={(v) => setValue("locationType", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Pilih tipe" />
            </SelectTrigger>
            <SelectContent>
              {LOCATION_TYPES.map((lt) => (
                <SelectItem key={lt.value} value={lt.value}>
                  {lt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>ID Lokasi</Label>
          <Input
            type="number"
            {...register("locationId", { valueAsNumber: true })}
            required
            placeholder="ID"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Input Core ID (opsional)</Label>
        <Input
          type="number"
          {...register("inputCoreId", { valueAsNumber: true })}
          placeholder="ID cable core"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Latitude (opsional)</Label>
          <Input type="number" step="any" {...register("lat", { valueAsNumber: true })} placeholder="-6.xxx" />
        </div>
        <div className="space-y-2">
          <Label>Longitude (opsional)</Label>
          <Input type="number" step="any" {...register("lng", { valueAsNumber: true })} placeholder="106.xxx" />
        </div>
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

// ==================== CHAIN TREE VISUALIZATION ====================

type NodeType = "pop" | "otb" | "splitter" | "odp";

interface TreeNodeData {
  id: string;
  label: string;
  sublabel?: string;
  type: NodeType;
  ratio?: string;
  level: number;
  children: TreeNodeData[];
  entityId: number;
}

function buildChainTree(
  pops: Pop[],
  otbs: Otb[],
  splitters: Splitter[],
  odps: Odp[],
): TreeNodeData[] {
  // Group OTBs by POP
  const otbsByPop = new Map<number, Otb[]>();
  otbs.forEach((otb) => {
    const list = otbsByPop.get(otb.popId) || [];
    list.push(otb);
    otbsByPop.set(otb.popId, list);
  });

  // Group splitters by location
  const splittersByLocation = new Map<string, Splitter[]>();
  splitters.forEach((spl) => {
    const key = `${spl.locationType}:${spl.locationId}`;
    const list = splittersByLocation.get(key) || [];
    list.push(spl);
    splittersByLocation.set(key, list);
  });

  // Find child splitters: splitters whose inputCoreId points to a parent splitter id
  const childSplitterMap = new Map<number, Splitter[]>();
  splitters.forEach((spl) => {
    if (spl.inputCoreId) {
      const list = childSplitterMap.get(spl.inputCoreId) || [];
      list.push(spl);
      childSplitterMap.set(spl.inputCoreId, list);
    }
  });

  // Set of splitter IDs that are children (have inputCoreId pointing to another splitter)
  const childSplitterIds = new Set<number>();
  splitters.forEach((spl) => {
    if (spl.inputCoreId) childSplitterIds.add(spl.id);
  });

  // Build splitter subtree recursively
  function buildSplitterNode(spl: Splitter, level: number): TreeNodeData {
    const children: TreeNodeData[] = [];

    // Child splitters (next cascade level)
    const cascadeChildren = childSplitterMap.get(spl.id) || [];
    cascadeChildren.forEach((cs) => {
      children.push(buildSplitterNode(cs, level + 1));
    });

    // If this splitter is at an ODP location, show the ODP
    if (spl.locationType === "odp" && cascadeChildren.length === 0) {
      const odp = odps.find((o) => o.id === spl.locationId);
      if (odp) {
        children.push({
          id: `odp-from-spl-${spl.id}-${odp.id}`,
          label: odp.name,
          sublabel: odp.code,
          type: "odp",
          level: level + 1,
          children: [],
          entityId: odp.id,
        });
      }
    }

    // If no cascade children and not at ODP, check if there are ODPs connected through
    // splitters at "odc" or "field" - show ODPs that have splitters referencing this one
    if (cascadeChildren.length === 0 && spl.locationType !== "odp") {
      // Show ODPs that are served by splitters cascading from this one
      // Since there are no cascades, find ODPs at this location
      const odpSplitters = splitters.filter(
        (s) => s.locationType === "odp" && s.inputCoreId === spl.id,
      );
      odpSplitters.forEach((os) => {
        const odp = odps.find((o) => o.id === os.locationId);
        if (odp) {
          children.push({
            id: `odp-via-${os.id}-${odp.id}`,
            label: odp.name,
            sublabel: `via ${os.name} (${os.ratio})`,
            type: "odp",
            level: level + 1,
            children: [],
            entityId: odp.id,
          });
        }
      });
    }

    return {
      id: `splitter-${spl.id}`,
      label: spl.name,
      sublabel: `Splitter ${spl.ratio} - Loss ${POWER_BUDGET.splitterLoss[spl.ratio] ?? "?"} dB`,
      type: "splitter",
      ratio: spl.ratio,
      level,
      children,
      entityId: spl.id,
    };
  }

  // Build tree starting from POPs
  return pops.map((pop) => {
    const popOtbs = otbsByPop.get(pop.id) || [];

    const otbNodes: TreeNodeData[] = popOtbs.map((otb) => {
      // Root-level splitters at this POP (not children of other splitters)
      const popSplitters = (splittersByLocation.get(`pop:${pop.id}`) || [])
        .filter((s) => !childSplitterIds.has(s.id));

      const splitterNodes = popSplitters.map((spl) => buildSplitterNode(spl, 2));

      return {
        id: `otb-${otb.id}`,
        label: otb.name,
        sublabel: `${otb.totalCores} Core`,
        type: "otb" as const,
        level: 1,
        children: splitterNodes,
        entityId: otb.id,
      };
    });

    // Also include root-level splitters at ODC/ODP/field that are not nested under OTBs
    // These are shown directly under POP if no OTBs exist
    if (otbNodes.length === 0) {
      const allRootSplitters = splitters.filter((s) => !childSplitterIds.has(s.id));
      const splitterNodes = allRootSplitters.map((spl) => buildSplitterNode(spl, 1));
      if (splitterNodes.length > 0) {
        return {
          id: `pop-${pop.id}`,
          label: pop.name,
          sublabel: pop.code,
          type: "pop" as const,
          level: 0,
          children: splitterNodes,
          entityId: pop.id,
        };
      }
    }

    return {
      id: `pop-${pop.id}`,
      label: pop.name,
      sublabel: pop.code,
      type: "pop" as const,
      level: 0,
      children: otbNodes,
      entityId: pop.id,
    };
  });
}

function TreeNodeComponent({ node, isLast, onNodeClick }: { node: TreeNodeData; isLast: boolean; onNodeClick?: (node: TreeNodeData) => void }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;

  // Map node type to color index
  const colorIdx =
    node.type === "pop" ? 0
    : node.type === "otb" ? 1
    : node.type === "splitter" ? Math.min(node.level, 4)
    : LEVEL_COLORS.length - 1; // odp
  const colors = LEVEL_COLORS[colorIdx];

  return (
    <div className="relative">
      <div
        className={cn(
          "flex items-center gap-2 py-1.5 px-3 rounded-lg border-2 mb-1 transition-all",
          colors.bg, colors.border,
          hasChildren && "cursor-pointer hover:shadow-sm",
        )}
        onClick={(e) => {
          e.stopPropagation();
          if (hasChildren) setExpanded(!expanded);
          if (onNodeClick) onNodeClick(node);
        }}
      >
        {/* Expand indicator */}
        {hasChildren && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-background border text-[10px] font-bold text-muted-foreground shrink-0">
            {expanded ? "\u2212" : `+${node.children.length}`}
          </span>
        )}

        {node.type === "pop" && <Zap className={`h-4 w-4 shrink-0 ${colors.text}`} />}
        {node.type === "splitter" && <GitBranch className={`h-4 w-4 shrink-0 ${colors.text}`} />}

        <div className="flex-1 min-w-0">
          <span className={`text-sm font-medium ${colors.text}`}>{node.label}</span>
          {node.sublabel && (
            <span className="text-[11px] text-muted-foreground ml-2">{node.sublabel}</span>
          )}
        </div>

        {node.ratio && (
          <Badge variant="outline" className="text-[10px] shrink-0">
            {node.ratio}
          </Badge>
        )}
        <Badge variant="secondary" className="text-[10px] shrink-0">
          {node.type.toUpperCase()}
        </Badge>
      </div>

      {hasChildren && expanded && (
        <div className="ml-6 pl-4 border-l-2 border-dashed border-muted-foreground/30">
          {node.children.map((child, idx) => (
            <div key={child.id} className="relative pt-2">
              {/* Horizontal connector line */}
              <div className="absolute left-0 top-[18px] w-4 -ml-4 border-t-2 border-dashed border-muted-foreground/30" />
              {/* Connector dot */}
              <div className={cn(
                "absolute left-0 top-[15px] -ml-[5px] w-2.5 h-2.5 rounded-full border-2 border-background z-10",
                LEVEL_COLORS[Math.min(child.type === "odp" ? LEVEL_COLORS.length - 1 : child.type === "otb" ? 1 : Math.min(child.level, 4), LEVEL_COLORS.length - 1)].dot,
              )} />
              <TreeNodeComponent
                node={child}
                isLast={idx === node.children.length - 1}
                onNodeClick={onNodeClick}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChainTreeView({
  pops,
  otbs,
  splitters,
  odps,
}: {
  pops: Pop[];
  otbs: Otb[];
  splitters: Splitter[];
  odps: Odp[];
}) {
  const tree = useMemo(
    () => buildChainTree(pops, otbs, splitters, odps),
    [pops, otbs, splitters, odps],
  );

  const [selectedNode, setSelectedNode] = useState<TreeNodeData | null>(null);
  const treeRef = useCallback((el: HTMLDivElement | null) => {
    if (el) (window as any).__splitterTreeEl = el;
  }, []);

  const exportPNG = async () => {
    const el = (window as any).__splitterTreeEl as HTMLElement | null;
    if (!el) return;
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(el, { backgroundColor: null, scale: 2 });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = 'splitter_chain_diagram.png';
      a.click();
      toast.success('Diagram berhasil diexport sebagai PNG');
    } catch {
      toast.error('Gagal export PNG. Pastikan koneksi internet tersedia.');
    }
  };

  if (tree.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <div className="flex flex-col items-center gap-3">
            <GitBranch className="h-12 w-12 text-muted-foreground/30" />
            <p className="font-medium">Belum ada data untuk divisualisasikan.</p>
            <p className="text-sm">Tambahkan POP, OTB, dan Splitter terlebih dahulu.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="relative">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="h-5 w-5" />
                Visualisasi Rantai Splitter
              </CardTitle>
              <CardDescription>
                Alur sinyal: POP &rarr; OTB &rarr; Splitter &rarr; ODP &rarr; Pelanggan. Klik node untuk expand/collapse.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 shrink-0" onClick={exportPNG}>
              <Download className="h-3.5 w-3.5" />
              Export PNG
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Legend */}
          <div className="flex flex-wrap gap-3 mb-4 text-xs">
            {LEVEL_COLORS.map((c) => (
              <div key={c.label} className="flex items-center gap-1.5">
                <div className={cn("w-3 h-3 rounded-sm border-2", c.bg, c.border)} />
                <span>{c.label}</span>
              </div>
            ))}
          </div>

          <div className="space-y-2 overflow-x-auto" ref={treeRef}>
            <div className="min-w-[400px] pb-4">
              {tree.map((node, idx) => (
                <TreeNodeComponent key={node.id} node={node} isLast={idx === tree.length - 1} onNodeClick={setSelectedNode} />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Node Detail Side Panel */}
      {selectedNode && (
        <div className="fixed inset-y-0 right-0 w-80 max-w-full bg-background border-l shadow-2xl z-50 animate-in slide-in-from-right duration-200 overflow-y-auto">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="text-sm font-bold">Detail Node</h3>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Tutup detail" onClick={() => setSelectedNode(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Tipe</p>
              <Badge variant="secondary" className="mt-1">{selectedNode.type.toUpperCase()}</Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Nama</p>
              <p className="text-lg font-bold mt-1">{selectedNode.label}</p>
            </div>
            {selectedNode.sublabel && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Detail</p>
                <p className="text-sm mt-1">{selectedNode.sublabel}</p>
              </div>
            )}
            {selectedNode.ratio && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Rasio</p>
                <p className="text-sm font-mono font-bold mt-1">{selectedNode.ratio}</p>
                <p className="text-xs text-muted-foreground">Loss: {SPLITTER_LOSS_LABELS[selectedNode.ratio] || "?"}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Children</p>
              <p className="text-sm mt-1">
                {selectedNode.children.length > 0
                  ? `${selectedNode.children.length} sub-node (${selectedNode.children.map(c => c.type.toUpperCase()).join(', ')})`
                  : 'Tidak ada child - leaf node'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Level</p>
              <p className="text-sm mt-1">Level {selectedNode.level}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Entity ID</p>
              <p className="text-sm font-mono mt-1">#{selectedNode.entityId}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== POWER BUDGET CALCULATOR ====================

function PowerBudgetCalculator() {
  const [txPower, setTxPower] = useState(POWER_BUDGET.gponOutput);
  const [fiberKm, setFiberKm] = useState(5);
  const [connectors, setConnectors] = useState(4);
  const [splices, setSplices] = useState(2);
  const [selectedSplitters, setSelectedSplitters] = useState<string[]>(["1:4", "1:8"]);

  const addSplitter = useCallback((ratio: string) => {
    setSelectedSplitters((prev) => [...prev, ratio]);
  }, []);

  const removeSplitter = useCallback((index: number) => {
    setSelectedSplitters((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const result = useMemo(() => {
    return calculatePowerBudget({
      fiberKm,
      splices,
      connectors,
      splitters: selectedSplitters,
    });
  }, [fiberKm, splices, connectors, selectedSplitters]);

  // Running totals for each stage
  const stages = useMemo(() => {
    const items: { label: string; loss: number; runningPower: number }[] = [];
    let totalLoss = 0;

    items.push({ label: "TX Power (GPON OLT)", loss: 0, runningPower: txPower });

    const connLoss = connectors * POWER_BUDGET.connectorLoss;
    totalLoss += connLoss;
    items.push({
      label: `${connectors} Konektor (@ ${POWER_BUDGET.connectorLoss} dB)`,
      loss: connLoss,
      runningPower: txPower - totalLoss,
    });

    const fiberLoss = fiberKm * POWER_BUDGET.fiberLossPerKm;
    totalLoss += fiberLoss;
    items.push({
      label: `Fiber ${fiberKm} km (@ ${POWER_BUDGET.fiberLossPerKm} dB/km)`,
      loss: fiberLoss,
      runningPower: txPower - totalLoss,
    });

    if (splices > 0) {
      const spliceLoss = splices * POWER_BUDGET.spliceLoss;
      totalLoss += spliceLoss;
      items.push({
        label: `${splices} Sambungan/Splice (@ ${POWER_BUDGET.spliceLoss} dB)`,
        loss: spliceLoss,
        runningPower: txPower - totalLoss,
      });
    }

    selectedSplitters.forEach((ratio, idx) => {
      const loss = POWER_BUDGET.splitterLoss[ratio] || 0;
      totalLoss += loss;
      items.push({
        label: `Splitter ${idx + 1}: ${ratio}`,
        loss,
        runningPower: txPower - totalLoss,
      });
    });

    return items;
  }, [txPower, fiberKm, connectors, splices, selectedSplitters]);

  const statusColor =
    result.status === "ok"
      ? "text-green-600 dark:text-green-400"
      : result.status === "warning"
        ? "text-yellow-600 dark:text-yellow-400"
        : "text-red-600 dark:text-red-400";

  const statusBg =
    result.status === "ok"
      ? "bg-green-50 dark:bg-green-950/50 border-green-300"
      : result.status === "warning"
        ? "bg-yellow-50 dark:bg-yellow-950/50 border-yellow-300"
        : "bg-red-50 dark:bg-red-950/50 border-red-300";

  const statusLabel =
    result.status === "ok"
      ? "BAIK - Sinyal cukup kuat"
      : result.status === "warning"
        ? "PERINGATAN - Margin tipis"
        : "GAGAL - Sinyal terlalu lemah";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          Kalkulator Power Budget
        </CardTitle>
        <CardDescription>
          Hitung loss sinyal dari OLT ke pelanggan (standar GPON)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Inputs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label className="text-xs">TX Power (dBm)</Label>
            <Input
              type="number"
              step="0.1"
              value={txPower}
              onChange={(e) => setTxPower(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Jarak Fiber (km)</Label>
            <Input
              type="number"
              step="0.1"
              value={fiberKm}
              onChange={(e) => setFiberKm(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Jumlah Konektor</Label>
            <Input
              type="number"
              value={connectors}
              onChange={(e) => setConnectors(parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Jumlah Sambungan</Label>
            <Input
              type="number"
              value={splices}
              onChange={(e) => setSplices(parseInt(e.target.value) || 0)}
            />
          </div>
        </div>

        {/* Splitter chain */}
        <div className="space-y-2">
          <Label className="text-xs">Rantai Splitter</Label>
          <div className="flex flex-wrap gap-2">
            {selectedSplitters.map((ratio, idx) => (
              <Badge
                key={idx}
                variant="secondary"
                className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground transition-colors"
                onClick={() => removeSplitter(idx)}
              >
                {ratio} (-{POWER_BUDGET.splitterLoss[ratio]} dB) &times;
              </Badge>
            ))}
            <Select onValueChange={addSplitter}>
              <SelectTrigger className="w-40 h-7 text-xs">
                <SelectValue placeholder="+ Tambah splitter" />
              </SelectTrigger>
              <SelectContent>
                {SPLITTER_RATIOS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            Klik badge untuk menghapus splitter dari rantai
          </p>
        </div>

        {/* Running totals table */}
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left px-3 py-2 font-medium">Tahap</th>
                <th className="text-right px-3 py-2 font-medium">Loss (dB)</th>
                <th className="text-right px-3 py-2 font-medium">Daya (dBm)</th>
              </tr>
            </thead>
            <tbody>
              {stages.map((stage, idx) => {
                const powerColor =
                  stage.runningPower >= -22
                    ? "text-green-600 dark:text-green-400"
                    : stage.runningPower >= -25
                      ? "text-yellow-600 dark:text-yellow-400"
                      : "text-red-600 dark:text-red-400";
                return (
                  <tr key={idx} className="border-t">
                    <td className="px-3 py-2">{stage.label}</td>
                    <td className="text-right px-3 py-2 font-mono text-xs">
                      {idx === 0 ? "\u2014" : `-${stage.loss.toFixed(2)}`}
                    </td>
                    <td className={cn("text-right px-3 py-2 font-mono text-xs font-semibold", idx > 0 && powerColor)}>
                      {stage.runningPower.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Result card */}
        <div className={cn("rounded-md border p-4", statusBg)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Daya di Pelanggan (RX Power)</p>
              <p className={cn("text-2xl font-bold font-mono", statusColor)}>
                {result.rxPower.toFixed(2)} dBm
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium">Total Loss</p>
              <p className="text-xl font-bold font-mono">
                {result.totalLoss.toFixed(2)} dB
              </p>
            </div>
          </div>
          <p className={cn("text-sm mt-2 font-medium", statusColor)}>
            {statusLabel}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Batas: hijau &gt; -22 dBm | kuning -22 s/d -25 dBm | merah &lt; -25 dBm
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ==================== MAIN PAGE ====================

export default function SplitterChainPage() {
  const { data: splitters, isLoading: splittersLoading, create, update, remove } = useSplitters();
  const { data: pops, isLoading: popsLoading } = usePops();
  const { data: otbs, isLoading: otbsLoading } = useOtbs();
  const { data: odps, isLoading: odpsLoading } = useOdps();

  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<Splitter | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [activeTab, setActiveTab] = useState<"list" | "tree" | "budget">("list");

  const isLoading = splittersLoading || popsLoading || otbsLoading || odpsLoading;

  // Filter splitters
  const filtered = useMemo(() => {
    if (!splitters) return [];
    if (!search) return splitters;
    const q = search.toLowerCase();
    return splitters.filter(
      (spl) =>
        spl.name.toLowerCase().includes(q) ||
        spl.ratio.toLowerCase().includes(q) ||
        spl.locationType.toLowerCase().includes(q) ||
        (spl.notes ?? "").toLowerCase().includes(q),
    );
  }, [splitters, search]);

  // Group by location type
  const grouped = useMemo(() => {
    const groups = new Map<string, Splitter[]>();
    filtered.forEach((spl) => {
      const key = spl.locationType;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(spl);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const locationTypeLabel = (lt: string) =>
    LOCATION_TYPES.find((t) => t.value === lt)?.label ?? lt;

  // Handlers
  const handleCreate = async (formData: InsertSplitter) => {
    setIsPending(true);
    try {
      await create.mutateAsync(formData);
      toast.success("Splitter berhasil ditambahkan");
      setFormOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Gagal menambahkan splitter");
    } finally {
      setIsPending(false);
    }
  };

  const handleUpdate = async (formData: InsertSplitter) => {
    if (!editItem) return;
    setIsPending(true);
    try {
      await update.mutateAsync({ id: editItem.id, data: formData });
      toast.success("Splitter berhasil diupdate");
      setEditItem(null);
    } catch (e: any) {
      toast.error(e.message || "Gagal mengupdate splitter");
    } finally {
      setIsPending(false);
    }
  };

  const handleDelete = async () => {
    if (deleteId === null) return;
    try {
      await remove.mutateAsync(deleteId);
      toast.success("Splitter berhasil dihapus");
    } catch (e: any) {
      toast.error(e.message || "Gagal menghapus splitter");
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Splitter Chain Visualizer</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Rantai splitter - visualisasi alur sinyal dari POP ke pelanggan
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)} className="shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          Tambah Splitter
        </Button>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
        {([
          { key: "list", label: "Daftar Splitter" },
          { key: "tree", label: "Visualisasi Rantai" },
          { key: "budget", label: "Power Budget" },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0",
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* === Tab: Daftar Splitter === */}
      {activeTab === "list" && (
        <>
          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari splitter..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

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
                  ? "Tidak ada splitter ditemukan untuk pencarian ini"
                  : "Belum ada splitter. Klik \"Tambah Splitter\" untuk memulai."}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-8">
              {grouped.map(([locationType, groupSplitters]) => (
                <div key={locationType}>
                  <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <GitBranch className="h-5 w-5 text-muted-foreground" />
                    {locationTypeLabel(locationType)}
                    <Badge variant="outline" className="ml-1 font-normal">
                      {groupSplitters.length} Splitter
                    </Badge>
                  </h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {groupSplitters.map((spl) => (
                      <Card key={spl.id} className="hover:shadow-md transition-shadow group">
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between">
                            <div>
                              <CardTitle className="text-base">{spl.name}</CardTitle>
                              <CardDescription>
                                Rasio {spl.ratio} &middot; Loss {POWER_BUDGET.splitterLoss[spl.ratio] ?? "?"} dB
                              </CardDescription>
                            </div>
                            <Badge variant={getStatusBadgeVariant(spl.status ?? "active")}>
                              {spl.status ?? "active"}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex flex-wrap gap-1.5 text-xs">
                            <Badge variant="outline" className="font-normal">
                              {locationTypeLabel(spl.locationType)} #{spl.locationId}
                            </Badge>
                            {spl.inputCoreId && (
                              <Badge variant="outline" className="font-normal">
                                Input Core: #{spl.inputCoreId}
                              </Badge>
                            )}
                          </div>

                          {spl.notes && (
                            <p className="text-xs text-muted-foreground line-clamp-2">{spl.notes}</p>
                          )}

                          {/* Actions */}
                          <div className="flex items-center gap-1 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Edit splitter"
                              onClick={() => setEditItem(spl)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Hapus splitter"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleteId(spl.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Total: {filtered.length} splitter di {grouped.length} lokasi
          </p>
        </>
      )}

      {/* === Tab: Visualisasi Rantai === */}
      {activeTab === "tree" && (
        <ChainTreeView
          pops={pops ?? []}
          otbs={otbs ?? []}
          splitters={splitters ?? []}
          odps={odps ?? []}
        />
      )}

      {/* === Tab: Power Budget === */}
      {activeTab === "budget" && <PowerBudgetCalculator />}

      {/* Create Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tambah Splitter</DialogTitle>
            <DialogDescription>Isi form di bawah untuk menambah splitter baru</DialogDescription>
          </DialogHeader>
          <SplitterForm item={null} onSubmit={handleCreate} isPending={isPending} />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Splitter</DialogTitle>
            <DialogDescription>Ubah data splitter</DialogDescription>
          </DialogHeader>
          <SplitterForm item={editItem} onSubmit={handleUpdate} isPending={isPending} />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Splitter?</AlertDialogTitle>
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
