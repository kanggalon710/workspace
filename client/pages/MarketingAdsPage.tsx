import { useState } from "react";
import { formatRupiah } from "@shared/currency";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Megaphone, Users, Trophy, UserCheck, Percent,
  Download, FileJson, Copy, ChevronDown, ChevronUp,
  Webhook, Info, Loader2, Plus, Zap, Trash2, Pencil, RefreshCw, ExternalLink,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

// -- Types ------------------------------------------------------------------

interface OdpCluster {
  clusterName: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  odpCount: number;
  portKosong: number;
  portTotal: number;
  utilisasi: number;
  budgetRecommendation: number;
  district: string;
  odpList: string[];
  priority: "high" | "medium" | "low" | "skip";
}

interface AdsStats {
  totalLeadsFromAds: number;
  thisMonthLeads: number;
  wonLeads: number;
  convertedCustomers: number;
  conversionRate: number;
  bySource: { meta: number; tiktok: number; google: number; landing: number };
}

interface AdCampaign {
  id: number;
  platform: string;
  campaignName: string;
  externalId: string | null;
  status: string | null;
  objective: string | null;
  dateStart: string | null;
  dateEnd: string | null;
  budgetDaily: number | null;
  budgetTotal: number | null;
  spendTotal: number | null;
  impressions: number | null;
  clicks: number | null;
  leadsFromAd: number | null;
  conversions: number | null;
  revenue: number | null;
  utmSource: string | null;
  utmCampaign: string | null;
  linkUrl: string | null;
  thumbnailUrl: string | null;
  notes: string | null;
  createdByApiKeyId: number | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
  // Computed
  ctr?: number | null;
  cpl?: number | null;
  conversionRate?: number | null;
  roas?: number | null;
}

const PLATFORM_LABELS: Record<string, { label: string; color: string }> = {
  meta_ads:     { label: "Meta Ads",    color: "bg-blue-100 text-blue-700" },
  tiktok_ads:   { label: "TikTok Ads",  color: "bg-slate-900 text-white" },
  google_ads:   { label: "Google Ads",  color: "bg-green-100 text-green-700" },
  landing_page: { label: "Landing",     color: "bg-purple-100 text-purple-700" },
  other:        { label: "Other",       color: "bg-gray-100 text-gray-700" },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: "Active",  color: "bg-green-100 text-green-700 border-green-200" },
  paused: { label: "Paused",  color: "bg-amber-100 text-amber-700 border-amber-200" },
  ended:  { label: "Ended",   color: "bg-gray-100 text-gray-700 border-gray-200" },
};

// -- Helpers ----------------------------------------------------------------

function formatRp(n: number): string {
  return formatRupiah(n);
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
  toast.success("Disalin ke clipboard");
}

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// -- Priority helpers ------------------------------------------------------

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-green-100 text-green-700",
  medium: "bg-blue-100 text-blue-700",
  low: "bg-amber-100 text-amber-700",
  skip: "bg-red-100 text-red-700 line-through",
};

const PRIORITY_LABELS: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  skip: "Skip",
};

function utilisasiColor(pct: number): string {
  if (pct < 50) return "text-green-600";
  if (pct <= 75) return "text-amber-600";
  return "text-red-600";
}

function utilisasiBarColor(pct: number): string {
  if (pct < 50) return "bg-green-500";
  if (pct <= 75) return "bg-amber-500";
  return "bg-red-500";
}

// -- Component -------------------------------------------------------------

export default function MarketingAdsPage() {
  const qc = useQueryClient();
  const [expandedCluster, setExpandedCluster] = useState<string | null>(null);
  const [showPanduan, setShowPanduan] = useState(false);

  // Campaign dialog state
  const [campaignDialog, setCampaignDialog] = useState<null | { mode: "create" | "edit"; draft: Partial<AdCampaign> }>(null);

  // Fetch stats
  const { data: stats, isLoading: statsLoading } = useQuery<AdsStats>({
    queryKey: ["marketing_ads_stats"],
    queryFn: () => api.get<AdsStats>("/marketing/ads/stats"),
  });

  // Fetch campaigns
  const { data: campaigns, isLoading: campaignsLoading, refetch: refetchCampaigns } = useQuery<AdCampaign[]>({
    queryKey: ["marketing_ads_campaigns"],
    queryFn: () => api.get<AdCampaign[]>("/marketing/ads/campaigns"),
    refetchInterval: 60_000,
  });

  const saveCampaignMut = useMutation({
    mutationFn: (d: Partial<AdCampaign>) => {
      if (d.id) return api.patch<AdCampaign>(`/marketing/ads/campaigns/${d.id}`, d);
      return api.post<AdCampaign>("/marketing/ads/campaigns", d);
    },
    onSuccess: () => {
      toast.success("Campaign tersimpan");
      qc.invalidateQueries({ queryKey: ["marketing_ads_campaigns"] });
      setCampaignDialog(null);
    },
    onError: (e: any) => toast.error(e.message || "Gagal simpan"),
  });

  const deleteCampaignMut = useMutation({
    mutationFn: (id: number) => api.delete(`/marketing/ads/campaigns/${id}`),
    onSuccess: () => {
      toast.success("Campaign dihapus");
      qc.invalidateQueries({ queryKey: ["marketing_ads_campaigns"] });
    },
    onError: (e: any) => toast.error(e.message || "Gagal hapus"),
  });

  // Fetch clusters
  const { data: clusters, isLoading: clustersLoading } = useQuery<OdpCluster[]>({
    queryKey: ["marketing_geo_targets"],
    queryFn: () => api.get<OdpCluster[]>("/marketing/audience/geo-targets"),
  });

  // Download handlers
  function handleExcludeDownload() {
    window.open("/api/marketing/audience/exclude", "_blank");
    toast.success("Mengunduh file Exclude Audience...");
  }

  function handleLookalikeDownload() {
    window.open("/api/marketing/audience/lookalike", "_blank");
    toast.success("Mengunduh file Lookalike Seed...");
  }

  async function handleGeoTargetDownload() {
    try {
      const data = await api.get<OdpCluster[]>("/marketing/audience/geo-targets");
      downloadJson(data, "geo-targets.json");
      toast.success("File geo-targets.json berhasil diunduh");
    } catch {
      toast.error("Gagal mengunduh geo-targets");
    }
  }

  // Summary calculations
  const totalClusters = clusters?.length ?? 0;
  const totalPortKosong = clusters?.reduce((s, c) => s + c.portKosong, 0) ?? 0;
  const totalBudget = clusters?.reduce((s, c) => s + c.budgetRecommendation, 0) ?? 0;

  const webhookBaseUrl = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="min-h-screen bg-gray-50/50 p-4 md:p-6 space-y-6 max-w-7xl mx-auto">

      {/* -- Header --------------------------------------------------------- */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-lg bg-orange-100">
            <Megaphone className="h-6 w-6 text-orange-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Marketing Ads</h1>
            <p className="text-sm text-muted-foreground">
              Tools periklanan terukur berdasarkan data infrastruktur &amp; pelanggan
            </p>
          </div>
        </div>
      </div>

      {/* -- Section A: Performa & KPI ----------------------------------- */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Performa &amp; KPI</h2>

        {statsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : stats ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Lead dari Ads */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-100">
                      <Users className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Lead dari Ads</p>
                      <p className="text-2xl font-bold">{stats.thisMonthLeads}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Closing */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-100">
                      <Trophy className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Closing</p>
                      <p className="text-2xl font-bold">{stats.wonLeads}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Konversi ke Pelanggan */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-100">
                      <UserCheck className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Konversi ke Pelanggan</p>
                      <p className="text-2xl font-bold">{stats.convertedCustomers}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Conversion Rate */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-100">
                      <Percent className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Conversion Rate</p>
                      <p className="text-2xl font-bold">{stats.conversionRate}%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Source breakdown */}
            <div className="flex flex-wrap gap-2 mt-3">
              <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">
                Meta: {stats.bySource.meta}
              </Badge>
              <Badge variant="secondary" className="bg-slate-50 text-slate-700 border-slate-200">
                TikTok: {stats.bySource.tiktok}
              </Badge>
              <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200">
                Google: {stats.bySource.google}
              </Badge>
              <Badge variant="secondary" className="bg-purple-50 text-purple-700 border-purple-200">
                Landing: {stats.bySource.landing}
              </Badge>
            </div>
          </>
        ) : null}
      </div>

      {/* -- Section A2: Campaign Tracker --------------------------------- */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-semibold">Campaign Tracker</h2>
            <p className="text-xs text-muted-foreground">
              Data campaign Meta / TikTok / Google Ads - bisa di-input manual atau push otomatis via Public API.
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => refetchCampaigns()} disabled={campaignsLoading}>
              {campaignsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button
              size="sm"
              onClick={() => setCampaignDialog({ mode: "create", draft: { platform: "meta_ads", status: "active" } })}
            >
              <Plus className="h-4 w-4 mr-1" /> Tambah Campaign
            </Button>
          </div>
        </div>

        {campaignsLoading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : !campaigns || campaigns.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              <Megaphone className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              Belum ada campaign terdaftar. Tambah manual atau push data via{" "}
              <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">POST /api/public/v1/marketing/campaigns</code>
              {" "}dengan scope <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">marketing:write</code>.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {/* Desktop: table */}
            <div className="hidden md:block">
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/30 border-b">
                        <tr className="text-left">
                          <th className="py-2 px-3 font-semibold text-xs uppercase tracking-wider">Platform</th>
                          <th className="py-2 px-3 font-semibold text-xs uppercase tracking-wider">Campaign</th>
                          <th className="py-2 px-3 font-semibold text-xs uppercase tracking-wider text-right">Spend</th>
                          <th className="py-2 px-3 font-semibold text-xs uppercase tracking-wider text-right">Impr</th>
                          <th className="py-2 px-3 font-semibold text-xs uppercase tracking-wider text-right">Clicks</th>
                          <th className="py-2 px-3 font-semibold text-xs uppercase tracking-wider text-right">CTR</th>
                          <th className="py-2 px-3 font-semibold text-xs uppercase tracking-wider text-right">Leads</th>
                          <th className="py-2 px-3 font-semibold text-xs uppercase tracking-wider text-right">CPL</th>
                          <th className="py-2 px-3 font-semibold text-xs uppercase tracking-wider text-right">Conv</th>
                          <th className="py-2 px-3 font-semibold text-xs uppercase tracking-wider text-right">ROAS</th>
                          <th className="py-2 px-3 font-semibold text-xs uppercase tracking-wider">Status</th>
                          <th className="py-2 px-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {campaigns.map((c) => {
                          const plat = PLATFORM_LABELS[c.platform] ?? PLATFORM_LABELS.other;
                          const st = STATUS_LABELS[c.status ?? "active"] ?? STATUS_LABELS.active;
                          const freshSync = c.lastSyncedAt && (Date.now() - new Date(c.lastSyncedAt).getTime()) < 24 * 3600_000;
                          return (
                            <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20">
                              <td className="py-2 px-3">
                                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${plat.color}`}>{plat.label}</span>
                              </td>
                              <td className="py-2 px-3">
                                <div className="font-medium">{c.campaignName}</div>
                                <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                                  {c.externalId && <span className="font-mono">{c.externalId}</span>}
                                  {c.createdByApiKeyId && (
                                    <span className="inline-flex items-center gap-0.5 text-sky-600 dark:text-sky-400" title="Di-push via API key">
                                      <Zap className="h-2.5 w-2.5" />push
                                    </span>
                                  )}
                                  {freshSync && <span className="text-green-600">● fresh</span>}
                                </div>
                              </td>
                              <td className="py-2 px-3 text-right font-mono tabular-nums">{c.spendTotal ? formatRp(c.spendTotal) : "-"}</td>
                              <td className="py-2 px-3 text-right font-mono tabular-nums">{c.impressions ? c.impressions.toLocaleString("id-ID") : "-"}</td>
                              <td className="py-2 px-3 text-right font-mono tabular-nums">{c.clicks ? c.clicks.toLocaleString("id-ID") : "-"}</td>
                              <td className="py-2 px-3 text-right font-mono tabular-nums">{c.ctr != null ? `${c.ctr}%` : "-"}</td>
                              <td className="py-2 px-3 text-right font-mono tabular-nums">{c.leadsFromAd ?? "-"}</td>
                              <td className="py-2 px-3 text-right font-mono tabular-nums">{c.cpl ? formatRp(c.cpl) : "-"}</td>
                              <td className="py-2 px-3 text-right font-mono tabular-nums">{c.conversions ?? "-"}</td>
                              <td className="py-2 px-3 text-right font-mono tabular-nums">{c.roas != null ? `${c.roas}x` : "-"}</td>
                              <td className="py-2 px-3">
                                <Badge variant="outline" className={`text-[10px] ${st.color}`}>{st.label}</Badge>
                              </td>
                              <td className="py-2 px-3">
                                <div className="flex gap-1">
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setCampaignDialog({ mode: "edit", draft: c })}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                    onClick={() => { if (confirm(`Hapus campaign "${c.campaignName}"?`)) deleteCampaignMut.mutate(c.id); }}
                                  >
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
                </CardContent>
              </Card>
            </div>

            {/* Mobile: card list */}
            <div className="md:hidden space-y-2">
              {campaigns.map((c) => {
                const plat = PLATFORM_LABELS[c.platform] ?? PLATFORM_LABELS.other;
                const st = STATUS_LABELS[c.status ?? "active"] ?? STATUS_LABELS.active;
                return (
                  <Card key={c.id}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${plat.color}`}>{plat.label}</span>
                            <Badge variant="outline" className={`text-[10px] ${st.color}`}>{st.label}</Badge>
                            {c.createdByApiKeyId && (
                              <span className="text-sky-600 text-[10px] inline-flex items-center gap-0.5"><Zap className="h-2.5 w-2.5" />push</span>
                            )}
                          </div>
                          <div className="font-medium text-sm truncate">{c.campaignName}</div>
                          {c.externalId && <div className="text-[10px] text-muted-foreground font-mono">{c.externalId}</div>}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setCampaignDialog({ mode: "edit", draft: c })}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => { if (confirm(`Hapus "${c.campaignName}"?`)) deleteCampaignMut.mutate(c.id); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div><div className="text-[10px] text-muted-foreground uppercase">Spend</div><div className="font-mono tabular-nums">{c.spendTotal ? formatRp(c.spendTotal) : "-"}</div></div>
                        <div><div className="text-[10px] text-muted-foreground uppercase">Leads</div><div className="font-mono tabular-nums">{c.leadsFromAd ?? "-"}</div></div>
                        <div><div className="text-[10px] text-muted-foreground uppercase">CPL</div><div className="font-mono tabular-nums">{c.cpl ? formatRp(c.cpl) : "-"}</div></div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick note for bot integration */}
        <Card className="mt-3 border-sky-200 bg-sky-50/50 dark:bg-sky-950/20 dark:border-sky-900">
          <CardContent className="p-3 text-xs flex items-start gap-2">
            <Zap className="h-4 w-4 text-sky-600 shrink-0 mt-0.5" />
            <div className="space-y-1 min-w-0">
              <p className="font-semibold text-foreground">Integrasi bot (e.g. openclaw di Telegram)</p>
              <p className="text-muted-foreground">
                Bikin API key dengan scope <code className="font-mono bg-background border px-1 rounded">marketing:write</code> di{" "}
                <a href="/api-keys" className="text-sky-600 hover:underline">Public API</a>.
                Push data campaign harian via <code className="font-mono bg-background border px-1 rounded">POST /api/public/v1/marketing/campaigns</code>.
                Upsert semantic: kirim <code className="font-mono">externalId</code> → kalau campaign sudah ada, update; kalau belum, create.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* -- Section B: Audience Export ----------------------------------- */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Audience Export</h2>
        <Card>
          <CardContent className="p-5 space-y-5">

            {/* Exclude Audience */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-3">
              <div className="flex-1">
                <p className="font-medium text-sm">Export Exclude Audience</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Pelanggan aktif (jangan tampilkan iklan)
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Format Meta Custom Audience. PII di-hash SHA-256. Upload ke Meta Ads Manager &rarr; Custom Audience &rarr; Customer List.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={handleExcludeDownload} className="shrink-0">
                <Download className="h-4 w-4 mr-1.5" />
                Download CSV
              </Button>
            </div>

            <hr />

            {/* Lookalike Seed */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-3">
              <div className="flex-1">
                <p className="font-medium text-sm">Export Lookalike Seed</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Pelanggan terbaik untuk Lookalike 1%
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Berisi pelanggan aktif dengan value (harga paket). Upload ke Meta &rarr; Lookalike Audience &rarr; Value-based.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={handleLookalikeDownload} className="shrink-0">
                <Download className="h-4 w-4 mr-1.5" />
                Download CSV
              </Button>
            </div>

            <hr />

            {/* Geo-Target */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-3">
              <div className="flex-1">
                <p className="font-medium text-sm">Export Geo-Target</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Koordinat ODP cluster untuk targeting iklan
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Berisi lat/lng + radius per cluster. Gunakan sebagai Drop Pin di Meta Ads Manager.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={handleGeoTargetDownload} className="shrink-0">
                <FileJson className="h-4 w-4 mr-1.5" />
                Download JSON
              </Button>
            </div>

          </CardContent>
        </Card>
      </div>

      {/* -- Section C: ODP Cluster Targeting ---------------------------- */}
      <div>
        <h2 className="text-lg font-semibold mb-3">ODP Cluster Targeting</h2>

        {clustersLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : clusters && clusters.length > 0 ? (
          <>
            {/* Summary bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">Total Cluster</p>
                  <p className="text-xl font-bold">{totalClusters}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">Total Port Kosong</p>
                  <p className="text-xl font-bold">{totalPortKosong.toLocaleString("id-ID")}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">Total Budget</p>
                  <p className="text-xl font-bold">{formatRp(totalBudget)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Table */}
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium">Cluster Name</th>
                      <th className="text-left p-3 font-medium">District</th>
                      <th className="text-center p-3 font-medium">ODP</th>
                      <th className="text-center p-3 font-medium">Port Kosong / Total</th>
                      <th className="text-center p-3 font-medium">Utilisasi</th>
                      <th className="text-center p-3 font-medium">Radius</th>
                      <th className="text-right p-3 font-medium">Budget</th>
                      <th className="text-center p-3 font-medium">Priority</th>
                      <th className="text-center p-3 font-medium">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clusters.map((cluster) => {
                      const isExpanded = expandedCluster === cluster.clusterName;
                      return (
                        <ClusterRow
                          key={cluster.clusterName}
                          cluster={cluster}
                          isExpanded={isExpanded}
                          onToggle={() =>
                            setExpandedCluster(isExpanded ? null : cluster.clusterName)
                          }
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Info text */}
            <div className="flex items-start gap-2 mt-3 text-xs text-muted-foreground">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                Priority ditentukan otomatis berdasarkan utilisasi ODP. Cluster &quot;skip&quot; = ODP sudah penuh.
              </p>
            </div>
          </>
        ) : (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              Tidak ada data cluster tersedia.
            </CardContent>
          </Card>
        )}
      </div>

      {/* -- Section D: Lead Capture Webhook ----------------------------- */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Lead Capture Webhook</h2>
        <Card>
          <CardContent className="p-5 space-y-5">

            {/* Meta webhook */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Webhook className="h-4 w-4 text-blue-600" />
                <p className="font-medium text-sm">Meta Lead Ads Webhook</p>
                <Badge variant="secondary" className="bg-green-100 text-green-700 text-[10px] px-1.5 py-0">
                  Aktif
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-md font-mono break-all">
                  {webhookBaseUrl}/api/webhook/meta-leads
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyToClipboard(`${webhookBaseUrl}/api/webhook/meta-leads`)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Paste URL ini di Meta Business Suite &rarr; Lead Ads &rarr; Webhooks
              </p>
            </div>

            <hr />

            {/* TikTok webhook */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Webhook className="h-4 w-4 text-slate-700" />
                <p className="font-medium text-sm">TikTok Lead Gen Webhook</p>
                <Badge variant="secondary" className="bg-green-100 text-green-700 text-[10px] px-1.5 py-0">
                  Aktif
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-md font-mono break-all">
                  {webhookBaseUrl}/api/webhook/tiktok-leads
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyToClipboard(`${webhookBaseUrl}/api/webhook/tiktok-leads`)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Paste URL ini di TikTok Ads Manager &rarr; Assets &rarr; Lead
              </p>
            </div>

            <hr />

            {/* Panduan Setup */}
            <div>
              <button
                onClick={() => setShowPanduan(!showPanduan)}
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPanduan ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                Panduan Setup
              </button>

              {showPanduan && (
                <div className="mt-3 space-y-4 text-xs text-muted-foreground">
                  <div>
                    <p className="font-medium text-foreground mb-1.5">Meta:</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Buka Meta Business Suite &rarr; Leads Center</li>
                      <li>Pilih &quot;Connect CRM&quot; &rarr; Webhooks</li>
                      <li>Paste webhook URL di atas</li>
                      <li>Test dengan kirim lead dummy</li>
                      <li>Lead otomatis masuk ke Lead Pipeline</li>
                    </ol>
                  </div>
                  <div>
                    <p className="font-medium text-foreground mb-1.5">TikTok:</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Buka TikTok Ads Manager &rarr; Assets &rarr; Lead</li>
                      <li>Pilih &quot;Connect CRM&quot; &rarr; Custom CRM</li>
                      <li>Paste webhook URL</li>
                      <li>Authorize &rarr; Test</li>
                    </ol>
                  </div>
                </div>
              )}
            </div>

          </CardContent>
        </Card>
      </div>

      {/* -- Campaign Dialog (create/edit) ----------------------------- */}
      <Dialog open={!!campaignDialog} onOpenChange={(o) => { if (!o) setCampaignDialog(null); }}>
        <DialogContent className="max-w-2xl dialog-w max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {campaignDialog?.mode === "edit" ? "Edit Campaign" : "Tambah Campaign"}
            </DialogTitle>
          </DialogHeader>
          {campaignDialog && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Platform *</Label>
                  <select
                    className="w-full border rounded-md h-9 px-2 text-sm bg-background"
                    value={campaignDialog.draft.platform ?? "meta_ads"}
                    onChange={(e) => setCampaignDialog({ ...campaignDialog, draft: { ...campaignDialog.draft, platform: e.target.value } })}
                  >
                    {Object.entries(PLATFORM_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <select
                    className="w-full border rounded-md h-9 px-2 text-sm bg-background"
                    value={campaignDialog.draft.status ?? "active"}
                    onChange={(e) => setCampaignDialog({ ...campaignDialog, draft: { ...campaignDialog.draft, status: e.target.value } })}
                  >
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Campaign Name *</Label>
                <Input
                  value={campaignDialog.draft.campaignName ?? ""}
                  onChange={(e) => setCampaignDialog({ ...campaignDialog, draft: { ...campaignDialog.draft, campaignName: e.target.value } })}
                  placeholder="Meta Leadgen Garut Kota - Juli 2026"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">External ID (dari platform)</Label>
                  <Input
                    value={campaignDialog.draft.externalId ?? ""}
                    onChange={(e) => setCampaignDialog({ ...campaignDialog, draft: { ...campaignDialog.draft, externalId: e.target.value } })}
                    placeholder="23851234567890123"
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Objective</Label>
                  <Input
                    value={campaignDialog.draft.objective ?? ""}
                    onChange={(e) => setCampaignDialog({ ...campaignDialog, draft: { ...campaignDialog.draft, objective: e.target.value } })}
                    placeholder="leadgen / traffic / awareness"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Tanggal Mulai</Label>
                  <Input
                    type="date"
                    value={campaignDialog.draft.dateStart ?? ""}
                    onChange={(e) => setCampaignDialog({ ...campaignDialog, draft: { ...campaignDialog.draft, dateStart: e.target.value } })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Tanggal Berakhir</Label>
                  <Input
                    type="date"
                    value={campaignDialog.draft.dateEnd ?? ""}
                    onChange={(e) => setCampaignDialog({ ...campaignDialog, draft: { ...campaignDialog.draft, dateEnd: e.target.value } })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Budget Harian (Rp)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={campaignDialog.draft.budgetDaily ?? ""}
                    onChange={(e) => setCampaignDialog({ ...campaignDialog, draft: { ...campaignDialog.draft, budgetDaily: e.target.value ? Number(e.target.value) : null } })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Budget Total (Rp)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={campaignDialog.draft.budgetTotal ?? ""}
                    onChange={(e) => setCampaignDialog({ ...campaignDialog, draft: { ...campaignDialog.draft, budgetTotal: e.target.value ? Number(e.target.value) : null } })}
                  />
                </div>
              </div>

              <div className="border-t pt-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Metrik Performa</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    ["spendTotal", "Spend Total (Rp)"],
                    ["impressions", "Impressions"],
                    ["clicks", "Clicks"],
                    ["leadsFromAd", "Leads dari Ads"],
                    ["conversions", "Conversions (pelanggan)"],
                    ["revenue", "Revenue (Rp)"],
                  ].map(([k, label]) => (
                    <div key={k} className="space-y-1.5">
                      <Label className="text-xs">{label}</Label>
                      <Input
                        type="number"
                        min={0}
                        value={(campaignDialog.draft as any)[k] ?? ""}
                        onChange={(e) => setCampaignDialog({ ...campaignDialog, draft: { ...campaignDialog.draft, [k]: e.target.value ? Number(e.target.value) : 0 } })}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t pt-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">UTM Source</Label>
                    <Input
                      value={campaignDialog.draft.utmSource ?? ""}
                      onChange={(e) => setCampaignDialog({ ...campaignDialog, draft: { ...campaignDialog.draft, utmSource: e.target.value } })}
                      placeholder="meta"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">UTM Campaign</Label>
                    <Input
                      value={campaignDialog.draft.utmCampaign ?? ""}
                      onChange={(e) => setCampaignDialog({ ...campaignDialog, draft: { ...campaignDialog.draft, utmCampaign: e.target.value } })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5 mt-3">
                  <Label className="text-xs">Landing Page URL</Label>
                  <Input
                    value={campaignDialog.draft.linkUrl ?? ""}
                    onChange={(e) => setCampaignDialog({ ...campaignDialog, draft: { ...campaignDialog.draft, linkUrl: e.target.value } })}
                    placeholder="https://..."
                  />
                </div>
                <div className="space-y-1.5 mt-3">
                  <Label className="text-xs">Catatan</Label>
                  <Textarea
                    value={campaignDialog.draft.notes ?? ""}
                    onChange={(e) => setCampaignDialog({ ...campaignDialog, draft: { ...campaignDialog.draft, notes: e.target.value } })}
                    rows={2}
                  />
                </div>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2 border-t mt-2">
            <Button variant="outline" onClick={() => setCampaignDialog(null)}>Batal</Button>
            <Button
              onClick={() => {
                if (!campaignDialog) return;
                const d = campaignDialog.draft;
                if (!d.platform || !d.campaignName) {
                  toast.error("Platform + Campaign Name wajib");
                  return;
                }
                saveCampaignMut.mutate(d);
              }}
              disabled={saveCampaignMut.isPending}
            >
              {saveCampaignMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Simpan
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// -- Cluster Row Sub-component ---------------------------------------------

function ClusterRow({
  cluster,
  isExpanded,
  onToggle,
}: {
  cluster: OdpCluster;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="p-3 font-medium">{cluster.clusterName}</td>
        <td className="p-3 text-muted-foreground">{cluster.district}</td>
        <td className="p-3 text-center">
          <Badge variant="secondary" className="text-xs">{cluster.odpCount}</Badge>
        </td>
        <td className="p-3">
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs">
              {cluster.portKosong} / {cluster.portTotal}
            </span>
            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${utilisasiBarColor(cluster.utilisasi)}`}
                style={{ width: `${Math.min(cluster.utilisasi, 100)}%` }}
              />
            </div>
          </div>
        </td>
        <td className={`p-3 text-center font-medium ${utilisasiColor(cluster.utilisasi)}`}>
          {cluster.utilisasi.toFixed(1)}%
        </td>
        <td className="p-3 text-center text-muted-foreground">
          {cluster.radiusKm.toFixed(1)} km
        </td>
        <td className="p-3 text-right font-medium">
          {formatRp(cluster.budgetRecommendation)}
        </td>
        <td className="p-3 text-center">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_STYLES[cluster.priority] ?? ""}`}
          >
            {PRIORITY_LABELS[cluster.priority] ?? cluster.priority}
          </span>
        </td>
        <td className="p-3 text-center">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              copyToClipboard(`${cluster.centerLat},${cluster.centerLng}`);
            }}
          >
            <Copy className="h-3.5 w-3.5 mr-1" />
            Copy Koordinat
          </Button>
        </td>
      </tr>

      {/* Expanded detail */}
      {isExpanded && (
        <tr className="bg-muted/20">
          <td colSpan={9} className="p-4">
            <div className="grid md:grid-cols-2 gap-4">
              {/* Left: ODP list */}
              <div>
                <p className="text-xs font-medium mb-2">Daftar ODP ({cluster.odpList.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {cluster.odpList.map((odp) => (
                    <Badge key={odp} variant="outline" className="text-[11px]">
                      {odp}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Right: Coordinates & ad copy */}
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium mb-1">Center Coordinates</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                      {cluster.centerLat}, {cluster.centerLng}
                    </code>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2"
                      onClick={() =>
                        copyToClipboard(`${cluster.centerLat},${cluster.centerLng}`)
                      }
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium mb-1">Radius untuk Meta Ads Drop Pin</p>
                  <p className="text-xs text-muted-foreground">
                    {cluster.radiusKm.toFixed(1)} km
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium mb-1">Suggested Ad Copy</p>
                  <div className="bg-muted rounded-md p-3 text-xs italic text-muted-foreground">
                    &quot;Internet Fiber Optic kini hadir di {cluster.district}! Kecepatan hingga 100 Mbps mulai Rp xxx.xxx/bulan&quot;
                  </div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
