import { Card, CardContent } from "@/components/ui/card";
import { MessageSquare, ArrowRight, XCircle } from "lucide-react";
import { LoadingState, DataField, BillingStatusBadge } from "./shared";

export function BillingTab({ billing, customer }: any) {
  if (!billing) return <LoadingState />;

  const dueDate = billing.dueDate ? new Date(billing.dueDate) : null;
  const daysUntilDue = dueDate ? Math.ceil((dueDate.getTime() - Date.now()) / 86400_000) : null;
  const isOverdue = daysUntilDue !== null && daysUntilDue < 0;
  const isPaid = billing.billingStatus === "lunas" || billing.billingStatus === "paid";

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Invoice-style hero */}
      <Card className="overflow-hidden">
        <div className={`h-1.5 ${isPaid ? "bg-success" : isOverdue ? "bg-destructive" : "bg-sky-500"}`} />
        <CardContent className="p-6 md:p-8">
          <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tagihan Aktif</div>
              <div className="text-4xl font-bold tracking-tight mt-1">
                Rp {(billing.billingPrice ?? 0).toLocaleString("id-ID")}
              </div>
              <div className="text-xs text-muted-foreground mt-1">per bulan · {billing.package || "-"}</div>
            </div>
            <BillingStatusBadge status={billing.billingStatus} isOverdue={isOverdue} />
          </div>

          {/* Timeline mini */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-5 border-t">
            <DataField label="Jatuh Tempo" value={dueDate ? dueDate.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" }) : "-"} meta={daysUntilDue !== null ? (isOverdue ? `telat ${Math.abs(daysUntilDue)} hari` : `${daysUntilDue} hari lagi`) : undefined} metaTone={isOverdue ? "danger" : daysUntilDue !== null && daysUntilDue <= 7 ? "warn" : "muted"} />
            <DataField label="Pembayaran Terakhir" value={billing.lastPaymentDate ? new Date(billing.lastPaymentDate).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" }) : "Belum ada"} />
            <DataField label="Tanggal Instalasi" value={billing.installDate ? new Date(billing.installDate).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" }) : "-"} />
          </div>

          {billing.isIsolir && (
            <div className="mt-5 p-4 rounded-lg bg-destructive/10 border border-destructive/30 flex items-start gap-3">
              <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-sm text-destructive">Layanan Diisolir</div>
                <div className="text-xs text-destructive/80 mt-0.5">
                  Sejak {billing.isolirDate ? new Date(billing.isolirDate).toLocaleDateString("id-ID") : "-"}. Setelah pembayaran, layanan aktif kembali dalam 1×24 jam.
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment info */}
      <Card>
        <CardContent className="p-5 md:p-6">
          <h3 className="text-sm font-semibold mb-1">Cara Pembayaran</h3>
          <p className="text-xs text-muted-foreground mb-4">Hubungi CS JABNET untuk informasi rekening dan konfirmasi pembayaran.</p>

          <a
            href="https://wa.me/6282180009030"
            target="_blank" rel="noreferrer"
            className="flex items-center justify-between p-4 rounded-lg border-2 border-dashed border-success/30 bg-success/50 hover:bg-success/10 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-success flex items-center justify-center shadow-sm">
                <MessageSquare className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="text-sm font-semibold">Hubungi CS via WhatsApp</div>
                <div className="text-xs text-muted-foreground">Respons cepat · online 08:00-22:00</div>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-success" />
          </a>
        </CardContent>
      </Card>
    </div>
  );
}

// =====================================================================
// WIFI TAB
// =====================================================================
