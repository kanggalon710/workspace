# LP3 — Notify Action for Lead Rules — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lead rules dapat mengirim notifikasi (bell + webhook) saat cocok, menyertai create/update/reopen kartu — menutup gap "Send Notification" (#11). DRY: ekstrak `NotifyConfigFields` UI + pure serialize/hydrate helpers, dipakai bersama rule kartu.

**Architecture:** Notify disimpan di lead `triggerConfig.notify` (NotifyConfig). `runLeadNotify` di intake reuse `createNotification` + exported `postPipelineWebhook`. Pure `shared/notifyConfig.ts` (draft↔config) dipakai oleh serialisasi rule kartu DAN lead (DRY). UI `<NotifyConfigFields>` diekstrak dari RuleActionEditor + dipakai di sub-form lead.

**Tech Stack:** TS, Express 5, React 18 + shadcn/ui, `node:test` via `npx tsx --test`. Spec: `docs/superpowers/specs/2026-06-14-leads-pipeline-lp3-notify-design.md`. Sibling imports `.js`.

---

## File Structure

| File | Responsibility |
|---|---|
| `shared/notifyConfig.ts` (create) + test | Pure `NotifyDraft`, `emptyNotifyDraft`, `notifyDraftToConfig`, `notifyConfigToDraft`. |
| `shared/leadIntake.ts` (modify) + test | `LeadTriggerConfig.notify`; parse in `parseLeadTriggerConfig`. |
| `server/pipeline-automation.ts` (modify) | Export `postPipelineWebhook`. |
| `server/lead-intake.ts` (modify) | `runLeadNotify` + wire after decision. |
| `server/routes.ts` (modify) | Validate `triggerConfig.notify` in lead branch. |
| `client/components/pipelines/NotifyConfigFields.tsx` (create) | Reusable notify form fields. |
| `client/components/pipelines/RuleActionEditor.tsx` (modify) | Use `<NotifyConfigFields>`. |
| `client/components/pipelines/ruleFormState.ts` (modify) | Action notify ↔ shared helpers; lead notify draft + serialize/hydrate. |
| `client/components/pipelines/PipelineRulesDialog.tsx` (modify) | Notify section in lead sub-form. |

---

## Task 1: Pure notify draft↔config (`shared/notifyConfig.ts`)

**Files:**
- Create: `shared/notifyConfig.ts`
- Test: `shared/notifyConfig.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// shared/notifyConfig.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyNotifyDraft, notifyDraftToConfig, notifyConfigToDraft } from "./notifyConfig.js";

test("emptyNotifyDraft defaults to bell on, assignee", () => {
  const d = emptyNotifyDraft();
  assert.equal(d.notifyBell, true);
  assert.equal(d.notifyWebhook, false);
  assert.equal(d.bellTarget, "assignee");
});

test("notifyDraftToConfig: bell+webhook with fields", () => {
  const r = notifyDraftToConfig({ notifyBell: true, notifyWebhook: true, bellTarget: "user", bellUserId: "42", bellTitle: "Hi {title}", bellMessage: "msg", webhookUrl: "https://x" });
  assert.deepEqual(r, { ok: true, config: { channels: ["bell", "webhook"], bellTarget: "user", bellUserId: 42, bellTitle: "Hi {title}", bellMessage: "msg", webhookUrl: "https://x" } });
});

test("notifyDraftToConfig: errors", () => {
  assert.deepEqual(notifyDraftToConfig({ ...emptyNotifyDraft(), notifyBell: false, notifyWebhook: false }), { ok: false, error: "Pilih minimal satu channel notifikasi" });
  assert.deepEqual(notifyDraftToConfig({ ...emptyNotifyDraft(), bellTarget: "user", bellUserId: "" }), { ok: false, error: "Pilih user untuk notifikasi bell" });
  assert.deepEqual(notifyDraftToConfig({ ...emptyNotifyDraft(), notifyBell: false, notifyWebhook: true, webhookUrl: "" }), { ok: false, error: "Isi URL webhook" });
});

test("round-trip config→draft→config", () => {
  const cfg = { channels: ["bell"] as ("bell"|"webhook")[], bellTarget: "creator" as const };
  const d = notifyConfigToDraft(cfg);
  assert.equal(d.notifyBell, true);
  assert.equal(d.notifyWebhook, false);
  assert.equal(d.bellTarget, "creator");
  assert.deepEqual(notifyDraftToConfig(d), { ok: true, config: { channels: ["bell"], bellTarget: "creator" } });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npx tsx --test shared/notifyConfig.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// shared/notifyConfig.ts
/** Pure draft↔NotifyConfig transforms, shared by card-rule actions + lead rules. No I/O. */
import type { NotifyConfig } from "./schema.js";

export interface NotifyDraft {
  notifyBell: boolean;
  notifyWebhook: boolean;
  bellTarget: "assignee" | "user" | "creator";
  bellUserId: string;
  bellTitle: string;
  bellMessage: string;
  webhookUrl: string;
}

export function emptyNotifyDraft(): NotifyDraft {
  return { notifyBell: true, notifyWebhook: false, bellTarget: "assignee", bellUserId: "", bellTitle: "", bellMessage: "", webhookUrl: "" };
}

/** Hydrate a stored NotifyConfig (or null) into editable draft fields. */
export function notifyConfigToDraft(cfg: NotifyConfig | null | undefined): NotifyDraft {
  const d = emptyNotifyDraft();
  if (!cfg) return d;
  d.notifyBell = (cfg.channels ?? []).includes("bell");
  d.notifyWebhook = (cfg.channels ?? []).includes("webhook");
  d.bellTarget = cfg.bellTarget ?? "assignee";
  d.bellUserId = cfg.bellUserId != null ? String(cfg.bellUserId) : "";
  d.bellTitle = cfg.bellTitle ?? "";
  d.bellMessage = cfg.bellMessage ?? "";
  d.webhookUrl = cfg.webhookUrl ?? "";
  return d;
}

/** Serialize draft → NotifyConfig with validation. */
export function notifyDraftToConfig(d: NotifyDraft): { ok: true; config: NotifyConfig } | { ok: false; error: string } {
  const channels: ("bell" | "webhook")[] = [];
  if (d.notifyBell) channels.push("bell");
  if (d.notifyWebhook) channels.push("webhook");
  if (channels.length === 0) return { ok: false, error: "Pilih minimal satu channel notifikasi" };
  const config: NotifyConfig = { channels };
  if (d.notifyBell) {
    config.bellTarget = d.bellTarget;
    if (d.bellTarget === "user") {
      if (!d.bellUserId) return { ok: false, error: "Pilih user untuk notifikasi bell" };
      config.bellUserId = Number(d.bellUserId);
    }
    if (d.bellTitle.trim()) config.bellTitle = d.bellTitle.trim();
    if (d.bellMessage.trim()) config.bellMessage = d.bellMessage.trim();
  }
  if (d.notifyWebhook) {
    if (!d.webhookUrl.trim()) return { ok: false, error: "Isi URL webhook" };
    config.webhookUrl = d.webhookUrl.trim();
  }
  return { ok: true, config };
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npx tsx --test shared/notifyConfig.test.ts` → 4 pass. `npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add shared/notifyConfig.ts shared/notifyConfig.test.ts
git commit -m "feat(pipelines): pure notify draft<->config helpers (LP3 task 1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Lead triggerConfig.notify (shared)

**Files:**
- Modify: `shared/leadIntake.ts` (`LeadTriggerConfig` interface + `parseLeadTriggerConfig`)
- Test: `shared/leadIntake.test.ts`

- [ ] **Step 1: Extend test**

Add to `shared/leadIntake.test.ts`:
```ts
test("parseLeadTriggerConfig reads notify (LP3)", () => {
  const c = parseLeadTriggerConfig(JSON.stringify({ entryStageId: 5, notify: { channels: ["bell"], bellTarget: "creator" } }));
  assert.deepEqual(c?.notify, { channels: ["bell"], bellTarget: "creator" });
  const c2 = parseLeadTriggerConfig(JSON.stringify({ entryStageId: 5 }));
  assert.equal(c2?.notify, undefined);
});
```

- [ ] **Step 2: Implement in `shared/leadIntake.ts`**

- Add import at top: `import type { NotifyConfig } from "./schema.js";`
- Add to `LeadTriggerConfig` interface: `notify?: NotifyConfig;`
- In `parseLeadTriggerConfig`, inside the returned object, add:
```ts
      notify: (c.notify && typeof c.notify === "object" && Array.isArray(c.notify.channels)) ? c.notify as NotifyConfig : undefined,
```

- [ ] **Step 3: Run + typecheck**

Run: `npx tsx --test shared/leadIntake.test.ts` → all pass. `npx tsc --noEmit` → 0.

- [ ] **Step 4: Commit**

```bash
git add shared/leadIntake.ts shared/leadIntake.test.ts
git commit -m "feat(leads): lead triggerConfig.notify (LP3 task 2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Server — export webhook + runLeadNotify + validate

**Files:**
- Modify: `server/pipeline-automation.ts` (~line 23)
- Modify: `server/lead-intake.ts`
- Modify: `server/routes.ts` (`validateTriggerConfig` lead branch ~line 4906)

- [ ] **Step 1: Export postPipelineWebhook**

In `server/pipeline-automation.ts` change:
```ts
async function postPipelineWebhook(url: string, payload: any): Promise<boolean> {
```
to:
```ts
export async function postPipelineWebhook(url: string, payload: any): Promise<boolean> {
```

- [ ] **Step 2: Add runLeadNotify + wire it in `server/lead-intake.ts`**

Add imports at top:
```ts
import { postPipelineWebhook } from "./pipeline-automation.js";
import { buildTargetTitle } from "./pipeline-automation-helpers.js";
import type { NotifyConfig } from "../shared/schema.js";
```
Add this function (module scope, after `EVENT_TO_TRIGGER`):
```ts
/** Notify untuk rule lead (bell + webhook). Best-effort: NEVER throws. */
async function runLeadNotify(notify: NotifyConfig, lead: IntakeLead, cardId: number | null, rule: any, actorId: number): Promise<void> {
  try {
    if (notify.channels?.includes("bell")) {
      const userId = notify.bellTarget === "user" ? notify.bellUserId
        : notify.bellTarget === "creator" ? rule.createdBy
        : lead.assignedTo;
      if (userId != null) {
        await storage.createNotification({
          userId: Number(userId), type: "automation",
          title: buildTargetTitle(notify.bellTitle || "Lead: {title}", lead.name ?? `Lead #${lead.id}`),
          message: notify.bellMessage ? buildTargetTitle(notify.bellMessage, lead.name ?? "") : undefined,
          link: "/leads", entityType: "lead", entityId: lead.id, fromUserId: actorId,
        });
      }
    }
    if (notify.channels?.includes("webhook") && notify.webhookUrl) {
      await postPipelineWebhook(notify.webhookUrl, {
        event: "lead.automation", ruleId: rule.id, ruleName: rule.name ?? null,
        leadId: lead.id, leadName: lead.name ?? null, source: lead.source ?? null,
        campaign: lead.campaign ?? null, cardId, firedAt: new Date().toISOString(),
      });
    }
  } catch (e: any) {
    console.warn(`[lead-intake] notify rule ${rule?.id} (lead ${lead?.id}) failed: ${e?.message}`);
  }
}
```
In `runLeadIntake`, inside the per-rule `try` block, AFTER the create/update/reopen decision branches complete (i.e., at the end of the try, before the `} catch`), add — tracking the resulting card id:
```ts
      if (cfg.notify) {
        const notifyCardId = decision === "create" ? createdCardId : (existingCardId ?? null);
        await runLeadNotify(cfg.notify, lead, notifyCardId, rule, actorId);
      }
```
> NOTE on `createdCardId`: the create branch builds `card` — capture its id. The simplest: declare `let createdCardId: number | null = null;` near the top of the loop body, and in the create branch set `createdCardId = card.id;` right after `createCard`. Then the notify line above resolves the card id for the payload. If the implementer finds the existing branch structure already exposes the new card via a variable, reuse it; otherwise add the `createdCardId` capture.

- [ ] **Step 3: Validate notify in routes.ts lead branch**

In `validateTriggerConfig`, the lead branch (added in LP2). After the `fieldMap` validation loop and before `return null;`, add notify validation:
```ts
    if (c.notify) {
      const n = c.notify;
      const chans = Array.isArray(n.channels) ? n.channels : [];
      if (!chans.length || chans.some((x: any) => x !== "bell" && x !== "webhook")) return "notify.channels harus subset [bell, webhook] dan non-empty";
      if (chans.includes("bell")) {
        if (n.bellTarget && !["assignee", "user", "creator"].includes(n.bellTarget)) return "notify.bellTarget tidak valid";
        if (n.bellTarget === "user" && (n.bellUserId == null || Number.isNaN(Number(n.bellUserId)))) return "notify.bellUserId wajib untuk target user";
      }
      if (chans.includes("webhook") && (typeof n.webhookUrl !== "string" || !n.webhookUrl.trim())) return "notify.webhookUrl wajib untuk channel webhook";
    }
```
> `c` here is the parsed lead config from `parseLeadTriggerConfig`. Confirm the lead branch parses via `parseLeadTriggerConfig` (LP2) so `c.notify` is available; if the branch re-parses raw triggerConfig, read `.notify` off the same parsed object.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add server/pipeline-automation.ts server/lead-intake.ts server/routes.ts
git commit -m "feat(leads): runLeadNotify (bell+webhook) + validate (LP3 task 3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Extract `<NotifyConfigFields>` + refactor RuleActionEditor

**Files:**
- Create: `client/components/pipelines/NotifyConfigFields.tsx`
- Modify: `client/components/pipelines/RuleActionEditor.tsx`

- [ ] **Step 1: Create the component (lift the existing JSX verbatim)**

```tsx
// client/components/pipelines/NotifyConfigFields.tsx
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { FormField } from "@/components/ui/form-field";
import type { NotifyDraft } from "@shared/notifyConfig";

/** Reusable notify config form (bell + webhook). Operates on flat NotifyDraft fields.
 *  Used by card-rule actions (RuleActionEditor) + lead rules (PipelineRulesDialog). */
export function NotifyConfigFields({
  value, onChange, users, keyPrefix, assigneeLabel = "Assignee",
}: {
  value: NotifyDraft;
  onChange: (patch: Partial<NotifyDraft>) => void;
  users: { id: number; name?: string | null; username?: string | null }[];
  keyPrefix: string;
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
                options={users.map((u) => ({ value: String(u.id), label: u.name || u.username || String(u.id) }))}
                value={value.bellUserId}
                onChange={(v) => onChange({ bellUserId: v })}
                placeholder="Pilih user…" searchPlaceholder="Cari user…"
              />
            </FormField>
          )}
          <FormField label="Judul bell" htmlFor={`notify-title-${keyPrefix}`} hint="{title} = nama lead/judul kartu. Kosongkan untuk default.">
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
```
> Confirm import specifiers (`@/components/ui/switch`, `form-field`, etc.) against RuleActionEditor's existing imports — copy exactly.

- [ ] **Step 2: Refactor RuleActionEditor to use it**

In `client/components/pipelines/RuleActionEditor.tsx`, replace the entire `{value.actionType === "notify" && ( ... )}` block (the JSX from `<div className="space-y-2">` through its closing — currently ~lines 399-450) with:
```tsx
      {value.actionType === "notify" && (
        <NotifyConfigFields
          value={value}
          onChange={patch}
          users={staffUsers}
          keyPrefix={value._key}
          assigneeLabel="Assignee kartu"
        />
      )}
```
Add import: `import { NotifyConfigFields } from "./NotifyConfigFields";`
(`ActionDraft` already has the NotifyDraft fields as a superset, so `value` satisfies `NotifyDraft` structurally; `patch` accepts `Partial<ActionDraft>` ⊇ `Partial<NotifyDraft>`. If tsc complains about excess-property/structural mismatch, pass an explicit subset object + a wrapping onChange — but structural typing should accept it.)

- [ ] **Step 3: Build + typecheck**

Run: `npx tsc --noEmit && npm run build` → 0 errors, build success. Visually confirm RuleActionEditor notify still renders the same fields (it's the same JSX, lifted).

- [ ] **Step 4: Commit**

```bash
git add client/components/pipelines/NotifyConfigFields.tsx client/components/pipelines/RuleActionEditor.tsx
git commit -m "refactor(pipelines): extract NotifyConfigFields, reuse in RuleActionEditor (LP3 task 4)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: ruleFormState — DRY action notify + lead notify draft

**Files:**
- Modify: `client/components/pipelines/ruleFormState.ts`

- [ ] **Step 1: DRY the action notify serialize/hydrate via shared helpers**

Add import: `import { notifyConfigToDraft, notifyDraftToConfig, emptyNotifyDraft, type NotifyDraft } from "@shared/notifyConfig";`

Replace the action notify HYDRATE block (currently ~lines 106-113, the `} else if (a.actionType === "notify") { const cfg = ...; act.notifyBell = ...; ... }`) with:
```ts
  } else if (a.actionType === "notify") {
    const nd = notifyConfigToDraft(a.actionConfig as any);
    act.notifyBell = nd.notifyBell; act.notifyWebhook = nd.notifyWebhook; act.bellTarget = nd.bellTarget;
    act.bellUserId = nd.bellUserId; act.bellTitle = nd.bellTitle; act.bellMessage = nd.bellMessage; act.webhookUrl = nd.webhookUrl;
```
Replace the action notify SERIALIZE block (currently ~lines 368-388, the `} else if (a.actionType === "notify") { const channels = ...; ... actions.push({ actionType: "notify", actionConfig: cfg }); }`) with:
```ts
    } else if (a.actionType === "notify") {
      const r = notifyDraftToConfig(a);
      if (!r.ok) return { ok: false, error: r.error };
      actions.push({ actionType: "notify", actionConfig: r.config });
```
(`a` is an `ActionDraft` whose fields are a superset of `NotifyDraft`, so it satisfies `notifyDraftToConfig`'s param structurally.)

- [ ] **Step 2: Add lead notify to the draft**

In the `RuleDraft` interface, add: `leadNotify: NotifyDraft;`
In `emptyDraft()`, add: `leadNotify: emptyNotifyDraft(),`

- [ ] **Step 3: Lead branch hydrate (ruleToDraft)**

In the lead branch of `ruleToDraft` (LP1, before `return d;`), add:
```ts
    d.leadNotify = notifyConfigToDraft(c.notify ?? null);
```
(`c` = parsed triggerConfig object in that branch.)

- [ ] **Step 4: Lead branch serialize (draftToPayload)**

In the lead branch of `draftToPayload`, before building/returning the payload, serialize notify only if a channel is enabled:
```ts
    let leadNotify: any = undefined;
    if (d.leadNotify.notifyBell || d.leadNotify.notifyWebhook) {
      const r = notifyDraftToConfig(d.leadNotify);
      if (!r.ok) return { ok: false, error: r.error };
      leadNotify = r.config;
    }
```
Then include `notify: leadNotify` in the `triggerConfig` object that the lead branch builds (alongside sources/entryStageId/fieldMap/onDuplicate/dedupBy/reopenStageId). `leadNotify` is `undefined` when no channel → omitted/null in JSON.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit` → 0 errors.

- [ ] **Step 6: Commit**

```bash
git add client/components/pipelines/ruleFormState.ts
git commit -m "refactor(pipelines): DRY notify serialize + lead notify draft (LP3 task 5)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: PipelineRulesDialog — notify section in lead sub-form

**Files:**
- Modify: `client/components/pipelines/PipelineRulesDialog.tsx`

- [ ] **Step 1: State for lead notify**

The dialog holds lead sub-form state (LP1). Add a `leadNotify` state mirroring the draft field:
```ts
import { NotifyConfigFields } from "./NotifyConfigFields";
import { emptyNotifyDraft, type NotifyDraft } from "@shared/notifyConfig";
```
```ts
  const [leadNotify, setLeadNotify] = useState<NotifyDraft>(emptyNotifyDraft());
```
Wire into the dialog's `setFromDraft`/`applyDraft` (set `setLeadNotify(d.leadNotify)`) and into the `currentDraft()`/buildDraft object (`leadNotify`), exactly as LP1 did for the other lead fields.

- [ ] **Step 2: Render notify section in the lead sub-form**

Inside the `{triggerType.startsWith("lead_") && ( ... )}` block, after the ConditionsBuilder (LP2) section, add:
```tsx
        <fieldset className="border border-border/60 rounded-lg p-3 space-y-2">
          <legend className="text-xs font-semibold px-1">Notifikasi (opsional)</legend>
          <NotifyConfigFields
            value={leadNotify}
            onChange={(patch) => setLeadNotify((n) => ({ ...n, ...patch }))}
            users={staffUsers ?? []}
            keyPrefix="lead"
            assigneeLabel="Assignee lead"
          />
        </fieldset>
```
(`staffUsers` from `useAssignableUsers` is already in the dialog — confirm the variable name; LP1/RuleActionEditor use it.)

- [ ] **Step 3: Build + typecheck**

Run: `npx tsc --noEmit && npm run build` → 0 errors, build success.

- [ ] **Step 4: Commit**

```bash
git add client/components/pipelines/PipelineRulesDialog.tsx
git commit -m "feat(leads): notify section in lead rule sub-form (LP3 task 6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Final verification + memory

- [ ] **Step 1: Lead/notify tests**

Run: `npx tsx --test shared/notifyConfig.test.ts shared/leadIntake.test.ts shared/leadConditions.test.ts`
Expected: all PASS.

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit` → 0. `npm run build` → success.

- [ ] **Step 3: Full regression**

Run: `npx tsx --test shared/*.test.ts server/*.test.ts client/**/*.test.ts`
Expected: all PASS (≥ prior 373).

- [ ] **Step 4: Smoke (optional, local DB)**

Buat rule `lead_converted` (entry stage di pipeline Instalasi) + Notifikasi bell target "Pembuat rule" + webhook URL. Konversi lead → kartu Instalasi terbuat + notif bell muncul di NotificationBell + webhook ter-POST. Cek rule kartu (RuleActionEditor) notify masih berfungsi normal (refactor DRY).

- [ ] **Step 5: Update memory**

Update `memory/project-leads-pipeline-integration.md`: LP3 DONE on dev — notify (bell+webhook) untuk lead rule via triggerConfig.notify + runLeadNotify; DRY NotifyConfigFields + notifyConfig helpers (refactor RuleActionEditor). Conversion bundle (#11) kini lengkap kecuali move-existing (LP3b). Add commit range.

---

## Self-Review (penulis plan — sudah dijalankan)

**Spec coverage:** §triggerConfig.notify→T2; §runLeadNotify (bell+creator/user/assignee + webhook)→T3; §export postPipelineWebhook→T3; §validate notify→T3; §NotifyConfigFields shared + RuleActionEditor refactor→T4; §ruleFormState DRY + lead notify→T5; §lead sub-form section→T6; §pure helpers tested→T1; §best-effort/tenant→T3 (try/catch, withMitra LP1, tenant-scoped createNotification). AC1-6 covered.

**Placeholder scan:** no TBD/TODO; full code each step. "Confirm/NOTE" items are defensive checks with concrete fallback stated.

**Type consistency:** `NotifyDraft` (7 fields) T1 ↔ `ActionDraft` superset (existing) ↔ `RuleDraft.leadNotify` T5 ↔ dialog `leadNotify` state T6. `notifyDraftToConfig`/`notifyConfigToDraft` T1 used T5. `NotifyConfig` (schema) ↔ `LeadTriggerConfig.notify` T2 ↔ `runLeadNotify` param T3. `postPipelineWebhook` exported T3 used T3. `NotifyConfigFields` props T4 used T4+T6. `createdCardId` capture noted in T3.
