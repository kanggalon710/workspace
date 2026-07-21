import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { api } from "@/lib/api";
import { useChatwootAgents, useSetUserAgent, useClearUserAgent } from "@/hooks/useChatwoot";
import { AgentSelector } from "@/components/chatwoot/AgentSelector";

type StaffUser = {
  id: number;
  name: string;
  email: string | null;
  username: string;
  roleName?: string | null;
  role?: string | null;
};

export default function ChatwootAgentMapPage() {
  const { data, isLoading: agentsLoading } = useChatwootAgents();
  const { data: users, isLoading: usersLoading } = useQuery<StaffUser[]>({
    queryKey: ["/api/users"],
    queryFn: () => api.get<StaffUser[]>("/users"),
  });
  const isLoading = agentsLoading || usersLoading;
  const setAgent = useSetUserAgent();
  const clearAgent = useClearUserAgent();

  const linkByUser = useMemo(
    () => new Map((data?.links ?? []).map((l) => [l.userId, l.chatwootAgentId])),
    [data?.links]
  );
  const suggestByUser = useMemo(
    () => new Map((data?.suggestions ?? []).map((s) => [s.userId, s.agentId])),
    [data?.suggestions]
  );
  const agents = data?.agents ?? [];

  return (
    <PageContainer>
      <PageHeader
        icon={Users}
        title="Pemetaan Agent Chatwoot"
        description="Hubungkan user Workspace dengan agent Chatwoot"
        accent="info"
      />
      <Card>
        <CardContent className="p-4">
          {isLoading ? (
            <SkeletonList count={6} />
          ) : !users?.length ? (
            <EmptyState icon={Users} title="Tidak ada user" />
          ) : (
            <ul className="divide-y divide-border/50">
              {users.map((u) => (
                <li key={u.id} className="flex flex-col md:flex-row md:items-center gap-2 py-2.5">
                  <div className="md:w-56 min-w-0">
                    <p className="text-sm font-medium truncate">{u.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email || "-"}</p>
                    {(u.roleName || u.role) && <p className="text-2xs text-muted-foreground/70 truncate">{u.roleName || u.role}</p>}
                  </div>
                  <div className="flex-1">
                    <AgentSelector
                      agents={agents}
                      value={linkByUser.get(u.id) ?? null}
                      suggestedAgentId={suggestByUser.get(u.id) ?? null}
                      onChange={(agentId) => {
                        if (agentId) {
                          setAgent.mutate(
                            { userId: u.id, agentId },
                            {
                              onSuccess: () => toast.success("Agent dipetakan"),
                              onError: (e: any) => toast.error(e.message),
                            }
                          );
                        } else {
                          clearAgent.mutate(u.id, {
                            onSuccess: () => toast.success("Pemetaan dihapus"),
                            onError: (e: any) => toast.error(e.message),
                          });
                        }
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
