import { useState, useMemo, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SlaWidget } from "@/components/tickets/SlaWidget";
import { CreateTicketWizard } from "@/components/tickets/CreateTicketWizard";
import { StatsCard } from "@/components/tickets/StatsCard";
import { KanbanView } from "@/components/tickets/KanbanView";
import { type Ticket, type TicketCategory, type SafeUser, type Customer, type TicketStats, formatDate, slaTone, PRIORITY_CONFIG, STATUS_CONFIG } from "@/components/tickets/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { EmptyInbox, EmptySearch } from "@/components/illustrations";
import { SkeletonList } from "@/components/ui/skeleton";
import { ClipboardList, Plus, Settings, Search, AlertCircle, Clock, CheckCircle2, Pause, UserPlus, Calendar, Eye, ChevronLeft, ChevronRight, RefreshCw, FileText, Check } from "lucide-react";
import { CreateEditDialog } from "@/components/tickets/CreateEditDialog";
import { DetailDialog } from "@/components/tickets/DetailDialog";
import { CategoryManagementDialog } from "@/components/tickets/CategoryManagementDialog";
import { TechnicianWorkloadPanel } from "@/components/tickets/panels";

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

