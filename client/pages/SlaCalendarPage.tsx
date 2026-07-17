/**
 * v4.2.18 (C.3): SLA Calendar / Business Hours config page
 *
 * Admin set jam kerja per hari (Sen-Min) + tanggal libur.
 * Saat enabled, SLA akan respect jam kerja: di luar jam = SLA freeze.
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Plus, Trash2, Save, Calendar, Clock, AlertCircle } from "lucide-react";

// Inline toggle (avoid extra primitive)
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? "bg-emerald-500" : "bg-zinc-300"}`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

const DAY_LABELS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

interface BusinessHoursConfig {
  enabled: boolean;
  schedule: Record<number, Array<{ start: string; end: string }>>;
  holidays: string[];
  tzOffsetHours: number;
}

export default function SlaCalendarPage() {
  const qc = useQueryClient();
  const { data: cfg, isLoading } = useQuery<BusinessHoursConfig>({
    queryKey: ["business-hours-config"],
    queryFn: () => api.get<BusinessHoursConfig>("/settings/business-hours"),
  });

  const [draft, setDraft] = useState<BusinessHoursConfig | null>(null);
  const [newHoliday, setNewHoliday] = useState("");

  useEffect(() => {
    if (cfg && !draft) setDraft(JSON.parse(JSON.stringify(cfg)));
  }, [cfg, draft]);

  const saveMut = useMutation({
    mutationFn: (data: BusinessHoursConfig) => api.put("/settings/business-hours", data),
    onSuccess: () => {
      toast.success("Konfigurasi SLA Calendar tersimpan");
      qc.invalidateQueries({ queryKey: ["business-hours-config"] });
    },
    onError: (e: any) => toast.error(e.message || "Gagal simpan"),
  });

  if (isLoading || !draft) {
    return (
      <div className="grid place-items-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  function updateWindow(dow: number, idx: number, field: "start" | "end", value: string) {
    setDraft(d => {
      if (!d) return d;
      const next = JSON.parse(JSON.stringify(d)) as BusinessHoursConfig;
      next.schedule[dow][idx][field] = value;
      return next;
    });
  }

  function addWindow(dow: number) {
    setDraft(d => {
      if (!d) return d;
      const next = JSON.parse(JSON.stringify(d)) as BusinessHoursConfig;
      next.schedule[dow] = next.schedule[dow] ?? [];
      next.schedule[dow].push({ start: "08:00", end: "17:00" });
      return next;
    });
  }

  function removeWindow(dow: number, idx: number) {
    setDraft(d => {
      if (!d) return d;
      const next = JSON.parse(JSON.stringify(d)) as BusinessHoursConfig;
      next.schedule[dow].splice(idx, 1);
      return next;
    });
  }

  function addHoliday() {
    if (!newHoliday || !/^\d{4}-\d{2}-\d{2}$/.test(newHoliday)) {
      return toast.error("Format tanggal: YYYY-MM-DD");
    }
    setDraft(d => {
      if (!d) return d;
      const next = JSON.parse(JSON.stringify(d)) as BusinessHoursConfig;
      if (!next.holidays.includes(newHoliday)) {
        next.holidays.push(newHoliday);
        next.holidays.sort();
      }
      return next;
    });
    setNewHoliday("");
  }

  function removeHoliday(date: string) {
    setDraft(d => {
      if (!d) return d;
      const next = JSON.parse(JSON.stringify(d)) as BusinessHoursConfig;
      next.holidays = next.holidays.filter(h => h !== date);
      return next;
    });
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4 max-w-4xl">
      {/* Page header */}
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-gradient-to-br from-sky-100 to-blue-200 p-2.5">
          <Calendar className="h-5 w-5 text-sky-700" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl md:text-2xl font-bold tracking-tight-display">SLA Calendar</h1>
          <p className="text-sm text-muted-foreground">
            Atur jam kerja & tanggal libur. SLA akan auto-pause di luar jam kerja saat aktif.
          </p>
        </div>
      </div>

      {/* Master enable */}
      <Card variant="elevated" padding="lg">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold">Aktifkan SLA Calendar</div>
            <div className="text-xs text-muted-foreground mt-1">
              Saat aktif: SLA hanya berjalan di jam kerja. Di luar jam kerja & libur = SLA pause otomatis.
            </div>
          </div>
          <Toggle
            checked={draft.enabled}
            onChange={(v) => setDraft({ ...draft, enabled: v })}
          />
        </div>

        {draft.enabled && (
          <div className="mt-4 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div>
              <strong>Heads up:</strong> Tiket yang sudah ada tidak akan otomatis recalc — hanya tiket baru pakai aturan ini. Untuk tiket aktif, /workflow endpoint akan respect jam kerja saat compute remaining time.
            </div>
          </div>
        )}
      </Card>

      {/* Schedule per hari */}
      <Card variant="elevated" padding="lg">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <div className="font-semibold">Jam Kerja per Hari</div>
        </div>
        <div className="space-y-2">
          {DAY_LABELS.map((label, dow) => {
            const wins = draft.schedule[dow] ?? [];
            const isClosed = wins.length === 0;
            return (
              <div key={dow} className="flex items-start gap-3 py-2 border-b last:border-b-0">
                <div className="w-20 pt-1.5">
                  <div className="text-sm font-semibold">{label}</div>
                  {isClosed && <div className="text-[10px] text-muted-foreground italic">Libur</div>}
                </div>
                <div className="flex-1 space-y-1.5">
                  {wins.map((w, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={w.start}
                        onChange={(e) => updateWindow(dow, i, "start", e.target.value)}
                        className="w-24 text-xs"
                      />
                      <span className="text-xs text-muted-foreground">→</span>
                      <Input
                        type="time"
                        value={w.end}
                        onChange={(e) => updateWindow(dow, i, "end", e.target.value)}
                        className="w-24 text-xs"
                      />
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        onClick={() => removeWindow(dow, i)}
                        className="text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    size="xs"
                    variant="ghost-primary"
                    onClick={() => addWindow(dow)}
                    leftIcon={<Plus className="h-3 w-3" />}
                  >
                    Tambah window
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Holidays */}
      <Card variant="elevated" padding="lg">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <div className="font-semibold">Hari Libur Nasional & Cuti Bersama</div>
        </div>
        <div className="flex items-center gap-2 mb-3">
          <Input
            type="date"
            value={newHoliday}
            onChange={(e) => setNewHoliday(e.target.value)}
            className="w-44 text-xs"
            placeholder="YYYY-MM-DD"
          />
          <Button size="sm" onClick={addHoliday} leftIcon={<Plus className="h-3 w-3" />}>
            Tambah
          </Button>
        </div>
        {draft.holidays.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">Belum ada tanggal libur. SLA tetap berjalan tiap hari kerja.</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {draft.holidays.map(h => (
              <button
                key={h}
                onClick={() => removeHoliday(h)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-100 text-rose-800 text-xs font-mono hover:bg-rose-200"
                title="Klik untuk hapus"
              >
                {h}
                <Trash2 className="h-3 w-3" />
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Save button */}
      <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t py-3 px-1 -mx-1 flex items-center justify-end gap-2 z-10">
        <Button
          variant="ghost"
          onClick={() => setDraft(cfg ? JSON.parse(JSON.stringify(cfg)) : null)}
          disabled={saveMut.isPending}
        >
          Reset
        </Button>
        <Button
          onClick={() => saveMut.mutate(draft)}
          loading={saveMut.isPending}
          leftIcon={<Save className="h-4 w-4" />}
        >
          Simpan Konfigurasi
        </Button>
      </div>
    </div>
  );
}
