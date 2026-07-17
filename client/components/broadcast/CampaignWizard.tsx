/**
 * v4.2.19: Campaign Wizard — 4 langkah
 *   1. Audience: pilih saved segment ATAU buat inline filter
 *   2. Template: pilih template + (optional override content/footer/buttons)
 *   3. Schedule: kirim sekarang vs jadwalkan + rate limit
 *   4. Review: confirm + launch
 */

import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Users, MessageSquare, Calendar, ClipboardCheck, ChevronLeft, ChevronRight,
  Check, Loader2, Send, AlertCircle,
} from "lucide-react";
import { AudienceBuilder, type AudienceFilter } from "./AudienceBuilder";

interface Segment { id: number; name: string; description: string | null; filter: string; isSystem: number; lastCount: number; }
interface Template { id: number; key: string; name: string; content: string; footer: string | null; buttons: string | null; }

const STEPS = [
  { key: "audience", label: "Audience", icon: Users },
  { key: "template", label: "Template", icon: MessageSquare },
  { key: "schedule", label: "Jadwal",   icon: Calendar },
  { key: "review",   label: "Review",   icon: ClipboardCheck },
] as const;

export function CampaignWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // Audience
  const [audienceMode, setAudienceMode] = useState<"segment" | "inline">("segment");
  const [savedSegmentId, setSavedSegmentId] = useState<number | null>(null);
  const [inlineFilter, setInlineFilter] = useState<AudienceFilter>({ combine: "all", rules: [] });

  // Template
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [useOverride, setUseOverride] = useState(false);
  const [contentOverride, setContentOverride] = useState("");

  // Schedule
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [rateLimitMs, setRateLimitMs] = useState(2000);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep(0); setName(""); setDescription("");
      setAudienceMode("segment"); setSavedSegmentId(null); setInlineFilter({ combine: "all", rules: [] });
      setTemplateId(null); setUseOverride(false); setContentOverride("");
      setScheduleMode("now"); setScheduledAt(""); setRateLimitMs(2000);
    }
  }, [open]);

  const { data: segments = [] } = useQuery<Segment[]>({
    queryKey: ["broadcast-segments"],
    queryFn: () => api.get("/broadcast/segments"),
    enabled: open,
  });
  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["mpwa-templates"],
    queryFn: () => api.get("/mpwa/templates"),
    enabled: open,
  });

  const selectedSegment = useMemo(() => segments.find(s => s.id === savedSegmentId), [segments, savedSegmentId]);
  const selectedTemplate = useMemo(() => templates.find(t => t.id === templateId), [templates, templateId]);

  // Audience preview (for review step)
  const audienceFilter = audienceMode === "segment" && selectedSegment
    ? (() => { try { return JSON.parse(selectedSegment.filter); } catch { return null; } })()
    : audienceMode === "inline" ? inlineFilter : null;

  const { data: previewData } = useQuery({
    queryKey: ["audience-preview-wizard", JSON.stringify(audienceFilter)],
    queryFn: () => api.post("/broadcast/audience-preview", { filter: audienceFilter }),
    enabled: open && step >= 3 && !!audienceFilter,
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const body: any = {
        name,
        description: description || null,
        templateId,
        rateLimitMs,
      };
      if (audienceMode === "segment") body.savedSegmentId = savedSegmentId;
      else body.audienceFilter = inlineFilter;
      if (useOverride && contentOverride.trim()) body.contentOverride = contentOverride;
      if (scheduleMode === "later" && scheduledAt) body.scheduledAt = scheduledAt;
      return api.post("/broadcast/campaigns", body);
    },
    onSuccess: async (campaign: any) => {
      const id = campaign?.id ?? campaign?.data?.id;
      // Kalau "kirim sekarang" → langsung start
      if (scheduleMode === "now" && id) {
        try { await api.post(`/broadcast/campaigns/${id}/start`, {}); }
        catch (e: any) { toast.warning(`Campaign dibuat tapi gagal start: ${e.message}`); }
      }
      toast.success(scheduleMode === "now" ? "Campaign dimulai!" : "Campaign dijadwalkan");
      qc.invalidateQueries({ queryKey: ["broadcast-campaigns"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message || "Gagal buat campaign"),
  });

  function canAdvance(): boolean {
    if (step === 0) {
      if (!name.trim()) return false;
      if (audienceMode === "segment") return !!savedSegmentId;
      return inlineFilter.rules.length > 0;
    }
    if (step === 1) return !!templateId;
    if (step === 2) {
      if (scheduleMode === "later") return !!scheduledAt;
      return true;
    }
    return true;
  }

  function next() {
    if (!canAdvance()) { toast.error("Lengkapi data wajib"); return; }
    setStep(s => Math.min(STEPS.length - 1, s + 1));
  }
  function prev() { setStep(s => Math.max(0, s - 1)); }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-5 py-3.5 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            Buat Campaign Broadcast
          </DialogTitle>
          <DialogDescription className="text-xs">
            Langkah {step + 1} dari {STEPS.length} · {STEPS[step].label}
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <div className="px-5 py-3 border-b bg-muted/20">
          <div className="flex items-center justify-between gap-1">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const done = i < step;
              const active = i === step;
              return (
                <div key={s.key} className="flex-1 flex items-center gap-1">
                  <div className={`h-7 w-7 rounded-full grid place-items-center text-[10px] font-bold transition ${
                    done ? "bg-emerald-500 text-white" :
                    active ? "bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-1" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                  </div>
                  <div className={`hidden md:block text-[11px] font-semibold ${active ? "text-foreground" : "text-muted-foreground"}`}>
                    {s.label}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`h-0.5 flex-1 rounded ${done ? "bg-emerald-500" : "bg-muted"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Step 0: Audience */}
          {step === 0 && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider">Nama Campaign</label>
                <Input
                  value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Promo Lebaran 2026"
                  className="text-sm mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider">Deskripsi (opsional)</label>
                <Input
                  value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="Voucher 50K untuk semua aktif"
                  className="text-sm mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider">Audience</label>
                <div className="flex items-center gap-2 mt-1.5 mb-2">
                  <div className="inline-flex rounded-md border bg-card p-0.5 text-xs">
                    {(["segment", "inline"] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => setAudienceMode(m)}
                        className={`px-3 py-1 rounded font-bold uppercase tracking-wider ${
                          audienceMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {m === "segment" ? "Saved Segment" : "Custom Filter"}
                      </button>
                    ))}
                  </div>
                </div>

                {audienceMode === "segment" ? (
                  <div className="space-y-1.5">
                    {segments.length === 0 ? (
                      <div className="text-xs text-muted-foreground italic">Belum ada segment. Buat di tab Audiences atau pilih "Custom Filter".</div>
                    ) : segments.map(s => (
                      <button
                        key={s.id}
                        onClick={() => setSavedSegmentId(s.id)}
                        className={`w-full text-left rounded-md border px-3 py-2 transition ${
                          savedSegmentId === s.id ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "hover:border-foreground/30"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-bold flex-1">{s.name}</div>
                          {s.isSystem === 1 && <span className="text-[9px] font-bold px-1 rounded bg-blue-100 text-blue-700">SYSTEM</span>}
                        </div>
                        {s.description && <div className="text-[11px] text-muted-foreground mt-0.5">{s.description}</div>}
                      </button>
                    ))}
                  </div>
                ) : (
                  <AudienceBuilder value={inlineFilter} onChange={setInlineFilter} />
                )}
              </div>
            </div>
          )}

          {/* Step 1: Template */}
          {step === 1 && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider">Pilih Template</label>
                {templates.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic mt-1">Belum ada template. Buat di tab Templates.</div>
                ) : (
                  <div className="space-y-1.5 mt-1.5 max-h-[280px] overflow-y-auto">
                    {templates.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setTemplateId(t.id)}
                        className={`w-full text-left rounded-md border px-3 py-2 transition ${
                          templateId === t.id ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "hover:border-foreground/30"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-bold flex-1">{t.name}</div>
                          <span className="text-[10px] font-mono text-muted-foreground">{t.key}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{t.content.slice(0, 120)}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedTemplate && (
                <div className="rounded-md border bg-muted/20 p-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useOverride}
                      onChange={(e) => {
                        setUseOverride(e.target.checked);
                        if (e.target.checked && !contentOverride) setContentOverride(selectedTemplate.content);
                      }}
                      className="h-4 w-4"
                    />
                    <span className="text-xs font-bold">Override konten untuk campaign ini saja</span>
                  </label>
                  {useOverride && (
                    <Textarea
                      value={contentOverride}
                      onChange={(e) => setContentOverride(e.target.value)}
                      rows={6}
                      className="text-sm font-mono mt-2"
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Schedule */}
          {step === 2 && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider">Kapan dikirim?</label>
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  {(["now", "later"] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setScheduleMode(m)}
                      className={`px-4 py-3 rounded-md border-2 transition ${
                        scheduleMode === m ? "border-primary bg-primary/5" : "hover:border-foreground/20"
                      }`}
                    >
                      <div className="text-sm font-bold">{m === "now" ? "Kirim Sekarang" : "Jadwalkan"}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {m === "now" ? "Mulai langsung setelah confirm" : "Set tanggal/jam tertentu"}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {scheduleMode === "later" && (
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider">Tanggal & Jam</label>
                  <Input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="text-sm mt-1"
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Note: Server akan launch otomatis saat waktu tiba. Status awal: "scheduled".
                  </p>
                </div>
              )}

              <div>
                <label className="text-xs font-bold uppercase tracking-wider">Rate Limit (jeda antar pesan)</label>
                <div className="flex items-center gap-2 mt-1.5">
                  {[1000, 2000, 3000, 5000].map(ms => (
                    <button
                      key={ms}
                      onClick={() => setRateLimitMs(ms)}
                      className={`px-3 py-1.5 rounded border text-xs font-mono ${
                        rateLimitMs === ms ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted/30"
                      }`}
                    >
                      {ms / 1000}s
                    </button>
                  ))}
                  <Input
                    type="number"
                    min="500" step="500"
                    value={rateLimitMs}
                    onChange={(e) => setRateLimitMs(Number(e.target.value) || 2000)}
                    className="w-24 text-xs h-8 font-mono"
                  />
                  <span className="text-[10px] text-muted-foreground">ms</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Disarankan ≥ 2 detik supaya tidak terdeteksi spam oleh WhatsApp.
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="space-y-2">
              <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 mb-3">
                <div className="text-xs font-bold text-emerald-900">Review sebelum launch campaign</div>
                <div className="text-[11px] text-emerald-700 mt-0.5">Pastikan semua data benar. Setelah launch, bisa cancel tapi tidak bisa edit.</div>
              </div>

              {[
                { label: "Nama", value: name },
                { label: "Deskripsi", value: description || "—" },
                { label: "Audience", value: audienceMode === "segment" ? `Segment: ${selectedSegment?.name}` : `Custom filter (${inlineFilter.rules.length} rules)` },
                { label: "Estimasi recipient", value: previewData ? `${(previewData as any).count} pelanggan` : "Loading..." },
                { label: "Template", value: selectedTemplate?.name ?? "—" },
                { label: "Override?", value: useOverride ? "Ya — pakai konten custom" : "Tidak — pakai template default" },
                { label: "Jadwal", value: scheduleMode === "now" ? "Kirim sekarang" : `Jadwalkan: ${scheduledAt}` },
                { label: "Rate limit", value: `${rateLimitMs / 1000} detik antar pesan` },
                { label: "Estimasi durasi", value: previewData ? `~${Math.ceil(((previewData as any).count * rateLimitMs) / 60000)} menit` : "—" },
              ].map((row, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 px-3 py-2 border-b last:border-b-0 text-xs">
                  <div className="col-span-4 font-bold uppercase tracking-wider text-muted-foreground">{row.label}</div>
                  <div className="col-span-8">{row.value}</div>
                </div>
              ))}

              {!!previewData && (previewData as any).count > 500 && (
                <div className="px-3 py-2 rounded bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Audience &gt; 500 — pastikan MPWA punya quota & WhatsApp account siap broadcast skala besar.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t bg-muted/10 flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={prev} disabled={step === 0 || createMut.isPending} leftIcon={<ChevronLeft className="h-3.5 w-3.5" />}>
            Kembali
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={next} disabled={!canAdvance()} rightIcon={<ChevronRight className="h-3.5 w-3.5" />}>
              Lanjut
            </Button>
          ) : (
            <Button
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending}
              loading={createMut.isPending}
              rightIcon={<Send className="h-3.5 w-3.5" />}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {scheduleMode === "now" ? "Launch Sekarang" : "Buat & Jadwalkan"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
