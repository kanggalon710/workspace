import { Card, CardContent } from "@/components/ui/card";
import { OpenInChatwootButton } from "./OpenInChatwootButton";

export function ChatwootContactCard({ contactName, lastActivityAt }: {
  contactName: string | null;
  lastActivityAt?: string | null;
}) {
  return (
    <Card variant="flat">
      <CardContent className="p-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{contactName || "Kontak Chatwoot"}</p>
          {lastActivityAt && (
            <p className="text-[10px] text-muted-foreground">
              Interaksi terakhir: {new Date(lastActivityAt).toLocaleString("id-ID")}
            </p>
          )}
        </div>
        <OpenInChatwootButton target="contacts" size="xs" />
      </CardContent>
    </Card>
  );
}
