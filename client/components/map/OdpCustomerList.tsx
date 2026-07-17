import { useState } from "react";
import { ExternalLink, Wifi, WifiOff } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { CUSTOMER_STATUS_META } from "@shared/customerStatus";
import { OpticalPowerBadge } from "./OpticalPowerBadge";
import type { OdpDetail, OdpOntStatus } from "@/hooks/useOdpDetail";
import { formatRelative, formatDuration } from "@/lib/dateFormat";

const PAGE = 10;

/** Daftar pelanggan terhubung ke ODP — card list mobile-first, info ACS lazy-merge. */
export function OdpCustomerList({ customers, ont, onOpenCustomer }: {
  customers: OdpDetail["customers"];
  ont?: OdpOntStatus;
  onOpenCustomer: (customerId: string) => void;
}) {
  const [shown, setShown] = useState(PAGE);
  if (customers.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">Belum ada pelanggan terhubung.</p>;
  }
  const visible = customers.slice(0, shown);
  return (
    <div>
      <ul className="space-y-2">
        {visible.map((c) => {
          const meta = CUSTOMER_STATUS_META[c.connStatus];
          const acs = ont?.configured ? ont.byCustomer?.[c.id] : undefined;
          return (
            <li key={c.id}>
              <article className="rounded-lg border border-border/60 bg-card p-2.5">
                <header className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{c.name}</p>
                    <p className="text-[11px] font-mono text-muted-foreground">{c.customerId}</p>
                  </div>
                  <StatusBadge variant={meta.variant} label={meta.label} size="sm" />
                </header>
                <dl className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                  {c.package && <div><dt className="sr-only">Paket</dt><dd>{c.package}</dd></div>}
                  {c.portNumber != null && <div><dt className="sr-only">Port ODP</dt><dd>Port {c.portNumber}</dd></div>}
                  {c.ontSerialNumber && <div><dt className="sr-only">ONT</dt><dd className="font-mono">{c.ontSerialNumber}</dd></div>}
                </dl>
                {/* Baris ACS — muncul setelah ont-status ter-load */}
                {acs && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {acs.matched ? (
                      <>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${acs.status === "online" ? "text-success" : "text-destructive"}`}>
                          {acs.status === "online" ? <Wifi className="size-3" aria-hidden="true" /> : <WifiOff className="size-3" aria-hidden="true" />}
                          {acs.status === "online" ? "Online" : "Offline"}
                        </span>
                        <OpticalPowerBadge value={acs.rxPower} kind="RX" thresholds={ont!.thresholds} />
                        {acs.txPower && <OpticalPowerBadge value={acs.txPower} kind="TX" />}
                        {acs.lastInform && <span className="text-[10px] text-muted-foreground">Inform {formatRelative(acs.lastInform)}</span>}
                        {acs.uptime != null && acs.uptime > 0 && <span className="text-[10px] text-muted-foreground">Up {formatDuration(acs.uptime)}</span>}
                      </>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/70 italic">ONT tidak terdaftar di ACS</span>
                    )}
                  </div>
                )}
                <footer className="mt-2">
                  <button
                    type="button"
                    onClick={() => onOpenCustomer(c.customerId)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline min-h-[24px]"
                  >
                    <ExternalLink className="size-3" aria-hidden="true" /> Lihat Detail
                  </button>
                </footer>
              </article>
            </li>
          );
        })}
      </ul>
      {customers.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + PAGE)}
          className="mt-2 w-full rounded-md border border-input py-1.5 text-xs font-medium hover:bg-muted/40">
          Tampilkan {Math.min(PAGE, customers.length - shown)} lagi ({customers.length - shown} tersisa)
        </button>
      )}
    </div>
  );
}
