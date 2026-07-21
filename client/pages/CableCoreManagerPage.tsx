import { useState, useMemo } from "react";
import { useCables, useCableCoreByCable, useGenerateCableCores, useCableCores } from "@/hooks/useAssets";
import type { Cable, CableCore } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const colorMap: Record<string, string> = {
  "biru": "#3B82F6",
  "orange": "#F97316",
  "hijau": "#22C55E",
  "coklat": "#92400E",
  "abu-abu": "#9CA3AF",
  "putih": "#F9FAFB",
  "merah": "#EF4444",
  "hitam": "#1F2937",
  "kuning": "#EAB308",
  "ungu": "#8B5CF6",
  "pink": "#EC4899",
  "tosca": "#14B8A6",
};

function getCssColor(name: string): string {
  return colorMap[name.toLowerCase()] ?? "#6B7280";
}

function needsBorder(colorName: string): boolean {
  return ["putih", "abu-abu"].includes(colorName.toLowerCase());
}

export default function CableCoreManagerPage() {
  const { data: cables, isLoading: cablesLoading } = useCables();
  const [selectedCableId, setSelectedCableId] = useState<number | null>(null);
  const [selectedCore, setSelectedCore] = useState<CableCore | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const selectedCable = useMemo(
    () => cables?.find((c: Cable) => c.id === selectedCableId) ?? null,
    [cables, selectedCableId],
  );

  const { data: cores, isLoading: coresLoading } = useCableCoreByCable(selectedCableId);
  const generateCores = useGenerateCableCores();
  const { update: updateCore } = useCableCores();

  // Group cores by tube
  const tubeGroups = useMemo(() => {
    if (!cores) return [];
    const map = new Map<number, CableCore[]>();
    for (const core of cores) {
      const list = map.get(core.tubeNumber) ?? [];
      list.push(core);
      map.set(core.tubeNumber, list);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([tubeNumber, tubeCores]) => ({
        tubeNumber,
        tubeColor: tubeCores[0].tubeColor,
        cores: tubeCores.sort((a, b) => a.coreNumber - b.coreNumber),
      }));
  }, [cores]);

  // Stats
  const stats = useMemo(() => {
    if (!cores) return { total: 0, available: 0, used: 0, reserved: 0, broken: 0 };
    return {
      total: cores.length,
      available: cores.filter((c) => c.status === "available").length,
      used: cores.filter((c) => c.status === "used").length,
      reserved: cores.filter((c) => c.status === "reserved").length,
      broken: cores.filter((c) => c.status === "broken").length,
    };
  }, [cores]);

  const handleCoreClick = (core: CableCore) => {
    setSelectedCore(core);
    setEditStatus(core.status ?? "available");
    setEditNotes(core.notes ?? "");
  };

  const handleSaveCore = () => {
    if (!selectedCore) return;
    updateCore.mutateAsync({
      id: selectedCore.id,
      data: { status: editStatus, notes: editNotes },
    }).then(() => {
      setSelectedCore(null);
    });
  };

  const handleGenerate = () => {
    if (!selectedCable) return;
    generateCores.mutate({
      cableId: selectedCable.id,
      totalCore: selectedCable.totalCore ?? 0,
      totalTube: selectedCable.totalTube ?? 0,
    });
  };

  const hasCores = cores && cores.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Manajemen Core Kabel</h1>
        <p className="text-muted-foreground">
          Lihat dan kelola core fiber optik dalam setiap kabel
        </p>
      </div>

      {/* Cable selector */}
      <Card>
        <CardHeader>
          <CardTitle>Pilih Kabel</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <div className="flex-1">
            <Select
              value={selectedCableId?.toString() ?? ""}
              onValueChange={(val) => {
                setSelectedCableId(val ? Number(val) : null);
                setSelectedCore(null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={cablesLoading ? "Memuat..." : "Pilih kabel..."} />
              </SelectTrigger>
              <SelectContent>
                {cables?.map((cable: Cable) => (
                  <SelectItem key={cable.id} value={cable.id.toString()}>
                    {cable.code} - {cable.name} ({cable.totalCore ?? 0} core, {cable.totalTube ?? 0} tube)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedCable && !hasCores && (
            <Button
              onClick={handleGenerate}
              disabled={generateCores.isPending}
            >
              {generateCores.isPending ? "Generating..." : "Generate Cores"}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Stats bar */}
      {selectedCableId && hasCores && (
        <div className="grid grid-cols-5 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-xs text-muted-foreground">Total Core</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold text-green-500">{stats.available}</div>
              <div className="text-xs text-muted-foreground">Tersedia</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold text-blue-500">{stats.used}</div>
              <div className="text-xs text-muted-foreground">Terpakai</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold text-yellow-500">{stats.reserved}</div>
              <div className="text-xs text-muted-foreground">Reserved</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold text-red-500">{stats.broken}</div>
              <div className="text-xs text-muted-foreground">Rusak</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Loading state */}
      {selectedCableId && coresLoading && (
        <div className="text-center py-12 text-muted-foreground">Memuat data core...</div>
      )}

      {/* Tube/Core visual display */}
      {hasCores && (
        <div className="space-y-4">
          {tubeGroups.map((tube) => (
            <Card key={tube.tubeNumber}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-3 text-base">
                  <span
                    className="inline-block w-5 h-5 rounded-full border border-gray-300"
                    style={{ backgroundColor: getCssColor(tube.tubeColor) }}
                  />
                  Tube {tube.tubeNumber}
                  <Badge variant="outline" className="capitalize">
                    {tube.tubeColor}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {tube.cores.map((core) => {
                    const bg = getCssColor(core.coreColor);
                    const isUsed = core.status === "used";
                    const isReserved = core.status === "reserved";
                    const isBroken = core.status === "broken";
                    const isSelected = selectedCore?.id === core.id;

                    return (
                      <button
                        key={core.id}
                        onClick={() => handleCoreClick(core)}
                        className={`
                          relative w-10 h-10 rounded-full flex items-center justify-center
                          text-[10px] font-bold transition-all cursor-pointer
                          hover:scale-110 hover:shadow-md
                          ${isUsed ? "opacity-50" : ""}
                          ${isSelected ? "ring-2 ring-offset-2 ring-primary" : ""}
                        `}
                        style={{
                          backgroundColor: bg,
                          border: isBroken
                            ? "3px solid #EF4444"
                            : isReserved
                              ? "3px solid #EAB308"
                              : needsBorder(core.coreColor)
                                ? "2px solid #D1D5DB"
                                : "2px solid transparent",
                        }}
                        title={`Core ${core.globalCoreNumber} (${core.coreColor}) - ${core.status}`}
                      >
                        {/* Core number label */}
                        <span
                          className="select-none"
                          style={{
                            color: ["putih", "kuning", "abu-abu"].includes(core.coreColor.toLowerCase())
                              ? "#1F2937"
                              : "#FFFFFF",
                          }}
                        >
                          {core.coreNumber}
                        </span>

                        {/* Used checkmark overlay */}
                        {isUsed && (
                          <span className="absolute inset-0 flex items-center justify-center text-white text-lg font-bold drop-shadow">
                            ✓
                          </span>
                        )}

                        {/* Broken X overlay */}
                        {isBroken && (
                          <span className="absolute inset-0 flex items-center justify-center text-red-200 text-lg font-bold drop-shadow">

                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* No cable selected placeholder */}
      {!selectedCableId && (
        <div className="text-center py-16 text-muted-foreground">
          Pilih kabel dari dropdown di atas untuk melihat detail core.
        </div>
      )}

      {/* Cable selected but no cores and not loading */}
      {selectedCableId && !coresLoading && !hasCores && (
        <div className="text-center py-16 text-muted-foreground">
          Kabel ini belum memiliki data core. Klik tombol "Generate Cores" untuk membuat.
        </div>
      )}

      {/* Core detail dialog */}
      <Dialog open={!!selectedCore} onOpenChange={(open) => !open && setSelectedCore(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detail Core #{selectedCore?.globalCoreNumber}</DialogTitle>
          </DialogHeader>

          {selectedCore && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground text-xs">Tube</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className="inline-block w-4 h-4 rounded-full border border-gray-300"
                      style={{ backgroundColor: getCssColor(selectedCore.tubeColor) }}
                    />
                    <span className="font-medium">
                      Tube {selectedCore.tubeNumber}
                    </span>
                    <Badge variant="outline" className="capitalize text-xs">
                      {selectedCore.tubeColor}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Core</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className="inline-block w-4 h-4 rounded-full border border-gray-300"
                      style={{ backgroundColor: getCssColor(selectedCore.coreColor) }}
                    />
                    <span className="font-medium">
                      Core {selectedCore.coreNumber}
                    </span>
                    <Badge variant="outline" className="capitalize text-xs">
                      {selectedCore.coreColor}
                    </Badge>
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground text-xs">Global Core Number</Label>
                <div className="font-medium mt-1">{selectedCore.globalCoreNumber}</div>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Tersedia</SelectItem>
                    <SelectItem value="used">Terpakai</SelectItem>
                    <SelectItem value="reserved">Reserved</SelectItem>
                    <SelectItem value="broken">Rusak</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Catatan</Label>
                <Textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Tambahkan catatan..."
                  rows={3}
                />
              </div>

              <Button
                onClick={handleSaveCore}
                disabled={updateCore.isPending}
                className="w-full"
              >
                {updateCore.isPending ? "Menyimpan..." : "Simpan Perubahan"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
