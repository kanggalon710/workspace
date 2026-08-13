import { Loader2 } from "lucide-react";

// v4.2.14: feature flag - Tagihan di-hide sementara karena belum integrasi
export const FEATURE_BILLING_ENABLED = false;

export function LoadingState() {
  return (
    <div className="py-12 flex flex-col items-center justify-center text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin mb-2" />
      <div className="text-xs">Memuat data...</div>
    </div>
  );
}

export function AlertCard({ variant, icon, title, desc, cta }: any) {
  const styles = {
    danger: "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300",
    warning: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300",
  }[variant as string] ?? "";
  return (
    <div className={`rounded-xl border p-4 flex items-start gap-3 ${styles}`}>
      <div className="shrink-0 mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">{title}</div>
        <div className="text-xs opacity-90 mt-0.5">{desc}</div>
      </div>
      {cta && (
        <button onClick={cta.onClick} className="shrink-0 text-xs font-semibold underline hover:no-underline whitespace-nowrap">
          {cta.label}
        </button>
      )}
    </div>
  );
}

export function MiniStat({ icon, label, value, mono, tone }: { icon: React.ReactNode; label: string; value: string; mono?: boolean; tone?: "good" | "warn" | "bad" | "muted" }) {
  const toneCls = tone === "good" ? "text-emerald-600 dark:text-emerald-400" :
                  tone === "warn" ? "text-amber-600 dark:text-amber-400" :
                  tone === "bad" ? "text-rose-600 dark:text-rose-400" :
                  tone === "muted" ? "text-muted-foreground" : "";
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`text-sm font-semibold mt-0.5 truncate ${mono ? "font-mono" : ""} ${toneCls}`}>
        {value}
      </div>
    </div>
  );
}

export function BigStat({ icon, label, value, mono, tone }: { icon: React.ReactNode; label: string; value: string; mono?: boolean; tone?: "sky" | "emerald" | "amber" }) {
  const toneCls = tone === "sky" ? "text-sky-600 dark:text-sky-400" :
                  tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" :
                  tone === "amber" ? "text-amber-600 dark:text-amber-400" : "";
  return (
    <div className="p-3 rounded-lg border bg-card">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        <span className={toneCls}>{icon}</span>
        <span>{label}</span>
      </div>
      <div className={`text-sm font-bold mt-1 truncate ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

export function IdentityField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className={`text-sm font-semibold mt-0.5 truncate ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

export function DataField({ label, value, meta, metaTone }: { label: string; value: string; meta?: string; metaTone?: "danger" | "warn" | "muted" }) {
  const metaCls = metaTone === "danger" ? "text-rose-600" :
                  metaTone === "warn" ? "text-amber-600" :
                  "text-muted-foreground";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className="text-sm font-semibold mt-0.5">{value}</div>
      {meta && <div className={`text-[10px] mt-0.5 ${metaCls}`}>{meta}</div>}
    </div>
  );
}

export function QuickAction({
  icon: Ic, label, desc, tone, onClick, badge,
}: {
  icon: any;
  label: string;
  desc: string;
  tone: "sky" | "emerald" | "amber" | "violet" | "rose";
  onClick: () => void;
  badge?: string;
}) {
  const tones: Record<string, { bg: string; icon: string; hover: string; gradient: string }> = {
    sky: {
      bg: "bg-sky-500/10",
      icon: "text-sky-600 dark:text-sky-400",
      hover: "group-hover:border-sky-300 dark:group-hover:border-sky-700",
      gradient: "from-sky-500/5 to-transparent",
    },
    emerald: {
      bg: "bg-emerald-500/10",
      icon: "text-emerald-600 dark:text-emerald-400",
      hover: "group-hover:border-emerald-300 dark:group-hover:border-emerald-700",
      gradient: "from-emerald-500/5 to-transparent",
    },
    amber: {
      bg: "bg-amber-500/10",
      icon: "text-amber-600 dark:text-amber-400",
      hover: "group-hover:border-amber-300 dark:group-hover:border-amber-700",
      gradient: "from-amber-500/5 to-transparent",
    },
    violet: {
      bg: "bg-violet-500/10",
      icon: "text-violet-600 dark:text-violet-400",
      hover: "group-hover:border-violet-300 dark:group-hover:border-violet-700",
      gradient: "from-violet-500/5 to-transparent",
    },
    rose: {
      bg: "bg-rose-500/10",
      icon: "text-rose-600 dark:text-rose-400",
      hover: "group-hover:border-rose-300 dark:group-hover:border-rose-700",
      gradient: "from-rose-500/5 to-transparent",
    },
  };
  const t = tones[tone];
  return (
    <button
      onClick={onClick}
      className={`group relative text-left p-3 md:p-4 rounded-2xl border border-border bg-card overflow-hidden hover:shadow-elev-md transition-all active:scale-[0.97] ${t.hover}`}
    >
      {/* Decorative gradient */}
      <div className={`absolute inset-0 bg-gradient-to-br ${t.gradient} pointer-events-none opacity-60 group-hover:opacity-100 transition-opacity`} />

      <div className="relative">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${t.bg} ring-1 ring-border/40`}>
            <Ic className={`h-5 w-5 ${t.icon}`} strokeWidth={2.25} />
          </div>
          {badge && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-2xs font-black bg-destructive text-destructive-foreground">
              {badge}
            </span>
          )}
        </div>
        <div className="font-bold text-sm tracking-tight text-foreground">{label}</div>
        <div className="text-2xs md:text-xs text-muted-foreground mt-0.5 line-clamp-1">{desc}</div>
      </div>
    </button>
  );
}

export function BillingStatusBadge({ status, isOverdue }: { status: string; isOverdue: boolean }) {
  const cfg = isOverdue ? { label: "TERLAMBAT", cls: "bg-rose-100 text-rose-700 border-rose-200" } :
              status === "lunas" || status === "paid" ? { label: "LUNAS", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" } :
              status === "isolir" ? { label: "ISOLIR", cls: "bg-rose-100 text-rose-700 border-rose-200" } :
              { label: (status ?? "-").toUpperCase(), cls: "bg-sky-100 text-sky-700 border-sky-200" };
  return (
    <div className={`inline-flex items-center px-3 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider ${cfg.cls}`}>
      {cfg.label}
    </div>
  );
}

export function ReferralStat({ value, label, tone }: { value: number; label: string; tone?: "amber" | "emerald" }) {
  const cls = tone === "amber" ? "text-amber-600 dark:text-amber-400" :
              tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" :
              "text-foreground";
  return (
    <div>
      <div className={`text-2xl font-bold tabular-nums ${cls}`}>{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mt-0.5">{label}</div>
    </div>
  );
}
