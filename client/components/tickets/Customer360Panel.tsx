/**
 * v4.2.18 (B.2): Customer 360 Panel
 * Tampilkan profile customer lengkap di sidebar /work/:id:
 * - Identitas (nama, ID, telp, alamat)
 * - Paket internet + harga
 * - Status billing
 * - ONT info (SN, MAC)
 * - Riwayat 5 tiket terakhir (collapsible)
 * - Quick actions: WA, Telp, Detail
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { api } from "@/lib/api";
import { formatDateOnly, formatRelative } from "@/lib/dateFormat";
import { cn } from "@/lib/utils";
import {
  User, Phone, MessageSquare, MapPin, Wifi, Calendar,
  ChevronDown, ChevronUp, ExternalLink, AlertTriangle, CheckCircle2, Clock,
  Loader2, Ticket as TicketIcon,
} from "lucide-react";

interface CustomerProfile {
  customer: {
    id: number;
    customerId: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    lat: number | null;
    lng: number | null;
    package: string | null;
    billingPrice: number | null;
    billingStatus: string | null;
    installDate: string | null;
    ontSerialNumber: string | null;
    macAddress: string | null;
    pppoeUsername: string | null;
    isIsolir: number | null;
    district: string | null;
    village: string | null;
    odpId: number | null;
  };
  odp: { id: number; name: string; totalPorts: number; district: string | null } | null;
  recentTickets: Array<{
    id: number; ticketNumber: string; title: string;
    status: string | null; priority: string | null;
    createdAt: string | null; resolvedAt: string | null;
    categoryId: number | null;
  }>;
  totalTickets: number;
}

const STATUS_TONE: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  assigned: "bg-cyan-100 text-cyan-700",
  in_progress: "bg-orange-100 text-orange-700",
  pending: "bg-amber-100 text-amber-700",
  resolved: "bg-emerald-100 text-emerald-700",
  closed: "bg-zinc-100 text-zinc-600",
};

export function Customer360Panel({ customerId, currentTicketId }: { customerId: number; currentTicketId?: number }) {
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const { data, isLoading } = useQuery<CustomerProfile>({
    queryKey: ["customer-profile", customerId],
    queryFn: () => api.get(`/customers/${customerId}/profile`),
    enabled: !!customerId,
  });

  if (isLoading || !data) {
    return (
      <div className="rounded-lg border bg-card p-4 flex items-center justify-center min-h-[120px] text-xs text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading customer...
      </div>
    );
  }

  const c = data.customer;
  const isOverdue = c.billingStatus === "belum_lunas" || c.billingStatus === "overdue";
  const otherTickets = data.recentTickets.filter(t => t.id !== currentTicketId);

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center gap-2">
        <User className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Customer 360</span>
        {data.totalTickets > 1 && (
          <span className="ml-auto text-[10px] font-mono tabular-nums text-muted-foreground" title={`${data.totalTickets} tiket sepanjang waktu`}>
            {data.totalTickets} tiket total
          </span>
        )}
      </div>

      {/* Identity */}
      <div className="px-4 py-3 border-b">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-sky-400 to-blue-600 grid place-items-center text-white font-bold shrink-0">
            {(c.name || "?").charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm truncate">{c.name}</div>
            <div className="text-[11px] font-mono text-muted-foreground">#{c.customerId}</div>
            {c.address && (
              <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-snug">
                <MapPin className="w-3 h-3 inline -mt-0.5 mr-0.5" />
                {c.address}
              </div>
            )}
          </div>
        </div>

        {/* Quick action row */}
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {c.phone ? (
            <a href={`tel:${c.phone}`} className="flex items-center justify-center gap-1 h-8 rounded-md bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 text-[11px] font-semibold border border-blue-200/50 transition-colors">
              <Phone className="w-3 h-3" /> Telp
            </a>
          ) : (
            <div className="flex items-center justify-center gap-1 h-8 rounded-md bg-muted/40 text-muted-foreground text-[11px] font-semibold border border-dashed">-</div>
          )}
          {c.phone && (
            <a href={`https://wa.me/${c.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1 h-8 rounded-md bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 text-[11px] font-semibold border border-emerald-200/50 transition-colors">
              <MessageSquare className="w-3 h-3" /> WA
            </a>
          )}
          <Link href={`/customers?id=${c.id}`} className="flex items-center justify-center gap-1 h-8 rounded-md bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-900 text-foreground text-[11px] font-semibold border transition-colors">
            <ExternalLink className="w-3 h-3" /> Detail
          </Link>
        </div>
      </div>

      {/* Package & Billing */}
      <div className="px-4 py-2.5 border-b">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Paket Internet</span>
          {c.isIsolir === 1 && (
            <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0 rounded bg-rose-100 text-rose-800">ISOLIR</span>
          )}
        </div>
        <div className="text-sm font-bold">{c.package || "-"}</div>
        <div className="flex items-center justify-between text-[11px] mt-0.5">
          {c.billingPrice ? (
            <span className="text-muted-foreground tabular-nums">Rp {c.billingPrice.toLocaleString("id-ID")}/bln</span>
          ) : <span className="text-muted-foreground">Harga tidak tersedia</span>}
          {c.billingStatus && (
            <span className={cn(
              "uppercase tracking-wider font-bold text-[9px] px-1.5 py-0 rounded",
              isOverdue ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700",
            )}>{isOverdue ? "Belum Lunas" : "Lunas"}</span>
          )}
        </div>
      </div>

      {/* Network info */}
      <div className="px-4 py-2.5 border-b space-y-1.5">
        <div className="flex items-start justify-between gap-2 text-[11px]">
          <span className="text-muted-foreground shrink-0">PPPoE</span>
          <span className="font-mono text-foreground/80 truncate">{c.pppoeUsername || "-"}</span>
        </div>
        <div className="flex items-start justify-between gap-2 text-[11px]">
          <span className="text-muted-foreground shrink-0">ONT SN</span>
          <span className="font-mono text-foreground/80 truncate">{c.ontSerialNumber || "-"}</span>
        </div>
        {c.macAddress && (
          <div className="flex items-start justify-between gap-2 text-[11px]">
            <span className="text-muted-foreground shrink-0">MAC</span>
            <span className="font-mono text-foreground/80 truncate">{c.macAddress}</span>
          </div>
        )}
        {c.installDate && (
          <div className="flex items-start justify-between gap-2 text-[11px]">
            <span className="text-muted-foreground shrink-0">Pasang</span>
            <span className="text-foreground/80">{formatDateOnly(c.installDate)}</span>
          </div>
        )}
      </div>

      {/* Recent tickets */}
      {otherTickets.length > 0 && (
        <div className="border-b">
          <button
            onClick={() => setHistoryExpanded(!historyExpanded)}
            className="w-full px-4 py-2 flex items-center justify-between hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <TicketIcon className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Tiket Lain ({otherTickets.length})</span>
            </div>
            {historyExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {historyExpanded && (
            <div className="divide-y border-t">
              {otherTickets.map(t => (
                <Link key={t.id} href={`/work/${t.id}`} className="block px-4 py-2 hover:bg-muted/30">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-blue-600 font-semibold">{t.ticketNumber}</span>
                    {t.status && <span className={cn("text-[9px] uppercase tracking-wider font-bold px-1.5 py-0 rounded", STATUS_TONE[t.status] || STATUS_TONE.open)}>{t.status}</span>}
                  </div>
                  <div className="text-xs truncate text-foreground/80 mt-0.5">{t.title}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{formatRelative(t.createdAt)}</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
