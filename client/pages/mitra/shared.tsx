import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import * as SwitchPrimitive from "@radix-ui/react-switch";

export interface MitraItem {
  id: number;
  slug: string | null;
  displayName: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  district: string | null;
  primaryContactName: string | null;
  primaryContactPhone: string | null;
  logoUrl: string | null;
  features: Record<string, boolean>;
  isActive: number | null;
  customerCount: number;
  userCount: number;
  notes?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface SafeUser {
  id: number; username: string; name: string;
  role: string | null; roleId: number | null;
  isActive: number | null;
}

// --- Helpers ---
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function slugify(val: string): string {
  return val.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
}

export function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

// =======================================================================
// SWITCH COMPONENT (inline - no separate file needed)
// =======================================================================

export function Switch({ checked, onCheckedChange, disabled }: { checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-sky-600" : "bg-slate-200 dark:bg-slate-700"
      }`}
    >
      <SwitchPrimitive.Thumb
        className={`pointer-events-none block h-3.5 w-3.5 rounded-full bg-white shadow-md ring-0 transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </SwitchPrimitive.Root>
  );
}

// =======================================================================
// MAIN PAGE
// =======================================================================

export function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="flex flex-col items-center p-2 rounded-lg bg-muted/40 border gap-0.5">
      <div className="flex items-center gap-1 text-muted-foreground">{icon}</div>
      <div className="text-sm font-bold tabular-nums">{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
    </div>
  );
}

// =======================================================================
// DETAIL DRAWER
// =======================================================================
export type DetailTab = "overview" | "features" | "members";

export const EMPTY_MITRA_FORM = { name: "", slug: "", displayName: "", phone: "", primaryContactName: "", primaryContactPhone: "", district: "", address: "", email: "", notes: "" };
export const EMPTY_ADMIN_FORM = { username: "", name: "", email: "", phone: "", password: "", passwordConfirm: "" };

export function KpiTile({ icon, label, value, iconBg }: { icon: React.ReactNode; label: string; value: number; iconBg: string }) {
  return (
    <Card>
      <CardContent className="p-3 md:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
            <div className="text-2xl md:text-3xl font-bold tabular-nums mt-1">{value.toLocaleString("id-ID")}</div>
          </div>
          <div className={`w-8 h-8 md:w-9 md:h-9 rounded-lg flex items-center justify-center text-white shadow-sm shrink-0 ${iconBg}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function InfoRow({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <div className="text-muted-foreground mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0 grid grid-cols-3 gap-2">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className={`col-span-2 text-sm break-words ${mono ? "font-mono" : ""} ${value ? "" : "text-muted-foreground italic"}`}>
          {value || "-"}
        </div>
      </div>
    </div>
  );
}

export function FF({ label, value, onChange, placeholder, type = "text", mono }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; mono?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`mt-1 ${mono ? "font-mono" : ""}`}
      />
    </div>
  );
}
