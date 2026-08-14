import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useCollectionsEngineMode } from "@/hooks/usePipelines";
import { api } from "@/lib/api";
import { waLink } from "@/lib/wa";
import { COLLECTION_ISSUE_TYPES, COLLECTION_ISSUE_LABELS, type CollectionIssueType, type Collection, type CollectionStageRow } from "@shared/schema";
import { isSharedStage, parseOwnerDivisions } from "@shared/collectionSop";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { AlertTriangle, X, CheckCircle2, Loader2, RefreshCw, ArrowRight, Settings, History, Camera, Upload, Move, ListTree, SlidersHorizontal, ChevronDown, Search } from "lucide-react";
import { matchesSearch } from "@/lib/search";
import { CollectionCard } from "./collection/CollectionCard";
import { CollectionDetail } from "./collection/CollectionDetail";
import { CollectionSettingsDialog } from "./collection/CollectionSettingsDialog";
import { PipelineManagerDialog } from "./collection/PipelineManagerDialog";
import { StageCtx, isStageActive, toDateInput, type CollectionStage, type StageHelpers, type Assignee, type CollectionWithCustomer } from "./collection/shared";

export default function CollectionPipelinePage({ division }: { division?: "cs" | "marketing" } = {}) {
  const { user, canWrite } = useAuth();
  const qc = useQueryClient();
  const scopePerm = division === "cs" ? "customers" : division === "marketing" ? "leads" : "collections";
  const canEdit = canWrite("collections") || canWrite(scopePerm);
  // Kelola Pipeline (kelola stage + divisi penanggung jawab): HANYA super admin / admin.
  // Operasi kartu sehari-hari tetap pakai canEdit (izin write divisi).
  const canManageStages = Boolean(user?.isSystemAdmin) || (user?.roleName ?? "") === "Admin";
  const [, navigate] = useLocation();

  // Suffix query param divisi untuk semua endpoint collection (scoping + izin fallback).
  const withDiv = (path: string) => division ? path + (path.includes("?") ? "&" : "?") + `division=${division}` : path;

  // Meta divisi untuk header + judul.
  const DIV_META: Record<string, { title: string; desc: string }> = {
    cs: { title: "Pipeline Reaktivasi - Layanan Pelanggan", desc: "Kartu delegasi dari Finance. Hubungi & tindak lanjut 7 hari sebelum eskalasi ke Marketing." },
    marketing: { title: "Pipeline Reaktivasi - Marketing", desc: "Kartu delegasi untuk kunjungan/reaktivasi PIC sales. Tahap akhir SOP churn." },
  };

  // -- Collections cutover: tampilkan interstitial kalau mode = pipeline --------
  // CATATAN: TIDAK ada auto-redirect - escape hatch "Lihat data lama" harus tetap
  // bisa diklik agar cutover reversible (verifikasi/rollback). Lihat early-return
  // di bawah yang menampilkan banner ketimbang board.
  // Scoped view (cs/marketing) selalu pakai board legacy - jangan panggil engine-mode
  // (user divisi tsb tak punya izin 'collections' → hindari 403).
  const { data: engineMode, isLoading: engineModeLoading } = useCollectionsEngineMode({ enabled: !division });
  const [stayLegacy, setStayLegacy] = useState(false);
  const pipelineMode =
    !division && engineMode?.mode === "pipeline" && engineMode.pipelineId != null;
  const showInterstitial = pipelineMode && !stayLegacy && !engineModeLoading;

  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [selectedStage, setSelectedStage] = useState<CollectionStage | "all">("all");
  const [search, setSearch] = useState(""); // cari: nama, pppoe, id_pelanggan, no. HP
  const [detailId, setDetailId] = useState<number | null>(null);
  // Unified stage change dialog - dipakai untuk drag-drop + tombol manual
  const [stageDialogFor, setStageDialogFor] = useState<{ id: number; fromStage: CollectionStage; targetStage: CollectionStage; targetRole: string; customerName?: string } | null>(null);
  const [stageIssueType, setStageIssueType] = useState<CollectionIssueType>("no_contact");
  const [stagePromiseDate, setStagePromiseDate] = useState("");
  const [stageCloseReason, setStageCloseReason] = useState("");
  const [stageNote, setStageNote] = useState("");
  const [stagePhoto, setStagePhoto] = useState<string | null>(null);
  const stagePhotoInputRef = useRef<HTMLInputElement>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pipelineMgrOpen, setPipelineMgrOpen] = useState(false);
  // Drag-drop state
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverStage, setDragOverStage] = useState<CollectionStage | null>(null);

  // -- Queries --
  // Refetch interval hanya aktif ketika tab aktif (hemat bandwidth + server load)
  const { data: collections, isLoading, refetch, isFetching } = useQuery<CollectionWithCustomer[]>({
    queryKey: ["/api/collections", selectedStage, division ?? "all-div"],
    queryFn: () => {
      const q = selectedStage === "all" ? "" : `?stage=${selectedStage}`;
      return api.get<CollectionWithCustomer[]>(withDiv(`/collections${q}`));
    },
    refetchInterval: (query) => query.state.error ? false : 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });

  const { data: customers } = useQuery<any[]>({
    queryKey: ["customers"],
    queryFn: () => api.get<any[]>("/customers"),
    staleTime: 2 * 60_000, // lebih agresif caching karena customer list jarang berubah
  });

  const { data: users } = useQuery<any[]>({
    queryKey: ["/api/users"],
    queryFn: () => api.get<any[]>("/users"),
    staleTime: 5 * 60_000, // users list sangat jarang berubah
  });

  const { data: stats } = useQuery({
    queryKey: ["/api/collections/stats", division ?? "all-div"],
    queryFn: () => api.get(withDiv("/collections/stats")),
    refetchInterval: (query) => query.state.error ? false : 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });

  // Pipeline stage dinamis per-mitra (urut posisi).
  const { data: allStagesData = [] } = useQuery<CollectionStageRow[]>({
    queryKey: ["/api/collections/stages", division ?? "all-div"],
    queryFn: () => api.get<CollectionStageRow[]>(withDiv("/collections/stages")),
    staleTime: 60_000,
  });
  // Kolom board: hanya stage AKTIF. Scoped view (cs/marketing) = stage milik divisi ini +
  // stage SHARED (owner kosong/"all" atau role terminal paid/writeoff/dismantel) - lihat
  // isSharedStage(). Full view (Finance) = semua stage aktif.
  const stages = useMemo(() => {
    const active = allStagesData.filter(isStageActive);
    if (!division) return active;
    return active.filter((s) => parseOwnerDivisions((s as any).ownerDivision).includes(division) || isSharedStage(s as any));
  }, [allStagesData, division]);
  const stageHelpers = useMemo<StageHelpers>(() => {
    const m = new Map(allStagesData.map((s) => [s.key, s]));
    return {
      // stages = SEMUA stage AKTIF (daftar target pindah-stage di detail) - kartu tak boleh
      // dipindah ke stage nonaktif. Label/color tetap resolve dari peta lengkap (allStagesData)
      // supaya kartu yang masih nyangkut di stage nonaktif tetap tampil labelnya.
      stages: allStagesData.filter(isStageActive),
      label: (k) => m.get(k)?.label ?? k,
      color: (k) => m.get(k)?.color ?? "#6B7280",
      role: (k) => m.get(k)?.role ?? "none",
    };
  }, [allStagesData]);
  const stageLabel = stageHelpers.label;
  const stageColor = stageHelpers.color;

  const customerById = useMemo(() => {
    const m = new Map<number, any>();
    for (const c of customers ?? []) m.set(c.id, c);
    return m;
  }, [customers]);

  const userById = useMemo(() => {
    const m = new Map<number, any>();
    for (const u of users ?? []) m.set(u.id, u);
    return m;
  }, [users]);

  // Enrich dengan nama pelanggan
  const enriched = useMemo(() => {
    return (collections ?? []).map((c) => {
      const cust = customerById.get(c.customerId);
      return {
        ...c,
        customerName: cust?.name ?? `Customer #${c.customerId}`,
        customerPhone: cust?.phone ?? null,
        customerIdDisplay: cust?.customerId ?? "-",
        pppoeUsername: cust?.pppoeUsername ?? null,
      };
    });
  }, [collections, customerById]);

  // Pencarian client-side: nama pelanggan, pppoe, id_pelanggan, no. HP.
  const searchFiltered = useMemo(() => {
    if (!search.trim()) return enriched;
    return enriched.filter((c) =>
      matchesSearch(search, [c.customerName, c.pppoeUsername, c.customerIdDisplay, c.customerPhone], c.customerPhone),
    );
  }, [enriched, search]);

  const byStage = useMemo(() => {
    const map: Record<string, CollectionWithCustomer[]> = {};
    for (const s of stages) map[s.key] = [];
    for (const c of searchFiltered) {
      const s = (c.stage ?? "new") as string;
      // Legacy fold: stage 'promised' lama → tampilkan di 'contacted' kalau ada.
      const targetStage = s === "promised" && map["contacted"] ? "contacted" : s;
      if (!map[targetStage]) map[targetStage] = [];
      map[targetStage].push(c);
    }
    return map;
  }, [searchFiltered, stages]);

  // -- Mutations --
  const stageMut = useMutation({
    mutationFn: async (data: { id: number; stage: string; issueType?: string; promiseDate?: string; closeReason?: string; note?: string; photoData?: string }) => {
      // Step 1: patch stage
      await api.patch(withDiv(`/collections/${data.id}/stage`), {
        stage: data.stage,
        issueType: data.issueType,
        promiseDate: data.promiseDate,
        closeReason: data.closeReason,
      });
      // Step 2: kalau ada note/photo, attach sebagai activity
      if (data.note || data.photoData) {
        await api.post(withDiv(`/collections/${data.id}/activity`), {
          type: data.photoData ? "photo" : "note",
          content: data.note || "Foto bukti",
          photoData: data.photoData,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/collections"] });
      qc.invalidateQueries({ queryKey: ["/api/collections/stats"] });
      toast.success("Stage berhasil dipindah");
      setStageDialogFor(null);
      setStagePromiseDate("");
      setStageCloseReason("");
      setStageNote("");
      setStagePhoto(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const assignMut = useMutation({
    mutationFn: (data: { id: number; userIds: number[] }) =>
      api.put(withDiv(`/collections/${data.id}/assignees`), { userIds: data.userIds }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/collections"] });
      qc.invalidateQueries({ queryKey: ["/api/collections", vars.id] });
      toast.success(vars.userIds.length === 0 ? "Assignee dikosongkan" : `${vars.userIds.length} user di-assign`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const addActivityMut = useMutation({
    mutationFn: ({ id, type, content }: { id: number; type: string; content: string }) =>
      api.post(withDiv(`/collections/${id}/activity`), { type, content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/collections"] });
      toast.success("Catatan ditambahkan");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/collections/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/collections"] });
      toast.success("Collection dihapus");
      setDeleteId(null);
      setDetailId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleMoveStage = (id: number, targetStage: CollectionStage) => {
    if (!canEdit) return toast.error("Tidak punya akses write collections");
    const col = enriched.find(c => c.id === id);
    if (!col) return;
    if (col.stage === targetStage) return; // no-op
    // SEMUA stage change sekarang buka dialog konfirmasi (dengan note + photo opsional)
    setStageDialogFor({
      id,
      fromStage: col.stage as CollectionStage,
      targetStage,
      targetRole: stageHelpers.role(targetStage),
      customerName: col.customerName,
    });
    setStageIssueType("no_contact");
    // Pre-fill tenggat dari kartu supaya pindah stage tidak menghapus janji bayar yang sudah ada.
    setStagePromiseDate(toDateInput(col.promiseDate));
    setStageCloseReason("");
    setStageNote("");
    setStagePhoto(null);
  };

  const submitStageDialog = () => {
    if (!stageDialogFor) return;
    const { id, targetStage, targetRole } = stageDialogFor;
    const isTerminal = targetRole === "paid" || targetRole === "writeoff" || targetRole === "dismantel";
    stageMut.mutate({
      id,
      stage: targetStage,
      issueType: !isTerminal && stageIssueType ? stageIssueType : undefined,
      promiseDate: stagePromiseDate || undefined, // opsional di stage manapun
      closeReason: targetRole === "writeoff" ? (stageCloseReason || "manual_write_off")
        : targetRole === "dismantel" ? (stageCloseReason || "manual_dismantel") : undefined,
      note: stageNote.trim() || undefined,
      photoData: stagePhoto ?? undefined,
    });
  };

  const handleStagePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("File harus berupa gambar");
    try {
      const { compressImage } = await import("@/lib/imageCompress");
      const result = await compressImage(file);
      setStagePhoto(result.dataUrl);
    } catch (err: any) {
      toast.error(err?.message || "Gagal proses foto");
    }
  };

  // -- Drag-and-drop handlers --
  const handleDragStart = (id: number) => (e: React.DragEvent) => {
    if (!canEdit) { e.preventDefault(); return; }
    setDraggingId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(id));
  };
  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverStage(null);
  };
  const handleColumnDragOver = (stage: CollectionStage) => (e: React.DragEvent) => {
    if (!canEdit) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverStage !== stage) setDragOverStage(stage);
  };
  const handleColumnDrop = (targetStage: CollectionStage) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverStage(null);
    const id = Number(e.dataTransfer.getData("text/plain")) || draggingId;
    setDraggingId(null);
    if (!id) return;
    handleMoveStage(id, targetStage);
  };

  // Pipeline-mode: tampilkan interstitial (TANPA auto-redirect) ketimbang board lama.
  if (showInterstitial && engineMode?.pipelineId != null) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] gap-4 px-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
          <ArrowRight className="h-6 w-6 text-primary" />
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-bold">Penagihan kini dikelola di pipeline</h1>
          <p className="text-sm text-muted-foreground max-w-md">
            Modul penagihan kini dikelola lewat pipeline.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={() => navigate(`/pipelines/${engineMode.pipelineId}`)}>
            Buka Pipeline
            <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
          <Button variant="ghost" onClick={() => setStayLegacy(true)}>
            Lihat data lama (read-only)
          </Button>
        </div>
      </div>
    );
  }

  return (
    <StageCtx.Provider value={stageHelpers}>
    {/* ============ COLLECTIONS PIPELINE PAGE (root) ============ */}
    <div data-section="collections-page" data-division={division ?? "all"} className="flex flex-col h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)] overflow-hidden">
      {/* ==== Header (non-scroll): judul + toolbar + filter ==== */}
      <div data-section="collections-header" className="px-3 md:px-6 pt-3 md:pt-6 space-y-3 md:space-y-4 shrink-0">
        {/* Title row + action toolbar */}
        <div data-section="collections-toolbar" className="flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg md:text-2xl font-bold flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 md:h-6 md:w-6 text-destructive shrink-0" />
              {division ? DIV_META[division].title : "Collection Pipeline"}
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-0.5 md:mt-1 line-clamp-1 md:line-clamp-none">
              {division ? DIV_META[division].desc : "Pelanggan isolir - auto-create saat isolir, auto-close saat bayar."}
            </p>
          </div>
          <div className="flex gap-1.5 items-center shrink-0">
            {/* Kelola pipeline (stage + SLA) - tersedia di board penuh DAN view scoped CS/Marketing
                (permintaan user: tiap divisi bisa atur pipeline-nya). Gated izin edit divisi. */}
            {canManageStages && (
              <Button size="sm" variant="outline" onClick={() => setPipelineMgrOpen(true)} title="Kelola pipeline (stage + divisi + SLA) - admin" className="h-8 gap-1.5 px-2.5">
                <ListTree className="h-4 w-4" />
                <span className="hidden sm:inline text-xs">Kelola Pipeline</span>
              </Button>
            )}
            {!division && (
              <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)} title="Pengaturan parameter" className="h-8 w-8 p-0">
                <Settings className="h-4 w-4" />
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="h-8 w-8 p-0">
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <div className="flex rounded-md border overflow-hidden text-xs h-8">
              <button onClick={() => setViewMode("kanban")} className={`px-2.5 md:px-3 ${viewMode === "kanban" ? "bg-primary text-primary-foreground" : "bg-transparent"}`}>Kanban</button>
              <button onClick={() => setViewMode("list")} className={`px-2.5 md:px-3 ${viewMode === "list" ? "bg-primary text-primary-foreground" : "bg-transparent"}`}>List</button>
            </div>
          </div>
        </div>

        {/* ==== Filter bar (tahap dropdown + pencarian + hitung kartu) ==== */}
        {/* Filter ringkas (dropdown) - fokus ke pipeline. KPI (total open/tagihan/aging/janji/
            bermasalah) sudah tersedia di Dashboard divisi, tidak diulang di sini. */}
        <div data-section="collections-filters" className="flex items-center gap-2 flex-wrap pb-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <SlidersHorizontal className="h-3.5 w-3.5" /> Filter
          </span>
          <div className="relative">
            <select
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value as CollectionStage | "all")}
              aria-label="Filter tahap"
              className="h-8 pl-3 pr-8 rounded-lg border border-border bg-card text-xs font-semibold text-foreground appearance-none cursor-pointer hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="all">Tahap: Semua ({enriched.length})</option>
              {stages.map((s) => (
                <option key={s.key} value={s.key}>{s.label} ({(stats as any)?.byStage?.[s.key] ?? 0})</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          </div>
          {/* Pencarian: nama, PPPoE, ID pelanggan, no. HP */}
          <div className="relative min-w-[200px] flex-1 sm:flex-none sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama / PPPoE / ID pelanggan / no. HP"
              aria-label="Cari kartu"
              className="h-8 w-full pl-8 pr-8 rounded-lg border border-border bg-card text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Bersihkan pencarian"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {search.trim() ? `${searchFiltered.length} / ${enriched.length}` : enriched.length} kartu
          </span>
        </div>
      </div>

      {/* ==== Content area (scrollable): kanban board ATAU list view ==== */}
      {isLoading ? (
        <div data-section="collections-loading" className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : viewMode === "kanban" ? (
        /* === KANBAN BOARD - horizontal scroll outer, vertical scroll per-column === */
        <div data-section="kanban-board" className="flex-1 overflow-x-auto overflow-y-hidden px-4 md:px-6 pb-4 kanban-scrollbar snap-x snap-mandatory md:snap-none">
          <div data-section="kanban-columns" className="flex gap-3 h-full items-stretch w-max">
            {stages.filter(s => selectedStage === "all" || selectedStage === s.key).map((sRow) => {
              const stage = sRow.key;
              const isDropTarget = dragOverStage === stage;
              return (
                /* One column per pipeline stage (drop target) */
                <div
                  key={stage}
                  data-section="kanban-column"
                  data-stage={stage}
                  data-drop-target={isDropTarget ? "true" : undefined}
                  onDragOver={handleColumnDragOver(stage)}
                  onDragLeave={() => setDragOverStage(prev => prev === stage ? null : prev)}
                  onDrop={handleColumnDrop(stage)}
                  className={`w-[82vw] max-w-[19rem] sm:w-72 shrink-0 snap-start flex flex-col h-full rounded-xl p-3 transition-colors ${isDropTarget ? "bg-primary/10 ring-2 ring-primary/40" : "bg-muted/40"}`}
                >
                  {/* Column header: warna + label + jumlah kartu */}
                  <div data-section="kanban-column-header" className="flex items-center justify-between mb-3 px-1 shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: sRow.color }} />
                      <span className="text-sm font-semibold uppercase tracking-wide">{sRow.label}</span>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">{(byStage[stage] ?? []).length}</Badge>
                  </div>
                  {/* Per-column scroll area (daftar kartu) */}
                  <div data-section="kanban-column-cards" className="flex-1 overflow-y-auto column-scrollbar space-y-2 pr-1 pb-2 min-h-0">
                    {(byStage[stage] ?? []).map((c) => (
                      /* Draggable card wrapper (satu kartu collection) */
                      <div
                        key={c.id}
                        data-section="kanban-card"
                        data-collection-id={c.id}
                        draggable={canEdit}
                        onDragStart={handleDragStart(c.id)}
                        onDragEnd={handleDragEnd}
                        className={draggingId === c.id ? "opacity-40" : ""}
                      >
                        <CollectionCard c={c} onClick={() => setDetailId(c.id)} userById={userById} />
                      </div>
                    ))}
                    {(byStage[stage] ?? []).length === 0 && (
                      /* Empty-column placeholder / drop hint */
                      <div data-section="kanban-column-empty" className={`text-xs text-center py-6 border border-dashed rounded-lg transition-colors ${isDropTarget ? "border-primary/60 text-primary bg-primary/5" : "text-muted-foreground"}`}>
                        {isDropTarget ? <><Move className="h-4 w-4 inline mr-1" />Drop di sini</> : "Kosong"}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* === LIST VIEW - full-page vertical scroll === */
        <div data-section="collections-list" className="flex-1 overflow-y-auto overflow-x-hidden px-4 md:px-6 pb-4 kanban-scrollbar">
          <div className="space-y-2 pb-2">
            {searchFiltered.map((c) => (
              <CollectionCard key={c.id} c={c} onClick={() => setDetailId(c.id)} userById={userById} />
            ))}
            {searchFiltered.length === 0 && (
              <div data-section="collections-list-empty" className="py-12 text-center text-sm text-muted-foreground">Tidak ada kartu yang cocok.</div>
            )}
          </div>
        </div>
      )}

      {/* Detail Dialog - key={detailId} memaksa instance baru tiap kartu supaya state internal
          (photoViewer, catatan, riwayat) tidak bocor antar-kartu. */}
      <CollectionDetail
        key={detailId ?? "none"}
        id={detailId}
        division={division}
        onClose={() => setDetailId(null)}
        canEdit={canEdit}
        users={users ?? []}
        onMoveStage={handleMoveStage}
        onAssign={(id, userIds) => assignMut.mutate({ id, userIds })}
        onAddActivity={(id, type, content) => addActivityMut.mutate({ id, type, content })}
        onDelete={(id) => setDeleteId(id)}
        isSystemAdmin={user?.isSystemAdmin ?? false}
        waLink={waLink}
        customerById={customerById}
      />

      {/* ==== Stage-move confirmation dialog - untuk drag-drop + tombol manual ==== */}
      <Dialog open={!!stageDialogFor} onOpenChange={(o) => !o && setStageDialogFor(null)}>
        <DialogContent data-section="stage-move-dialog" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Move className="h-5 w-5 text-primary" />
              Pindahkan Stage
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 pt-1">
                {stageDialogFor && (
                  <div className="font-medium text-foreground">
                    {stageDialogFor.customerName ?? "Collection"}
                  </div>
                )}
                {stageDialogFor && (
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="secondary" style={{ backgroundColor: stageColor(stageDialogFor.fromStage) + "20", color: stageColor(stageDialogFor.fromStage) }}>
                      {stageLabel(stageDialogFor.fromStage)}
                    </Badge>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <Badge variant="secondary" style={{ backgroundColor: stageColor(stageDialogFor.targetStage) + "20", color: stageColor(stageDialogFor.targetStage) }}>
                      {stageLabel(stageDialogFor.targetStage)}
                    </Badge>
                  </div>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>

          {/* Body: field kondisional per-peran stage tujuan */}
          <div data-section="stage-move-fields" className="space-y-3 max-h-[50vh] overflow-y-auto -mx-6 px-6">
            {/* Field berdasar PERAN stage tujuan (bukan key) supaya cocok dengan pipeline custom */}
            {/* Janji Bayar + kategori kendala - opsional, untuk stage non-terminal */}
            {stageDialogFor && stageDialogFor.targetRole !== "paid" && stageDialogFor.targetRole !== "writeoff" && stageDialogFor.targetRole !== "dismantel" && (
              <>
                <div>
                  <Label className="text-xs">Tanggal Janji Bayar (opsional)</Label>
                  <Input type="date" value={stagePromiseDate} onChange={(e) => setStagePromiseDate(e.target.value)} className="mt-1" />
                  <p className="text-[10px] text-muted-foreground mt-1">Kalau pelanggan janji bayar, isi tanggalnya.</p>
                </div>
                <div>
                  <Label className="text-xs">Kategori Kendala (opsional)</Label>
                  <select value={stageIssueType} onChange={(e) => setStageIssueType(e.target.value as CollectionIssueType)}
                          className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm mt-1">
                    {COLLECTION_ISSUE_TYPES.map((t) => (
                      <option key={t} value={t}>{COLLECTION_ISSUE_LABELS[t]}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
            {stageDialogFor?.targetRole === "writeoff" && (
              <div>
                <Label className="text-xs">Alasan Write-Off</Label>
                <Textarea value={stageCloseReason} onChange={(e) => setStageCloseReason(e.target.value)}
                          placeholder="Kenapa tidak bisa ditagih lagi..." rows={2} className="mt-1" />
              </div>
            )}
            {stageDialogFor?.targetRole === "paid" && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-success/10 border border-success">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                <div className="text-xs text-success">
                  <div className="font-semibold">Manual mark sebagai Lunas</div>
                  <div className="mt-0.5 text-[11px]">Pastikan pembayaran sudah diterima. Kalau belum terdeteksi di billing sync, upload bukti transfer di bawah.</div>
                </div>
              </div>
            )}
            {stageDialogFor?.targetRole === "dismantel" && (
              <div>
                <div className="flex items-start gap-2 p-3 rounded-md bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 mb-3">
                  <div className="text-xs text-purple-800 dark:text-purple-200">
                    <div className="font-semibold">Dismantel / Bongkar Perangkat</div>
                    <div className="mt-0.5 text-[11px]">Pelanggan berhenti dan perangkat dibongkar. Kartu ditutup dan hasilnya masuk ke laporan Keuangan.</div>
                  </div>
                </div>
                <Label className="text-xs">Alasan Dismantel</Label>
                <Textarea value={stageCloseReason} onChange={(e) => setStageCloseReason(e.target.value)}
                          placeholder="Alasan pelanggan berhenti / dibongkar..." rows={2} className="mt-1" />
              </div>
            )}

            {/* Catatan (semua stage) */}
            <div data-section="stage-move-note">
              <Label className="text-xs">Catatan / Keterangan</Label>
              <Textarea
                value={stageNote}
                onChange={(e) => setStageNote(e.target.value)}
                placeholder="Alasan pindah stage, hasil kontak, info tambahan..."
                rows={2}
                className="mt-1"
              />
            </div>

            {/* Upload foto bukti */}
            <div data-section="stage-move-photo">
              <Label className="text-xs flex items-center gap-1.5">
                <Camera className="h-3.5 w-3.5" />
                Bukti Foto (opsional)
              </Label>
              <p className="text-[10px] text-muted-foreground mb-1.5">Screenshot WA, bukti transfer, foto lokasi, dsb. Auto di-compress.</p>
              {stagePhoto ? (
                <div className="relative inline-block">
                  <img src={stagePhoto} alt="bukti" className="h-32 w-32 object-cover rounded-md border" />
                  <button
                    onClick={() => setStagePhoto(null)}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive text-white flex items-center justify-center hover:brightness-95"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => stagePhotoInputRef.current?.click()}
                  className="w-full"
                >
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  Pilih / Ambil Foto
                </Button>
              )}
              <input
                ref={stagePhotoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleStagePhotoSelect}
              />
            </div>
          </div>

          {/* Footer aksi */}
          <div data-section="stage-move-actions" className="flex gap-2 pt-3 border-t">
            <Button variant="outline" onClick={() => setStageDialogFor(null)} className="flex-1" disabled={stageMut.isPending}>
              Batal
            </Button>
            <Button onClick={submitStageDialog} disabled={stageMut.isPending} className="flex-1">
              {stageMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Konfirmasi Pindah
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==== Delete-confirm dialog ==== */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent data-section="collection-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Collection?</AlertDialogTitle>
            <AlertDialogDescription>
              Record collection akan dihapus permanen beserta semua activities. Tindakan ini tidak dapat dibatalkan.
              (History pembayaran di billing tetap ada.)
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMut.mutate(deleteId)} className="bg-destructive hover:brightness-95">
              Hapus Permanen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Settings Dialog (parameter collection) */}
      <CollectionSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} isAdmin={user?.isSystemAdmin === true} />

      {/* Pipeline Manager (CRUD stage) - terima SEMUA stage (allStagesData); dialog yang
          meng-scope + grup per divisi sendiri. `division` menentukan view (cs/marketing =
          hanya divisi itu + shared; undefined = semua, dikelompokkan per owner). */}
      <PipelineManagerDialog
        open={pipelineMgrOpen}
        onClose={() => setPipelineMgrOpen(false)}
        stages={allStagesData}
        cardCounts={(stats as any)?.byStage ?? {}}
        division={division}
        canManage={canManageStages}
      />
    </div>
    </StageCtx.Provider>
  );
}

// --- SETTINGS DIALOG --------------------------------------------------------

