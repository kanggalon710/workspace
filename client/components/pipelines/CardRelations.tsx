import { useState, useEffect, useRef } from "react";
import { Link2, X, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { api } from "@/lib/api";
import { RELATION_ENTITY_TYPES, relationHref } from "@shared/cardRelations";
import type { RelationEntityType } from "@shared/cardRelations";
import { useCardRelations, useCardRelationMutations, type RelationSearchResult } from "@/hooks/usePipelines";

interface CardRelationsProps {
  cardId: number;
  writable: boolean;
}

const TYPE_OPTIONS = RELATION_ENTITY_TYPES.map((t) => ({ value: t.type, label: t.label }));

function typeLabelOf(type: string): string {
  return RELATION_ENTITY_TYPES.find((t) => t.type === type)?.label ?? type;
}

export function CardRelations({ cardId, writable }: CardRelationsProps) {
  const { data: relations, isLoading } = useCardRelations(cardId);
  const m = useCardRelationMutations(cardId);

  const [showForm, setShowForm] = useState(false);

  // Add-form state
  const [entityType, setEntityType] = useState<RelationEntityType>("customer");
  const [entityId, setEntityId] = useState("");    // selected entity value (string id)
  const [label, setLabel] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<RelationSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search whenever type or query changes (only while form is open)
  useEffect(() => {
    if (!showForm) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Clear results immediately when type changes or query is too short
    if (searchQ.length < 1) {
      setSearchResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await api.get<RelationSearchResult[]>(
          `/pipelines/relations/search?type=${encodeURIComponent(entityType)}&q=${encodeURIComponent(searchQ)}`
        );
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [showForm, entityType, searchQ]);

  // Reset entity pick when type changes
  useEffect(() => {
    setEntityId("");
    setSearchQ("");
    setSearchResults([]);
  }, [entityType]);

  const entityOptions = searchResults.map((r) => ({
    value: String(r.id),
    label: r.label,
    description: r.subtitle ?? undefined,
  }));

  const resetForm = () => {
    setEntityType("customer");
    setEntityId("");
    setLabel("");
    setSearchQ("");
    setSearchResults([]);
    setShowForm(false);
  };

  const handleAdd = async () => {
    if (!entityId) { toast.error("Pilih entitas terlebih dahulu"); return; }
    try {
      await m.add.mutateAsync({
        entityType,
        entityId: Number(entityId),
        label: label.trim() || undefined,
      });
      resetForm();
      toast.success("Relasi ditambahkan");
    } catch (e: any) {
      if (e?.message?.includes("409") || e?.message?.toLowerCase().includes("duplicate") || e?.message?.toLowerCase().includes("already")) {
        toast.error("Relasi sudah ada");
      } else {
        toast.error(e?.message ?? "Gagal menambah relasi");
      }
    }
  };

  return (
    <section aria-label="Relasi kartu">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-muted-foreground">Relasi</h4>
        {writable && !showForm && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            aria-label="Tambah relasi"
            onClick={() => setShowForm(true)}
          >
            <Plus className="mr-1 size-3" />
            Tambah
          </Button>
        )}
      </div>

      {/* Relations list */}
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Memuat…</p>
      ) : !relations || relations.length === 0 ? (
        <p className="text-xs text-muted-foreground">Belum ada relasi.</p>
      ) : (
        <ul className="space-y-1" role="list">
          {relations.map((r, idx) => {
            const href = relationHref(r.entityType, r.entityId, { pipelineId: r.pipelineId ?? undefined });
            return (
              <li
                key={r.id ?? `implicit-${idx}`}
                className="flex items-start gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs"
              >
                <Link2 className="mt-0.5 size-3 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {typeLabelOf(r.entityType)}
                    </span>
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate font-medium text-foreground hover:underline"
                      aria-label={`Buka ${typeLabelOf(r.entityType)} ${r.entityLabel}`}
                    >
                      {r.entityLabel}
                    </a>
                    {r.label && (
                      <span className="rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary">
                        {r.label}
                      </span>
                    )}
                    {r.implicit && (
                      <span className="rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground">
                        implisit
                      </span>
                    )}
                  </div>
                  {r.entitySubtitle && (
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{r.entitySubtitle}</p>
                  )}
                </div>
                {writable && !r.implicit && r.id != null && (
                  <button
                    type="button"
                    aria-label={`Hapus relasi ${r.entityLabel}`}
                    disabled={m.remove.isPending}
                    onClick={() => m.remove.mutateAsync(r.id!)}
                    className="ml-auto mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Add form */}
      {showForm && (
        <div className="mt-2 space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
          <div>
            <label className="mb-1 block text-[10px] font-medium text-muted-foreground">Tipe entitas</label>
            <Combobox
              size="sm"
              clearable={false}
              options={TYPE_OPTIONS}
              value={entityType}
              onChange={(v) => v && setEntityType(v as RelationEntityType)}
              searchPlaceholder="Cari tipe…"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
              Entitas
              {searching && <Loader2 className="ml-1 inline size-3 animate-spin text-muted-foreground" aria-label="Mencari…" />}
            </label>
            {/* We control search externally via onSearchChange analog: use a plain Input
                so the user can type freely, then pass the fetched options to Combobox.
                We render both: search input + combobox trigger that uses fetched options. */}
            <Input
              inputSize="sm"
              placeholder={`Cari ${typeLabelOf(entityType)}…`}
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              aria-label={`Cari ${typeLabelOf(entityType)}`}
            />
            {searchResults.length > 0 && (
              <div className="mt-1">
                <Combobox
                  size="sm"
                  clearable
                  options={entityOptions}
                  value={entityId}
                  placeholder="Pilih hasil pencarian…"
                  searchPlaceholder="Filter hasil…"
                  onChange={(v) => setEntityId(v ?? "")}
                />
              </div>
            )}
            {searchQ.length >= 1 && !searching && searchResults.length === 0 && (
              <p className="mt-1 text-[10px] text-muted-foreground">Tidak ada hasil untuk "{searchQ}".</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
              Label (opsional)
            </label>
            <Input
              inputSize="sm"
              placeholder="Mis: referensi, sumber…"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              aria-label="Label relasi opsional"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              disabled={!entityId}
              loading={m.add.isPending}
              onClick={handleAdd}
            >
              Tambah
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetForm}
              disabled={m.add.isPending}
            >
              Batal
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
