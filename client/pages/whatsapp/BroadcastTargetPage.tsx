/**
 * v4.2.20 (PRD WA Feature v2): Broadcast Pelanggan / Reseller
 *
 * Shared component dengan props `target` (pelanggan | reseller).
 * Layout:
 *   - List campaigns + filter (rentang tanggal, status, template, search)
 *   - Form: pilih device → pilih template → pilih target → input manual → Broadcast Sekarang
 */

import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Plus, Send, Megaphone, Loader2, Search, ChevronRight, ArrowLeft,
  CheckCircle2, XCircle, Clock, MessageCircle, Eye, Users,
} from "lucide-react";

interface Props {
  target: "pelanggan" | "reseller";
}

interface Device { id: number; name: string; phone: string; provider: string; isActive: number; }
interface Template {
  id: number; name: string; content: string; templateType: string;
  customerFilter: string; shareToReseller: number;
  // v4.2.24: extra fields untuk preview
  footer?: string | null;
  buttons?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  compatMode?: string | null;
}
interface Phonebook { id: number; name: string; description: string | null; color: string | null; contactCount: number; }
interface PhonebookContact { id: number; name: string; phone: string; email: string | null; address: string | null; customerId: number | null; }
interface Customer {
  id: number;
  name: string;
  customerId: string;
  phone: string | null;
  address: string | null;
  isIsolir: number | null;
  // v4.2.24: tambahan untuk grouping
  package: string | null;
  district: string | null;
  village: string | null;
  odpId: number | null;
}
interface Reseller { id: number; name: string; phone: string; email: string | null; district?: string | null; }
interface Odp { id: number; name: string; district: string | null; }
interface Campaign {
  id: number; name: string; templateId: number; status: string; targetType: string | null;
  sentCount: number; failedCount: number; audienceCount: number;
  createdAt: string;
  // v4.2.26: enriched
  createdBy?: number | null;
  createdByUser?: { id: number; name: string; username: string; role?: string } | null;
  device?: { id: number; name: string; phone: string; provider?: string } | null;
  template?: { id: number; name: string; key?: string } | null;
  deviceId?: number | null;
  scheduledAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}
interface Recipient {
  id: number; campaignId: number;
  customerId: number | null;
  phone: string; customerName: string | null;
  renderedMessage: string | null;
  status: string;
  sentAt: string | null;
  errorMessage: string | null;
  mpwaResponse: string | null;
  retryCount: number;
  createdAt: string;
}
interface RecipientList { items: Recipient[]; counts: { total: number; pending: number; sent: number; failed: number; skipped: number; }; }

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  draft:     { label: "Draft",     color: "bg-zinc-100 text-zinc-700" },
  running:   { label: "Mengirim",  color: "bg-yellow-100 text-yellow-800" },
  completed: { label: "Terkirim",  color: "bg-emerald-100 text-emerald-700" },
  failed:    { label: "Gagal Terkirim", color: "bg-rose-100 text-rose-700" },
  cancelled: { label: "Dibatalkan", color: "bg-zinc-100 text-zinc-700" },
};

// Status efektif untuk display: campaign yang "completed" tapi SEMUA penerima gagal
// (tidak ada satupun terkirim) ditampilkan sebagai "failed" (merah), bukan hijau "Terkirim".
function effectiveStatus(c: { status: string; sentCount?: number; failedCount?: number }): string {
  if (c.status === "completed" && (c.sentCount ?? 0) === 0 && (c.failedCount ?? 0) > 0) {
    return "failed";
  }
  return c.status;
}

// v4.2.26: URL state untuk persist view di refresh
function readBroadcastUrl(): { view: "list" | "form" | "detail"; detailId: number | null } {
  if (typeof window === "undefined") return { view: "list", detailId: null };
  const sp = new URLSearchParams(window.location.search);
  const action = sp.get("action");
  const detail = sp.get("detail");
  if (action === "new") return { view: "form", detailId: null };
  if (detail) return { view: "detail", detailId: Number(detail) };
  return { view: "list", detailId: null };
}
function writeBroadcastUrl(view: "list" | "form" | "detail", detailId: number | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("action");
  url.searchParams.delete("detail");
  if (view === "form") url.searchParams.set("action", "new");
  else if (view === "detail" && detailId) url.searchParams.set("detail", String(detailId));
  window.history.replaceState({}, "", url.toString());
}

export default function BroadcastTargetPage({ target }: Props) {
  const init = useMemo(() => readBroadcastUrl(), []);
  const [view, setView] = useState<"list" | "form" | "detail">(init.view);
  const [detailId, setDetailId] = useState<number | null>(init.detailId);

  useEffect(() => {
    writeBroadcastUrl(view, detailId);
  }, [view, detailId]);

  if (view === "form") {
    return <BroadcastForm target={target} onBack={() => setView("list")} />;
  }
  if (view === "detail" && detailId) {
    return <BroadcastDetail campaignId={detailId} target={target} onBack={() => { setView("list"); setDetailId(null); }} />;
  }
  return <BroadcastList target={target} onCreate={() => setView("form")} onOpenDetail={(id) => { setDetailId(id); setView("detail"); }} />;
}

function BroadcastList({ target, onCreate, onOpenDetail }: Props & { onCreate: () => void; onOpenDetail: (id: number) => void }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [templateFilter, setTemplateFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  const { data: campaigns = [], isLoading } = useQuery<Campaign[]>({
    queryKey: ["broadcast-campaigns-v2", target],
    queryFn: () => api.get(`/broadcast/campaigns?limit=500`),
    refetchInterval: 10_000,
  });
  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["wa-templates-v2"],
    queryFn: () => api.get("/mpwa/templates"),
  });

  const filtered = useMemo(() => {
    return campaigns.filter(c => {
      // Filter target type
      if ((c.targetType ?? "pelanggan") !== target) return false;
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (templateFilter !== "all" && String(c.templateId) !== templateFilter) return false;
      if (search.trim() && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (c.createdAt && (c.createdAt < dateFrom || c.createdAt > dateTo + "T23:59:59")) return false;
      return true;
    });
  }, [campaigns, target, statusFilter, templateFilter, search, dateFrom, dateTo]);

  const targetLabel = target === "pelanggan" ? "Pelanggan" : "Reseller";

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4 max-w-7xl">
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        <MessageCircle className="h-3 w-3" />
        <span>Broadcast {targetLabel}</span>
        <ChevronRight className="h-3 w-3" />
        <span className="font-bold">List</span>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="rounded-lg bg-gradient-to-br from-violet-100 to-purple-200 p-2.5 shrink-0">
            <Megaphone className="h-5 w-5 text-violet-700" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight-display truncate">Broadcast {targetLabel}</h1>
            <p className="text-sm text-muted-foreground truncate">Riwayat broadcast WhatsApp ke {targetLabel.toLowerCase()}</p>
          </div>
        </div>
        <Button onClick={onCreate} className="bg-violet-600 hover:bg-violet-700" leftIcon={<Send className="h-3.5 w-3.5" />}>
          Broadcast Baru
        </Button>
      </div>

      {/* Filter bar */}
      <div className="rounded-xl border bg-card p-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <div>
            <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Rentang Tanggal</label>
            <div className="flex items-center gap-1 mt-1">
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="text-xs h-8" />
              <span className="text-xs">→</span>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="text-xs h-8" />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full mt-1 px-2 py-1.5 rounded-md border bg-background text-xs h-8">
              <option value="all">Semua Status</option>
              <option value="running">Mengirim</option>
              <option value="completed">Terkirim</option>
              <option value="failed">Gagal Terkirim</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Template</label>
            <select value={templateFilter} onChange={(e) => setTemplateFilter(e.target.value)} className="w-full mt-1 px-2 py-1.5 rounded-md border bg-background text-xs h-8">
              <option value="all">Semua Template</option>
              {templates.filter(t => t.templateType === target).map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Cari {targetLabel}</label>
            <div className="relative mt-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Cari..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 text-xs h-8" />
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-violet-600" />
          <h2 className="font-bold text-sm">List Broadcast {targetLabel}</h2>
        </div>
        {isLoading ? (
          <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <Megaphone className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <div className="font-bold">Belum ada broadcast</div>
            <div className="text-xs text-muted-foreground mt-1">Klik "Broadcast Baru" untuk kirim WhatsApp ke {targetLabel.toLowerCase()}.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-muted/30 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              <tr>
                <th className="px-3 py-2 w-8"><input type="checkbox" className="h-3 w-3" /></th>
                <th className="px-3 py-2 text-left w-10">NO</th>
                <th className="px-3 py-2 text-left">{targetLabel.toUpperCase()}</th>
                <th className="px-3 py-2 text-left">TANGGAL</th>
                <th className="px-3 py-2 text-left">TEMPLATE</th>
                <th className="px-3 py-2 text-left">STATUS</th>
                <th className="px-3 py-2 text-right">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((c, i) => {
                const tpl = templates.find(t => t.id === c.templateId);
                const effStatus = effectiveStatus(c);
                const cfg = STATUS_LABEL[effStatus] ?? STATUS_LABEL.draft;
                return (
                  <tr key={c.id} className="hover:bg-muted/20 transition">
                    <td className="px-3 py-2.5"><input type="checkbox" className="h-3 w-3" /></td>
                    <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold">{c.name}</div>
                      <div className="text-[10px] text-muted-foreground">{c.audienceCount} {targetLabel.toLowerCase()}</div>
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {new Date(c.createdAt).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      <div className="text-[10px] text-muted-foreground italic">
                        Oleh: {c.createdByUser?.name ?? (c.createdBy ? `User #${c.createdBy}` : "System")}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                        {tpl?.name ?? `Template #${c.templateId}`}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded", cfg.color)}>
                        {effStatus === "running" && <Clock className="h-3 w-3" />}
                        {effStatus === "completed" && <CheckCircle2 className="h-3 w-3" />}
                        {effStatus === "failed" && <XCircle className="h-3 w-3" />}
                        {cfg.label}
                      </span>
                      {c.sentCount > 0 && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {c.sentCount} sent · {c.failedCount} gagal
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Button size="xs" variant="ghost-primary" onClick={() => onOpenDetail(c.id)} leftIcon={<Eye className="h-3 w-3" />}>
                        Detail
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------
// Form Broadcast Baru
// -----------------------------------------------------------------
function BroadcastForm({ target, onBack }: Props & { onBack: () => void }) {
  const qc = useQueryClient();
  const targetLabel = target === "pelanggan" ? "Pelanggan" : "Reseller";

  const [name, setName] = useState("");
  const [deviceId, setDeviceId] = useState<number | null>(null);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [selectedTargetIds, setSelectedTargetIds] = useState<Set<number>>(new Set());
  const [manualText, setManualText] = useState("");
  const [manualDate, setManualDate] = useState("");
  const [targetSearch, setTargetSearch] = useState("");
  // v4.2.24: source = pilih dari mana
  const [audienceSource, setAudienceSource] = useState<"customers" | "phonebook">("customers");
  const [selectedPhonebookId, setSelectedPhonebookId] = useState<number | null>(null);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<number>>(new Set());
  // v4.2.24: filters & group-by
  const [filterPackages, setFilterPackages] = useState<Set<string>>(new Set());
  const [filterDistricts, setFilterDistricts] = useState<Set<string>>(new Set());
  const [filterOdpIds, setFilterOdpIds] = useState<Set<number>>(new Set());
  const [filterIsolir, setFilterIsolir] = useState<"all" | "active" | "isolir">("all");
  const [groupBy, setGroupBy] = useState<"none" | "package" | "district" | "odp">("none");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const { data: devices = [] } = useQuery<Device[]>({
    queryKey: ["wa-devices-active"],
    queryFn: () => api.get("/whatsapp/devices?active=true"),
  });
  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["wa-templates-v2"],
    queryFn: () => api.get("/mpwa/templates"),
  });
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["customers-broadcast", target],
    queryFn: () => target === "pelanggan" ? api.get("/customers") : Promise.resolve([] as any),
    enabled: target === "pelanggan",
  });
  const { data: resellers = [] } = useQuery<Reseller[]>({
    queryKey: ["resellers-broadcast"],
    queryFn: () => target === "reseller" ? api.get("/resellers?active=true") : Promise.resolve([] as any),
    enabled: target === "reseller",
  });
  // v4.2.24: ODPs untuk filter + group display
  const { data: odps = [] } = useQuery<Odp[]>({
    queryKey: ["odps-broadcast"],
    queryFn: () => target === "pelanggan" ? api.get("/odps") : Promise.resolve([] as any),
    enabled: target === "pelanggan",
  });
  // v4.2.24: Phonebooks list + contacts ketika phonebook source dipilih
  const { data: phonebooks = [] } = useQuery<Phonebook[]>({
    queryKey: ["phonebooks-broadcast"],
    queryFn: () => api.get("/phonebooks"),
    enabled: audienceSource === "phonebook",
  });
  const { data: phonebookContacts = [] } = useQuery<PhonebookContact[]>({
    queryKey: ["phonebook-contacts-broadcast", selectedPhonebookId],
    queryFn: () => selectedPhonebookId ? api.get(`/phonebooks/${selectedPhonebookId}/contacts?limit=2000`) : Promise.resolve([] as any),
    enabled: !!selectedPhonebookId && audienceSource === "phonebook",
  });
  const odpMap = useMemo(() => {
    const m = new Map<number, Odp>();
    odps.forEach(o => m.set(o.id, o));
    return m;
  }, [odps]);

  const filteredTemplates = templates.filter(t => t.templateType === target);
  const selectedTemplate = filteredTemplates.find(t => t.id === templateId);

  // Determine if template requires manual_text or manual_date
  const needsManualText = selectedTemplate?.content.includes("{{input_manual_text}}");
  const needsManualDate = selectedTemplate?.content.includes("{{input_manual_tanggal}}");

  // v4.2.24: Distinct values untuk dropdown filter
  const distinctPackages = useMemo(() => {
    if (target !== "pelanggan") return [];
    const set = new Set<string>();
    customers.forEach(c => { if (c.package) set.add(c.package); });
    return Array.from(set).sort();
  }, [customers, target]);
  const distinctDistricts = useMemo(() => {
    if (target === "pelanggan") {
      const set = new Set<string>();
      customers.forEach(c => { if (c.district) set.add(c.district); });
      return Array.from(set).sort();
    }
    // reseller districts
    const set = new Set<string>();
    resellers.forEach(r => { if (r.district) set.add(r.district); });
    return Array.from(set).sort();
  }, [customers, resellers, target]);
  const distinctOdps = useMemo(() => {
    if (target !== "pelanggan") return [];
    // ODPs yang punya customer
    const idsWithCustomer = new Set(customers.filter(c => c.odpId).map(c => c.odpId!));
    return odps.filter(o => idsWithCustomer.has(o.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [odps, customers, target]);

  // Filter target list (search + multi-filter)
  const targetListFull = useMemo(() => {
    if (target === "pelanggan") {
      let list = customers.filter(c => !!c.phone);
      // Template's customerFilter (unpaid)
      if (selectedTemplate?.customerFilter === "unpaid") {
        list = list.filter(c => c.isIsolir === 1);
      }
      // Filter isolir status
      if (filterIsolir === "active") list = list.filter(c => !c.isIsolir);
      else if (filterIsolir === "isolir") list = list.filter(c => c.isIsolir === 1);
      // Filter paket (multi)
      if (filterPackages.size > 0) list = list.filter(c => c.package && filterPackages.has(c.package));
      // Filter district (multi)
      if (filterDistricts.size > 0) list = list.filter(c => c.district && filterDistricts.has(c.district));
      // Filter ODP (multi)
      if (filterOdpIds.size > 0) list = list.filter(c => c.odpId && filterOdpIds.has(c.odpId));
      // Search
      if (targetSearch.trim()) {
        const q = targetSearch.toLowerCase();
        list = list.filter(c =>
          c.name.toLowerCase().includes(q) ||
          c.customerId.includes(q) ||
          (c.address ?? "").toLowerCase().includes(q)
        );
      }
      return list;
    }
    // Reseller path
    let list = resellers;
    if (filterDistricts.size > 0) list = list.filter(r => r.district && filterDistricts.has(r.district));
    if (targetSearch.trim()) {
      const q = targetSearch.toLowerCase();
      list = list.filter(r => r.name.toLowerCase().includes(q) || r.phone.includes(q));
    }
    return list;
  }, [target, customers, resellers, selectedTemplate, targetSearch, filterPackages, filterDistricts, filterOdpIds, filterIsolir]);

  // Trim untuk display (paginate-like, cap 500 in flat view)
  const targetList = useMemo(() => {
    if (groupBy === "none") return targetListFull.slice(0, 500);
    return targetListFull; // grouping: tampil semua group, each group capped
  }, [targetListFull, groupBy]);

  // v4.2.24: Group customers/resellers by selected field
  const groups = useMemo(() => {
    if (target !== "pelanggan" || groupBy === "none") return null;
    const m = new Map<string, { label: string; items: Customer[]; sortKey: string }>();
    for (const c of targetListFull as Customer[]) {
      let key: string;
      let label: string;
      if (groupBy === "package") {
        key = c.package ?? "(no-package)";
        label = c.package ?? "Tanpa Paket";
      } else if (groupBy === "district") {
        key = c.district ?? "(no-district)";
        label = c.district ?? "Tanpa Kecamatan";
      } else { // odp
        key = c.odpId ? `odp-${c.odpId}` : "(no-odp)";
        label = c.odpId ? (odpMap.get(c.odpId)?.name ?? `ODP #${c.odpId}`) : "Tanpa ODP";
      }
      if (!m.has(key)) m.set(key, { label, items: [], sortKey: label });
      m.get(key)!.items.push(c);
    }
    return Array.from(m.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [targetListFull, groupBy, target, odpMap]);

  function toggleTarget(id: number) {
    setSelectedTargetIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAllVisible() {
    const allIds = (groupBy === "none" ? targetList : targetListFull).map((t: any) => t.id);
    setSelectedTargetIds(new Set([...selectedTargetIds, ...allIds]));
  }
  function selectAllInGroup(items: Array<{ id: number }>) {
    setSelectedTargetIds(prev => {
      const next = new Set(prev);
      items.forEach(i => next.add(i.id));
      return next;
    });
  }
  function unselectAllInGroup(items: Array<{ id: number }>) {
    setSelectedTargetIds(prev => {
      const next = new Set(prev);
      items.forEach(i => next.delete(i.id));
      return next;
    });
  }
  function toggleGroup(key: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
  function toggleSetItem<T>(setter: (s: Set<T>) => void, current: Set<T>, item: T) {
    const next = new Set(current);
    if (next.has(item)) next.delete(item);
    else next.add(item);
    setter(next);
  }
  function clearAllFilters() {
    setFilterPackages(new Set());
    setFilterDistricts(new Set());
    setFilterOdpIds(new Set());
    setFilterIsolir("all");
    setTargetSearch("");
  }
  const activeFilterCount =
    filterPackages.size + filterDistricts.size + filterOdpIds.size +
    (filterIsolir !== "all" ? 1 : 0) +
    (targetSearch ? 1 : 0);

  const sendMut = useMutation({
    mutationFn: async () => {
      if (!deviceId) throw new Error("Pilih nomor WhatsApp dulu");
      if (!templateId) throw new Error("Pilih template dulu");

      // v4.2.24: build directRecipients sesuai source
      let directRecipients: any[] = [];
      if (audienceSource === "phonebook") {
        if (selectedContactIds.size === 0) throw new Error("Pilih minimal 1 kontak dari phonebook");
        directRecipients = phonebookContacts
          .filter(c => selectedContactIds.has(c.id) && c.phone)
          .map(c => ({
            id: c.customerId ?? null,  // null kalau bukan customer
            phone: c.phone,
            name: c.name,
            customerId: c.customerId ? String(c.customerId) : undefined,
            phonebookContactId: c.id,
          }));
      } else {
        if (selectedTargetIds.size === 0) throw new Error(`Pilih minimal 1 ${targetLabel.toLowerCase()}`);
        directRecipients = target === "pelanggan"
          ? customers
              .filter(c => selectedTargetIds.has(c.id) && c.phone)
              .map(c => ({ id: c.id, phone: c.phone!, name: c.name, customerId: c.customerId }))
          : resellers
              .filter(r => selectedTargetIds.has(r.id) && r.phone)
              .map(r => ({ id: r.id, resellerId: r.id, phone: r.phone, name: r.name }));
      }

      if (directRecipients.length === 0) {
        throw new Error(`Target yang dipilih belum punya nomor telepon valid`);
      }

      const res: any = await api.post("/broadcast/campaigns", {
        name: name || `${selectedTemplate?.name ?? "Broadcast"} - ${new Date().toLocaleString("id-ID")}`,
        templateId,
        // v4.2.20: pass directRecipients langsung (bypass audience filter)
        directRecipients,
        manualText: manualText || null,
        manualDate: manualDate || null,
        rateLimitMs: 2000,
        targetType: target,
        deviceId,
      });
      const id = res?.id ?? res?.data?.id;
      if (id) {
        await api.post(`/broadcast/campaigns/${id}/start`, {});
      }
      return res;
    },
    onSuccess: () => {
      toast.success("Broadcast dimulai!");
      qc.invalidateQueries({ queryKey: ["broadcast-campaigns-v2"] });
      onBack();
    },
    onError: (e: any) => toast.error(e.message || "Gagal mulai broadcast"),
  });

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4 max-w-5xl">
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        <MessageCircle className="h-3 w-3" />
        <span>Whatsapp</span>
        <ChevronRight className="h-3 w-3" />
        <button onClick={onBack} className="hover:text-foreground">Broadcast {targetLabel}</button>
        <ChevronRight className="h-3 w-3" />
        <span className="font-bold">Form</span>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={onBack} className="rounded-md hover:bg-muted p-2 -ml-2"><ArrowLeft className="h-4 w-4" /></button>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight-display">Broadcast Form {targetLabel}</h1>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-4">
        {/* Nama Campaign */}
        <div>
          <label className="text-xs font-bold uppercase tracking-wider">Nama Broadcast (opsional)</label>
          <Input
            placeholder="Auto-generate dari nama template kalau dikosongkan"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-sm mt-1"
          />
        </div>

        {/* Pilih Nomor */}
        <div>
          <label className="text-xs font-bold uppercase tracking-wider">Pilih Nomor Whatsapp <span className="text-rose-600">*</span></label>
          <select
            value={deviceId ?? ""}
            onChange={(e) => setDeviceId(e.target.value ? Number(e.target.value) : null)}
            className="w-full mt-1 px-3 py-2 rounded-md border bg-background text-sm"
          >
            <option value="">- Pilih device pengirim -</option>
            {devices.map(d => (
              <option key={d.id} value={d.id}>{d.name} ({d.phone}) · {d.provider}</option>
            ))}
          </select>
          {devices.length === 0 && (
            <p className="text-[10px] text-rose-600 mt-1">Belum ada device aktif. Daftarkan di menu Nomor Whatsapp dulu.</p>
          )}
        </div>

        {/* Pilih Template + Live Preview v4.2.24 */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider">Pilih Template <span className="text-rose-600">*</span></label>
            <select
              value={templateId ?? ""}
              onChange={(e) => { setTemplateId(e.target.value ? Number(e.target.value) : null); setSelectedTargetIds(new Set()); }}
              className="w-full mt-1 px-3 py-2 rounded-md border bg-background text-sm"
            >
              <option value="">- Pilih template -</option>
              {filteredTemplates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {selectedTemplate && (
              <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground flex-wrap">
                {selectedTemplate.mediaUrl && <span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-700"> Image</span>}
                {selectedTemplate.buttons && <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-700"> Button</span>}
                {selectedTemplate.compatMode === "text-link" && <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">Text+Link</span>}
                {selectedTemplate.compatMode !== "text-link" && selectedTemplate.buttons && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Native</span>}
                {selectedTemplate.customerFilter === "unpaid" && target === "pelanggan" && <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">Filter: Belum Bayar</span>}
              </div>
            )}
          </div>

          {/* Live preview WA bubble - muncul saat template dipilih */}
          {selectedTemplate && (
            <TemplatePreview template={selectedTemplate} target={target} manualText={manualText} manualDate={manualDate} />
          )}
        </div>

        {/* Manual input fields (kalau template butuh) */}
        {templateId && needsManualText && (
          <div>
            <label className="text-xs font-bold uppercase tracking-wider">Input Manual Text</label>
            <Input
              placeholder="Akan replace {{input_manual_text}} di template"
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              className="text-sm mt-1"
            />
          </div>
        )}
        {templateId && needsManualDate && (
          <div>
            <label className="text-xs font-bold uppercase tracking-wider">Input Manual Tanggal</label>
            <Input
              type="date"
              value={manualDate}
              onChange={(e) => setManualDate(e.target.value)}
              className="text-sm mt-1"
            />
          </div>
        )}

        {/* v4.2.24: Audience source toggle (Pelanggan / Phonebook) */}
        {templateId && target === "pelanggan" && (
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-2 block">Sumber Penerima</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <label className={cn(
                "rounded-md border-2 p-2.5 cursor-pointer transition",
                audienceSource === "customers" ? "border-violet-500 bg-violet-50/30" : "border-muted hover:border-foreground/30"
              )}>
                <input type="radio" name="audience-source" checked={audienceSource === "customers"} onChange={() => { setAudienceSource("customers"); setSelectedContactIds(new Set()); }} className="sr-only" />
                <div className="flex items-start gap-2">
                  <div className={cn("h-3.5 w-3.5 rounded-full border-2 mt-0.5 shrink-0", audienceSource === "customers" ? "border-violet-600 bg-violet-600 ring-2 ring-violet-200" : "border-muted-foreground")} />
                  <div className="flex-1">
                    <div className="text-sm font-bold">Database Pelanggan</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{customers.length} pelanggan · filter by paket/kecamatan/ODP</div>
                  </div>
                </div>
              </label>
              <label className={cn(
                "rounded-md border-2 p-2.5 cursor-pointer transition",
                audienceSource === "phonebook" ? "border-sky-500 bg-sky-50/30" : "border-muted hover:border-foreground/30"
              )}>
                <input type="radio" name="audience-source" checked={audienceSource === "phonebook"} onChange={() => { setAudienceSource("phonebook"); setSelectedTargetIds(new Set()); }} className="sr-only" />
                <div className="flex items-start gap-2">
                  <div className={cn("h-3.5 w-3.5 rounded-full border-2 mt-0.5 shrink-0", audienceSource === "phonebook" ? "border-sky-600 bg-sky-600 ring-2 ring-sky-200" : "border-muted-foreground")} />
                  <div className="flex-1">
                    <div className="text-sm font-bold">Phonebook</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{phonebooks.length} list custom · reseller/calon pelanggan/internal</div>
                  </div>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* PHONEBOOK PICKER */}
        {templateId && audienceSource === "phonebook" && target === "pelanggan" && (
          <div>
            <label className="text-xs font-bold uppercase tracking-wider">Pilih Phonebook <span className="text-rose-600">*</span></label>
            {phonebooks.length === 0 ? (
              <div className="mt-1 rounded-md border bg-amber-50/30 border-amber-200 px-3 py-3 text-xs text-amber-900">
                Belum ada phonebook. <a href="/whatsapp/phonebook" className="font-bold text-amber-700 underline">Buat phonebook dulu</a> untuk pakai source ini.
              </div>
            ) : (
              <>
                <select
                  value={selectedPhonebookId ?? ""}
                  onChange={(e) => { setSelectedPhonebookId(e.target.value ? Number(e.target.value) : null); setSelectedContactIds(new Set()); }}
                  className="w-full mt-1 px-3 py-2 rounded-md border bg-background text-sm"
                >
                  <option value="">- Pilih phonebook -</option>
                  {phonebooks.map(pb => (
                    <option key={pb.id} value={pb.id}>{pb.name} ({pb.contactCount} kontak)</option>
                  ))}
                </select>
                {selectedPhonebookId && phonebookContacts.length > 0 && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
                      <span className="text-[11px] text-muted-foreground">
                        <span className="font-bold tabular-nums">{selectedContactIds.size}</span> dari <span className="font-bold tabular-nums">{phonebookContacts.length}</span> dipilih
                      </span>
                      <div className="flex items-center gap-1">
                        <Button size="xs" variant="ghost-primary" onClick={() => setSelectedContactIds(new Set(phonebookContacts.map(c => c.id)))}>
                          Pilih Semua
                        </Button>
                        {selectedContactIds.size > 0 && (
                          <Button size="xs" variant="ghost" onClick={() => setSelectedContactIds(new Set())} className="text-rose-600">Clear</Button>
                        )}
                      </div>
                    </div>
                    <div className="rounded-md border max-h-[280px] overflow-y-auto divide-y bg-background">
                      {phonebookContacts.map(c => (
                        <button
                          key={c.id}
                          onClick={() => setSelectedContactIds(prev => {
                            const next = new Set(prev);
                            if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
                            return next;
                          })}
                          className={cn(
                            "w-full text-left px-3 py-1.5 flex items-center gap-2 text-xs hover:bg-muted/40 transition",
                            selectedContactIds.has(c.id) && "bg-sky-50"
                          )}
                        >
                          <div className={cn("h-4 w-4 rounded border-2 grid place-items-center shrink-0",
                            selectedContactIds.has(c.id) ? "bg-sky-600 border-sky-600" : "border-zinc-300"
                          )}>
                            {selectedContactIds.has(c.id) && <CheckCircle2 className="h-2.5 w-2.5 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold truncate">{c.name}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {c.phone}
                              {c.email && <span> · {c.email}</span>}
                              {c.customerId && <span className="ml-1 px-1 rounded bg-emerald-100 text-emerald-700">Linked customer</span>}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Pilih Target - v4.2.24 dengan quick filter + group-by (HANYA kalau source=customers/reseller, bukan phonebook) */}
        {templateId && (target === "reseller" || audienceSource === "customers") && (
          <div>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <label className="text-xs font-bold uppercase tracking-wider">
                Pilih {targetLabel} <span className="text-rose-600">*</span>
                {selectedTemplate?.customerFilter === "unpaid" && target === "pelanggan" && (
                  <span className="ml-2 text-[10px] font-normal text-amber-700">(template: hanya Belum Bayar)</span>
                )}
              </label>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="font-bold tabular-nums">{selectedTargetIds.size} dipilih</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">{targetListFull.length} match filter</span>
                {selectedTargetIds.size > 0 && (
                  <Button size="xs" variant="ghost" onClick={() => setSelectedTargetIds(new Set())} className="text-rose-600">Clear pilihan</Button>
                )}
              </div>
            </div>

            {/* v4.2.24: Quick Filters */}
            {target === "pelanggan" && (
              <div className="rounded-md border bg-muted/20 p-2.5 mb-2 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                     Quick Filter
                    {activeFilterCount > 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-200 text-violet-800 font-bold">{activeFilterCount} aktif</span>
                    )}
                  </div>
                  {activeFilterCount > 0 && (
                    <Button size="xs" variant="ghost" onClick={clearAllFilters} className="text-rose-600 h-6">
                      Reset semua
                    </Button>
                  )}
                </div>

                {/* Search bar */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Cari nama / ID / alamat..."
                    value={targetSearch}
                    onChange={(e) => setTargetSearch(e.target.value)}
                    className="pl-8 text-xs h-8 bg-background"
                  />
                </div>

                {/* Status isolir */}
                <div>
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Status</div>
                  <div className="flex items-center gap-1.5">
                    {([
                      { val: "all" as const, label: "Semua", count: customers.filter(c => !!c.phone).length },
                      { val: "active" as const, label: "Aktif", count: customers.filter(c => !!c.phone && !c.isIsolir).length },
                      { val: "isolir" as const, label: "Isolir", count: customers.filter(c => !!c.phone && c.isIsolir === 1).length },
                    ]).map(opt => (
                      <button
                        key={opt.val}
                        onClick={() => setFilterIsolir(opt.val)}
                        className={cn(
                          "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition",
                          filterIsolir === opt.val
                            ? "bg-violet-600 text-white"
                            : "bg-background border hover:border-violet-400"
                        )}
                      >
                        {opt.label} <span className="opacity-70">({opt.count})</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Paket */}
                {distinctPackages.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                       Paket {filterPackages.size > 0 && <span className="text-violet-700">({filterPackages.size} dipilih)</span>}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {distinctPackages.map(pkg => {
                        const count = customers.filter(c => c.package === pkg && !!c.phone).length;
                        const active = filterPackages.has(pkg);
                        return (
                          <button
                            key={pkg}
                            onClick={() => toggleSetItem(setFilterPackages, filterPackages, pkg)}
                            className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-bold transition",
                              active
                                ? "bg-violet-600 text-white"
                                : "bg-background border hover:border-violet-400 text-foreground"
                            )}
                          >
                            {pkg} <span className="opacity-70">({count})</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Kecamatan */}
                {distinctDistricts.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                       Kecamatan {filterDistricts.size > 0 && <span className="text-violet-700">({filterDistricts.size} dipilih)</span>}
                    </div>
                    <div className="flex flex-wrap gap-1 max-h-[80px] overflow-y-auto">
                      {distinctDistricts.map(d => {
                        const count = customers.filter(c => c.district === d && !!c.phone).length;
                        const active = filterDistricts.has(d);
                        return (
                          <button
                            key={d}
                            onClick={() => toggleSetItem(setFilterDistricts, filterDistricts, d)}
                            className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-bold transition",
                              active ? "bg-violet-600 text-white" : "bg-background border hover:border-violet-400"
                            )}
                          >
                            {d} <span className="opacity-70">({count})</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ODP */}
                {distinctOdps.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                       ODP {filterOdpIds.size > 0 && <span className="text-violet-700">({filterOdpIds.size} dipilih)</span>}
                    </div>
                    <div className="flex flex-wrap gap-1 max-h-[80px] overflow-y-auto">
                      {distinctOdps.map(o => {
                        const count = customers.filter(c => c.odpId === o.id && !!c.phone).length;
                        const active = filterOdpIds.has(o.id);
                        return (
                          <button
                            key={o.id}
                            onClick={() => toggleSetItem(setFilterOdpIds, filterOdpIds, o.id)}
                            className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-bold transition",
                              active ? "bg-violet-600 text-white" : "bg-background border hover:border-violet-400"
                            )}
                          >
                            {o.name} <span className="opacity-70">({count})</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Group by + Select All */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Group by:</span>
                    {([
                      { val: "none" as const, label: "Flat" },
                      { val: "package" as const, label: "Paket" },
                      { val: "district" as const, label: "Kecamatan" },
                      { val: "odp" as const, label: "ODP" },
                    ]).map(opt => (
                      <button
                        key={opt.val}
                        onClick={() => setGroupBy(opt.val)}
                        className={cn(
                          "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition",
                          groupBy === opt.val
                            ? "bg-sky-600 text-white"
                            : "bg-background border hover:border-sky-400"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <Button
                    size="xs"
                    variant="ghost-primary"
                    onClick={selectAllVisible}
                    disabled={targetListFull.length === 0}
                  >
                    Pilih Semua ({targetListFull.length})
                  </Button>
                </div>
              </div>
            )}

            {/* Reseller - simpler search + district filter */}
            {target === "reseller" && (
              <div className="rounded-md border bg-muted/20 p-2.5 mb-2">
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Cari nama / phone..."
                    value={targetSearch}
                    onChange={(e) => setTargetSearch(e.target.value)}
                    className="pl-8 text-xs h-8 bg-background"
                  />
                </div>
                {distinctDistricts.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Kecamatan:</span>
                    {distinctDistricts.map(d => (
                      <button
                        key={d}
                        onClick={() => toggleSetItem(setFilterDistricts, filterDistricts, d)}
                        className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold",
                          filterDistricts.has(d) ? "bg-violet-600 text-white" : "bg-background border"
                        )}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                )}
                <Button
                  size="xs"
                  variant="ghost-primary"
                  onClick={selectAllVisible}
                  disabled={targetListFull.length === 0}
                  className="mt-2"
                >
                  Pilih Semua ({targetListFull.length})
                </Button>
              </div>
            )}

            {/* Target list - grouped atau flat */}
            <div className="rounded-md border max-h-[360px] overflow-y-auto bg-background">
              {targetListFull.length === 0 ? (
                <div className="px-3 py-8 text-center text-xs text-muted-foreground italic">
                  Tidak ada {targetLabel.toLowerCase()} yang match filter.
                </div>
              ) : groups ? (
                /* GROUPED VIEW */
                <div className="divide-y">
                  {groups.map(g => {
                    const collapsed = collapsedGroups.has(g.label);
                    const groupSelected = g.items.filter(i => selectedTargetIds.has(i.id)).length;
                    const allSelected = groupSelected === g.items.length;
                    return (
                      <div key={g.label}>
                        {/* Group header */}
                        <div className="px-3 py-2 bg-muted/30 flex items-center gap-2 sticky top-0 z-10">
                          <button
                            onClick={() => toggleGroup(g.label)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", !collapsed && "rotate-90")} />
                          </button>
                          <div className="flex-1 text-xs font-bold">{g.label}</div>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-background border">
                            {g.items.length}
                          </span>
                          {groupSelected > 0 && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-800">
                              {groupSelected} ✓
                            </span>
                          )}
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => allSelected ? unselectAllInGroup(g.items) : selectAllInGroup(g.items)}
                            className="h-6 text-[10px]"
                          >
                            {allSelected ? "Unselect" : "Pilih Semua"}
                          </Button>
                        </div>
                        {!collapsed && (
                          <div className="divide-y">
                            {g.items.slice(0, 200).map(t => (
                              <button
                                key={t.id}
                                onClick={() => toggleTarget(t.id)}
                                className={cn(
                                  "w-full text-left px-4 py-1.5 flex items-center gap-2 text-xs hover:bg-muted/40 transition",
                                  selectedTargetIds.has(t.id) && "bg-violet-50"
                                )}
                              >
                                <div className={cn(
                                  "h-4 w-4 rounded border-2 grid place-items-center shrink-0",
                                  selectedTargetIds.has(t.id) ? "bg-violet-600 border-violet-600" : "border-zinc-300"
                                )}>
                                  {selectedTargetIds.has(t.id) && <CheckCircle2 className="h-2.5 w-2.5 text-white" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-semibold truncate">{t.name}</div>
                                  <div className="text-[10px] text-muted-foreground">
                                    #{t.customerId} · {t.phone ?? "-"}
                                    {t.package && groupBy !== "package" && <span> · {t.package}</span>}
                                    {t.district && groupBy !== "district" && <span> · {t.district}</span>}
                                  </div>
                                </div>
                              </button>
                            ))}
                            {g.items.length > 200 && (
                              <div className="px-4 py-1.5 text-[10px] text-muted-foreground italic text-center">
                                +{g.items.length - 200} lainnya - refine filter untuk lihat semua
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* FLAT VIEW */
                <div className="divide-y">
                  {targetList.map((t: any) => (
                    <button
                      key={t.id}
                      onClick={() => toggleTarget(t.id)}
                      className={cn(
                        "w-full text-left px-3 py-1.5 flex items-center gap-2 text-xs hover:bg-muted/40 transition",
                        selectedTargetIds.has(t.id) && "bg-violet-50"
                      )}
                    >
                      <div className={cn(
                        "h-4 w-4 rounded border-2 grid place-items-center shrink-0",
                        selectedTargetIds.has(t.id) ? "bg-violet-600 border-violet-600" : "border-zinc-300"
                      )}>
                        {selectedTargetIds.has(t.id) && <CheckCircle2 className="h-2.5 w-2.5 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate">{t.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {target === "pelanggan"
                            ? <>#{t.customerId} · {t.phone ?? "-"}{t.package && <> ·  {t.package}</>}{t.district && <> ·  {t.district}</>}{t.odpId && odpMap.get(t.odpId) && <> ·  {odpMap.get(t.odpId)!.name}</>}</>
                            : t.phone}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {groupBy === "none"
                ? `Menampilkan ${targetList.length} dari ${targetListFull.length} match.`
                : `${groups?.length ?? 0} grup · ${targetListFull.length} total.`}
              {targetListFull.length > targetList.length && groupBy === "none" && " Refine filter untuk lihat semua."}
            </p>
          </div>
        )}

        {/* Submit */}
        <div className="pt-3 border-t flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onBack} className="text-rose-600">Batal</Button>
          <Button
            onClick={() => sendMut.mutate()}
            disabled={!deviceId || !templateId || selectedTargetIds.size === 0 || sendMut.isPending}
            loading={sendMut.isPending}
            className="bg-violet-600 hover:bg-violet-700"
            leftIcon={<Send className="h-3.5 w-3.5" />}
          >
            Broadcast Sekarang
          </Button>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------
// v4.2.24: Template Preview - WhatsApp bubble dengan sample data
// -----------------------------------------------------------------
function TemplatePreview({ template, target, manualText, manualDate }: {
  template: Template;
  target: "pelanggan" | "reseller";
  manualText: string;
  manualDate: string;
}) {
  // Sample data untuk preview render
  const sampleVars: Record<string, string> = target === "pelanggan"
    ? {
        // 28 params pelanggan
        nama_pelanggan: "John Doe",
        nama: "John Doe",
        customer_id: "058500001",
        customerId: "058500001",
        telepon_pelanggan: "081234567890",
        alamat_pelanggan: "Jl. Sudirman 1, Garut",
        nama_isp: "JABNET",
        paket_layanan: "20 Mbps",
        package: "20 Mbps",
        harga_paket_layanan: "Rp. 250.000",
        tgl_aktivasi: "23/08/2025",
        tgl_jatuh_tempo_invoice: "15/05/2026",
        hari_tgl_jatuh_tempo_invoice: "Jumat",
        periode_tagihan: "Mei 2026",
        total_tagihan: "Rp. 250.000",
        tanggal_pembayaran_diterima: "10/05/2026",
        jam_pembayaran_diterima: "14:30",
        tanggal_pembayaran: "10/05/2026",
        jam_pembayaran: "14:30",
        metode_pembayaran: "Transfer BNI",
        link_pembayaran: "https://portal.jabnet.id/billing",
        link_survey_feedback: "https://portal.jabnet.id/survey",
        url_wa_finance: "https://wa.me/6289630599885",
        url_wa_cs: "https://wa.me/6289630599885",
        link_pelanggan_baru: "https://portal.jabnet.id/welcome",
        periode_invoice_dibayarkan: "Mei 2026",
        total_invoice_dibayarkan: "Rp. 250.000",
        link_data_pelanggan_readonly: "https://portal.jabnet.id/profile",
        link_data_pelanggan_editable: "https://portal.jabnet.id/profile/edit",
        cs: "JABNET CS",
        input_manual_text: manualText || "[INPUT TEXT]",
        input_manual_tanggal: manualDate || "[TANGGAL]",
      }
    : {
        // Reseller params
        nama_reseller: "Bu Asep Reseller",
        nama: "Bu Asep Reseller",
        telepon_reseller: "081999888777",
        alamat_reseller: "Cilawu, Garut",
        saldo_reseller: "Rp. 500.000",
        commission_rate: "7.5%",
        tgl_bergabung: "23/08/2025",
        nama_isp: "JABNET",
        url_wa_finance: "https://wa.me/6289630599885",
        url_wa_cs: "https://wa.me/6289630599885",
        input_manual_text: manualText || "[INPUT TEXT]",
        input_manual_tanggal: manualDate || "[TANGGAL]",
      };

  // Render content dengan substitusi (double {{...}} + single {...})
  const rendered = useMemo(() => {
    let s = template.content
      .replace(/\{\{(\w+)\}\}/g, (_, k) => sampleVars[k] ?? "")
      .replace(/\{(\w+)\}/g, (_, k) => sampleVars[k] ?? `{${k}}`);
    // WhatsApp markdown: *bold* _italic_ ~strike~
    s = s
      .replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\*([^\*\n]+)\*/g, "<strong>$1</strong>")
      .replace(/_([^_\n]+)_/g, "<em>$1</em>")
      .replace(/~([^~\n]+)~/g, "<s>$1</s>")
      .replace(/\n/g, "<br/>");
    return s;
  }, [template.content, manualText, manualDate, target]);

  // Parse buttons
  let buttons: any[] = [];
  try {
    if (template.buttons) {
      const parsed = JSON.parse(template.buttons);
      if (Array.isArray(parsed)) buttons = parsed.slice(0, 5);
    }
  } catch {}

  const isTextLink = template.compatMode === "text-link";

  return (
    <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50/40 p-3 lg:sticky lg:top-4">
      <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-2">
         Preview Pesan WhatsApp
      </div>
      <div className="rounded-lg p-3 max-w-full" style={{
        background: "#e5ddd5",
        backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2260%22 viewBox=%220 0 60 60%22%3E%3Cg fill=%22%23dad0c4%22 fill-opacity=%220.4%22%3E%3Cpath d=%22M30 0c-3 5 0 10 5 10s5 5 0 10-5 5 0 10 5 5 0 10-5 5 0 10z%22/%3E%3C/g%3E%3C/svg%3E")',
      }}>
        <div className="bg-white rounded-lg shadow-sm relative overflow-hidden" style={{ borderTopLeftRadius: 0 }}>
          {/* Image header */}
          {(template.mediaUrl || (buttons.length > 0 && !isTextLink)) && (
            <div className="bg-gradient-to-br from-violet-500 to-purple-600 grid place-items-center aspect-video overflow-hidden">
              {template.mediaUrl ? (
                <img src={template.mediaUrl} alt="Media template" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              ) : (
                <div className="text-white font-black text-xl tracking-tight-display">JABNET</div>
              )}
            </div>
          )}

          <div className="p-2.5">
            <div className="text-xs whitespace-pre-wrap leading-snug" dangerouslySetInnerHTML={{ __html: rendered }} />

            {/* Text fallback buttons (kalau mode=text-link) */}
            {isTextLink && buttons.length > 0 && (
              <div className="mt-2 pt-2 border-t border-dashed text-xs font-mono">
                <div className="opacity-50">---------------</div>
                {buttons.map((b, i) => {
                  const icon = b.type === "url" ? "" : b.type === "call" ? "" : b.type === "copy" ? "" : "▶";
                  let action = "";
                  if (b.type === "url" && b.url) action = `\n   ${b.url}`;
                  else if (b.type === "call" && b.phoneNumber) action = `\n   https://wa.me/${b.phoneNumber.replace(/\D/g, "")}`;
                  else if (b.type === "copy" && b.copyText) action = `\n   Kode: *${b.copyText}*`;
                  return (
                    <div key={i} className="whitespace-pre-wrap">
                      {icon} <strong>{b.displayText ?? b.label}</strong>{action}
                    </div>
                  );
                })}
                <div className="opacity-50">---------------</div>
              </div>
            )}

            {/* Footer */}
            {template.footer && (
              <div className="text-[10px] text-muted-foreground mt-2 italic">{template.footer}</div>
            )}

            {/* Native button cards (kalau ada image + native mode) */}
            {!isTextLink && buttons.length > 0 && template.mediaUrl && (
              <div className="mt-2 pt-2 border-t flex flex-col gap-1">
                {buttons.map((b, i) => (
                  <div key={i} className="text-xs text-sky-600 font-semibold py-1.5 border rounded text-center cursor-pointer">
                    {b.displayText ?? b.label}
                  </div>
                ))}
              </div>
            )}

            {/* Time stamp */}
            <div className="text-right text-[9px] text-muted-foreground mt-1">
              {new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} ✓✓
            </div>
          </div>
        </div>
      </div>
      <p className="text-[10px] text-emerald-700 mt-2 italic">
        Sample data dipakai untuk preview. Saat broadcast, placeholder akan diisi data pelanggan asli.
      </p>
    </div>
  );
}

// -----------------------------------------------------------------
// v4.2.26: Broadcast Detail - campaign info + recipients table
// -----------------------------------------------------------------
function BroadcastDetail({ campaignId, target, onBack }: {
  campaignId: number;
  target: "pelanggan" | "reseller";
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const [statusTab, setStatusTab] = useState<"all" | "sent" | "failed" | "pending" | "skipped">("all");
  const [search, setSearch] = useState("");
  const [selectedRecipient, setSelectedRecipient] = useState<Recipient | null>(null);

  const { data: campaign } = useQuery<Campaign & { counts: any }>({
    queryKey: ["broadcast-campaign-detail", campaignId],
    queryFn: () => api.get(`/broadcast/campaigns/${campaignId}`),
    refetchInterval: 5_000, // auto-refresh kalau campaign masih running
  });

  const { data: recipientsData } = useQuery<RecipientList>({
    queryKey: ["broadcast-recipients", campaignId, statusTab],
    queryFn: () => api.get(`/broadcast/campaigns/${campaignId}/recipients?limit=500${statusTab !== "all" ? `&status=${statusTab}` : ""}`),
    refetchInterval: 5_000,
  });

  const recipients = recipientsData?.items ?? [];
  const counts = recipientsData?.counts ?? campaign?.counts ?? { total: 0, sent: 0, failed: 0, pending: 0, skipped: 0 };

  const filteredRecipients = useMemo(() => {
    if (!search.trim()) return recipients;
    const q = search.toLowerCase();
    return recipients.filter(r =>
      r.phone.includes(q) ||
      (r.customerName ?? "").toLowerCase().includes(q) ||
      (r.errorMessage ?? "").toLowerCase().includes(q)
    );
  }, [recipients, search]);

  const retryMut = useMutation({
    mutationFn: () => api.post(`/broadcast/campaigns/${campaignId}/retry`, {}),
    onSuccess: (data: any) => {
      toast.success(`${data?.retried ?? 0} recipient di-retry`);
      qc.invalidateQueries({ queryKey: ["broadcast-recipients", campaignId] });
      qc.invalidateQueries({ queryKey: ["broadcast-campaign-detail", campaignId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const cancelMut = useMutation({
    mutationFn: () => api.post(`/broadcast/campaigns/${campaignId}/cancel`, {}),
    onSuccess: () => {
      toast.success("Broadcast dibatalkan");
      qc.invalidateQueries({ queryKey: ["broadcast-campaign-detail", campaignId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  function exportCsv() {
    if (recipients.length === 0) return toast.error("Tidak ada data");
    const header = ["No", "Nama", "Phone", "Status", "Sent At", "Error", "Retry"];
    const rows = recipients.map((r, i) => [
      i + 1,
      r.customerName ?? "",
      r.phone,
      r.status,
      r.sentAt ?? "",
      r.errorMessage ?? "",
      r.retryCount,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `broadcast-${campaign?.name?.replace(/[^a-z0-9]/gi, "-")}-${campaignId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded");
  }

  const statusConfig: Record<string, { label: string; cls: string }> = {
    sent:     { label: "Terkirim",  cls: "bg-emerald-100 text-emerald-700" },
    failed:   { label: "Gagal",     cls: "bg-rose-100 text-rose-700" },
    pending:  { label: "Pending",   cls: "bg-zinc-100 text-zinc-700" },
    sending:  { label: "Mengirim",  cls: "bg-amber-100 text-amber-800" },
    skipped:  { label: "Skipped",   cls: "bg-yellow-100 text-yellow-800" },
  };

  const targetLabel = target === "pelanggan" ? "Pelanggan" : "Reseller";

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4 max-w-7xl">
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        <MessageCircle className="h-3 w-3" />
        <button onClick={onBack} className="hover:text-foreground">Broadcast {targetLabel}</button>
        <ChevronRight className="h-3 w-3" />
        <span className="font-bold">Detail #{campaignId}</span>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onBack} className="rounded-md hover:bg-muted p-2 -ml-2 shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold tracking-tight-display truncate">{campaign?.name ?? "Loading..."}</h1>
          {campaign && (() => {
            const effStatus = effectiveStatus(campaign);
            return (
            <div className="flex items-center gap-2 mt-0.5 text-xs flex-wrap">
              <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold uppercase tracking-wider text-[10px]",
                effStatus === "completed" ? "bg-emerald-100 text-emerald-700" :
                effStatus === "running" ? "bg-amber-100 text-amber-800" :
                effStatus === "failed" ? "bg-rose-100 text-rose-700" :
                effStatus === "cancelled" ? "bg-zinc-100 text-zinc-700" :
                "bg-blue-100 text-blue-700"
              )}>
                {effStatus === "failed" && campaign.status === "completed" ? "Gagal" : campaign.status}
              </span>
              <span className="text-muted-foreground">
                Dibuat: {new Date(campaign.createdAt).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            );
          })()}
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {campaign?.status === "running" && (
            <Button size="sm" variant="ghost" onClick={() => { if (confirm("Cancel broadcast?")) cancelMut.mutate(); }} className="text-rose-600" leftIcon={<XCircle className="h-3.5 w-3.5" />}>
              Cancel
            </Button>
          )}
          {(campaign?.failedCount ?? 0) > 0 && campaign?.status === "completed" && (
            <Button size="sm" variant="ghost-primary" onClick={() => retryMut.mutate()} loading={retryMut.isPending} leftIcon={<Send className="h-3.5 w-3.5" />}>
              Retry Failed ({campaign.failedCount})
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={exportCsv} leftIcon={<Eye className="h-3.5 w-3.5" />}>
            Export CSV
          </Button>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="rounded-lg border bg-card p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total Recipient</div>
          <div className="text-2xl font-black tabular-nums">{campaign?.audienceCount ?? counts.total}</div>
        </div>
        <div className="rounded-lg border bg-emerald-50/40 border-emerald-200 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">✓ Terkirim</div>
          <div className="text-2xl font-black tabular-nums text-emerald-900">{counts.sent}</div>
          <div className="text-[10px] text-emerald-700 mt-0.5">
            {campaign?.audienceCount ? `${Math.round((counts.sent / campaign.audienceCount) * 100)}%` : "-"}
          </div>
        </div>
        <div className="rounded-lg border bg-rose-50/40 border-rose-200 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-rose-700">✗ Gagal</div>
          <div className="text-2xl font-black tabular-nums text-rose-900">{counts.failed}</div>
        </div>
        <div className="rounded-lg border bg-amber-50/40 border-amber-200 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700">⏳ Pending</div>
          <div className="text-2xl font-black tabular-nums text-amber-900">{counts.pending + ((counts as any).sending ?? 0)}</div>
        </div>
      </div>

      {/* Campaign meta info */}
      {campaign && (
        <div className="rounded-lg border bg-card p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Informasi Broadcast</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <div className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Oleh:</span>
              <span className="font-semibold">
                {campaign.createdByUser
                  ? <>{campaign.createdByUser.name} <span className="text-muted-foreground font-normal">@{campaign.createdByUser.username}</span>{campaign.createdByUser.role && <span className="ml-1 text-[9px] px-1 rounded bg-zinc-100 text-zinc-700 uppercase">{campaign.createdByUser.role}</span>}</>
                  : (campaign.createdBy ? `User #${campaign.createdBy}` : "System")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <MessageCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Device:</span>
              <span className="font-semibold">
                {campaign.device ? <>{campaign.device.name} <span className="text-muted-foreground font-mono font-normal">({campaign.device.phone})</span></> : "-"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Eye className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Template:</span>
              <span className="font-semibold">{campaign.template?.name ?? `Template #${campaign.templateId}`}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Target:</span>
              <span className="font-semibold capitalize">{campaign.targetType ?? "pelanggan"}</span>
            </div>
            {campaign.startedAt && (
              <div className="flex items-center gap-2">
                <Send className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Mulai:</span>
                <span className="font-semibold">{new Date(campaign.startedAt).toLocaleString("id-ID")}</span>
              </div>
            )}
            {campaign.completedAt && (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Selesai:</span>
                <span className="font-semibold">{new Date(campaign.completedAt).toLocaleString("id-ID")}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recipients table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-bold text-sm flex-1">Detail Penerima</h2>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Cari nama / phone / error..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 text-sm h-8" />
            </div>
          </div>

          {/* Status tabs */}
          <div className="flex items-center gap-1 mt-2 overflow-x-auto no-scrollbar -mx-4 md:mx-0 px-4 md:px-0">
            {([
              { val: "all" as const,     label: "Semua",   count: counts.total },
              { val: "sent" as const,    label: "✓ Terkirim", count: counts.sent },
              { val: "failed" as const,  label: "✗ Gagal", count: counts.failed },
              { val: "pending" as const, label: "Pending", count: counts.pending },
              { val: "skipped" as const, label: "Skipped", count: counts.skipped },
            ]).map(t => (
              <button
                key={t.val}
                onClick={() => setStatusTab(t.val)}
                className={cn(
                  "px-3 py-1.5 rounded text-[11px] font-bold uppercase tracking-wider transition whitespace-nowrap shrink-0",
                  statusTab === t.val ? "bg-primary text-primary-foreground" : "hover:bg-muted/40 text-muted-foreground"
                )}
              >
                {t.label} <span className="opacity-70">({t.count})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {filteredRecipients.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground italic">
            {search ? "Tidak ada match" : statusTab === "all" ? "Belum ada penerima" : `Tidak ada penerima dengan status "${statusTab}"`}
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-muted/30 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left w-10">NO</th>
                <th className="px-3 py-2 text-left">NAMA</th>
                <th className="px-3 py-2 text-left">PHONE</th>
                <th className="px-3 py-2 text-left">STATUS</th>
                <th className="px-3 py-2 text-left">TIMESTAMP</th>
                <th className="px-3 py-2 text-left">ERROR / KETERANGAN</th>
                <th className="px-3 py-2 text-right">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredRecipients.map((r, i) => {
                const cfg = statusConfig[r.status] ?? { label: r.status, cls: "bg-zinc-100 text-zinc-700" };
                return (
                  <tr key={r.id} className="hover:bg-muted/30 transition">
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2 font-semibold">{r.customerName ?? "-"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.phone}</td>
                    <td className="px-3 py-2">
                      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider", cfg.cls)}>
                        {cfg.label}
                      </span>
                      {r.retryCount > 0 && <span className="ml-1 text-[10px] text-muted-foreground">×{r.retryCount + 1}</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                      {r.sentAt
                        ? new Date(r.sentAt).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })
                        : "-"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.errorMessage ? (
                        <span className="text-rose-700 line-clamp-2">{r.errorMessage}</span>
                      ) : r.status === "sent" ? (
                        <span className="text-emerald-700 text-[10px]">{(() => {
                          try { const p = JSON.parse(r.mpwaResponse ?? "{}"); return p.mode ? `mode: ${p.mode}` : "OK"; }
                          catch { return "OK"; }
                        })()}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button size="xs" variant="ghost" onClick={() => setSelectedRecipient(r)} leftIcon={<Eye className="h-3 w-3" />}>
                        Pesan
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
        <div className="px-4 py-2 border-t bg-muted/10 text-[11px] text-muted-foreground">
          Menampilkan {filteredRecipients.length} dari {recipients.length} recipient
          {recipients.length === 500 && " (limit 500 - refine search untuk lihat data spesifik)"}
        </div>
      </div>

      {/* Recipient detail modal */}
      <Dialog open={!!selectedRecipient} onOpenChange={(o) => { if (!o) setSelectedRecipient(null); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">{selectedRecipient?.customerName}</DialogTitle>
            <div className="text-xs font-mono text-muted-foreground">{selectedRecipient?.phone}</div>
          </DialogHeader>
          {selectedRecipient && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-x-3 gap-y-1.5">
                <div className="text-muted-foreground">Status:</div>
                <div className="col-span-2 font-bold">{selectedRecipient.status}</div>
                <div className="text-muted-foreground">Sent at:</div>
                <div className="col-span-2 font-mono">{selectedRecipient.sentAt ?? "-"}</div>
                <div className="text-muted-foreground">Retry:</div>
                <div className="col-span-2 font-mono">{selectedRecipient.retryCount}</div>
                {selectedRecipient.customerId && (
                  <>
                    <div className="text-muted-foreground">Customer ID:</div>
                    <div className="col-span-2 font-mono">{selectedRecipient.customerId}</div>
                  </>
                )}
              </div>

              {selectedRecipient.errorMessage && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-rose-700 mb-1">Error</div>
                  <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-rose-900 font-mono text-[11px]">
                    {selectedRecipient.errorMessage}
                  </div>
                </div>
              )}

              {selectedRecipient.mpwaResponse && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">MPWA Response</div>
                  <pre className="rounded-md bg-muted/40 px-3 py-2 text-[10px] font-mono whitespace-pre-wrap leading-tight max-h-32 overflow-y-auto">
                    {(() => {
                      try { return JSON.stringify(JSON.parse(selectedRecipient.mpwaResponse!), null, 2); }
                      catch { return selectedRecipient.mpwaResponse; }
                    })()}
                  </pre>
                </div>
              )}

              {selectedRecipient.renderedMessage && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Pesan Yang Dikirim</div>
                  <div className="rounded-md bg-muted/30 border px-3 py-2 text-[11px] whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {selectedRecipient.renderedMessage}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSelectedRecipient(null)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
