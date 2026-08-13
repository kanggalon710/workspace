import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useEffect } from "react";
import type { Customer } from "@shared/schema";
import { Filter, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

function pickBestSerial(c: AuditCandidate): string | null {
  return c.devicePonSerialNumber || c.deviceSerialNumber;
}

interface AuditCandidate {
  deviceId: string;
  devicePppoe: string;
  deviceSerialNumber: string | null;
  devicePonSerialNumber: string | null;
  deviceStatus: "online" | "offline" | null;
  deviceManufacturer: string | null;
  deviceModel: string | null;
  confidence: number;
  matchMethod: "alphanumeric" | "leading_zero" | "substring" | "levenshtein";
}
interface AuditItem {
  customerId: number;
  customerName: string;
  customerBillingId: string;
  customerPppoe: string;
  candidates: AuditCandidate[];
}
interface AuditResponse {
  totalUnmatched: number;
  totalDevices: number;
  devicesWithPppoe: number;
  withCandidate: number;
  highConfidenceCount: number;
  noCandidate: number;
  items: AuditItem[];
}

const METHOD_LABELS: Record<string, string> = {
  alphanumeric: "Strip simbol",
  leading_zero: "Strip 0 awal",
  substring: "Substring",
  levenshtein: "Mirip (typo)",
};

export function IntegrationAuditDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [selections, setSelections] = useState<Map<number, string>>(new Map());
  const [confidenceFilter, setConfidenceFilter] = useState<number>(0);

  const { data: audit, isLoading, refetch } = useQuery<AuditResponse>({
    queryKey: ["/api/customers/integration-audit"],
    queryFn: () => api.get<AuditResponse>("/customers/integration-audit"),
    enabled: open,
    staleTime: 60_000,
  });

  // Pre-fill selections: top candidate untuk semua high-confidence (>= 90)
  useEffect(() => {
    if (!audit?.items) return;
    setSelections((prev) => {
      const next = new Map(prev);
      for (const item of audit.items) {
        if (next.has(item.customerId)) continue;
        const top = item.candidates[0];
        const sn = top ? pickBestSerial(top) : null;
        if (top && top.confidence >= 90 && sn) {
          next.set(item.customerId, sn);
        }
      }
      return next;
    });
  }, [audit?.items]);

  const pairMut = useMutation({
    mutationFn: (pairs: Array<{ customerId: number; deviceSerialNumber: string }>) =>
      api.post<{ success: number; failed: number }>("/customers/auto-pair-ont", { pairs }),
    onSuccess: (r: any) => {
      const data = r?.data ?? r;
      toast.success(`${data?.success ?? 0} customer berhasil di-pair ke ONT`);
      qc.invalidateQueries({ queryKey: ["/api/customers/ont-status"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      refetch();
      setSelections(new Map());
      onClose();
    },
    onError: (e: any) => toast.error(e.message || "Gagal apply pairing"),
  });

  const filteredItems = useMemo(() => {
    if (!audit?.items) return [];
    return audit.items.filter((item) => {
      if (confidenceFilter === 0) return true;
      return item.candidates.some((c) => c.confidence >= confidenceFilter);
    });
  }, [audit?.items, confidenceFilter]);

  const selectedCount = selections.size;
  const totalCandidates = audit?.withCandidate ?? 0;

  function applySelections() {
    const pairs: Array<{ customerId: number; deviceSerialNumber: string }> = [];
    for (const [cid, sn] of selections) {
      if (sn) pairs.push({ customerId: cid, deviceSerialNumber: sn });
    }
    if (pairs.length === 0) {
      toast.error("Tidak ada pairing yang dipilih");
      return;
    }
    if (!confirm(`Apply ${pairs.length} pairing ONT? Customer akan dapat ontSerialNumber yang ke-link ke device GenieACS.`)) return;
    pairMut.mutate(pairs);
  }

  function selectAllHighConfidence() {
    if (!audit?.items) return;
    const next = new Map(selections);
    let added = 0;
    for (const item of audit.items) {
      const top = item.candidates[0];
      const sn = top ? pickBestSerial(top) : null;
      if (top && top.confidence >= 90 && sn && !next.has(item.customerId)) {
        next.set(item.customerId, sn);
        added++;
      }
    }
    setSelections(next);
    toast.success(`${added} pairing high-confidence dipilih`);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-5 py-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            Audit & Auto-Pair ONT
          </DialogTitle>
          <DialogDescription>
            Cari pasangan ONT dari GenieACS untuk customer yang punya PPPoE tapi belum match. Pakai fuzzy matching.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex-1 grid place-items-center py-16">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-xs">Scanning {(audit as any)?.totalUnmatched ?? "..."} customer + {(audit as any)?.totalDevices ?? "..."} device GenieACS...</span>
            </div>
          </div>
        ) : !audit ? (
          <div className="flex-1 grid place-items-center py-16">
            <span className="text-sm text-muted-foreground">Gagal memuat audit. GenieACS mungkin belum dikonfigurasi.</span>
          </div>
        ) : (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 border-b">
              <div className="px-4 py-3">
                <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Customer Unmatched</div>
                <div className="text-2xl font-bold tabular-nums text-foreground mt-0.5">{audit.totalUnmatched.toLocaleString("id-ID")}</div>
              </div>
              <div className="px-4 py-3">
                <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Punya Kandidat</div>
                <div className="text-2xl font-bold tabular-nums text-success mt-0.5">{audit.withCandidate.toLocaleString("id-ID")}</div>
              </div>
              <div className="px-4 py-3">
                <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Confident ≥90%</div>
                <div className="text-2xl font-bold tabular-nums text-warning mt-0.5">{audit.highConfidenceCount.toLocaleString("id-ID")}</div>
              </div>
              <div className="px-4 py-3">
                <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Tidak Ada Match</div>
                <div className="text-2xl font-bold tabular-nums text-destructive mt-0.5">{audit.noCandidate.toLocaleString("id-ID")}</div>
              </div>
            </div>

            {/* Toolbar */}
            <div className="flex items-center justify-between gap-2 px-5 py-2.5 border-b bg-muted/30 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase font-bold text-muted-foreground">Filter:</span>
                {[
                  { val: 0, label: "Semua" },
                  { val: 90, label: "≥ 90%" },
                  { val: 80, label: "≥ 80%" },
                  { val: 70, label: "≥ 70%" },
                ].map((f) => (
                  <button
                    key={f.val}
                    onClick={() => setConfidenceFilter(f.val)}
                    className={cn(
                      "text-[11px] px-2 py-1 rounded font-semibold",
                      confidenceFilter === f.val ? "bg-primary text-primary-foreground" : "bg-card border hover:bg-muted",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                {audit.highConfidenceCount > 0 && (
                  <Button size="sm" variant="outline" onClick={selectAllHighConfidence} className="h-7 text-xs">
                    Pilih semua ≥90%
                  </Button>
                )}
                {selectedCount > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => setSelections(new Map())} className="h-7 text-xs text-muted-foreground">
                    Reset pilihan
                  </Button>
                )}
              </div>
            </div>

            {/* Items list */}
            <div className="flex-1 overflow-y-auto">
              {filteredItems.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground text-sm">
                  {audit.withCandidate === 0
                    ? "Tidak ada kandidat ditemukan. Mungkin GenieACS kosong atau PPPoE username terlalu beda."
                    : "Tidak ada item match filter ini"}
                </div>
              ) : (
                <div className="divide-y">
                  {filteredItems.map((item) => {
                    const selected = selections.get(item.customerId);
                    const isSelected = !!selected;
                    return (
                      <div key={item.customerId} className={cn(
                        "px-5 py-3 transition-colors",
                        isSelected ? "bg-success/40" : "hover:bg-muted/30",
                      )}>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm text-foreground">{item.customerName}</span>
                              <span className="text-[10px] font-mono text-muted-foreground">#{item.customerBillingId}</span>
                              {isSelected && <Badge className="bg-success text-white text-[9px] uppercase tracking-wider px-1.5 py-0 border-0">✓ akan di-pair</Badge>}
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                              PPPoE customer: <span className="font-mono font-semibold text-foreground/80">{item.customerPppoe}</span>
                            </div>
                          </div>
                          {item.candidates.length === 0 && (
                            <span className="text-[10px] uppercase tracking-wider font-bold text-destructive bg-destructive/10 border border-destructive/30 px-1.5 py-0.5 rounded shrink-0">
                              Tidak ada match
                            </span>
                          )}
                        </div>

                        {item.candidates.length > 0 && (
                          <div className="space-y-1.5 ml-3 pl-3 border-l-2 border-muted">
                            {item.candidates.map((c) => {
                              const bestSn = pickBestSerial(c);
                              const isThisSelected = selected === bestSn;
                              const confTone = c.confidence >= 90 ? "emerald" : c.confidence >= 80 ? "amber" : "zinc";
                              return (
                                <button
                                  key={c.deviceId}
                                  onClick={() => {
                                    const next = new Map(selections);
                                    if (isThisSelected) next.delete(item.customerId);
                                    else if (bestSn) next.set(item.customerId, bestSn);
                                    setSelections(next);
                                  }}
                                  disabled={!bestSn}
                                  className={cn(
                                    "w-full text-left px-3 py-2 rounded-md flex items-center gap-3 transition-all",
                                    isThisSelected ? "bg-success/15 ring-2 ring-success" : "bg-muted/40 hover:bg-muted/70",
                                    !bestSn && "opacity-50 cursor-not-allowed",
                                  )}
                                >
                                  <div className={cn(
                                    "px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tabular-nums shrink-0",
                                    confTone === "emerald" && "bg-success text-white",
                                    confTone === "amber" && "bg-warning text-white",
                                    confTone === "zinc" && "bg-muted text-white",
                                  )}>
                                    {c.confidence}%
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-mono text-xs font-semibold text-foreground truncate">{c.devicePppoe}</span>
                                      {c.deviceStatus === "online" ? (
                                        <span className="text-[9px] uppercase tracking-wider font-bold px-1 py-0 rounded bg-success/15 text-success">Online</span>
                                      ) : c.deviceStatus === "offline" ? (
                                        <span className="text-[9px] uppercase tracking-wider font-bold px-1 py-0 rounded bg-destructive/15 text-destructive">Offline</span>
                                      ) : null}
                                      <span className="text-[9px] uppercase tracking-wider font-semibold px-1 py-0 rounded bg-muted text-muted-foreground">
                                        {METHOD_LABELS[c.matchMethod]}
                                      </span>
                                    </div>
                                    <div className="text-[10px] text-muted-foreground mt-0.5 flex flex-col gap-0.5">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        {c.devicePonSerialNumber && (
                                          <span className="font-mono">
                                            <span className="text-success font-bold">PON SN:</span> {c.devicePonSerialNumber}
                                            <span className="text-success ml-1 text-[9px]">(yang OLT register)</span>
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        {c.deviceSerialNumber && c.deviceSerialNumber !== c.devicePonSerialNumber && (
                                          <span className="font-mono opacity-70">
                                            <span className="text-muted-foreground">Factory SN:</span> {c.deviceSerialNumber}
                                          </span>
                                        )}
                                        {c.deviceManufacturer && <span>· {c.deviceManufacturer} {c.deviceModel}</span>}
                                      </div>
                                    </div>
                                  </div>
                                  <div className={cn(
                                    "h-5 w-5 rounded-full border-2 grid place-items-center shrink-0",
                                    isThisSelected ? "bg-success border-success/30" : "border-muted-foreground/30",
                                  )}>
                                    {isThisSelected && <Check className="h-3 w-3 text-white" />}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t bg-muted/30 flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">
                <span className="font-bold text-foreground tabular-nums">{selectedCount}</span> dipilih dari {totalCandidates.toLocaleString("id-ID")} kandidat
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>Tutup</Button>
                <Button
                  onClick={applySelections}
                  disabled={selectedCount === 0 || pairMut.isPending}
                  className="bg-success hover:brightness-95 text-white"
                >
                  {pairMut.isPending ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Apply...</> : <> Apply {selectedCount} Pairing</>}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Tab "Komunikasi" di detail pelanggan: cari kontak Chatwoot via phone, tampilkan
 * daftar percakapan + thread (read-only). Komponen di-reuse dari /communications. */
