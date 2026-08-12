import { useState, useMemo } from "react";
import { formatRupiah } from "@shared/currency";
import { useCustomers, useOdps } from "@/hooks/useAssets";
import { useAuth } from "@/context/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect } from "react";
import type { Customer, InsertCustomer } from "@shared/schema";
import { Users, RefreshCw, Search, Plus, Pencil, Trash2, WifiOff, CheckCircle, AlertCircle, Clock, MapPin, ChevronDown, ChevronUp, Filter, X, ChevronLeft, ChevronRight, Download, Building2, Home, Lock, Eye, EyeOff, Wifi, Shield, Info, Monitor, Activity, ExternalLink, Loader2, Check, Minus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { SearchableOdpSelect } from "@/components/shared/SearchableOdpSelect";
import { OpenInChatwootButton } from "@/components/chatwoot/OpenInChatwootButton";
import { ChatwootSyncButton } from "@/components/chatwoot/ChatwootSyncButton";
import { useChatwootStatus, useSyncBulkContacts } from "@/hooks/useChatwoot";
import { LOCKABLE_FIELDS, parseOverrides, exportCustomersCSV, PAGE_SIZE_OPTIONS, type DistrictSummary } from "./customers/shared";
import { CustomerForm } from "./customers/CustomerForm";
import { CustomerStatusBadge } from "./customers/CustomerStatusBadge";
import { DistrictCard } from "./customers/DistrictCard";
import { CustomerLocalEditForm } from "./customers/CustomerLocalEditForm";
import { IntegrationAuditDialog } from "./customers/IntegrationAuditDialog";
import { CustomerCommunication } from "./customers/CustomerCommunication";

export default function CustomersPage() {
  const { canWrite } = useAuth();
  const canEditCustomers = canWrite("customers");
  const canBillingSync = canWrite("billing_sync");
  const [billingSyncing, setBillingSyncing] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());
  const { data: cooldown, refetch: refetchCooldown } = useQuery<any>({
    queryKey: ["/api/billing/sync/cooldown"],
    queryFn: () => api.get<any>("/billing/sync/cooldown"),
    enabled: canBillingSync,
    refetchInterval: 60_000,
  });
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const nextAt = cooldown?.nextAvailableAt ? new Date(cooldown.nextAvailableAt).getTime() : 0;
  const remainingMs = Math.max(0, nextAt - nowTick);
  const onCooldown = remainingMs > 0;
  const mmss = `${Math.floor(remainingMs / 60000)}:${String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, "0")}`;

  const handleBillingSync = async () => {
    setBillingSyncing(true);
    try {
      const r: any = await api.post("/billing/sync", {});
      toast.success(`Sync selesai - ${r?.updated ?? 0} diperbarui, ${r?.created ?? 0} dibuat`, {
        description: `Total ${r?.total ?? 0} pelanggan · error ${r?.errors ?? 0}`,
      });
      refetchCooldown();
    } catch (err: any) {
      toast.error((err && err.message) || "Sync gagal");
      refetchCooldown();
    } finally { setBillingSyncing(false); }
  };
  const { data: customers, isLoading, create, update, remove } = useCustomers();
  const { data: odps } = useOdps();

  // Deep-link support: kalau URL punya ?q=xxx, auto-populate search (untuk jump dari GenieACS page)
  const initialSearch = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("q") ?? ""
    : "";
  const [search, setSearch] = useState(initialSearch);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDistrict, setFilterDistrict] = useState("all");
  const [filterVillage, setFilterVillage] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterPackage, setFilterPackage] = useState("all");
  const [filterOdp, setFilterOdp] = useState("all");
  const [filterBilling, setFilterBilling] = useState("all");
  // v4.2.5: filter status integrasi (PPPoE + GenieACS ONT)
  // values: "all" | "fully" | "pppoe_only" | "ont_only" | "none" | "pppoe_offline" | "ont_offline"
  const [filterIntegration, setFilterIntegration] = useState("all");
  // v4.2.5: dialog audit integrasi (auto-pair fuzzy match)
  const [auditDialogOpen, setAuditDialogOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showDistrictView, setShowDistrictView] = useState(false);
  const [expandedDistrict, setExpandedDistrict] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<Customer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortBy, setSortBy] = useState<"name" | "district" | "package" | "status">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  // unlockTarget removed - billing sync protection no longer needed
  const queryClient = useQueryClient();

  const odpMap = useMemo(() => {
    const m = new Map<number, string>();
    odps?.forEach((o) => m.set(o.id, o.name));
    return m;
  }, [odps]);

  // PPPoE active sessions - fetch all active sessions every 30s
  // v4.1.2: sekarang simpan full session data (IP, MAC, uptime, traffic) bukan cuma name,
  // agar bisa di-display di detail dialog tanpa fetch ulang.
  type PppSession = {
    id?: string; name?: string; service?: string; callerId?: string;
    "caller-id"?: string; address?: string; uptime?: string;
    limitBytesIn?: number; limitBytesOut?: number; sessionId?: string;
    encoding?: string; radius?: boolean;
  };
  const { data: sessionGroups } = useQuery<{ routerId: number; routerName: string; sessions: PppSession[] }[]>({
    queryKey: ["/api/mikrotik/sessions/active"],
    queryFn: () => api.get("/mikrotik/sessions/active"),
    refetchInterval: 30000,
  });

  // Build TWO maps: one untuk quick online check, satu untuk full session lookup
  const { onlineUsernames, sessionByPppoe, sessionRouterByPppoe } = useMemo(() => {
    const online = new Set<string>();
    const byPppoe = new Map<string, PppSession>();
    const routerByPppoe = new Map<string, { routerId: number; routerName: string }>();
    sessionGroups?.forEach((g) => {
      g.sessions?.forEach((sess) => {
        if (sess.name) {
          const key = sess.name.toLowerCase(); // case-insensitive
          online.add(sess.name);
          online.add(key);
          byPppoe.set(key, sess);
          routerByPppoe.set(key, { routerId: g.routerId, routerName: g.routerName });
        }
      });
    });
    return { onlineUsernames: online, sessionByPppoe: byPppoe, sessionRouterByPppoe: routerByPppoe };
  }, [sessionGroups]);

  // Helper: lookup session case-insensitive
  const findSession = (pppoe?: string | null): PppSession | undefined => {
    if (!pppoe) return undefined;
    return sessionByPppoe.get(pppoe.toLowerCase()) ?? sessionByPppoe.get(pppoe);
  };
  const isOnline = (pppoe?: string | null): boolean => {
    if (!pppoe) return false;
    return onlineUsernames.has(pppoe) || onlineUsernames.has(pppoe.toLowerCase());
  };

  // GenieACS ONT status for all customers
  const { data: ontStatusData } = useQuery<{ configured: boolean; statuses: Record<number, {
    matched: boolean; matchBy: "pppoe" | "sn" | null; ontStatus: "online" | "offline" | null;
    ontSerialNumber: string | null; ontDeviceId: string | null; ontManufacturer: string | null;
    ontModel: string | null; ontRxPower: string | null; ontIpAddress: string | null; ontLastInform: string | null;
  }>; totalDevices?: number }>({
    queryKey: ["/api/customers/ont-status"],
    queryFn: () => api.get("/customers/ont-status"),
    refetchInterval: 60000, // check every 60s
    retry: false,
  });
  const ontStatuses = ontStatusData?.statuses || {};

  // MikroTik routers for display names in detail dialog
  const { data: mkRouters } = useQuery<{ id: number; name: string; host: string }[]>({
    queryKey: ["/api/mikrotik/routers"],
    queryFn: () => api.get("/mikrotik/routers"),
  });

  const routerMap = useMemo(() => {
    const m = new Map<number, string>();
    mkRouters?.forEach((r) => m.set(r.id, r.name));
    return m;
  }, [mkRouters]);

  // Detail dialog state
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);
  const [detailTab, setDetailTab] = useState<"info" | "pppoe" | "komunikasi">("info");
  const { data: chatwootStatus } = useChatwootStatus();
  const chatwootReady = !!chatwootStatus?.enabled && !!chatwootStatus?.configured;
  const bulkSync = useSyncBulkContacts();
  const [detailShowPassword, setDetailShowPassword] = useState(false);

  // Extract unique values from data for filter dropdowns
  const filterOptions = useMemo(() => {
    const all = customers ?? [];
    const districts = new Set<string>();
    const villages = new Map<string, Set<string>>();
    const packages = new Set<string>();
    const odpIds = new Set<number>();

    for (const c of all) {
      const anyC = c as any;
      const d = (anyC.district ?? "").trim();
      const v = (anyC.village ?? "").trim();
      if (d) {
        districts.add(d);
        if (!villages.has(d)) villages.set(d, new Set());
        if (v) villages.get(d)!.add(v);
      }
      if (c.package) packages.add(c.package);
      if (c.odpId) odpIds.add(c.odpId);
    }

    return {
      districts: [...districts].sort(),
      villagesByDistrict: Object.fromEntries([...villages.entries()].map(([d, vs]) => [d, [...vs].sort()])),
      packages: [...packages].sort(),
      odpIds: [...odpIds].sort(),
    };
  }, [customers]);

  // Available villages based on selected district
  const availableVillages = useMemo(() => {
    if (filterDistrict === "all") return [];
    return filterOptions.villagesByDistrict[filterDistrict] ?? [];
  }, [filterDistrict, filterOptions]);

  // Stats
  const stats = useMemo(() => {
    const all = customers ?? [];
    return {
      total: all.length,
      active: all.filter((c) => c.status === "active").length,
      suspended: all.filter((c) => c.status === "suspended").length,
      inactive: all.filter((c) => c.status === "inactive").length,
      rumahan: all.filter((c) => (c as any).customerType === "rumahan").length,
      bisnis: all.filter((c) => (c as any).customerType === "bisnis").length,
    };
  }, [customers]);

  // District summaries
  const districtSummaries = useMemo<DistrictSummary[]>(() => {
    const all = customers ?? [];
    const map = new Map<string, Customer[]>();
    for (const c of all) {
      const d = ((c as any).district ?? "").trim() || "";
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(c);
    }
    return [...map.entries()].map(([district, custs]) => {
      const villageMap = new Map<string, Customer[]>();
      for (const c of custs) {
        const v = ((c as any).village ?? "").trim() || "";
        if (!villageMap.has(v)) villageMap.set(v, []);
        villageMap.get(v)!.push(c);
      }
      return {
        district,
        total: custs.length,
        active: custs.filter(c => c.status === "active").length,
        suspended: custs.filter(c => c.status === "suspended").length,
        inactive: custs.filter(c => c.status !== "active" && c.status !== "suspended").length,
        rumahan: custs.filter(c => (c as any).customerType === "rumahan").length,
        bisnis: custs.filter(c => (c as any).customerType === "bisnis").length,
        villages: [...villageMap.entries()].map(([name, vCusts]) => ({
          name,
          total: vCusts.length,
          active: vCusts.filter(c => c.status === "active").length,
          suspended: vCusts.filter(c => c.status === "suspended").length,
        })),
      };
    }).sort((a, b) => b.total - a.total);
  }, [customers]);

  // Active filter count
  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (filterStatus !== "all") c++;
    if (filterDistrict !== "all") c++;
    if (filterVillage !== "all") c++;
    if (filterType !== "all") c++;
    if (filterPackage !== "all") c++;
    if (filterOdp !== "all") c++;
    if (filterBilling !== "all") c++;
    if (filterIntegration !== "all") c++;
    return c;
  }, [filterStatus, filterDistrict, filterVillage, filterType, filterPackage, filterOdp, filterBilling, filterIntegration]);

  const clearAllFilters = () => {
    setFilterStatus("all");
    setFilterDistrict("all");
    setFilterVillage("all");
    setFilterType("all");
    setFilterPackage("all");
    setFilterOdp("all");
    setFilterBilling("all");
    setFilterIntegration("all");
    setSearch("");
    setPage(1);
  };

  // Filter
  const filtered = useMemo(() => {
    let list = customers ?? [];

    if (filterStatus !== "all") list = list.filter((c) => c.status === filterStatus);

    if (filterDistrict !== "all") {
      list = list.filter(c => ((c as any).district ?? "").trim() === filterDistrict);
    }
    if (filterVillage !== "all") {
      list = list.filter(c => ((c as any).village ?? "").trim() === filterVillage);
    }
    if (filterType !== "all") {
      list = list.filter(c => ((c as any).customerType ?? "rumahan") === filterType);
    }
    if (filterPackage !== "all") {
      list = list.filter(c => c.package === filterPackage);
    }
    if (filterOdp !== "all") {
      list = list.filter(c => c.odpId === Number(filterOdp));
    }
    if (filterBilling !== "all") {
      if (filterBilling === "lunas") list = list.filter(c => (c as any).billingStatus !== "belum_lunas");
      else if (filterBilling === "belum_lunas") list = list.filter(c => (c as any).billingStatus === "belum_lunas");
      else if (filterBilling === "no_odp") list = list.filter(c => !c.odpId);
    }

    // v4.2.5: filter status integrasi (PPPoE MikroTik + ONT GenieACS)
    if (filterIntegration !== "all") {
      list = list.filter((c) => {
        const anyC = c as any;
        const hasPppoe = !!anyC.pppoeUsername;
        const pppoeOnline = hasPppoe && isOnline(anyC.pppoeUsername);
        const ont = ontStatuses[c.id];
        const ontMatched = !!ont?.matched;
        const ontOnline = ontMatched && ont.ontStatus === "online";
        switch (filterIntegration) {
          case "fully": return hasPppoe && ontMatched;
          case "pppoe_only": return hasPppoe && !ontMatched;
          case "ont_only": return !hasPppoe && ontMatched;
          case "none": return !hasPppoe && !ontMatched;
          case "pppoe_online": return pppoeOnline;
          case "pppoe_offline": return hasPppoe && !pppoeOnline;
          case "ont_online": return ontOnline;
          case "ont_offline": return ontMatched && !ontOnline;
          default: return true;
        }
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        c.customerId.toLowerCase().includes(q) ||
        (c.address ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").includes(q) ||
        ((c as any).district ?? "").toLowerCase().includes(q) ||
        ((c as any).village ?? "").toLowerCase().includes(q)
      );
    }

    // Sort
    list = [...list].sort((a, b) => {
      let va = "", vb = "";
      if (sortBy === "name") { va = a.name; vb = b.name; }
      else if (sortBy === "district") { va = (a as any).district ?? ""; vb = (b as any).district ?? ""; }
      else if (sortBy === "package") { va = a.package ?? ""; vb = b.package ?? ""; }
      else if (sortBy === "status") { va = a.status ?? ""; vb = b.status ?? ""; }
      const cmp = va.localeCompare(vb, "id");
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [customers, search, filterStatus, filterDistrict, filterVillage, filterType, filterPackage, filterOdp, filterBilling, filterIntegration, ontStatuses, onlineUsernames, sortBy, sortDir]);

  // Filtered stats
  const filteredStats = useMemo(() => {
    return {
      total: filtered.length,
      active: filtered.filter(c => c.status === "active").length,
      suspended: filtered.filter(c => c.status === "suspended").length,
    };
  }, [filtered]);

  // v4.2.5: Integration breakdown (full dataset, bukan filtered)
  const integrationStats = useMemo(() => {
    const all = customers ?? [];
    let fully = 0, pppoeOnly = 0, ontOnly = 0, none = 0;
    let pppoeOnline = 0, ontOnline = 0;
    for (const c of all) {
      const anyC = c as any;
      const hasPppoe = !!anyC.pppoeUsername;
      const ont = ontStatuses[c.id];
      const ontMatched = !!ont?.matched;
      if (hasPppoe && ontMatched) fully++;
      else if (hasPppoe && !ontMatched) pppoeOnly++;
      else if (!hasPppoe && ontMatched) ontOnly++;
      else none++;
      if (hasPppoe && isOnline(anyC.pppoeUsername)) pppoeOnline++;
      if (ontMatched && ont.ontStatus === "online") ontOnline++;
    }
    return { total: all.length, fully, pppoeOnly, ontOnly, none, pppoeOnline, ontOnline };
  }, [customers, ontStatuses, onlineUsernames]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedList = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, filterStatus, filterDistrict, filterVillage, filterType, filterPackage, filterOdp, filterBilling, filterIntegration, pageSize]);

  // Reset village when district changes
  useEffect(() => { setFilterVillage("all"); }, [filterDistrict]);

  const handleCreate = async (data: InsertCustomer) => {
    setIsPending(true);
    try {
      await create.mutateAsync(data);
      toast.success("Pelanggan berhasil ditambahkan");
      setFormOpen(false);
    } catch (e: any) { toast.error(e.message); }
    finally { setIsPending(false); }
  };

  const handleUpdate = async (data: Partial<InsertCustomer>) => {
    if (!editItem) return;
    setIsPending(true);
    try {
      await update.mutateAsync({ id: editItem.id, data: data as InsertCustomer });
      toast.success("Data pelanggan diperbarui");
      setEditItem(null);
    } catch (e: any) { toast.error(e.message); }
    finally { setIsPending(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success("Pelanggan dihapus");
    } catch (e: any) { toast.error(e.message); }
    finally { setDeleteTarget(null); }
  };

  // Isolir / Activate PPPoE from detail dialog
  const [pppoeActionPending, setPppoeActionPending] = useState(false);
  const handlePppoeToggle = async (customer: Customer, action: "isolir" | "activate") => {
    setPppoeActionPending(true);
    try {
      const newStatus = action === "isolir" ? "suspended" : "active";
      const newIsIsolir = action === "isolir" ? 1 : 0;
      await update.mutateAsync({ id: customer.id, data: { status: newStatus, isIsolir: newIsIsolir } as any });
      toast.success(action === "isolir" ? "Pelanggan berhasil diisolir" : "Pelanggan berhasil diaktifkan");
      // Refresh the detail dialog with updated data
      const updatedCustomers = queryClient.getQueryData<Customer[]>(["customers"]);
      const updated_ = updatedCustomers?.find((c) => c.id === customer.id);
      if (updated_) setDetailCustomer(updated_);
      queryClient.invalidateQueries({ queryKey: ["/api/mikrotik/sessions/active"] });
    } catch (e: any) { toast.error(e.message); }
    finally { setPppoeActionPending(false); }
  };

  const handleFilterFromDistrict = (district: string) => {
    setFilterDistrict(district);
    setFilterVillage("all");
    setShowDistrictView(false);
    setShowFilters(true);
  };

  const handleFilterFromVillage = (district: string, village: string) => {
    setFilterDistrict(district);
    setFilterVillage(village);
    setShowDistrictView(false);
    setShowFilters(true);
  };

  const handleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
  };

  // Format currency (via shared helper; NBSP dari Intl jadi spasi biasa - imperseptibel)
  const formatRp = (n: number) => formatRupiah(n);

  const SortIcon = ({ col }: { col: typeof sortBy }) => {
    if (sortBy !== col) return null;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3 inline ml-0.5" /> : <ChevronDown className="h-3 w-3 inline ml-0.5" />;
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Pelanggan</h1>
          <p className="text-muted-foreground text-sm">Data pelanggan FTTH JABNET - tersinkronisasi dengan billing</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => exportCustomersCSV(filtered, odpMap)}>
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
{/* v4.1.3+: Tambah pelanggan DISABLED - billing.jabnet.id adalah source of truth.
              Admin register pelanggan di billing, lalu sync worker auto-import ke FTTH Tools. */}
          {canEditCustomers && (
            <Button size="sm" variant="outline" onClick={() => {
              alert("Pelanggan baru harus ditambahkan via billing.jabnet.id\n\nSetelah terdaftar, data akan otomatis sync ke FTTH Tools dalam 1-10 menit.\nSetelah masuk, teknisi bisa set koordinat peta & ODP mapping di halaman ini.");
            }}>
              <Plus className="h-4 w-4 mr-1" />
              Tambah (via Billing)
            </Button>
          )}
          {canBillingSync && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleBillingSync}
              disabled={billingSyncing || onCooldown}
              title={onCooldown ? `Tersedia lagi dalam ${mmss}` : "Tarik data terbaru dari billing"}
            >
              {billingSyncing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              {onCooldown ? `Sinkron (${mmss})` : "Sinkron dengan Billing"}
            </Button>
          )}
          {chatwootReady && canWrite("chatwoot") && (
            <Button type="button" variant="outline" size="sm" loading={bulkSync.isPending}
              onClick={() => {
                const ids = filtered.map((c: any) => c.id).slice(0, 200);
                if (!ids.length) return;
                bulkSync.mutate(ids, {
                  onSuccess: (r) => toast.success(`Sync Chatwoot: ${r.synced} sukses, ${r.failed} gagal`),
                  onError: (e: any) => toast.error(e.message || "Gagal sync massal"),
                });
              }}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Sync ke Chatwoot
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {[
          { label: "Total", value: stats.total, icon: Users, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30", filter: "all" as const },
          { label: "Aktif", value: stats.active, icon: CheckCircle, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30", filter: "active" as const },
          { label: "Isolir", value: stats.suspended, icon: WifiOff, color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-950/30", filter: "suspended" as const },
          { label: "Non-Aktif", value: stats.inactive, icon: AlertCircle, color: "text-gray-500", bg: "bg-gray-50 dark:bg-gray-950/30", filter: "inactive" as const },
          { label: "Rumahan", value: stats.rumahan, icon: Home, color: "text-indigo-600", bg: "bg-indigo-50 dark:bg-indigo-950/30", filter: "type:rumahan" as const },
          { label: "Bisnis", value: stats.bisnis, icon: Building2, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950/30", filter: "type:bisnis" as const },
        ].map((s) => (
          <Card key={s.label} className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => {
              if (s.filter.startsWith("type:")) {
                setFilterType(s.filter.replace("type:", ""));
                setFilterStatus("all");
              } else {
                setFilterStatus(s.filter);
                setFilterType("all");
              }
            }}>
            <CardContent className={`p-3 rounded-lg ${s.bg}`}>
              <div className="flex items-center gap-2">
                <s.icon className={`h-5 w-5 ${s.color} opacity-70 shrink-0`} />
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground truncate">{s.label}</p>
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Toggle views: District View | Filter */}
      <div className="flex items-center gap-2">
        <Button variant={showDistrictView ? "default" : "outline"} size="sm"
          onClick={() => { setShowDistrictView(!showDistrictView); if (!showDistrictView) setShowFilters(false); }}>
          <MapPin className="h-3.5 w-3.5 mr-1" />
          Per Kecamatan
          <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5">{filterOptions.districts.length}</Badge>
        </Button>
        <Button variant={showFilters ? "default" : "outline"} size="sm"
          onClick={() => { setShowFilters(!showFilters); if (!showFilters) setShowDistrictView(false); }}>
          <Filter className="h-3.5 w-3.5 mr-1" />
          Filter
          {activeFilterCount > 0 && (
            <Badge variant="destructive" className="ml-1.5 text-[10px] px-1.5">{activeFilterCount}</Badge>
          )}
        </Button>
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-xs text-muted-foreground">
            <X className="h-3 w-3 mr-1" /> Reset Filter
          </Button>
        )}
      </div>

      {/* District Summary View */}
      {showDistrictView && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
            Ringkasan {districtSummaries.length} Kecamatan - Klik untuk detail desa/kelurahan
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {districtSummaries.map(d => (
              <DistrictCard key={d.district} d={d}
                isExpanded={expandedDistrict === d.district}
                onToggle={() => setExpandedDistrict(expandedDistrict === d.district ? null : d.district)}
                onFilterDistrict={handleFilterFromDistrict}
                onFilterVillage={handleFilterFromVillage}
              />
            ))}
          </div>
        </div>
      )}

      {/* Filters Panel */}
      {showFilters && (
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {/* Search */}
              <div className="col-span-2 sm:col-span-1">
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Pencarian</Label>
                <div className="relative mt-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Nama, ID, alamat, telepon..." value={search} onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-9 text-sm" />
                </div>
              </div>

              {/* Status */}
              <div>
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Status</SelectItem>
                    <SelectItem value="active">Aktif</SelectItem>
                    <SelectItem value="suspended">Isolir</SelectItem>
                    <SelectItem value="inactive">Non-Aktif</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Kecamatan */}
              <div>
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Kecamatan</Label>
                <Select value={filterDistrict} onValueChange={setFilterDistrict}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Kecamatan</SelectItem>
                    {filterOptions.districts.map(d => {
                      const count = (customers ?? []).filter(c => ((c as any).district ?? "").trim() === d).length;
                      return <SelectItem key={d} value={d}>{d} ({count})</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Desa/Kelurahan */}
              <div>
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Desa / Kelurahan</Label>
                <Select value={filterVillage} onValueChange={setFilterVillage} disabled={filterDistrict === "all"}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Desa</SelectItem>
                    {availableVillages.map(v => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Jenis Pelanggan */}
              <div>
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Jenis</Label>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Jenis</SelectItem>
                    <SelectItem value="rumahan">Rumahan</SelectItem>
                    <SelectItem value="bisnis">Bisnis</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Paket */}
              <div>
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Paket</Label>
                <Select value={filterPackage} onValueChange={setFilterPackage}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Paket</SelectItem>
                    {filterOptions.packages.map(p => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* ODP - searchable */}
              <div>
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">ODP</Label>
                <div className="mt-1">
                  <SearchableOdpSelect
                    value={filterOdp === "all" ? null : Number(filterOdp)}
                    onChange={(id) => setFilterOdp(id == null ? "all" : String(id))}
                    odps={filterOptions.odpIds
                      .map((id) => {
                        const o = odps?.find((x) => x.id === id);
                        return o ? { id: o.id, name: o.name, code: (o as any).code ?? null } : null;
                      })
                      .filter(Boolean) as Array<{ id: number; name: string; code: string | null }>}
                    placeholder="Semua ODP"
                    nullLabel="Semua ODP"
                  />
                </div>
              </div>

              {/* Billing / Khusus */}
              <div>
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Khusus</Label>
                <Select value={filterBilling} onValueChange={setFilterBilling}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua</SelectItem>
                    <SelectItem value="belum_lunas">Belum Lunas</SelectItem>
                    <SelectItem value="lunas">Lunas / OK</SelectItem>
                    <SelectItem value="no_odp">Belum Ada ODP</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* v4.2.5: Status Integrasi (PPPoE + GenieACS) */}
              <div>
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Integrasi</Label>
                <Select value={filterIntegration} onValueChange={setFilterIntegration}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua</SelectItem>
                    <SelectItem value="fully">✓ Lengkap (PPPoE + ONT)</SelectItem>
                    <SelectItem value="pppoe_only">PPPoE saja (tanpa ONT)</SelectItem>
                    <SelectItem value="ont_only">ONT saja (tanpa PPPoE)</SelectItem>
                    <SelectItem value="none">Belum dihubungkan</SelectItem>
                    <SelectItem value="pppoe_online">PPPoE Online</SelectItem>
                    <SelectItem value="pppoe_offline">PPPoE Offline</SelectItem>
                    <SelectItem value="ont_online">ONT Online</SelectItem>
                    <SelectItem value="ont_offline">ONT Offline</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick search when filter panel is closed */}
      {!showFilters && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Cari nama, ID, alamat, telepon, kecamatan..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          {/* Quick district filter pills */}
          {filterDistrict !== "all" && (
            <Badge variant="secondary" className="flex items-center gap-1 h-9 px-3 cursor-pointer"
              onClick={() => setFilterDistrict("all")}>
              <MapPin className="h-3 w-3" /> {filterDistrict} <X className="h-3 w-3 ml-1" />
            </Badge>
          )}
          {filterVillage !== "all" && (
            <Badge variant="secondary" className="flex items-center gap-1 h-9 px-3 cursor-pointer"
              onClick={() => setFilterVillage("all")}>
              {filterVillage} <X className="h-3 w-3 ml-1" />
            </Badge>
          )}
        </div>
      )}

      {/* v4.2.5: KPI breakdown integrasi - clickable filter pills */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Status Integrasi PPPoE & ONT</span>
          <div className="flex items-center gap-2">
            {integrationStats.pppoeOnly > 0 && (
              <button
                onClick={() => setAuditDialogOpen(true)}
                className="text-[10px] px-2 py-1 rounded bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 font-bold uppercase tracking-wider transition-colors"
                title={`Cari kandidat ONT untuk ${integrationStats.pppoeOnly} customer "PPPoE saja"`}
              >
                 Audit & Auto-Pair ONT
              </button>
            )}
            {filterIntegration !== "all" && (
              <button
                onClick={() => setFilterIntegration("all")}
                className="text-[10px] text-primary hover:underline font-semibold flex items-center gap-1"
              >
                <X className="h-3 w-3" /> Reset filter
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0">
          {[
            { key: "fully", label: "Lengkap", icon: Check, value: integrationStats.fully, hint: "PPPoE + ONT terdeteksi", tone: "emerald" },
            { key: "pppoe_only", label: "PPPoE saja", icon: Wifi, value: integrationStats.pppoeOnly, hint: "Tidak ada ONT di GenieACS", tone: "amber" },
            { key: "ont_only", label: "ONT saja", icon: Monitor, value: integrationStats.ontOnly, hint: "Tidak ada PPPoE", tone: "sky" },
            { key: "none", label: "Belum dihubungkan", icon: Minus, value: integrationStats.none, hint: "Tidak ada PPPoE & ONT", tone: "rose" },
          ].map((kpi) => {
            const isActive = filterIntegration === kpi.key;
            const toneClass =
              kpi.tone === "emerald" ? (isActive ? "bg-emerald-50 dark:bg-emerald-950/30 border-l-4 border-l-emerald-500" : "hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20") :
              kpi.tone === "amber" ? (isActive ? "bg-amber-50 dark:bg-amber-950/30 border-l-4 border-l-amber-500" : "hover:bg-amber-50/40 dark:hover:bg-amber-950/20") :
              kpi.tone === "sky" ? (isActive ? "bg-sky-50 dark:bg-sky-950/30 border-l-4 border-l-sky-500" : "hover:bg-sky-50/40 dark:hover:bg-sky-950/20") :
                                       (isActive ? "bg-rose-50 dark:bg-rose-950/30 border-l-4 border-l-rose-500" : "hover:bg-rose-50/40 dark:hover:bg-rose-950/20");
            const valueColor =
              kpi.tone === "emerald" ? "text-emerald-700 dark:text-emerald-400" :
              kpi.tone === "amber" ? "text-amber-700 dark:text-amber-400" :
              kpi.tone === "sky" ? "text-sky-700 dark:text-sky-400" :
                                       "text-rose-700 dark:text-rose-400";
            const pct = integrationStats.total > 0 ? Math.round((kpi.value / integrationStats.total) * 100) : 0;
            return (
              <button
                key={kpi.key}
                onClick={() => setFilterIntegration(isActive ? "all" : kpi.key)}
                className={cn("text-left px-4 py-3 transition-all active:scale-[0.99]", toneClass)}
                title={kpi.hint}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
                    <kpi.icon className="size-3.5" /> {kpi.label}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground tabular-nums">{pct}%</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className={cn("text-2xl font-bold tabular-nums", valueColor)}>{kpi.value.toLocaleString("id-ID")}</span>
                  <span className="text-[10px] text-muted-foreground">customer</span>
                </div>
              </button>
            );
          })}
        </div>
        {/* Sub row: PPPoE/ONT online realtime */}
        <div className="px-4 py-2 border-t bg-muted/20 flex items-center gap-4 flex-wrap text-[11px]">
          <button onClick={() => setFilterIntegration(filterIntegration === "pppoe_online" ? "all" : "pppoe_online")} className={cn("flex items-center gap-1.5 hover:text-emerald-600", filterIntegration === "pppoe_online" && "text-emerald-700 font-bold")}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> PPPoE Online: <span className="font-mono tabular-nums font-semibold">{integrationStats.pppoeOnline.toLocaleString("id-ID")}</span>
          </button>
          <button onClick={() => setFilterIntegration(filterIntegration === "pppoe_offline" ? "all" : "pppoe_offline")} className={cn("flex items-center gap-1.5 hover:text-rose-600", filterIntegration === "pppoe_offline" && "text-rose-700 font-bold")}>
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" /> PPPoE Offline: <span className="font-mono tabular-nums font-semibold">{integrationStats.fully + integrationStats.pppoeOnly - integrationStats.pppoeOnline}</span>
          </button>
          <span className="text-muted-foreground/40">·</span>
          <button onClick={() => setFilterIntegration(filterIntegration === "ont_online" ? "all" : "ont_online")} className={cn("flex items-center gap-1.5 hover:text-emerald-600", filterIntegration === "ont_online" && "text-emerald-700 font-bold")}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> ONT Online: <span className="font-mono tabular-nums font-semibold">{integrationStats.ontOnline.toLocaleString("id-ID")}</span>
          </button>
          <button onClick={() => setFilterIntegration(filterIntegration === "ont_offline" ? "all" : "ont_offline")} className={cn("flex items-center gap-1.5 hover:text-rose-600", filterIntegration === "ont_offline" && "text-rose-700 font-bold")}>
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" /> ONT Offline: <span className="font-mono tabular-nums font-semibold">{integrationStats.fully + integrationStats.ontOnly - integrationStats.ontOnline}</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              {filtered.length} pelanggan
              {activeFilterCount > 0 && (
                <span className="text-xs font-normal text-muted-foreground ml-2">
                  ({filteredStats.active} aktif, {filteredStats.suspended} isolir)
                </span>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">Per halaman:</span>
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Memuat data...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {search || activeFilterCount > 0 ? (
                <div className="space-y-2">
                  <p>Tidak ada pelanggan sesuai filter</p>
                  <Button variant="outline" size="sm" onClick={clearAllFilters}>
                    <X className="h-4 w-4 mr-1" /> Reset Semua Filter
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p>Belum ada data pelanggan</p>
                  <Button size="sm" onClick={() => setFormOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Tambah Pelanggan
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
                      onClick={() => handleSort("name")}>
                      ID / Nama <SortIcon col="name" />
                    </th>
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
                      onClick={() => handleSort("district")}>
                      Kecamatan / Desa <SortIcon col="district" />
                    </th>
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
                      onClick={() => handleSort("package")}>
                      Paket <SortIcon col="package" />
                    </th>
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">ODP / Port</th>
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
                      onClick={() => handleSort("status")}>
                      Status <SortIcon col="status" />
                    </th>
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Koneksi</th>
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Telepon</th>
                    <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedList.map((c) => {
                    const anyC = c as any;
                    const locks = parseOverrides(c);
                    return (
                      <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium">{c.name}</span>
                            {locks.length > 0 && (
                              <span title={`${locks.length} field dilindungi: ${locks.map(f => LOCKABLE_FIELDS.find(l => l.key === f)?.label ?? f).join(", ")}`}>
                                <Lock className="h-3 w-3 text-amber-600" />
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono">{c.customerId}</div>
                          {anyC.customerType && (
                            <Badge variant="outline" className="text-[9px] mt-0.5">
                              {anyC.customerType === "bisnis" ? "Bisnis" : "Rumahan"}
                            </Badge>
                          )}
                        </td>
                        <td className="py-2.5 px-4">
                          {anyC.district ? (
                            <div>
                              <div className="text-xs font-medium">{anyC.district}</div>
                              {anyC.village && <div className="text-[11px] text-muted-foreground">{anyC.village}</div>}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4">
                          {c.package ? (
                            <div>
                              <Badge variant="outline" className="text-xs">{c.package}</Badge>
                              {anyC.billingPrice ? <div className="text-xs text-muted-foreground mt-1">{formatRp(anyC.billingPrice)}</div> : null}
                            </div>
                          ) : <span className="text-muted-foreground">-</span>}
                        </td>
                        <td className="py-2.5 px-4">
                          {c.odpId ? (
                            <div>
                              <div className="text-xs font-medium">{odpMap.get(c.odpId) ?? `ODP #${c.odpId}`}</div>
                              {c.portNumber && <div className="text-xs text-muted-foreground">Port {c.portNumber}</div>}
                            </div>
                          ) : <span className="text-xs text-muted-foreground">Belum dihubungkan</span>}
                        </td>
                        <td className="py-2.5 px-4">
                          <CustomerStatusBadge status={c.status} />
                          {anyC.billingStatus === "belum_lunas" && (
                            <div className="text-xs text-orange-500 mt-1">Belum lunas</div>
                          )}
                        </td>
                        <td className="py-2.5 px-4">
                          {(() => {
                            const ont = ontStatuses[c.id];
                            const pppoeOnline = isOnline(anyC.pppoeUsername);
                            const session = findSession(anyC.pppoeUsername);
                            const isIsolir = anyC.isIsolir === 1;
                            return (
                              <div className="flex flex-col gap-1">
                                {/* PPPoE status */}
                                {anyC.pppoeUsername ? (
                                  isIsolir ? (
                                    <Badge className="bg-red-500 text-white text-[10px] w-fit"><Shield className="h-3 w-3 mr-1" />Isolir</Badge>
                                  ) : pppoeOnline ? (
                                    <Badge className="bg-green-500 text-white text-[10px] w-fit" title={`IP: ${session?.address ?? '?'}\nUptime: ${session?.uptime ?? '?'}\nMAC: ${session?.callerId ?? session?.['caller-id'] ?? '?'}`}>
                                      <Wifi className="h-3 w-3 mr-1" />PPPoE Online
                                      {session?.address ? ` (${session.address})` : ""}
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-[10px] w-fit"><WifiOff className="h-3 w-3 mr-1" />PPPoE Offline</Badge>
                                  )
                                ) : null}
                                {/* Uptime row kalau online */}
                                {pppoeOnline && session?.uptime ? (
                                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                    <Clock className="h-2.5 w-2.5" /> {session.uptime}
                                  </span>
                                ) : null}
                                {/* ONT/ACS status */}
                                {ont?.matched ? (
                                  <Badge variant="outline" className={`text-[10px] w-fit ${ont.ontStatus === "online" ? "border-green-300 text-green-700 bg-green-50" : "border-red-300 text-red-700 bg-red-50"}`}>
                                    <Monitor className="h-3 w-3 mr-1" />
                                    ONT {ont.ontStatus === "online" ? "Online" : "Offline"}
                                    {ont.ontRxPower ? ` (${ont.ontRxPower}dBm)` : ""}
                                  </Badge>
                                ) : !anyC.pppoeUsername ? (
                                  <span className="text-xs text-muted-foreground">-</span>
                                ) : null}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="py-2.5 px-4 text-muted-foreground text-xs">{c.phone ?? "-"}</td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600"
                              title="Detail pelanggan"
                              onClick={() => { setDetailCustomer(c); setDetailTab("info"); setDetailShowPassword(false); }}>
                              <Info className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Edit pelanggan" onClick={() => setEditItem(c)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label="Hapus pelanggan" onClick={() => setDeleteTarget(c)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>

        {/* Pagination */}
        {filtered.length > pageSize && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <p className="text-xs text-muted-foreground">
              Menampilkan {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filtered.length)} dari {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1}
                onClick={() => setPage(1)} aria-label="Halaman pertama">
                <ChevronLeft className="h-3 w-3" /><ChevronLeft className="h-3 w-3 -ml-2" />
              </Button>
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1}
                onClick={() => setPage(p => p - 1)} aria-label="Halaman sebelumnya">
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              {/* Page numbers */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) pageNum = i + 1;
                else if (page <= 3) pageNum = i + 1;
                else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
                else pageNum = page - 2 + i;
                return (
                  <Button key={pageNum} variant={page === pageNum ? "default" : "outline"}
                    size="icon" className="h-7 w-7 text-xs" onClick={() => setPage(pageNum)}>
                    {pageNum}
                  </Button>
                );
              })}
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)} aria-label="Halaman berikutnya">
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages}
                onClick={() => setPage(totalPages)} aria-label="Halaman terakhir">
                <ChevronRight className="h-3 w-3" /><ChevronRight className="h-3 w-3 -ml-2" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* v4.2.5: Audit Integrasi dialog */}
      <IntegrationAuditDialog open={auditDialogOpen} onClose={() => setAuditDialogOpen(false)} />

      {/* Create Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tambah Pelanggan</DialogTitle>
            <DialogDescription>Entry manual data pelanggan</DialogDescription>
          </DialogHeader>
          <CustomerForm item={null} onSubmit={handleCreate} isPending={isPending} />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog - v4.1.3+: hanya edit 6 field local, sisanya read-only dari billing */}
      <Dialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Data Lokal Pelanggan</DialogTitle>
            <DialogDescription>
              {editItem?.name} ({editItem?.customerId}) - field data billing hanya bisa diubah di <a href="https://billing.jabnet.id" target="_blank" rel="noreferrer" className="underline text-primary">billing.jabnet.id</a>
            </DialogDescription>
          </DialogHeader>
          {editItem && <CustomerLocalEditForm item={editItem} onSubmit={handleUpdate} isPending={isPending} />}
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailCustomer} onOpenChange={(o) => { if (!o) setDetailCustomer(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <Info className="h-5 w-5 text-blue-600" />
                  {detailCustomer?.name}
                </DialogTitle>
                <DialogDescription>{detailCustomer?.customerId}</DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                <ChatwootSyncButton customerId={(detailCustomer as any)?.id} alreadySynced={!!(detailCustomer as any)?.chatwootContactId} size="sm" />
                <OpenInChatwootButton target="contacts" size="sm" />
              </div>
            </div>
          </DialogHeader>

          {/* Tab buttons */}
          <div className="flex gap-1 border-b pb-0">
            <button
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${detailTab === "info" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              onClick={() => setDetailTab("info")}
            >
              Informasi
            </button>
            <button
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${detailTab === "pppoe" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              onClick={() => setDetailTab("pppoe")}
            >
              PPPoE & MikroTik
            </button>
            {chatwootReady && (
              <button
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${detailTab === "komunikasi" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                onClick={() => setDetailTab("komunikasi")}
              >
                Komunikasi
              </button>
            )}
          </div>

          {detailCustomer && detailTab === "info" && (() => {
            const dc = detailCustomer as any;
            return (
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground">Nama</span>
                    <p className="font-medium">{dc.name}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">ID Pelanggan</span>
                    <p className="font-medium font-mono">{dc.customerId}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Jenis</span>
                    <p>{dc.customerType === "bisnis" ? "Bisnis" : "Rumahan"}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Telepon</span>
                    <p>{dc.phone || "-"}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Email</span>
                    <p>{dc.email || "-"}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Status</span>
                    <div className="mt-0.5"><CustomerStatusBadge status={dc.status} /></div>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                    <div className="col-span-2">
                      <span className="text-xs text-muted-foreground">Alamat</span>
                      <p>{dc.address || "-"}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Kecamatan</span>
                      <p>{dc.district || "-"}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Desa / Kelurahan</span>
                      <p>{dc.village || "-"}</p>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                    <div>
                      <span className="text-xs text-muted-foreground">Paket Layanan</span>
                      <p>{dc.package || "-"}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Harga Billing</span>
                      <p>{dc.billingPrice ? formatRp(dc.billingPrice) : "-"}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Status Billing</span>
                      <p>{dc.billingStatus === "belum_lunas" ? "Belum Lunas" : dc.billingStatus === "lunas" ? "Lunas" : dc.billingStatus || "-"}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Tanggal Pasang</span>
                      <p>{dc.installDate || "-"}</p>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                    <div>
                      <span className="text-xs text-muted-foreground">ODP</span>
                      <p>{dc.odpId ? (odpMap.get(dc.odpId) ?? `ODP #${dc.odpId}`) : "-"}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Nomor Port</span>
                      <p>{dc.portNumber ?? "-"}</p>
                    </div>
                  </div>
                </div>

                {dc.notes && (
                  <div className="border-t pt-3">
                    <span className="text-xs text-muted-foreground">Catatan</span>
                    <p className="text-sm whitespace-pre-wrap">{dc.notes}</p>
                  </div>
                )}
              </div>
            );
          })()}

          {detailCustomer && detailTab === "pppoe" && (() => {
            const dc = detailCustomer as any;
            if (!dc.pppoeUsername) {
              return (
                <div className="py-10 text-center space-y-3">
                  <WifiOff className="h-10 w-10 mx-auto text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground text-sm">Belum ada akun PPPoE.</p>
                  <p className="text-muted-foreground text-xs">Edit pelanggan untuk menambahkan.</p>
                  <Button variant="outline" size="sm" onClick={() => { setDetailCustomer(null); setEditItem(detailCustomer); }}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Edit Pelanggan
                  </Button>
                </div>
              );
            }

            const online = isOnline(dc.pppoeUsername);
            const session = findSession(dc.pppoeUsername);
            const sessionRouter = dc.pppoeUsername ? sessionRouterByPppoe.get(dc.pppoeUsername.toLowerCase()) : null;
            const isIsolir = dc.isIsolir === 1;

            return (
              <div className="space-y-4 pt-2">
                {/* Status badge */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-muted-foreground">Status Koneksi:</span>
                  {isIsolir ? (
                    <Badge className="bg-red-500 text-white"><Shield className="h-3 w-3 mr-1" />Isolir</Badge>
                  ) : online ? (
                    <Badge className="bg-green-500 text-white"><Wifi className="h-3 w-3 mr-1" />Online</Badge>
                  ) : (
                    <Badge variant="secondary"><WifiOff className="h-3 w-3 mr-1" />Offline</Badge>
                  )}
                  {online && session?.uptime && (
                    <Badge variant="outline" className="text-[10px]">
                      <Clock className="h-3 w-3 mr-1" /> {session.uptime}
                    </Badge>
                  )}
                  {sessionRouter && (
                    <Badge variant="outline" className="text-[10px]">
                      Router: {sessionRouter.routerName}
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground">Username PPPoE</span>
                    <p className="font-medium font-mono">{dc.pppoeUsername}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Password PPPoE</span>
                    <div className="flex items-center gap-2">
                      <p className="font-mono">{detailShowPassword ? (dc.pppoePassword || "-") : "********"}</p>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => setDetailShowPassword(!detailShowPassword)}
                      >
                        {detailShowPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Profile / Paket MikroTik</span>
                    <p>{dc.pppoeProfile || "-"}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Router</span>
                    <p>{dc.pppoeRouterId ? (routerMap.get(dc.pppoeRouterId) ?? `Router #${dc.pppoeRouterId}`) : "-"}</p>
                  </div>
                </div>

                {/* -- LIVE SESSION DATA (v4.1.2) - muncul hanya kalau online -- */}
                {online && session && (
                  <div className="border-t pt-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-green-600" />
                      <span className="text-xs font-semibold">Sesi PPPoE Aktif (MikroTik)</span>
                      <Badge variant="outline" className="text-[10px] ml-auto border-green-300 text-green-700 bg-green-50">
                        ● Live
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                      <div>
                        <span className="text-xs text-muted-foreground">IP Address</span>
                        <p className="font-mono text-xs">{session.address || "-"}</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">MAC Address</span>
                        <p className="font-mono text-xs">{session.callerId || (session as any)["caller-id"] || "-"}</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">Uptime</span>
                        <p className="text-xs">{session.uptime || "-"}</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">Service</span>
                        <p className="text-xs uppercase">{session.service || "-"}</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">Session ID</span>
                        <p className="font-mono text-[10px]">{session.sessionId || session.id || "-"}</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">RADIUS</span>
                        <p className="text-xs">{session.radius ? "Ya" : "Tidak"}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* ONT / GenieACS Info */}
                {(() => {
                  const ont = ontStatuses[detailCustomer!.id];
                  if (!ont?.matched) return (
                    <div className="border-t pt-3">
                      <div className="rounded-lg border bg-muted/30 p-3 text-center">
                        <Monitor className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                        <p className="text-xs text-muted-foreground">Perangkat ONT tidak terdeteksi</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Pastikan PPPoE username atau SN ONT sesuai dengan data di GenieACS</p>
                      </div>
                    </div>
                  );
                  return (
                    <div className="border-t pt-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Monitor className="h-4 w-4 text-primary" />
                        <span className="text-xs font-semibold">Perangkat ONT (GenieACS)</span>
                        <Badge variant="outline" className={`text-[10px] ml-auto ${ont.ontStatus === "online" ? "border-green-300 text-green-700 bg-green-50" : "border-red-300 text-red-700 bg-red-50"}`}>
                          {ont.ontStatus === "online" ? "● Online" : "● Offline"}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                        <div><span className="text-xs text-muted-foreground">Serial Number</span><p className="font-mono text-xs">{ont.ontSerialNumber || "-"}</p></div>
                        <div><span className="text-xs text-muted-foreground">Manufacturer / Model</span><p className="text-xs">{ont.ontManufacturer || "-"} {ont.ontModel || ""}</p></div>
                        <div><span className="text-xs text-muted-foreground">IP Address</span><p className="font-mono text-xs">{ont.ontIpAddress || "-"}</p></div>
                        <div><span className="text-xs text-muted-foreground">RX Power</span><p className={`text-xs font-mono font-medium ${parseFloat(ont.ontRxPower || "0") > -25 ? "text-green-600" : parseFloat(ont.ontRxPower || "0") > -28 ? "text-amber-600" : "text-red-600"}`}>{ont.ontRxPower ? `${ont.ontRxPower} dBm` : "-"}</p></div>
                        <div><span className="text-xs text-muted-foreground">Last Inform</span><p className="text-xs">{ont.ontLastInform ? new Date(ont.ontLastInform).toLocaleString("id-ID") : "-"}</p></div>
                        <div><span className="text-xs text-muted-foreground">Cocok via</span><p className="text-xs">{ont.matchBy === "pppoe" ? "PPPoE Username" : "Serial Number"}</p></div>
                      </div>
                      {/* Deep link ke GenieACS page */}
                      <div className="flex gap-2 pt-2">
                        <Button variant="outline" size="sm" onClick={() => { setDetailCustomer(null); window.location.href = `/devices?q=${encodeURIComponent(ont.ontSerialNumber || dc.pppoeUsername || "")}`; }}>
                          <ExternalLink className="h-3.5 w-3.5 mr-1" /> Detail di GenieACS
                        </Button>
                      </div>
                    </div>
                  );
                })()}

                {/* Action buttons */}
                <div className="border-t pt-3 flex gap-2">
                  {isIsolir || dc.status === "suspended" ? (
                    <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" disabled={pppoeActionPending}
                      onClick={() => handlePppoeToggle(detailCustomer!, "activate")}>
                      <Wifi className="h-3.5 w-3.5 mr-1" />
                      {pppoeActionPending ? "Memproses..." : "Aktifkan"}
                    </Button>
                  ) : (
                    <Button size="sm" variant="destructive" disabled={pppoeActionPending}
                      onClick={() => handlePppoeToggle(detailCustomer!, "isolir")}>
                      <Shield className="h-3.5 w-3.5 mr-1" />
                      {pppoeActionPending ? "Memproses..." : "Isolir"}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => { setDetailCustomer(null); setEditItem(detailCustomer); }}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Edit PPPoE
                  </Button>
                </div>
              </div>
            );
          })()}

          {detailCustomer && detailTab === "komunikasi" && (
            <CustomerCommunication customerId={(detailCustomer as any).id} />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Pelanggan?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" ({deleteTarget?.customerId}) akan dihapus permanen beserta akun PPPoE-nya jika ada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// -------------------------------------------------------------------------
// v4.2.5: Integration Audit Dialog - fuzzy match customer "PPPoE saja" ke device GenieACS
// -------------------------------------------------------------------------

// v4.2.10: prefer PON Serial format saat ada (yang OLT register-kan), fallback ke factory serial.
// PON serial format: vendor prefix (4 chars) + 8 hex MAC. Contoh: ZXICAEE7F72F, FHTTC127A7C1.
