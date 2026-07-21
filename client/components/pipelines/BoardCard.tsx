import { memo } from "react";
import { Card } from "@/components/ui/card";
import { ArrowRightLeft } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import type { PipelineCardWithValues } from "@/hooks/usePipelines";
import type { PipelineField } from "@shared/schema";
import { cardAgeLabel, lastUpdateTone, isStalled, type UpdateTone } from "./boardCardMeta";
import { isMultiUser, parseCoordinate } from "@shared/pipelineFieldTypes";

const TONE_DOT: Record<UpdateTone, string> = {
  fresh: "bg-success",
  recent: "bg-muted-foreground/40",
  warn: "bg-warning",
  old: "bg-destructive",
};

const PRIORITY_CLS: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-info/15 text-info",
  high: "bg-warning/15 text-warning",
  urgent: "bg-destructive/15 text-destructive",
};

function fieldText(f: PipelineField, raw: string): string {
  if (f.type === "checkbox") return raw === "1" ? "Ya" : "Tidak";
  if (f.type === "currency") return "Rp " + Number(raw).toLocaleString("id-ID");
  if (f.type === "multiselect") {
    try {
      return (JSON.parse(raw) as string[]).join(", ");
    } catch {
      return String(raw);
    }
  }
  if (f.type === "coordinate") {
    const c = parseCoordinate(raw);
    return c ? ` ${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}` : String(raw);
  }
  return String(raw);
}

function resolveUserNames(
  f: PipelineField,
  raw: string,
  usersById: Map<number, { name?: string | null; username?: string | null }>,
): string {
  let ids: string[];
  if (isMultiUser(f)) {
    try { ids = (JSON.parse(raw) as unknown[]).map(String); } catch { ids = []; }
  } else {
    ids = raw ? [raw] : [];
  }
  const names = ids.map((id) => {
    const u = usersById.get(Number(id));
    return u?.name || u?.username || `#${id}`;
  });
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export const BoardCard = memo(function BoardCard({
  card,
  fields,
  usersById,
  writable,
  dragging,
  now,
  selectMode,
  onDragStartCard,
  onCardClick,
  onToggleCard,
  stages,
  onMoveCard,
}: {
  card: PipelineCardWithValues;
  fields: PipelineField[];
  usersById: Map<number, { name?: string | null; username?: string | null }>;
  writable: boolean;
  dragging: boolean;
  now: Date;
  selectMode: boolean;
  onDragStartCard: (id: number) => void;
  onCardClick: (id: number) => void;
  onToggleCard?: (id: number) => void;
  /** Quick-move alternatif drag: daftar stage pipeline (referensi stabil dari query cache). */
  stages?: { id: number; label: string; color: string | null }[];
  /** Stable callback (ref-backed di page) — memo BoardCard tetap berlaku. */
  onMoveCard?: (cardId: number, stageId: number) => void;
}) {
  const stalled = isStalled(card.updatedAt ?? null, card.createdAt, now);
  const tone = lastUpdateTone(card.updatedAt ?? null, card.createdAt, now);
  const assignee = card.assigneeId != null ? usersById.get(card.assigneeId) : undefined;
  const assigneeName = assignee
    ? assignee.name || assignee.username || `User #${card.assigneeId}`
    : null;

  // selectMode: clicking the card toggles its selection; otherwise it opens the detail.
  // Drag is disabled in select mode. Handlers are built from stable id-based callbacks so React.memo holds.
  const handleOpen = () => { if (selectMode) onToggleCard?.(card.id); else onCardClick(card.id); };
  const handleDragStart = () => { if (!selectMode) onDragStartCard(card.id); };

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={card.title}
      draggable={writable && !selectMode}
      onDragStart={handleDragStart}
      onClick={handleOpen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return; // Enter on inner controls (quick-move) stays theirs
        if (e.key === "Enter" || e.key === " ") {
          if (e.key === " ") e.preventDefault();
          handleOpen();
        }
      }}
      className={`p-3 cursor-pointer border-l-2 ${
        stalled ? "border-l-destructive" : "border-l-transparent"
      } ${dragging ? "opacity-40" : ""}`}
    >
      {/* Title row with update-tone dot + quick-move (alternatif drag, ramah mobile) */}
      <div className="flex items-start gap-2">
        <span
          className={`mt-1.5 size-2 rounded-full shrink-0 ${TONE_DOT[tone]}`}
          title="Update terakhir"
        />
        <div className="text-sm font-semibold text-card-foreground leading-snug flex-1 min-w-0 line-clamp-2">{card.title}</div>
        {writable && !selectMode && onMoveCard && (stages?.length ?? 0) > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Pindah kartu ${card.title} ke stage lain`}
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 -mr-1 -mt-0.5 rounded p-1 min-w-[24px] min-h-[24px] text-muted-foreground/50 hover:text-foreground hover:bg-muted focus-visible:opacity-100"
              >
                <ArrowRightLeft className="size-3.5" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuLabel>Pindah ke stage</DropdownMenuLabel>
              {stages!
                .filter((s) => s.id !== card.stageId)
                .map((s) => (
                  <DropdownMenuItem key={s.id} onClick={() => onMoveCard(card.id, s.id)}>
                    <span
                      className="size-2 rounded-full mr-2 shrink-0"
                      style={{ backgroundColor: s.color ?? "#6B7280" }}
                      aria-hidden="true"
                    />
                    {s.label}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Priority + age + stalled tag */}
      <div className="flex items-center flex-wrap gap-1.5 mt-2">
        <span
          className={`text-xs font-medium px-1.5 py-0.5 rounded capitalize ${
            PRIORITY_CLS[card.priority] ?? PRIORITY_CLS.medium
          }`}
        >
          {card.priority}
        </span>
        <span className="text-xs text-muted-foreground">
          {cardAgeLabel(card.createdAt, now)}
        </span>
        {stalled && (
          <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-destructive/15 text-destructive">
            Stalled
          </span>
        )}
      </div>

      {/* Field chips (showOnCard fields that have a value) */}
      {(() => {
        const chips = fields
          .filter((f) => f.showOnCard !== 0)
          .map((f) => {
            const raw = card.values?.[f.id];
            if (raw == null || raw === "") return null;
            return (
              <span
                key={f.id}
                className="inline-flex max-w-full items-center gap-1 text-xs px-1.5 py-0.5 rounded-md bg-muted border border-border/60 text-foreground/80"
              >
                <span className="font-medium text-muted-foreground shrink-0">{f.label}:</span>
                <span className="truncate">{f.type === "user" ? resolveUserNames(f, raw ?? "", usersById) : fieldText(f, raw)}</span>
              </span>
            );
          })
          .filter(Boolean);
        return chips.length > 0 ? <div className="flex flex-wrap gap-1 mt-2">{chips}</div> : null;
      })()}

      {/* Assignee row */}
      <div className="mt-2 flex items-center gap-1.5">
        {assigneeName ? (
          <>
            <span className="size-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">
              {initials(assigneeName)}
            </span>
            <span className="text-xs text-foreground/70 truncate">{assigneeName}</span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground/70 italic">Belum ditugaskan</span>
        )}
      </div>
    </Card>
  );
});
