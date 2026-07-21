import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogSizeToggle, useDialogSize } from "@/components/ui/dialog-size-toggle";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { usePipelineAccess, usePipelineMutations, usePipeline } from "@/hooks/usePipelines";
import { ALL_PIPELINE_CAPABILITIES, PIPELINE_CAPABILITY_LABELS, isAdminLockedRole, type PipelineCapability } from "@shared/pipelineCapabilities";
import { ShieldCheck, Users, Filter, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { ConditionsBuilder, type DraftCondition } from "@/components/pipelines/ConditionsBuilder";

export function PipelineAccessDialog({
  pipelineId,
  open,
  onClose,
}: {
  pipelineId: number;
  open: boolean;
  onClose: () => void;
}) {
  const dialog = useDialogSize("dialogSize:access");
  const { data: access } = usePipelineAccess(open ? pipelineId : null);
  const { data: pipeline } = usePipeline(open ? pipelineId : null);
  const { data: roles } = useQuery({
    queryKey: ["/api/roles"],
    queryFn: () => api.get<any[]>("/roles"),
    enabled: open,
  });
  const m = usePipelineMutations(pipelineId);
  const [restricted, setRestricted] = useState(false);
  const [caps, setCaps] = useState<Record<number, PipelineCapability[]>>({});
  const [cardFilter, setCardFilter] = useState<Record<number, DraftCondition[][]>>({});
  const [filterOpen, setFilterOpen] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!access) return;
    setRestricted(access.restricted);
    const nextCaps: Record<number, PipelineCapability[]> = {};
    const nextFilter: Record<number, DraftCondition[][]> = {};
    for (const g of access.grants) {
      nextCaps[g.roleId] = (g.capabilities as PipelineCapability[]) ?? [];
      if (Array.isArray(g.cardFilter) && g.cardFilter.length > 0) {
        nextFilter[g.roleId] = g.cardFilter as DraftCondition[][];
      }
    }
    setCaps(nextCaps);
    setCardFilter(nextFilter);
  }, [access]);

  const toggleCap = (roleId: number, cap: PipelineCapability, on: boolean) => {
    setCaps((s) => {
      const cur = new Set(s[roleId] ?? []);
      if (on) { cur.add(cap); if (cap !== "view") cur.add("view"); }
      else { cur.delete(cap); if (cap === "view") cur.clear(); }
      return { ...s, [roleId]: [...cur] };
    });
  };

  const save = async () => {
    const lockedIds = new Set((roles ?? []).filter((r: any) => isAdminLockedRole(r)).map((r: any) => r.id));
    const grants = Object.entries(caps)
      .filter(([roleId, c]) => c.length > 0 && !lockedIds.has(Number(roleId)))
      .map(([roleId, capabilities]) => {
        const rid = Number(roleId);
        const cf = cardFilter[rid];
        return {
          roleId: rid,
          capabilities,
          cardFilter: Array.isArray(cf) && cf.length > 0 ? cf : null,
        };
      });
    try {
      await m.setAccess.mutateAsync({ pipelineId, restricted, grants });
      toast.success("Pengaturan akses disimpan");
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Gagal menyimpan akses");
    }
  };

  const grantedCount = Object.values(caps).filter((c) => c.length > 0).length;

  const pipelineFields = pipeline?.fields ?? [];
  const pipelineStages = (pipeline?.stages ?? []).map((s) => ({ id: s.id, label: s.label }));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={cn(dialog.sizeClass, "overflow-hidden flex flex-col p-0")}>
        <DialogSizeToggle size={dialog.size} onCycle={dialog.cycle} />
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
              <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <DialogTitle className="text-base">Akses Pipeline</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Atur siapa yang boleh melihat atau mengedit pipeline ini
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {/* Restricted toggle */}
          <div className="px-6 py-4 border-b">
            <label className="flex items-center justify-between gap-3 cursor-pointer select-none group">
              <div>
                <div className="text-sm font-medium leading-tight">Batasi Akses</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {restricted
                    ? "Hanya role yang diberi izin di bawah yang dapat mengakses pipeline ini."
                    : 'Semua role dengan izin "Pipelines" dapat mengakses pipeline ini.'}
                </div>
              </div>
              <Switch checked={restricted} onCheckedChange={setRestricted} />
            </label>
          </div>

          {/* Role × capability grid */}
          <div className="px-6 py-4">
            {!restricted ? (
              <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 py-6 text-center">
                <Users className="h-7 w-7 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm font-medium text-muted-foreground">Akses Terbuka</p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">
                  Aktifkan "Batasi Akses" untuk mengatur per-role.
                </p>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Izin per Role
                  </p>
                  {grantedCount > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                      {grantedCount} role memiliki akses
                    </span>
                  )}
                </div>

                {!roles?.length ? (
                  <p className="text-xs text-muted-foreground">Tidak ada role ditemukan.</p>
                ) : (
                  <div className="space-y-1.5">
                    {(roles ?? []).map((r) => {
                      if (isAdminLockedRole(r)) {
                        return (
                          <div key={r.id} className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-medium">{r.name}</div>
                              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-success/10 text-success font-medium">
                                <ShieldCheck className="size-3" aria-hidden="true" />
                                Akses penuh (terkunci)
                              </span>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              Role bawaan - selalu punya semua izin pipeline dan tidak bisa dikurangi.
                            </p>
                          </div>
                        );
                      }
                      const roleCaps = caps[r.id] ?? [];
                      const hasAnyCap = roleCaps.length > 0;
                      const roleFilter = cardFilter[r.id] ?? [];
                      const isFilterOpen = filterOpen[r.id] ?? false;
                      const hasActiveFilter = roleFilter.length > 0;
                      return (
                        <div key={r.id} className="rounded-lg border border-border/60 bg-card px-3 py-2.5 shadow-elev-sm">
                          <div className="text-sm font-medium mb-1.5">{r.name}</div>
                          <fieldset className="flex flex-wrap gap-x-4 gap-y-1.5 border-0 p-0 m-0">
                            <legend className="sr-only">Izin {r.name}</legend>
                            {ALL_PIPELINE_CAPABILITIES.map((cap) => {
                              const checked = roleCaps.includes(cap);
                              return (
                                <label key={cap} className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => toggleCap(r.id, cap, e.target.checked)}
                                  />
                                  {PIPELINE_CAPABILITY_LABELS[cap]}
                                </label>
                              );
                            })}
                          </fieldset>

                          {/* Filter Kartu - only shown when role has at least one capability */}
                          {hasAnyCap && (
                            <div className="mt-2.5 border-t border-border/40 pt-2">
                              <button
                                type="button"
                                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors select-none"
                                onClick={() => setFilterOpen((s) => ({ ...s, [r.id]: !s[r.id] }))}
                              >
                                {isFilterOpen ? (
                                  <ChevronDown className="size-3.5 shrink-0" />
                                ) : (
                                  <ChevronRight className="size-3.5 shrink-0" />
                                )}
                                <Filter className="size-3 shrink-0" />
                                <span className="font-medium">Filter Kartu</span>
                                {hasActiveFilter && (
                                  <span className="ml-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium">
                                    aktif
                                  </span>
                                )}
                              </button>

                              {isFilterOpen && (
                                <div className="mt-2 space-y-2">
                                  <p className="text-[10px] text-muted-foreground">
                                    Kosong = role ini melihat semua kartu pipeline. Isi untuk membatasi (mis. Departemen = Finance).
                                  </p>
                                  <ConditionsBuilder
                                    fields={pipelineFields}
                                    stages={pipelineStages}
                                    value={roleFilter}
                                    onChange={(v) => setCardFilter((s) => ({ ...s, [r.id]: v }))}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <p className="text-[10px] text-muted-foreground mt-3">
                  Role tanpa izin eksplisit tidak dapat mengakses pipeline ini.
                </p>
                <p className="text-[10px] text-muted-foreground/70 mt-1">
                  Aksi (Komentar/Tugaskan/Export/Import) otomatis tercakup oleh &ldquo;Kelola Kartu&rdquo; &mdash; centang terpisah hanya untuk role tanpa Kelola Kartu penuh.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t shrink-0">
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={save} loading={m.setAccess.isPending}>
            Simpan Akses
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
