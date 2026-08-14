import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, CheckCircle2, XCircle, Calendar, AlertTriangle, Sparkles, Pencil, Trash2 } from "lucide-react";
import { LEVEL_CFG, SOURCE_LABELS, fmtRewardValue, fmtRp, fmtDate } from "./shared";

export function DiscountRow({ d, canEdit, onApply, onCancel, onEdit, onDelete }: any) {
  const lvl = LEVEL_CFG[d.sahabatLevel ?? "new"] ?? LEVEL_CFG.new;
  const isExpired = d.expiresAt && new Date(d.expiresAt).getTime() < Date.now();
  const isDeleted = !!d.deletedAt;
  const rewardValueStr = fmtRewardValue(d);
  const isPercent = d.discountType === "percent";
  const isVoucher = d.discountType === "voucher_indomaret" || d.discountType === "cash_bonus";
  return (
    <Card className={`hover:shadow-sm transition-all ${isDeleted ? "opacity-50 line-through" : isExpired ? "opacity-60" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-semibold text-sm">{d.customerName}</span>
              <span className="text-xs text-muted-foreground font-mono">#{d.customerBillingId}</span>
              {d.sahabatCode && (
                <span className="inline-flex items-center px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 rounded text-[10px] font-mono font-semibold">
                  {d.sahabatCode}
                </span>
              )}
              <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${lvl.bg} ${lvl.color}`}>
                {lvl.label}
              </span>
              {isDeleted && (
                <span className="no-underline ml-1 text-[10px] px-1.5 py-0.5 rounded-md bg-destructive/15 text-destructive font-semibold">
                  Dihapus
                </span>
              )}
            </div>
            <div className="text-sm text-foreground/80 mt-1">{d.description}</div>
            <div className="flex items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground mt-2 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Periode {d.eligibleForPeriod ?? "-"}
              </span>
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                {SOURCE_LABELS[d.source] ?? d.source}
              </span>
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" />
                Ref sukses: <strong className="text-indigo-600 dark:text-indigo-400">{d.totalSuccessfulReferrals ?? 0}</strong>
              </span>
              {isPercent && d.billingPrice && (
                <span>
                  Tagihan <strong>{fmtRp(d.billingPrice)}</strong> → hemat <strong className="text-success">{fmtRp(Math.round(d.billingPrice * d.discountValue / 100))}</strong>
                </span>
              )}
            </div>
          </div>
          <div className="text-right shrink-0 border-l pl-4">
            <div className="text-2xl font-bold text-success whitespace-nowrap tabular-nums">{rewardValueStr}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mt-0.5">
              {isVoucher ? "Voucher/Cash" : isPercent ? (d.discountValue === 100 ? "GRATIS" : "Diskon") : d.discountType.replace(/_/g, " ")}
            </div>
          </div>
        </div>

      {d.status === "pending" && (
        <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t flex-wrap">
          {isExpired ? (
            <span className="text-xs text-destructive font-medium inline-flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Expired {fmtDate(d.expiresAt)}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              Expires: <strong className="text-foreground">{fmtDate(d.expiresAt)}</strong>
              {d.customerPhone && <> · <a href={`tel:${d.customerPhone}`} className="hover:underline text-sky-600">{d.customerPhone}</a></>}
            </span>
          )}
          {canEdit && (
            <div className="flex gap-2 items-center flex-wrap">
              <Button size="icon-xs" variant="ghost" onClick={onEdit} title="Edit diskon">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={onDelete}
                disabled={d.status === "applied"}
                title={d.status === "applied" ? "Sudah dipakai customer, tidak bisa dihapus" : "Hapus diskon"}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
              <Button size="sm" variant="outline" onClick={onCancel} className="h-8 text-xs text-destructive hover:bg-destructive/10">Batalkan</Button>
              <Button size="sm" onClick={onApply} className="h-8 text-xs bg-success hover:brightness-95">
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Apply
              </Button>
            </div>
          )}
        </div>
      )}
      {d.status === "applied" && (
        <div className="mt-3 pt-3 border-t text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
          <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
          <span className="flex-1">
            Applied oleh <strong className="text-foreground">{d.appliedByName ?? "-"}</strong> · {fmtDate(d.appliedAt)}
            {d.invoiceRef && <span> · Ref: <code className="bg-muted px-1.5 py-0.5 rounded text-foreground">{d.invoiceRef}</code></span>}
          </span>
          {canEdit && (
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={onDelete}
              disabled
              title="Sudah dipakai customer, tidak bisa dihapus"
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          )}
        </div>
      )}
      {d.status === "cancelled" && (
        <div className="mt-3 pt-3 border-t text-[11px] text-destructive flex items-center gap-2 flex-wrap">
          <XCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">
            Dibatalkan {fmtDate(d.appliedAt ?? d.createdAt)}
            {d.invoiceRef && <span> · {d.invoiceRef}</span>}
          </span>
          {canEdit && (
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={onDelete}
              title="Hapus diskon"
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          )}
        </div>
      )}
      </CardContent>
    </Card>
  );
}

