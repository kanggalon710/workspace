import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { usePipeline, usePipelineCards, usePipelineMutations, useAssignableUsers, downloadCardsCsv } from "@/hooks/usePipelines";
import { CardDetailModal } from "@/components/pipelines/CardDetailModal";
import { CardImportDialog } from "@/components/pipelines/CardImportDialog";
import { parseCardParam } from "@/lib/cardParam";
import { ManageFieldsDialog } from "@/components/pipelines/ManageFieldsDialog";
import { PipelineAccessDialog } from "@/components/pipelines/PipelineAccessDialog";
import { PipelineRulesDialog } from "@/components/pipelines/PipelineRulesDialog";
import { PipelineSettingsDialog } from "@/components/pipelines/PipelineSettingsDialog";
import { BoardFilters, type DateField } from "@/components/pipelines/BoardFilters";
import { StageColumn } from "@/components/pipelines/StageColumn";
import { AddStageInline } from "@/components/pipelines/AddStageInline";
import { inDateRange, compareByDate, type DateRange } from "@/components/pipelines/boardCardMeta";
import { searchableFieldIds, cardMatchesFilter, compareCardsByField } from "@shared/pipelineFieldTypes";
import { matchesAssigneeFilter } from "@shared/cardAssignees";
import { resolvePipelineIcon, pipelineTint, PIPELINE_DEFAULT_COLOR } from "@/components/pipelines/pipelineIcon";
import { reorderByDrag, moveByOffset } from "@/components/pipelines/stageReorder";
import { edgeScrollDelta } from "@/components/pipelines/dragScroll";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVertical, Download, Upload, CheckSquare, ShieldAlert, ListFilter, KeyRound, Zap, Settings2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import { BulkActionBar } from "@/components/pipelines/BulkActionBar";
import { TeamModuleNav } from "@/components/teamspace/TeamModuleNav";
import { useTeam } from "@/hooks/useTeamspace";
import { MetricsStrip } from "@/components/pipelines/MetricsStrip";
import { MetricsConfigDialog } from "@/components/pipelines/MetricsConfigDialog";

export default function PipelineBoardPage() {
  const [, params] = useRoute("/pipelines/:id");
  // Teamspace: board tugas tim dilayani halaman yang sama via route /teamspace/boards/:id
  // (gate permission `team_tasks`; kapabilitas per-pipeline tetap dari server).
  const [, teamParams] = useRoute("/teamspace/boards/:id");
  const pid = params ? Number(params.id) : teamParams ? Number(teamParams.id) : null;
  const { data: pipeline, isLoading: pipelineLoading, error: pipelineError } = usePipeline(pid);
  const writable = pipeline?.level === "edit";
  const caps = useMemo(() => new Set(pipeline?.capabilities ?? []), [pipeline?.capabilities]);
  const can = (c: string) => caps.has(c) || (writable && caps.size === 0); // fallback if capabilities absent
  const { data: cards } = usePipelineCards(pid);
  const m = usePipelineMutations(pid ?? undefined);
  // Ref-backed move callback: identity stays stable across renders (m is a fresh object
  // every render) so React.memo(BoardCard) holds for the quick-move dropdown.
  const mRef = useRef(m);
  useEffect(() => { mRef.current = m; });
  const moveCardTo = useCallback((cardId: number, stageId: number) => {
    mRef.current.moveCard
      .mutateAsync({ cardId, toStageId: stageId })
      .catch(() => toast.error("Gagal memindahkan kartu"));
  }, []);
  const { data: users } = useAssignableUsers();
  const usersById = useMemo(() => new Map((users ?? []).map((u: any) => [u.id, u])), [users]);
  const assigneeOptions = useMemo(
    () =>
      (users ?? [])
        .map((u: any) => ({
          value: String(u.id),
          label: u.name || u.username || `User #${u.id}`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [users],
  );

  const [, navigate] = useLocation();
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [assigneeId, setAssigneeId] = useState<number | null>(null);
  const [stageDragId, setStageDragId] = useState<number | null>(null);
  const [selectedCard, setSelectedCard] = useState<number | null>(null);

  // Bulk-selection state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // useCallback: stable identity so React.memo(BoardCard) holds (functional setState → no deps).
  const toggleCard = useCallback((id: number) => setSelectedIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; }), []);
  const toggleMany = useCallback((ids: number[], on: boolean) => setSelectedIds((p) => { const n = new Set(p); ids.forEach((i) => (on ? n.add(i) : n.delete(i))); return n; }), []);

  // Open from a deep link (?card=) once on mount; the modal is otherwise driven by selectedCard.
  useEffect(() => {
    const c = parseCardParam(window.location.search);
    if (c) setSelectedCard(c);
  }, []);

  // Teamspace: pertahankan base path sesuai route asal - board tim harus tetap di
  // /teamspace/boards (gate `team_tasks`); navigasi ke /pipelines akan memblokir
  // anggota tim yang tidak punya izin ops `pipelines`.
  const basePath = teamParams ? `/teamspace/boards/${pid}` : `/pipelines/${pid}`;
  // UX Cicle: di board tim, tampilkan bar modul tim persisten (Ringkasan/Chat/…) -
  // dari board tidak lagi jalan buntu tanpa tombol kembali.
  const { data: ownerTeam } = useTeam(teamParams && (pipeline as any)?.teamId ? Number((pipeline as any).teamId) : null);
  const openCard = useCallback((cardId: number) => { setSelectedCard(cardId); navigate(`${basePath}?card=${cardId}`); }, [navigate, basePath]);
  const closeCard = () => { setSelectedCard(null); navigate(basePath, { replace: true }); };
  const [search, setSearch] = useState("");
  const [dateField, setDateField] = useState<DateField>("created");
  const [range, setRange] = useState<DateRange>("all");
  const [filterFieldId, setFilterFieldId] = useState<number | null>(null);
  const [filterValue, setFilterValue] = useState("");
  const [sortFieldId, setSortFieldId] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showFields, setShowFields] = useState(false);
  const [showAccess, setShowAccess] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showMetricsCfg, setShowMetricsCfg] = useState(false);

  const now = useMemo(() => new Date(), []);
  const stages = pipeline?.stages ?? [];
  const pipelineColor = pipeline?.color ?? PIPELINE_DEFAULT_COLOR;
  const fields = pipeline?.fields ?? [];
  const fieldById = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields]);
  const searchIds = useMemo(() => searchableFieldIds(fields), [fields]);
  const q = search.toLowerCase();
  const filterField = filterFieldId == null ? undefined : fieldById.get(filterFieldId);
  const visible = useMemo(() => (cards ?? []).filter((c) => {
    const matchesSearch =
      q === "" ||
      c.title.toLowerCase().includes(q) ||
      searchIds.some((fid) => (c.values?.[fid] ?? "").toLowerCase().includes(q));
    const matchesAssignee = matchesAssigneeFilter(c.assigneeId, (c as any).secondaryAssigneeIds ?? [], assigneeId);
    const matchesDate = inDateRange(
      dateField === "created" ? c.createdAt : (c.updatedAt ?? null),
      range,
      now,
    );
    const matchesFilter = !filterField || cardMatchesFilter(c.values, filterField, filterValue);
    return matchesSearch && matchesAssignee && matchesDate && matchesFilter;
  }), [cards, q, searchIds, assigneeId, dateField, range, now, filterField, filterValue]);
  // Prune selection to only currently-visible cards (filters may hide selected cards).
  useEffect(() => {
    const vis = new Set(visible.map((c) => c.id));
    setSelectedIds((p) => { const n = new Set([...p].filter((id) => vis.has(id))); return n.size === p.size ? p : n; });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const sortField = sortFieldId == null ? undefined : fieldById.get(sortFieldId);
  // Group visible cards by stage (and sort each bucket) once per render instead of re-filtering
  // the full list per stage. Stable array identity per stage helps downstream memoization.
  // Urutan: field kustom (bila dipilih) menang; kalau tidak, urut by tanggal Dibuat/Update-terakhir
  // (dateField) - jadi toggle "Dibuat/Update terakhir" langsung mengubah urutan kartu.
  const cardsByStage = useMemo(() => {
    const map = new Map<number, typeof visible>();
    for (const c of visible) {
      const list = map.get(c.stageId);
      if (list) list.push(c); else map.set(c.stageId, [c]);
    }
    const cmp = sortField
      ? (a: typeof visible[number], b: typeof visible[number]) => compareCardsByField(a.values, b.values, sortField, sortDir)
      : (a: typeof visible[number], b: typeof visible[number]) => compareByDate(a, b, dateField, sortDir);
    for (const list of map.values()) list.sort(cmp);
    return map;
  }, [visible, sortField, sortDir, dateField]);
  const cardsForStage = (stageId: number) => cardsByStage.get(stageId) ?? [];

  const stageIds = useMemo(() => stages.map((s) => s.id), [stages]);

  const applyReorder = (orderedIds: number[]) => {
    const unchanged =
      orderedIds.length === stageIds.length &&
      orderedIds.every((id, i) => id === stageIds[i]);
    if (unchanged) return;
    m.reorderStages.mutate(orderedIds, {
      onError: () => toast.error("Gagal mengubah urutan stage"),
    });
  };

  const onStageDrop = (targetId: number) => {
    if (stageDragId != null) applyReorder(reorderByDrag(stageIds, stageDragId, targetId));
    setStageDragId(null);
  };

  const onDrop = async (stageId: number) => {
    if (dragId == null) return;
    const id = dragId;
    setDragId(null);
    try {
      await m.moveCard.mutateAsync({ cardId: id, toStageId: stageId, toPosition: undefined });
    } catch {
      toast.error("Gagal memindahkan kartu");
    }
  };

  // Akses ditolak / pipeline tidak ditemukan (403/404 dari server) - jangan render
  // board parsial atau menggantung di "Memuat…". Data inti tetap tersembunyi.
  if (pipelineError) {
    return (
      <section
        aria-label="Akses pipeline ditolak"
        className="flex flex-col h-full -m-4 md:-m-6 -mt-16 md:-mt-6 pb-20 md:pb-0"
      >
        <div className="flex-1 flex items-center justify-center px-4 pt-16 md:pt-6">
          <EmptyState
            icon={ShieldAlert}
            title="Tidak dapat membuka pipeline"
            description={(pipelineError as Error).message || "Anda tidak memiliki akses ke pipeline ini."}
            action={teamParams
              ? { label: "Kembali ke Tim Saya", onClick: () => navigate("/teamspace/teams") }
              : { label: "Kembali ke Pipelines", onClick: () => navigate("/pipelines") }}
          />
        </div>
      </section>
    );
  }

  return (
    // Mobile: tinggi dikunci ke viewport (h-dvh + overflow-hidden) supaya HALAMAN tidak ikut
    // scroll - hanya kolom kartu yang scroll (perilaku kanban normal). Desktop: h-full lama.
    <section
      aria-label={pipeline?.name ? `Papan ${pipeline.name}` : "Papan pipeline"}
      className="flex flex-col h-dvh overflow-hidden md:h-full md:overflow-visible -m-4 md:-m-6 -mt-16 md:-mt-6 pb-20 md:pb-0"
    >
      <header className="sticky top-0 z-10 bg-background pt-16 md:pt-6 px-4 md:px-6 pb-2 border-b border-border/40">
        {/* UX Cicle: board tim = SATU baris bersih - nav modul tim + Pilih + kebab.
            Judul/deskripsi board & deretan tombol disembunyikan (redundan dgn nav tim). */}
        {teamParams && ownerTeam && (
          <TeamModuleNav team={ownerTeam} active="tasks" trailing={
            <>
              {pipeline && (
                <Button
                  type="button"
                  variant={selectMode ? "outline" : "ghost"}
                  size="sm"
                  aria-pressed={selectMode}
                  onClick={() => { setSelectMode((v) => !v); setSelectedIds(new Set()); }}
                  className={selectMode ? "border-primary text-primary" : undefined}
                >
                  <CheckSquare className="size-3.5 mr-1" aria-hidden="true" />
                  {selectMode ? `Pilih (${selectedIds.size})` : "Pilih"}
                </Button>
              )}
              {pipeline && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Menu board">
                      <MoreVertical className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    {can("export") && (
                      <DropdownMenuItem onSelect={async () => { try { await downloadCardsCsv(pid!, pipeline.name); } catch (err: any) { toast.error(err.message ?? "Gagal mengunduh CSV"); } }}>
                        <Download className="size-3.5 mr-2" /> Export CSV
                      </DropdownMenuItem>
                    )}
                    {can("import") && <DropdownMenuItem onSelect={() => setShowImport(true)}><Upload className="size-3.5 mr-2" /> Import CSV</DropdownMenuItem>}
                    {(can("export") || can("import")) && <DropdownMenuSeparator />}
                    {can("fields") && <DropdownMenuItem onSelect={() => setShowFields(true)}><ListFilter className="size-3.5 mr-2" /> Field</DropdownMenuItem>}
                    {can("manage") && <DropdownMenuItem onSelect={() => setShowAccess(true)}><KeyRound className="size-3.5 mr-2" /> Akses</DropdownMenuItem>}
                    {can("automation") && <DropdownMenuItem onSelect={() => setShowRules(true)}><Zap className="size-3.5 mr-2" /> Otomasi</DropdownMenuItem>}
                    {can("manage") && <DropdownMenuItem onSelect={() => setShowSettings(true)}><Settings2 className="size-3.5 mr-2" /> Pengaturan</DropdownMenuItem>}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </>
          } />
        )}
        {/* Mobile: tombol aksi wrap ke baris sendiri (basis-full) - kalau satu baris,
            judul pipeline (flex-1) terjepit jadi 0px oleh deretan tombol. */}
        {!(teamParams && ownerTeam) && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 md:flex-nowrap md:items-start">
          {(() => { const Icon = resolvePipelineIcon(pipeline?.icon); return (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: pipelineTint(pipeline?.color) }}>
              <Icon className="size-5" style={{ color: pipelineColor }} />
            </span>
          ); })()}
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-lg font-bold leading-tight truncate">
              {pipeline?.name ?? (pipelineLoading ? "Memuat…" : "Pipeline")}
            </h1>
            {pipeline?.description && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{pipeline.description}</p>}
          </div>
          <div role="toolbar" aria-label="Aksi pipeline" className="flex items-center gap-1 shrink-0 basis-full md:basis-auto max-w-full overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
            {pipeline && (
              <Button
                type="button"
                variant={selectMode ? "outline" : "ghost"}
                size="sm"
                aria-label={selectMode ? "Keluar mode pilih" : "Masuk mode pilih"}
                aria-pressed={selectMode}
                onClick={() => { setSelectMode((v) => !v); setSelectedIds(new Set()); }}
                className={selectMode ? "border-primary text-primary" : undefined}
              >
                <CheckSquare className="size-3.5 mr-1" aria-hidden="true" />
                {selectMode ? `Pilih (${selectedIds.size})` : "Pilih"}
              </Button>
            )}
            {pipeline && can("export") && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Unduh kartu sebagai CSV"
                onClick={async () => {
                  try {
                    await downloadCardsCsv(pid!, pipeline.name);
                  } catch (err: any) {
                    toast.error(err.message ?? "Gagal mengunduh CSV");
                  }
                }}
              >
                <Download className="size-3.5 mr-1" aria-hidden="true" />
                Export
              </Button>
            )}
            {can("import") && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Import kartu dari CSV"
                onClick={() => setShowImport(true)}
              >
                <Upload className="size-3.5 mr-1" aria-hidden="true" />
                Import
              </Button>
            )}
            {can("fields") && <Button variant="outline" size="sm" onClick={() => setShowFields(true)}>Field</Button>}
            {can("manage") && <Button variant="outline" size="sm" onClick={() => setShowAccess(true)}>Akses</Button>}
            {can("automation") && <Button variant="outline" size="sm" onClick={() => setShowRules(true)}>Otomasi</Button>}
            {can("manage") && <Button type="button" variant="ghost" size="icon-sm" aria-label="Pengaturan pipeline" onClick={() => setShowSettings(true)}><MoreVertical className="size-4" /></Button>}
          </div>
        </div>
        )}
        {/* Metrik hanya untuk pipeline ops - board tim tidak perlu (feedback user). */}
        {pipeline && pid != null && !teamParams && <MetricsStrip pipelineId={pid} canManage={can("manage")} onManage={() => setShowMetricsCfg(true)} />}
        {pipeline && <div className="mt-2"><BoardFilters search={search} onSearch={setSearch} dateField={dateField} onDateField={setDateField} range={range} onRange={setRange} assigneeId={assigneeId} onAssignee={setAssigneeId} assigneeOptions={assigneeOptions} fields={fields} filterFieldId={filterFieldId} onFilterField={setFilterFieldId} filterValue={filterValue} onFilterValue={setFilterValue} sortFieldId={sortFieldId} onSortField={setSortFieldId} sortDir={sortDir} onSortDirToggle={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))} visibleCount={visible.length} onReset={() => { setSearch(""); setRange("all"); setAssigneeId(null); setFilterFieldId(null); setFilterValue(""); setSortFieldId(null); setSortDir("asc"); }} /></div>}
      </header>
      <div
        ref={boardScrollRef}
        className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden px-4 md:px-6 pb-4 kanban-scrollbar"
        onDragOver={(e) => {
          if ((dragId == null && stageDragId == null) || !boardScrollRef.current) return;
          const r = boardScrollRef.current.getBoundingClientRect();
          boardScrollRef.current.scrollLeft += edgeScrollDelta(e.clientX, r.left, r.right);
        }}
        onDragEnd={() => { setStageDragId(null); setDragId(null); }}
      >
        <div className="flex gap-3 h-full items-stretch w-max">
          {stages.map((stage, i) => (
            <StageColumn
              key={stage.id}
              stage={stage}
              cards={cardsForStage(stage.id)}
              fields={fields}
              usersById={usersById}
              writable={!!writable}
              dragId={dragId}
              now={now}
              onDragStartCard={setDragId}
              onDropStage={onDrop}
              onCardClick={openCard}
              onAddCard={async (stageId, title) => {
                await m.createCard.mutateAsync({ stageId, title });
              }}
              onUpdateStage={async (stageId, patch) => {
                await m.updateStage.mutateAsync({ stageId, ...patch });
                toast.success("Stage diperbarui");
              }}
              onDeleteStage={async (stageId) => {
                await m.deleteStage.mutateAsync(stageId);
                toast.success("Stage dihapus");
              }}
              index={i}
              total={stages.length}
              stageDragId={stageDragId}
              onStageDragStart={setStageDragId}
              onStageDrop={onStageDrop}
              onMoveStage={(id, dir) => applyReorder(moveByOffset(stageIds, id, dir))}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onToggleCard={toggleCard}
              onToggleStage={toggleMany}
              stages={stages}
              onMoveCard={moveCardTo}
            />
          ))}
          {can("stages") && (
            <div className="w-72 shrink-0 pt-2">
              <AddStageInline
                onAdd={async (label, description) => {
                  await m.createStage.mutateAsync({ label, description: description || null });
                  toast.success("Stage ditambah");
                }}
              />
            </div>
          )}
        </div>
      </div>
      {/* Bulk action bar - only visible in select mode */}
      {selectMode && pid != null && (
        <BulkActionBar
          pipelineId={pid}
          selectedIds={selectedIds}
          caps={Array.from(caps)}
          stages={stages}
          fields={fields}
          onClear={() => setSelectedIds(new Set())}
        />
      )}
      {selectedCard != null && pid != null && (
        <CardDetailModal
          cardId={selectedCard}
          pipelineId={pid}
          onClose={closeCard}
          writable={writable}
          caps={pipeline?.capabilities ?? []}
          newTabHref={`${basePath}?card=${selectedCard}`}
        />
      )}
      {showFields && pid != null && (
        <ManageFieldsDialog pipelineId={pid} open={showFields} onClose={() => setShowFields(false)} />
      )}
      {showAccess && pid != null && (
        <PipelineAccessDialog pipelineId={pid} open={showAccess} onClose={() => setShowAccess(false)} />
      )}
      {showRules && pid != null && (
        <PipelineRulesDialog pipelineId={pid} open={showRules} onClose={() => setShowRules(false)} />
      )}
      {showSettings && pipeline && (
        <PipelineSettingsDialog pipeline={pipeline} open={showSettings} onClose={() => setShowSettings(false)}
          onDeleted={() => { setShowSettings(false); navigate(teamParams ? "/teamspace/teams" : "/pipelines"); }} />
      )}
      {showImport && pid != null && (
        <CardImportDialog pipelineId={pid} fields={fields} open={showImport} onClose={() => setShowImport(false)} />
      )}
      {showMetricsCfg && pid != null && <MetricsConfigDialog pipelineId={pid} open={showMetricsCfg} onClose={() => setShowMetricsCfg(false)} />}
    </section>
  );
}
