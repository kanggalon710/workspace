import { ALL_PERMISSIONS, ALL_PERMISSION_KEYS, type PermissionLevel } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Ban, Eye, Pencil } from "lucide-react";

export const LEVEL_CFG: Record<PermissionLevel, { label: string; color: string; bg: string; icon: any }> = {
  none:  { label: "-",    color: "text-muted-foreground",                       bg: "bg-muted/30",                                  icon: Ban },
  read:  { label: "READ", color: "text-sky-700 dark:text-sky-300",              bg: "bg-sky-100 dark:bg-sky-950/40",                icon: Eye },
  write: { label: "FULL", color: "text-emerald-700 dark:text-emerald-300",      bg: "bg-emerald-100 dark:bg-emerald-950/40",        icon: Pencil },
};

export function PermissionRow({ label, keyName, level, onChange, disabled }: { label: string; keyName: string; level: PermissionLevel; onChange: (l: PermissionLevel) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 py-2 px-3 hover:bg-muted/30 transition-colors">
      <div className="min-w-0 flex-1">
        <div className="text-sm">{label}</div>
        <div className="text-[10px] font-mono text-muted-foreground">{keyName}</div>
      </div>
      <div className="flex gap-0.5 shrink-0">
        {(["none", "read", "write"] as PermissionLevel[]).map((lvl) => {
          const cfg = LEVEL_CFG[lvl];
          const active = level === lvl;
          return (
            <button
              key={lvl}
              type="button"
              onClick={() => onChange(lvl)}
              disabled={disabled}
              className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${
                active ? `${cfg.bg} ${cfg.color}` : "text-muted-foreground hover:bg-muted"
              } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {cfg.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface Props {
  value: Record<string, PermissionLevel>;
  onChange: (next: Record<string, PermissionLevel>) => void;
  disabled?: boolean;
  showBulk?: boolean;
}

export function PermissionMatrixEditor({ value, onChange, disabled, showBulk = true }: Props) {
  const groups = Array.from(new Set(ALL_PERMISSIONS.map((p) => p.group)));
  const setLevel = (key: string, level: PermissionLevel) => onChange({ ...value, [key]: level });
  const setAllInGroup = (group: string, level: PermissionLevel) => {
    const next = { ...value };
    for (const k of ALL_PERMISSIONS.filter((p) => p.group === group).map((p) => p.key)) next[k] = level;
    onChange(next);
  };
  const setAll = (level: PermissionLevel) => {
    const next: Record<string, PermissionLevel> = {};
    for (const k of ALL_PERMISSION_KEYS) next[k] = level;
    onChange(next);
  };
  return (
    <div className="space-y-4">
      {showBulk && (
        <div className="flex items-center justify-end gap-1.5 p-2 rounded-lg bg-muted/40 border">
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAll("none")} disabled={disabled}><Ban className="h-3 w-3 mr-1" /> All None</Button>
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAll("read")} disabled={disabled}><Eye className="h-3 w-3 mr-1" /> All Read</Button>
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAll("write")} disabled={disabled}><Pencil className="h-3 w-3 mr-1" /> All Full</Button>
        </div>
      )}
      {groups.map((group) => {
        const items = ALL_PERMISSIONS.filter((p) => p.group === group);
        return (
          <fieldset key={group} className="border-0 p-0 m-0">
            <div className="flex items-center justify-between mb-2 px-1">
              <legend className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{group}</legend>
              <div className="flex gap-1">
                <button type="button" onClick={() => setAllInGroup(group, "none")} className="text-[10px] px-2 py-0.5 rounded hover:bg-muted text-muted-foreground" disabled={disabled}>None</button>
                <button type="button" onClick={() => setAllInGroup(group, "read")} className="text-[10px] px-2 py-0.5 rounded hover:bg-sky-100 dark:hover:bg-sky-950/40 text-sky-600" disabled={disabled}>Read</button>
                <button type="button" onClick={() => setAllInGroup(group, "write")} className="text-[10px] px-2 py-0.5 rounded hover:bg-emerald-100 dark:hover:bg-emerald-950/40 text-emerald-600" disabled={disabled}>Full</button>
              </div>
            </div>
            <div className="space-y-1 rounded-lg border overflow-hidden">
              {items.map((p) => (
                <PermissionRow key={p.key} label={p.label} keyName={p.key}
                  level={(value[p.key] ?? "none") as PermissionLevel}
                  onChange={(lvl) => setLevel(p.key, lvl)} disabled={disabled} />
              ))}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
