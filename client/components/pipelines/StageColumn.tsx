import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Trash2, GripVertical, ChevronLeft, ChevronRight, Move } from "lucide-react";
import type { PipelineStage, PipelineField } from "@shared/schema";
import type { PipelineCardWithValues } from "@/hooks/usePipelines";
import { BoardCard } from "./BoardCard";
import { AddInline } from "./AddInline";
import { isStalled } from "./boardCardMeta";
import { edgeScrollDelta } from "./dragScroll";
import { readableTextColor, overlayTint } from "./contrastColor";

const SWATCHES = ["#6B7280", "#3B82F6", "#8B5CF6", "#F59E0B", "#22C55E", "#EF4444"];

export function StageColumn({
  stage,
  cards,
  fields,
  usersById,
  writable,
  dragId,
  now,
  onDragStartCard,
  onDropStage,
  onCardClick,
  onAddCard,
  onUpdateStage,
  onDeleteStage,
  index = 0,
  total = 1,
  stageDragId = null,
  onStageDragStart,
  onStageDrop,
  onMoveStage,
  selectMode = false,
  selectedIds,
  onToggleCard,
  onToggleStage,
  stages: stageOptions,
  onMoveCard,
}: {
  stage: PipelineStage;
  cards: PipelineCardWithValues[];
  fields: PipelineField[];
  usersById: Map<number, { name?: string | null; username?: string | null }>;
  writable: boolean;
  dragId: number | null;
  now: Date;
  onDragStartCard: (cardId: number) => void;
  onDropStage: (stageId: number) => void;
  onCardClick: (cardId: number) => void;
  onAddCard: (stageId: number, title: string) => Promise<void>;
  onUpdateStage: (stageId: number, patch: { label: string; color: string; description: string | null }) => Promise<void>;
  onDeleteStage: (stageId: number) => Promise<void>;
  index?: number;
  total?: number;
  stageDragId?: number | null;
  onStageDragStart?: (id: number) => void;
  onStageDrop?: (targetId: number) => void;
  onMoveStage?: (id: number, dir: -1 | 1) => void;
  /** Selection mode - show checkboxes on cards and stage header. */
  selectMode?: boolean;
  selectedIds?: Set<number>;
  onToggleCard?: (id: number) => void;
  onToggleStage?: (ids: number[], on: boolean) => void;
  /** Untuk quick-move BoardCard - daftar stage + callback stabil (diteruskan apa adanya). */
  stages?: { id: number; label: string; color: string | null }[];
  onMoveCard?: (cardId: number, stageId: number) => void;
}) {
  const color = stage.color ?? "#6B7280";
  // Header stage = band berwarna (warna stage). Teks + chip menyesuaikan kontras otomatis.
  const headerText = readableTextColor(color);
  const headerTint = overlayTint(color);
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(stage.label);
  const [draftColor, setDraftColor] = useState(color);
  const [draftDesc, setDraftDesc] = useState(stage.description ?? "");
  const [cardOver, setCardOver] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const stalledCount = cards.filter((c) => isStalled(c.updatedAt ?? null, c.createdAt, now)).length;

  // Select-mode: derived values for stage-header checkbox
  const allStageSelected = selectMode && cards.length > 0 && cards.every((c) => selectedIds?.has(c.id));
  const someStageSelected = selectMode && !allStageSelected && cards.some((c) => selectedIds?.has(c.id));

  // Highlight the column only while a card (not a stage) is dragged over it.
  const isDropTarget = cardOver && dragId != null;

  return (
    <div
      className={`w-72 shrink-0 flex flex-col h-full min-h-0 rounded-xl p-3 transition-colors ${
        isDropTarget ? "bg-primary/10 ring-2 ring-primary/40" : "bg-muted/40"
      } ${stageDragId === stage.id ? "opacity-50" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (dragId != null) setCardOver(true);
      }}
      onDragLeave={() => setCardOver(false)}
      onDrop={() => {
        setCardOver(false);
        if (stageDragId != null && onStageDrop) onStageDrop(stage.id);
        else onDropStage(stage.id);
      }}
    >
      {/* Stage header - band berwarna (warna stage), teks & chip kontras-responsif */}
      <div
        className="flex items-center gap-1.5 mb-3 px-2 py-2 rounded-lg shrink-0 shadow-elev-sm"
        style={{ backgroundColor: color, color: headerText }}
      >
        {/* Select-mode: stage-header checkbox selects/deselects all cards in this stage */}
        {selectMode && (
          <Checkbox
            aria-label={`Pilih semua kartu di ${stage.label}`}
            checked={allStageSelected}
            indeterminate={someStageSelected}
            onChange={(e) => onToggleStage?.(cards.map((c) => c.id), e.target.checked)}
            className="shrink-0"
          />
        )}
        {writable && onStageDragStart && (
          <button
            type="button"
            draggable
            aria-label="Geser stage"
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", String(stage.id));
              onStageDragStart(stage.id);
            }}
            className="hidden md:flex items-center cursor-grab active:cursor-grabbing text-current opacity-60 hover:opacity-100 shrink-0"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        {writable && onMoveStage && (
          <button
            type="button"
            aria-label="Geser stage ke kiri"
            disabled={index <= 0}
            onClick={() => onMoveStage(stage.id, -1)}
            className="flex md:hidden items-center text-current opacity-80 disabled:opacity-30 shrink-0"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        <span
          className="text-sm font-bold uppercase tracking-wide flex-1 min-w-0 line-clamp-2 break-words leading-tight"
          title={stage.label}
        >
          {stage.label}
        </span>
        {stalledCount > 0 && (
          <span
            className="text-[11px] font-semibold rounded px-1.5 py-0.5 shrink-0"
            style={{ backgroundColor: headerTint }}
            title={`${stalledCount} kartu stagnan`}
          >
             {stalledCount}
          </span>
        )}
        <span
          className="text-xs font-bold tabular-nums rounded-full px-2 py-0.5 shrink-0"
          style={{ backgroundColor: headerTint }}
          title={`${cards.length} kartu`}
        >
          {cards.length}
        </span>
        {writable && onMoveStage && (
          <button
            type="button"
            aria-label="Geser stage ke kanan"
            disabled={index >= total - 1}
            onClick={() => onMoveStage(stage.id, 1)}
            className="flex md:hidden items-center text-current opacity-80 disabled:opacity-30 shrink-0"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
        {writable && (
          <button
            type="button"
            aria-label="Edit stage"
            className="flex items-center justify-center rounded-md size-7 text-current opacity-70 hover:opacity-100 hover:bg-black/10 shrink-0"
            onClick={() => {
              setLabel(stage.label);
              setDraftColor(color);
              setDraftDesc(stage.description ?? "");
              setEditing((v) => !v);
            }}
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Inline edit panel */}
      {editing && writable && (
        <div className="mb-2 rounded-lg bg-card border border-border/40 p-2 space-y-2 shrink-0">
          <Input
            inputSize="sm"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Nama stage"
            aria-label="Nama stage"
          />
          <Textarea
            rows={2}
            value={draftDesc}
            onChange={(e) => setDraftDesc(e.target.value)}
            placeholder="Deskripsi (opsional)"
            aria-label="Deskripsi stage"
            className="text-sm"
          />
          <div className="flex items-center gap-1.5 flex-wrap">
            {SWATCHES.map((s) => (
              <button
                key={s}
                type="button"
                aria-label={`Warna ${s}`}
                onClick={() => setDraftColor(s)}
                className={`size-5 rounded-full border ${
                  draftColor.toLowerCase() === s.toLowerCase()
                    ? "ring-2 ring-offset-1 ring-foreground/40"
                    : ""
                }`}
                style={{ backgroundColor: s }}
              />
            ))}
            <input
              type="color"
              aria-label="Warna kustom"
              value={draftColor}
              onChange={(e) => setDraftColor(e.target.value)}
              className="size-6 rounded cursor-pointer"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={async () => {
                await onUpdateStage(stage.id, {
                  label: label.trim() || stage.label,
                  color: draftColor,
                  description: draftDesc.trim() || null,
                });
                setEditing(false);
              }}
            >
              Simpan
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive"
              aria-label="Hapus stage"
              onClick={async () => {
                if (confirm(`Hapus stage "${stage.label}"?`)) {
                  await onDeleteStage(stage.id);
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Stage description (optional) */}
      {stage.description && !editing && (
        <p className="text-[11px] leading-snug text-muted-foreground line-clamp-2 mb-2 px-1 shrink-0">
          {stage.description}
        </p>
      )}

      {/* Add-card at the top of the column */}
      {writable && (
        <div className="mb-2 shrink-0">
          <AddInline
            placeholder="Judul kartu"
            buttonLabel="+ Kartu"
            onAdd={(title) => onAddCard(stage.id, title)}
          />
        </div>
      )}

      {/* Cards - per-column vertical scroll */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto column-scrollbar space-y-2 pr-1 min-h-0"
        onDragOver={(e) => {
          if (dragId == null || !listRef.current) return;
          const r = listRef.current.getBoundingClientRect();
          listRef.current.scrollTop += edgeScrollDelta(e.clientY, r.top, r.bottom, 56, 16);
        }}
      >
        {cards.map((c) => (
          <div key={c.id} className={selectMode ? "relative" : undefined}>
            {selectMode && (
              <span className="absolute top-2 left-2 z-10 inline-flex items-center justify-center min-w-[24px] min-h-[24px]">
                <Checkbox
                  aria-label={`Pilih kartu ${c.title}`}
                  checked={selectedIds?.has(c.id) ?? false}
                  onChange={() => onToggleCard?.(c.id)}
                  onClick={(e) => e.stopPropagation()}
                />
              </span>
            )}
            <BoardCard
              card={c}
              fields={fields}
              usersById={usersById}
              writable={writable}
              dragging={!selectMode && dragId === c.id}
              now={now}
              selectMode={selectMode}
              onDragStartCard={onDragStartCard}
              onCardClick={onCardClick}
              onToggleCard={onToggleCard}
              stages={stageOptions}
              onMoveCard={onMoveCard}
            />
          </div>
        ))}
        {cards.length === 0 && (
          <div
            className={`text-xs text-center py-6 border border-dashed rounded-lg transition-colors ${
              isDropTarget ? "border-primary/60 text-primary bg-primary/5" : "text-muted-foreground"
            }`}
          >
            {isDropTarget ? (
              <>
                <Move className="h-4 w-4 inline mr-1" />
                Drop di sini
              </>
            ) : (
              "Kosong"
            )}
          </div>
        )}
      </div>
    </div>
  );
}
