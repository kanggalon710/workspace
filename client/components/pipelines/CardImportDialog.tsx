import { useState, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useImportCards } from "@/hooks/usePipelines";
import type { PipelineField } from "@shared/schema";
import { Upload, FileSpreadsheet, X, AlertTriangle, CheckCircle2 } from "lucide-react";

// ---------------------------------------------------------------------------
// CSV parser - handles quoted fields (adapted from ExportImportPage)
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
        i++;
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
        if (ch === "\r") i++;
      } else {
        field += ch;
      }
    }
  }

  current.push(field);
  if (current.some((c) => c.trim() !== "")) lines.push(current);

  const [headers, ...rows] = lines;
  return { headers: headers ?? [], rows };
}

// ---------------------------------------------------------------------------
// Mapping targets
// ---------------------------------------------------------------------------

type MappingTarget =
  | "skip"
  | "title"
  | "stage"
  | "assignee"
  | "priority"
  | `f_${number}`;

interface MappingOption {
  value: MappingTarget;
  label: string;
}

function buildOptions(fields: PipelineField[]): MappingOption[] {
  return [
    { value: "skip", label: "Abaikan" },
    { value: "title", label: "Judul" },
    { value: "stage", label: "Stage" },
    { value: "assignee", label: "Assignee" },
    { value: "priority", label: "Prioritas" },
    ...fields.map((f) => ({ value: `f_${f.id}` as MappingTarget, label: `Field: ${f.label}` })),
  ];
}

/** Try to auto-map a header name to a target. */
function autoMap(header: string, fields: PipelineField[]): MappingTarget {
  const h = header.toLowerCase().trim();
  if (h === "judul" || h === "title") return "title";
  if (h === "stage") return "stage";
  if (h === "assignee" || h === "penugasan") return "assignee";
  if (h === "prioritas" || h === "priority") return "priority";
  for (const f of fields) {
    if (f.label.toLowerCase() === h) return `f_${f.id}`;
  }
  return "skip";
}

// ---------------------------------------------------------------------------
// Import result type
// ---------------------------------------------------------------------------

interface ImportResult {
  created: number;
  skipped: number;
  errors: { index: number; reason: string }[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  pipelineId: number;
  fields: PipelineField[];
  open: boolean;
  onClose: () => void;
}

export function CardImportDialog({ pipelineId, fields, open, onClose }: Props) {
  const importMutation = useImportCards(pipelineId);

  const [parsed, setParsed] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [mapping, setMapping] = useState<MappingTarget[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const options = buildOptions(fields);

  const handleFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        if (!text) return;
        const p = parseCSV(text);
        setParsed(p);
        setResult(null);
        setMapping(p.headers.map((h) => autoMap(h, fields)));
      };
      reader.readAsText(file);
    },
    [fields],
  );

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

  const reset = () => {
    setParsed(null);
    setMapping([]);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const titleCount = mapping.filter((m) => m === "title").length;
  const canSubmit = parsed != null && parsed.rows.length > 0 && titleCount === 1;

  const handleSubmit = async () => {
    if (!parsed || !canSubmit) return;

    const rows = parsed.rows.map((row) => {
      let title: string | undefined;
      let stage: string | undefined;
      let assignee: string | undefined;
      let priority: string | undefined;
      const values: Record<string, string> = {};

      mapping.forEach((target, colIdx) => {
        const cell = row[colIdx]?.trim() ?? "";
        if (target === "skip") return;
        if (target === "title") title = cell;
        else if (target === "stage") stage = cell;
        else if (target === "assignee") assignee = cell;
        else if (target === "priority") priority = cell;
        else if (target.startsWith("f_")) {
          const fieldId = target.slice(2);
          values[fieldId] = cell;
        }
      });

      return { title, stage, assignee, priority, values };
    });

    try {
      const res = await importMutation.mutateAsync(rows);
      setResult(res as unknown as ImportResult);
    } catch (err: any) {
      setResult({ created: 0, skipped: 0, errors: [{ index: -1, reason: err.message ?? "Terjadi kesalahan" }] });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-2xl dialog-w max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-5 text-primary" aria-hidden="true" />
            Import Kartu dari CSV
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Result panel */}
          {result && (
            <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="size-4 text-success shrink-0" aria-hidden="true" />
                <span>
                  Dibuat{" "}
                  <strong className="text-success">{result.created}</strong>
                  {result.skipped > 0 && (
                    <>, dilewati <strong className="text-warning">{result.skipped}</strong></>
                  )}
                </span>
              </div>
              {result.errors.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-destructive flex items-center gap-1">
                    <AlertTriangle className="size-3" aria-hidden="true" />
                    {result.errors.length} baris bermasalah:
                  </p>
                  <ul className="max-h-36 overflow-y-auto text-xs text-muted-foreground space-y-0.5" aria-label="Daftar error import">
                    {result.errors.map((e) => (
                      <li key={e.index}>
                        {e.index >= 0 ? `Baris ${e.index + 2}: ` : ""}{e.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <Button size="sm" variant="outline" onClick={handleClose}>Selesai</Button>
            </div>
          )}

          {/* File upload area */}
          {!result && (
            <>
              {!parsed ? (
                <div
                  role="button"
                  aria-label="Unggah file CSV - seret ke sini atau klik untuk memilih"
                  className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors ${isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
                >
                  <Upload className="size-8 text-muted-foreground" aria-hidden="true" />
                  <p className="text-sm text-muted-foreground text-center">
                    Seret file CSV ke sini atau klik untuk memilih
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    className="sr-only"
                    aria-label="Pilih file CSV"
                    onChange={onFileChange}
                  />
                </div>
              ) : (
                <>
                  {/* File loaded - show mapping UI */}
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">
                      <strong>{parsed.rows.length}</strong> baris ditemukan · {parsed.headers.length} kolom
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={reset}
                      aria-label="Ganti file"
                    >
                      <X className="size-4 mr-1" aria-hidden="true" />
                      Ganti file
                    </Button>
                  </div>

                  {/* Column mapping */}
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium mb-2">Pemetaan kolom</legend>
                    {parsed.headers.map((header, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="w-24 sm:w-36 shrink-0 truncate text-sm text-muted-foreground font-mono" title={header}>
                          {header || `(Kolom ${i + 1})`}
                        </span>
                        <span className="text-muted-foreground" aria-hidden="true">→</span>
                        <Select
                          value={mapping[i] ?? "skip"}
                          onValueChange={(val) => {
                            const next = [...mapping];
                            next[i] = val as MappingTarget;
                            setMapping(next);
                          }}
                        >
                          <SelectTrigger className="flex-1 h-8 text-sm" aria-label={`Pemetaan untuk kolom ${header || i + 1}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {options.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </fieldset>

                  {titleCount !== 1 && (
                    <p className="text-xs text-destructive flex items-center gap-1" role="alert">
                      <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />
                      {titleCount === 0
                        ? "Pilih tepat satu kolom sebagai Judul untuk melanjutkan."
                        : "Hanya satu kolom yang boleh dipetakan ke Judul."}
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!result && parsed && (
          <div className="px-6 py-4 border-t border-border/40 shrink-0 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleClose}>
              Batal
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!canSubmit || importMutation.isPending}
              onClick={handleSubmit}
              aria-disabled={!canSubmit}
            >
              {importMutation.isPending ? "Mengimpor…" : `Import ${parsed.rows.length} baris`}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
