/** Teamspace v5.0 — ekstensi modal kartu: selesai, tenggat, label berwarna, checklist,
 *  dan aksi (Salin / Rahasiakan / Arsipkan). Generik untuk semua board (ops + tim). */
import { useRef, useState } from "react";
import {
  useCardChecklists, useChecklistMutations, usePipelineLabels, useLabelMutations,
  useCardActions, LABEL_COLOR_PALETTE,
} from "@/hooks/useTeamspace";
import { usePipelineMutations } from "@/hooks/usePipelines";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CheckCircle2, Circle, Plus, Tag, Trash2, ListChecks, Copy, Lock, Unlock, Archive, CalendarClock, X, RotateCcw, ImagePlus } from "lucide-react";
import { toast } from "sonner";

interface Props {
  cardId: number;
  pipelineId: number;
  card: any;               // CardDetail — kolom Teamspace (isCompleted/isPrivate/dueDate) dibaca dinamis
  writable: boolean;
  onClose: () => void;
  /** BUG-008 layout 2 kolom: "side" = cover/selesai/tenggat/ulangi/label/aksi (panel kanan),
   *  "main" = checklist (kolom konten). Default "all" = semuanya (backward compat). */
  section?: "all" | "side" | "main";
}

/** Konversi ISO ↔ nilai input datetime-local (waktu lokal). */
function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CardTeamExtras({ cardId, pipelineId, card, writable, onClose, section = "all" }: Props) {
  const showSide = section !== "main";
  const showMain = section !== "side";
  const actions = useCardActions(cardId);
  const m = usePipelineMutations(pipelineId);
  const { data: checklists } = useCardChecklists(cardId);
  const cm = useChecklistMutations(cardId);
  const { data: labels } = usePipelineLabels(pipelineId);
  const lm = useLabelMutations(pipelineId);

  const isCompleted = card?.isCompleted === 1;
  const isPrivate = card?.isPrivate === 1;
  const cardLabels: Array<{ id: number; name: string; colorHex: string }> = card?.labels ?? [];
  const selectedLabelIds = new Set(cardLabels.map((l) => l.id));

  const [newChecklistTitle, setNewChecklistTitle] = useState("");
  const [showNewChecklist, setShowNewChecklist] = useState(false);
  const [itemDrafts, setItemDrafts] = useState<Record<number, string>>({});
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState(LABEL_COLOR_PALETTE[10]);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const toggleCompleted = () => {
    actions.setCompleted.mutate(!isCompleted, {
      onSuccess: () => toast.success(!isCompleted ? "Tugas ditandai selesai 🎉" : "Tanda selesai dibatalkan"),
      onError: (e: any) => toast.error(e?.message || "Gagal mengubah status"),
    });
  };

  const toggleLabel = (labelId: number) => {
    const next = selectedLabelIds.has(labelId)
      ? cardLabels.filter((l) => l.id !== labelId).map((l) => l.id)
      : [...cardLabels.map((l) => l.id), labelId];
    lm.setCardLabels.mutate({ cardId, labelIds: next }, {
      onError: (e: any) => toast.error(e?.message || "Gagal mengubah label"),
    });
  };

  const createLabel = () => {
    if (!newLabelName.trim()) return;
    lm.createLabel.mutate({ name: newLabelName.trim(), colorHex: newLabelColor }, {
      onSuccess: (l: any) => {
        setNewLabelName("");
        if (l?.id) lm.setCardLabels.mutate({ cardId, labelIds: [...cardLabels.map((x) => x.id), l.id] });
      },
      onError: (e: any) => toast.error(e?.message || "Gagal membuat label"),
    });
  };

  const addChecklist = () => {
    if (!newChecklistTitle.trim()) return;
    cm.createChecklist.mutate(newChecklistTitle.trim(), {
      onSuccess: () => { setNewChecklistTitle(""); setShowNewChecklist(false); },
      onError: (e: any) => toast.error(e?.message || "Gagal membuat checklist"),
    });
  };

  const addItem = (checklistId: number) => {
    const text = (itemDrafts[checklistId] ?? "").trim();
    if (!text) return;
    cm.addItem.mutate({ checklistId, text }, {
      onSuccess: () => setItemDrafts((d) => ({ ...d, [checklistId]: "" })),
      onError: (e: any) => toast.error(e?.message || "Gagal menambah item"),
    });
  };

  const coverInputRef = useRef<HTMLInputElement>(null);
  const coverPath = card?.coverPath as string | null | undefined;

  return (
    <div className="space-y-4">
      {/* Cover image (BUG-007 / FR-405) */}
      {showSide && (coverPath || writable) && (
        <div>
          <input ref={coverInputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) actions.setCover.mutate(f, {
                onSuccess: () => toast.success("Cover diperbarui"),
                onError: (err: any) => toast.error(err?.message || "Gagal upload cover"),
              });
              e.target.value = "";
            }} />
          {coverPath ? (
            <div className="group relative overflow-hidden rounded-lg border">
              <img src={`/api/pipelines/cards/${cardId}/cover/raw`} alt="Cover kartu" className="max-h-40 w-full object-cover" loading="lazy" />
              {writable && (
                <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button type="button" size="xs" variant="outline" className="bg-background/90" onClick={() => coverInputRef.current?.click()}>Ganti</Button>
                  <Button type="button" size="xs" variant="outline" className="bg-background/90 text-destructive"
                    onClick={() => actions.removeCover.mutate(undefined, { onSuccess: () => toast.success("Cover dihapus") })}>Hapus</Button>
                </div>
              )}
            </div>
          ) : writable ? (
            <Button type="button" variant="outline" size="xs" leftIcon={<ImagePlus className="size-3.5" />}
              loading={actions.setCover.isPending} onClick={() => coverInputRef.current?.click()}>
              Tambah Cover
            </Button>
          ) : null}
        </div>
      )}

      {/* Selesai + Tenggat + Ulangi + Label — panel aksi (side) */}
      {showSide && (<>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={isCompleted ? "success" : "outline"}
          leftIcon={isCompleted ? <CheckCircle2 className="size-4" /> : <Circle className="size-4" />}
          disabled={!writable}
          loading={actions.setCompleted.isPending}
          onClick={toggleCompleted}
        >
          {isCompleted ? "Selesai" : "Tandai Selesai"}
        </Button>
        <div className="inline-flex items-center gap-1.5">
          <CalendarClock className="size-4 text-muted-foreground" aria-hidden="true" />
          <input
            type="datetime-local"
            aria-label="Tanggal jatuh tempo"
            className="h-8 rounded-md border bg-background px-2 text-xs"
            defaultValue={isoToLocalInput(card?.dueDate)}
            disabled={!writable}
            onBlur={(e) => {
              const v = e.target.value ? new Date(e.target.value).toISOString() : null;
              if (v !== (card?.dueDate ?? null)) m.updateCard.mutateAsync({ cardId, dueDate: v });
            }}
          />
          {card?.dueDate && writable && (
            <Button type="button" variant="ghost" size="icon-xs" aria-label="Hapus tenggat"
              onClick={() => m.updateCard.mutateAsync({ cardId, dueDate: null })}>
              <X className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Ulangi (FR-408) — instance baru dibuat otomatis saat kartu selesai */}
      {writable && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
            <RotateCcw className="size-3" /> Ulangi:
          </span>
          {([["", "Tidak"], ["daily", "Harian"], ["weekly", "Mingguan"], ["monthly", "Bulanan"]] as const).map(([f, label]) => {
            const current = (() => { try { return card?.recurrenceRule ? JSON.parse(card.recurrenceRule).freq ?? "" : ""; } catch { return ""; } })();
            const isActive = current === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => actions.setRecurrence.mutate(f, {
                  onSuccess: () => toast.success(f ? `Diulang ${label.toLowerCase()} — instance baru dibuat saat selesai` : "Pengulangan dimatikan"),
                  onError: (e: any) => toast.error(e?.message || "Gagal mengubah pengulangan"),
                })}
                className={`rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-colors ${isActive ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Label berwarna (FR-413) */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground">Label</span>
          {writable && (
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="ghost" size="xs" leftIcon={<Tag className="size-3.5" />}>Atur Label</Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-3">
                <p className="mb-2 text-xs font-semibold">Label board ini</p>
                <div className="max-h-44 space-y-1 overflow-y-auto">
                  {(labels ?? []).map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => toggleLabel(l.id)}
                      className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-muted"
                    >
                      <span className="h-4 w-8 shrink-0 rounded" style={{ backgroundColor: l.colorHex }} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-xs">{l.name}</span>
                      {selectedLabelIds.has(l.id) && <CheckCircle2 className="size-3.5 shrink-0 text-primary" />}
                    </button>
                  ))}
                  {(labels ?? []).length === 0 && <p className="px-1.5 py-1 text-[11px] text-muted-foreground">Belum ada label — buat di bawah.</p>}
                </div>
                <div className="mt-2 space-y-2 border-t pt-2">
                  <Input inputSize="sm" placeholder="Nama label baru" value={newLabelName} onChange={(e) => setNewLabelName(e.target.value)} />
                  <div className="flex flex-wrap gap-1">
                    {LABEL_COLOR_PALETTE.slice(0, 18).map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`Warna ${c}`}
                        onClick={() => setNewLabelColor(c)}
                        className={`size-5 rounded-full transition-transform ${newLabelColor === c ? "ring-2 ring-offset-1 ring-primary scale-110" : "hover:scale-105"}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <Button type="button" size="xs" className="w-full" onClick={createLabel} loading={lm.createLabel.isPending} disabled={!newLabelName.trim()}>
                    <Plus className="size-3.5 mr-1" /> Buat & Pasang
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
        {cardLabels.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {cardLabels.map((l) => (
              <span key={l.id} className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium text-white" style={{ backgroundColor: l.colorHex }}>
                {l.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">Belum ada label.</p>
        )}
      </div>
      </>)}

      {/* Checklist (FR-406) — konten utama (main) */}
      {showMain && (
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground">Checklist</span>
          {writable && (
            <Button type="button" variant="ghost" size="xs" leftIcon={<ListChecks className="size-3.5" />} onClick={() => setShowNewChecklist((v) => !v)}>
              Tambah Checklist
            </Button>
          )}
        </div>
        {showNewChecklist && (
          <div className="mb-2 flex gap-1.5">
            <Input
              inputSize="sm" placeholder="Judul checklist (cth: Persiapan)" value={newChecklistTitle} autoFocus
              onChange={(e) => setNewChecklistTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addChecklist(); }}
            />
            <Button type="button" size="sm" onClick={addChecklist} loading={cm.createChecklist.isPending} disabled={!newChecklistTitle.trim()}>Buat</Button>
          </div>
        )}
        <div className="space-y-3">
          {(checklists ?? []).map((cl) => {
            const total = cl.items.length;
            const done = cl.items.filter((i) => i.isChecked === 1).length;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            return (
              <div key={cl.id} className="rounded-lg border p-2.5">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold">{cl.title}</span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">{done}/{total}</span>
                  {writable && (
                    <Button type="button" variant="ghost" size="icon-xs" aria-label="Hapus checklist"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => cm.deleteChecklist.mutate(cl.id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
                {total > 0 && (
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
                  </div>
                )}
                <ul className="mt-2 space-y-1">
                  {cl.items.map((it) => (
                    <li key={it.id} className="group flex items-center gap-2">
                      <Checkbox
                        id={`cli-${it.id}`}
                        checked={it.isChecked === 1}
                        disabled={!writable}
                        onChange={(e) => cm.toggleItem.mutate({ id: it.id, isChecked: e.target.checked })}
                      />
                      <label htmlFor={`cli-${it.id}`} className={`min-w-0 flex-1 cursor-pointer truncate text-xs ${it.isChecked === 1 ? "text-muted-foreground line-through" : ""}`}>
                        {it.text}
                      </label>
                      {writable && (
                        <button type="button" aria-label="Hapus item" onClick={() => cm.deleteItem.mutate(it.id)}
                          className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100">
                          <X className="size-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {writable && (
                  <div className="mt-1.5 flex gap-1.5">
                    <Input
                      inputSize="sm" placeholder="Tambah item…" value={itemDrafts[cl.id] ?? ""}
                      onChange={(e) => setItemDrafts((d) => ({ ...d, [cl.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") addItem(cl.id); }}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => addItem(cl.id)} disabled={!(itemDrafts[cl.id] ?? "").trim()}>
                      <Plus className="size-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
          {(checklists ?? []).length === 0 && !showNewChecklist && (
            <p className="text-[11px] text-muted-foreground">Belum ada checklist. Pecah tugas besar jadi langkah kecil yang bisa dicentang.</p>
          )}
        </div>
      </div>
      )}

      {/* Aksi (FR-409) — panel aksi (side) */}
      {showSide && writable && (
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Aksi</span>
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button" variant="outline" size="xs" leftIcon={<Copy className="size-3.5" />}
              loading={actions.duplicate.isPending}
              onClick={() => actions.duplicate.mutate(undefined, {
                onSuccess: () => toast.success("Kartu disalin"),
                onError: (e: any) => toast.error(e?.message || "Gagal menyalin kartu"),
              })}
            >
              Salin
            </Button>
            <Button
              type="button" variant="outline" size="xs"
              leftIcon={isPrivate ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
              loading={actions.setPrivate.isPending}
              onClick={() => actions.setPrivate.mutate(!isPrivate, {
                onSuccess: () => toast.success(!isPrivate ? "Kartu dirahasiakan — hanya anggota kartu yang bisa melihat" : "Kartu dibuka kembali"),
                onError: (e: any) => toast.error(e?.message || "Gagal mengubah kerahasiaan"),
              })}
            >
              {isPrivate ? "Buka Rahasia" : "Rahasiakan"}
            </Button>
            <Button
              type="button" size="xs"
              variant={confirmArchive ? "warning" : "outline"}
              leftIcon={<Archive className="size-3.5" />}
              loading={actions.setArchived.isPending}
              onBlur={() => setConfirmArchive(false)}
              onClick={() => {
                if (!confirmArchive) { setConfirmArchive(true); return; }
                actions.setArchived.mutate(true, {
                  onSuccess: () => { toast.success("Kartu diarsipkan"); onClose(); },
                  onError: (e: any) => toast.error(e?.message || "Gagal mengarsipkan"),
                });
              }}
            >
              {confirmArchive ? "Yakin? Arsipkan" : "Arsipkan"}
            </Button>
          </div>
          {isPrivate && (
            <p className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-warning">
              <Lock className="size-3" /> Kartu ini rahasia — hanya pembuat, penanggung jawab, dan follower yang bisa melihat.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
