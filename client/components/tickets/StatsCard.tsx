import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

export function StatsCard({ label, value, icon: Icon, iconColor, bgColor, loading, active, onClick }: {
  label: string; value: number; icon: any; iconColor: string; bgColor: string; loading: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <Card
      className={cn(
        onClick ? "cursor-pointer transition hover:shadow-md hover:-translate-y-0.5" : "",
        active ? "ring-2 ring-primary border-primary" : ""
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <CardContent className="py-4 px-4 flex items-center gap-3">
        <div className={cn("p-2 rounded-lg", bgColor)}>
          <Icon className={cn("w-5 h-5", iconColor)} />
        </div>
        <div className="flex-1">
          <p className="text-xs text-gray-500 font-medium">{label}</p>
          {loading ? (
            <div className="h-7 w-10 rounded bg-gray-200 animate-pulse mt-1" />
          ) : (
            <p className="text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
          )}
        </div>
        {active && (
          <div className="text-[10px] font-bold text-primary uppercase tracking-wider">Filter ✓</div>
        )}
      </CardContent>
    </Card>
  );
}
