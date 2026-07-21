import { useId, useSyncExternalStore } from "react";
import { Combobox } from "@/components/ui/combobox";
import { useAuth } from "@/context/AuthContext";
import { useAssignableUsers, type AssignableUser } from "@/hooks/usePipelines";

const JABNET_MITRA_ID = 1;
const LS_KEY = "pipeline_assignee_cross_tenant";

// -- Shared cross-tenant source toggle (module-level so every picker on screen stays in sync) --
let crossSource = (() => { try { return localStorage.getItem(LS_KEY) === "1"; } catch { return false; } })();
const listeners = new Set<() => void>();
function setCrossSource(v: boolean) {
  crossSource = v;
  try { localStorage.setItem(LS_KEY, v ? "1" : "0"); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
function useCrossSource() { return useSyncExternalStore(subscribe, () => crossSource, () => crossSource); }

function labelFor(u: AssignableUser, cross: boolean): string {
  const base = u.name || u.username || `#${u.id}`;
  return cross && u.mitraName ? `${base} (${u.mitraName})` : base;
}

interface BaseProps {
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  placeholder?: string;
  excludeIds?: number[];
  /** Render the JABNET-only/cross-tenant toggle (only ever shows for a JABNET sysadmin). Default true. */
  showSourceToggle?: boolean;
}
type SingleProps = BaseProps & { mode: "single"; value: string; onChange: (v: string) => void; includeUnassign?: boolean };
type MultiProps = BaseProps & { mode: "multi"; value: string[]; onChange: (next: string[]) => void };

export function AssigneePicker(props: SingleProps | MultiProps) {
  const { user } = useAuth();
  const canToggle = !!user?.isSystemAdmin && user?.activeMitraId === JABNET_MITRA_ID;
  const cross = useCrossSource();
  const radioName = useId();
  const effectiveCross = canToggle && cross;
  const { data: users } = useAssignableUsers(effectiveCross);
  const list = users ?? [];
  const showToggle = (props.showSourceToggle ?? true) && canToggle;

  const toggle = showToggle ? (
    <fieldset className="flex items-center gap-3 text-[10px] text-muted-foreground border-0 p-0 m-0">
      <legend className="sr-only">Sumber user</legend>
      <label className="inline-flex items-center gap-1 cursor-pointer">
        <input type="radio" name={radioName} checked={!cross} onChange={() => setCrossSource(false)} /> JABNET
      </label>
      <label className="inline-flex items-center gap-1 cursor-pointer">
        <input type="radio" name={radioName} checked={cross} onChange={() => setCrossSource(true)} /> Lintas mitra
      </label>
    </fieldset>
  ) : null;

  if (props.mode === "single") {
    const excl = new Set(props.excludeIds ?? []);
    const options = [
      ...(props.includeUnassign ? [{ value: "__unassign__", label: "- Kosongkan (unassign) -" }] : []),
      ...list.filter((u) => !excl.has(u.id)).map((u) => ({ value: String(u.id), label: labelFor(u, effectiveCross), description: u.role || undefined })),
    ];
    return (
      <div className="space-y-1.5">
        {toggle}
        <Combobox
          size={props.size ?? "md"}
          options={options}
          value={props.value}
          onChange={(v) => props.onChange(v)}
          placeholder={props.placeholder ?? "Pilih user…"}
          searchPlaceholder="Cari user…"
          disabled={props.disabled}
        />
      </div>
    );
  }

  const selected = props.value;
  const excl = new Set(props.excludeIds ?? []);
  const nameOf = (id: string) => { const u = list.find((x) => String(x.id) === id); return u ? labelFor(u, effectiveCross) : `#${id}`; };
  const addOptions = list
    .filter((u) => !selected.includes(String(u.id)) && !excl.has(u.id))
    .map((u) => ({ value: String(u.id), label: labelFor(u, effectiveCross) }));

  return (
    <div className="space-y-1.5">
      {toggle}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((id) => {
            const n = nameOf(id);
            return (
              <span key={id} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
                {n}
                {!props.disabled && (
                  <button type="button" aria-label={`Hapus ${n}`} onClick={() => props.onChange(selected.filter((s) => s !== id))} className="hover:text-destructive">×</button>
                )}
              </span>
            );
          })}
        </div>
      )}
      {!props.disabled && (
        <Combobox
          size={props.size ?? "md"}
          options={addOptions}
          value=""
          onChange={(v) => { if (v && !selected.includes(v)) props.onChange([...selected, v]); }}
          placeholder={props.placeholder ?? "Tambah user…"}
          searchPlaceholder="Cari user…"
        />
      )}
    </div>
  );
}
