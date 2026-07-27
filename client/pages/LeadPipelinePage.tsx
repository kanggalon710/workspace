import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { waLink } from "@/lib/wa";
import { InfoRow } from "@/components/pipelines/InfoRow";
import { useAuth } from "@/context/AuthContext";
import {
  LEAD_STAGES, LEAD_STAGE_LABELS, LEAD_STAGE_COLORS,
  LEAD_CATEGORY_LABELS,
  type Lead, type LeadStage, type LeadActivity,
} from "../../shared/schema";
import { canonicalLeadSource, LEAD_SOURCE_LABELS } from "@shared/leadSources";
import {
  ListChecks, Phone, MapPin, User, X, MessageSquare, PhoneCall, Navigation,
  ArrowRight, CheckCircle2, XCircle, RefreshCw, EyeOff,
  StickyNote, ChevronRight, ChevronLeft, LayoutGrid, List, Star,
  Home, Briefcase, Building2, GraduationCap, HelpCircle, TrendingUp,
  UserPlus, Eye, Loader2, Pencil, Trash2, Camera, Clock, Move, Upload,
  Flame, Zap, AlertTriangle, Calendar, SlidersHorizontal, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// -- Types ------------------------------------------------------------------
interface UserItem { id: number; name: string; username: string; role: string; }
interface LeadDetail extends Lead { activities?: LeadActivity[] }
interface OdpItem { id: number; name: string; }
interface CustomerItem { id: number; leadId?: number | null; }
interface MikrotikRouter { id: number; name: string; host: string; }
interface PppProfile { name: string; }

const CAT_ICONS: Record<string, any> = {
  rumahan: Home, bisnis: Briefcase, perkantoran: Building2,
  sekolah: GraduationCap, lainnya: HelpCircle,
};
const CAT_COLORS: Record<string, string> = {
  rumahan: "#22C55E", bisnis: "#F59E0B", perkantoran: "#3B82F6",
  sekolah: "#8B5CF6", lainnya: "#6B7280",
};
const sourceLabel = (s: string | null | undefined) => LEAD_SOURCE_LABELS[canonicalLeadSource(s)];
const ACTIVITY_CFG: Record<string, { label: string; icon: any; color: string }> = {
  note: { label: "Catatan", icon: StickyNote, color: "text-gray-500" },
  call: { label: "Telepon", icon: PhoneCall, color: "text-blue-500" },
  whatsapp: { label: "WhatsApp", icon: MessageSquare, color: "text-green-500" },
  visit: { label: "Kunjungan", icon: Navigation, color: "text-purple-500" },
  stage_change: { label: "Pindah Stage", icon: ArrowRight, color: "text-amber-500" },
  assigned: { label: "Ditugaskan", icon: User, color: "text-indigo-500" },
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}
function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// -- Time range filter (by lead createdAt) -----------------------------------
type RangePreset = "all" | "7d" | "30d" | "custom";
const RANGE_LABELS: Record<RangePreset, string> = {
  all: "Semua",
  "7d": "7 hari",
  "30d": "30 hari",
  custom: "Custom",
};

// -- Convert Lead Dialog ---------------------------------------------------
function ConvertLeadDialog({ lead, odps, open, onOpenChange }: {
  lead: LeadDetail;
  odps: OdpItem[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [customerId, setCustomerId] = useState("");
  const [generatingId, setGeneratingId] = useState(false);
  const [pkg, setPkg] = useState("");
  const [routerId, setRouterId] = useState<number | null>(null);
  const [profileName, setProfileName] = useState("");
  const [pppUser, setPppUser] = useState("");
  const [pppPass, setPppPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [createWO, setCreateWO] = useState(true);

  // Auto-generate customer ID on open
  const generateId = async () => {
    setGeneratingId(true);
    try {
      const res = await api.get<{ customerId: string }>(`/customers/generate-id?district=${encodeURIComponent(lead.district || "")}`);
      setCustomerId(res.customerId);
    } catch { /* user can type manually */ }
    setGeneratingId(false);
  };
  // Auto-generate on first open
  useEffect(() => { if (open && !customerId) generateId(); }, [open]);

  const { data: routers = [] } = useQuery<MikrotikRouter[]>({
    queryKey: ["mikrotik_routers"],
    queryFn: () => api.get<MikrotikRouter[]>("/mikrotik/routers"),
    enabled: open,
  });

  const { data: profiles = [] } = useQuery<PppProfile[]>({
    queryKey: ["mikrotik_profiles", routerId],
    queryFn: () => api.get<PppProfile[]>(`/mikrotik/routers/${routerId}/ppp/profile`),
    enabled: open && routerId !== null,
  });

  const convertMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post(`/marketing/leads/${lead.id}/convert`, body),
    onSuccess: () => {
      toast.success("Lead berhasil dikonversi menjadi pelanggan!");
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead_detail", lead.id] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["map-data"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const odpName = odps.find(o => o.id === lead.odpId)?.name ?? "-";
  const canSubmit = customerId.trim() && pkg.trim();

  function handleSubmit() {
    if (!canSubmit) return;
    convertMut.mutate({
      customerId: customerId.trim(),
      package: pkg.trim(),
      ...(pppUser.trim() ? { pppoeUsername: pppUser.trim() } : {}),
      ...(pppPass.trim() ? { pppoePassword: pppPass.trim() } : {}),
      ...(profileName ? { pppoeProfile: profileName } : {}),
      ...(routerId ? { pppoeRouterId: routerId } : {}),
      createWorkOrder: createWO,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-green-600" />
            Konversi Lead ke Pelanggan
          </DialogTitle>
          <DialogDescription>Jadikan lead ini sebagai pelanggan aktif</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Read-only info */}
          <div className="rounded-lg border bg-muted/50 p-3 space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Data Lead</p>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <span className="text-muted-foreground">Nama</span>
              <span className="font-medium text-foreground">{lead.name}</span>
              <span className="text-muted-foreground">Telepon</span>
              <span className="text-foreground">{lead.phone || "-"}</span>
              <span className="text-muted-foreground">Alamat</span>
              <span className="text-foreground">{lead.address || "-"}</span>
              <span className="text-muted-foreground">ODP Terdekat</span>
              <span className="text-foreground">{odpName}</span>
              <span className="text-muted-foreground">Jarak</span>
              <span className="text-foreground">{lead.distanceMeters != null ? `${lead.distanceMeters} m` : "-"}</span>
            </div>
          </div>

          {/* Required inputs */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">ID Pelanggan <span className="text-red-500">*</span></label>
              <div className="flex gap-2">
                <Input placeholder="26041030001" value={customerId} onChange={e => setCustomerId(e.target.value)} className="font-mono" />
                <Button type="button" variant="outline" size="sm" className="shrink-0 text-xs" onClick={generateId} disabled={generatingId}>
                  {generatingId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">Format: YYMMCKKNNNNN - TH+BL+Cycle+Kec+Urut (auto)</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Paket Layanan <span className="text-red-500">*</span></label>
              <Input placeholder="Contoh: 20 Mbps" value={pkg} onChange={e => setPkg(e.target.value)} />
            </div>
          </div>

          {/* PPPoE section */}
          <div className="rounded-lg border border-dashed bg-muted/30 p-3 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Akun PPPoE (Opsional)</p>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Router MikroTik</label>
              <select value={routerId ?? ""} onChange={e => { setRouterId(e.target.value ? parseInt(e.target.value) : null); setProfileName(""); }}
                className="w-full text-sm rounded-md border border-input bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">- Pilih Router -</option>
                {routers.map(r => <option key={r.id} value={r.id}>{r.name} ({r.host})</option>)}
              </select>
            </div>
            {routerId && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Profile MikroTik</label>
                <select value={profileName} onChange={e => setProfileName(e.target.value)}
                  className="w-full text-sm rounded-md border border-input bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">- Pilih Profile -</option>
                  {profiles.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                </select>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Username PPPoE</label>
              <Input placeholder="username" value={pppUser} onChange={e => setPppUser(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Password PPPoE</label>
              <div className="relative">
                <Input type={showPass ? "text" : "password"} placeholder="password" value={pppPass} onChange={e => setPppPass(e.target.value)} className="pr-9" />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground">
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Work Order checkbox */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={createWO} onChange={e => setCreateWO(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500" />
            <span className="text-sm text-foreground">Buat Work Order Pemasangan</span>
          </label>

          {/* Submit */}
          <Button onClick={handleSubmit} disabled={!canSubmit || convertMut.isPending}
            className="w-full bg-green-600 hover:bg-green-700 text-white">
            {convertMut.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4 mr-2" />
            )}
            Konversi ke Pelanggan
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// -- Lead Detail Drawer -----------------------------------------------------
function LeadDrawer({ leadId, users, odps, convertedLeadIds, onClose, onConvert, onDelete }: {
  leadId: number; users: UserItem[]; odps: OdpItem[]; convertedLeadIds: Set<number>; onClose: () => void; onConvert?: (lead: LeadDetail) => void; onDelete?: (leadId: number) => void;
}) {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const [newNote, setNewNote] = useState("");
  const [noteType, setNoteType] = useState<"note"|"call"|"whatsapp"|"visit">("note");
  const [showLossReason, setShowLossReason] = useState(false);
  const [lossReason, setLossReason] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", phone: "", address: "", category: "", notes: "", priority: "" });
  const [activityPhoto, setActivityPhoto] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const isSupervisor = me?.role === "admin" || me?.role === "marketing_spv";
  const canEdit = (lead: LeadDetail) => lead.createdBy === me?.id || me?.role === "admin";

  const handleSaveEdit = async () => {
    try {
      await api.put(`/marketing/leads/${leadId}`, editForm);
      toast.success("Lead berhasil diperbarui");
      setIsEditing(false);
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead_detail", leadId] });
    } catch (e: any) {
      toast.error(e.message || "Gagal menyimpan");
    }
  };

  const { data: lead, isLoading } = useQuery<LeadDetail>({
    queryKey: ["lead_detail", leadId],
    queryFn: () => api.get<LeadDetail>(`/marketing/leads/${leadId}`),
  });

  const inv = () => {
    qc.invalidateQueries({ queryKey: ["leads"] });
    qc.invalidateQueries({ queryKey: ["lead_detail", leadId] });
  };

  const addNote = useMutation({
    mutationFn: (d: { type: string; content: string; photoData?: string }) =>
      api.post(`/marketing/leads/${leadId}/activity`, d),
    onSuccess: () => { inv(); setNewNote(""); setActivityPhoto(null); toast.success("Catatan ditambahkan"); },
    onError: (e: any) => toast.error(e.message),
  });
  const changeStage = useMutation({
    mutationFn: ({ stage, reason }: { stage: LeadStage; reason?: string }) =>
      api.patch(`/marketing/leads/${leadId}/stage`, { stage, lossReason: reason }),
    onSuccess: () => { inv(); setShowLossReason(false); toast.success("Stage diperbarui"); },
    onError: (e: any) => toast.error(e.message),
  });
  const assignLead = useMutation({
    mutationFn: (assignedTo: number | null) => api.patch(`/marketing/leads/${leadId}/assign`, { assignedTo }),
    onSuccess: () => { inv(); toast.success("Lead ditugaskan"); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteLead = useMutation({
    mutationFn: () => api.delete(`/marketing/leads/${leadId}`),
    onSuccess: () => { toast.success("Lead dihapus"); qc.invalidateQueries({ queryKey: ["leads"] }); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("File harus berupa gambar");
      return;
    }
    // Auto-compress (no size limit - user upload apapun oke)
    try {
      const { compressImage, formatBytes } = await import("@/lib/imageCompress");
      const result = await compressImage(file);
      setActivityPhoto(result.dataUrl);
      setNoteType("note");
      const ratio = result.originalBytes > 0
        ? Math.round((1 - result.compressedBytes / result.originalBytes) * 100)
        : 0;
      if (ratio > 30) {
        toast.success(`Foto di-compress ${formatBytes(result.originalBytes)} → ${formatBytes(result.compressedBytes)}`, { duration: 2000 });
      }
    } catch (err: any) {
      toast.error(err?.message || "Gagal proses foto");
    }
  };

  if (isLoading || !lead) {
    return (
      <Dialog open={true} onOpenChange={() => onClose()}>
        <DialogContent className="max-w-2xl">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const activities = lead.activities ?? [];
  const assignedUser = users.find(u => u.id === lead.assignedTo);
  const stageColor = LEAD_STAGE_COLORS[lead.stage as LeadStage] ?? "#6B7280";
  const currentIdx = LEAD_STAGES.indexOf(lead.stage as LeadStage);
  const nextStage = currentIdx < LEAD_STAGES.length - 1 ? LEAD_STAGES[currentIdx + 1] : null;
  const marketingUsers = users.filter(u => ["marketing", "marketing_spv", "admin"].includes(u.role));
  const ageDays = Math.floor((Date.now() - new Date(lead.createdAt).getTime()) / 86400000);
  const isConverted = convertedLeadIds.has(lead.id);

  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <DialogTitle className="truncate">{lead.name}</DialogTitle>
              <DialogDescription className="flex items-center gap-2 flex-wrap mt-1">
                <Badge variant="secondary" className="text-[10px]" style={{ backgroundColor: stageColor + "20", color: stageColor }}>
                  {LEAD_STAGE_LABELS[lead.stage as LeadStage]}
                </Badge>
                <span className="text-[11px] text-muted-foreground">
                  {LEAD_CATEGORY_LABELS[lead.category as keyof typeof LEAD_CATEGORY_LABELS] ?? lead.category ?? "-"} • {sourceLabel(lead.source)}
                </span>
              </DialogDescription>
            </div>
            <div className="flex gap-1 shrink-0 mr-8">
              {canEdit(lead) && !isEditing && (
                <Button size="icon" variant="ghost" onClick={() => {
                  setEditForm({
                    name: lead.name || "",
                    phone: lead.phone || "",
                    address: lead.address || "",
                    category: lead.category || "lainnya",
                    notes: lead.notes || "",
                    priority: lead.priority || "medium",
                  });
                  setIsEditing(true);
                }} title="Edit lead">
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
              {/* Tombol Hapus dipindah ke footer drawer (jauh dari close X) untuk hindari misclick */}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-4">
          {isEditing ? (
            <div className="space-y-3 border rounded-md p-3 bg-muted/30">
              <Label className="text-xs">Edit Lead</Label>
              <div className="space-y-2">
                <div><Label className="text-[10px]">Nama</Label><Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="text-sm" /></div>
                <div><Label className="text-[10px]">Telepon</Label><Input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} className="text-sm" /></div>
                <div><Label className="text-[10px]">Alamat</Label><Input value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} className="text-sm" /></div>
                <div>
                  <Label className="text-[10px]">Kategori</Label>
                  <select value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm">
                    <option value="rumahan">Rumahan</option>
                    <option value="bisnis">Bisnis</option>
                    <option value="perkantoran">Perkantoran</option>
                    <option value="sekolah">Sekolah</option>
                    <option value="lainnya">Lainnya</option>
                  </select>
                </div>
                <div>
                  <Label className="text-[10px]">Prioritas</Label>
                  <select value={editForm.priority} onChange={e => setEditForm(f => ({ ...f, priority: e.target.value }))}
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div><Label className="text-[10px]">Catatan</Label><Textarea rows={2} value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} className="text-sm" /></div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={handleSaveEdit} className="flex-1">Simpan</Button>
                <Button size="sm" variant="outline" onClick={() => setIsEditing(false)} className="flex-1">Batal</Button>
              </div>
            </div>
          ) : (
            <>
              {/* Wilayah banner - highlight lokasi lead supaya gampang scan */}
              {(() => {
                const village = (lead as any).village?.trim();
                const district = (lead as any).district?.trim();
                const address = lead.address?.trim();
                const hasCoords = lead.lat != null && lead.lng != null;
                const wilayahLines: string[] = [];
                if (village) wilayahLines.push(village);
                if (district) wilayahLines.push(district);
                const hasWilayah = wilayahLines.length > 0;

                // ODP reference - important untuk coverage planning
                const linkedOdp = lead.odpId != null ? odps.find((o) => o.id === lead.odpId) : null;
                const hasOdp = !!linkedOdp;

                return (
                  <div className={`rounded-md p-3 border ${hasWilayah ? "bg-primary/5 border-primary/20" : "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40"}`}>
                    <div className="flex items-start gap-2">
                      <MapPin className={`h-4 w-4 shrink-0 mt-0.5 ${hasWilayah ? "text-primary" : "text-amber-600"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Lokasi Lead</div>
                        {hasWilayah ? (
                          <div className="font-semibold text-sm">{wilayahLines.join(", ")}</div>
                        ) : (
                          <div className="font-medium text-sm text-amber-700 dark:text-amber-300">Wilayah belum diisi</div>
                        )}
                        {address && (
                          <div className="text-xs text-muted-foreground mt-0.5 break-words">{address}</div>
                        )}
                        {hasCoords && (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${lead.lat},${lead.lng}`}
                            target="_blank" rel="noreferrer"
                            className="text-[10px] text-primary hover:underline inline-flex items-center gap-1 mt-1 font-mono"
                          >
                            <Navigation className="h-3 w-3" /> {Number(lead.lat).toFixed(5)}, {Number(lead.lng).toFixed(5)}
                          </a>
                        )}
                        {!hasWilayah && !address && !hasCoords && (
                          <div className="text-[11px] text-amber-700 dark:text-amber-300 mt-1">
                            Tidak ada data lokasi. Edit lead untuk isi alamat/wilayah.
                          </div>
                        )}

                        {/* ODP reference - critical untuk instalasi */}
                        <div className="mt-2 pt-2 border-t flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${hasOdp ? "bg-green-500" : "bg-red-500"}`} />
                          <div className="flex-1 min-w-0 text-xs">
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">ODP Terdekat: </span>
                            {hasOdp ? (
                              <span className="font-semibold">
                                {linkedOdp!.name}
                                {lead.distanceMeters != null && (
                                  <span className="ml-1.5 text-muted-foreground font-normal">
                                    ({lead.distanceMeters}m{lead.distanceMeters > 500 ? " jauh" : ""})
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-red-600 dark:text-red-400 font-medium">Belum terhubung ke ODP</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <InfoRow label="Sumber" value={sourceLabel(lead.source)} />
                {lead.campaign && <InfoRow label="Campaign" value={lead.campaign} />}
                {lead.adSet && <InfoRow label="Ad Set" value={lead.adSet} />}
                {lead.adName && <InfoRow label="Ad Name" value={lead.adName} />}
                <InfoRow label="Masuk" value={fmtDate(lead.createdAt)} />
                <InfoRow label="Age" value={`${ageDays} hari`} />
                <InfoRow label="Prioritas" value={(lead.priority ?? "low").toUpperCase()} />
                {lead.distanceMeters != null && <InfoRow label="Jarak ODP" value={`${lead.distanceMeters}m`} />}
                {assignedUser && <InfoRow label="Ditugaskan" value={assignedUser.name} />}
              </div>

              {/* Kontak cepat */}
              {lead.phone && (
                <div className="flex gap-2">
                  <a href={`tel:${lead.phone}`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full">
                      <Phone className="h-4 w-4 mr-1.5" /> Telepon
                    </Button>
                  </a>
                  <a href={waLink(lead.phone, `Halo ${lead.name}, kami dari JABNET FTTH mau follow up ketertarikan Anda.`)}
                     target="_blank" rel="noreferrer" className="flex-1">
                    <Button variant="outline" size="sm" className="w-full text-green-600">
                      <MessageSquare className="h-4 w-4 mr-1.5" /> WhatsApp
                    </Button>
                  </a>
                </div>
              )}

              {/* Assign */}
              {isSupervisor && (
                <div>
                  <Label className="text-xs">Ditugaskan Ke</Label>
                  <select
                    value={lead.assignedTo ?? ""}
                    onChange={(e) => assignLead.mutate(e.target.value ? Number(e.target.value) : null)}
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm mt-1"
                    disabled={assignLead.isPending}
                  >
                    <option value="">- Belum ditugaskan -</option>
                    {marketingUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.name} (@{u.username})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Stage actions */}
              {lead.stage !== "won" && lead.stage !== "lost" && (
                <div>
                  <Label className="text-xs mb-1.5 block">Pindah Stage</Label>
                  <div className="flex gap-1.5 flex-wrap">
                    {LEAD_STAGES.filter(s => s !== lead.stage && s !== "lost" && s !== "won").map((s) => (
                      <button
                        key={s}
                        onClick={() => changeStage.mutate({ stage: s })}
                        disabled={changeStage.isPending}
                        className="text-[10px] px-2.5 py-1 rounded-full border hover:bg-muted transition-colors disabled:opacity-50"
                        style={{ color: LEAD_STAGE_COLORS[s], borderColor: LEAD_STAGE_COLORS[s] + "60" }}
                      >
                        → {LEAD_STAGE_LABELS[s]}
                      </button>
                    ))}
                    <button
                      onClick={() => changeStage.mutate({ stage: "won" })}
                      disabled={changeStage.isPending}
                      className="text-[10px] px-2.5 py-1 rounded-full border bg-green-50 hover:bg-green-100 text-green-700 border-green-300 transition-colors disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3 w-3 mr-1 inline" /> Closing
                    </button>
                    <button
                      onClick={() => setShowLossReason(true)}
                      disabled={changeStage.isPending}
                      className="text-[10px] px-2.5 py-1 rounded-full border bg-red-50 hover:bg-red-100 text-red-700 border-red-300 transition-colors disabled:opacity-50"
                    >
                      <XCircle className="h-3 w-3 mr-1 inline" /> Tidak Jadi
                    </button>
                  </div>
                  {showLossReason && (
                    <div className="mt-2 p-3 border rounded-md space-y-2 bg-red-50 dark:bg-red-950/30">
                      <Input placeholder="Alasan tidak jadi..." value={lossReason} onChange={e => setLossReason(e.target.value)} className="text-xs" />
                      <div className="flex gap-2">
                        <Button size="sm" variant="destructive" onClick={() => changeStage.mutate({ stage: "lost", reason: lossReason })} className="flex-1">Konfirmasi</Button>
                        <Button size="sm" variant="outline" onClick={() => setShowLossReason(false)} className="flex-1">Batal</Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Convert to customer */}
              {lead.stage === "won" && (
                isConverted ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-xs font-semibold text-green-700 dark:text-green-300">Sudah jadi pelanggan</span>
                  </div>
                ) : (
                  <Button onClick={() => { if (onConvert && lead) { onClose(); setTimeout(() => onConvert(lead), 300); } }}
                    className="w-full bg-green-600 hover:bg-green-700 text-white">
                    <UserPlus className="h-4 w-4 mr-2" /> Jadikan Pelanggan
                  </Button>
                )
              )}

              {/* Tambah catatan */}
              <div className="border rounded-md p-3 space-y-2 bg-muted/30">
                <Label className="text-xs">Tambah Catatan / Aktivitas</Label>
                <div className="flex gap-2">
                  <select value={noteType} onChange={(e) => setNoteType(e.target.value as any)}
                          className="h-9 rounded-md border border-input bg-transparent px-2 text-xs">
                    <option value="note">Catatan</option>
                    <option value="call">Telepon</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="visit">Kunjungan</option>
                  </select>
                  <Input placeholder="Isi catatan..." value={newNote} onChange={(e) => setNewNote(e.target.value)} className="text-xs" />
                  <Button onClick={() => {
                    if (!newNote.trim() && !activityPhoto) return toast.error("Catatan kosong");
                    addNote.mutate({
                      type: activityPhoto ? "photo" : noteType,
                      content: newNote.trim() || (activityPhoto ? "Foto" : ""),
                      ...(activityPhoto ? { photoData: activityPhoto } : {}),
                    } as any);
                    setActivityPhoto(null);
                  }} size="sm" disabled={addNote.isPending}>Kirim</Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => photoInputRef.current?.click()} className="h-7 text-[10px]">
                    <Camera className="h-3 w-3 mr-1" /> {activityPhoto ? "Ganti foto" : "Lampirkan foto"}
                  </Button>
                  {activityPhoto && (
                    <div className="relative">
                      <img src={activityPhoto} alt="preview" className="h-10 w-10 object-cover rounded border" />
                      <button onClick={() => setActivityPhoto(null)} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  )}
                  {/* Tanpa `capture` supaya browser menampilkan pilihan Kamera / Galeri / File (bukan langsung kamera) */}
                  <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
                </div>
              </div>

              {/* Riwayat Aktivitas */}
              <div>
                <Label className="text-xs mb-2 block flex items-center gap-1.5">
                  <StickyNote className="h-3.5 w-3.5" /> Riwayat Aktivitas (Lead #{lead.id})
                </Label>
                <div className="space-y-2">
                  {activities.length === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-4">Belum ada aktivitas</div>
                  )}
                  {[...activities].reverse().map((act) => {
                    const cfg = ACTIVITY_CFG[act.type] ?? ACTIVITY_CFG.note;
                    const Icon = cfg.icon;
                    let content = act.content ?? "";
                    if (act.type === "stage_change") {
                      try { const p = JSON.parse(content); content = `${LEAD_STAGE_LABELS[p.from as LeadStage] ?? p.from} → ${LEAD_STAGE_LABELS[p.to as LeadStage] ?? p.to}`; } catch {}
                    } else if (act.type === "assigned") {
                      try { const p = JSON.parse(content); content = `Ditugaskan ke ${p.assignedToName || "User #" + p.assignedTo}`; } catch {}
                    } else if (act.type === "converted") {
                      try { const p = JSON.parse(content); content = `Dikonversi menjadi pelanggan ${p.customerBillingId || "#" + p.customerId}`; } catch {}
                    }
                    return (
                      <div key={act.id} className="flex gap-2 pb-2 border-b text-xs">
                        <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", cfg.color)} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium">{cfg.label}</span>
                          </div>
                          {content && <div className="text-muted-foreground text-[11px] break-all">{content}</div>}
                          {((act as any).photoPath || (act as any).photoData) && (
                            <img
                              src={`/api/marketing/leads/activities/${act.id}/photo`}
                              alt="foto aktivitas"
                              className="mt-1.5 h-24 w-auto rounded border object-cover"
                              loading="lazy"
                            />
                          )}
                          <div className="text-[10px] text-muted-foreground/70 mt-0.5">{fmtDateTime(act.createdAt)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Catatan Awal */}
              {lead.notes && (
                <div className="rounded-md p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <Label className="text-xs text-amber-700 dark:text-amber-300 mb-1 block">Catatan Awal</Label>
                  <p className="text-xs text-amber-800 dark:text-amber-200">{lead.notes}</p>
                </div>
              )}

              {/* Danger zone - hapus lead, terisolasi di bawah */}
              {me?.role === "admin" && onDelete && (
                <div className="mt-6 pt-4 border-t border-dashed border-red-200 dark:border-red-900">
                  <div className="flex items-center justify-between gap-3 p-3 rounded-md bg-red-50/50 dark:bg-red-950/20 border border-red-200/60 dark:border-red-900/60">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-red-700 dark:text-red-300 flex items-center gap-1.5">
                        <Trash2 className="h-3.5 w-3.5" /> Zona Berbahaya
                      </div>
                      <p className="text-[11px] text-red-600/80 dark:text-red-400/80 mt-0.5">
                        Hapus lead beserta riwayat aktivitas. Aksi ini tidak bisa dibatalkan.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { onClose(); setTimeout(() => onDelete(leadId), 300); }}
                      className="text-red-600 border-red-300 hover:bg-red-100 dark:hover:bg-red-950/40 dark:border-red-900 dark:text-red-400 shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Hapus Lead
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}


// -- Kanban Card ------------------------------------------------------------
function KanbanCard({ lead, users, isConverted, onClick }: { lead: Lead; users: UserItem[]; isConverted?: boolean; onClick: () => void }) {
  const assigned = users.find(u => u.id === lead.assignedTo);
  const stageColor = LEAD_STAGE_COLORS[lead.stage as LeadStage] ?? "#6B7280";
  const isNew = lead.stage === "new";
  const priority = (lead.priority ?? "low") as "low" | "medium" | "high";
  const ageDays = Math.floor((Date.now() - new Date(lead.createdAt).getTime()) / 86400000);
  const isTerminal = lead.stage === "won" || lead.stage === "lost";

  // -- Lead Temperature / Scoring --
  // Based on: priority, age in stage, last update
  const lastUpdateAt = (lead as any).updatedAt || lead.createdAt;
  const daysSinceUpdate = Math.floor((Date.now() - new Date(lastUpdateAt).getTime()) / 86400000);

  // Stalled = active lead with no update >14 days
  const isStalled = !isTerminal && daysSinceUpdate > 14 && ageDays > 7;
  // Hot = high priority + recent activity + not terminal
  const isHot = !isTerminal && (priority === "high" || daysSinceUpdate <= 1);
  // Fresh = updated in last 3 days
  const isFresh = !isTerminal && daysSinceUpdate <= 3 && !isNew;

  // Wilayah: "Village, District" kalau keduanya ada, fallback salah satu, fallback ke address snippet
  const wilayah = (() => {
    const v = (lead as any).village?.trim();
    const d = (lead as any).district?.trim();
    if (v && d) return `${v}, ${d}`;
    if (d) return d;
    if (v) return v;
    const addr = (lead as any).address?.trim();
    if (addr) return addr.length > 35 ? addr.slice(0, 35) + "…" : addr;
    return null;
  })();

  const categoryLabel = lead.category
    ? (LEAD_CATEGORY_LABELS[lead.category as keyof typeof LEAD_CATEGORY_LABELS] ?? lead.category)
    : null;
  const srcLabel = lead.source ? sourceLabel(lead.source) : null;

  // Border accent based on state (priority: stalled > hot > priority > default)
  const borderAccent = isStalled
    ? "border-destructive/40 shadow-[inset_3px_0_0_hsl(var(--destructive))]"
    : isHot
      ? "border-warning/40 shadow-[inset_3px_0_0_hsl(var(--warning))]"
      : priority === "high"
        ? "border-rose-400/40 shadow-[inset_3px_0_0_#f43f5e]"
        : "border-border";

  return (
    <Card
      onClick={onClick}
      className={cn(
        "cursor-pointer hover:shadow-elev-md hover:border-primary/30 transition-all relative overflow-hidden",
        borderAccent
      )}
    >
      <CardContent className="p-3 space-y-2">
        {/* -- Top row: Name + indicators + action -- */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {isHot && (
                <span
                  className="inline-flex items-center justify-center h-4 w-4 rounded-sm bg-warning/15 shrink-0"
                  title="Hot lead - aktivitas baru"
                >
                  <Flame className="h-3 w-3 text-warning" />
                </span>
              )}
              {isStalled && (
                <span
                  className="inline-flex items-center justify-center h-4 w-4 rounded-sm bg-destructive/15 shrink-0"
                  title={`Stalled - tidak ada update ${daysSinceUpdate} hari`}
                >
                  <AlertTriangle className="h-3 w-3 text-destructive" />
                </span>
              )}
              <span className="font-bold text-sm truncate tracking-tight">{lead.name}</span>
            </div>
            {(categoryLabel || srcLabel) && (
              <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                {categoryLabel}
                {categoryLabel && srcLabel && " · "}
                {srcLabel}
              </div>
            )}
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
        </div>

        {/* -- Wilayah -- */}
        {wilayah && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0 text-primary/60" />
            <span className="truncate">{wilayah}</span>
          </div>
        )}

        {/* -- Age + last activity row -- */}
        <div className="flex items-center justify-between gap-2 text-2xs">
          <div
            className="inline-flex items-center gap-1 font-semibold"
            style={{ color: stageColor }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: stageColor }} />
            {ageDays === 0 ? "Hari ini" : `${ageDays}h lalu`}
          </div>
          {!isTerminal && daysSinceUpdate !== ageDays && (
            <div
              className={cn(
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums",
                daysSinceUpdate <= 1
                  ? "bg-success/10 text-success"
                  : daysSinceUpdate <= 7
                    ? "bg-muted text-muted-foreground"
                    : daysSinceUpdate <= 14
                      ? "bg-warning/10 text-warning"
                      : "bg-destructive/10 text-destructive"
              )}
              title={`Update terakhir ${daysSinceUpdate} hari yang lalu`}
            >
              <Clock className="h-2.5 w-2.5" />
              {daysSinceUpdate === 0 ? "Baru" : `${daysSinceUpdate}h`}
            </div>
          )}
        </div>

        {/* -- Status badges -- */}
        <div className="flex flex-wrap gap-1">
          {priority === "high" && !isStalled && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
              <Star className="h-2.5 w-2.5" strokeWidth={2.5} /> Prioritas
            </span>
          )}
          {isNew && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Lead Baru
            </span>
          )}
          {isFresh && !isNew && !isHot && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
              <Zap className="h-2.5 w-2.5" /> Aktif
            </span>
          )}
          {isStalled && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-destructive/10 text-destructive border border-destructive/30">
              <AlertTriangle className="h-2.5 w-2.5" /> Tidak ada update
            </span>
          )}
          {isConverted && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-success/10 text-success border border-success/30">
              <CheckCircle2 className="h-2.5 w-2.5" /> Jadi Pelanggan
            </span>
          )}
        </div>

        {/* -- Assigned user -- */}
        {assigned && (
          <div className="flex items-center gap-1.5 pt-1 border-t border-border/50">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-sky-500 to-blue-700 flex items-center justify-center text-white text-[9px] font-black shrink-0">
              {assigned.name.charAt(0).toUpperCase()}
            </div>
            <span className="text-[10px] font-medium text-muted-foreground truncate">
              {assigned.name}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// -- List View Lead Row (list-optimized - quick stage change) ----------------
function ListLeadRow({
  lead, users, isConverted, onClick, onStageChange,
}: {
  lead: Lead;
  users: UserItem[];
  isConverted?: boolean;
  onClick: () => void;
  onStageChange: (stage: LeadStage) => void;
}) {
  const assigned = users.find(u => u.id === lead.assignedTo);
  const stageColor = LEAD_STAGE_COLORS[lead.stage as LeadStage] ?? "#64748b";
  const currentStage = lead.stage as LeadStage;
  const priority = (lead.priority ?? "low") as "low" | "medium" | "high";
  const ageDays = Math.floor((Date.now() - new Date(lead.createdAt).getTime()) / 86400000);
  const lastUpdateAt = (lead as any).updatedAt || lead.createdAt;
  const daysSinceUpdate = Math.floor((Date.now() - new Date(lastUpdateAt).getTime()) / 86400000);
  const isTerminal = currentStage === "won" || currentStage === "lost";
  const isStalled = !isTerminal && daysSinceUpdate > 14 && ageDays > 7;
  const isHot = !isTerminal && (priority === "high" || daysSinceUpdate <= 1);

  // Next stages suggestion (2-3 adjacent stages)
  const stageOrder: LeadStage[] = ["new", "contacted", "interested", "negotiation", "won"];
  const currentIdx = stageOrder.indexOf(currentStage);
  const nextStages: LeadStage[] = isTerminal
    ? []
    : ([
        ...(currentIdx >= 0 && currentIdx < stageOrder.length - 1 ? [stageOrder[currentIdx + 1]] : []),
        ...(currentIdx >= 1 ? [stageOrder[currentIdx - 1]] : []),
        "lost" as LeadStage,
      ].filter((s, i, arr) => s !== currentStage && arr.indexOf(s) === i) as LeadStage[]);

  const wilayah = (() => {
    const v = (lead as any).village?.trim();
    const d = (lead as any).district?.trim();
    if (v && d) return `${v}, ${d}`;
    if (d) return d;
    if (v) return v;
    const addr = (lead as any).address?.trim();
    if (addr) return addr.length > 40 ? addr.slice(0, 40) + "…" : addr;
    return null;
  })();

  const borderAccent = isStalled
    ? "border-destructive/40 shadow-[inset_3px_0_0_hsl(var(--destructive))]"
    : isHot
      ? "border-warning/40 shadow-[inset_3px_0_0_hsl(var(--warning))]"
      : "border-border";

  return (
    <Card className={cn("overflow-hidden relative transition-all hover:shadow-elev-md", borderAccent)}>
      <CardContent className="p-0">
        {/* Clickable card body - opens drawer for detail */}
        <button onClick={onClick} className="w-full text-left p-3 md:p-4 hover:bg-muted/30 transition-colors">
          <div className="flex items-start gap-3">
            {/* Stage color indicator */}
            <div
              className="w-1 shrink-0 rounded-full self-stretch"
              style={{ background: stageColor, minHeight: "2.5rem" }}
            />

            {/* Main content */}
            <div className="flex-1 min-w-0">
              {/* Name + stage badge row */}
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 min-w-0">
                  {isHot && (
                    <span title="Hot lead" className="inline-flex">
                      <Flame className="h-3.5 w-3.5 text-warning shrink-0" />
                    </span>
                  )}
                  {isStalled && (
                    <span title={`Stalled ${daysSinceUpdate}h`} className="inline-flex">
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                    </span>
                  )}
                  <span className="font-bold text-sm tracking-tight truncate text-foreground">
                    {lead.name}
                  </span>
                </div>
                <span
                  className="inline-flex items-center text-2xs font-black px-1.5 py-0.5 rounded uppercase tracking-wider text-white shrink-0"
                  style={{ background: stageColor }}
                >
                  {LEAD_STAGE_LABELS[currentStage]}
                </span>
              </div>

              {/* Meta info row */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                {lead.category && (
                  <span>{LEAD_CATEGORY_LABELS[lead.category as keyof typeof LEAD_CATEGORY_LABELS] ?? lead.category}</span>
                )}
                {lead.source && (
                  <span>· {sourceLabel(lead.source)}</span>
                )}
                {wilayah && (
                  <span className="inline-flex items-center gap-0.5">
                    <MapPin className="h-2.5 w-2.5 text-primary/60 shrink-0" /> {wilayah}
                  </span>
                )}
              </div>

              {/* Status row: age + assigned + badges */}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="text-2xs text-muted-foreground">
                  {ageDays === 0 ? "Hari ini" : `${ageDays}h lalu`}
                </span>
                {!isTerminal && daysSinceUpdate !== ageDays && (
                  <span className={cn(
                    "text-2xs font-bold tabular-nums px-1.5 py-0.5 rounded",
                    daysSinceUpdate <= 1 ? "bg-success/10 text-success" :
                      daysSinceUpdate <= 7 ? "bg-muted text-muted-foreground" :
                        daysSinceUpdate <= 14 ? "bg-warning/10 text-warning" :
                          "bg-destructive/10 text-destructive"
                  )}>
                    Update {daysSinceUpdate === 0 ? "baru" : `${daysSinceUpdate}h`}
                  </span>
                )}
                {priority === "high" && !isStalled && !isHot && (
                  <span className="inline-flex items-center gap-0.5 text-2xs font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 px-1.5 py-0.5 rounded">
                    <Star className="h-2.5 w-2.5" /> Prioritas
                  </span>
                )}
                {isConverted && (
                  <span className="inline-flex items-center gap-0.5 text-2xs font-bold bg-success/10 text-success px-1.5 py-0.5 rounded">
                    <CheckCircle2 className="h-2.5 w-2.5" /> Pelanggan
                  </span>
                )}
                {assigned && (
                  <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground ml-auto">
                    <span className="w-4 h-4 rounded-full bg-gradient-to-br from-sky-500 to-blue-700 flex items-center justify-center text-white text-[9px] font-black">
                      {assigned.name.charAt(0).toUpperCase()}
                    </span>
                    {assigned.name}
                  </span>
                )}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0 self-center" />
          </div>
        </button>

        {/* Quick stage action buttons - hanya kalau lead belum terminal */}
        {!isTerminal && nextStages.length > 0 && (
          <div className="flex gap-1.5 px-3 md:px-4 pb-3 pt-2 border-t border-border/40 bg-muted/20 overflow-x-auto no-scrollbar">
            <span className="text-2xs text-muted-foreground font-semibold uppercase tracking-wider shrink-0 self-center">
              Pindah →
            </span>
            {nextStages.map((s) => {
              const color = LEAD_STAGE_COLORS[s];
              const isWon = s === "won";
              const isLost = s === "lost";
              return (
                <button
                  key={s}
                  onClick={(e) => { e.stopPropagation(); onStageChange(s); }}
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-2xs font-bold uppercase tracking-wider transition-all",
                    "border bg-background hover:shadow-elev-sm active:scale-95",
                    isWon
                      ? "border-success/30 text-success hover:bg-success/10"
                      : isLost
                        ? "border-destructive/30 text-destructive hover:bg-destructive/10"
                        : "border-border hover:border-current"
                  )}
                  style={!isWon && !isLost ? { color } : undefined}
                >
                  {!isWon && !isLost && (
                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: color }} />
                  )}
                  {isWon && <CheckCircle2 className="h-3 w-3" />}
                  {isLost && <XCircle className="h-3 w-3" />}
                  {LEAD_STAGE_LABELS[s]}
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// -- Main Page --------------------------------------------------------------
export default function LeadPipelinePage() {
  const { user: me } = useAuth();
  // Default view: list di mobile (<768px), kanban di desktop - persist preference
  const [view, setView] = useState<"kanban" | "list">(() => {
    if (typeof window === "undefined") return "kanban";
    const saved = localStorage.getItem("lead_pipeline_view") as "kanban" | "list" | null;
    if (saved === "kanban" || saved === "list") return saved;
    return window.innerWidth < 768 ? "list" : "kanban";
  });
  // Persist user preference
  useEffect(() => {
    localStorage.setItem("lead_pipeline_view", view);
  }, [view]);
  const [stageFilter, setStageFilter] = useState<LeadStage | "all">("all");
  const [rangePreset, setRangePreset] = useState<RangePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [convertLead, setConvertLead] = useState<LeadDetail | null>(null);
  const [deleteLeadId, setDeleteLeadId] = useState<number | null>(null);
  // Stage change confirmation dialog (untuk drag-drop + tombol)
  const [stageChangeFor, setStageChangeFor] = useState<{ id: number; fromStage: LeadStage; targetStage: LeadStage; leadName?: string } | null>(null);
  const [stageNote, setStageNote] = useState("");
  const [stagePhoto, setStagePhoto] = useState<string | null>(null);
  const [stageLossReason, setStageLossReason] = useState("");
  const stagePhotoRef = useRef<HTMLInputElement>(null);
  // Drag-drop state
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverStage, setDragOverStage] = useState<LeadStage | null>(null);
  const qcPage = useQueryClient();

  const isSupervisor = me?.role === "admin" || me?.role === "marketing_spv";

  const { data: leads = [], isLoading, refetch } = useQuery<Lead[]>({
    queryKey: ["leads"],
    queryFn: () => api.get<Lead[]>("/marketing/leads"),
    refetchInterval: 30_000,
  });

  const { data: users = [] } = useQuery<UserItem[]>({
    queryKey: ["users_list"],
    queryFn: () => api.get<UserItem[]>("/users"),
    staleTime: 60_000,
  });

  const { data: customers = [] } = useQuery<CustomerItem[]>({
    queryKey: ["customers"],
    queryFn: () => api.get<CustomerItem[]>("/customers"),
    staleTime: 60_000,
  });
  const convertedLeadIds = new Set(
    customers.filter(c => c.leadId != null).map(c => c.leadId as number)
  );

  const { data: odps = [] } = useQuery<OdpItem[]>({
    queryKey: ["odps_list"],
    queryFn: () => api.get<OdpItem[]>("/odps"),
    staleTime: 120_000,
  });

  // -- Time range filter (by createdAt) - diterapkan ke seluruh halaman --
  const customRangeValid = rangePreset !== "custom" || (!!customFrom && !!customTo && customFrom <= customTo);
  const timeFiltered = useMemo(() => {
    if (rangePreset === "all") return leads;
    const now = Date.now();
    let fromMs = 0;
    let toMs = Infinity;
    if (rangePreset === "7d") fromMs = now - 7 * 86400000;
    else if (rangePreset === "30d") fromMs = now - 30 * 86400000;
    else if (rangePreset === "custom") {
      if (!customRangeValid) return leads;
      fromMs = new Date(`${customFrom}T00:00:00`).getTime();
      toMs = new Date(`${customTo}T23:59:59`).getTime();
    }
    return leads.filter((l) => {
      const t = new Date(l.createdAt).getTime();
      return t >= fromMs && t <= toMs;
    });
  }, [leads, rangePreset, customFrom, customTo, customRangeValid]);

  const filtered = stageFilter === "all" ? timeFiltered : timeFiltered.filter(l => l.stage === stageFilter);
  // For kanban view, always use time-filtered leads so all columns show data
  const kanbanSource = view === "kanban" ? timeFiltered : filtered;
  const byStage = LEAD_STAGES.reduce((acc, s) => {
    acc[s] = kanbanSource.filter(l => l.stage === s);
    return acc;
  }, {} as Record<LeadStage, Lead[]>);

  // -- Stage change mutation (with note + photo) --
  const pageStageMut = useMutation({
    mutationFn: async (data: { id: number; stage: LeadStage; lossReason?: string; note?: string; photoData?: string }) => {
      await api.patch(`/marketing/leads/${data.id}/stage`, { stage: data.stage, lossReason: data.lossReason });
      if (data.note || data.photoData) {
        await api.post(`/marketing/leads/${data.id}/activity`, {
          type: data.photoData ? "photo" : "note",
          content: data.note || "Foto bukti",
          photoData: data.photoData,
        });
      }
    },
    onSuccess: () => {
      qcPage.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Stage berhasil dipindah");
      setStageChangeFor(null);
      setStageNote("");
      setStagePhoto(null);
      setStageLossReason("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const requestStageChange = (id: number, targetStage: LeadStage) => {
    const lead = leads.find(l => l.id === id);
    if (!lead) return;
    if (lead.stage === targetStage) return;
    setStageChangeFor({ id, fromStage: lead.stage as LeadStage, targetStage, leadName: lead.name });
    setStageNote("");
    setStagePhoto(null);
    setStageLossReason("");
  };

  const submitStageChange = () => {
    if (!stageChangeFor) return;
    if (stageChangeFor.targetStage === "lost" && !stageLossReason.trim()) {
      return toast.error("Alasan tidak jadi wajib diisi untuk stage 'Tidak Jadi'");
    }
    pageStageMut.mutate({
      id: stageChangeFor.id,
      stage: stageChangeFor.targetStage,
      lossReason: stageChangeFor.targetStage === "lost" ? stageLossReason : undefined,
      note: stageNote.trim() || undefined,
      photoData: stagePhoto ?? undefined,
    });
  };

  const handleStagePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("File harus berupa gambar");
    try {
      const { compressImage } = await import("@/lib/imageCompress");
      const result = await compressImage(file);
      setStagePhoto(result.dataUrl);
    } catch (err: any) {
      toast.error(err?.message || "Gagal proses foto");
    }
  };

  // -- Drag-and-drop handlers --
  const handleDragStart = (id: number) => (e: React.DragEvent) => {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(id));
  };
  const handleDragEnd = () => { setDraggingId(null); setDragOverStage(null); };
  const handleColumnDragOver = (stage: LeadStage) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverStage !== stage) setDragOverStage(stage);
  };
  const handleColumnDrop = (targetStage: LeadStage) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverStage(null);
    const id = Number(e.dataTransfer.getData("text/plain")) || draggingId;
    setDraggingId(null);
    if (!id) return;
    requestStageChange(id, targetStage);
  };

  const wonLeads = timeFiltered.filter(l => l.stage === "won").length;
  const activeLeads = timeFiltered.filter(l => !["won", "lost"].includes(l.stage ?? "")).length;
  const convRate = timeFiltered.length > 0 ? Math.round((wonLeads / timeFiltered.length) * 100) : 0;

  return (
    <div className="flex flex-col h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)] overflow-hidden">
      {/* Header (non-scroll) */}
      <div className="px-4 md:px-6 pt-4 md:pt-6 space-y-4 shrink-0">
        <div className="flex items-start md:items-center justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <div className="shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 flex items-center justify-center shadow-elev-md">
              <ListChecks className="h-5 w-5 md:h-6 md:w-6 text-white" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg md:text-xl font-bold tracking-tight">Lead Pipeline</h1>
              <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
                Lead dari canvassing / prospect finder - kelola sampai jadi pelanggan.
              </p>
            </div>
          </div>
          <div className="flex gap-2 items-center shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              disabled={isLoading}
              loading={isLoading}
              leftIcon={!isLoading ? <RefreshCw /> : undefined}
            >
              Refresh
            </Button>
            <div className="inline-flex rounded-md border border-border overflow-hidden text-xs bg-card">
              <button
                onClick={() => setView("kanban")}
                className={cn(
                  "h-8 px-3 flex items-center gap-1.5 font-semibold transition-colors",
                  view === "kanban" ? "bg-primary text-primary-foreground" : "bg-transparent hover:bg-muted"
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Kanban
              </button>
              <button
                onClick={() => setView("list")}
                className={cn(
                  "h-8 px-3 flex items-center gap-1.5 font-semibold transition-colors",
                  view === "list" ? "bg-primary text-primary-foreground" : "bg-transparent hover:bg-muted"
                )}
              >
                <List className="h-3.5 w-3.5" />
                List
              </button>
            </div>
          </div>
        </div>

        {/* Filter bar ringkas: periode + tahap (dropdown) + total ringkas. Fokus ke pipeline;
            KPI detail (won/konversi) ada di Dashboard divisi, tidak diulang di sini. */}
        <div className="flex items-center gap-2 flex-wrap pb-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <SlidersHorizontal className="h-3.5 w-3.5" /> Filter
          </span>
          {/* Periode masuk */}
          <div className="relative">
            <select
              value={rangePreset}
              onChange={(e) => setRangePreset(e.target.value as RangePreset)}
              aria-label="Periode masuk"
              className="h-8 pl-3 pr-8 rounded-lg border border-border bg-card text-xs font-semibold text-foreground appearance-none cursor-pointer hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {(["all", "7d", "30d", "custom"] as RangePreset[]).map((p) => (
                <option key={p} value={p}>Periode: {RANGE_LABELS[p]}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          </div>
          {/* Tahap - hanya relevan di List (Kanban sudah menampilkan semua tahap sebagai kolom) */}
          {view === "list" && (
            <div className="relative">
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value as LeadStage | "all")}
                aria-label="Tahap"
                className="h-8 pl-3 pr-8 rounded-lg border border-border bg-card text-xs font-semibold text-foreground appearance-none cursor-pointer hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="all">Tahap: Semua ({timeFiltered.length})</option>
                {LEAD_STAGES.map((s) => (
                  <option key={s} value={s}>{LEAD_STAGE_LABELS[s]} ({timeFiltered.filter(l => l.stage === s).length})</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            </div>
          )}
          {/* Custom date range */}
          {rangePreset === "custom" && (
            <div className="flex items-center gap-1.5">
              <Input type="date" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} className="h-8 w-[140px] text-xs" />
              <span className="text-xs text-muted-foreground">s/d</span>
              <Input type="date" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} className="h-8 w-[140px] text-xs" />
            </div>
          )}
          {rangePreset === "custom" && !customRangeValid && (
            <span className="text-2xs text-destructive">Pilih tanggal mulai ≤ tanggal akhir</span>
          )}
          {/* Total ringkas (bukan KPI - sekadar konteks jumlah kartu yang tampil) */}
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">{timeFiltered.length} lead</span>
        </div>
      </div>

      {/* Content (scrollable area) */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : timeFiltered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-8">
            <ListChecks className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            {leads.length === 0 ? (
              <>
                <p className="text-sm font-medium text-muted-foreground">Belum ada lead</p>
                <p className="text-xs mt-1 text-muted-foreground/70">Lead masuk dari Canvassing atau Prospect Finder</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-muted-foreground">Tidak ada lead pada periode ini</p>
                <p className="text-xs mt-1 text-muted-foreground/70">Coba ubah filter periode masuk</p>
              </>
            )}
          </div>
        </div>
      ) : view === "kanban" ? (
        /* === KANBAN - horizontal scroll outer, vertical scroll per-column === */
        <div className="flex-1 overflow-x-auto overflow-y-hidden px-4 md:px-6 pb-4 kanban-scrollbar snap-x snap-mandatory md:snap-none">
          <div className="flex gap-3 h-full items-stretch w-max">
            {LEAD_STAGES.filter(s => stageFilter === "all" || stageFilter === s).map((stage) => {
              const stageLeads = byStage[stage];
              const isDropTarget = dragOverStage === stage;
              return (
                <div
                  key={stage}
                  onDragOver={handleColumnDragOver(stage)}
                  onDragLeave={() => setDragOverStage(prev => prev === stage ? null : prev)}
                  onDrop={handleColumnDrop(stage)}
                  className={`w-[82vw] max-w-[19rem] sm:w-72 shrink-0 snap-start flex flex-col h-full rounded-xl p-3 transition-colors ${isDropTarget ? "bg-primary/10 ring-2 ring-primary/40" : "bg-muted/40"}`}
                >
                  <div className="flex items-center justify-between mb-3 px-1 shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: LEAD_STAGE_COLORS[stage] }} />
                      <span className="text-sm font-semibold uppercase tracking-wide">{LEAD_STAGE_LABELS[stage]}</span>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">{stageLeads.length}</Badge>
                  </div>
                  {/* Per-column scroll area */}
                  <div className="flex-1 overflow-y-auto column-scrollbar space-y-2 pr-1 pb-2 min-h-0">
                    {stageLeads.map((lead) => (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={handleDragStart(lead.id)}
                        onDragEnd={handleDragEnd}
                        className={draggingId === lead.id ? "opacity-40" : ""}
                      >
                        <KanbanCard lead={lead} users={users} isConverted={convertedLeadIds.has(lead.id)} onClick={() => setSelectedLeadId(lead.id)} />
                      </div>
                    ))}
                    {stageLeads.length === 0 && (
                      <div className={`text-xs text-center py-6 border border-dashed rounded-lg transition-colors ${isDropTarget ? "border-primary/60 text-primary bg-primary/5" : "text-muted-foreground"}`}>
                        {isDropTarget ? "Drop di sini" : "Kosong"}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      ) : (
        /* === LIST VIEW - full-page vertical scroll dengan quick stage actions === */
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 md:px-6 pb-4 kanban-scrollbar">
          <div className="space-y-2 pb-2">
            {filtered.map((lead) => (
              <ListLeadRow
                key={lead.id}
                lead={lead}
                users={users}
                isConverted={convertedLeadIds.has(lead.id)}
                onClick={() => setSelectedLeadId(lead.id)}
                onStageChange={(stage) => requestStageChange(lead.id, stage)}
              />
            ))}
          </div>
        </div>
      )}

      {/* =========== DRAWER =========== */}
      {selectedLeadId !== null && (
        <LeadDrawer leadId={selectedLeadId} users={users} odps={odps} convertedLeadIds={convertedLeadIds}
          onClose={() => setSelectedLeadId(null)}
          onConvert={(lead) => setConvertLead(lead)}
          onDelete={(id) => setDeleteLeadId(id)} />
      )}

      {/* Convert dialog at page level - outside drawer z-index */}
      {convertLead && (
        <ConvertLeadDialog lead={convertLead} odps={odps} open={!!convertLead}
          onOpenChange={(v) => { if (!v) setConvertLead(null); }} />
      )}

      {/* Stage change confirmation dialog - untuk drag-drop + tombol */}
      <Dialog open={!!stageChangeFor} onOpenChange={(o) => !o && setStageChangeFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Move className="h-5 w-5 text-primary" />
              Pindahkan Stage Lead
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 pt-1">
                {stageChangeFor && (
                  <div className="font-medium text-foreground">{stageChangeFor.leadName}</div>
                )}
                {stageChangeFor && (
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="secondary" style={{ backgroundColor: LEAD_STAGE_COLORS[stageChangeFor.fromStage] + "20", color: LEAD_STAGE_COLORS[stageChangeFor.fromStage] }}>
                      {LEAD_STAGE_LABELS[stageChangeFor.fromStage]}
                    </Badge>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <Badge variant="secondary" style={{ backgroundColor: LEAD_STAGE_COLORS[stageChangeFor.targetStage] + "20", color: LEAD_STAGE_COLORS[stageChangeFor.targetStage] }}>
                      {LEAD_STAGE_LABELS[stageChangeFor.targetStage]}
                    </Badge>
                  </div>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-[50vh] overflow-y-auto -mx-6 px-6">
            {/* Stage-specific field */}
            {stageChangeFor?.targetStage === "lost" && (
              <div>
                <Label className="text-xs">Alasan Tidak Jadi <span className="text-red-500">*</span></Label>
                <Input
                  value={stageLossReason}
                  onChange={(e) => setStageLossReason(e.target.value)}
                  placeholder="Tidak tertarik, pindah provider, jarak, dsb..."
                  className="mt-1 text-sm"
                />
              </div>
            )}
            {stageChangeFor?.targetStage === "won" && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                <div className="text-xs text-green-800 dark:text-green-200">
                  <div className="font-semibold">Lead sudah Closing</div>
                  <div className="mt-0.5 text-[11px]">Setelah ini kamu bisa convert lead jadi pelanggan dari drawer detail.</div>
                </div>
              </div>
            )}

            <div>
              <Label className="text-xs">Catatan / Keterangan</Label>
              <Textarea
                value={stageNote}
                onChange={(e) => setStageNote(e.target.value)}
                placeholder="Alasan pindah stage, hasil kontak, rencana follow-up..."
                rows={2}
                className="mt-1"
              />
            </div>

            <div>
              <Label className="text-xs flex items-center gap-1.5">
                <Camera className="h-3.5 w-3.5" />
                Bukti Foto (opsional)
              </Label>
              <p className="text-[10px] text-muted-foreground mb-1.5">Screenshot chat, foto survey, bukti tanda tangan, dsb. Auto di-compress.</p>
              {stagePhoto ? (
                <div className="relative inline-block">
                  <img src={stagePhoto} alt="bukti" className="h-32 w-32 object-cover rounded-md border" />
                  <button onClick={() => setStagePhoto(null)} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={() => stagePhotoRef.current?.click()} className="w-full">
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  Pilih / Ambil Foto
                </Button>
              )}
              {/* Tanpa `capture` supaya browser menampilkan pilihan Kamera / Galeri / File (bukan langsung kamera) */}
              <input ref={stagePhotoRef} type="file" accept="image/*" className="hidden" onChange={handleStagePhotoSelect} />
            </div>
          </div>

          <div className="flex gap-2 pt-3 border-t">
            <Button variant="outline" onClick={() => setStageChangeFor(null)} className="flex-1" disabled={pageStageMut.isPending}>
              Batal
            </Button>
            <Button onClick={submitStageChange} disabled={pageStageMut.isPending} className="flex-1">
              {pageStageMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Konfirmasi Pindah
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete dialog at page level - outside drawer z-index */}
      <AlertDialog open={deleteLeadId !== null} onOpenChange={(o) => { if (!o) setDeleteLeadId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-500" /> Hapus Lead?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Lead akan dihapus permanen beserta semua riwayat aktivitasnya. Tindakan ini tidak bisa dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={async () => {
              if (!deleteLeadId) return;
              try {
                await api.delete(`/marketing/leads/${deleteLeadId}`);
                toast.success("Lead berhasil dihapus");
                qcPage.invalidateQueries({ queryKey: ["leads"] });
                qcPage.invalidateQueries({ queryKey: ["customers"] });
                qcPage.invalidateQueries({ queryKey: ["dashboard"] });
              } catch (e: any) { toast.error(e.message || "Gagal menghapus"); }
              setDeleteLeadId(null);
            }}>
              Hapus Permanen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
