import { ALL_FEATURES } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Edit3, Trash2, Power, PowerOff, Users as UsersIcon, ChevronRight, MapPin, User, Zap } from "lucide-react";
import { MiniStat, getInitials, type MitraItem } from "./shared";

export function MitraCard({ mitra, canEdit, onClick, onToggleActive, onDelete }: {
  mitra: MitraItem;
  canEdit: boolean;
  onClick: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const isActive = mitra.isActive === 1;
  const featuresEnabled = Object.values(mitra.features ?? {}).filter(Boolean).length;
  const totalFeatures = ALL_FEATURES.length;

  return (
    <Card
      role="button"
      tabIndex={0}
      className={`group cursor-pointer hover:shadow-md transition-all duration-200 ${
        !isActive ? "opacity-60" : ""
      }`}
      onClick={onClick}
      onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); onClick?.(); } }}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start gap-3">
          {/* Logo / avatar */}
          <div className="shrink-0 w-12 h-12 rounded-full overflow-hidden bg-gradient-to-br from-violet-500 to-indigo-700 flex items-center justify-center text-white font-bold text-lg shadow-sm ring-2 ring-white/10">
            {mitra.logoUrl ? (
              <img src={mitra.logoUrl} alt={mitra.name} className="w-full h-full object-cover" />
            ) : (
              getInitials(mitra.displayName || mitra.name)
            )}
          </div>
          {/* Identity */}
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm leading-tight truncate">
              {mitra.displayName || mitra.name}
            </div>
            <div className="font-mono text-[11px] text-muted-foreground mt-0.5 truncate">
              {mitra.slug ?? "-"}
            </div>
            <div className="mt-1">
              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                isActive
                  ? "bg-success/15 text-success"
                  : "bg-muted text-muted-foreground"
              }`}>
                <span className={`w-1 h-1 rounded-full ${isActive ? "bg-success" : "bg-muted-foreground"}`} />
                {isActive ? "Aktif" : "Nonaktif"}
              </span>
            </div>
          </div>
          {/* Chevron */}
          <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 group-hover:text-muted-foreground group-hover:translate-x-0.5 transition-all mt-1" />
        </div>

        {/* Mini stats */}
        <div className="grid grid-cols-3 gap-2">
          <MiniStat icon={<UsersIcon className="h-3 w-3" />} label="Pelanggan" value={mitra.customerCount} />
          <MiniStat icon={<User className="h-3 w-3" />} label="User" value={mitra.userCount} />
          <MiniStat icon={<Zap className="h-3 w-3" />} label="Fitur" value={`${featuresEnabled}/${totalFeatures}`} />
        </div>

        {/* District / location */}
        {mitra.district && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{mitra.district}</span>
          </div>
        )}

        {/* Action buttons */}
        {canEdit && (
          <div className="flex gap-1.5 pt-1" onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] flex-1" onClick={onClick}>
              <Edit3 className="h-3 w-3 mr-1" /> Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={`h-7 px-2 text-[11px] ${isActive ? "text-warning" : "text-success"}`}
              onClick={onToggleActive}
            >
              {isActive ? <PowerOff className="h-3 w-3" /> : <Power className="h-3 w-3" />}
            </Button>
            {mitra.id !== 1 && (
              <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] text-destructive hover:text-destructive" onClick={onDelete}>
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

