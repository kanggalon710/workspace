import { useState, useMemo, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SlaWidget } from "@/components/tickets/SlaWidget";
import { CreateTicketWizard } from "@/components/tickets/CreateTicketWizard";
import { StatsCard } from "@/components/tickets/StatsCard";
import { KanbanView } from "@/components/tickets/KanbanView";
import {
  type Ticket, type TicketCategory, type TicketActivity, type TicketWithActivities,
  type SafeUser, type Customer, type TicketStats,
  formatDuration, formatDate, formatDateTime, slaTone,
  PRIORITY_CONFIG, STATUS_CONFIG, ACTIVITY_ICON_CONFIG, DURATION_OPTIONS,
} from "@/components/tickets/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { EmptyInbox, EmptySearch } from "@/components/illustrations";
import { SkeletonList } from "@/components/ui/skeleton";
import {
  ClipboardList, Plus, Settings, Search, AlertCircle, Clock, CheckCircle2,
  Pause, ArrowRight, UserPlus, MessageSquare, Calendar, Eye, Loader2,
  Trash2, X, ChevronLeft, ChevronRight, RefreshCw, FileText, Check,
  Camera, MapPin, StickyNote, PenLine, Flag,
} from "lucide-react";

// -- Types ------------------------------------------------------------------

// Types dipindah ke ./components/tickets/shared (di-import di atas).

// -- Helpers ----------------------------------------------------------------

// Helpers & config dipindah ke ./components/tickets/shared (di-import di atas).

const PAGE_SIZE = 15;

// -- Main Page --------------------------------------------------------------

export default function TicketingPage() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [bulkCloseOpen, setBulkCloseOpen] = useState(false);

  // dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false); // v4.2.18 (E): 5-step wizard
  const [editTicket, setEditTicket] = useState<Ticket | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);

  // filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [page, setPage] = useState(1);
  // v4.2.18 (F): bulk select + view mode
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");

  // Debounce search supaya tidak request per-keystroke (filter sekarang server-side)
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const id = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(id);
  }, [search]);

  // -- Queries ------------------------------------------------------------

  const { data: stats, isLoading: statsLoading } = useQuery<TicketStats>({
    queryKey: ["ticket-stats"],
    queryFn: () => api.get<TicketStats>("/tickets/stats"),
  });

  // Kanban perlu semua kartu (grouped by status) → minta page besar dari hal. 1; list paginasi 15.
  const ticketsPageSize = viewMode === "kanban" ? 1000 : PAGE_SIZE;
  const effectivePage = viewMode === "kanban" ? 1 : page;
  type TicketsPage = { items: Ticket[]; total: number; page: number; pageSize: number };
  const { data: ticketsResp, isLoading: ticketsLoading } = useQuery<TicketsPage>({
    queryKey: ["tickets", { page: effectivePage, pageSize: ticketsPageSize, search: debouncedSearch, status: statusFilter, category: categoryFilter, priority: priorityFilter }],
    queryFn: () => {
      const q = new URLSearchParams();
      q.set("page", String(effectivePage));
      q.set("pageSize", String(ticketsPageSize));
      if (debouncedSearch) q.set("search", debouncedSearch);
      if (statusFilter !== "all") q.set("status", statusFilter);
      if (categoryFilter !== "all") q.set("category", categoryFilter);
      if (priorityFilter !== "all") q.set("priority", priorityFilter);
      return api.get<TicketsPage>(`/tickets?${q.toString()}`);
    },
    placeholderData: (prev) => prev, // keepPreviousData: hindari flicker saat pindah halaman/filter
  });
  const tickets = ticketsResp?.items ?? [];
  const total = ticketsResp?.total ?? 0;

  const { data: categories = [] } = useQuery<TicketCategory[]>({
    queryKey: ["ticket-categories"],
    queryFn: () => api.get<TicketCategory[]>("/ticket-categories"),
  });

  // customers/users hanya dibutuhkan dialog (create/edit/wizard/detail) untuk dropdown +
  // resolve nama - lazy, supaya halaman list tidak menarik seluruh tabel.
  const dialogNeedsLists = createOpen || wizardOpen || editTicket !== null || detailId !== null;
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["customers-list"],
    queryFn: () => api.get<Customer[]>("/customers"),
    enabled: dialogNeedsLists, staleTime: 300_000,
  });

  const { data: users = [] } = useQuery<SafeUser[]>({
    queryKey: ["users-list"],
    queryFn: () => api.get<SafeUser[]>("/users"),
    enabled: dialogNeedsLists, staleTime: 300_000,
  });

  // lookup maps
  const categoryMap = useMemo(() => {
    const m = new Map<number, TicketCategory>();
    categories.forEach((c) => m.set(c.id, c));
    return m;
  }, [categories]);

  const customerMap = useMemo(() => {
    const m = new Map<number, Customer>();
    customers.forEach((c) => m.set(c.id, c));
    return m;
  }, [customers]);

  const userMap = useMemo(() => {
    const m = new Map<number, SafeUser>();
    users.forEach((u) => m.set(u.id, u));
    return m;
  }, [users]);

  // -- Paginated tickets (filter + paginasi sudah di server) --------------

  const totalPages = Math.max(1, Math.ceil(total / ticketsPageSize));
  const paginated = tickets;

  // reset page on filter change
  const applyFilter = (setter: (v: string) => void, val: string) => {
    setter(val);
    setPage(1);
  };

  // -- Delete ticket mutation ---------------------------------------------

  const deleteTicketMut = useMutation({
    mutationFn: (id: number) => api.delete(`/tickets/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tickets"] });
      qc.invalidateQueries({ queryKey: ["ticket-stats"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Tiket berhasil dihapus");
    },
    onError: (e: any) => toast.error(e.message || "Gagal menghapus tiket"),
  });

  const bulkCloseMut = useMutation({
    mutationFn: (ids: number[]) =>
      api.post<{ updated: number; failed: { id: number; error: string }[] }>("/tickets/bulk-status", { ids, status: "closed" }),
    onSuccess: (r) => {
      if (r.failed.length > 0) toast.warning(`${r.updated} ditutup, ${r.failed.length} gagal`);
      else toast.success(`${r.updated} tiket ditutup`);
      setSelectedIds(new Set());
      setBulkCloseOpen(false);
      qc.invalidateQueries({ queryKey: ["tickets"] });
      qc.invalidateQueries({ queryKey: ["ticket-stats"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // -- Render -------------------------------------------------------------

  return (
    /* ==== Ticket page root ==== */
    <div data-section="ticket-page" className="min-h-screen bg-gray-50/50">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ==== Ticket header (title + actions) ==== */}
        <div data-section="ticket-header" className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <ClipboardList className="w-6 h-6 text-blue-700" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Work Order</h1>
              <p className="text-sm text-gray-500">Sistem penugasan dan ticketing terintegrasi pelanggan</p>
            </div>
          </div>
          {/* ==== Ticket action toolbar ==== */}
          <div data-section="ticket-toolbar" className="flex items-center flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild title="ODP Repeat Issues - heatmap & investigasi">
              <Link href="/tickets/heatmap">
                <AlertCircle className="w-4 h-4 mr-1" /> Heatmap ODP
              </Link>
            </Button>
            <Button onClick={() => { setEditTicket(null); setWizardOpen(true); }}>
              <Plus className="w-4 h-4 mr-1" /> Buat Tiket
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setEditTicket(null); setCreateOpen(true); }} title="Form simple (legacy)">
              Quick
            </Button>
            <Button variant="outline" size="icon" asChild title="Kelola Kategori & Workflow Stages">
              <Link href="/tickets/categories">
                <Settings className="w-4 h-4" />
              </Link>
            </Button>
          </div>
        </div>

        {/* ==== Ticket stats row - clickable filters (v4.2.18 F.2) ==== */}
        <div data-section="ticket-stats-row" className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatsCard
            label="Baru / Open"
            value={stats?.open ?? 0}
            icon={AlertCircle} iconColor="text-blue-600" bgColor="bg-blue-50"
            loading={statsLoading}
            active={statusFilter === "open"}
            onClick={() => applyFilter(setStatusFilter, statusFilter === "open" ? "all" : "open")}
          />
          <StatsCard
            label="Dikerjakan"
            value={stats?.inProgress ?? 0}
            icon={RefreshCw} iconColor="text-orange-600" bgColor="bg-orange-50"
            loading={statsLoading}
            active={statusFilter === "in_progress"}
            onClick={() => applyFilter(setStatusFilter, statusFilter === "in_progress" ? "all" : "in_progress")}
          />
          <StatsCard
            label="Tertunda"
            value={stats?.pending ?? 0}
            icon={Pause} iconColor="text-amber-600" bgColor="bg-amber-50"
            loading={statsLoading}
            active={statusFilter === "pending"}
            onClick={() => applyFilter(setStatusFilter, statusFilter === "pending" ? "all" : "pending")}
          />
          <StatsCard
            label="Selesai Bulan Ini"
            value={stats?.resolvedThisMonth ?? 0}
            icon={CheckCircle2} iconColor="text-green-600" bgColor="bg-green-50"
            loading={statsLoading}
            active={statusFilter === "resolved"}
            onClick={() => applyFilter(setStatusFilter, statusFilter === "resolved" ? "all" : "resolved")}
          />
        </div>

        {/* v4.2.18 (C.4): SLA Performance Widget */}
        <SlaWidget />

        {/* v4.2.16: Workload per Teknisi - laporan distribusi tiket */}
        <TechnicianWorkloadPanel />

        {/* ==== Ticket filter bar ==== */}
        <Card data-section="ticket-filters">
          <CardContent className="py-3 px-4">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Cari judul, no. tiket, pelanggan..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => applyFilter(setSearch, e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => applyFilter(setStatusFilter, v)}>
                <SelectTrigger className="w-full md:w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="assigned">Ditugaskan</SelectItem>
                  <SelectItem value="in_progress">Dikerjakan</SelectItem>
                  <SelectItem value="pending">Tertunda</SelectItem>
                  <SelectItem value="resolved">Selesai</SelectItem>
                  <SelectItem value="closed">Ditutup</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={(v) => applyFilter(setCategoryFilter, v)}>
                <SelectTrigger className="w-full md:w-[160px]"><SelectValue placeholder="Kategori" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Kategori</SelectItem>
                  {categories.filter((c) => c.isActive !== 0).map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={(v) => applyFilter(setPriorityFilter, v)}>
                <SelectTrigger className="w-full md:w-[160px]"><SelectValue placeholder="Prioritas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Prioritas</SelectItem>
                  <SelectItem value="low">Rendah</SelectItem>
                  <SelectItem value="medium">Sedang</SelectItem>
                  <SelectItem value="high">Tinggi</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* ==== Ticket view-mode tabs + bulk action bar (v4.2.18 F.1) ==== */}
        <div data-section="ticket-view-toolbar" className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center rounded-md border bg-card p-0.5">
            {(["list", "kanban"] as const).map(m => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={cn(
                  "px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded transition",
                  viewMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {m === "list" ? "List" : "Kanban"}
              </button>
            ))}
          </div>

          {selectedIds.size > 0 && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-xs animate-in slide-in-from-right">
              <span className="font-bold">{selectedIds.size} dipilih</span>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setBulkCloseOpen(true)}
                loading={bulkCloseMut.isPending}
              >
                Tutup
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setSelectedIds(new Set())}
                className="text-rose-700 hover:bg-rose-100"
              >
                Batal
              </Button>
            </div>
          )}
        </div>

        {/* ==== Ticket list / kanban region ==== */}
        <Card data-section="ticket-list">
          <CardContent className="p-0">
            {ticketsLoading ? (
              <div className="p-4"><SkeletonList count={8} showAvatar={false} /></div>
            ) : tickets.length === 0 ? (
              <EmptyState
                icon={FileText}
                illustration={(search || statusFilter !== "all" || categoryFilter !== "all" || priorityFilter !== "all") ? <EmptySearch /> : <EmptyInbox />}
                title="Tidak ada tiket ditemukan"
                description={search || statusFilter !== "all" || categoryFilter !== "all" || priorityFilter !== "all"
                  ? "Coba ubah filter pencarian"
                  : "Buat tiket pertama untuk memulai"}
                action={(search || statusFilter !== "all" || categoryFilter !== "all" || priorityFilter !== "all")
                  ? undefined
                  : { label: "Buat Tiket", onClick: () => { setEditTicket(null); setWizardOpen(true); } }}
              />
            ) : viewMode === "kanban" ? (
              <KanbanView tickets={tickets} categoryMap={categoryMap} />
            ) : (
              <>
                {/* Ticket cards \u2014 whole row clickable, langsung ke /work/:id */}
                <div className="divide-y divide-slate-100">
                  {paginated.map((t) => {
                    const cat = t.categoryId ? categoryMap.get(t.categoryId) : null;
                    const custName = t.customerName ?? null;
                    const assigneeName = t.assigneeName ?? null;
                    const pri = PRIORITY_CONFIG[t.priority ?? "medium"] ?? PRIORITY_CONFIG.medium;
                    const st = STATUS_CONFIG[t.status ?? "open"] ?? STATUS_CONFIG.open;
                    const status = t.status ?? "open";
                    const isCompleted = status === "resolved" || status === "closed";
                    const isCancelled = status === "cancelled";
                    const sla = (!isCompleted && !isCancelled) ? slaTone(t.slaDeadline ?? t.deadline) : { tone: null, label: null };
                    const catColor = cat?.color ?? "#1e40af";

                    // Action label per state
                    const actionLabel = isCompleted ? "Lihat Hasil"
                      : isCancelled ? "Lihat Arsip"
                      : status === "in_progress" || status === "pending" ? "Lanjutkan"
                      : "Kerjakan";
                    const actionColor = isCompleted ? "#10b981"
                      : isCancelled ? "#94a3b8"
                      : status === "in_progress" || status === "pending" ? "#f59e0b"
                      : catColor;

                    const isSelected = selectedIds.has(t.id);
                    return (
                      // ==== Ticket card row ====
                      <div
                        key={t.id}
                        data-section="ticket-card"
                        data-ticket-id={t.id}
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          // Don't navigate if clicking checkbox
                          if ((e.target as HTMLElement).closest("[data-bulk-checkbox]")) return;
                          navigate(`/work/${t.id}`);
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/work/${t.id}`); } }}
                        className={cn(
                          "group cursor-pointer hover:bg-slate-50/70 active:bg-slate-100 transition-colors",
                          isSelected && "bg-amber-50/40"
                        )}
                        style={{ position: "relative" }}
                      >
                        {/* Left accent strip \u2014 warna kategori */}
                        <div
                          className="absolute left-0 top-0 bottom-0 w-1 transition-all group-hover:w-1.5"
                          style={{ background: catColor }}
                        />

                        <div className="pl-4 pr-3 py-3.5 flex items-start gap-3">
                          {/* v4.2.18 (F.3): Bulk select checkbox */}
                          <button
                            data-bulk-checkbox
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedIds(prev => {
                                const next = new Set(prev);
                                if (next.has(t.id)) next.delete(t.id);
                                else next.add(t.id);
                                return next;
                              });
                            }}
                            className={cn(
                              "h-5 w-5 rounded border-2 grid place-items-center mt-1 shrink-0 transition",
                              isSelected ? "bg-amber-500 border-amber-500" : "border-zinc-300 hover:border-amber-500"
                            )}
                            aria-label={isSelected ? "Deselect" : "Select"}
                          >
                            {isSelected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                          </button>

                          {/* Main content */}
                          <div className="flex-1 min-w-0">
                            {/* Row 1: number + category + priority */}
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="jbn-mono text-[11px] font-bold text-slate-400">{t.ticketNumber}</span>
                              {cat && (
                                <span
                                  className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                                  style={{ background: `${catColor}15`, color: catColor }}
                                >
                                  {cat.name}
                                </span>
                              )}
                              {t.priority && t.priority !== "medium" && (
                                <span className={cn(
                                  "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded",
                                  t.priority === "urgent" && "bg-rose-100 text-rose-700",
                                  t.priority === "high" && "bg-orange-100 text-orange-700",
                                  t.priority === "low" && "bg-slate-100 text-slate-600",
                                )}>
                                  {pri.label}
                                </span>
                              )}
                              {/* Status badge \u2014 visual indicator only */}
                              <span className={cn(
                                "ml-auto md:ml-0 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded",
                                isCompleted ? "bg-emerald-100 text-emerald-700"
                                  : isCancelled ? "bg-slate-100 text-slate-500"
                                  : status === "in_progress" ? "bg-orange-100 text-orange-700"
                                  : status === "pending" ? "bg-amber-100 text-amber-700"
                                  : "bg-blue-100 text-blue-700"
                              )}>
                                {st.label}
                              </span>
                            </div>

                            {/* Row 2: title (bold, prominent) */}
                            <div className="text-sm font-bold text-slate-900 line-clamp-1 group-hover:text-slate-900">
                              {t.title}
                            </div>

                            {/* Row 3: customer + assignee + jadwal */}
                            <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                              {custName && (
                                <span className="flex items-center gap-1 truncate max-w-[200px]">
                                  <span className="font-medium text-slate-700">{custName}</span>
                                </span>
                              )}
                              {assigneeName && (
                                <span className="flex items-center gap-1">
                                  <UserPlus className="h-3 w-3" />
                                  {assigneeName}
                                </span>
                              )}
                              {t.scheduledDate && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {formatDate(t.scheduledDate)}
                                  {t.scheduledTime && <span className="text-slate-400">{t.scheduledTime.slice(0, 5)}</span>}
                                </span>
                              )}
                              {/* SLA badge inline */}
                              {sla.tone && sla.label && (
                                <span className={cn(
                                  "ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded border jbn-mono jbn-tabular text-[10px] font-bold",
                                  sla.tone === "expired" && "bg-rose-100 text-rose-800 border-rose-300",
                                  sla.tone === "danger" && "bg-rose-50 text-rose-700 border-rose-200",
                                  sla.tone === "warning" && "bg-amber-50 text-amber-700 border-amber-200",
                                  sla.tone === "caution" && "bg-yellow-50 text-yellow-700 border-yellow-200",
                                  sla.tone === "ok" && "bg-emerald-50 text-emerald-700 border-emerald-200",
                                )}>
                                  <Clock className="h-2.5 w-2.5" /> SLA {sla.label}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Right side: "ACTION" pill + chevron \u2014 visual cue whole-row clickable */}
                          <div className="hidden md:flex flex-col items-end justify-center gap-1.5 shrink-0 pl-2">
                            <span
                              className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md text-white"
                              style={{ background: actionColor }}
                            >
                              {actionLabel}
                            </span>
                          </div>

                          {/* More options icon \u2014 for Detail dialog (admin shortcut) */}
                          <button
                            onClick={(e) => { e.stopPropagation(); setDetailId(t.id); }}
                            className="shrink-0 p-1.5 rounded-md hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
                            title="Lihat detail"
                            aria-label="Detail tiket"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <ChevronRight className="hidden md:block h-5 w-5 text-slate-300 group-hover:text-slate-600 transition-colors shrink-0" />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ==== Ticket pagination ==== */}
                {totalPages > 1 && (
                  <div data-section="ticket-pagination" className="flex items-center justify-between px-4 py-3 border-t">
                    <p className="text-sm text-gray-500">{total} tiket ditemukan</p>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="text-sm text-gray-600 px-2">{page} / {totalPages}</span>
                      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* -- Dialogs ---------------------------------------------------- */}

      <CreateEditDialog
        open={createOpen || editTicket !== null}
        onClose={() => { setCreateOpen(false); setEditTicket(null); }}
        ticket={editTicket}
        categories={categories}
        customers={customers}
        users={users}
      />

      {/* v4.2.18 (E): 5-step Create Ticket Wizard */}
      <CreateTicketWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        customers={customers as any}
        categories={categories as any}
        users={users as any}
      />

      <DetailDialog
        ticketId={detailId}
        onClose={() => setDetailId(null)}
        categories={categories}
        customerMap={customerMap}
        userMap={userMap}
        onEdit={(t) => { setDetailId(null); setEditTicket(t); }}
        onDelete={(id) => {
          setDeleteConfirmId(id);
        }}
      />

      <CategoryManagementDialog
        open={categoryOpen}
        onClose={() => setCategoryOpen(false)}
      />

      {/* ==== Ticket delete confirmation dialog ==== */}
      <AlertDialog open={deleteConfirmId !== null} onOpenChange={(o) => { if (!o) setDeleteConfirmId(null); }}>
        <AlertDialogContent data-section="ticket-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Tiket?</AlertDialogTitle>
            <AlertDialogDescription>
              Tiket ini akan dihapus permanen beserta semua aktivitas, tim, dan evidence-nya. Tindakan ini tidak bisa dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={() => {
              if (deleteConfirmId) { deleteTicketMut.mutate(deleteConfirmId); setDetailId(null); }
              setDeleteConfirmId(null);
            }}>
              Hapus Permanen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ==== Ticket bulk-close confirmation dialog ==== */}
      <AlertDialog open={bulkCloseOpen} onOpenChange={setBulkCloseOpen}>
        <AlertDialogContent data-section="ticket-bulk-close-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Tutup {selectedIds.size} tiket?</AlertDialogTitle>
            <AlertDialogDescription>
              Semua tiket terpilih akan diubah statusnya menjadi <b>closed</b>. CSAT akan dijadwalkan untuk tiket yang baru ditutup.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => bulkCloseMut.mutate(Array.from(selectedIds))}>
              Tutup Tiket
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// -- Stats Card -------------------------------------------------------------

// StatsCard dipindah ke ./components/tickets/StatsCard (di-import di atas).

// -- Create / Edit Dialog ---------------------------------------------------

function CreateEditDialog({ open, onClose, ticket, categories, customers, users }: {
  open: boolean;
  onClose: () => void;
  ticket: Ticket | null;
  categories: TicketCategory[];
  customers: Customer[];
  users: SafeUser[];
}) {
  const qc = useQueryClient();
  const isEdit = ticket !== null;

  const [form, setForm] = useState(getInitialForm(ticket));
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(ticket?.customerId ?? null);
  const [durationMode, setDurationMode] = useState<string>(
    ticket?.estimatedDuration
      ? (DURATION_OPTIONS.some((o) => o.value === String(ticket.estimatedDuration)) ? String(ticket.estimatedDuration) : "custom")
      : "60"
  );
  const [customDuration, setCustomDuration] = useState(
    ticket?.estimatedDuration && !DURATION_OPTIONS.some((o) => o.value === String(ticket.estimatedDuration))
      ? String(ticket.estimatedDuration)
      : ""
  );
  const [submitting, setSubmitting] = useState(false);

  // reset form when dialog opens/closes or ticket changes
  const resetForm = () => {
    setForm(getInitialForm(ticket));
    setSelectedCustomerId(ticket?.customerId ?? null);
    setCustomerSearch("");
    setDurationMode(
      ticket?.estimatedDuration
        ? (DURATION_OPTIONS.some((o) => o.value === String(ticket.estimatedDuration)) ? String(ticket.estimatedDuration) : "custom")
        : "60"
    );
    setCustomDuration(
      ticket?.estimatedDuration && !DURATION_OPTIONS.some((o) => o.value === String(ticket.estimatedDuration))
        ? String(ticket.estimatedDuration)
        : ""
    );
  };

  // filtered customers
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers.slice(0, 20);
    const q = customerSearch.toLowerCase();
    return customers.filter((c) =>
      c.name.toLowerCase().includes(q) || c.customerId.toLowerCase().includes(q)
    ).slice(0, 20);
  }, [customers, customerSearch]);

  const selectedCustomer = selectedCustomerId ? customers.find((c) => c.id === selectedCustomerId) : null;

  const update = (key: string, val: any) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = async () => {
    if (!form.categoryId) { toast.error("Kategori wajib diisi"); return; }
    if (!form.title.trim()) { toast.error("Judul wajib diisi"); return; }
    if (!form.scheduledDate) { toast.error("Tanggal jadwal wajib diisi"); return; }
    if (!form.scheduledTime) { toast.error("Jam mulai wajib diisi"); return; }

    const dur = durationMode === "custom" ? Number(customDuration) || null : Number(durationMode) || null;
    const body = {
      title: form.title.trim(),
      categoryId: Number(form.categoryId),
      customerId: selectedCustomerId || null,
      description: form.description || null,
      priority: form.priority,
      assignedTo: form.assignedTo ? Number(form.assignedTo) : null,
      scheduledDate: form.scheduledDate,
      scheduledTime: form.scheduledTime,
      deadline: form.deadline || null,
      estimatedDuration: dur,
      address: form.address || null,
      lat: null,
      lng: null,
      odpId: null,
    };

    setSubmitting(true);
    try {
      if (isEdit) {
        await api.put(`/tickets/${ticket!.id}`, body);
        toast.success("Tiket berhasil diperbarui");
      } else {
        await api.post("/tickets", body);
        toast.success("Tiket berhasil dibuat");
      }
      qc.invalidateQueries({ queryKey: ["tickets"] });
      qc.invalidateQueries({ queryKey: ["ticket-stats"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Gagal menyimpan tiket");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
        else resetForm();
      }}
    >
      {/* ==== Ticket create/edit dialog ==== */}
      <DialogContent data-section="ticket-create-edit-dialog" className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Tiket" : "Buat Tiket Baru"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Perbarui informasi tiket work order" : "Isi informasi tiket work order baru"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-2">

          {/* ==== Form group: Info Tiket ==== */}
          <fieldset data-section="ticket-form-info" className="space-y-4">
            <legend className="text-sm font-semibold text-gray-700 mb-2">Info Tiket</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Kategori <span className="text-red-500">*</span></Label>
                <Select value={form.categoryId} onValueChange={(v) => update("categoryId", v)}>
                  <SelectTrigger><SelectValue placeholder="Pilih kategori" /></SelectTrigger>
                  <SelectContent>
                    {categories.filter((c) => c.isActive !== 0).map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        <span className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color ?? "#6B7280" }} />
                          {c.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Prioritas</Label>
                <Select value={form.priority} onValueChange={(v) => update("priority", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Rendah</SelectItem>
                    <SelectItem value="medium">Sedang</SelectItem>
                    <SelectItem value="high">Tinggi</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Judul <span className="text-red-500">*</span></Label>
              <Input value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="Judul tiket work order" />
            </div>
            <div className="space-y-1.5">
              <Label>Deskripsi</Label>
              <Textarea value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Deskripsi pekerjaan..." rows={3} />
            </div>
          </fieldset>

          {/* ==== Form group: Pelanggan ==== */}
          <fieldset data-section="ticket-form-customer" className="space-y-3">
            <legend className="text-sm font-semibold text-gray-700 mb-1">Pelanggan (opsional)</legend>
            {selectedCustomer ? (
              <div className="flex items-center gap-2 p-2.5 rounded-lg border bg-blue-50/50 border-blue-200">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900">{selectedCustomer.name}</p>
                  <p className="text-xs text-gray-500">{selectedCustomer.customerId}{selectedCustomer.phone ? ` \u2022 ${selectedCustomer.phone}` : ""}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setSelectedCustomerId(null); update("address", ""); }}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Input
                  placeholder="Cari pelanggan (nama atau ID)..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                />
                {customerSearch.trim() && (
                  <div className="border rounded-lg max-h-[160px] overflow-y-auto">
                    {filteredCustomers.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-3">Tidak ada pelanggan ditemukan</p>
                    ) : (
                      filteredCustomers.map((c) => (
                        <button
                          key={c.id}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-0 text-sm transition-colors"
                          onClick={() => {
                            setSelectedCustomerId(c.id);
                            setCustomerSearch("");
                            if (c.address) update("address", c.address);
                          }}
                        >
                          <span className="font-medium">{c.name}</span>
                          <span className="text-gray-400 ml-2 text-xs">{c.customerId}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </fieldset>

          {/* ==== Form group: Jadwal & Waktu ==== */}
          <fieldset data-section="ticket-form-schedule" className="space-y-4">
            <legend className="text-sm font-semibold text-gray-700 mb-2">Jadwal & Waktu</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Tanggal Jadwal <span className="text-red-500">*</span></Label>
                <Input type="date" value={form.scheduledDate} onChange={(e) => update("scheduledDate", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Jam Mulai <span className="text-red-500">*</span></Label>
                <Input type="time" value={form.scheduledTime} onChange={(e) => update("scheduledTime", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Estimasi Durasi</Label>
                <Select value={durationMode} onValueChange={setDurationMode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {durationMode === "custom" && (
                  <Input
                    type="number" min={1} placeholder="Durasi dalam menit"
                    value={customDuration} onChange={(e) => setCustomDuration(e.target.value)}
                    className="mt-1.5"
                  />
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Deadline (opsional)</Label>
                <Input type="date" value={form.deadline} onChange={(e) => update("deadline", e.target.value)} />
              </div>
            </div>
          </fieldset>

          {/* ==== Form group: Penugasan ==== */}
          <fieldset data-section="ticket-form-assignment" className="space-y-4">
            <legend className="text-sm font-semibold text-gray-700 mb-2">Penugasan</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Lead Teknisi (opsional)</Label>
                <Select value={form.assignedTo} onValueChange={(v) => update("assignedTo", v)}>
                  <SelectTrigger><SelectValue placeholder="Pilih lead teknisi" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Tugaskan nanti</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>{u.name} ({u.role})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">
                   Lead = penanggung jawab (bisa close tiket). Helper bisa ditambahkan setelah tiket dibuat lewat tombol <strong>Tim Tugas</strong> di detail.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Alamat</Label>
                <Input value={form.address} onChange={(e) => update("address", e.target.value)} placeholder="Alamat lokasi pekerjaan" />
              </div>
            </div>
          </fieldset>

          {/* ==== Form actions ==== */}
          <div data-section="ticket-form-actions" className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={onClose}>Batal</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {isEdit ? "Simpan Perubahan" : "Buat Tiket"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getInitialForm(ticket: Ticket | null) {
  return {
    categoryId: ticket?.categoryId ? String(ticket.categoryId) : "",
    title: ticket?.title ?? "",
    description: ticket?.description ?? "",
    priority: ticket?.priority ?? "medium",
    assignedTo: ticket?.assignedTo ? String(ticket.assignedTo) : "none",
    scheduledDate: ticket?.scheduledDate ?? "",
    scheduledTime: ticket?.scheduledTime ?? "",
    deadline: ticket?.deadline ?? "",
    address: ticket?.address ?? "",
  };
}

// -- Detail Dialog ----------------------------------------------------------

function DetailDialog({ ticketId, onClose, categories, customerMap, userMap, onEdit, onDelete }: {
  ticketId: number | null;
  onClose: () => void;
  categories: TicketCategory[];
  customerMap: Map<number, Customer>;
  userMap: Map<number, SafeUser>;
  onEdit: (t: Ticket) => void;
  onDelete: (id: number) => void;
}) {
  const qc = useQueryClient();
  const [noteText, setNoteText] = useState("");
  const [resolutionText, setResolutionText] = useState("");
  const [actualDuration, setActualDuration] = useState("");
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [assignUserId, setAssignUserId] = useState("");
  const [showAssignForm, setShowAssignForm] = useState(false);

  const { data: detail, isLoading } = useQuery<TicketWithActivities>({
    queryKey: ["ticket-detail", ticketId],
    queryFn: () => api.get<TicketWithActivities>(`/tickets/${ticketId}`),
    enabled: ticketId !== null,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["ticket-detail", ticketId] });
    qc.invalidateQueries({ queryKey: ["tickets"] });
    qc.invalidateQueries({ queryKey: ["ticket-stats"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const statusMut = useMutation({
    mutationFn: (body: { status: string; resolution?: string; actualDuration?: number }) =>
      api.post(`/tickets/${ticketId}/status`, body),
    onSuccess: () => { invalidateAll(); toast.success("Status diperbarui"); setShowResolveForm(false); },
    onError: (e: any) => toast.error(e.message),
  });

  const assignMut = useMutation({
    mutationFn: (body: { assignedTo: number }) =>
      api.post(`/tickets/${ticketId}/assign`, body),
    onSuccess: () => { invalidateAll(); toast.success("Petugas ditugaskan"); setShowAssignForm(false); setAssignUserId(""); },
    onError: (e: any) => toast.error(e.message),
  });

  // v4.2.16: Team - multi-technician (lead + helpers untuk kerja barengan di lapangan)
  const { data: teamMembers = [] } = useQuery<Array<{ id: number; userId: number; role: string; userName: string; userRole: string; checkInAt: string | null; checkOutAt: string | null }>>({
    queryKey: ["ticket-team", ticketId],
    queryFn: () => api.get(`/tickets/${ticketId}/team`),
    enabled: ticketId !== null,
    refetchInterval: 30_000,
  });
  const addTeamMut = useMutation({
    mutationFn: (body: { userId: number; role: "lead" | "helper" }) =>
      api.post(`/tickets/${ticketId}/team`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ticket-team", ticketId] });
      qc.invalidateQueries({ queryKey: ["ticket-detail", ticketId] });
      qc.invalidateQueries({ queryKey: ["tickets"] });
      toast.success("Anggota tim ditambahkan");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const removeTeamMut = useMutation({
    mutationFn: (memberId: number) => api.delete(`/tickets/${ticketId}/team/${memberId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ticket-team", ticketId] });
      toast.success("Anggota tim dihapus");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // v4.2.16: Evidence (foto bukti)
  const { data: evidence = [] } = useQuery<Array<{ id: number; type: string; photoData?: string | null; hasPhoto?: boolean; capturedAt: string | null; capturedBy: number | null; notes: string | null; lat: number | null; lng: number | null }>>({
    queryKey: ["ticket-evidence", ticketId],
    queryFn: () => api.get(`/tickets/${ticketId}/evidence`),
    enabled: ticketId !== null,
  });
  const evidenceMut = useMutation({
    mutationFn: (body: { type: string; photoData: string; notes?: string; lat?: number; lng?: number }) =>
      api.post(`/tickets/${ticketId}/evidence`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ticket-evidence", ticketId] });
      toast.success("Foto berhasil diupload");
    },
    onError: (e: any) => toast.error(e.message || "Upload foto gagal"),
  });

  const noteMut = useMutation({
    mutationFn: (body: { content: string }) =>
      api.post(`/tickets/${ticketId}/activity`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ticket-detail", ticketId] }); setNoteText(""); toast.success("Catatan ditambahkan"); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!ticketId) return null;

  const t = detail;
  const cat = t?.categoryId ? categories.find((c) => c.id === t.categoryId) : null;
  const cust = t?.customerId ? customerMap.get(t.customerId) : null;
  const assignee = t?.assignedTo ? userMap.get(t.assignedTo) : null;
  const creator = t ? userMap.get(t.createdBy) : null;
  const st = STATUS_CONFIG[t?.status ?? "open"] ?? STATUS_CONFIG.open;
  const pri = PRIORITY_CONFIG[t?.priority ?? "medium"] ?? PRIORITY_CONFIG.medium;

  return (
    <Dialog open={ticketId !== null} onOpenChange={(v) => { if (!v) onClose(); }}>
      {/* ==== Ticket detail dialog ==== */}
      <DialogContent data-section="ticket-detail-dialog" className="max-w-3xl max-h-[90vh] overflow-y-auto">
        {isLoading || !t ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-500">Memuat detail...</span>
          </div>
        ) : (
          <>
            <DialogHeader className="pb-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="font-mono text-sm font-bold text-blue-600">{t.ticketNumber}</span>
                <Badge className={cn("border-0 text-xs", st.color)}>{st.label}</Badge>
                <Badge className={cn("border-0 text-xs", pri.color)}>{pri.label}</Badge>
                {cat && (
                  <Badge className="border-0 text-xs" style={{ backgroundColor: (cat.color ?? "#6B7280") + "20", color: cat.color ?? "#6B7280" }}>
                    {cat.name}
                  </Badge>
                )}
                {/* v4.2.4: SLA badge */}
                {(t.slaDeadline ?? t.deadline) && t.status !== "resolved" && t.status !== "closed" && (() => {
                  const sla = slaTone(t.slaDeadline ?? t.deadline);
                  if (!sla.tone) return null;
                  const cls =
                    sla.tone === "expired" ? "bg-rose-200 text-rose-900 border-rose-400" :
                    sla.tone === "danger" ? "bg-rose-100 text-rose-700 border-rose-200" :
                    sla.tone === "warning" ? "bg-amber-100 text-amber-700 border-amber-200" :
                    sla.tone === "caution" ? "bg-yellow-100 text-yellow-800 border-yellow-200" :
                    "bg-emerald-100 text-emerald-700 border-emerald-200";
                  return (
                    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-mono tabular-nums font-bold", cls)}>
                      <Clock className="h-3 w-3" /> SLA {sla.label}
                    </span>
                  );
                })()}
              </div>
              <DialogTitle className="text-xl">{t.title}</DialogTitle>
              {t.description && (
                <DialogDescription className="mt-1 whitespace-pre-wrap">{t.description}</DialogDescription>
              )}
            </DialogHeader>

            {/* v4.2.4: Workflow stages timeline */}
            <WorkflowSection ticketId={t.id} />

            {/* v4.2.16: Foto Bukti - upload + gallery */}
            <EvidencePanel
              ticketId={ticketId}
              evidence={evidence}
              onUpload={(data) => evidenceMut.mutate(data)}
              isUploading={evidenceMut.isPending}
            />

            {/* ==== Ticket detail info grid ==== */}
            <div data-section="ticket-detail-info" className="grid grid-cols-2 gap-x-6 gap-y-3 mt-4 text-sm">
              <InfoRow label="Pelanggan" value={cust ? `${cust.name} (${cust.customerId})` : "\u2014"} />
              <InfoRow
                label="Tim Tugas"
                value={
                  teamMembers.length > 0
                    ? teamMembers.map(m => `${m.userName}${m.role === "lead" ? " (Lead)" : ""}`).join(", ")
                    : (assignee?.name ?? "\u2014")
                }
              />
              <InfoRow label="Jadwal" value={t.scheduledDate ? `${formatDate(t.scheduledDate)}${t.scheduledTime ? ` ${t.scheduledTime.slice(0, 5)}` : ""}` : "\u2014"} />
              <InfoRow label="Estimasi" value={formatDuration(t.estimatedDuration)} />
              <InfoRow label="Deadline" value={formatDate(t.deadline)} />
              <InfoRow label="Dibuat oleh" value={creator?.name ?? "\u2014"} />
              <InfoRow label="Dibuat pada" value={formatDateTime(t.createdAt)} />
              <InfoRow label="Alamat" value={t.address ?? "\u2014"} />
              {t.resolution && <InfoRow label="Resolusi" value={t.resolution} />}
              {t.actualDuration && <InfoRow label="Durasi Aktual" value={formatDuration(t.actualDuration)} />}
            </div>

            {/* ==== Ticket detail status action buttons ==== */}
            <div data-section="ticket-detail-actions" className="flex flex-wrap items-center gap-2 mt-5 pt-4 border-t">
              <span className="text-sm font-medium text-gray-500 mr-1">Aksi:</span>

              {/* v4.2.16: Tim Tugas - buka kapan aja, bukan cuma open/assigned */}
              <Button size="sm" variant="outline" onClick={() => setShowAssignForm(!showAssignForm)}>
                <UserPlus className="w-3.5 h-3.5 mr-1" />
                Tim Tugas
                {teamMembers.length > 0 && (
                  <span className="ml-1.5 px-1.5 py-0 rounded-full bg-purple-100 text-purple-700 text-[10px] font-bold tabular-nums">
                    {teamMembers.length}
                  </span>
                )}
              </Button>

              {(t.status === "open" || t.status === "assigned") && (
                <Button size="sm" variant="outline" onClick={() => statusMut.mutate({ status: "in_progress" })}>
                  <ArrowRight className="w-3.5 h-3.5 mr-1" /> Mulai Kerjakan
                </Button>
              )}
              {t.status === "in_progress" && (
                <>
                  <Button size="sm" variant="outline" onClick={() => statusMut.mutate({ status: "pending" })}>
                    <Pause className="w-3.5 h-3.5 mr-1" /> Tandai Tertunda
                  </Button>
                  <Button size="sm" variant="default" onClick={() => setShowResolveForm(!showResolveForm)}>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Selesai
                  </Button>
                </>
              )}
              {t.status === "pending" && (
                <>
                  <Button size="sm" variant="outline" onClick={() => statusMut.mutate({ status: "in_progress" })}>
                    <ArrowRight className="w-3.5 h-3.5 mr-1" /> Lanjutkan
                  </Button>
                  <Button size="sm" variant="default" onClick={() => setShowResolveForm(!showResolveForm)}>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Selesai
                  </Button>
                </>
              )}
              {t.status === "resolved" && (
                <Button size="sm" variant="outline" onClick={() => statusMut.mutate({ status: "closed" })}>
                  <X className="w-3.5 h-3.5 mr-1" /> Tutup Tiket
                </Button>
              )}

              <div className="flex-1" />
              <Button size="sm" variant="ghost" onClick={() => onEdit(t)}>Edit</Button>
              <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => onDelete(t.id)}>
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Hapus
              </Button>
            </div>

            {/* v4.2.16: Tim Tugas - multi-teknisi (lead + helpers untuk kerja barengan) */}
            {showAssignForm && (
              <TeamPanel
                teamMembers={teamMembers}
                userMap={userMap}
                onAdd={(userId, role) => addTeamMut.mutate({ userId, role })}
                onRemove={(memberId) => removeTeamMut.mutate(memberId)}
                onClose={() => setShowAssignForm(false)}
                isAdding={addTeamMut.isPending}
              />
            )}

            {/* Resolve inline form */}
            {showResolveForm && (
              <div className="p-3 rounded-lg bg-green-50 border border-green-200 space-y-3 mt-2">
                <div className="space-y-1.5">
                  <Label className="text-sm">Catatan Resolusi</Label>
                  <Textarea value={resolutionText} onChange={(e) => setResolutionText(e.target.value)} placeholder="Jelaskan penyelesaian..." rows={2} className="bg-white" />
                </div>
                <div className="flex items-center flex-wrap gap-3">
                  <div className="space-y-1">
                    <Label className="text-sm">Durasi Aktual (menit)</Label>
                    <Input type="number" min={1} value={actualDuration} onChange={(e) => setActualDuration(e.target.value)} className="w-[140px] bg-white" placeholder="menit" />
                  </div>
                  <div className="flex items-center gap-2 mt-5">
                    <Button size="sm" disabled={statusMut.isPending} onClick={() => {
                      statusMut.mutate({
                        status: "resolved",
                        resolution: resolutionText || undefined,
                        actualDuration: actualDuration ? Number(actualDuration) : undefined,
                      });
                    }}>
                      {statusMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Konfirmasi Selesai"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowResolveForm(false)}>Batal</Button>
                  </div>
                </div>
              </div>
            )}

            {/* ==== Ticket activity timeline ==== */}
            <div data-section="ticket-activity-timeline" className="mt-5 pt-4 border-t">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Riwayat Aktivitas</h3>
              {(t.activities?.length ?? 0) === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">Belum ada aktivitas</p>
              ) : (
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                  {[...t.activities].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((act) => {
                    const cfg = ACTIVITY_ICON_CONFIG[act.type] ?? ACTIVITY_ICON_CONFIG.note;
                    const ActIcon = cfg.icon;
                    const actUser = userMap.get(act.userId);
                    const parsed = parseActivityContent(act);
                    return (
                      <div key={act.id} data-section="ticket-activity-item" data-activity-id={act.id} className="flex gap-3 items-start">
                        <div className={cn("p-1.5 rounded-full mt-0.5 shrink-0", cfg.color)}>
                          <ActIcon className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-800">{actUser?.name ?? "Sistem"}</span>
                            <span className="text-xs text-gray-400">{formatDateTime(act.createdAt)}</span>
                          </div>
                          <p className="text-sm text-gray-600 mt-0.5">{parsed}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ==== Ticket add-note composer ==== */}
            <div data-section="ticket-add-note" className="mt-4 pt-3 border-t">
              <Label className="text-sm font-medium mb-1.5 block">Tambah Catatan</Label>
              <div className="flex gap-2">
                <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Tulis catatan..." rows={2} className="flex-1" />
                <Button className="self-end" disabled={!noteText.trim() || noteMut.isPending} onClick={() => noteMut.mutate({ content: noteText.trim() })}>
                  {noteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Tambah Catatan"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-gray-400 text-xs block">{label}</span>
      <span className="text-gray-800">{value}</span>
    </div>
  );
}

// v4.2.4: Workflow section di Detail Dialog admin - vertical stage timeline + per-stage durasi
function WorkflowSection({ ticketId }: { ticketId: number }) {
  const { data: workflow } = useQuery<{
    currentStage: string | null;
    stageEnteredAt: string | null;
    stages: Array<{ key: string; label: string; color?: string; sortOrder: number; isFinal?: boolean }>;
    transitions: Array<{ stage: string; label: string; enteredAt: string; exitedAt: string | null; durationSec: number | null; note: string | null; byUserId: number }>;
  }>({
    queryKey: ["ticket-workflow-admin", ticketId],
    queryFn: () => api.get<any>(`/tickets/${ticketId}/workflow`),
    enabled: !!ticketId,
    refetchInterval: 30_000,
  });

  if (!workflow || workflow.stages.length === 0) return null;

  const sorted = [...workflow.stages].sort((a, b) => a.sortOrder - b.sortOrder);
  const completedKeys = new Set(workflow.transitions.filter(t => t.exitedAt).map(t => t.stage));

  function fmtDur(sec: number | null): string {
    if (sec == null || sec < 0) return "-";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h}j ${m}m`;
    if (m > 0) return `${m}m`;
    return `${sec}s`;
  }

  return (
    /* ==== Ticket workflow-progress timeline ==== */
    <div data-section="ticket-workflow-timeline" className="mt-4 rounded-lg border bg-gradient-to-br from-zinc-50/50 to-transparent dark:from-zinc-900/30 overflow-hidden">
      <div className="px-4 py-2 border-b bg-muted/40 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Workflow Progress</span>
        <span className="text-[10px] text-muted-foreground">
          {completedKeys.size} / {sorted.length} stage selesai
        </span>
      </div>
      <div className="px-4 py-3 space-y-1">
        {sorted.map((stage, idx) => {
          const transition = workflow.transitions.find(t => t.stage === stage.key);
          const isCompleted = completedKeys.has(stage.key);
          const isActive = workflow.currentStage === stage.key;
          const isFuture = !isCompleted && !isActive;
          return (
            <div key={stage.key} className={cn(
              "flex items-start gap-3 py-1.5",
              isActive && "rounded-md -mx-2 px-2 bg-amber-50/60 dark:bg-amber-950/20",
            )}>
              <div className={cn(
                "h-6 w-6 rounded-full grid place-items-center shrink-0 mt-0.5 font-mono text-[10px] font-bold",
                isCompleted && "bg-emerald-500 text-white",
                isActive && "ring-2 ring-amber-300 dark:ring-amber-800 animate-pulse",
                isFuture && "bg-zinc-100 dark:bg-zinc-800 text-muted-foreground border border-zinc-300 dark:border-zinc-700",
              )} style={{ backgroundColor: isActive ? (stage.color ?? "#F59E0B") : undefined, color: isActive ? "white" : undefined }}>
                {isCompleted ? "✓" : idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn(
                    "text-sm font-semibold",
                    isFuture && "text-muted-foreground",
                  )}>{stage.label}</span>
                  {stage.isFinal && <Badge variant="outline" className="text-[9px] uppercase tracking-wider px-1 py-0 font-bold">Final</Badge>}
                  {isActive && <Badge className="text-[9px] uppercase tracking-wider px-1.5 py-0 font-bold bg-amber-500 text-white border-0">Aktif</Badge>}
                  {transition?.durationSec != null && <span className="text-[10px] font-mono tabular-nums text-muted-foreground">· {fmtDur(transition.durationSec)}</span>}
                </div>
                {transition?.note && (
                  <div className="text-xs text-muted-foreground mt-0.5 italic">{transition.note}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function parseActivityContent(act: TicketActivity): string {
  if (!act.content) return "\u2014";
  if (act.type === "status_change") {
    try {
      const data = JSON.parse(act.content);
      const from = STATUS_CONFIG[data.from]?.label ?? data.from;
      const to = STATUS_CONFIG[data.to]?.label ?? data.to;
      return `Status diubah dari ${from} ke ${to}`;
    } catch {
      return act.content;
    }
  }
  if (act.type === "assigned") {
    try {
      const data = JSON.parse(act.content);
      return `Ditugaskan ke ${data.assigneeName ?? data.assignedTo ?? act.content}`;
    } catch {
      return act.content;
    }
  }
  return act.content;
}

// -- Category Management Dialog ---------------------------------------------

// v4.2.4: Workflow presets - sinkron dengan backend WORKFLOW_PRESETS di shared/schema.ts
const FRONTEND_WORKFLOW_PRESETS: Record<string, { label: string; description: string; stages: Array<{ key: string; label: string; color: string; sortOrder: number; slaMinutes?: number; isFinal?: boolean; requiresPhoto?: boolean; requiresGps?: boolean; requiresNote?: boolean; requiresSignature?: boolean; description?: string; icon?: string }> }> = {
  gangguan: {
    label: "Gangguan",
    description: "Diagnose-first workflow untuk perbaikan jaringan",
    stages: [
      { key: "prep", label: "Persiapan Alat", icon: "PackageCheck", color: "#0EA5E9", sortOrder: 1, slaMinutes: 15 },
      { key: "travel", label: "Perjalanan", icon: "Navigation", color: "#8B5CF6", sortOrder: 2, slaMinutes: 45, requiresGps: true },
      { key: "diagnose", label: "Diagnosa", icon: "Stethoscope", color: "#F59E0B", sortOrder: 3, slaMinutes: 30, requiresPhoto: true, requiresNote: true },
      { key: "repair", label: "Perbaikan", icon: "Wrench", color: "#EF4444", sortOrder: 4, slaMinutes: 90, requiresPhoto: true },
      { key: "verify", label: "Test Sinyal", icon: "Activity", color: "#22C55E", sortOrder: 5, slaMinutes: 15, requiresPhoto: true },
      { key: "done", label: "Selesai", icon: "Flag", color: "#10B981", sortOrder: 6, isFinal: true, requiresNote: true },
    ],
  },
  install: {
    label: "Pemasangan Baru",
    description: "Survey → install → activate → handover dengan TTD pelanggan",
    stages: [
      { key: "survey", label: "Survey Lokasi", icon: "MapPin", color: "#06B6D4", sortOrder: 1, slaMinutes: 60, requiresPhoto: true, requiresGps: true },
      { key: "prep", label: "Siapkan ONT+Kabel", icon: "PackageCheck", color: "#0EA5E9", sortOrder: 2, slaMinutes: 30, requiresPhoto: true },
      { key: "pull_cable", label: "Tarik Kabel", icon: "Cable", color: "#8B5CF6", sortOrder: 3, slaMinutes: 120, requiresPhoto: true },
      { key: "install", label: "Pasang ONT", icon: "Router", color: "#F59E0B", sortOrder: 4, slaMinutes: 60, requiresPhoto: true },
      { key: "activate", label: "Aktivasi", icon: "Wifi", color: "#22C55E", sortOrder: 5, slaMinutes: 30, requiresPhoto: true },
      { key: "handover", label: "Serah Terima", icon: "FileCheck", color: "#10B981", sortOrder: 6, isFinal: true, requiresSignature: true, requiresNote: true },
    ],
  },
  migrasi: {
    label: "Migrasi/Relokasi",
    description: "Pindah ODP atau ganti paket dengan foto before/after",
    stages: [
      { key: "prep", label: "Persiapan", icon: "PackageCheck", color: "#0EA5E9", sortOrder: 1, slaMinutes: 20 },
      { key: "travel", label: "Perjalanan", icon: "Navigation", color: "#8B5CF6", sortOrder: 2, slaMinutes: 45, requiresGps: true },
      { key: "before", label: "Foto Awal", icon: "Camera", color: "#F59E0B", sortOrder: 3, slaMinutes: 10, requiresPhoto: true },
      { key: "execute", label: "Eksekusi", icon: "Wrench", color: "#EF4444", sortOrder: 4, slaMinutes: 90, requiresPhoto: true },
      { key: "verify", label: "Test & Aktivasi", icon: "Activity", color: "#22C55E", sortOrder: 5, slaMinutes: 20, requiresPhoto: true },
      { key: "done", label: "Selesai", icon: "Flag", color: "#10B981", sortOrder: 6, isFinal: true, requiresNote: true },
    ],
  },
  survey: {
    label: "Survey/Maintenance",
    description: "Workflow ringkas untuk survey atau preventive maintenance",
    stages: [
      { key: "travel", label: "Perjalanan", icon: "Navigation", color: "#8B5CF6", sortOrder: 1, slaMinutes: 60, requiresGps: true },
      { key: "survey", label: "Survey Onsite", icon: "MapPin", color: "#0EA5E9", sortOrder: 2, slaMinutes: 30, requiresPhoto: true, requiresGps: true },
      { key: "report", label: "Buat Laporan", icon: "FileText", color: "#22C55E", sortOrder: 3, isFinal: true, requiresNote: true },
    ],
  },
};

function CategoryManagementDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#3B82F6");
  const [newIcon, setNewIcon] = useState("");
  const [newSortOrder, setNewSortOrder] = useState("0");
  const [newSla, setNewSla] = useState("4");
  const [newPreset, setNewPreset] = useState("gangguan");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editSortOrder, setEditSortOrder] = useState("");
  const [editSla, setEditSla] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const { data: cats = [], isLoading } = useQuery<(TicketCategory & { workflowStages?: string | null; slaHours?: number | null })[]>({
    queryKey: ["ticket-categories"],
    queryFn: () => api.get<any[]>("/ticket-categories"),
    enabled: open,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["ticket-categories"] });

  const createMut = useMutation({
    mutationFn: (body: any) => api.post("/ticket-categories", body),
    onSuccess: () => {
      invalidate();
      setNewName(""); setNewColor("#3B82F6"); setNewIcon(""); setNewSortOrder("0"); setNewSla("4"); setNewPreset("gangguan");
      toast.success("Kategori ditambahkan dengan workflow preset");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // v4.2.4: apply workflow preset ke kategori existing
  const applyPresetMut = useMutation({
    mutationFn: ({ id, preset, slaHours }: { id: number; preset: string; slaHours?: number }) => {
      const stages = FRONTEND_WORKFLOW_PRESETS[preset]?.stages;
      if (!stages) throw new Error("Preset tidak ditemukan");
      const body: any = { workflowStages: JSON.stringify(stages) };
      if (slaHours) body.slaHours = slaHours;
      return api.put(`/ticket-categories/${id}`, body);
    },
    onSuccess: () => { invalidate(); toast.success("Workflow di-update"); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => api.put(`/ticket-categories/${id}`, body),
    onSuccess: () => { invalidate(); setEditId(null); toast.success("Kategori diperbarui"); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/ticket-categories/${id}`),
    onSuccess: () => { invalidate(); setDeleteConfirmId(null); toast.success("Kategori dihapus"); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleActive = (cat: TicketCategory) => {
    updateMut.mutate({ id: cat.id, body: { name: cat.name, color: cat.color, icon: cat.icon, sortOrder: cat.sortOrder, isActive: cat.isActive === 1 ? 0 : 1 } });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      {/* ==== Ticket category management dialog ==== */}
      <DialogContent data-section="ticket-category-dialog" className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Kelola Kategori Tiket</DialogTitle>
          <DialogDescription>Tambah, ubah, atau hapus kategori work order</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            {/* Existing categories */}
            <div className="space-y-2">
              {cats.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Belum ada kategori</p>}
              {cats.map((cat) => {
                const isExpanded = expandedId === cat.id;
                let stages: any[] = [];
                try { if (cat.workflowStages) stages = JSON.parse(cat.workflowStages); } catch {}
                stages.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
                return (
                  <div key={cat.id} className="rounded-lg border bg-white overflow-hidden">
                    <div className="flex items-center gap-2 p-2.5 flex-wrap">
                      {editId === cat.id ? (
                        <>
                          <input type="color" className="w-8 h-8 rounded cursor-pointer border-0 p-0" value={editColor} onChange={(e) => setEditColor(e.target.value)} />
                          <Input className="flex-1 min-w-[100px] h-8" value={editName} onChange={(e) => setEditName(e.target.value)} />
                          <Input className="w-14 h-8" type="number" value={editSortOrder} onChange={(e) => setEditSortOrder(e.target.value)} title="Sort order" />
                          <Input className="w-16 h-8" type="number" value={editSla} onChange={(e) => setEditSla(e.target.value)} placeholder="SLA" title="SLA jam" />
                          <Button size="sm" variant="ghost" disabled={updateMut.isPending} onClick={() => {
                            if (!editName.trim()) { toast.error("Nama wajib diisi"); return; }
                            updateMut.mutate({ id: cat.id, body: { name: editName.trim(), color: editColor, icon: cat.icon, sortOrder: Number(editSortOrder) || 0, slaHours: Number(editSla) || null } });
                          }}>
                            {updateMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 text-green-600" />}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                            <X className="w-4 h-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: cat.color ?? "#6B7280" }} />
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : cat.id)}
                            className="flex-1 min-w-0 truncate text-sm font-medium text-gray-800 text-left hover:text-blue-600"
                          >
                            {cat.name}
                          </button>
                          {cat.slaHours && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200" title="SLA target">
                              SLA {cat.slaHours}j
                            </span>
                          )}
                          <span className="text-[10px] font-mono text-gray-400" title="Jumlah stage">
                            {stages.length || 0} stage
                          </span>
                          <Badge variant={cat.isActive === 0 ? "secondary" : "default"} className="text-[10px] py-0">
                            {cat.isActive === 0 ? "Off" : "On"}
                          </Badge>
                          <Button size="sm" variant="ghost" onClick={() => toggleActive(cat)} title={cat.isActive === 0 ? "Aktifkan" : "Nonaktifkan"}>
                            {cat.isActive === 0 ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Pause className="w-4 h-4 text-amber-500" />}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setEditId(cat.id); setEditName(cat.name); setEditColor(cat.color ?? "#6B7280"); setEditSortOrder(String(cat.sortOrder ?? 0)); setEditSla(String(cat.slaHours ?? "")); }}>
                            <Settings className="w-4 h-4 text-gray-400" />
                          </Button>
                          {deleteConfirmId === cat.id ? (
                            <div className="flex items-center gap-1">
                              <Button size="sm" variant="destructive" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate(cat.id)}>
                                {deleteMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Ya"}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setDeleteConfirmId(null)}>Batal</Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => setDeleteConfirmId(cat.id)}>
                              <Trash2 className="w-4 h-4 text-red-400" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                    {/* v4.2.4: Workflow stages preview */}
                    {isExpanded && (
                      <div className="border-t bg-muted/30 p-3">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Workflow Stages</div>
                        {stages.length === 0 ? (
                          <div className="text-xs text-muted-foreground italic">Belum ada workflow. Pilih preset di bawah.</div>
                        ) : (
                          <div className="space-y-1">
                            {stages.map((s: any, idx: number) => (
                              <div key={s.key} className="flex items-center gap-2 text-xs">
                                <span className="font-mono w-5 text-muted-foreground">{idx + 1}.</span>
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color ?? "#6B7280" }} />
                                <span className="font-medium text-gray-800 flex-1">{s.label}</span>
                                {s.slaMinutes && <span className="font-mono text-[10px] text-muted-foreground">~{s.slaMinutes}m</span>}
                                <div className="flex gap-0.5">
                                  {s.requiresPhoto && <span title="Wajib foto"><Camera className="size-3 text-muted-foreground" /></span>}
                                  {s.requiresGps && <span title="Wajib GPS"><MapPin className="size-3 text-muted-foreground" /></span>}
                                  {s.requiresNote && <span title="Wajib catatan"><StickyNote className="size-3 text-muted-foreground" /></span>}
                                  {s.requiresSignature && <span title="Wajib TTD"><PenLine className="size-3 text-muted-foreground" /></span>}
                                  {s.isFinal && <span title="Stage final"><Flag className="size-3 text-muted-foreground" /></span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="mt-3 pt-2 border-t border-muted">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Apply Preset Workflow</div>
                          <div className="flex gap-1.5 flex-wrap">
                            {Object.entries(FRONTEND_WORKFLOW_PRESETS).map(([key, p]) => (
                              <Button
                                key={key}
                                size="sm"
                                variant="outline"
                                disabled={applyPresetMut.isPending}
                                onClick={() => {
                                  if (confirm(`Apply preset "${p.label}" ke kategori "${cat.name}"? Workflow lama akan diganti.`)) {
                                    applyPresetMut.mutate({ id: cat.id, preset: key });
                                  }
                                }}
                                className="h-7 text-xs"
                                title={p.description}
                              >
                                {p.label}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add new category */}
            <div className="border-t pt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Tambah Kategori Baru</p>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <input type="color" className="w-8 h-8 rounded cursor-pointer border-0 p-0" value={newColor} onChange={(e) => setNewColor(e.target.value)} />
                <Input className="flex-1 min-w-[120px] h-9" placeholder="Nama kategori" value={newName} onChange={(e) => setNewName(e.target.value)} />
                <Input className="w-20 h-9" placeholder="Ikon" value={newIcon} onChange={(e) => setNewIcon(e.target.value)} title="Nama ikon (opsional)" />
                <Input className="w-14 h-9" type="number" placeholder="Urut" value={newSortOrder} onChange={(e) => setNewSortOrder(e.target.value)} title="Sort order" />
                <Input className="w-14 h-9" type="number" placeholder="SLA" value={newSla} onChange={(e) => setNewSla(e.target.value)} title="SLA jam" />
              </div>
              <div className="flex items-center gap-2">
                <Select value={newPreset} onValueChange={setNewPreset}>
                  <SelectTrigger className="h-9 flex-1 text-xs">
                    <SelectValue placeholder="Pilih workflow preset" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FRONTEND_WORKFLOW_PRESETS).map(([key, p]) => (
                      <SelectItem key={key} value={key} className="text-xs">
                        {p.label} - {p.stages.length} stage
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" disabled={!newName.trim() || createMut.isPending} onClick={() => {
                  const preset = FRONTEND_WORKFLOW_PRESETS[newPreset];
                  createMut.mutate({
                    name: newName.trim(),
                    color: newColor,
                    icon: newIcon || null,
                    sortOrder: Number(newSortOrder) || 0,
                    slaHours: Number(newSla) || null,
                    workflowStages: preset ? JSON.stringify(preset.stages) : null,
                  });
                }}>
                  {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" />Tambah</>}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                Preset menentukan urutan stage workflow yang akan diikuti teknisi (bisa diubah kapan saja setelah dibuat).
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// -------------------------------------------------------------------------
// v4.2.16: TeamPanel - multi-teknisi (lead + helpers untuk kerja barengan di lapangan)
// -------------------------------------------------------------------------

function TeamPanel({
  teamMembers, userMap, onAdd, onRemove, onClose, isAdding,
}: {
  teamMembers: Array<{ id: number; userId: number; role: string; userName: string; userRole: string; checkInAt: string | null; checkOutAt: string | null }>;
  userMap: Map<number, SafeUser>;
  onAdd: (userId: number, role: "lead" | "helper") => void;
  onRemove: (memberId: number) => void;
  onClose: () => void;
  isAdding: boolean;
}) {
  const [newUserId, setNewUserId] = useState("");
  const [newRole, setNewRole] = useState<"lead" | "helper">("helper");

  const memberUserIds = new Set(teamMembers.map(m => m.userId));
  const availableUsers = Array.from(userMap.values()).filter(u => !memberUserIds.has(u.id));
  const hasLead = teamMembers.some(m => m.role === "lead");

  function handleAdd() {
    if (!newUserId) return;
    onAdd(Number(newUserId), newRole);
    setNewUserId("");
  }

  return (
    /* ==== Ticket team panel (lead + helpers) ==== */
    <div data-section="ticket-team-panel" className="rounded-lg bg-purple-50 border border-purple-200 mt-2 overflow-hidden">
      <div className="px-3 py-2 bg-purple-100/60 border-b border-purple-200 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <UserPlus className="w-3.5 h-3.5 text-purple-700" />
          <span className="text-xs font-bold uppercase tracking-wider text-purple-900">Tim Tugas</span>
          <span className="text-[10px] text-purple-700">·</span>
          <span className="text-[10px] text-purple-700">{teamMembers.length} teknisi</span>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose} className="h-6 w-6 p-0 text-purple-700"><X className="w-3.5 h-3.5" /></Button>
      </div>

      {/* List existing members */}
      {teamMembers.length > 0 && (
        <div className="px-3 py-2 space-y-1.5 border-b border-purple-200">
          {teamMembers.map(m => (
            <div key={m.id} className="flex items-center gap-2 bg-white rounded-md px-2.5 py-1.5 border border-purple-100">
              <div className={cn(
                "h-6 w-6 rounded-full grid place-items-center text-[10px] font-bold shrink-0",
                m.role === "lead" ? "bg-amber-500 text-white" : "bg-sky-100 text-sky-700",
              )}>{(m.userName || "?").charAt(0).toUpperCase()}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{m.userName}</div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className={cn(
                    "px-1 py-0 rounded text-[9px] uppercase tracking-wider font-bold",
                    m.role === "lead" ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800",
                  )}>{m.role === "lead" ? "Lead" : "Helper"}</span>
                  {m.checkInAt && <span>· in {new Date(m.checkInAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>}
                  {m.checkOutAt && <span>· out {new Date(m.checkOutAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Keluarkan ${m.userName} dari tim?`)) onRemove(m.id); }} className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-50">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add new member */}
      <div className="px-3 py-2.5 flex items-center gap-2">
        <Select value={newUserId} onValueChange={setNewUserId}>
          <SelectTrigger className="flex-1 bg-white h-9"><SelectValue placeholder="Pilih teknisi..." /></SelectTrigger>
          <SelectContent>
            {availableUsers.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground italic">Semua user sudah masuk tim</div>
            ) : availableUsers.map(u => (
              <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={newRole} onValueChange={(v) => setNewRole(v as "lead" | "helper")}>
          <SelectTrigger className="w-[110px] bg-white h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="lead" disabled={hasLead}>Lead {hasLead ? "(sudah ada)" : ""}</SelectItem>
            <SelectItem value="helper">Helper</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" onClick={handleAdd} disabled={!newUserId || isAdding} className="h-9">
          {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        </Button>
      </div>

      <p className="px-3 pb-2 text-[10px] text-purple-700/70">
         Lead = supervisor (boleh close tiket). Helper = teknisi pendamping. Semua anggota tim akan bisa update stage + upload foto.
      </p>
    </div>
  );
}

// -------------------------------------------------------------------------
// v4.2.16: EvidencePanel - upload foto bukti (sebelum/proses/sesudah)
// -------------------------------------------------------------------------

const EVIDENCE_TYPE_LABELS: Record<string, string> = {
  before: "Sebelum",
  during: "Proses",
  after: "Sesudah",
  power_meter: "Power Meter",
  ont_serial: "Serial ONT",
  signature: "TTD",
};

async function compressImageToBase64(file: File, maxSize = 1280, quality = 0.7): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Gagal baca file"));
    reader.readAsDataURL(file);
  });
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio); height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function EvidencePanel({
  ticketId, evidence, onUpload, isUploading,
}: {
  ticketId: number | null;
  evidence: Array<{ id: number; type: string; photoData?: string | null; hasPhoto?: boolean; capturedAt: string | null; capturedBy: number | null; notes: string | null }>;
  onUpload: (data: { type: string; photoData: string; notes?: string }) => void;
  isUploading: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingType, setPendingType] = useState<string>("during");
  const [processingFile, setProcessingFile] = useState(false);

  async function handleFile(file: File) {
    setProcessingFile(true);
    try {
      const compressed = await compressImageToBase64(file, 1280, 0.72);
      onUpload({ type: pendingType, photoData: compressed });
    } catch (e: any) {
      toast.error(e.message || "Gagal proses foto");
    } finally {
      setProcessingFile(false);
    }
  }

  return (
    /* ==== Ticket evidence panel (foto bukti) ==== */
    <div data-section="ticket-evidence-panel" className="rounded-lg border bg-card overflow-hidden mt-4">
      <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Foto Bukti</span>
          <span className="text-[10px] font-mono tabular-nums text-muted-foreground">{evidence.length}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Select value={pendingType} onValueChange={setPendingType}>
            <SelectTrigger className="h-7 w-[110px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(EVIDENCE_TYPE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={processingFile || isUploading} className="h-7 text-xs">
            {(processingFile || isUploading) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Plus className="w-3.5 h-3.5 mr-1" /> Upload</>}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
          />
        </div>
      </div>

      {evidence.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground">
          Belum ada foto. Upload foto bukti pengerjaan (sebelum/proses/sesudah).
        </div>
      ) : (
        <div className="p-3 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {evidence.map(e => {
            const photoUrl = (e.hasPhoto || e.photoData) ? `/api/tickets/${ticketId}/evidence/${e.id}/photo` : undefined;
            return (
            <a
              key={e.id}
              data-section="ticket-evidence-item"
              data-evidence-id={e.id}
              href={photoUrl}
              target="_blank"
              rel="noreferrer"
              className="block aspect-square rounded-md overflow-hidden border bg-muted relative group"
              title={`${EVIDENCE_TYPE_LABELS[e.type] || e.type} · ${e.capturedAt ? new Date(e.capturedAt).toLocaleString("id-ID") : ""}`}
            >
              {photoUrl && <img src={photoUrl} alt="evidence" className="w-full h-full object-cover" />}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent text-white text-[9px] font-bold uppercase tracking-wider px-1.5 py-1">
                {EVIDENCE_TYPE_LABELS[e.type] || e.type}
              </div>
            </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------------------
// v4.2.16: TechnicianWorkloadPanel - laporan distribusi tiket per teknisi
// -------------------------------------------------------------------------

interface TechnicianWorkload {
  userId: number;
  userName: string;
  userRole: string;
  totalAssigned: number;
  asLead: number;
  asHelper: number;
  open: number;
  inProgress: number;
  pending: number;
  resolvedThisMonth: number;
  avgWorkMinutes: number | null;
}

interface CsatStat {
  userId: number; userName: string;
  totalResponses: number; avgRating: number;
  positiveCount: number; negativeCount: number;
}

function TechnicianWorkloadPanel() {
  const [expanded, setExpanded] = useState(false);
  const { data: workload = [], isLoading } = useQuery<TechnicianWorkload[]>({
    queryKey: ["ticket-workload-by-technician"],
    queryFn: () => api.get("/tickets/workload-by-technician"),
    refetchInterval: 60_000,
  });
  // v4.2.17: CSAT aggregate per teknisi
  const { data: csatStats = [] } = useQuery<CsatStat[]>({
    queryKey: ["ticket-csat-by-technician"],
    queryFn: () => api.get("/tickets/csat-by-technician"),
    refetchInterval: 60_000,
  });
  const csatByUser = useMemo(() => {
    const m = new Map<number, CsatStat>();
    for (const c of csatStats) m.set(c.userId, c);
    return m;
  }, [csatStats]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-4 px-4 flex items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading workload teknisi...
        </CardContent>
      </Card>
    );
  }
  if (workload.length === 0) {
    return null; // jangan tampil kalau belum ada teknisi yang assign
  }

  const totalActive = workload.reduce((sum, w) => sum + w.open + w.inProgress + w.pending, 0);
  const visible = expanded ? workload : workload.slice(0, 6);
  const hasMore = workload.length > 6;

  return (
    /* ==== Ticket workload-by-technician panel ==== */
    <Card data-section="ticket-workload-panel">
      <CardContent className="p-0">
        <div className="px-4 py-2.5 border-b bg-gradient-to-r from-purple-50/60 to-transparent flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-purple-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-foreground">Tiket per Teknisi</span>
            <span className="text-[10px] text-muted-foreground">·</span>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {workload.length} teknisi · {totalActive} tiket aktif
            </span>
          </div>
          {hasMore && (
            <button onClick={() => setExpanded(!expanded)} className="text-xs text-purple-700 hover:underline font-semibold">
              {expanded ? "Tampilkan lebih sedikit" : `Lihat semua (${workload.length})`}
            </button>
          )}
        </div>
        <div className="divide-y">
          {visible.map((w) => {
            const activeTotal = w.open + w.inProgress + w.pending;
            const initials = (w.userName || "?").split(" ").map(s => s[0]).join("").slice(0, 2).toUpperCase();
            return (
              <div key={w.userId} className="px-4 py-2.5 flex items-center gap-3 hover:bg-muted/30 transition-colors">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 grid place-items-center text-white text-xs font-bold shrink-0">
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold truncate">{w.userName}</span>
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0 rounded bg-zinc-100 text-zinc-700 font-bold">{w.userRole}</span>
                    {w.asLead > 0 && (
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0 rounded bg-amber-100 text-amber-800 font-bold">
                        {w.asLead} Lead
                      </span>
                    )}
                    {w.asHelper > 0 && (
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0 rounded bg-sky-100 text-sky-800 font-bold">
                        {w.asHelper} Helper
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground tabular-nums flex-wrap">
                    <span><strong className="text-foreground">{w.totalAssigned}</strong> total</span>
                    {activeTotal > 0 && <span className="text-orange-700"><strong>{activeTotal}</strong> aktif</span>}
                    {w.resolvedThisMonth > 0 && <span className="text-emerald-700"><strong>{w.resolvedThisMonth}</strong> selesai bulan ini</span>}
                    {w.avgWorkMinutes !== null && <span className="text-muted-foreground/70">avg {w.avgWorkMinutes}m/tiket</span>}
                    {/* v4.2.17: CSAT score */}
                    {(() => {
                      const csat = csatByUser.get(w.userId);
                      if (!csat || csat.totalResponses === 0) return null;
                      const tone = csat.avgRating >= 4.2 ? "text-emerald-700 bg-emerald-50 border-emerald-200" : csat.avgRating >= 3.5 ? "text-amber-700 bg-amber-50 border-amber-200" : "text-rose-700 bg-rose-50 border-rose-200";
                      return (
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0 rounded border ${tone}`} title={`${csat.totalResponses} respons · ${csat.positiveCount} positif · ${csat.negativeCount} negatif`}>
                           {csat.avgRating.toFixed(1)} <span className="text-muted-foreground">({csat.totalResponses})</span>
                        </span>
                      );
                    })()}
                  </div>
                </div>
                {/* Mini bar - proporsi status */}
                {activeTotal > 0 && (
                  <div className="hidden md:flex items-center gap-0.5 shrink-0">
                    {w.open > 0 && (
                      <div title={`${w.open} open/assigned`} className="h-6 bg-blue-400 rounded-sm" style={{ width: Math.max(8, (w.open / activeTotal) * 80) }} />
                    )}
                    {w.inProgress > 0 && (
                      <div title={`${w.inProgress} dikerjakan`} className="h-6 bg-orange-400 rounded-sm" style={{ width: Math.max(8, (w.inProgress / activeTotal) * 80) }} />
                    )}
                    {w.pending > 0 && (
                      <div title={`${w.pending} pending`} className="h-6 bg-amber-400 rounded-sm" style={{ width: Math.max(8, (w.pending / activeTotal) * 80) }} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// -- v4.2.18 (F.1): Kanban View --------------------------------------------
// KanbanView dipindah ke ./components/tickets/KanbanView (di-import di atas).
