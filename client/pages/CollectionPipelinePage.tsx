import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useCollectionsEngineMode } from "@/hooks/usePipelines";
import { api } from "@/lib/api";
import { waLink } from "@/lib/wa";
import { InfoRow } from "@/components/pipelines/InfoRow";
import {
  COLLECTION_ISSUE_TYPES,
  COLLECTION_ISSUE_LABELS,
  COLLECTION_OWNER_DIVISIONS,
  type CollectionIssueType,
  type Collection,
  type CollectionStageRow,
} from "@shared/schema";
import { isSharedStage } from "@shared/collectionSop";

/** Aktif jika kolom active null/1 (0 = nonaktif). Toleran data lama tanpa kolom. */
const isStageActive = (s: any): boolean => Number(s?.active ?? 1) !== 0;
/** Label divisi penanggung jawab untuk tampilan (null/"all" = Shared). */
const ownerDivisionLabel = (owner?: string | null): string => {
  const v = String(owner ?? "").toLowerCase().trim();
  if (v === "" || v === "all") return "Semua Divisi (Shared)";
  return COLLECTION_OWNER_DIVISIONS.find((o) => o.value === v)?.label ?? owner ?? "";
};

// Stage value sekarang dinamis (custom per-mitra) - sekadar string key.
type CollectionStage = string;
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  AlertTriangle, Phone, MessageSquare, ChevronRight, X, Clock, User as UserIcon,
  CheckCircle2, XCircle, Loader2, RefreshCw, Calendar, DollarSign, FileText,
  PhoneCall, StickyNote, ArrowRight, Navigation, Edit, Trash2, Users as UsersIcon,
  Settings, History, Info, Camera, Upload, Move, GripVertical, Plus, ListTree,
  SlidersHorizontal, ChevronDown, Search,
} from "lucide-react";
import { matchesSearch } from "@/lib/search";

// -- Stage metadata context (dinamis per-mitra) ------------------------------
interface StageHelpers {
  stages: CollectionStageRow[];
  label: (key: string) => string;
  color: (key: string) => string;
  role: (key: string) => string;
}
const StageCtx = createContext<StageHelpers>({
  stages: [], label: (k) => k, color: () => "#6B7280", role: () => "none",
});
const useStages = () => useContext(StageCtx);

interface Assignee { userId: number; userName: string; username: string; }

interface CollectionWithCustomer extends Collection {
  activities?: any[];
  assignees?: Assignee[];
  customerName?: string;
  customerPhone?: string | null;
  customerIdDisplay?: string;
  pppoeUsername?: string | null;
}

const fmtRp = (n: number | null | undefined) =>
  n ? `Rp ${n.toLocaleString("id-ID")}` : "-";

const fmtDate = (s: string | null | undefined) => {
  if (!s) return "-";
  try {
    return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return s; }
};

const daysSince = (iso: string | null | undefined): number => {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
};

const ACTIVITY_CFG: Record<string, { label: string; icon: any; color: string }> = {
  note: { label: "Catatan", icon: StickyNote, color: "#6B7280" },
  call: { label: "Telepon", icon: PhoneCall, color: "#3B82F6" },
  whatsapp: { label: "WhatsApp", icon: MessageSquare, color: "#22C55E" },
  visit: { label: "Kunjungan", icon: Navigation, color: "#8B5CF6" },
  stage_change: { label: "Pindah Stage", icon: ArrowRight, color: "#F59E0B" },
  issue_set: { label: "Kendala", icon: AlertTriangle, color: "#DC2626" },
  promise_made: { label: "Janji Bayar", icon: Calendar, color: "#F59E0B" },
  auto_opened: { label: "Sistem: Isolir", icon: AlertTriangle, color: "#EF4444" },
  auto_closed: { label: "Sistem: Lunas", icon: CheckCircle2, color: "#22C55E" },
  payment_detected: { label: "Pembayaran", icon: DollarSign, color: "#22C55E" },
  assigned: { label: "Ditugaskan", icon: UserIcon, color: "#6366F1" },
};

/** division: undefined = board penuh (Keuangan/Finance). "cs"/"marketing" = view ter-scope
 * SOP delegasi - hanya menampilkan kartu di stage milik divisi tsb (cross-check delegasi). */
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
    return active.filter((s) => String((s as any).ownerDivision ?? "").toLowerCase() === division || isSharedStage(s as any));
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
    setStagePromiseDate("");
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
              <AlertTriangle className="h-5 w-5 md:h-6 md:w-6 text-red-500 shrink-0" />
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
              <div className="flex items-start gap-2 p-3 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                <div className="text-xs text-green-800 dark:text-green-200">
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
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600"
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
            <AlertDialogAction onClick={() => deleteId && deleteMut.mutate(deleteId)} className="bg-red-500 hover:bg-red-600">
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

function CollectionSettingsDialog({ open, onClose, isAdmin }: { open: boolean; onClose: () => void; isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data: settings } = useQuery<any>({
    queryKey: ["/api/collections/settings"],
    queryFn: () => api.get("/collections/settings"),
    enabled: open,
  });

  const [enabled, setEnabled] = useState(true);
  const [triggerDays, setTriggerDays] = useState("3");
  const [writeoffDays, setWriteoffDays] = useState("0");
  const [reminderH3, setReminderH3] = useState(false);

  // Pre-fill saat settings loaded (pakai useEffect, bukan useMemo, karena ada side effect)
  useEffect(() => {
    if (settings) {
      setEnabled(settings.enabled ?? true);
      setTriggerDays(String(settings.triggerDays ?? 3));
      setWriteoffDays(String(settings.writeoffDays ?? 0));
      setReminderH3(settings.reminderH3Enabled ?? false);
    }
  }, [settings]);

  const saveMut = useMutation({
    mutationFn: (data: any) => api.put("/collections/settings", data),
    onSuccess: () => {
      toast.success("Pengaturan disimpan");
      qc.invalidateQueries({ queryKey: ["/api/collections/settings"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const runNowMut = useMutation({
    mutationFn: () => api.post("/collections/run-thresholds", {}),
    onSuccess: (data: any) => {
      const opened = data?.opened ?? 0;
      const wo = data?.writtenOff ?? 0;
      toast.success(`Threshold check selesai: ${opened} collection dibuka, ${wo} di-writeoff`);
      qc.invalidateQueries({ queryKey: ["/api/collections"] });
      qc.invalidateQueries({ queryKey: ["/api/collections/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/collections/settings"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSave = () => {
    const t = Number(triggerDays);
    const w = Number(writeoffDays);
    if (isNaN(t) || t < 0 || t > 365) return toast.error("Trigger days harus 0-365");
    if (isNaN(w) || w < 0 || w > 3650) return toast.error("Writeoff days harus 0-3650");
    saveMut.mutate({ enabled, triggerDays: t, writeoffDays: w, reminderH3Enabled: reminderH3 });
  };

  return (
    /* ============ COLLECTION SETTINGS DIALOG (parameter) ============ */
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-section="collection-settings-dialog" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            Pengaturan Parameter Collection
          </DialogTitle>
          <DialogDescription className="text-xs">
            Atur kapan pelanggan otomatis masuk collection pipeline dan policy write-off.
            {!isAdmin && <span className="text-amber-600 block mt-1">Hanya admin yang bisa ubah settings ini (read-only untuk kamu).</span>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-md">
            <input type="checkbox" id="colEnabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={!isAdmin} />
            <label htmlFor="colEnabled" className="flex-1 text-sm cursor-pointer">
              <div className="font-medium">Collection Auto-Trigger Aktif</div>
              <div className="text-[11px] text-muted-foreground">Matikan untuk pause auto-open collection (manual only)</div>
            </label>
          </div>

          <div className="space-y-2">
            <Label className="text-sm flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Masuk Collection setelah berapa hari overdue?
            </Label>
            <div className="flex items-center gap-2">
              <Input type="number" min="0" max="365" value={triggerDays} onChange={(e) => setTriggerDays(e.target.value)} disabled={!isAdmin} className="w-24 font-mono" />
              <span className="text-sm text-muted-foreground">hari setelah jatuh tempo</span>
            </div>
            <p className="text-[11px] text-muted-foreground bg-blue-50 dark:bg-blue-950/30 rounded p-2">
               Contoh: <strong>3 hari</strong> = pelanggan masuk collection 3 hari setelah jatuh tempo tagihan (preventif, sebelum diisolir).
              Atur 0 untuk trigger di hari yang sama.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm flex items-center gap-1.5">
              <XCircle className="h-3.5 w-3.5" />
              Auto Write-Off setelah berapa hari?
            </Label>
            <div className="flex items-center gap-2">
              <Input type="number" min="0" max="3650" value={writeoffDays} onChange={(e) => setWriteoffDays(e.target.value)} disabled={!isAdmin} className="w-24 font-mono" />
              <span className="text-sm text-muted-foreground">hari (0 = nonaktif)</span>
            </div>
            <p className="text-[11px] text-muted-foreground bg-amber-50 dark:bg-amber-950/30 rounded p-2">
               Collection yang sudah open &gt; N hari akan otomatis di-move ke stage <strong>written_off</strong>.
              Contoh: <strong>90 hari</strong> untuk cleanup pelanggan yang tidak ada harapan bayar.
              Set 0 untuk menonaktifkan (harus manual write-off).
            </p>
          </div>

          <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-md opacity-60">
            <input type="checkbox" id="reminderH3" checked={reminderH3} onChange={(e) => setReminderH3(e.target.checked)} disabled={!isAdmin} />
            <label htmlFor="reminderH3" className="flex-1 text-sm cursor-pointer">
              <div className="font-medium">Kirim Reminder WA H-3 Sebelum Jatuh Tempo</div>
              <div className="text-[11px] text-muted-foreground">Coming soon - otomatis kirim WhatsApp via MPWA pakai template "tagihan_reminder"</div>
            </label>
          </div>

          {settings?.lastRunAt && (
            <div className="text-[11px] text-muted-foreground border-t pt-2">
              Last check: {new Date(settings.lastRunAt).toLocaleString("id-ID")}
              <br />
              Last opened: {settings.lastOpenedCount ?? 0} collection(s)
            </div>
          )}

          {isAdmin && (
            <div className="border-t pt-3">
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => runNowMut.mutate()}
                disabled={runNowMut.isPending}
              >
                {runNowMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                Jalankan Threshold Check Sekarang
              </Button>
              <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
                Trigger manual tanpa menunggu billing sync berikutnya (test atau perbaikan operasional).
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-3 border-t">
          <Button variant="outline" onClick={onClose} className="flex-1">Tutup</Button>
          {isAdmin && (
            <Button onClick={handleSave} disabled={saveMut.isPending} className="flex-1">
              {saveMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Simpan
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- COMPONENTS ------------------------------------------------------------

function StatCard({ label, value, color, compact }: { label: string; value: string | number; color: string; compact?: boolean }) {
  return (
    <Card>
      <CardContent className="p-2.5 md:p-3">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide leading-none">{label}</div>
        <div
          className={`font-bold mt-1 tabular-nums leading-tight ${compact ? "text-xs md:text-sm" : "text-lg md:text-xl"}`}
          style={{ color }}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-md border bg-card px-2 py-1.5 flex items-center justify-between gap-1.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">{label}</span>
      <span className="text-sm font-bold tabular-nums leading-none" style={{ color }}>{value}</span>
    </div>
  );
}

function CollectionCard({ c, onClick }: { c: CollectionWithCustomer; onClick: () => void; userById: Map<number, any> }) {
  const { color: stageColor } = useStages();
  const ageDays = daysSince(c.openedAt);
  const stage = (c.stage ?? "new") as CollectionStage;
  const assignees = c.assignees ?? [];
  const isUrgent = ageDays > 30;
  // Avatar stack: max 3 visible + "+N" overflow
  const VISIBLE = 3;
  const visibleAssignees = assignees.slice(0, VISIBLE);
  const overflowCount = Math.max(0, assignees.length - VISIBLE);

  return (
    /* Collection card (dipakai di kanban column DAN list view) */
    <Card data-section="collection-card" data-collection-id={c.id} data-stage={stage} onClick={onClick} className="cursor-pointer hover:shadow-md transition-shadow">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm truncate">{c.customerName}</div>
            <div className="text-[10px] text-muted-foreground truncate">
              {c.customerIdDisplay} {c.pppoeUsername ? `• ${c.pppoeUsername}` : ""}
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </div>

        <div className="flex items-center justify-between text-xs">
          <div className="font-semibold" style={{ color: stageColor(stage) }}>
            {fmtRp(c.openedAmount)}
          </div>
          <Badge variant="secondary" className={`text-[10px] ${isUrgent ? "bg-red-100 dark:bg-red-950 text-red-700" : ""}`}>
            <Clock className="h-3 w-3 mr-1" /> {ageDays}h
          </Badge>
        </div>

        {c.issueType && (
          <Badge variant="secondary" className="text-[10px] bg-red-100 dark:bg-red-950 text-red-700 w-full justify-start">
            <AlertTriangle className="h-3 w-3 mr-1" /> {COLLECTION_ISSUE_LABELS[c.issueType as CollectionIssueType] ?? c.issueType}
          </Badge>
        )}

        {c.promiseDate && (
          <Badge variant="secondary" className="text-[10px] bg-amber-100 dark:bg-amber-950 text-amber-700 w-full justify-start">
            <Calendar className="h-3 w-3 mr-1" /> Janji: {fmtDate(c.promiseDate)}
          </Badge>
        )}

        {assignees.length > 0 && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground" title={assignees.map(a => a.userName).join(", ")}>
            <div className="flex -space-x-1.5">
              {visibleAssignees.map((a) => (
                <div key={a.userId}
                     className="h-5 w-5 rounded-full bg-gradient-to-br from-sky-500 to-blue-700 text-white flex items-center justify-center text-[9px] font-bold ring-2 ring-background">
                  {(a.userName || a.username || "?").charAt(0).toUpperCase()}
                </div>
              ))}
              {overflowCount > 0 && (
                <div className="h-5 w-5 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[9px] font-semibold ring-2 ring-background">
                  +{overflowCount}
                </div>
              )}
            </div>
            <span className="truncate">{assignees.length === 1 ? assignees[0].userName : `${assignees.length} ditugaskan`}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CollectionDetail({
  id, division, onClose, canEdit, users, onMoveStage, onAssign, onAddActivity, onDelete, isSystemAdmin, waLink, customerById,
}: {
  id: number | null;
  division?: "cs" | "marketing";
  onClose: () => void;
  canEdit: boolean;
  users: any[];
  onMoveStage: (id: number, stage: CollectionStage) => void;
  onAssign: (id: number, userIds: number[]) => void;
  onAddActivity: (id: number, type: string, content: string) => void;
  onDelete: (id: number) => void;
  isSystemAdmin: boolean;
  waLink: (phone: string, msg: string) => string;
  customerById: Map<number, any>;
}) {
  const { stages: allStages, label: stageLabel, color: stageColor } = useStages();
  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState("note");
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [photoViewer, setPhotoViewer] = useState<string | null>(null); // URL foto full-screen
  const divQ = division ? `?division=${division}` : "";

  // Tutup viewer foto full-screen dengan tombol ESC.
  useEffect(() => {
    if (!photoViewer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPhotoViewer(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photoViewer]);

  const { data: detail } = useQuery<any>({
    queryKey: ["/api/collections", id, division ?? "all-div"],
    queryFn: () => id ? api.get(`/collections/${id}${divQ}`) : Promise.resolve(null),
    enabled: !!id,
  });

  // Riwayat lintas-collection untuk customer ini (termasuk collection lama & event billing)
  const { data: paymentHistory } = useQuery<any>({
    queryKey: ["/api/customers", detail?.customerId, "payment-history"],
    queryFn: () => detail?.customerId ? api.get(`/customers/${detail.customerId}/payment-history`) : Promise.resolve(null),
    enabled: !!detail?.customerId && showFullHistory,
  });

  if (!id || !detail) {
    return (
      <Dialog open={!!id} onOpenChange={() => onClose()}>
        <DialogContent className="max-w-2xl">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const cust = customerById.get(detail.customerId);
  const stage = (detail.stage ?? "new") as CollectionStage;
  const ageDays = daysSince(detail.openedAt);

  const handleAddNote = () => {
    if (!noteText.trim()) return toast.error("Catatan kosong");
    onAddActivity(detail.id, noteType, noteText.trim());
    setNoteText("");
  };

  return (
    <>
    {/* ============ COLLECTION DETAIL DIALOG ============ */}
    <Dialog open={!!id} onOpenChange={() => onClose()}>
      <DialogContent data-section="collection-detail-dialog" data-collection-id={detail.id} className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <DialogTitle className="truncate">{cust?.name ?? `Customer #${detail.customerId}`}</DialogTitle>
              <DialogDescription className="flex items-center gap-2 flex-wrap mt-1">
                <Badge variant="secondary" className="text-[10px]" style={{ backgroundColor: stageColor(stage) + "20", color: stageColor(stage) }}>
                  {stageLabel(stage)}
                </Badge>
                <span className="text-[11px] text-muted-foreground">
                  {cust?.customerId} • {cust?.pppoeUsername ?? "no pppoe"}
                </span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable body */}
        <div data-section="collection-detail-body" className="flex-1 overflow-y-auto -mx-6 px-6 space-y-4">
          {/* Info billing */}
          <div data-section="collection-info" className="grid grid-cols-2 gap-2 text-xs">
            <InfoRow label="Tagihan" value={fmtRp(detail.openedAmount)} />
            <InfoRow label="Jatuh Tempo" value={fmtDate(detail.openedDueDate)} />
            <InfoRow label="Isolir Sejak" value={fmtDate(detail.openedIsolirDate ?? detail.openedAt)} />
            <InfoRow label="Age" value={`${ageDays} hari`} />
            {detail.promiseDate && <InfoRow label="Janji Bayar" value={fmtDate(detail.promiseDate)} />}
            {detail.issueType && <InfoRow label="Kendala" value={COLLECTION_ISSUE_LABELS[detail.issueType as CollectionIssueType] ?? detail.issueType} />}
            {detail.closedAt && <InfoRow label="Lunas" value={fmtDate(detail.closedLastPaymentDate ?? detail.closedAt)} />}
          </div>

          {/* Kontak cepat (telepon / WhatsApp) */}
          {cust?.phone && (
            <div data-section="collection-contact" className="flex gap-2">
              <a href={`tel:${cust.phone}`} className="flex-1">
                <Button variant="outline" size="sm" className="w-full">
                  <Phone className="h-4 w-4 mr-1.5" /> Telepon
                </Button>
              </a>
              <a href={waLink(cust.phone, `Halo ${cust.name}, mengingatkan bahwa tagihan internet Anda sebesar ${fmtRp(detail.openedAmount)} belum dibayar. Mohon segera dilunasi. Terima kasih.`)}
                 target="_blank" rel="noreferrer" className="flex-1">
                <Button variant="outline" size="sm" className="w-full text-green-600">
                  <MessageSquare className="h-4 w-4 mr-1.5" /> WhatsApp
                </Button>
              </a>
            </div>
          )}

          {/* Multi-assignee - semua assignee equal, siapa pun bisa edit */}
          {canEdit && (
            <AssigneePicker
              assignees={(detail.assignees ?? []) as Assignee[]}
              users={users}
              onChange={(userIds) => onAssign(detail.id, userIds)}
            />
          )}

          {/* Stage actions (tombol pindah stage cepat) */}
          {canEdit && !detail.closedAt && (
            <div data-section="collection-stage-actions">
              <Label className="text-xs mb-1.5 block">Pindah Stage</Label>
              <div className="flex gap-1.5 flex-wrap">
                {allStages.filter(s => s.key !== stage).map((s) => (
                  <button
                    key={s.key}
                    onClick={() => onMoveStage(detail.id, s.key)}
                    className="text-[10px] px-2.5 py-1 rounded-full border hover:bg-muted transition-colors"
                    style={{ color: s.color, borderColor: s.color + "60" }}
                  >
                    → {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tambah catatan / aktivitas manual */}
          {canEdit && (
            <div data-section="collection-add-note" className="border rounded-md p-3 space-y-2 bg-muted/30">
              <Label className="text-xs">Tambah Catatan / Aktivitas</Label>
              <div className="flex gap-2">
                <select value={noteType} onChange={(e) => setNoteType(e.target.value)}
                        className="h-9 rounded-md border border-input bg-transparent px-2 text-xs">
                  <option value="note">Catatan</option>
                  <option value="call">Telepon</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="visit">Kunjungan</option>
                </select>
                <Input placeholder="Isi catatan..." value={noteText} onChange={(e) => setNoteText(e.target.value)} className="text-xs" />
                <Button onClick={handleAddNote} size="sm">Kirim</Button>
              </div>
            </div>
          )}

          {/* ==== Riwayat Aktivitas (timeline aktivitas collection ini) ==== */}
          <div data-section="activity-timeline">
            <Label className="text-xs mb-2 block flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Riwayat Aktivitas (Collection #{detail.id})
            </Label>
            <div className="space-y-2">
              {(detail.activities ?? []).length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-4">Belum ada aktivitas</div>
              )}
              {(detail.activities ?? []).map((a: any) => {
                const cfg = ACTIVITY_CFG[a.type] ?? ACTIVITY_CFG.note;
                const Icon = cfg.icon;
                const isSystem = a.userId === null;
                let content = a.content;
                try { const obj = JSON.parse(a.content ?? ""); if (typeof obj === "object") content = JSON.stringify(obj); } catch { /* plain */ }
                return (
                  /* One activity row (satu entri timeline) */
                  <div key={a.id} data-section="activity-item" data-activity-id={a.id} data-activity-type={a.type} className="flex gap-2 pb-2 border-b text-xs">
                    <Icon className="h-4 w-4 shrink-0 mt-0.5" style={{ color: cfg.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium">{cfg.label}</span>
                        {isSystem && <Badge variant="secondary" className="text-[9px] h-4">SISTEM</Badge>}
                      </div>
                      <div className="text-muted-foreground text-[11px] break-all">{content}</div>
                      {/* Thumbnail foto bukti (klik → viewer full-screen) */}
                      {(a.photoPath || a.photoData) && (
                        <img
                          data-section="activity-photo"
                          src={`/api/collections/activities/${a.id}/photo`}
                          alt="foto aktivitas"
                          className="mt-1.5 h-24 w-auto rounded border object-cover cursor-zoom-in"
                          loading="lazy"
                          onClick={() => setPhotoViewer(`/api/collections/activities/${a.id}/photo`)}
                        />
                      )}
                      <div className="text-[10px] text-muted-foreground/70 mt-0.5">{fmtDate(a.createdAt)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ==== Riwayat lintas collection (customer history full) ==== */}
          <div data-section="collection-cross-history" className="border-t pt-4">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs flex items-center gap-1.5">
                <History className="h-3.5 w-3.5" /> Riwayat Lengkap Pelanggan
              </Label>
              <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setShowFullHistory((v) => !v)}>
                {showFullHistory ? "Sembunyikan" : "Tampilkan"}
              </Button>
            </div>

            {showFullHistory && (
              <div className="space-y-2">
                {/* Snapshot billing current */}
                {paymentHistory?.current && (
                  <div className="bg-blue-50 dark:bg-blue-950/30 rounded-md p-2 text-[11px] grid grid-cols-2 gap-1.5">
                    <div>
                      <div className="text-muted-foreground text-[10px]">Bayar Terakhir</div>
                      <div className="font-medium">{fmtDate(paymentHistory.current.lastPaymentDate)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[10px]">Jatuh Tempo</div>
                      <div className="font-medium">{fmtDate(paymentHistory.current.dueDate)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[10px]">Status Billing</div>
                      <div className="font-medium">
                        <Badge variant={paymentHistory.current.billingStatus === "lunas" ? "default" : "destructive"} className="text-[9px]">
                          {paymentHistory.current.billingStatus ?? "-"}
                        </Badge>
                        {paymentHistory.current.isIsolir && <Badge variant="destructive" className="text-[9px] ml-1">ISOLIR</Badge>}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[10px]">Total Collection</div>
                      <div className="font-medium">{paymentHistory.collectionCount ?? 0}x (sudah/sedang ditagih)</div>
                    </div>
                  </div>
                )}

                {/* Timeline events lintas-collection */}
                {(!paymentHistory?.events || paymentHistory.events.length === 0) && (
                  <div className="text-xs text-muted-foreground text-center py-4">
                    Tidak ada riwayat lain.
                  </div>
                )}
                {paymentHistory?.events?.map((ev: any, idx: number) => {
                  const isOpened = ev.type === "collection_opened";
                  const isClosed = ev.type === "collection_closed";
                  const isMine = ev.collectionId === detail.id;
                  const cfg = isOpened
                    ? { label: "Collection Dibuka", color: "#EF4444", Icon: AlertTriangle }
                    : isClosed
                      ? { label: "Collection Ditutup", color: "#22C55E", Icon: CheckCircle2 }
                      : (() => { const a = ACTIVITY_CFG[ev.type] ?? ACTIVITY_CFG.note; return { label: a.label, color: a.color, Icon: a.icon }; })();
                  const Icon = cfg.Icon;
                  let content = ev.content;
                  try { const obj = JSON.parse(ev.content ?? ""); if (typeof obj === "object") content = JSON.stringify(obj); } catch { /* plain */ }
                  return (
                    <div key={`${ev.source}-${ev.collectionId ?? 'x'}-${ev.type}-${ev.timestamp}-${idx}`} className={`flex gap-2 text-[11px] pb-2 border-b ${isMine ? "bg-primary/5 -mx-1 px-1 rounded" : ""}`}>
                      <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: cfg.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium">{cfg.label}</span>
                          {ev.collectionId && (
                            <Badge variant="outline" className="text-[9px] h-4 px-1">
                              col#{ev.collectionId}{isMine ? " (ini)" : ""}
                            </Badge>
                          )}
                          {ev.billingPeriod && <span className="text-muted-foreground text-[10px]">• {ev.billingPeriod}</span>}
                        </div>
                        {isOpened && (
                          <div className="text-muted-foreground text-[10px]">
                            Tagihan: {fmtRp(ev.amount)} - due {fmtDate(ev.dueDate)} - status {ev.billingStatus ?? "-"}
                          </div>
                        )}
                        {isClosed && (
                          <div className="text-muted-foreground text-[10px]">
                            Stage: {ev.stage} - reason: {ev.closeReason ?? "-"}
                            {ev.lastPaymentDate && ` - bayar ${fmtDate(ev.lastPaymentDate)}`}
                          </div>
                        )}
                        {!isOpened && !isClosed && content && (
                          <div className="text-muted-foreground break-all">{content}</div>
                        )}
                        <div className="text-[9px] text-muted-foreground/70 mt-0.5">{fmtDate(ev.timestamp)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {!showFullHistory && (
              <div className="text-[11px] text-muted-foreground">
                Klik "Tampilkan" untuk lihat semua collection sebelumnya + event billing untuk pelanggan ini.
              </div>
            )}
          </div>

          {/* ==== Danger zone - hapus collection, terisolasi di bawah (jauh dari close X) ==== */}
          {canEdit && isSystemAdmin && (
            <div data-section="collection-danger-zone" className="mt-6 pt-4 border-t border-dashed border-red-200 dark:border-red-900">
              <div className="flex items-center justify-between gap-3 p-3 rounded-md bg-red-50/50 dark:bg-red-950/20 border border-red-200/60 dark:border-red-900/60">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-red-700 dark:text-red-300 flex items-center gap-1.5">
                    <Trash2 className="h-3.5 w-3.5" /> Zona Berbahaya
                  </div>
                  <p className="text-[11px] text-red-600/80 dark:text-red-400/80 mt-0.5">
                    Hapus collection beserta riwayat aktivitas. Aksi ini tidak bisa dibatalkan.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { onClose(); setTimeout(() => onDelete(detail.id), 300); }}
                  className="text-red-600 border-red-300 hover:bg-red-100 dark:hover:bg-red-950/40 dark:border-red-900 dark:text-red-400 shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Hapus Collection
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
    {/* ==== Full-screen photo viewer (foto aktivitas) ==== */}
    {photoViewer && (
      <div
        data-section="photo-viewer"
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 cursor-zoom-out"
        onClick={() => setPhotoViewer(null)}
      >
        <button
          type="button"
          className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          onClick={(e) => { e.stopPropagation(); setPhotoViewer(null); }}
          aria-label="Tutup"
        >
          <X className="h-5 w-5" />
        </button>
        <img
          key={photoViewer}
          src={photoViewer}
          alt="foto aktivitas"
          className="max-h-[90vh] max-w-full rounded-lg object-contain shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    )}
    </>
  );
}

function AssigneePicker({
  assignees, users, onChange,
}: {
  assignees: Assignee[];
  users: any[];
  onChange: (userIds: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedIds = useMemo(() => new Set(assignees.map((a) => a.userId)), [assignees]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return (users ?? []).filter((u) => {
      if (u.isActive === 0) return false;
      if (!q) return true;
      return (u.name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q) || u.role?.toLowerCase().includes(q));
    });
  }, [users, query]);

  const toggle = (userId: number) => {
    const next = new Set(selectedIds);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    onChange(Array.from(next));
  };
  return _AssigneePickerBody({ assignees, query, setQuery, open, setOpen, filtered, selectedIds, toggle });
}

// --- PIPELINE MANAGER (CRUD stage per-mitra) ---------------------------------

const ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "none", label: "- (biasa)" },
  { value: "entry", label: "Awal / Masuk" },
  { value: "paid", label: "Lunas / Reaktivasi" },
  { value: "dismantel", label: "Dismantel (Bongkar)" },
  { value: "writeoff", label: "Write-off / Loss" },
];

// Urutan grup owner untuk view penuh (/collections). Shared selalu terakhir.
const OWNER_GROUP_ORDER = ["collections", "finance", "cs", "marketing", "legal"];
const groupKeyOf = (s: CollectionStageRow): string =>
  isSharedStage(s as any) ? "__shared" : (String((s as any).ownerDivision ?? "").toLowerCase().trim() || "__shared");
const groupRank = (k: string): number => k === "__shared" ? 999 : (OWNER_GROUP_ORDER.indexOf(k) >= 0 ? OWNER_GROUP_ORDER.indexOf(k) : 500);
const groupLabelOf = (k: string): string =>
  k === "__shared" ? "Shared (Semua Divisi)" : (COLLECTION_OWNER_DIVISIONS.find((o) => o.value === k)?.label ?? k.toUpperCase());

function PipelineManagerDialog({ open, onClose, stages, cardCounts, division, canManage }: {
  open: boolean;
  onClose: () => void;
  stages: CollectionStageRow[];
  cardCounts: Record<string, number>;
  division?: "cs" | "marketing";
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/collections/stages"] });
    qc.invalidateQueries({ queryKey: ["/api/collections"] });
    qc.invalidateQueries({ queryKey: ["/api/collections/stats"] });
  };

  // Urutan lokal untuk drag-drop; SELALU daftar penuh (semua stage) - supaya reorder
  // mengirim posisi lengkap & tidak bentrok dgn stage tersembunyi. Display di-scope/grup.
  const [order, setOrder] = useState<CollectionStageRow[]>(stages);
  useEffect(() => { setOrder(stages); }, [stages]);
  const [dragId, setDragId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CollectionStageRow | null>(null);

  const createMut = useMutation({
    // Stage baru mewarisi divisi view (cs/marketing); dari view penuh default "collections".
    mutationFn: () => api.post("/collections/stages", { label: "Stage Baru", color: "#94A3B8", role: "none", ownerDivision: division ?? "collections" }),
    onSuccess: () => { invalidate(); toast.success("Stage ditambahkan"); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => api.patch(`/collections/stages/${id}`, data),
    onSuccess: () => invalidate(),
    onError: (e: any) => { toast.error(e.message); invalidate(); },
  });
  const reorderMut = useMutation({
    mutationFn: (orderedIds: number[]) => api.patch("/collections/stages/reorder", { orderedIds }),
    onSuccess: () => invalidate(),
    onError: (e: any) => { toast.error(e.message); invalidate(); },
  });

  // Reorder hanya dalam grup yang sama (owner sama) - agar owner tak berubah karena drag.
  const onDragOver = (overId: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragId === null || dragId === overId) return;
    const dragged = order.find((s) => s.id === dragId);
    const over = order.find((s) => s.id === overId);
    if (!dragged || !over || groupKeyOf(dragged) !== groupKeyOf(over)) return;
    setOrder((prev) => {
      const from = prev.findIndex((s) => s.id === dragId);
      const to = prev.findIndex((s) => s.id === overId);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });
  };
  const commitOrder = () => {
    setDragId(null);
    reorderMut.mutate(order.map((s) => s.id)); // kirim urutan PENUH
  };

  // Scope display ke divisi (view CS/Marketing = stage divisi + shared), lalu grup per owner.
  const visible = division
    ? order.filter((s) => String((s as any).ownerDivision ?? "").toLowerCase().trim() === division || isSharedStage(s as any))
    : order;
  const groups = (() => {
    const map = new Map<string, CollectionStageRow[]>();
    for (const s of visible) {
      const k = groupKeyOf(s);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return [...map.entries()].map(([key, items]) => ({ key, items })).sort((a, b) => groupRank(a.key) - groupRank(b.key));
  })();

  const renderStageCard = (s: CollectionStageRow) => {
    const count = cardCounts[s.key] ?? 0;
    const active = isStageActive(s);
    const roleLocked = s.role === "entry" || s.role === "paid"; // tak boleh dinonaktifkan
    const ownerVal = (() => { const v = String((s as any).ownerDivision ?? "").toLowerCase().trim(); return v === "" ? "all" : v; })();
    const ownerKnown = COLLECTION_OWNER_DIVISIONS.some((o) => o.value === ownerVal);
    return (
      /* One editable stage row in the pipeline manager */
      <div
        key={s.id}
        data-section="pipeline-stage-row"
        data-stage-key={s.key}
        onDragOver={onDragOver(s.id)}
        onDrop={commitOrder}
        className={`group rounded-xl border bg-card p-3 shadow-elev-sm transition-all ${dragId === s.id ? "opacity-60 ring-2 ring-primary/40" : "hover:border-primary/30"} ${active ? "" : "opacity-60"}`}
      >
        {/* Baris 1: seret + warna + nama + jumlah kartu + hapus */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            draggable={canManage}
            onDragStart={() => setDragId(s.id)}
            onDragEnd={() => setDragId(null)}
            className="shrink-0 cursor-grab rounded-md p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
            title="Seret untuk mengurutkan (dalam grup divisi)"
            aria-label="Seret untuk mengurutkan"
            disabled={!canManage}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <label className="relative shrink-0" title="Warna stage">
            <input
              type="color"
              defaultValue={s.color}
              key={`color-${s.id}-${s.color}`}
              disabled={!canManage}
              onBlur={(e) => { if (e.target.value !== s.color) updateMut.mutate({ id: s.id, data: { color: e.target.value } }); }}
              className="size-8 cursor-pointer rounded-lg border border-border bg-transparent p-0.5 disabled:cursor-not-allowed"
            />
          </label>
          <Input
            defaultValue={s.label}
            key={`label-${s.id}-${s.label}`}
            disabled={!canManage}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.label) updateMut.mutate({ id: s.id, data: { label: v } }); }}
            className="h-9 flex-1 min-w-0 text-sm font-medium"
            placeholder="Nama stage"
          />
          {!active && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Nonaktif</span>
          )}
          <span
            className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground"
            title="Jumlah kartu aktif di stage ini"
          >
            {count} <span className="font-normal">kartu</span>
          </span>
          {canManage && (
            <button
              type="button"
              onClick={() => setDeleteTarget(s)}
              className="shrink-0 rounded-lg p-1.5 text-muted-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
              title="Hapus stage"
              aria-label="Hapus stage"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Baris 2: peran + SLA + divisi penanggung jawab + aktif */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 pl-8">
          <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            Peran
            <select
              value={s.role}
              disabled={!canManage}
              onChange={(e) => updateMut.mutate({ id: s.id, data: { role: e.target.value } })}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs font-normal text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
              title="Peran sistem stage ini"
            >
              {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
          <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground" title="Divisi penanggung jawab stage ini">
            Divisi
            <select
              value={ownerVal}
              disabled={!canManage}
              onChange={(e) => updateMut.mutate({ id: s.id, data: { ownerDivision: e.target.value } })}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs font-normal text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
            >
              {!ownerKnown && <option value={ownerVal}>{ownerDivisionLabel(ownerVal)}</option>}
              {COLLECTION_OWNER_DIVISIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            SLA
            <input
              type="number" min="0" max="365"
              defaultValue={(s as any).slaDays ?? ""}
              key={`sla-${s.id}-${(s as any).slaDays}`}
              disabled={!canManage}
              onBlur={(e) => { const raw = e.target.value.trim(); const v = raw === "" ? null : Number(raw); const cur = (s as any).slaDays ?? null; if (v !== cur) updateMut.mutate({ id: s.id, data: { slaDays: v } }); }}
              className="h-8 w-14 rounded-md border border-input bg-background px-2 text-center text-xs font-normal tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
              title="SLA (hari) -> auto-delegasi ke stage berikutnya. Kosong = tidak auto."
              placeholder="-"
            />
            <span className="font-normal text-muted-foreground/70">hari</span>
          </label>
          <label
            className={`ml-auto inline-flex items-center gap-1.5 text-[11px] font-medium ${roleLocked ? "text-muted-foreground/50" : "text-muted-foreground"}`}
            title={roleLocked ? "Stage peran sistem (Awal/Lunas) wajib aktif" : "Aktif / nonaktifkan stage"}
          >
            <input
              type="checkbox"
              checked={active}
              disabled={!canManage || roleLocked}
              onChange={(e) => updateMut.mutate({ id: s.id, data: { active: e.target.checked } })}
              className="size-3.5 rounded border-input accent-primary disabled:cursor-not-allowed"
            />
            Aktif
          </label>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* ============ PIPELINE MANAGER DIALOG (CRUD stage) ============ */}
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent data-section="pipeline-manager-dialog" className="max-w-xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b space-y-1.5">
            <DialogTitle className="flex items-center gap-2.5 text-base">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ListTree className="h-4 w-4" />
              </span>
              Kelola Pipeline Collection{division ? ` — ${division === "cs" ? "Layanan Pelanggan" : "Marketing"}` : ""}
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              {division
                ? <>Stage divisi <strong>{division === "cs" ? "Layanan Pelanggan" : "Marketing"}</strong> + stage <strong>Shared</strong> (dipakai semua divisi). Ubah nama/warna, atur peran, SLA, divisi penanggung jawab, dan aktif/nonaktif. Menyunting stage shared berdampak ke semua divisi.</>
                : <>Semua stage dikelompokkan per <strong>divisi penanggung jawab</strong>. Seret <span className="inline-flex align-middle"><GripVertical className="h-3 w-3" /></span> untuk mengurutkan dalam grup, atur peran + SLA auto-delegasi + aktif/nonaktif.</>}
            </DialogDescription>
          </DialogHeader>

          {/* Body: stage dikelompokkan per divisi penanggung jawab */}
          <div data-section="pipeline-stage-groups" className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {groups.map((g) => (
              <div key={g.key} data-section="pipeline-stage-group" data-group={g.key} className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${g.key === "__shared" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>
                    {groupLabelOf(g.key)}
                  </span>
                  <span className="text-[10px] text-muted-foreground/70">{g.items.length} stage</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                {g.items.map(renderStageCard)}
              </div>
            ))}
            <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">
              <strong className="text-foreground">Divisi penanggung jawab</strong> menentukan di board divisi mana stage tampil. <strong>Shared</strong> = tampil di semua divisi (owner "Semua Divisi" atau peran Lunas/Write-off/Dismantel).
              <br />
              <strong className="text-foreground">Peran:</strong> Awal = tujuan auto-open saat isolir · Lunas = auto-close saat bayar · Write-off = target auto write-off. Stage peran Awal/Lunas tidak bisa dihapus / dinonaktifkan sebelum perannya dipindah.
              <br />
              <strong className="text-foreground">SLA</strong> = jumlah hari sebelum kartu otomatis di-delegasi ke stage berikutnya. Kosongkan agar tidak otomatis.
            </p>
          </div>

          <div className="border-t px-5 py-3 flex gap-2">
            {canManage && (
              <Button variant="outline" onClick={() => createMut.mutate()} disabled={createMut.isPending} className="flex-1" leftIcon={createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}>
                Tambah Stage{division ? ` (${division === "cs" ? "CS" : "Marketing"})` : ""}
              </Button>
            )}
            <Button onClick={onClose} className="flex-1">Selesai</Button>
          </div>
        </DialogContent>
      </Dialog>

      <StageDeleteDialog
        target={deleteTarget}
        stages={order}
        cardCount={deleteTarget ? (cardCounts[deleteTarget.key] ?? 0) : 0}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => { setDeleteTarget(null); invalidate(); }}
      />
    </>
  );
}

function StageDeleteDialog({ target, stages, cardCount, onClose, onDeleted }: {
  target: CollectionStageRow | null;
  stages: CollectionStageRow[];
  cardCount: number;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [mode, setMode] = useState<"migrate" | "purge">("migrate");
  const [targetKey, setTargetKey] = useState("");
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    if (target) {
      setMode("migrate");
      setConfirmText("");
      const other = stages.find((s) => s.key !== target.key);
      setTargetKey(other?.key ?? "");
    }
  }, [target, stages]);

  const isProtected = target?.role === "entry" || target?.role === "paid";

  const delMut = useMutation({
    mutationFn: () => api.delete(`/collections/stages/${target!.id}`, {
      mode,
      targetKey: mode === "migrate" ? targetKey : undefined,
    }),
    onSuccess: (r: any) => {
      const n = r?.affectedCards ?? 0;
      toast.success(mode === "migrate"
        ? `Stage dihapus${n > 0 ? `, ${n} kartu dipindahkan` : ""}`
        : `Stage dihapus${n > 0 ? ` beserta ${n} kartu` : ""}`);
      onDeleted();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const otherStages = stages.filter((s) => s.key !== target?.key);
  const purgeReady = mode !== "purge" || confirmText.trim().toUpperCase() === "HAPUS";
  const migrateReady = mode !== "migrate" || !!targetKey;

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-red-500" /> Hapus Stage "{target?.label}"
          </DialogTitle>
          <DialogDescription className="text-xs">
            {cardCount > 0
              ? `Stage ini punya ${cardCount} kartu aktif. Pilih tindakan untuk kartu tersebut.`
              : "Stage ini tidak punya kartu aktif."}
          </DialogDescription>
        </DialogHeader>

        {isProtected ? (
          <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-200">
            Stage ini memegang peran sistem <strong>{target?.role === "entry" ? "Awal/Masuk" : "Lunas"}</strong> yang
            wajib ada. Pindahkan dulu perannya ke stage lain (lewat dropdown peran) sebelum menghapus.
          </div>
        ) : (
          <div className="space-y-3">
            <label className="flex items-start gap-2 p-2.5 rounded-md border cursor-pointer hover:bg-muted/40">
              <input type="radio" checked={mode === "migrate"} onChange={() => setMode("migrate")} className="mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-medium">Pindahkan kartu ke stage lain</div>
                <div className="text-[11px] text-muted-foreground">Kartu di stage ini dipindah, tidak ada data hilang.</div>
                {mode === "migrate" && (
                  <select
                    value={targetKey}
                    onChange={(e) => setTargetKey(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm mt-2"
                  >
                    {otherStages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                )}
              </div>
            </label>

            <label className="flex items-start gap-2 p-2.5 rounded-md border cursor-pointer hover:bg-muted/40 border-red-200 dark:border-red-900">
              <input type="radio" checked={mode === "purge"} onChange={() => setMode("purge")} className="mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-medium text-red-600 dark:text-red-400">Hapus permanen semua kartu</div>
                <div className="text-[11px] text-muted-foreground">
                   Semua kartu di stage ini beserta riwayat aktivitasnya akan dihapus permanen. Tidak bisa dibatalkan.
                </div>
                {mode === "purge" && cardCount > 0 && (
                  <div className="mt-2">
                    <p className="text-[11px] text-red-600 dark:text-red-400 mb-1">Ketik <strong>HAPUS</strong> untuk konfirmasi:</p>
                    <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="HAPUS" className="h-8 text-sm" />
                  </div>
                )}
              </div>
            </label>
          </div>
        )}

        <div className="flex gap-2 pt-3 border-t">
          <Button variant="outline" onClick={onClose} className="flex-1" disabled={delMut.isPending}>Batal</Button>
          {!isProtected && (
            <Button
              onClick={() => delMut.mutate()}
              disabled={delMut.isPending || !purgeReady || !migrateReady}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white"
            >
              {delMut.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {mode === "purge" ? "Hapus Permanen" : "Hapus & Pindahkan"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// AssigneePicker body (dipisah supaya hooks tetap top-level di komponen utama).
function _AssigneePickerBody({ assignees, query, setQuery, open, setOpen, filtered, selectedIds, toggle }: {
  assignees: Assignee[];
  query: string; setQuery: (v: string) => void;
  open: boolean; setOpen: (fn: (v: boolean) => boolean) => void;
  filtered: any[];
  selectedIds: Set<number>;
  toggle: (userId: number) => void;
}) {

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <Label className="text-xs flex items-center gap-1.5">
          <UsersIcon className="h-3.5 w-3.5" /> Ditugaskan Ke <span className="text-muted-foreground">({assignees.length})</span>
        </Label>
        <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)} className="h-7 text-xs">
          {open ? "Tutup" : "Tambah/Edit"}
        </Button>
      </div>

      {/* Selected assignees chips */}
      {assignees.length === 0 ? (
        <div className="text-xs text-muted-foreground italic px-1">- Belum ada yang ditugaskan -</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {assignees.map((a) => (
            <div key={a.userId}
                 className="inline-flex items-center gap-1.5 bg-primary/10 text-primary rounded-full pl-1 pr-2 py-0.5 text-xs">
              <div className="h-5 w-5 rounded-full bg-gradient-to-br from-sky-500 to-blue-700 text-white flex items-center justify-center text-[9px] font-bold">
                {(a.userName || a.username || "?").charAt(0).toUpperCase()}
              </div>
              <span className="font-medium">{a.userName}</span>
              <button
                onClick={() => toggle(a.userId)}
                className="text-primary/60 hover:text-destructive ml-0.5"
                aria-label={`Hapus ${a.userName}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Picker dropdown */}
      {open && (
        <div className="mt-2 border rounded-md p-2 bg-card max-h-64 overflow-y-auto space-y-1">
          <Input
            placeholder="Cari nama, username, atau role..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 text-xs"
          />
          {filtered.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-3">Tidak ada user</div>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((u) => {
                const selected = selectedIds.has(u.id);
                return (
                  <button
                    key={u.id}
                    onClick={() => toggle(u.id)}
                    className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors ${selected ? "bg-primary/10" : ""}`}
                  >
                    <div className={`h-4 w-4 rounded border-2 flex items-center justify-center transition-colors ${selected ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                      {selected && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{u.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">@{u.username} • {u.role}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
