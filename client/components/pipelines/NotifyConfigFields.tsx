// SoC: reusable notify config form (bell + webhook) operating on flat NotifyDraft fields.
// Used by card-rule actions (RuleActionEditor) + lead rules (PipelineRulesDialog).
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { FormField } from "@/components/ui/form-field";
import type { NotifyDraft } from "@shared/notifyConfig";

export function NotifyConfigFields({
  value,
  onChange,
  users,
  keyPrefix,
  assigneeLabel = "Assignee",
}: {
  value: NotifyDraft;
  onChange: (patch: Partial<NotifyDraft>) => void;
  users: { id: number; name?: string | null; username?: string | null }[];
  keyPrefix: string | number;
  assigneeLabel?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 rounded-lg bg-muted/30 border border-border/40 px-4 py-2">
        <Switch checked={value.notifyBell} onCheckedChange={(c) => onChange({ notifyBell: c })} />
        <span className="text-sm">Bell internal</span>
        <Switch checked={value.notifyWebhook} onCheckedChange={(c) => onChange({ notifyWebhook: c })} />
        <span className="text-sm">Webhook</span>
      </div>
      {value.notifyBell && (
        <>
          <FormField label="Target bell" htmlFor={`notify-target-${keyPrefix}`}>
            <Combobox
              options={[
                { value: "assignee", label: assigneeLabel },
                { value: "user", label: "User tertentu" },
                { value: "creator", label: "Pembuat rule" },
              ]}
              value={value.bellTarget}
              onChange={(v) => onChange({ bellTarget: (v || "assignee") as NotifyDraft["bellTarget"] })}
              clearable={false}
            />
          </FormField>
          {value.bellTarget === "user" && (
            <FormField label="User" htmlFor={`notify-user-${keyPrefix}`}>
              <Combobox
                options={users.map((u) => ({
                  value: String(u.id),
                  label: (u.name as string | undefined) || (u.username as string | undefined) || String(u.id),
                }))}
                value={value.bellUserId}
                onChange={(v) => onChange({ bellUserId: v })}
                placeholder="Pilih user…"
                searchPlaceholder="Cari user…"
              />
            </FormField>
          )}
          <FormField label="Judul bell" htmlFor={`notify-title-${keyPrefix}`} hint="{title} = nama lead / judul kartu. Kosongkan untuk default.">
            <Input value={value.bellTitle} onChange={(e) => onChange({ bellTitle: e.target.value })} placeholder="Otomasi: {title}" />
          </FormField>
          <FormField label="Pesan bell (opsional)" htmlFor={`notify-msg-${keyPrefix}`}>
            <Input value={value.bellMessage} onChange={(e) => onChange({ bellMessage: e.target.value })} placeholder="Pesan…" />
          </FormField>
        </>
      )}
      {value.notifyWebhook && (
        <FormField label="URL Webhook" htmlFor={`notify-url-${keyPrefix}`} hint="POST JSON ke URL ini (mis. webhook n8n).">
          <Input type="url" value={value.webhookUrl} onChange={(e) => onChange({ webhookUrl: e.target.value })} placeholder="https://…" />
        </FormField>
      )}
    </div>
  );
}
