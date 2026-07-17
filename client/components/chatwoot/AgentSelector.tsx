import { Combobox } from "@/components/ui/combobox";
import type { ChatwootAgent } from "@/lib/chatwoot";

export function AgentSelector({ agents, value, onChange, suggestedAgentId }: {
  agents: ChatwootAgent[];
  value: string | null;
  onChange: (agentId: string | null) => void;
  suggestedAgentId?: number | null;
}) {
  const options = agents.map((a) => ({
    value: String(a.id),
    label: a.name + (suggestedAgentId === a.id ? " · cocok via email" : ""),
    description: a.email ?? undefined,
  }));
  return (
    <Combobox
      options={options}
      value={value ?? undefined}
      onChange={(v) => onChange(v || null)}
      placeholder="Pilih agent Chatwoot…"
      searchPlaceholder="Cari agent…"
      size="sm"
    />
  );
}
