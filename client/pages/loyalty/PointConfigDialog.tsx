import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2, Info, Plus, Settings, Pencil, Trash2 } from "lucide-react";
import { type Tab } from "./shared";

type RewardItem = {
  key: string;
  label: string;
  description: string;
  pointsCost: number;
  speedMultiplier: number;
  durationHours: number;
};


export function PointConfigDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"earn" | "catalog" | "mikrotik">("earn");

  const { data: config, isLoading } = useQuery<any>({
    queryKey: ["/api/loyalty/admin/points/config"],
    queryFn: () => api.get("/loyalty/admin/points/config"),
  });

  // Earn rules state
  const [earnOnTime, setEarnOnTime] = useState(100);
  const [earnEarly, setEarnEarly] = useState(50);
  const [earnEarlyDays, setEarnEarlyDays] = useState(3);
  // Catalog state
  const [catalog, setCatalog] = useState<RewardItem[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [draftReward, setDraftReward] = useState<RewardItem | null>(null);
  // Initial sync from server
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!config || hydrated) return;
    setEarnOnTime(config.earnOnTimePts ?? 100);
    setEarnEarly(config.earnEarlyBonusPts ?? 50);
    setEarnEarlyDays(config.earnEarlyDaysThreshold ?? 3);
    if (Array.isArray(config.catalog) && config.catalog.length > 0) {
      setCatalog(config.catalog);
    } else {
      // Default catalog kalau belum ada di settings
      setCatalog([
        { key: "boost_2x_6h",  label: "Speed 2× - 6 jam",   description: "Pakai untuk meeting, download kerjaan, atau streaming sebentar.", pointsCost: 50,  speedMultiplier: 2, durationHours: 6 },
        { key: "boost_2x_24h", label: "Speed 2× - 24 jam",  description: "Cocok untuk weekend gaming atau movie marathon.",                pointsCost: 150, speedMultiplier: 2, durationHours: 24 },
        { key: "boost_3x_6h",  label: "Speed 3× - 6 jam",   description: "Boost maksimal singkat, untuk download besar urgent.",            pointsCost: 250, speedMultiplier: 3, durationHours: 6 },
        { key: "boost_3x_24h", label: "Speed 3× - 24 jam",  description: "Boost maksimal seharian.",                                         pointsCost: 600, speedMultiplier: 3, durationHours: 24 },
      ]);
    }
    setHydrated(true);
  }, [config, hydrated]);

  const saveMut = useMutation({
    mutationFn: () => api.put("/loyalty/admin/points/config", {
      earnOnTimePts: earnOnTime,
      earnEarlyBonusPts: earnEarly,
      earnEarlyDaysThreshold: earnEarlyDays,
      catalog,
    }),
    onSuccess: () => {
      toast.success("Pengaturan point tersimpan");
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/points/config"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSaveDraft = () => {
    if (!draftReward) return;
    if (!draftReward.key.trim() || !draftReward.label.trim()) {
      toast.error("Key + Label wajib");
      return;
    }
    if (!/^[a-z0-9_]+$/.test(draftReward.key)) {
      toast.error("Key cuma huruf kecil + angka + underscore");
      return;
    }
    // Cek duplicate key (kecuali kalau edit row yg sama)
    const dupIdx = catalog.findIndex(r => r.key === draftReward.key);
    if (dupIdx !== -1 && dupIdx !== editingIdx) {
      toast.error(`Key "${draftReward.key}" sudah dipakai`);
      return;
    }
    if (editingIdx === -1) {
      // Add new
      setCatalog([...catalog, draftReward]);
    } else if (editingIdx != null) {
      // Edit existing
      const next = [...catalog];
      next[editingIdx] = draftReward;
      setCatalog(next);
    }
    setEditingIdx(null);
    setDraftReward(null);
  };

  const handleDelete = (idx: number) => {
    if (!confirm(`Hapus reward "${catalog[idx].label}"?`)) return;
    setCatalog(catalog.filter((_, i) => i !== idx));
  };

  const totalConfigured = catalog.length;
  const totalPotentialMonthlyEarn = earnOnTime + earnEarly;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Settings className="h-4 w-4 text-foreground" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold tracking-tight">
                Pengaturan Loyalty Point
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Customize earn rules dan reward catalog. Perubahan berlaku langsung setelah disimpan.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isLoading || !hydrated ? (
          <div className="p-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
        ) : (
          <>
            {/* Tab nav - clean underline style */}
            <div className="px-6 border-b overflow-x-auto no-scrollbar">
              <div className="flex gap-6 w-max min-w-full">
                {([
                  { key: "earn", label: "Earn Rules", count: totalPotentialMonthlyEarn, suffix: "pts/bulan max" },
                  { key: "catalog", label: "Catalog Reward", count: totalConfigured, suffix: "reward" },
                  { key: "mikrotik", label: "MikroTik Auto-Boost", count: 0, suffix: "" },
                ] as const).map(({ key, label, count, suffix }) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={`relative py-3 text-sm transition-colors shrink-0 whitespace-nowrap ${
                      activeTab === key
                        ? "text-foreground font-semibold"
                        : "text-muted-foreground hover:text-foreground font-medium"
                    }`}
                  >
                    <div className="flex items-baseline gap-2">
                      <span>{label}</span>
                      {suffix && (
                        <span className="text-[11px] font-normal text-muted-foreground tabular-nums">
                          {count.toLocaleString("id-ID")} {suffix}
                        </span>
                      )}
                    </div>
                    {activeTab === key && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* --------- EARN RULES - clean form --------- */}
              {activeTab === "earn" && (
                <div className="space-y-6">
                  {/* Section header */}
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight">Aturan Pemberian Point</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Auto-jalan saat billing sync detect payment. Idempotent per pembayaran.
                    </p>
                  </div>

                  {/* Form rows - flat, label-led */}
                  <div className="space-y-5">
                    <div className="flex items-start justify-between gap-6 pb-5 border-b">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">Bayar tepat waktu</div>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          Point yang diberikan saat customer bayar sebelum atau pada tanggal jatuh tempo.
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Input
                          type="number"
                          min={0}
                          max={10000}
                          value={earnOnTime}
                          onChange={(e) => setEarnOnTime(Math.max(0, Number(e.target.value) || 0))}
                          className="text-base font-semibold tabular-nums w-24 text-right"
                        />
                        <span className="text-xs text-muted-foreground font-medium w-8">pts</span>
                      </div>
                    </div>

                    <div className="flex items-start justify-between gap-6 pb-5 border-b">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">Bonus bayar early</div>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          Bonus tambahan jika customer bayar minimal <strong className="text-foreground">{earnEarlyDays}</strong> hari sebelum jatuh tempo.
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Input
                          type="number"
                          min={0}
                          max={10000}
                          value={earnEarly}
                          onChange={(e) => setEarnEarly(Math.max(0, Number(e.target.value) || 0))}
                          className="text-base font-semibold tabular-nums w-24 text-right"
                        />
                        <span className="text-xs text-muted-foreground font-medium w-8">pts</span>
                      </div>
                    </div>

                    <div className="flex items-start justify-between gap-6">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">Threshold hari early</div>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          Berapa hari minimum sebelum jatuh tempo untuk dianggap "early payment".
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Input
                          type="number"
                          min={1}
                          max={28}
                          value={earnEarlyDays}
                          onChange={(e) => setEarnEarlyDays(Math.max(1, Number(e.target.value) || 1))}
                          className="text-base font-semibold tabular-nums w-24 text-right"
                        />
                        <span className="text-xs text-muted-foreground font-medium w-8">hari</span>
                      </div>
                    </div>
                  </div>

                  {/* Outcome panel */}
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Maksimum earn per pelanggan</div>
                        <div className="mt-1 flex items-baseline gap-2">
                          <span className="text-2xl font-bold tabular-nums tracking-tight">{totalPotentialMonthlyEarn.toLocaleString("id-ID")}</span>
                          <span className="text-xs text-muted-foreground">pts/bulan</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Per tahun</div>
                        <div className="mt-1 text-base font-semibold tabular-nums">
                          {(totalPotentialMonthlyEarn * 12).toLocaleString("id-ID")} pts
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* --------- CATALOG - table-style list --------- */}
              {activeTab === "catalog" && (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold tracking-tight">Catalog Reward</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Reward yang bisa di-redeem customer. Edit untuk event/promo, perubahan langsung berlaku.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setEditingIdx(-1);
                        setDraftReward({ key: "", label: "", description: "", pointsCost: 100, speedMultiplier: 2, durationHours: 6 });
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border bg-card hover:bg-muted/40 shrink-0"
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={1.75} /> Tambah reward
                    </button>
                  </div>

                  {catalog.length === 0 ? (
                    <div className="rounded-lg border bg-muted/20 py-12 text-center text-sm text-muted-foreground">
                      Belum ada reward. Klik "Tambah reward" untuk mulai.
                    </div>
                  ) : (
                    <div className="rounded-lg border bg-card overflow-hidden">
                      <div className="divide-y">
                        {catalog.map((r, idx) => (
                          <div
                            key={r.key + idx}
                            className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                              editingIdx === idx ? "bg-primary/5" : "hover:bg-muted/30"
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline gap-2">
                                <span className="font-medium text-sm text-foreground">{r.label}</span>
                                <span className="text-[10px] font-mono text-muted-foreground">{r.key}</span>
                              </div>
                              <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{r.description}</div>
                            </div>
                            <div className="hidden sm:flex items-center gap-5 shrink-0 text-[11px]">
                              <div className="text-right">
                                <div className="font-semibold tabular-nums">{r.pointsCost.toLocaleString("id-ID")}</div>
                                <div className="text-muted-foreground">pts cost</div>
                              </div>
                              <div className="text-right">
                                <div className="font-semibold tabular-nums">{r.speedMultiplier}×</div>
                                <div className="text-muted-foreground">speed</div>
                              </div>
                              <div className="text-right">
                                <div className="font-semibold tabular-nums">{r.durationHours}h</div>
                                <div className="text-muted-foreground">durasi</div>
                              </div>
                            </div>
                            <div className="flex gap-0.5 shrink-0">
                              <button
                                onClick={() => { setEditingIdx(idx); setDraftReward({ ...r }); }}
                                className="w-7 h-7 rounded-md hover:bg-muted/60 inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
                                title="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                              </button>
                              <button
                                onClick={() => handleDelete(idx)}
                                className="w-7 h-7 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/40 inline-flex items-center justify-center text-muted-foreground hover:text-rose-600"
                                title="Hapus"
                              >
                                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Draft reward editor */}
                  {draftReward && (
                    <Card className="border-2 border-primary bg-primary/5">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-sm flex items-center gap-1.5">
                            <Pencil className="h-3.5 w-3.5" />
                            {editingIdx === -1 ? "Reward Baru" : `Edit: ${catalog[editingIdx!]?.label}`}
                          </h4>
                          <button onClick={() => { setDraftReward(null); setEditingIdx(null); }} className="text-muted-foreground hover:text-foreground">
                            <XCircle className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Key (unique, lowercase + underscore)</Label>
                            <Input
                              value={draftReward.key}
                              onChange={(e) => setDraftReward({ ...draftReward, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
                              placeholder="boost_5x_1h"
                              className="font-mono text-sm mt-1"
                              disabled={editingIdx !== -1}
                            />
                          </div>
                        </div>

                        <div>
                          <Label className="text-xs">Label (judul reward)</Label>
                          <Input
                            value={draftReward.label}
                            onChange={(e) => setDraftReward({ ...draftReward, label: e.target.value })}
                            placeholder="Speed 5× - 1 jam Promo Spesial"
                            className="mt-1"
                          />
                        </div>

                        <div>
                          <Label className="text-xs">Deskripsi (tampil di portal pelanggan)</Label>
                          <Textarea
                            value={draftReward.description}
                            onChange={(e) => setDraftReward({ ...draftReward, description: e.target.value })}
                            placeholder="Boost extra spesial untuk event Lebaran 2026"
                            rows={2}
                            className="mt-1 text-sm"
                          />
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <Label className="text-xs">Cost (pts)</Label>
                            <Input
                              type="number"
                              min={1}
                              value={draftReward.pointsCost}
                              onChange={(e) => setDraftReward({ ...draftReward, pointsCost: Math.max(1, Number(e.target.value) || 1) })}
                              className="font-mono mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Multiplier</Label>
                            <select
                              value={draftReward.speedMultiplier}
                              onChange={(e) => setDraftReward({ ...draftReward, speedMultiplier: Number(e.target.value) })}
                              className="w-full border rounded-md h-9 px-2 text-sm bg-background mt-1"
                            >
                              {[2, 3, 4, 5, 10].map(m => <option key={m} value={m}>{m}× speed</option>)}
                            </select>
                          </div>
                          <div>
                            <Label className="text-xs">Durasi (jam)</Label>
                            <Input
                              type="number"
                              min={1}
                              max={720}
                              value={draftReward.durationHours}
                              onChange={(e) => setDraftReward({ ...draftReward, durationHours: Math.max(1, Number(e.target.value) || 1) })}
                              className="font-mono mt-1"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2 border-t">
                          <Button variant="outline" size="sm" onClick={() => { setDraftReward(null); setEditingIdx(null); }}>Batal</Button>
                          <Button size="sm" onClick={handleSaveDraft}>
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Apply ke Catalog
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Tips - quiet, monochrome */}
                  <div className="text-[11px] text-muted-foreground leading-relaxed border-l-2 border-muted pl-3 ml-1">
                    <strong className="text-foreground/80">Tips:</strong>{" "}
                    Untuk event (Lebaran, 17an), turunin pointsCost atau tambah reward khusus.
                    Durasi 1-3 jam cocok untuk reward kecil yang gampang dijangkau.
                    Aktifkan MikroTik Auto-Boost di tab sebelah supaya redeem otomatis ganti profile.
                  </div>
                </div>
              )}

              {/* --------- MIKROTIK AUTO-BOOST --------- */}
              {activeTab === "mikrotik" && <MikrotikBoostConfigPanel />}
            </div>

            {/* Footer save - quiet, no gradient */}
            <div className="px-6 py-4 border-t flex justify-between items-center">
              <div className="text-xs text-muted-foreground">
                {draftReward ? (
                  <span className="text-amber-700 dark:text-amber-400">Ada perubahan reward yang belum di-apply</span>
                ) : (
                  <>{totalConfigured} reward · {totalPotentialMonthlyEarn} pts/bulan max</>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>Tutup</Button>
                <Button
                  size="sm"
                  onClick={() => saveMut.mutate()}
                  disabled={saveMut.isPending || !!draftReward}
                >
                  {saveMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                  Simpan
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ===============================================================
// MIKROTIK AUTO-BOOST CONFIG - toggle + profile pattern + test
// ===============================================================
function MikrotikBoostConfigPanel() {
  const qc = useQueryClient();
  const { data: config, isLoading } = useQuery<any>({
    queryKey: ["/api/loyalty/admin/mikrotik-boost/config"],
    queryFn: () => api.get("/loyalty/admin/mikrotik-boost/config"),
  });

  const [autoEnabled, setAutoEnabled] = useState(true);
  const [pattern, setPattern] = useState("{base}-boost-{multiplier}x");
  const [profileMapText, setProfileMapText] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (config && !hydrated) {
      setAutoEnabled(config.autoEnabled ?? true);
      setPattern(config.pattern ?? "{base}-boost-{multiplier}x");
      if (config.profileMap) {
        try { setProfileMapText(JSON.stringify(config.profileMap, null, 2)); } catch { /* ignore */ }
      }
      setHydrated(true);
    }
  }, [config, hydrated]);

  const saveMut = useMutation({
    mutationFn: () => {
      const body: any = {
        autoEnabled,
        pattern: pattern.trim(),
      };
      const trimmed = profileMapText.trim();
      if (trimmed) {
        try {
          body.profileMap = JSON.parse(trimmed);
        } catch {
          throw new Error("Profile map JSON tidak valid");
        }
      } else {
        body.profileMap = "";
      }
      return api.put("/loyalty/admin/mikrotik-boost/config", body);
    },
    onSuccess: () => {
      toast.success("Konfigurasi MikroTik tersimpan");
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/mikrotik-boost/config"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Test apply boost
  const [testCustomerId, setTestCustomerId] = useState("");
  const [testMultiplier, setTestMultiplier] = useState(2);
  const testMut = useMutation({
    mutationFn: () => api.post("/loyalty/admin/mikrotik-boost/test", { customerId: Number(testCustomerId), multiplier: testMultiplier }),
    onSuccess: (r: any) => {
      if (r.success) {
        toast.success(`Test sukses: ${r.boostedProfile} di router ${r.routerName}. Auto-revert dalam 5 detik.`, { duration: 7000 });
      } else {
        toast.error(`Test gagal: ${r.error}`, { duration: 7000 });
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading || !hydrated) {
    return <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold tracking-tight">MikroTik Auto-Boost</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Saat customer redeem boost, sistem otomatis ganti PPP profile di router → customer langsung dapat speed baru tanpa perlu admin verify manual.
        </p>
      </div>

      {/* Toggle */}
      <div className="flex items-center justify-between gap-4 p-4 rounded-lg border">
        <div className="min-w-0">
          <div className="text-sm font-medium">Auto-aktivasi via MikroTik</div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            ON: redeem langsung active (sistem update PPP profile + disconnect session). OFF: redeem masuk antrian pending - admin verify manual.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAutoEnabled(!autoEnabled)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
            autoEnabled ? "bg-primary" : "bg-muted-foreground/30"
          }`}
        >
          <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${autoEnabled ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </div>

      {/* Pattern */}
      <div className="pb-5 border-b">
        <Label className="text-sm font-medium">Pattern nama profile boost</Label>
        <p className="text-xs text-muted-foreground mt-0.5 mb-2 leading-relaxed">
          Template nama PPP profile yang dipakai saat boost aktif. Variable: <code className="font-mono bg-muted px-1 rounded">{`{base}`}</code> = nama profile sekarang, <code className="font-mono bg-muted px-1 rounded">{`{multiplier}`}</code> = angka multiplier (2 atau 3).
        </p>
        <Input
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          className="font-mono text-sm"
          placeholder="{base}-boost-{multiplier}x"
        />
        <div className="mt-2 text-[11px] text-muted-foreground space-y-0.5">
          <div>Contoh: profile <code className="font-mono">MOON-30M</code> + boost 2× → akan cari profile <code className="font-mono">MOON-30M-boost-2x</code></div>
          <div>Pastikan profile boost-nya sudah dibuat manual di MikroTik dengan rate-limit 2× / 3× speed asli.</div>
        </div>
      </div>

      {/* Profile map override (advanced) */}
      <div className="pb-5 border-b">
        <Label className="text-sm font-medium">Profile map override (opsional)</Label>
        <p className="text-xs text-muted-foreground mt-0.5 mb-2 leading-relaxed">
          Override pattern untuk paket spesifik. JSON: <code className="font-mono text-[10px]">{"{ \"NAMA_PAKET\": { \"2\": \"profile-2x\", \"3\": \"profile-3x\" } }"}</code>.
          Kosongkan kalau pakai pattern saja.
        </p>
        <Textarea
          value={profileMapText}
          onChange={(e) => setProfileMapText(e.target.value)}
          rows={6}
          className="font-mono text-xs"
          placeholder='{ "MOON": { "2": "MOON-BOOST-2X", "3": "MOON-BOOST-3X" } }'
        />
      </div>

      {/* Test apply */}
      <div className="pb-5 border-b">
        <Label className="text-sm font-medium">Test aplikasikan boost (dry-run)</Label>
        <p className="text-xs text-muted-foreground mt-0.5 mb-2 leading-relaxed">
          Test apply boost ke 1 customer untuk verifikasi setup MikroTik. Auto-revert dalam 5 detik supaya tidak ganggu service.
        </p>
        <div className="flex items-center gap-2">
          <Input
            value={testCustomerId}
            onChange={(e) => setTestCustomerId(e.target.value)}
            placeholder="Customer ID (numeric)"
            className="text-sm"
            type="number"
          />
          <select
            value={testMultiplier}
            onChange={(e) => setTestMultiplier(Number(e.target.value))}
            className="h-9 px-2 border rounded-md text-sm bg-background"
          >
            <option value={2}>2× test</option>
            <option value={3}>3× test</option>
          </select>
          <Button
            size="sm"
            variant="outline"
            onClick={() => testMut.mutate()}
            disabled={testMut.isPending || !testCustomerId}
          >
            {testMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Test
          </Button>
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <Button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
        >
          {saveMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          Simpan Konfigurasi MikroTik
        </Button>
      </div>

      {/* Quick reference */}
      <div className="rounded-lg border bg-muted/20 p-3 text-[11px] text-muted-foreground leading-relaxed space-y-1.5">
        <div className="font-semibold text-foreground/80 flex items-center gap-1.5">
          <Info className="h-3 w-3" /> Persiapan di MikroTik
        </div>
        <ol className="list-decimal ml-4 space-y-0.5">
          <li>Buka WinBox → PPP → Profiles → klik <strong>+</strong></li>
          <li>Buat profile boost untuk tiap paket (e.g. <code className="font-mono">MOON-30M-boost-2x</code> dengan rate-limit 60M/60M kalau paket asli 30M/30M)</li>
          <li>Save tiap profile, pastikan nama match dengan pattern di atas</li>
          <li>Test dengan tombol Test di atas - kalau sukses, customer langsung bisa redeem otomatis</li>
        </ol>
      </div>
    </div>
  );
}

