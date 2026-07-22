import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Search, MapPin, Phone, Globe, Download, Radio, Box, CircleDot,
  Building2, GraduationCap, HeartPulse, ShoppingBag, Landmark, HelpCircle,
  Loader2, ChevronDown, UserPlus, Check,
} from "lucide-react";

// -- Types ------------------------------------------------------------------

interface AssetOption {
  id: number;
  name: string;
  lat: string | number;
  lng: string | number;
}

interface ProspectResult {
  placeId: string;
  name: string;
  address: string;
  types: string[];
  category: string;
  lat: number;
  lng: number;
  distance: number | null;
  // Diisi kalau hasil dari metode pencarian (nomor sudah ter-scrape sekaligus).
  phone?: string | null;
  website?: string | null;
}

// -- Config -----------------------------------------------------------------

const CATEGORIES = [
  { key: "korporat",   label: "Korporat",    icon: Building2,    color: "#3B82F6" },
  { key: "pendidikan", label: "Pendidikan",  icon: GraduationCap, color: "#8B5CF6" },
  { key: "kesehatan",  label: "Kesehatan",   icon: HeartPulse,   color: "#EF4444" },
  { key: "komersial",  label: "Komersial",   icon: ShoppingBag,  color: "#F59E0B" },
  { key: "pemerintah", label: "Pemerintah",  icon: Landmark,     color: "#10B981" },
];

const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

const RADIUS_OPTIONS = [
  { value: 200,  label: "200 m", desc: "Radius ODP" },
  { value: 500,  label: "500 m", desc: "Radius ODC" },
  { value: 1000, label: "1 km",  desc: "" },
  { value: 2000, label: "2 km",  desc: "Radius POP" },
];

const ASSET_TYPES = [
  { key: "pops",      label: "POP",  icon: Radio,     radiusDef: 2000 },
  { key: "odcs",      label: "ODC",  icon: Box,       radiusDef: 500 },
  { key: "odps",      label: "ODP",  icon: CircleDot, radiusDef: 200 },
];

// Map prospect categories → lead categories
const PROSPECT_TO_LEAD_CAT: Record<string, string> = {
  korporat: "bisnis",
  pendidikan: "sekolah",
  kesehatan: "bisnis",
  komersial: "bisnis",
  pemerintah: "perkantoran",
  lainnya: "lainnya",
};

// -- Helpers ----------------------------------------------------------------

function CategoryBadge({ category }: { category: string }) {
  const cfg = CATEGORY_MAP[category];
  if (!cfg) return <Badge variant="outline" className="text-[10px] gap-1"><HelpCircle className="w-3 h-3" /> Lainnya</Badge>;
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className="text-[10px] gap-1 whitespace-nowrap"
      style={{ borderColor: cfg.color, color: cfg.color }}>
      <Icon className="w-3 h-3" /> {cfg.label}
    </Badge>
  );
}

// -- Phone fetcher component ------------------------------------------------

function PhoneCell({ placeId, prefetched }: { placeId: string; prefetched?: { phone?: string | null; website?: string | null } }) {
  // Kalau nomor sudah ter-scrape dari metode pencarian, tampilkan langsung tanpa call ulang.
  const hasPrefetched = prefetched !== undefined && (prefetched.phone != null || prefetched.website != null);
  const [fetched, setFetched] = useState(hasPrefetched);
  const [data, setData] = useState<{ phone: string | null; website: string | null } | null>(
    hasPrefetched ? { phone: prefetched?.phone ?? null, website: prefetched?.website ?? null } : null,
  );
  const [loading, setLoading] = useState(false);

  const fetchPhone = async () => {
    setLoading(true);
    try {
      const result = await api.get<{ phone: string | null; website: string | null }>(`/prospects/details/${placeId}`);
      setData(result);
    } catch {
      setData({ phone: null, website: null });
    } finally {
      setFetched(true);
      setLoading(false);
    }
  };

  if (!fetched) {
    return (
      <button onClick={fetchPhone} disabled={loading}
        className="text-xs text-primary hover:underline flex items-center gap-1">
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Phone className="w-3 h-3" />}
        {loading ? "..." : "Lihat"}
      </button>
    );
  }

  return (
    <div className="space-y-0.5">
      {data?.phone ? (
        <span className="text-xs font-medium text-foreground">{data.phone}</span>
      ) : (
        <span className="text-xs text-muted-foreground">-</span>
      )}
      {data?.website && (
        <a href={data.website} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] text-primary hover:underline">
          <Globe className="w-2.5 h-2.5" /> Website
        </a>
      )}
    </div>
  );
}

// -- Main Page --------------------------------------------------------------

export default function ProspectPage() {
  const [mode, setMode] = useState<"nearby" | "keyword">("nearby");
  const [assetType, setAssetType] = useState<string>("odps");
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const [radius, setRadius] = useState<number>(200);
  const [selectedCats, setSelectedCats] = useState<string[]>(CATEGORIES.map(c => c.key));
  const [keyword, setKeyword] = useState<string>("");
  const [results, setResults] = useState<ProspectResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [savedPlaceIds, setSavedPlaceIds] = useState<Set<string>>(new Set());
  const [savingPlaceId, setSavingPlaceId] = useState<string | null>(null);
  const qc = useQueryClient();

  // Load asset list for chosen type
  const { data: assets = [], isLoading: assetsLoading } = useQuery<AssetOption[]>({
    queryKey: [`/api/${assetType}`],
    queryFn: () => api.get<AssetOption[]>(`/${assetType}`),
  });

  const selectedAsset = assets.find(a => a.id === selectedAssetId) ?? null;

  // Auto-select first asset when type changes
  const handleAssetTypeChange = (type: string) => {
    setAssetType(type);
    setSelectedAssetId(null);
    setResults([]);
    setSearched(false);
    const def = ASSET_TYPES.find(a => a.key === type)?.radiusDef ?? 200;
    setRadius(def);
  };

  const searchMut = useMutation({
    mutationFn: (body: object) => api.post<{ places: ProspectResult[] }>("/prospects/nearby", body),
    onSuccess: (data) => {
      setResults(data.places);
      setSearched(true);
      if (data.places.length === 0) toast.info("Tidak ada prospek ditemukan dalam radius tersebut");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSearch = () => {
    if (!selectedAsset) return toast.error("Pilih titik referensi terlebih dahulu");
    if (selectedCats.length === 0) return toast.error("Pilih minimal satu kategori");
    searchMut.mutate({
      lat: Number(selectedAsset.lat),
      lng: Number(selectedAsset.lng),
      radius,
      categories: selectedCats,
    });
  };

  // Metode pencarian: cari via kata kunci (nomor ter-scrape langsung). Bias ke titik
  // referensi kalau dipilih supaya hasil relevan dengan area jaringan.
  const keywordMut = useMutation({
    mutationFn: (body: object) => api.post<{ places: ProspectResult[] }>("/prospects/search", body),
    onSuccess: (data) => {
      setResults(data.places);
      setSearched(true);
      if (data.places.length === 0) toast.info("Tidak ada prospek ditemukan untuk kata kunci tersebut");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleKeywordSearch = () => {
    if (!keyword.trim()) return toast.error("Masukkan kata kunci pencarian");
    keywordMut.mutate({
      query: keyword.trim(),
      lat: selectedAsset ? Number(selectedAsset.lat) : undefined,
      lng: selectedAsset ? Number(selectedAsset.lng) : undefined,
      radius: selectedAsset ? Math.max(radius, 5000) : undefined,
    });
  };

  const handleSaveToContact = async (prospect: ProspectResult) => {
    setSavingPlaceId(prospect.placeId);
    try {
      // Pakai nomor yang sudah ter-scrape (metode pencarian); kalau belum ada, ambil detail.
      let phone: string | null = prospect.phone ?? null;
      let website: string | null = prospect.website ?? null;
      if (phone == null && website == null) {
        try {
          const details = await api.get<{ phone: string | null; website: string | null }>(`/prospects/details/${prospect.placeId}`);
          phone = details.phone;
          website = details.website;
        } catch { /* ignore - phone is optional */ }
      }

      await api.post("/marketing/leads", {
        name: prospect.name,
        phone,
        address: prospect.address,
        category: PROSPECT_TO_LEAD_CAT[prospect.category] ?? "lainnya",
        lat: prospect.lat,
        lng: prospect.lng,
        odpId: assetType === "odps" ? selectedAssetId : undefined,
        distanceMeters: prospect.distance,
        source: "prospect_finder",
        notes: `Dari Finder: ${currentAssetTypeCfg.label} ${selectedAsset?.name ?? ""} (${prospect.category})${website ? ` | Web: ${website}` : ""}`,
      });

      setSavedPlaceIds(prev => new Set([...prev, prospect.placeId]));
      qc.invalidateQueries({ queryKey: ["marketing_contacts"] });
      qc.invalidateQueries({ queryKey: ["marketing_dashboard"] });
      toast.success(`${prospect.name} disimpan ke kontak`);
    } catch (e: any) {
      toast.error(e.message || "Gagal menyimpan");
    } finally {
      setSavingPlaceId(null);
    }
  };

  const handleSaveAll = async () => {
    const unsaved = results.filter(r => !savedPlaceIds.has(r.placeId));
    if (unsaved.length === 0) return toast.info("Semua sudah disimpan");
    for (const prospect of unsaved) {
      await handleSaveToContact(prospect);
    }
  };

  const toggleCat = (key: string) => {
    setSelectedCats(prev => prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]);
  };

  const exportCsv = useCallback(() => {
    if (results.length === 0) return;
    const rows = [
      ["Nama", "Kategori", "Jarak (m)", "Alamat"],
      ...results.map(r => [r.name, CATEGORY_MAP[r.category]?.label ?? r.category, String(r.distance), r.address]),
    ];
    const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `prospek_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [results]);

  const currentAssetTypeCfg = ASSET_TYPES.find(a => a.key === assetType)!;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Prospect Finder</h1>
        <p className="text-sm text-muted-foreground">
          Temukan prospek pelanggan di sekitar infrastruktur jaringan Anda
        </p>
      </div>

      {/* Search Config */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Konfigurasi Pencarian</CardTitle>
          <CardDescription className="text-xs">
            {mode === "nearby"
              ? "Cari prospek di sekitar titik referensi jaringan (radius + kategori)"
              : "Cari prospek via kata kunci - nomor telepon langsung ter-scrape dari hasil"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Metode pencarian: sekitar titik referensi VS kata kunci */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Metode Pencarian</label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { setMode("nearby"); setResults([]); setSearched(false); }}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${mode === "nearby" ? "bg-primary text-white border-primary" : "border-border hover:bg-muted"}`}>
                <MapPin className="w-4 h-4" /> Sekitar Titik Referensi
              </button>
              <button onClick={() => { setMode("keyword"); setResults([]); setSearched(false); }}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${mode === "keyword" ? "bg-primary text-white border-primary" : "border-border hover:bg-muted"}`}>
                <Search className="w-4 h-4" /> Kata Kunci
              </button>
            </div>
          </div>

          {/* Kata kunci - hanya mode keyword */}
          {mode === "keyword" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Kata Kunci Pencarian</label>
              <input
                type="text"
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleKeywordSearch(); }}
                placeholder="Contoh: warnet di Cilawu, toko komputer Garut, kantor desa"
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <p className="text-[11px] text-muted-foreground">
                Titik referensi di bawah opsional - kalau dipilih, hasil dibias ke sekitar area itu dan jaraknya dihitung.
              </p>
            </div>
          )}

          {/* Asset type selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Titik Referensi {mode === "keyword" && <span className="text-muted-foreground font-normal">(opsional)</span>}
            </label>
            <div className="flex gap-2 flex-wrap">
              {ASSET_TYPES.map(at => {
                const Icon = at.icon;
                return (
                  <button key={at.key} onClick={() => handleAssetTypeChange(at.key)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-all ${assetType === at.key ? "bg-primary text-white border-primary" : "border-border hover:bg-muted"}`}>
                    <Icon className="w-4 h-4" /> {at.label}
                  </button>
                );
              })}
            </div>

            {/* Asset dropdown */}
            <div className="relative">
              {assetsLoading ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Memuat...
                </div>
              ) : (
                <div className="relative">
                  <select
                    value={selectedAssetId ?? ""}
                    onChange={e => setSelectedAssetId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full appearance-none pl-3 pr-8 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="">-- Pilih {currentAssetTypeCfg.label} --</option>
                    {assets.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name} {a.lat && a.lng ? `(${Number(a.lat).toFixed(5)}, ${Number(a.lng).toFixed(5)})` : ""}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
              )}
            </div>

            {selectedAsset && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                <MapPin className="w-3 h-3 text-primary shrink-0" />
                <span>{Number(selectedAsset.lat).toFixed(6)}, {Number(selectedAsset.lng).toFixed(6)}</span>
              </div>
            )}
          </div>

          {/* Radius + Kategori - hanya mode nearby */}
          {mode === "nearby" && (
            <>
              {/* Radius */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Radius Pencarian</label>
                <div className="flex gap-2 flex-wrap">
                  {RADIUS_OPTIONS.map(r => (
                    <button key={r.value} onClick={() => setRadius(r.value)}
                      className={`px-3 py-1.5 rounded-lg border text-sm transition-all ${radius === r.value ? "bg-primary text-white border-primary" : "border-border hover:bg-muted"}`}>
                      {r.label}
                      {r.desc && <span className="ml-1 text-[10px] opacity-70">({r.desc})</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Categories */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Kategori</label>
                  <div className="flex gap-2">
                    <button onClick={() => setSelectedCats(CATEGORIES.map(c => c.key))}
                      className="text-xs text-primary hover:underline">Semua</button>
                    <button onClick={() => setSelectedCats([])}
                      className="text-xs text-muted-foreground hover:underline">Hapus</button>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {CATEGORIES.map(cat => {
                    const Icon = cat.icon;
                    const active = selectedCats.includes(cat.key);
                    return (
                      <button key={cat.key} onClick={() => toggleCat(cat.key)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-all ${active ? "text-white" : "border-border hover:bg-muted"}`}
                        style={active ? { backgroundColor: cat.color, borderColor: cat.color } : {}}>
                        <Icon className="w-3.5 h-3.5" /> {cat.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Search button */}
          {mode === "nearby" ? (
            <Button onClick={handleSearch} disabled={searchMut.isPending || !selectedAsset || selectedCats.length === 0}
              className="w-full gap-2">
              {searchMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {searchMut.isPending ? "Mencari..." : "Cari Prospek"}
            </Button>
          ) : (
            <Button onClick={handleKeywordSearch} disabled={keywordMut.isPending || !keyword.trim()}
              className="w-full gap-2">
              {keywordMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {keywordMut.isPending ? "Mencari..." : "Cari & Scrape Nomor"}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {searched && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="min-w-0">
                <CardTitle className="text-base">Hasil Pencarian</CardTitle>
                <CardDescription className="text-xs">
                  {mode === "nearby"
                    ? `${results.length} prospek ditemukan dalam radius ${radius >= 1000 ? `${radius / 1000} km` : `${radius} m`}`
                    : `${results.length} prospek ditemukan - nomor sudah ter-scrape dari hasil pencarian`}
                </CardDescription>
              </div>
              {results.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  <Button variant="default" size="sm" onClick={handleSaveAll} className="gap-1.5 text-xs">
                    <UserPlus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Simpan Semua ke Kontak</span><span className="sm:hidden">Simpan Semua</span>
                  </Button>
                  <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5 text-xs">
                    <Download className="w-3.5 h-3.5" /> CSV
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {results.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <Search className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Tidak ada prospek ditemukan</p>
                <p className="text-xs mt-1">{mode === "nearby" ? "Coba perbesar radius atau pilih kategori berbeda" : "Coba kata kunci lain atau lebih spesifik"}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">#</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Nama</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">Kategori</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">Jarak</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Alamat</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">Telepon</th>
                      <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">Simpan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {results.map((r, i) => (
                      <tr key={r.placeId} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 text-xs text-muted-foreground">{i + 1}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-sm leading-tight max-w-[180px]">{r.name}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <CategoryBadge category={r.category} />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-xs font-medium">
                            {r.distance == null ? "-" : r.distance >= 1000 ? `${(r.distance / 1000).toFixed(1)} km` : `${r.distance} m`}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs text-muted-foreground max-w-[220px] leading-tight">{r.address}</p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <PhoneCell placeId={r.placeId}
                            prefetched={mode === "keyword" ? { phone: r.phone, website: r.website } : undefined} />
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          {savedPlaceIds.has(r.placeId) ? (
                            <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                              <Check className="w-3.5 h-3.5" /> Tersimpan
                            </span>
                          ) : (
                            <button
                              onClick={() => handleSaveToContact(r)}
                              disabled={savingPlaceId === r.placeId}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-all"
                            >
                              {savingPlaceId === r.placeId
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <UserPlus className="w-3 h-3" />
                              }
                              Kontak
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Info disclaimer */}
      <p className="text-[11px] text-muted-foreground text-center px-4">
        Data prospek bersumber dari Google Places API. Nomor telepon ditampilkan real-time dan tidak disimpan.
        Gunakan sesuai <a href="https://developers.google.com/maps/terms" target="_blank" rel="noopener noreferrer"
          className="underline hover:text-foreground">Google Maps Platform ToS</a>.
      </p>
    </div>
  );
}
