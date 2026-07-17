import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AddInline({
  placeholder,
  buttonLabel,
  onAdd,
}: {
  placeholder: string;
  buttonLabel: string;
  onAdd: (v: string) => Promise<void>;
}) {
  const [v, setV] = useState("");
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <Button type="button" variant="ghost" size="sm" className="justify-start" onClick={() => setOpen(true)}>
        {buttonLabel}
      </Button>
    );
  return (
    <Input
      inputSize="sm"
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      placeholder={placeholder}
      onBlur={() => {
        if (!v.trim()) setOpen(false);
      }}
      onKeyDown={async (e) => {
        if (e.key === "Enter" && v.trim()) {
          await onAdd(v.trim());
          setV("");
          setOpen(false);
        }
        if (e.key === "Escape") {
          setV("");
          setOpen(false);
        }
      }}
    />
  );
}
