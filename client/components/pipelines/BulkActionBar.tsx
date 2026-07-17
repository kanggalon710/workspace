/**
 * BulkActionBar — shown when selectMode is active and at least one card is selected.
 * Mobile-first: bar is fixed-bottom on mobile, the op forms open as a BottomSheet on mobile
 * and as a Dialog on desktop.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Check, X, UserCog, ArrowRightLeft, Pencil, Tag, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { FieldValueInput } from "@/components/pipelines/FieldValueInput";
import { AssigneePicker } from "./AssigneePicker";
import { BULK_MAX_CARDS } from "@shared/bulkCardOps";
import { useBulkCardAction, type BulkResult } from "@/hooks/usePipelines";
import type { PipelineStage, PipelineField } from "@shared/schema";

type OpSheet = "assign" | "move" | "set_field" | "tag" | "delete" | null;

interface BulkActionBarProps {
  pipelineId: number;
  selectedIds: Set<number>;
  /** Pipeline capabilities (e.g. ["assign","cards","export"]). Empty = no restriction. */
  caps: string[];
  stages: PipelineStage[];
  fields: PipelineField[];
  onClear: () => void;
}

// ─── Op form sub-component ───────────────────────────────────────────────────

interface BulkOpFormProps {
  sheet: Exclude<OpSheet, null>;
  stages: PipelineStage[];
  fields: PipelineField[];
  pending: boolean;
  onCancel: () => void;
  onRun: (op: string, payload: any, overwrite?: boolean) => void;
}

function BulkOpForm({ sheet, stages, fields, pending, onCancel, onRun }: BulkOpFormProps) {
  const [assigneeVal, setAssigneeVal] = useState<string>("");
  const [stageVal, setStageVal] = useState<string>("");
  const [fieldVal, setFieldVal] = useState<string>("");
  const [fieldValue, setFieldValue] = useState<string>("");
  const [overwrite, setOverwrite] = useState(true);
  const [tagInput, setTagInput] = useState<string>("");

  const stageOptions = stages.map((s) => ({ value: String(s.id), label: s.label }));
  const fieldOptions = fields.map((f) => ({ value: String(f.id), label: f.label, description: f.type }));

  const selectedField = fields.find((f) => String(f.id) === fieldVal);

  if (sheet === "assign") {
    return (
      <div className="space-y-4">
        <AssigneePicker mode="single" includeUnassign value={assigneeVal} onChange={setAssigneeVal} placeholder="Pilih penugasan..." />
        <Button
          className="w-full"
          disabled={pending || assigneeVal === ""}
          onClick={() => onRun("assign", { assigneeId: assigneeVal === "__unassign__" ? null : Number(assigneeVal) })}
        >
          {pending ? "Memproses..." : "Assign"}
        </Button>
      </div>
    );
  }

  if (sheet === "move") {
    return (
      <div className="space-y-4">
        <Combobox
          options={stageOptions}
          value={stageVal}
          onChange={setStageVal}
          placeholder="Pilih stage tujuan..."
          searchPlaceholder="Cari stage..."
        />
        <Button
          className="w-full"
          disabled={pending || stageVal === ""}
          onClick={() => onRun("move", { stageId: Number(stageVal) })}
        >
          {pending ? "Memproses..." : "Pindah"}
        </Button>
      </div>
    );
  }

  if (sheet === "set_field") {
    return (
      <div className="space-y-4">
        <Combobox
          options={fieldOptions}
          value={fieldVal}
          onChange={(v) => {
            setFieldVal(v);
            // Seed a type-appropriate default so the input + apply work for every type
            // (checkbox is "0"/"1", never empty; others start blank).
            const f = fields.find((x) => String(x.id) === v);
            setFieldValue(f?.type === "checkbox" ? "0" : "");
          }}
          placeholder="Pilih field..."
          searchPlaceholder="Cari field..."
        />
        {selectedField && (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-medium">
              Nilai baru untuk <strong>{selectedField.label}</strong>
            </label>
            {/* Type-aware input: date picker, number, currency, dropdown, user picker, etc. */}
            <FieldValueInput field={selectedField} value={fieldValue} onChange={setFieldValue} />
          </div>
        )}
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Switch checked={overwrite} onCheckedChange={setOverwrite} />
          <span>Timpa nilai yang sudah terisi</span>
        </label>
        <Button
          className="w-full"
          disabled={pending || fieldVal === "" || fieldValue === ""}
          onClick={() => onRun("set_field", { fieldId: Number(fieldVal), value: fieldValue }, overwrite)}
        >
          {pending ? "Memproses..." : "Simpan Field"}
        </Button>
      </div>
    );
  }

  if (sheet === "tag") {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">Tag</label>
          <Input
            inputSize="sm"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="Nama tag..."
            maxLength={64}
          />
        </div>
        <div className="flex gap-2">
          <Button
            className="flex-1"
            disabled={pending || tagInput.trim() === ""}
            onClick={() => onRun("add_tag", { tag: tagInput.trim() })}
          >
            <Tag className="size-3.5 mr-1" />
            {pending ? "Memproses..." : "Tambah Tag"}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            disabled={pending || tagInput.trim() === ""}
            onClick={() => onRun("remove_tag", { tag: tagInput.trim() })}
          >
            <X className="size-3.5 mr-1" />
            Hapus Tag
          </Button>
        </div>
      </div>
    );
  }

  if (sheet === "delete") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Semua kartu yang dipilih akan dihapus secara permanen. Tindakan ini tidak dapat dibatalkan.
        </p>
        <Button
          variant="outline"
          className="w-full border-destructive text-destructive hover:bg-destructive/10"
          disabled={pending}
          onClick={() => onRun("delete", undefined)}
        >
          <Trash2 className="size-3.5 mr-1" />
          {pending ? "Menghapus..." : "Konfirmasi Hapus"}
        </Button>
        <Button variant="ghost" className="w-full" onClick={onCancel} disabled={pending}>
          Batal
        </Button>
      </div>
    );
  }

  return null;
}

// ─── Titles for op sheets ────────────────────────────────────────────────────
const OP_TITLE: Record<Exclude<OpSheet, null>, string> = {
  assign: "Assign Massal",
  move: "Pindah Stage",
  set_field: "Isi Field",
  tag: "Kelola Tag",
  delete: "Hapus Kartu",
};

// ─── Main bar ────────────────────────────────────────────────────────────────

export function BulkActionBar({
  pipelineId,
  selectedIds,
  caps,
  stages,
  fields,
  onClear,
}: BulkActionBarProps) {
  const bulk = useBulkCardAction(pipelineId);
  const [runAutomation, setRunAutomation] = useState(false);
  const [sheet, setSheet] = useState<OpSheet>(null);
  const ids = Array.from(selectedIds);

  if (ids.length === 0) return null;

  const can = (c: string) => caps.length === 0 || caps.includes(c);
  const overCap = ids.length > BULK_MAX_CARDS;

  const run = (op: string, payload: any, overwrite?: boolean) =>
    bulk.mutate(
      { op, cardIds: ids, payload, runAutomation, overwrite },
      {
        onSuccess: (r: BulkResult) => {
          const msg =
            `${r.succeeded} sukses` +
            (r.failed.length
              ? ` · ${r.failed.length} gagal: ${r.failed
                  .slice(0, 3)
                  .map((f) => f.reason)
                  .join(", ")}`
              : "");
          if (r.failed.length) {
            toast.warning(msg);
          } else {
            toast.success(msg);
          }
          setSheet(null);
          onClear();
        },
        onError: (e: any) => toast.error(e?.message || "Bulk action gagal"),
      },
    );

  return (
    <>
      {/* Action bar. Mobile: float ABOVE the bottom nav (.bottom-nav is fixed bottom-0 z-30, ~75px
          tall) so the action buttons aren't covered by it. Desktop: sticky bottom-0 (no nav there). */}
      <div
        role="toolbar"
        aria-label="Bulk actions"
        className="fixed md:sticky bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] md:bottom-0 inset-x-0 z-40 bg-sky-600 text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 shadow-elev-lg"
      >
        {/* Count + over-cap warning */}
        <span className="text-sm font-semibold flex items-center gap-1.5">
          <Check className="size-4" aria-hidden="true" />
          {ids.length} kartu dipilih
          {overCap && (
            <em className="ml-2 text-amber-200 not-italic text-xs">
              — maks {BULK_MAX_CARDS}
            </em>
          )}
        </span>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Automation toggle */}
          <label className="flex items-center gap-1 text-xs cursor-pointer select-none">
            <Switch
              checked={runAutomation}
              onCheckedChange={setRunAutomation}
              aria-label="Jalankan otomasi"
            />
            <Zap className="size-3.5" aria-hidden="true" />
            Otomasi
          </label>

          {can("assign") && (
            <Button
              size="sm"
              variant="secondary"
              className="h-8"
              disabled={overCap || bulk.isPending}
              onClick={() => setSheet("assign")}
              aria-label="Assign massal"
            >
              <UserCog className="size-3.5 mr-1" aria-hidden="true" />
              Assign
            </Button>
          )}
          {can("cards") && (
            <Button
              size="sm"
              variant="secondary"
              className="h-8"
              disabled={overCap || bulk.isPending}
              onClick={() => setSheet("move")}
              aria-label="Pindah stage"
            >
              <ArrowRightLeft className="size-3.5 mr-1" aria-hidden="true" />
              Pindah
            </Button>
          )}
          {can("cards") && (
            <Button
              size="sm"
              variant="secondary"
              className="h-8"
              disabled={overCap || bulk.isPending}
              onClick={() => setSheet("set_field")}
              aria-label="Isi field massal"
            >
              <Pencil className="size-3.5 mr-1" aria-hidden="true" />
              Field
            </Button>
          )}
          {can("cards") && (
            <Button
              size="sm"
              variant="secondary"
              className="h-8"
              disabled={overCap || bulk.isPending}
              onClick={() => setSheet("tag")}
              aria-label="Kelola tag"
            >
              <Tag className="size-3.5 mr-1" aria-hidden="true" />
              Tag
            </Button>
          )}
          {can("cards") && (
            <Button
              size="sm"
              variant="secondary"
              className="h-8"
              disabled={overCap || bulk.isPending}
              onClick={() => setSheet("delete")}
              aria-label="Hapus kartu terpilih"
            >
              <Trash2 className="size-3.5 mr-1" aria-hidden="true" />
              Hapus
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-white hover:bg-white/15"
            onClick={onClear}
            aria-label="Batal pilih"
          >
            <X className="size-3.5 mr-1" aria-hidden="true" />
            Batal
          </Button>
        </div>
      </div>

      {/* Op form — BottomSheet on mobile (< md), Dialog on desktop */}
      {sheet && (
        <>
          {/* Mobile: BottomSheet */}
          <div className="md:hidden">
            <BottomSheet
              open={!!sheet}
              onClose={() => setSheet(null)}
              title={OP_TITLE[sheet]}
              height="sm"
            >
              <BulkOpForm
                sheet={sheet}
                stages={stages}
                fields={fields}
                pending={bulk.isPending}
                onCancel={() => setSheet(null)}
                onRun={run}
              />
            </BottomSheet>
          </div>

          {/* Desktop: Dialog */}
          <div className="hidden md:block">
            <Dialog open={!!sheet} onOpenChange={(open) => { if (!open) setSheet(null); }}>
              <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{OP_TITLE[sheet]}</DialogTitle>
                </DialogHeader>
                <BulkOpForm
                  sheet={sheet}
                  stages={stages}
                  fields={fields}
                  pending={bulk.isPending}
                  onCancel={() => setSheet(null)}
                  onRun={run}
                />
                <DialogFooter>
                  <Button variant="ghost" size="sm" onClick={() => setSheet(null)} disabled={bulk.isPending}>
                    Tutup
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </>
      )}
    </>
  );
}
