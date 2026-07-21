/**
 * v4.2.7: TicketCategoriesPage - dedicated page (bukan popup) untuk kelola kategori tiket + stages.
 *
 * Layout responsive:
 * - Mobile (< lg): top tabs untuk pilih kategori, detail editor di bawah
 * - Desktop (lg+): 2-col split - kategori list kiri (sidebar), detail editor kanan (main)
 *
 * Editor per kategori:
 * - Info dasar: nama, color, icon, SLA hours, sort order, active toggle
 * - Workflow stages editor:
 * - List stages (reorder up/down)
 * - Per stage: label, description, fields (multi-select), SLA minutes, isFinal
 * - Tambah / hapus stage
 * - Save full workflow JSON
 */

import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Save, Loader2,
  Camera, Wifi, ScanLine, Edit3, MapPin, Star, CheckCircle2, Clock,
  Activity, FileText, X, Check, AlertTriangle, GripVertical, Settings,
} from "lucide-react";

// -- Types ------------------------------------------------------------------

type FieldType = "photo" | "checklist" | "notes" | "numeric" | "speedtest" | "barcode" | "signature" | "gps" | "eta" | "rating";
type CustomFieldType = "text" | "number" | "textarea" | "select" | "checkbox" | "date";

interface CustomField {
  key: string;
  label: string;
  type: CustomFieldType;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  options?: string[];
  unit?: string;
}

interface WorkflowStage {
  key: string;
  label: string;
  description?: string;
  fields?: FieldType[];
  customFields?: CustomField[];
  sortOrder: number;
  slaMinutes?: number;
  isFinal?: boolean;
  icon?: string;
  color?: string;
  // v4.2.18 (H): Advanced features
  requiredRole?: "lead" | "helper" | "any"; // siapa yang boleh execute stage ini
  autoExitAfterMinutes?: number; // auto-advance kalau no action setelah X menit
  skipIf?: { // conditional skip - skip stage kalau kondisi terpenuhi
    customField: string;
    operator: "eq" | "ne" | "exists" | "not_exists";
    value?: any;
  };
}

interface Category {
  id: number;
  name: string;
  color: string | null;
  icon: string | null;
  isActive: number;
  sortOrder: number | null;
  slaHours: number | null;
  workflowStages: string | null;
  checklistTemplate: string | null;
}

const FIELD_OPTIONS: Array<{ key: FieldType; label: string; icon: any; description: string }> = [
  { key: "photo", label: "Foto Evidence", icon: Camera, description: "Wajib upload foto" },
  { key: "numeric", label: "Pengukuran", icon: Activity, description: "Input numeric (mis: redaman dBm)" },
  { key: "barcode", label: "Scan Barcode", icon: ScanLine, description: "Scan ONT serial / barcode" },
  { key: "speedtest", label: "Speed Test", icon: Wifi, description: "Download/Upload/Latency" },
  { key: "notes", label: "Catatan", icon: Edit3, description: "Text catatan teknisi" },
  { key: "checklist", label: "Checklist", icon: CheckCircle2, description: "Pakai checklist dari kategori" },
  { key: "gps", label: "GPS Location", icon: MapPin, description: "Capture lokasi GPS" },
  { key: "signature", label: "TTD Pelanggan", icon: Edit3, description: "Tanda tangan pelanggan" },
  { key: "rating", label: "Rating", icon: Star, description: "Rating bintang 1-5" },
  { key: "eta", label: "ETA Update", icon: Clock, description: "Update estimasi waktu" },
];

const COLOR_PRESETS = [
  "#1e40af", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#64748b", "#0d9488", "#f97316",
];

// -- Page ------------------------------------------------------------------

export default function TicketCategoriesPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ["ticket-categories"],
    queryFn: () => api.get<Category[]>("/ticket-categories"),
  });

  // Auto-select first kategori
  useEffect(() => {
    if (categories.length && !selectedId) setSelectedId(categories[0].id);
  }, [categories, selectedId]);

  const selected = useMemo(() => categories.find((c) => c.id === selectedId), [categories, selectedId]);

  const createMut = useMutation({
    mutationFn: (data: Partial<Category>) => api.post("/ticket-categories", data),
    onSuccess: (cat: any) => {
      toast.success("Kategori dibuat");
      qc.invalidateQueries({ queryKey: ["ticket-categories"] });
      const id = cat?.id ?? cat?.data?.id;
      if (id) setSelectedId(id);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const isAdmin = user?.role === "System-Admin"
              || user?.role === "Admin"
              || user?.role === "Administrator" /* legacy */
              || user?.role === "admin";

  return (
    <div className="min-h-screen" style={{ background: "#f8fafc", fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
      <header className="bg-white border-b border-[#e2e8f0] sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-3 flex items-center gap-3">
          <Link href="/tickets" className="p-2 -ml-2 rounded-md hover:bg-slate-100">
            <ArrowLeft style={{ width: 18, height: 18 }} className="text-slate-700" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-base lg:text-lg font-bold text-slate-900">Kelola Kategori Work Order</h1>
            <p className="text-[11px] lg:text-xs text-slate-500">Atur kategori, workflow stages, dan field requirement per kategori</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => createMut.mutate({
                name: "Kategori Baru",
                color: "#1e40af",
                sortOrder: categories.length,
                isActive: 1,
                slaHours: 24,
                workflowStages: JSON.stringify([
                  { key: "stage1", label: "Stage 1", fields: [], sortOrder: 1, slaMinutes: 30 },
                  { key: "done", label: "Selesai", fields: ["notes"], sortOrder: 2, slaMinutes: 10, isFinal: true },
                ]),
              } as any)}
              disabled={createMut.isPending}
              className="px-3 py-2 bg-[#1e40af] text-white text-xs font-semibold rounded-md flex items-center gap-1.5 hover:bg-[#1e3a8a] active:scale-95 transition-all"
            >
              {createMut.isPending ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : <Plus style={{ width: 14, height: 14 }} />}
              <span className="hidden sm:inline">Kategori Baru</span>
              <span className="sm:hidden">Baru</span>
            </button>
          )}
          {/* v4.2.18 (H.5): Export & Import workflow JSON */}
          {isAdmin && (
            <>
              <button
                onClick={() => {
                  const exportData = categories.map(c => ({
                    name: c.name,
                    color: c.color,
                    icon: c.icon,
                    slaHours: c.slaHours,
                    workflowStages: parseStages(c.workflowStages),
                    checklistTemplate: c.checklistTemplate,
                  }));
                  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url; a.download = `jabnet-workflow-${new Date().toISOString().slice(0, 10)}.json`;
                  document.body.appendChild(a); a.click(); a.remove();
                  URL.revokeObjectURL(url);
                  toast.success(`Export ${categories.length} kategori`);
                }}
                className="px-3 py-2 bg-white border border-[#e2e8f0] text-xs font-semibold rounded-md hover:bg-slate-50"
                title="Export semua kategori + workflow ke JSON"
              >
                Export
              </button>
              <button
                onClick={async () => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "application/json,.json";
                  input.onchange = async () => {
                    const file = input.files?.[0];
                    if (!file) return;
                    try {
                      const text = await file.text();
                      const arr = JSON.parse(text);
                      if (!Array.isArray(arr)) { toast.error("File harus array kategori"); return; }
                      let imported = 0;
                      for (const c of arr) {
                        if (!c.name) continue;
                        await api.post("/ticket-categories", {
                          name: c.name,
                          color: c.color ?? "#1e40af",
                          icon: c.icon ?? null,
                          slaHours: c.slaHours ?? 24,
                          isActive: 1,
                          sortOrder: 99,
                          workflowStages: typeof c.workflowStages === "string"
                            ? c.workflowStages
                            : JSON.stringify(c.workflowStages ?? []),
                          checklistTemplate: c.checklistTemplate ?? null,
                        }).catch((e: any) => console.warn("Import skip:", c.name, e.message));
                        imported++;
                      }
                      toast.success(`${imported} kategori di-import`);
                      qc.invalidateQueries({ queryKey: ["ticket-categories"] });
                    } catch (e: any) { toast.error(e.message || "Gagal parse JSON"); }
                  };
                  input.click();
                }}
                className="px-3 py-2 bg-white border border-[#e2e8f0] text-xs font-semibold rounded-md hover:bg-slate-50"
                title="Import kategori + workflow dari JSON"
              >
                Import
              </button>
            </>
          )}
        </div>
      </header>

      {isLoading ? (
        <div className="grid place-items-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : (
        <div className="max-w-7xl mx-auto p-3.5 lg:p-6 lg:grid lg:grid-cols-[280px_1fr] lg:gap-6">
          {/* Categories list - mobile: horizontal scroll tabs, desktop: vertical sidebar */}
          <CategoriesList
            categories={categories}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />

          {/* Editor */}
          <div className="mt-3 lg:mt-0 min-w-0">
            {selected ? (
              <CategoryEditor
                key={selected.id}
                category={selected}
                isAdmin={isAdmin}
                onDelete={() => { setSelectedId(null); }}
              />
            ) : (
              <div className="bg-white rounded-[10px] p-10 border border-[#e2e8f0] text-center">
                <Settings className="h-8 w-8 text-slate-300 mx-auto mb-3" />
                <div className="text-sm font-semibold text-slate-700">Pilih kategori untuk diedit</div>
                <div className="text-xs text-slate-500 mt-1">Atau buat kategori baru lewat tombol di atas</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Categories list (sidebar di desktop, horizontal scroll di mobile)
// --------------------------------------------------------------------------

function CategoriesList({ categories, selectedId, onSelect }: {
  categories: Category[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <aside className="lg:sticky lg:top-20 lg:self-start">
      {/* Mobile: horizontal scroll tabs */}
      <div className="lg:hidden -mx-3.5 px-3.5 overflow-x-auto no-scrollbar">
        <div className="flex gap-2 pb-1">
          {categories.map((c) => {
            const isActive = c.id === selectedId;
            const stages = parseStages(c.workflowStages);
            return (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={cn(
                  "shrink-0 flex items-center gap-2 px-3 py-2 rounded-full border transition-all whitespace-nowrap",
                  isActive ? "border-[#1e40af] bg-[#1e40af]/10" : "border-[#e2e8f0] bg-white"
                )}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color ?? "#64748b" }} />
                <span className="text-xs font-semibold">{c.name}</span>
                <span className="text-[10px] text-slate-500">{stages.length}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop: vertical list */}
      <div className="hidden lg:block bg-white rounded-[10px] border border-[#e2e8f0] overflow-hidden">
        {categories.map((c, i) => {
          const isActive = c.id === selectedId;
          const stages = parseStages(c.workflowStages);
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={cn(
                "w-full flex items-center gap-3 p-3 text-left transition-colors",
                i > 0 && "border-t border-[#e2e8f0]",
                isActive ? "bg-[#1e40af]/8" : "hover:bg-slate-50"
              )}
              style={isActive ? { background: `${c.color ?? "#1e40af"}10` } : undefined}
            >
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: c.color ?? "#64748b" }} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-slate-900 truncate">{c.name}</div>
                <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-2">
                  <span>{stages.length} stage</span>
                  {c.slaHours != null && <span>· SLA {c.slaHours}j</span>}
                  {c.isActive === 0 && <span className="text-amber-600 font-semibold">· Off</span>}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

// --------------------------------------------------------------------------
// Category editor - main detail (info + stages)
// --------------------------------------------------------------------------

function CategoryEditor({ category, isAdmin, onDelete }: {
  category: Category;
  isAdmin: boolean;
  onDelete: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color ?? "#1e40af");
  const [icon, setIcon] = useState(category.icon ?? "");
  const [slaHours, setSlaHours] = useState(category.slaHours?.toString() ?? "");
  const [sortOrder, setSortOrder] = useState(category.sortOrder?.toString() ?? "0");
  const [isActive, setIsActive] = useState(category.isActive === 1);
  const [stages, setStages] = useState<WorkflowStage[]>(parseStages(category.workflowStages));
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset form when category changes
  useEffect(() => {
    setName(category.name);
    setColor(category.color ?? "#1e40af");
    setIcon(category.icon ?? "");
    setSlaHours(category.slaHours?.toString() ?? "");
    setSortOrder(category.sortOrder?.toString() ?? "0");
    setIsActive(category.isActive === 1);
    setStages(parseStages(category.workflowStages));
    setConfirmDelete(false);
  }, [category.id]);

  const updateMut = useMutation({
    mutationFn: () => api.put(`/ticket-categories/${category.id}`, {
      name: name.trim(),
      color, icon: icon || null,
      slaHours: slaHours ? Number(slaHours) : null,
      sortOrder: Number(sortOrder) || 0,
      isActive: isActive ? 1 : 0,
      workflowStages: JSON.stringify(stages),
    }),
    onSuccess: () => {
      toast.success("Kategori tersimpan");
      qc.invalidateQueries({ queryKey: ["ticket-categories"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/ticket-categories/${category.id}`),
    onSuccess: () => {
      toast.success("Kategori dihapus");
      qc.invalidateQueries({ queryKey: ["ticket-categories"] });
      onDelete();
    },
    onError: (e: any) => toast.error(e.message),
  });

  function moveStage(idx: number, dir: -1 | 1) {
    const next = [...stages];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    // Re-number sortOrder
    next.forEach((s, i) => s.sortOrder = i + 1);
    setStages(next);
  }

  function updateStage(idx: number, partial: Partial<WorkflowStage>) {
    setStages((arr) => arr.map((s, i) => i === idx ? { ...s, ...partial } : s));
  }

  function deleteStage(idx: number) {
    if (!confirm(`Hapus stage "${stages[idx].label}"?`)) return;
    setStages((arr) => arr.filter((_, i) => i !== idx).map((s, i) => ({ ...s, sortOrder: i + 1 })));
  }

  function addStage() {
    const newKey = `stage_${Date.now().toString(36)}`;
    const isFirstFinal = !stages.some((s) => s.isFinal);
    setStages((arr) => [
      ...arr,
      {
        key: newKey,
        label: `Stage ${arr.length + 1}`,
        description: "",
        fields: [],
        sortOrder: arr.length + 1,
        slaMinutes: 30,
        isFinal: false,
      },
    ]);
  }

  return (
    <div className="space-y-3">
      {/* Action bar */}
      {isAdmin && (
        <div className="bg-white rounded-[10px] border border-[#e2e8f0] p-3 flex items-center gap-2">
          <button
            onClick={() => updateMut.mutate()}
            disabled={updateMut.isPending || !name.trim()}
            className="flex-1 sm:flex-initial px-4 py-2 bg-[#10b981] hover:bg-[#059669] active:scale-95 text-white text-sm font-bold rounded-md flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
          >
            {updateMut.isPending ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : <Save style={{ width: 14, height: 14 }} />}
            Simpan Perubahan
          </button>
          <div className="flex-1 hidden sm:block" />
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="px-3 py-2 bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 text-xs font-semibold rounded-md flex items-center gap-1.5"
            >
              <Trash2 style={{ width: 13, height: 13 }} /> Hapus
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={() => deleteMut.mutate()}
                disabled={deleteMut.isPending}
                className="px-3 py-2 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-md"
              >
                {deleteMut.isPending ? <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> : "Ya, hapus"}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="px-2 py-2 text-xs text-slate-500 hover:bg-slate-100 rounded-md">Batal</button>
            </div>
          )}
        </div>
      )}

      {/* Info dasar card */}
      <div className="bg-white rounded-[10px] border border-[#e2e8f0]">
        <div className="px-4 py-2.5 border-b border-[#e2e8f0] bg-slate-50 rounded-t-[10px]">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Info Kategori</div>
        </div>
        <div className="p-4 grid sm:grid-cols-2 gap-3">
          {/* Name + color */}
          <div className="sm:col-span-2 grid grid-cols-[auto_1fr] gap-2 items-end">
            <div>
              <label className="text-[11px] font-semibold text-slate-600 mb-1 block">Warna</label>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                disabled={!isAdmin}
                className="w-10 h-9 rounded-md border border-[#e2e8f0] cursor-pointer disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-600 mb-1 block">Nama Kategori</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isAdmin}
                className="w-full px-3 py-2 border border-[#e2e8f0] rounded-md text-sm font-semibold disabled:bg-slate-50"
              />
            </div>
          </div>
          {/* Color presets row */}
          <div className="sm:col-span-2 flex gap-1.5 flex-wrap">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                disabled={!isAdmin}
                className={cn("w-6 h-6 rounded-full border-2 transition-transform active:scale-90", color === c ? "border-slate-900" : "border-white shadow-sm")}
                style={{ background: c }}
              />
            ))}
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-600 mb-1 block">SLA (jam)</label>
            <input
              type="number" min="0"
              value={slaHours}
              onChange={(e) => setSlaHours(e.target.value)}
              disabled={!isAdmin}
              placeholder="24"
              className="w-full px-3 py-2 border border-[#e2e8f0] rounded-md text-sm jbn-mono disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-slate-600 mb-1 block">Urutan</label>
            <input
              type="number" min="0"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              disabled={!isAdmin}
              className="w-full px-3 py-2 border border-[#e2e8f0] rounded-md text-sm jbn-mono disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-slate-600 mb-1 block">Icon</label>
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              disabled={!isAdmin}
              placeholder="plug"
              className="w-full px-3 py-2 border border-[#e2e8f0] rounded-md text-sm disabled:bg-slate-50"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} disabled={!isAdmin} className="w-4 h-4" />
              <span className="text-sm font-semibold">Kategori aktif</span>
            </label>
          </div>
        </div>
      </div>

      {/* Stages editor */}
      <div className="bg-white rounded-[10px] border border-[#e2e8f0]">
        <div className="px-4 py-2.5 border-b border-[#e2e8f0] bg-slate-50 rounded-t-[10px] flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Workflow Stages</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{stages.length} stage · urut atas ke bawah</div>
          </div>
          {isAdmin && (
            <button
              onClick={addStage}
              className="px-3 py-1.5 bg-white border border-[#1e40af]/30 text-[#1e40af] text-xs font-semibold rounded-md flex items-center gap-1.5 hover:bg-[#1e40af]/5 active:scale-95 transition-all"
            >
              <Plus style={{ width: 13, height: 13 }} /> Tambah Stage
            </button>
          )}
        </div>
        <div className="p-3 space-y-2">
          {stages.length === 0 && (
            <div className="text-center py-8 text-sm text-slate-400">
              Belum ada stage. Klik "Tambah Stage" untuk mulai.
            </div>
          )}
          {stages.map((stage, i) => (
            <StageEditor
              key={stage.key + i}
              stage={stage}
              index={i}
              total={stages.length}
              isAdmin={isAdmin}
              catColor={color}
              onUpdate={(p) => updateStage(i, p)}
              onMoveUp={() => moveStage(i, -1)}
              onMoveDown={() => moveStage(i, 1)}
              onDelete={() => deleteStage(i)}
            />
          ))}
        </div>
      </div>

      <div className="text-[11px] text-slate-400 px-1 leading-relaxed">
        <strong>Catatan:</strong> Klik <strong>Simpan Perubahan</strong> di atas setelah selesai mengedit. Perubahan workflow ini akan otomatis berlaku ke tiket baru. Tiket yang sudah berjalan tetap pakai workflow lama.
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Per-stage inline editor
// --------------------------------------------------------------------------

function StageEditor({ stage, index, total, isAdmin, catColor, onUpdate, onMoveUp, onMoveDown, onDelete }: {
  stage: WorkflowStage;
  index: number;
  total: number;
  isAdmin: boolean;
  catColor: string;
  onUpdate: (p: Partial<WorkflowStage>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const fields = stage.fields ?? [];

  function toggleField(f: FieldType) {
    if (fields.includes(f)) onUpdate({ fields: fields.filter((x) => x !== f) });
    else onUpdate({ fields: [...fields, f] });
  }

  return (
    <div className="border border-[#e2e8f0] rounded-md overflow-hidden bg-white">
      {/* Header - collapsed */}
      <div className="flex items-center gap-2 p-2.5">
        {/* Index badge */}
        <div
          className="w-6 h-6 rounded-full grid place-items-center shrink-0 text-[11px] font-bold text-white"
          style={{ background: stage.isFinal ? "#10b981" : catColor }}
        >
          {index + 1}
        </div>
        {/* Inline label edit */}
        <input
          value={stage.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          disabled={!isAdmin}
          className="flex-1 px-2 py-1.5 text-sm font-semibold border border-transparent hover:border-[#e2e8f0] focus:border-[#1e40af]/40 rounded outline-none disabled:bg-transparent"
        />
        {/* Field count badge */}
        <span className="text-[10px] text-slate-500 shrink-0 hidden sm:inline">
          {fields.length} field {stage.isFinal && "· final"}
        </span>
        {/* Reorder buttons */}
        {isAdmin && (
          <>
            <button onClick={onMoveUp} disabled={index === 0} className="p-1 hover:bg-slate-100 rounded disabled:opacity-30">
              <ChevronUp style={{ width: 14, height: 14 }} />
            </button>
            <button onClick={onMoveDown} disabled={index === total - 1} className="p-1 hover:bg-slate-100 rounded disabled:opacity-30">
              <ChevronDown style={{ width: 14, height: 14 }} />
            </button>
          </>
        )}
        {/* Expand toggle */}
        <button onClick={() => setExpanded((s) => !s)} className="px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 rounded">
          {expanded ? "Tutup" : "Edit"}
        </button>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-[#e2e8f0] p-3 bg-slate-50 space-y-3">
          {/* Description */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1 block">Deskripsi (hint untuk teknisi)</label>
            <input
              value={stage.description ?? ""}
              onChange={(e) => onUpdate({ description: e.target.value })}
              disabled={!isAdmin}
              placeholder="Cek tools & material"
              className="w-full px-3 py-2 border border-[#e2e8f0] rounded-md text-sm bg-white disabled:bg-slate-50"
            />
          </div>

          {/* Fields multi-toggle */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2 block">
              Field yang harus diisi teknisi
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {FIELD_OPTIONS.map((f) => {
                const active = fields.includes(f.key);
                const Icon = f.icon;
                return (
                  <button
                    key={f.key}
                    onClick={() => toggleField(f.key)}
                    disabled={!isAdmin}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-md border-2 transition-all text-left",
                      active ? "border-[#1e40af] bg-[#1e40af]/5" : "border-[#e2e8f0] bg-white hover:border-[#cbd5e1]",
                      !isAdmin && "opacity-60 cursor-not-allowed"
                    )}
                  >
                    <Icon style={{ width: 14, height: 14 }} className={active ? "text-[#1e40af]" : "text-slate-400"} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-slate-900">{f.label}</div>
                      <div className="text-[9px] text-slate-500 truncate">{f.description}</div>
                    </div>
                    {active && <Check style={{ width: 14, height: 14 }} className="text-[#1e40af] shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Fields editor - admin define field arbitrary */}
          <CustomFieldsEditor
            fields={stage.customFields ?? []}
            isAdmin={isAdmin}
            onChange={(next) => onUpdate({ customFields: next })}
          />

          {/* SLA + isFinal */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1 block">SLA (menit)</label>
              <input
                type="number" min="0"
                value={stage.slaMinutes ?? ""}
                onChange={(e) => onUpdate({ slaMinutes: e.target.value ? Number(e.target.value) : undefined })}
                disabled={!isAdmin}
                placeholder="30"
                className="w-full px-3 py-2 border border-[#e2e8f0] rounded-md text-sm jbn-mono bg-white disabled:bg-slate-50"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded-md hover:bg-slate-100">
                <input
                  type="checkbox"
                  checked={!!stage.isFinal}
                  onChange={(e) => onUpdate({ isFinal: e.target.checked })}
                  disabled={!isAdmin}
                  className="w-4 h-4"
                />
                <div>
                  <div className="text-sm font-semibold">Stage Final</div>
                  <div className="text-[10px] text-slate-500">Tandai ini = tiket auto-resolved</div>
                </div>
              </label>
            </div>
          </div>

          {/* v4.2.18 (H): Advanced - Role + Auto-exit + Skip-if */}
          <div className="rounded-md border bg-white p-2.5 space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600"> Advanced (v4.2.18)</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1 block">Wajib di-execute oleh</label>
                <select
                  value={stage.requiredRole ?? "any"}
                  onChange={(e) => onUpdate({ requiredRole: e.target.value === "any" ? undefined : e.target.value as any })}
                  disabled={!isAdmin}
                  className="w-full px-2 py-1.5 border border-[#e2e8f0] rounded-md text-sm bg-white disabled:bg-slate-50"
                >
                  <option value="any">Siapa saja (lead/helper)</option>
                  <option value="lead">Lead Teknisi saja</option>
                  <option value="helper">Helper saja</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1 block">Auto-exit setelah (menit)</label>
                <input
                  type="number" min="0"
                  value={stage.autoExitAfterMinutes ?? ""}
                  onChange={(e) => onUpdate({ autoExitAfterMinutes: e.target.value ? Number(e.target.value) : undefined })}
                  disabled={!isAdmin}
                  placeholder="Tidak auto-exit"
                  className="w-full px-2 py-1.5 border border-[#e2e8f0] rounded-md text-sm jbn-mono bg-white disabled:bg-slate-50"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">Kosongin = stage tunggu manual advance.</p>
              </div>
            </div>

            <div className="border-t pt-2">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1 block">Skip stage ini kalau (conditional)</label>
              <div className="grid grid-cols-12 gap-1.5">
                <input
                  placeholder="Custom field key"
                  value={stage.skipIf?.customField ?? ""}
                  onChange={(e) => onUpdate({ skipIf: { ...stage.skipIf, customField: e.target.value, operator: stage.skipIf?.operator ?? "eq" } as any })}
                  disabled={!isAdmin}
                  className="col-span-5 px-2 py-1.5 border border-[#e2e8f0] rounded-md text-xs bg-white disabled:bg-slate-50"
                />
                <select
                  value={stage.skipIf?.operator ?? "eq"}
                  onChange={(e) => onUpdate({ skipIf: { ...stage.skipIf, operator: e.target.value as any } as any })}
                  disabled={!isAdmin}
                  className="col-span-3 px-1.5 py-1.5 border border-[#e2e8f0] rounded-md text-xs bg-white disabled:bg-slate-50"
                >
                  <option value="eq">=</option>
                  <option value="ne">≠</option>
                  <option value="exists">terisi</option>
                  <option value="not_exists">kosong</option>
                </select>
                <input
                  placeholder="Value"
                  value={stage.skipIf?.value ?? ""}
                  onChange={(e) => onUpdate({ skipIf: { ...stage.skipIf, value: e.target.value, customField: stage.skipIf?.customField ?? "", operator: stage.skipIf?.operator ?? "eq" } as any })}
                  disabled={!isAdmin || stage.skipIf?.operator === "exists" || stage.skipIf?.operator === "not_exists"}
                  className="col-span-3 px-2 py-1.5 border border-[#e2e8f0] rounded-md text-xs bg-white disabled:bg-slate-50"
                />
                {isAdmin && stage.skipIf && (
                  <button
                    onClick={() => onUpdate({ skipIf: undefined })}
                    className="col-span-1 hover:bg-rose-50 text-rose-600 rounded grid place-items-center"
                    title="Clear conditional"
                  >
                    <X style={{ width: 12, height: 12 }} />
                  </button>
                )}
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Misal stage "Splice Fiber" skip kalau custom field "fiber_ok" = "yes" → langsung lanjut ke stage berikutnya.
              </p>
            </div>
          </div>

          {/* Stage key (read-only display, technical info) */}
          <div className="text-[10px] text-slate-400">
            Key: <code className="jbn-mono bg-slate-100 px-1.5 py-0.5 rounded">{stage.key}</code>
          </div>

          {/* Delete stage */}
          {isAdmin && (
            <div className="pt-2 border-t border-[#e2e8f0]">
              <button
                onClick={onDelete}
                className="px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-md flex items-center gap-1.5"
              >
                <Trash2 style={{ width: 13, height: 13 }} /> Hapus stage ini
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// -- Helper -----------------------------------------------------------------

function parseStages(json: string | null): WorkflowStage[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) {
      return parsed
        .map((s: any, i: number) => ({
          key: s.key ?? `stage_${i}`,
          label: s.label ?? `Stage ${i + 1}`,
          description: s.description,
          fields: Array.isArray(s.fields) ? s.fields : [],
          customFields: Array.isArray(s.customFields) ? s.customFields : [],
          sortOrder: s.sortOrder ?? i + 1,
          slaMinutes: s.slaMinutes,
          isFinal: !!s.isFinal,
          icon: s.icon,
          color: s.color,
        }))
        .sort((a: WorkflowStage, b: WorkflowStage) => a.sortOrder - b.sortOrder);
    }
  } catch {}
  return [];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30) || `field_${Date.now().toString(36)}`;
}

// --------------------------------------------------------------------------
// Custom Fields editor - per-stage admin-defined fields
// --------------------------------------------------------------------------

const CUSTOM_TYPE_LABELS: Record<CustomFieldType, { label: string; hint: string }> = {
  text: { label: "Text", hint: "Input 1 baris" },
  number: { label: "Number", hint: "Angka dengan unit (mis: dBm, Mbps)" },
  textarea: { label: "Textarea", hint: "Input multi-baris" },
  select: { label: "Pilihan", hint: "Dropdown dengan options" },
  checkbox: { label: "Checkbox", hint: "Toggle ya/tidak" },
  date: { label: "Tanggal", hint: "Date picker" },
};

function CustomFieldsEditor({ fields, isAdmin, onChange }: {
  fields: CustomField[];
  isAdmin: boolean;
  onChange: (next: CustomField[]) => void;
}) {
  const [adding, setAdding] = useState(false);

  function addNew(field: CustomField) {
    onChange([...fields, field]);
    setAdding(false);
  }
  function update(idx: number, partial: Partial<CustomField>) {
    onChange(fields.map((f, i) => i === idx ? { ...f, ...partial } : f));
  }
  function remove(idx: number) {
    if (!confirm(`Hapus field "${fields[idx].label}"?`)) return;
    onChange(fields.filter((_, i) => i !== idx));
  }
  function move(idx: number, dir: -1 | 1) {
    const next = [...fields];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  }

  return (
    <div className="border-t border-[#e2e8f0] pt-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Field Tambahan (Custom)</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Field di luar 10 built-in - bebas atur sesuai kebutuhan</div>
        </div>
        {isAdmin && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="px-2.5 py-1 bg-white border border-[#1e40af]/30 text-[#1e40af] text-[11px] font-semibold rounded-md flex items-center gap-1 hover:bg-[#1e40af]/5"
          >
            <Plus style={{ width: 12, height: 12 }} /> Tambah Field
          </button>
        )}
      </div>

      {fields.length === 0 && !adding && (
        <div className="text-center py-4 text-[11px] text-slate-400 bg-white border border-dashed border-[#e2e8f0] rounded-md">
          Belum ada custom field. Klik <strong>Tambah Field</strong> untuk bikin sendiri.
        </div>
      )}

      {fields.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {fields.map((field, i) => (
            <CustomFieldRow
              key={field.key + i}
              field={field}
              index={i}
              total={fields.length}
              isAdmin={isAdmin}
              onUpdate={(p) => update(i, p)}
              onMoveUp={() => move(i, -1)}
              onMoveDown={() => move(i, 1)}
              onDelete={() => remove(i)}
            />
          ))}
        </div>
      )}

      {adding && (
        <CustomFieldForm
          onSubmit={addNew}
          onCancel={() => setAdding(false)}
          existingKeys={new Set(fields.map((f) => f.key))}
        />
      )}
    </div>
  );
}

function CustomFieldRow({ field, index, total, isAdmin, onUpdate, onMoveUp, onMoveDown, onDelete }: {
  field: CustomField;
  index: number;
  total: number;
  isAdmin: boolean;
  onUpdate: (p: Partial<CustomField>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const typeMeta = CUSTOM_TYPE_LABELS[field.type];

  return (
    <div className="bg-white border border-[#e2e8f0] rounded-md overflow-hidden">
      <div className="flex items-center gap-2 px-2.5 py-2">
        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 shrink-0">
          {typeMeta.label}
        </span>
        <input
          value={field.label}
          onChange={(e) => onUpdate({ label: e.target.value, key: field.key || slugify(e.target.value) })}
          disabled={!isAdmin}
          className="flex-1 px-2 py-1 text-sm font-semibold border border-transparent hover:border-[#e2e8f0] focus:border-[#1e40af]/40 rounded outline-none min-w-0"
        />
        {field.required && <span className="text-rose-500 text-xs shrink-0" title="Required">*</span>}
        {isAdmin && (
          <>
            <button onClick={onMoveUp} disabled={index === 0} className="p-1 hover:bg-slate-100 rounded disabled:opacity-30">
              <ChevronUp style={{ width: 12, height: 12 }} />
            </button>
            <button onClick={onMoveDown} disabled={index === total - 1} className="p-1 hover:bg-slate-100 rounded disabled:opacity-30">
              <ChevronDown style={{ width: 12, height: 12 }} />
            </button>
          </>
        )}
        <button onClick={() => setOpen((s) => !s)} className="px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 rounded">
          {open ? "Tutup" : "Edit"}
        </button>
      </div>

      {open && (
        <div className="border-t border-[#e2e8f0] p-2.5 bg-slate-50 space-y-2.5">
          {/* Type select */}
          <div>
            <label className="text-[10px] font-semibold text-slate-600 mb-1 block">Tipe</label>
            <select
              value={field.type}
              onChange={(e) => onUpdate({ type: e.target.value as CustomFieldType })}
              disabled={!isAdmin}
              className="w-full px-2 py-1.5 border border-[#e2e8f0] rounded text-xs bg-white"
            >
              {Object.entries(CUSTOM_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v.label} - {v.hint}</option>
              ))}
            </select>
          </div>

          {/* Hint + placeholder */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-semibold text-slate-600 mb-1 block">Hint</label>
              <input
                value={field.hint ?? ""}
                onChange={(e) => onUpdate({ hint: e.target.value || undefined })}
                disabled={!isAdmin}
                placeholder="Helper text"
                className="w-full px-2 py-1.5 border border-[#e2e8f0] rounded text-xs bg-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-600 mb-1 block">Placeholder</label>
              <input
                value={field.placeholder ?? ""}
                onChange={(e) => onUpdate({ placeholder: e.target.value || undefined })}
                disabled={!isAdmin}
                placeholder="Contoh value"
                className="w-full px-2 py-1.5 border border-[#e2e8f0] rounded text-xs bg-white"
              />
            </div>
          </div>

          {/* Number unit + select options */}
          {field.type === "number" && (
            <div>
              <label className="text-[10px] font-semibold text-slate-600 mb-1 block">Unit (opsional)</label>
              <input
                value={field.unit ?? ""}
                onChange={(e) => onUpdate({ unit: e.target.value || undefined })}
                disabled={!isAdmin}
                placeholder="dBm, Mbps, ms, dst."
                className="w-full px-2 py-1.5 border border-[#e2e8f0] rounded text-xs bg-white"
              />
            </div>
          )}
          {field.type === "select" && (
            <div>
              <label className="text-[10px] font-semibold text-slate-600 mb-1 block">Pilihan (pisah dengan koma)</label>
              <input
                value={(field.options ?? []).join(", ")}
                onChange={(e) => onUpdate({ options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                disabled={!isAdmin}
                placeholder="Opsi A, Opsi B, Opsi C"
                className="w-full px-2 py-1.5 border border-[#e2e8f0] rounded text-xs bg-white"
              />
            </div>
          )}

          {/* Required + key */}
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!field.required}
                onChange={(e) => onUpdate({ required: e.target.checked })}
                disabled={!isAdmin}
                className="w-3.5 h-3.5"
              />
              <span className="text-xs font-semibold">Required (wajib diisi)</span>
            </label>
            <span className="text-[10px] text-slate-400">
              Key: <code className="jbn-mono bg-slate-200 px-1 rounded">{field.key}</code>
            </span>
          </div>

          {isAdmin && (
            <button
              onClick={onDelete}
              className="text-[10px] font-semibold text-rose-600 hover:bg-rose-50 px-2 py-1 rounded flex items-center gap-1"
            >
              <Trash2 style={{ width: 11, height: 11 }} /> Hapus field
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CustomFieldForm({ onSubmit, onCancel, existingKeys }: {
  onSubmit: (field: CustomField) => void;
  onCancel: () => void;
  existingKeys: Set<string>;
}) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<CustomFieldType>("text");
  const [required, setRequired] = useState(false);

  function handleAdd() {
    const trimmed = label.trim();
    if (!trimmed) { toast.error("Label wajib"); return; }
    let key = slugify(trimmed);
    let suffix = 1;
    while (existingKeys.has(key)) { key = `${slugify(trimmed)}_${suffix}`; suffix++; }
    onSubmit({ key, label: trimmed, type, required });
  }

  return (
    <div className="bg-white border-2 border-dashed border-[#1e40af]/30 rounded-md p-2.5">
      <div className="grid grid-cols-[1fr_auto] gap-2 mb-2">
        <input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          placeholder="Label field (mis: Suhu Ruangan ONT)"
          className="px-2.5 py-1.5 border border-[#e2e8f0] rounded text-sm"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as CustomFieldType)}
          className="px-2 py-1.5 border border-[#e2e8f0] rounded text-xs bg-white"
        >
          {Object.entries(CUSTOM_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
            className="w-3.5 h-3.5"
          />
          <span className="text-xs">Required</span>
        </label>
        <div className="flex gap-1">
          <button onClick={onCancel} className="px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-100 rounded">Batal</button>
          <button
            onClick={handleAdd}
            disabled={!label.trim()}
            className="px-3 py-1 bg-[#1e40af] hover:bg-[#1e3a8a] text-white text-xs font-semibold rounded disabled:opacity-50"
          >
            Tambah
          </button>
        </div>
      </div>
    </div>
  );
}
