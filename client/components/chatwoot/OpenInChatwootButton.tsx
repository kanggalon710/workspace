import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatwootStatus } from "@/hooks/useChatwoot";
import { chatwootAccountUrl, chatwootContactsUrl } from "@shared/chatwootLinks";

/** Opens the active mitra's Chatwoot account in a new tab.
 *  Self-hides unless Chatwoot is enabled + configured (and the user has `chatwoot` read,
 *  which is enforced server-side on /status - a 403 leaves data undefined → hidden). */
export function OpenInChatwootButton({ target = "dashboard", size = "sm" }: {
  target?: "dashboard" | "contacts";
  size?: "xs" | "sm" | "default";
}) {
  const { data } = useChatwootStatus();
  if (!data?.enabled || !data.configured) return null;
  const url = target === "contacts"
    ? chatwootContactsUrl(data.baseUrl, data.accountId)
    : chatwootAccountUrl(data.baseUrl, data.accountId);
  if (!url) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size={size as "xs" | "sm" | "default"}
      onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
    >
      <MessageSquare className="size-3.5 mr-1.5" aria-hidden="true" /> Buka di Chatwoot
    </Button>
  );
}
