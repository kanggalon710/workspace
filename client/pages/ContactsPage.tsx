import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  LEAD_STAGE_LABELS, LEAD_STAGE_COLORS, LEAD_CATEGORY_LABELS,
  type Lead, type LeadStage, type LeadActivity,
} from "../../shared/schema";
import {
  Search, Phone, MapPin, EyeOff, User, X, MessageSquare, PhoneCall,
  Navigation, StickyNote, ArrowRight, ChevronRight, Download,
  Home, Briefcase, Building2, GraduationCap, HelpCircle,
  CircleDot, MapPinned, Contact as ContactIcon,
} from "lucide-react";
import { exportLeads } from "@/lib/exportUtils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer } from "@/components/ui/page-container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { EmptyUsers, EmptySearch } from "@/components/illustrations";
import { SkeletonList } from "@/components/ui/skeleton";

// -- Category config (theme-aware) ------------------------------------------
const CAT_CONFIG: Record<string, {
  icon: any; iconCls: string; bgCls: string; avatarBg: string;
}> = {
  rumahan: {
    icon: Home,
    iconCls: "text-success",
    bgCls: "bg-success/10",
    avatarBg: "bg-gradient-to-br from-emerald-400 to-green-600",
  },
  bisnis: {
    icon: Briefcase,
    iconCls: "text-warning",
    bgCls: "bg-warning/10",
    avatarBg: "bg-gradient-to-br from-amber-400 to-orange-600",
  },
  perkantoran: {
    icon: Building2,
    iconCls: "text-info",
    bgCls: "bg-info/10",
    avatarBg: "bg-gradient-to-br from-sky-400 to-blue-600",
  },
  sekolah: {
    icon: GraduationCap,
    iconCls: "text-chart-4",
    bgCls: "bg-chart-4/10",
    avatarBg: "bg-gradient-to-br from-violet-400 to-purple-600",
  },
  lainnya: {
    icon: HelpCircle,
    iconCls: "text-muted-foreground",
    bgCls: "bg-muted",
    avatarBg: "bg-gradient-to-br from-slate-400 to-slate-600",
  },
};

const ACTIVITY_CFG: Record<string, {
  label: string; icon: any; iconCls: string; bgCls: string;
}> = {
  note: { label: "Catatan", icon: StickyNote, iconCls: "text-muted-foreground", bgCls: "bg-muted" },
  call: { label: "Telepon", icon: PhoneCall, iconCls: "text-info", bgCls: "bg-info/10" },
  whatsapp: { label: "WhatsApp", icon: MessageSquare, iconCls: "text-success", bgCls: "bg-success/10" },
  visit: { label: "Kunjungan", icon: Navigation, iconCls: "text-chart-4", bgCls: "bg-chart-4/10" },
  stage_change: { label: "Pindah Stage", icon: ArrowRight, iconCls: "text-warning", bgCls: "bg-warning/10" },
  assigned: { label: "Ditugaskan", icon: User, iconCls: "text-chart-6", bgCls: "bg-chart-6/10" },
};

const SOURCE_CONFIG: Record<string, {
  label: string; icon: any; iconCls: string; bgCls: string;
}> = {
  canvassing: { label: "Canvassing", icon: MapPinned, iconCls: "text-chart-4", bgCls: "bg-chart-4/10" },
  prospect_finder: { label: "Finder", icon: Search, iconCls: "text-info", bgCls: "bg-info/10" },
  referral: { label: "Referral", icon: User, iconCls: "text-warning", bgCls: "bg-warning/10" },
  inbound: { label: "Inbound", icon: PhoneCall, iconCls: "text-success", bgCls: "bg-success/10" },
};

interface ContactLead extends Lead {
  odpName?: string | null;
}
interface LeadDetail extends Lead { activities?: LeadActivity[] }

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// -- Contact Detail Drawer --------------------------------------------------
function ContactDetail({ lead, onClose }: { lead: ContactLead; onClose: () => void }) {
  const qc = useQueryClient();
  const [newNote, setNewNote] = useState("");
  const [noteType, setNoteType] = useState<"note" | "call" | "whatsapp" | "visit">("note");

  const { data: detail } = useQuery<LeadDetail>({
    queryKey: ["lead_detail", lead.id],
    queryFn: () => api.get<LeadDetail>(`/marketing/leads/${lead.id}`),
  });

  const addNote = useMutation({
    mutationFn: (d: { type: string; content: string }) => api.post(`/marketing/leads/${lead.id}/activity`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead_detail", lead.id] });
      setNewNote("");
      toast.success("Catatan ditambahkan");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const activities = detail?.activities ?? [];
  const catCfg = CAT_CONFIG[lead.category ?? "lainnya"] ?? CAT_CONFIG.lainnya;
  const CatIcon = catCfg.icon;
  const stageColor = LEAD_STAGE_COLORS[lead.stage as LeadStage] ?? "#64748b";
  const srcCfg = SOURCE_CONFIG[lead.source] ?? SOURCE_CONFIG.canvassing;
  const SrcIcon = srcCfg.icon;

  return (
    <div className="fixed inset-0 z-[70] flex animate-fade-in">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md h-full flex flex-col overflow-hidden bg-background shadow-2xl border-l border-border animate-slide-in-right">
        {/* Header */}
        <div className="p-5 border-b border-border bg-gradient-to-br from-muted/40 to-background shrink-0">
          <div className="flex items-start gap-3">
            <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0", catCfg.bgCls)}>
              <CatIcon className={cn("h-6 w-6", catCfg.iconCls)} strokeWidth={2.25} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-black tracking-tight-display text-foreground">{lead.name}</h2>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <span
                  className="inline-flex items-center text-2xs px-2 py-0.5 rounded font-black text-white uppercase tracking-wider"
                  style={{ background: stageColor }}
                >
                  {LEAD_STAGE_LABELS[lead.stage as LeadStage]}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-2xs px-2 py-0.5 rounded font-bold uppercase tracking-wider",
                    srcCfg.bgCls,
                    srcCfg.iconCls
                  )}
                >
                  <SrcIcon className="h-2.5 w-2.5" />
                  {srcCfg.label}
                </span>
                {lead.odpName && (
                  <span className="text-2xs flex items-center gap-0.5 text-muted-foreground font-mono-tight">
                    <CircleDot className="h-2.5 w-2.5" /> {lead.odpName}
                  </span>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              aria-label="Tutup"
            >
              <X />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Contact Info */}
          <div className="p-5 border-b border-border/40">
            <p className="text-2xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Informasi Kontak</p>
            <div className="space-y-2.5">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40">
                <Phone className="h-4 w-4 shrink-0 text-primary" />
                {lead.phone && lead.phone !== "••••••••" ? (
                  <div className="flex-1 min-w-0">
                    <a
                      href={`tel:${lead.phone}`}
                      className="text-sm font-mono-tight font-bold text-foreground hover:underline"
                    >
                      {lead.phone}
                    </a>
                    <div className="flex gap-1.5 mt-1.5">
                      <a
                        href={`tel:${lead.phone}`}
                        className="inline-flex items-center gap-1 text-2xs font-bold uppercase tracking-wider px-2 py-1 rounded bg-info/15 text-info hover:bg-info/25 transition-colors"
                      >
                        <PhoneCall className="h-2.5 w-2.5" /> Telepon
                      </a>
                      <a
                        href={`https://wa.me/${lead.phone?.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-2xs font-bold uppercase tracking-wider px-2 py-1 rounded bg-success/15 text-success hover:bg-success/25 transition-colors"
                      >
                        <MessageSquare className="h-2.5 w-2.5" /> WhatsApp
                      </a>
                    </div>
                  </div>
                ) : (
                  <span className="text-sm italic flex items-center gap-1 text-muted-foreground">
                    <EyeOff className="h-3.5 w-3.5" />
                    {lead.phone === "••••••••" ? "Belum di-assign ke Anda" : "Tidak ada telepon"}
                  </span>
                )}
              </div>
              <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/40">
                <MapPin className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                <div className="flex-1 min-w-0">
                  {lead.address && !lead.address.startsWith("•••") ? (
                    <p className="text-sm text-foreground">{lead.address}</p>
                  ) : (
                    <p className="text-sm italic text-muted-foreground">Alamat tersembunyi</p>
                  )}
                  {lead.district && (
                    <p className="text-xs mt-0.5 text-muted-foreground">
                      {lead.village ? `${lead.village}, ` : ""}
                      {lead.district}
                    </p>
                  )}
                  {lead.distanceMeters != null && (
                    <p className="text-xs text-muted-foreground/80">
                      Jarak ODP: <span className="font-bold text-primary tabular-nums">{lead.distanceMeters}m</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Log */}
          <div className="p-5 border-b border-border/40">
            <p className="text-2xs font-bold uppercase tracking-widest text-muted-foreground mb-2.5">Catat Aktivitas</p>
            <div className="flex gap-1.5 flex-wrap mb-2.5">
              {(["note", "call", "whatsapp", "visit"] as const).map(t => {
                const cfg = ACTIVITY_CFG[t];
                const Icon = cfg.icon;
                const active = noteType === t;
                return (
                  <button
                    key={t}
                    onClick={() => setNoteType(t)}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg font-semibold transition-all",
                      active
                        ? `${cfg.bgCls} ${cfg.iconCls} ring-1 ring-current/20`
                        : "bg-muted text-muted-foreground hover:bg-muted/70"
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder={`Tulis ${ACTIVITY_CFG[noteType].label.toLowerCase()}...`}
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && newNote.trim())
                    addNote.mutate({ type: noteType, content: newNote.trim() });
                }}
                className="flex-1"
              />
              <Button
                onClick={() => {
                  if (newNote.trim()) addNote.mutate({ type: noteType, content: newNote.trim() });
                }}
                disabled={addNote.isPending || !newNote.trim()}
                loading={addNote.isPending}
                variant="gradient"
                size="default"
              >
                Kirim
              </Button>
            </div>
          </div>

          {/* Activity Timeline */}
          <div className="p-5">
            <p className="text-2xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Riwayat Interaksi</p>
            {activities.length === 0 ? (
              <EmptyState
                icon={StickyNote}
                title="Belum ada riwayat"
                description="Aktivitas kontak akan tercatat di sini."
                size="sm"
              />
            ) : (
              <div className="space-y-2.5">
                {[...activities].reverse().map(act => {
                  const cfg = ACTIVITY_CFG[act.type] ?? ACTIVITY_CFG.note;
                  const Icon = cfg.icon;
                  let content = act.content ?? "";
                  if (act.type === "stage_change") {
                    try {
                      const p = JSON.parse(content);
                      content = `${LEAD_STAGE_LABELS[p.from as LeadStage] ?? p.from} → ${LEAD_STAGE_LABELS[p.to as LeadStage] ?? p.to}`;
                    } catch {}
                  }
                  return (
                    <div key={act.id} className="flex gap-2.5">
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", cfg.bgCls)}>
                        <Icon className={cn("h-3.5 w-3.5", cfg.iconCls)} strokeWidth={2.25} />
                      </div>
                      <div className="flex-1 min-w-0 pb-2.5 border-b border-border/40 last:border-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-foreground">{cfg.label}</span>
                          <span className="text-2xs text-muted-foreground ml-auto">{fmtDateTime(act.createdAt)}</span>
                        </div>
                        {content && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{content}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// -- Main Page --------------------------------------------------------------
export default function ContactsPage() {
  const { user } = useAuth();
  const isSupervisor = user?.role === "System-Admin"
                    || user?.role === "Admin"
                    || user?.role === "admin"
                    || user?.role === "Administrator" /* legacy */
                    || user?.role === "marketing_spv";
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [selectedLead, setSelectedLead] = useState<ContactLead | null>(null);

  const { data: contacts = [], isLoading } = useQuery<ContactLead[]>({
    queryKey: ["marketing_contacts"],
    queryFn: () => api.get<ContactLead[]>("/marketing/contacts"),
    refetchInterval: 60_000,
  });

  const sourceCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of contacts) {
      map[c.source] = (map[c.source] ?? 0) + 1;
    }
    return map;
  }, [contacts]);

  const filtered = useMemo(() => {
    let list = contacts;
    if (sourceFilter !== "all") list = list.filter(l => l.source === sourceFilter);
    if (catFilter !== "all") list = list.filter(l => (l.category ?? "lainnya") === catFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(l =>
        l.name.toLowerCase().includes(q) ||
        l.phone?.toLowerCase().includes(q) ||
        l.address?.toLowerCase().includes(q) ||
        l.district?.toLowerCase().includes(q) ||
        l.odpName?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [contacts, sourceFilter, catFilter, search]);

  const isFinderView = sourceFilter === "prospect_finder";

  const groupedByOdp = useMemo(() => {
    if (!isFinderView) return [];
    const map = new Map<string, ContactLead[]>();
    for (const c of filtered) {
      const key = c.odpName ?? "Tanpa ODP";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered, isFinderView]);

  const groupedByLetter = useMemo(() => {
    if (isFinderView) return [];
    const map = new Map<string, ContactLead[]>();
    for (const c of filtered) {
      const letter = c.name.charAt(0).toUpperCase();
      if (!map.has(letter)) map.set(letter, []);
      map.get(letter)!.push(c);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered, isFinderView]);

  const grouped = isFinderView ? groupedByOdp : groupedByLetter;

  return (
    <PageContainer>
      <PageHeader
        icon={ContactIcon}
        title="Database Kontak"
        description={
          isSupervisor
            ? `${filtered.length} kontak · Semua tim marketing`
            : `${filtered.length} kontak terdaftar`
        }
        accent="info"
        actions={
          <Button
            variant="outline-primary"
            size="sm"
            leftIcon={<Download />}
            onClick={() => exportLeads(filtered)}
            disabled={filtered.length === 0}
          >
            Export
          </Button>
        }
      />

      {/* === Filter & Search Bar === */}
      <Card padding="md" className="sticky top-14 md:top-16 z-20 bg-background/90 backdrop-blur-md">
        <div className="space-y-3">
          {/* Search */}
          <Input
            type="text"
            inputSize="lg"
            leftIcon={<Search />}
            placeholder="Cari nama, telepon, alamat, atau ODP..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          {/* Source filter */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setSourceFilter("all")}
              className={cn(
                "shrink-0 h-8 px-3 rounded-full text-xs font-bold uppercase tracking-wider transition-colors",
                sourceFilter === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              )}
            >
              Semua ({contacts.length})
            </button>
            {Object.entries(SOURCE_CONFIG).map(([key, cfg]) => {
              const count = sourceCounts[key] ?? 0;
              if (count === 0) return null;
              const Icon = cfg.icon;
              const active = sourceFilter === key;
              return (
                <button
                  key={key}
                  onClick={() => setSourceFilter(key)}
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-bold uppercase tracking-wider transition-colors",
                    active
                      ? `${cfg.bgCls} ${cfg.iconCls} ring-1 ring-current/20`
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {cfg.label} <span className="tabular-nums opacity-80">({count})</span>
                </button>
              );
            })}
          </div>

          {/* Category filter */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setCatFilter("all")}
              className={cn(
                "shrink-0 h-7 px-2.5 rounded-full text-2xs font-bold uppercase tracking-wider transition-colors",
                catFilter === "all"
                  ? "bg-foreground text-background"
                  : "bg-background border border-border text-muted-foreground hover:bg-muted"
              )}
            >
              Semua Kategori
            </button>
            {Object.entries(CAT_CONFIG).map(([cat, cfg]) => {
              const subset = sourceFilter === "all" ? contacts : contacts.filter(l => l.source === sourceFilter);
              const count = subset.filter(l => (l.category ?? "lainnya") === cat).length;
              if (count === 0) return null;
              const active = catFilter === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setCatFilter(cat)}
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-2xs font-bold uppercase tracking-wider transition-colors",
                    active
                      ? `${cfg.bgCls} ${cfg.iconCls} ring-1 ring-current/25`
                      : "bg-background border border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", active ? "bg-current" : cfg.iconCls.replace("text-", "bg-"))} />
                  {(LEAD_CATEGORY_LABELS[cat as keyof typeof LEAD_CATEGORY_LABELS] ?? cat).split("/")[0]}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* === Contact List === */}
      {isLoading ? (
        <SkeletonList count={8} />
      ) : filtered.length === 0 ? (
        <Card padding="none">
          <EmptyState
            illustration={search.trim() ? <EmptySearch /> : <EmptyUsers />}
            title="Tidak ada kontak ditemukan"
            description={
              search.trim()
                ? `Pencarian "${search}" tidak menghasilkan apa-apa.`
                : sourceFilter === "prospect_finder"
                  ? "Simpan prospek dari Prospect Finder untuk mulai build database."
                  : "Tambahkan lead dari Canvassing atau Prospect Finder."
            }
            size="md"
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {grouped.map(([groupLabel, leads]) => (
            <section key={groupLabel}>
              <div className="flex items-center gap-2 mb-2 px-1">
                {isFinderView && <CircleDot className="h-3 w-3 text-primary shrink-0" />}
                <p className="text-2xs font-bold uppercase tracking-widest text-muted-foreground">
                  {groupLabel}
                </p>
                <span className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full bg-muted text-2xs font-black text-muted-foreground tabular-nums">
                  {leads.length}
                </span>
                <div className="flex-1 h-px bg-border/40" />
              </div>
              <div className="space-y-2">
                {leads.map(lead => {
                  const catCfg = CAT_CONFIG[lead.category ?? "lainnya"] ?? CAT_CONFIG.lainnya;
                  const stageColor = LEAD_STAGE_COLORS[lead.stage as LeadStage] ?? "#64748b";
                  const srcCfg = SOURCE_CONFIG[lead.source] ?? SOURCE_CONFIG.canvassing;
                  return (
                    <button
                      key={lead.id}
                      onClick={() => setSelectedLead(lead)}
                      className="w-full flex items-center gap-3 p-3 md:p-4 rounded-xl border border-border bg-card hover:border-primary/30 hover:shadow-elev-md transition-all active:scale-[0.99] text-left"
                    >
                      {/* Avatar */}
                      <div className={cn(
                        "w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-white text-sm font-black shadow-elev-sm",
                        catCfg.avatarBg
                      )}>
                        {lead.name.charAt(0).toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold leading-tight truncate text-foreground tracking-tight">
                          {lead.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {lead.phone && lead.phone !== "••••••••" ? (
                            <span className="text-xs font-mono-tight text-muted-foreground">{lead.phone}</span>
                          ) : lead.phone === "••••••••" ? (
                            <span className="text-xs italic flex items-center gap-0.5 text-muted-foreground/70">
                              <EyeOff className="h-3 w-3" /> Tersembunyi
                            </span>
                          ) : (
                            <span className="text-xs italic text-muted-foreground/70">Tanpa telepon</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span
                            className={cn(
                              "inline-flex items-center text-2xs px-1.5 py-0.5 rounded font-bold uppercase tracking-wider",
                              srcCfg.bgCls,
                              srcCfg.iconCls
                            )}
                          >
                            {srcCfg.label}
                          </span>
                          {!isFinderView && lead.odpName && (
                            <span className="text-2xs flex items-center gap-0.5 truncate text-muted-foreground font-mono-tight">
                              <CircleDot className="h-2.5 w-2.5 shrink-0" /> {lead.odpName}
                            </span>
                          )}
                          {lead.district && !lead.odpName && (
                            <span className="text-2xs truncate text-muted-foreground">{lead.district}</span>
                          )}
                        </div>
                      </div>

                      {/* Right side */}
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className="text-2xs px-2 py-0.5 rounded font-black text-white uppercase tracking-wider"
                          style={{ background: stageColor }}
                        >
                          {LEAD_STAGE_LABELS[lead.stage as LeadStage]}
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Detail Sheet */}
      {selectedLead && (
        <ContactDetail lead={selectedLead} onClose={() => setSelectedLead(null)} />
      )}
    </PageContainer>
  );
}
