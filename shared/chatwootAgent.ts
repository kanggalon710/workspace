/** Pure: Chatwoot agent payload → DTO + email-based user↔agent suggestions. No I/O — testable. */

export type ChatwootAgent = { id: number; name: string; email: string | null; role: string | null; available: boolean };

export function mapAgent(raw: any): ChatwootAgent {
  return {
    id: Number(raw?.id),
    name: String(raw?.name ?? raw?.available_name ?? ""),
    email: raw?.email ?? null,
    role: raw?.role ?? null,
    available: raw?.availability_status === "online",
  };
}

export function suggestAgentMatchesByEmail(
  agents: ChatwootAgent[],
  users: { id: number; email: string | null }[],
): { userId: number; agentId: number }[] {
  const byEmail = new Map<string, number>();
  for (const a of agents) {
    const e = (a.email ?? "").trim().toLowerCase();
    if (e && !byEmail.has(e)) byEmail.set(e, a.id);
  }
  const out: { userId: number; agentId: number }[] = [];
  for (const u of users) {
    const e = (u.email ?? "").trim().toLowerCase();
    if (!e) continue;
    const agentId = byEmail.get(e);
    if (agentId != null) out.push({ userId: u.id, agentId });
  }
  return out;
}
