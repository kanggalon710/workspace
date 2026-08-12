import { Card, CardContent } from "@/components/ui/card";

export function KpiCard({
  icon, iconBg, label, value, trend, alert,
}: { icon: React.ReactNode; iconBg: string; label: string; value: number; trend?: string; alert?: boolean }) {
  return (
    <Card className={`relative overflow-hidden ${alert ? "ring-1 ring-emerald-500/30" : ""}`} title={trend}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">{label}</div>
            <div className="text-2xl font-bold tabular-nums mt-0.5 tracking-tight leading-none">{Number(value ?? 0).toLocaleString("id-ID")}</div>
          </div>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white shadow-sm ${iconBg}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


export function TierCard({ num, name, count, desc, tone, badge }: {
  num: number; name: string; count: number; desc: string; tone: "slate" | "indigo" | "emerald"; badge?: string;
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800",
    indigo: "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-900",
    emerald: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900",
  };
  const dotTones: Record<string, string> = {
    slate: "bg-slate-500", indigo: "bg-indigo-500", emerald: "bg-emerald-500",
  };
  return (
    <div className={`p-4 rounded-xl border ${tones[tone]}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-6 h-6 rounded-md flex items-center justify-center text-white text-[11px] font-bold ${dotTones[tone]}`}>
          T{num}
        </div>
        <div className="font-semibold text-sm">{name}</div>
      </div>
      <div className="text-3xl font-bold tabular-nums">{count}</div>
      <div className="text-[10px] text-muted-foreground mt-1 leading-snug">{desc}</div>
      {badge && (
        <div className="mt-2 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground border-t pt-2">
          {badge}
        </div>
      )}
    </div>
  );
}


export function StatTile({
  label, value, sublabel, dot, active, onClick,
}: {
  label: string;
  value: number;
  sublabel?: string;
  dot?: "amber" | "emerald" | "rose" | null;
  active?: boolean;
  onClick?: () => void;
}) {
  const dotColor = dot === "amber" ? "bg-amber-500"
    : dot === "emerald" ? "bg-emerald-500"
    : dot === "rose" ? "bg-rose-500"
    : "";
  const interactive = !!onClick;
  const cls = `relative px-4 py-3 text-left transition-colors ${
    interactive ? "cursor-pointer hover:bg-muted/40" : ""
  } ${active ? "bg-muted/60" : ""}`;
  const Inner = (
    <>
      {active && <div className="absolute left-0 top-3 bottom-3 w-0.5 bg-primary rounded-r" />}
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />}
        <span>{label}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tabular-nums tracking-tight leading-none text-foreground">
          {Number(value).toLocaleString("id-ID")}
        </span>
        {sublabel && <span className="text-[10px] text-muted-foreground">{sublabel}</span>}
      </div>
    </>
  );
  if (interactive) {
    return <button onClick={onClick} type="button" className={cls}>{Inner}</button>;
  }
  return <div className={cls}>{Inner}</div>;
}

// ===============================================================
// POINT CONFIG DIALOG - admin customize earn rules + catalog
// ===============================================================
