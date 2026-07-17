import { useState, useRef, useCallback } from "react";
import { usePops, useOdcs, useOdps, useCustomers, useCables, useCableCores, useOtbs, useCoreConnections } from "@/hooks/useAssets";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Radio, Box, CircleDot, Users, Cable, Cpu, Server, Link2,
  Download, Upload, FileSpreadsheet, FileJson, AlertTriangle, Check,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// CSV parser – handles quoted fields
// ---------------------------------------------------------------------------

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++; // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        current.push(field);
        field = "";
      } else if (ch === "\n" || (ch === "\r" && next === "\n")) {
        current.push(field);
        field = "";
        if (current.some((c) => c.trim() !== "")) lines.push(current);
        current = [];
        if (ch === "\r") i++; // skip \n after \r
      } else {
        field += ch;
      }
    }
  }

  // flush last field / line
  current.push(field);
  if (current.some((c) => c.trim() !== "")) lines.push(current);

  const [headers, ...rows] = lines;
  return { headers: headers ?? [], rows };
}

// ---------------------------------------------------------------------------
// Entity config
// ---------------------------------------------------------------------------

interface EntityConfig {
  key: string;
  label: string;
  icon: React.ElementType;
  exportPath: string;
}

const ENTITIES: EntityConfig[] = [
  { key: "pops", label: "POP", icon: Radio, exportPath: "/api/export/pops" },
  { key: "odcs", label: "ODC", icon: Box, exportPath: "/api/export/odcs" },
  { key: "odps", label: "ODP", icon: CircleDot, exportPath: "/api/export/odps" },
  { key: "customers", label: "Pelanggan", icon: Users, exportPath: "/api/export/customers" },
  { key: "cables", label: "Kabel", icon: Cable, exportPath: "/api/export/cables" },
  { key: "cable-cores", label: "Cable Core", icon: Cpu, exportPath: "/api/export/cable-cores" },
  { key: "otbs", label: "OTB", icon: Server, exportPath: "/api/export/otbs" },
  { key: "core-connections", label: "Koneksi Core", icon: Link2, exportPath: "/api/export/core-connections" },
];

// ---------------------------------------------------------------------------
// Hooks helper – get record counts
// ---------------------------------------------------------------------------

function useRecordCounts(): Record<string, number | undefined> {
  const pops = usePops();
  const odcs = useOdcs();
  const odps = useOdps();
  const customers = useCustomers();
  const cables = useCables();
  const cableCores = useCableCores();
  const otbs = useOtbs();
  const coreConnections = useCoreConnections();

  return {
    pops: pops.data?.length,
    odcs: odcs.data?.length,
    odps: odps.data?.length,
    customers: customers.data?.length,
    cables: cables.data?.length,
    "cable-cores": cableCores.data?.length,
    otbs: otbs.data?.length,
    "core-connections": coreConnections.data?.length,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ExportImportPage() {
  const counts = useRecordCounts();

  // Import state
  const [importEntity, setImportEntity] = useState<string>("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- File handling ----

  const handleFile = useCallback((file: File) => {
    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        const result = parseCSV(text);
        setParsed(result);
      }
    };
    reader.readAsText(file);
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const clearImport = () => {
    setCsvFile(null);
    setParsed(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ---- Import submit ----

  const handleImport = async () => {
    if (!importEntity) {
      toast.error("Pilih jenis entitas terlebih dahulu");
      return;
    }
    if (!parsed || parsed.rows.length === 0) {
      toast.error("Tidak ada data untuk diimpor");
      return;
    }

    // Convert rows to array of objects keyed by headers
    const records = parsed.rows.map((row) => {
      const obj: Record<string, string> = {};
      parsed.headers.forEach((h, i) => {
        obj[h.trim()] = row[i]?.trim() ?? "";
      });
      return obj;
    });

    setIsImporting(true);
    try {
      await api.post(`/import/${importEntity}`, records);
      toast.success(`Berhasil mengimpor ${records.length} baris ke ${ENTITIES.find((e) => e.key === importEntity)?.label ?? importEntity}`);
      clearImport();
    } catch (err: any) {
      toast.error(err.message ?? "Gagal mengimpor data");
    } finally {
      setIsImporting(false);
    }
  };

  // ---- Export full report ----

  const handleExportFullReport = () => {
    window.open("/api/export/full-report", "_blank");
  };

  return (
    <div className="space-y-8">
      {/* ============================================================= */}
      {/* EXPORT SECTION                                                 */}
      {/* ============================================================= */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Export Data</h2>
            <p className="text-muted-foreground">Unduh data dalam format CSV per entitas atau laporan lengkap JSON.</p>
          </div>
          <Button variant="outline" onClick={handleExportFullReport}>
            <FileJson className="mr-2 h-4 w-4" />
            Export Laporan Lengkap (JSON)
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ENTITIES.map((entity) => {
            const Icon = entity.icon;
            const count = counts[entity.key];
            return (
              <Card key={entity.key} className="flex flex-col justify-between">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{entity.label}</CardTitle>
                      <CardDescription>
                        {count !== undefined ? (
                          <Badge variant="secondary">{count} record</Badge>
                        ) : (
                          <Badge variant="outline">memuat...</Badge>
                        )}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="default"
                    size="sm"
                    className="w-full"
                    onClick={() => window.open(entity.exportPath, "_blank")}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export CSV
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* ============================================================= */}
      {/* IMPORT SECTION                                                 */}
      {/* ============================================================= */}
      <section>
        <div className="mb-6">
          <h2 className="text-2xl font-bold tracking-tight">Import Data</h2>
          <p className="text-muted-foreground">Unggah file CSV untuk mengimpor data ke entitas yang dipilih.</p>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-6">
            {/* Entity selector */}
            <div className="space-y-2 max-w-sm">
              <Label>Jenis Entitas</Label>
              <Select value={importEntity} onValueChange={setImportEntity}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih entitas..." />
                </SelectTrigger>
                <SelectContent>
                  {ENTITIES.map((entity) => {
                    const Icon = entity.icon;
                    return (
                      <SelectItem key={entity.key} value={entity.key}>
                        <span className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          {entity.label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Drag & drop area */}
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`
                flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 cursor-pointer transition-colors
                ${isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"}
              `}
            >
              <Upload className="h-10 w-10 text-muted-foreground" />
              {csvFile ? (
                <div className="text-center">
                  <p className="font-medium flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4" />
                    {csvFile.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {parsed ? `${parsed.headers.length} kolom, ${parsed.rows.length} baris` : "Memproses..."}
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="font-medium">Seret file CSV ke sini atau klik untuk memilih</p>
                  <p className="text-sm text-muted-foreground">Format: .csv</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={onFileChange}
              />
            </div>

            {/* Preview table */}
            {parsed && parsed.rows.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Preview (5 baris pertama)</Label>
                  <Button variant="ghost" size="sm" onClick={clearImport}>
                    Hapus
                  </Button>
                </div>
                <div className="rounded-md border overflow-auto max-h-80">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted">
                        {parsed.headers.map((h, i) => (
                          <th key={i} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.rows.slice(0, 5).map((row, ri) => (
                        <tr key={ri} className="border-t">
                          {row.map((cell, ci) => (
                            <td key={ci} className="px-3 py-2 whitespace-nowrap max-w-[200px] truncate">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parsed.rows.length > 5 && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Menampilkan 5 dari {parsed.rows.length} baris
                  </p>
                )}
              </div>
            )}

            {/* Import button */}
            <div className="flex gap-3">
              <Button
                onClick={handleImport}
                disabled={isImporting || !parsed || !importEntity}
              >
                {isImporting ? (
                  "Mengimpor..."
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Import Data
                  </>
                )}
              </Button>
              {csvFile && (
                <Button variant="outline" onClick={clearImport}>
                  Batal
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
