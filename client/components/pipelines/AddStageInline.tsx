import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** "+ Stage" affordance that expands to a label + optional description form. */
export function AddStageInline({
  onAdd,
}: {
  onAdd: (label: string, description: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setLabel("");
    setDescription("");
    setOpen(false);
  };

  const submit = async () => {
    if (!label.trim()) return;
    setSaving(true);
    try {
      await onAdd(label.trim(), description.trim());
      reset();
    } finally {
      setSaving(false);
    }
  };

  if (!open)
    return (
      <Button type="button" variant="ghost" size="sm" className="justify-start" onClick={() => setOpen(true)}>
        + Stage
      </Button>
    );

  return (
    <div className="rounded-lg bg-card border border-border/40 p-2 space-y-2">
      <Input
        inputSize="sm"
        autoFocus
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Nama stage"
        aria-label="Nama stage"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") reset();
        }}
      />
      <Textarea
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Deskripsi (opsional)"
        aria-label="Deskripsi stage"
        className="text-sm"
      />
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={submit} loading={saving} disabled={!label.trim()}>
          Tambah
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={reset}>
          Batal
        </Button>
      </div>
    </div>
  );
}
