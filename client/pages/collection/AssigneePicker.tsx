import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, CheckCircle2, Edit, Users as UsersIcon } from "lucide-react";
import { type Assignee } from "./shared";

export function AssigneePicker({
  assignees, users, onChange,
}: {
  assignees: Assignee[];
  users: any[];
  onChange: (userIds: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedIds = useMemo(() => new Set(assignees.map((a) => a.userId)), [assignees]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return (users ?? []).filter((u) => {
      if (u.isActive === 0) return false;
      if (!q) return true;
      return (u.name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q) || u.role?.toLowerCase().includes(q));
    });
  }, [users, query]);

  const toggle = (userId: number) => {
    const next = new Set(selectedIds);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    onChange(Array.from(next));
  };
  return _AssigneePickerBody({ assignees, query, setQuery, open, setOpen, filtered, selectedIds, toggle });
}

// --- PIPELINE MANAGER (CRUD stage per-mitra) ---------------------------------


export function _AssigneePickerBody({ assignees, query, setQuery, open, setOpen, filtered, selectedIds, toggle }: {
  assignees: Assignee[];
  query: string; setQuery: (v: string) => void;
  open: boolean; setOpen: (fn: (v: boolean) => boolean) => void;
  filtered: any[];
  selectedIds: Set<number>;
  toggle: (userId: number) => void;
}) {

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <Label className="text-xs flex items-center gap-1.5">
          <UsersIcon className="h-3.5 w-3.5" /> Ditugaskan Ke <span className="text-muted-foreground">({assignees.length})</span>
        </Label>
        <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)} className="h-7 text-xs">
          {open ? "Tutup" : "Tambah/Edit"}
        </Button>
      </div>

      {/* Selected assignees chips */}
      {assignees.length === 0 ? (
        <div className="text-xs text-muted-foreground italic px-1">- Belum ada yang ditugaskan -</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {assignees.map((a) => (
            <div key={a.userId}
                 className="inline-flex items-center gap-1.5 bg-primary/10 text-primary rounded-full pl-1 pr-2 py-0.5 text-xs">
              <div className="h-5 w-5 rounded-full bg-gradient-to-br from-sky-500 to-blue-700 text-white flex items-center justify-center text-[9px] font-bold">
                {(a.userName || a.username || "?").charAt(0).toUpperCase()}
              </div>
              <span className="font-medium">{a.userName}</span>
              <button
                onClick={() => toggle(a.userId)}
                className="text-primary/60 hover:text-destructive ml-0.5"
                aria-label={`Hapus ${a.userName}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Picker dropdown */}
      {open && (
        <div className="mt-2 border rounded-md p-2 bg-card max-h-64 overflow-y-auto space-y-1">
          <Input
            placeholder="Cari nama, username, atau role..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 text-xs"
          />
          {filtered.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-3">Tidak ada user</div>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((u) => {
                const selected = selectedIds.has(u.id);
                return (
                  <button
                    key={u.id}
                    onClick={() => toggle(u.id)}
                    className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors ${selected ? "bg-primary/10" : ""}`}
                  >
                    <div className={`h-4 w-4 rounded border-2 flex items-center justify-center transition-colors ${selected ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                      {selected && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{u.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">@{u.username} • {u.role}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
