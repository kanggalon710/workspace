import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { type Ticket, type TicketCategory } from "@/components/tickets/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Plus, Settings, CheckCircle2, Pause, Loader2, Trash2, X, Camera, MapPin, StickyNote, PenLine, Flag } from "lucide-react";
import { TeamPanel, FRONTEND_WORKFLOW_PRESETS } from "@/components/tickets/panels";

export function CategoryManagementDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#3B82F6");
  const [newIcon, setNewIcon] = useState("");
  const [newSortOrder, setNewSortOrder] = useState("0");
  const [newSla, setNewSla] = useState("4");
  const [newPreset, setNewPreset] = useState("gangguan");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editSortOrder, setEditSortOrder] = useState("");
  const [editSla, setEditSla] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const { data: cats = [], isLoading } = useQuery<(TicketCategory & { workflowStages?: string | null; slaHours?: number | null })[]>({
    queryKey: ["ticket-categories"],
    queryFn: () => api.get<any[]>("/ticket-categories"),
    enabled: open,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["ticket-categories"] });

  const createMut = useMutation({
    mutationFn: (body: any) => api.post("/ticket-categories", body),
    onSuccess: () => {
      invalidate();
      setNewName(""); setNewColor("#3B82F6"); setNewIcon(""); setNewSortOrder("0"); setNewSla("4"); setNewPreset("gangguan");
      toast.success("Kategori ditambahkan dengan workflow preset");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // v4.2.4: apply workflow preset ke kategori existing
  const applyPresetMut = useMutation({
    mutationFn: ({ id, preset, slaHours }: { id: number; preset: string; slaHours?: number }) => {
      const stages = FRONTEND_WORKFLOW_PRESETS[preset]?.stages;
      if (!stages) throw new Error("Preset tidak ditemukan");
      const body: any = { workflowStages: JSON.stringify(stages) };
      if (slaHours) body.slaHours = slaHours;
      return api.put(`/ticket-categories/${id}`, body);
    },
    onSuccess: () => { invalidate(); toast.success("Workflow di-update"); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => api.put(`/ticket-categories/${id}`, body),
    onSuccess: () => { invalidate(); setEditId(null); toast.success("Kategori diperbarui"); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/ticket-categories/${id}`),
    onSuccess: () => { invalidate(); setDeleteConfirmId(null); toast.success("Kategori dihapus"); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleActive = (cat: TicketCategory) => {
    updateMut.mutate({ id: cat.id, body: { name: cat.name, color: cat.color, icon: cat.icon, sortOrder: cat.sortOrder, isActive: cat.isActive === 1 ? 0 : 1 } });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      {/* ==== Ticket category management dialog ==== */}
      <DialogContent data-section="ticket-category-dialog" className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Kelola Kategori Tiket</DialogTitle>
          <DialogDescription>Tambah, ubah, atau hapus kategori work order</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            {/* Existing categories */}
            <div className="space-y-2">
              {cats.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Belum ada kategori</p>}
              {cats.map((cat) => {
                const isExpanded = expandedId === cat.id;
                let stages: any[] = [];
                try { if (cat.workflowStages) stages = JSON.parse(cat.workflowStages); } catch {}
                stages.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
                return (
                  <div key={cat.id} className="rounded-lg border bg-white overflow-hidden">
                    <div className="flex items-center gap-2 p-2.5 flex-wrap">
                      {editId === cat.id ? (
                        <>
                          <input type="color" className="w-8 h-8 rounded cursor-pointer border-0 p-0" value={editColor} onChange={(e) => setEditColor(e.target.value)} />
                          <Input className="flex-1 min-w-[100px] h-8" value={editName} onChange={(e) => setEditName(e.target.value)} />
                          <Input className="w-14 h-8" type="number" value={editSortOrder} onChange={(e) => setEditSortOrder(e.target.value)} title="Sort order" />
                          <Input className="w-16 h-8" type="number" value={editSla} onChange={(e) => setEditSla(e.target.value)} placeholder="SLA" title="SLA jam" />
                          <Button size="sm" variant="ghost" disabled={updateMut.isPending} onClick={() => {
                            if (!editName.trim()) { toast.error("Nama wajib diisi"); return; }
                            updateMut.mutate({ id: cat.id, body: { name: editName.trim(), color: editColor, icon: cat.icon, sortOrder: Number(editSortOrder) || 0, slaHours: Number(editSla) || null } });
                          }}>
                            {updateMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 text-green-600" />}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                            <X className="w-4 h-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: cat.color ?? "#6B7280" }} />
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : cat.id)}
                            className="flex-1 min-w-0 truncate text-sm font-medium text-gray-800 text-left hover:text-blue-600"
                          >
                            {cat.name}
                          </button>
                          {cat.slaHours && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200" title="SLA target">
                              SLA {cat.slaHours}j
                            </span>
                          )}
                          <span className="text-[10px] font-mono text-gray-400" title="Jumlah stage">
                            {stages.length || 0} stage
                          </span>
                          <Badge variant={cat.isActive === 0 ? "secondary" : "default"} className="text-[10px] py-0">
                            {cat.isActive === 0 ? "Off" : "On"}
                          </Badge>
                          <Button size="sm" variant="ghost" onClick={() => toggleActive(cat)} title={cat.isActive === 0 ? "Aktifkan" : "Nonaktifkan"}>
                            {cat.isActive === 0 ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Pause className="w-4 h-4 text-amber-500" />}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setEditId(cat.id); setEditName(cat.name); setEditColor(cat.color ?? "#6B7280"); setEditSortOrder(String(cat.sortOrder ?? 0)); setEditSla(String(cat.slaHours ?? "")); }}>
                            <Settings className="w-4 h-4 text-gray-400" />
                          </Button>
                          {deleteConfirmId === cat.id ? (
                            <div className="flex items-center gap-1">
                              <Button size="sm" variant="destructive" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate(cat.id)}>
                                {deleteMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Ya"}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setDeleteConfirmId(null)}>Batal</Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => setDeleteConfirmId(cat.id)}>
                              <Trash2 className="w-4 h-4 text-red-400" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                    {/* v4.2.4: Workflow stages preview */}
                    {isExpanded && (
                      <div className="border-t bg-muted/30 p-3">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Workflow Stages</div>
                        {stages.length === 0 ? (
                          <div className="text-xs text-muted-foreground italic">Belum ada workflow. Pilih preset di bawah.</div>
                        ) : (
                          <div className="space-y-1">
                            {stages.map((s: any, idx: number) => (
                              <div key={s.key} className="flex items-center gap-2 text-xs">
                                <span className="font-mono w-5 text-muted-foreground">{idx + 1}.</span>
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color ?? "#6B7280" }} />
                                <span className="font-medium text-gray-800 flex-1">{s.label}</span>
                                {s.slaMinutes && <span className="font-mono text-[10px] text-muted-foreground">~{s.slaMinutes}m</span>}
                                <div className="flex gap-0.5">
                                  {s.requiresPhoto && <span title="Wajib foto"><Camera className="size-3 text-muted-foreground" /></span>}
                                  {s.requiresGps && <span title="Wajib GPS"><MapPin className="size-3 text-muted-foreground" /></span>}
                                  {s.requiresNote && <span title="Wajib catatan"><StickyNote className="size-3 text-muted-foreground" /></span>}
                                  {s.requiresSignature && <span title="Wajib TTD"><PenLine className="size-3 text-muted-foreground" /></span>}
                                  {s.isFinal && <span title="Stage final"><Flag className="size-3 text-muted-foreground" /></span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="mt-3 pt-2 border-t border-muted">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Apply Preset Workflow</div>
                          <div className="flex gap-1.5 flex-wrap">
                            {Object.entries(FRONTEND_WORKFLOW_PRESETS).map(([key, p]) => (
                              <Button
                                key={key}
                                size="sm"
                                variant="outline"
                                disabled={applyPresetMut.isPending}
                                onClick={() => {
                                  if (confirm(`Apply preset "${p.label}" ke kategori "${cat.name}"? Workflow lama akan diganti.`)) {
                                    applyPresetMut.mutate({ id: cat.id, preset: key });
                                  }
                                }}
                                className="h-7 text-xs"
                                title={p.description}
                              >
                                {p.label}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add new category */}
            <div className="border-t pt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Tambah Kategori Baru</p>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <input type="color" className="w-8 h-8 rounded cursor-pointer border-0 p-0" value={newColor} onChange={(e) => setNewColor(e.target.value)} />
                <Input className="flex-1 min-w-[120px] h-9" placeholder="Nama kategori" value={newName} onChange={(e) => setNewName(e.target.value)} />
                <Input className="w-20 h-9" placeholder="Ikon" value={newIcon} onChange={(e) => setNewIcon(e.target.value)} title="Nama ikon (opsional)" />
                <Input className="w-14 h-9" type="number" placeholder="Urut" value={newSortOrder} onChange={(e) => setNewSortOrder(e.target.value)} title="Sort order" />
                <Input className="w-14 h-9" type="number" placeholder="SLA" value={newSla} onChange={(e) => setNewSla(e.target.value)} title="SLA jam" />
              </div>
              <div className="flex items-center gap-2">
                <Select value={newPreset} onValueChange={setNewPreset}>
                  <SelectTrigger className="h-9 flex-1 text-xs">
                    <SelectValue placeholder="Pilih workflow preset" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FRONTEND_WORKFLOW_PRESETS).map(([key, p]) => (
                      <SelectItem key={key} value={key} className="text-xs">
                        {p.label} - {p.stages.length} stage
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" disabled={!newName.trim() || createMut.isPending} onClick={() => {
                  const preset = FRONTEND_WORKFLOW_PRESETS[newPreset];
                  createMut.mutate({
                    name: newName.trim(),
                    color: newColor,
                    icon: newIcon || null,
                    sortOrder: Number(newSortOrder) || 0,
                    slaHours: Number(newSla) || null,
                    workflowStages: preset ? JSON.stringify(preset.stages) : null,
                  });
                }}>
                  {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" />Tambah</>}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                Preset menentukan urutan stage workflow yang akan diikuti teknisi (bisa diubah kapan saja setelah dibuat).
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// -------------------------------------------------------------------------
// v4.2.16: TeamPanel - multi-teknisi (lead + helpers untuk kerja barengan di lapangan)
// -------------------------------------------------------------------------

