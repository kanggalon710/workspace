import {
  Layers, Users, Target, Megaphone, Wrench, Ticket, Headphones, ClipboardList,
  TrendingUp, DollarSign, Phone, MapPin, Briefcase, Rocket, Flag, Inbox,
  Package, Bell, Calendar, Star, Zap, Building2, ShoppingCart, FileText,
  CheckCircle, AlertCircle, Folder, Handshake, type LucideIcon,
} from "lucide-react";

/** Default pipeline accent color. */
export const PIPELINE_DEFAULT_COLOR = "#0EA5E9";
/** Curated color swatches for pipeline pickers. */
export const PIPELINE_COLOR_SWATCHES = ["#0EA5E9","#6B7280","#3B82F6","#8B5CF6","#F59E0B","#22C55E","#EF4444"];
/** Safe 10% background tint from a stored color; "transparent" if not a 6-digit hex. */
export function pipelineTint(color: string | null | undefined): string {
  const c = color ?? PIPELINE_DEFAULT_COLOR;
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c + "1A" : "transparent";
}

export const PIPELINE_ICON_MAP: Record<string, LucideIcon> = {
  layers: Layers, users: Users, target: Target, megaphone: Megaphone, wrench: Wrench,
  ticket: Ticket, headphones: Headphones, "clipboard-list": ClipboardList, "trending-up": TrendingUp,
  "dollar-sign": DollarSign, phone: Phone, "map-pin": MapPin, briefcase: Briefcase, rocket: Rocket,
  flag: Flag, inbox: Inbox, package: Package, bell: Bell, calendar: Calendar, star: Star,
  zap: Zap, "building-2": Building2, "shopping-cart": ShoppingCart, "file-text": FileText,
  "check-circle": CheckCircle, "alert-circle": AlertCircle, folder: Folder, handshake: Handshake,
};
export const PIPELINE_ICON_NAMES = Object.keys(PIPELINE_ICON_MAP);
export const DEFAULT_PIPELINE_ICON: LucideIcon = Layers;

/** Resolve a stored icon name to a Lucide component; falls back to Layers. */
export function resolvePipelineIcon(name: string | null | undefined): LucideIcon {
  if (!name) return DEFAULT_PIPELINE_ICON;
  return PIPELINE_ICON_MAP[name] ?? DEFAULT_PIPELINE_ICON;
}

/** Grid picker of the curated icons. Stores/returns the icon NAME string. */
export function IconPicker({ value, onChange, color }: { value: string; onChange: (name: string) => void; color?: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PIPELINE_ICON_NAMES.map((name) => {
        const Icon = PIPELINE_ICON_MAP[name];
        const active = value === name;
        return (
          <button key={name} type="button" aria-label={`Icon ${name}`} onClick={() => onChange(name)}
            className={`flex items-center justify-center size-8 rounded-md border ${active ? "ring-2 ring-primary border-primary" : "border-border/60 hover:bg-accent"}`}>
            <Icon className="size-4" style={active && color ? { color } : undefined} />
          </button>
        );
      })}
    </div>
  );
}
