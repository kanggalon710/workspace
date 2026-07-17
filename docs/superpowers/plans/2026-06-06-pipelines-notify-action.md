# Pipelines Notify Action (P4b-2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `notify` action type (in-app bell + outbound webhook) to the multi-action automation framework.

**Architecture:** `notify` is a new `actionType` whose JSON `action_config` (`NotifyConfig`) picks channels (bell/webhook). The engine's `applyAction` gains the `rule` (for the "creator" bell target + webhook `ruleName`) and a `notify` branch that calls `storage.createNotification` and/or a best-effort `postPipelineWebhook`. No DB migration (`action_type varchar(16)` fits "notify"; `action_config` is opaque JSON).

**Tech Stack:** Node/Express + Drizzle MySQL + tsx; React 18 + TS + Vite; tests via `node:test` (`npx tsx --test`).

**Base branch:** `feat/pipelines-notify-action` (off `dev`). Spec: `docs/superpowers/specs/2026-06-06-pipelines-notify-action-design.md`.

**Canonical shapes (keep identical across tasks):**
- `NotifyConfig` (shared): `{ channels: ("bell"|"webhook")[]; bellTarget?: "assignee"|"user"|"creator"; bellUserId?: number; bellTitle?: string; bellMessage?: string; webhookUrl?: string }`.
- `ActionDraft` notify fields (client): `notifyBell: boolean; notifyWebhook: boolean; bellTarget: "assignee"|"user"|"creator"; bellUserId: string; bellTitle: string; bellMessage: string; webhookUrl: string`.

**Verification (whole-repo):** `npm run typecheck` (0) · `npx tsx --test server/pipeline-automation-helpers.test.ts` (all pass) · `npm run build`.

---

### Task 1: Schema type + pure helpers (parse + shape) + tests (TDD)

**Files:** `shared/schema.ts`, `server/pipeline-automation-helpers.ts`, `server/pipeline-automation-helpers.test.ts`

- [ ] **Step 1: Schema — actionType union + NotifyConfig**

In `shared/schema.ts`, change `export type PipelineRuleActionType = "create_card" | "set_field" | "move_stage" | "assign";` to include `"notify"`:
```ts
export type PipelineRuleActionType = "create_card" | "set_field" | "move_stage" | "assign" | "notify";
export type NotifyConfig = {
  channels: ("bell" | "webhook")[];
  bellTarget?: "assignee" | "user" | "creator";
  bellUserId?: number;
  bellTitle?: string;
  bellMessage?: string;
  webhookUrl?: string;
};
```

- [ ] **Step 2: Write failing tests**

In `server/pipeline-automation-helpers.test.ts`, ensure `parseActionConfig` and `shapeRuleActions` are imported (they already are). Append:
```ts
test("parseActionConfig notify: valid bell+webhook / bell-user / malformed", () => {
  assert.deepEqual(parseActionConfig("notify", JSON.stringify({ channels: ["bell", "webhook"], bellTarget: "assignee", webhookUrl: "https://n8n/x" })),
    { channels: ["bell", "webhook"], bellTarget: "assignee", webhookUrl: "https://n8n/x" });
  assert.deepEqual(parseActionConfig("notify", JSON.stringify({ channels: ["bell"], bellTarget: "user", bellUserId: 7, bellTitle: "Hi {title}" })),
    { channels: ["bell"], bellTarget: "user", bellUserId: 7, bellTitle: "Hi {title}" });
  assert.equal(parseActionConfig("notify", JSON.stringify({ channels: [] })), null);                 // no channel
  assert.equal(parseActionConfig("notify", JSON.stringify({ channels: ["bell"], bellTarget: "bad" })), null); // bad target
  assert.equal(parseActionConfig("notify", JSON.stringify({ channels: ["bell"], bellTarget: "user" })), null); // user target, no id
  assert.equal(parseActionConfig("notify", JSON.stringify({ channels: ["webhook"] })), null);          // webhook, no url
  assert.equal(parseActionConfig("notify", "{bad"), null);
});

test("shapeRuleActions notify: label from channels + target", () => {
  const empty = new Map();
  const out = shapeRuleActions(
    [{ id: 1, position: 0, actionType: "notify", actionConfig: JSON.stringify({ channels: ["bell", "webhook"], bellTarget: "creator", webhookUrl: "https://n8n/x" }), targetPipelineId: null, targetStageId: null, titleTemplate: null, copyAssignee: 0 }] as any,
    { fields: empty, stages: empty, users: empty, pipes: empty, tgtStages: empty, tgtFields: empty, mapsByAction: new Map() },
  );
  assert.equal(out[0].notifyLabel, "bell→creator, webhook");
  assert.equal(out[0].fieldMaps.length, 0);
});
```

- [ ] **Step 3: Run tests, verify FAIL**

Run: `npx tsx --test server/pipeline-automation-helpers.test.ts`
Expected: FAIL — `parseActionConfig` returns null for "notify"; `notifyLabel` undefined.

- [ ] **Step 4: Implement — `parseActionConfig` notify case**

In `server/pipeline-automation-helpers.ts`, extend `parseActionConfig`'s return type to include `NotifyConfig` and add the notify branch before the final `return null;`. Import `NotifyConfig` in the type import. The function signature becomes:
```ts
export function parseActionConfig(
  type: string,
  raw: string | null,
): { fieldId: number; value: string } | { stageId: number } | { assigneeId: number | null } | NotifyConfig | null {
```
Add before `return null;`:
```ts
  if (type === "notify") {
    const channels = Array.isArray(obj.channels) ? obj.channels.filter((c: any) => c === "bell" || c === "webhook") : [];
    if (channels.length === 0) return null;
    const out: NotifyConfig = { channels };
    if (channels.includes("bell")) {
      if (!["assignee", "user", "creator"].includes(obj.bellTarget)) return null;
      out.bellTarget = obj.bellTarget;
      if (obj.bellTarget === "user") {
        if (typeof obj.bellUserId !== "number") return null;
        out.bellUserId = obj.bellUserId;
      }
      if (typeof obj.bellTitle === "string") out.bellTitle = obj.bellTitle;
      if (typeof obj.bellMessage === "string") out.bellMessage = obj.bellMessage;
    }
    if (channels.includes("webhook")) {
      if (typeof obj.webhookUrl !== "string" || !obj.webhookUrl) return null;
      out.webhookUrl = obj.webhookUrl;
    }
    return out;
  }
```
(Import: change the existing `import type { PipelineRule, RuleCondition } from "../shared/schema.js";` — or wherever types are imported — to also bring in `NotifyConfig`.)

- [ ] **Step 5: Implement — `shapeRuleActions` notify case**

In `shapeRuleActions`, add a branch (alongside set_field/move_stage/assign/create_card) — read the existing branches to match the `base` object pattern:
```ts
    } else if (a.actionType === "notify") {
      const cfg = parseActionConfig("notify", a.actionConfig) as import("../shared/schema.js").NotifyConfig | null;
      if (cfg) {
        base.actionConfig = cfg;
        const parts: string[] = [];
        if (cfg.channels.includes("bell")) parts.push(`bell→${cfg.bellTarget ?? "?"}`);
        if (cfg.channels.includes("webhook")) parts.push("webhook");
        base.notifyLabel = parts.join(", ");
      }
    }
```
(Ensure the `if (a.actionType !== "create_card") base.fieldMaps = [];` line at the end still gives notify `fieldMaps: []`.)

- [ ] **Step 6: Run tests, verify PASS + typecheck**

Run: `npx tsx --test server/pipeline-automation-helpers.test.ts` → all pass (prior + 2 new).
Run: `npm run typecheck` → 0 (server-side; client residuals may appear later, not from this task).

- [ ] **Step 7: Commit**

```bash
git add shared/schema.ts server/pipeline-automation-helpers.ts server/pipeline-automation-helpers.test.ts
git commit -m "feat(pipelines): notify action — NotifyConfig type + parseActionConfig/shapeRuleActions notify (P4b-2)"
```

---

### Task 2: Engine — applyAction +rule + notify branch + webhook

**Files:** `server/pipeline-automation.ts`

- [ ] **Step 1: Thread `rule` into `applyAction`**

Change the signature `export async function applyAction(action: PipelineRuleAction, card: PipelineCard, actorId: number)` → `export async function applyAction(action: PipelineRuleAction, rule: PipelineRule, card: PipelineCard, actorId: number)`. In `applyRuleActions`, change the call `if (await applyAction(action, card, actorId)) acted = true;` → `if (await applyAction(action, rule, card, actorId)) acted = true;`. (`rule` is already the loop's parameter.) The existing create_card/set_field/move_stage/assign branches don't use `rule` — leave them.

- [ ] **Step 2: Add the webhook helper + payload builder**

Add near the top of the module (after imports). Import `NotifyConfig` from the schema in the existing `import type { ... } from "../shared/schema.js";` line:
```ts
function buildWebhookPayload(rule: PipelineRule, card: PipelineCard, values: Record<number, string>, firedAt: string) {
  return {
    event: "pipeline.automation",
    ruleId: rule.id, ruleName: rule.name ?? null,
    card: { id: card.id, title: card.title, pipelineId: card.pipelineId, stageId: card.stageId, assigneeId: card.assigneeId ?? null },
    values, firedAt,
  };
}

/** Best-effort outbound webhook POST. ~5s timeout. Never throws. Returns true on any HTTP response. */
async function postPipelineWebhook(url: string, payload: any): Promise<boolean> {
  let u: URL;
  try { u = new URL(url); } catch { console.warn(`[automation] webhook: invalid URL ${url}`); return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") { console.warn(`[automation] webhook: non-http(s) URL ${url}`); return false; }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: ctrl.signal });
    return true;
  } catch (e: any) {
    console.warn(`[automation] webhook POST ${url} failed: ${e?.message}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 3: Add the `notify` branch in `applyAction`**

Inside `applyAction`, before the final `return false;`, add (`buildTargetTitle` is already imported from the helpers; add `NotifyConfig` import if needed for the cast):
```ts
  if (action.actionType === "notify") {
    const cfg = parseActionConfig("notify", action.actionConfig) as NotifyConfig | null;
    if (!cfg) { console.warn(`[automation] notify action ${action.id}: config invalid — skipped`); return false; }
    let acted = false;
    if (cfg.channels.includes("bell")) {
      const userId = cfg.bellTarget === "user" ? cfg.bellUserId
        : cfg.bellTarget === "creator" ? rule.createdBy
        : card.assigneeId;
      if (userId != null) {
        await storage.createNotification({
          userId, type: "automation",
          title: buildTargetTitle(cfg.bellTitle || "Otomasi: {title}", card.title),
          message: cfg.bellMessage ? buildTargetTitle(cfg.bellMessage, card.title) : undefined,
          link: "/pipelines", entityType: "pipeline_card", entityId: card.id, fromUserId: actorId,
        });
        acted = true;
      } else {
        console.warn(`[automation] notify action ${action.id}: bell target has no recipient — skipped bell`);
      }
    }
    if (cfg.channels.includes("webhook") && cfg.webhookUrl) {
      const values = await storage.getCardValues(card.id);
      const ok = await postPipelineWebhook(cfg.webhookUrl, buildWebhookPayload(rule, card, values, new Date().toISOString()));
      if (ok) acted = true;
    }
    return acted;
  }
```
(`parseActionConfig` is already imported from the helpers in this file.)

- [ ] **Step 4: Typecheck + build + tests**

Run: `npm run typecheck && npm run build && npx tsx --test server/pipeline-automation-helpers.test.ts`
Expected: `pipeline-automation.ts` = 0 errors; build green; tests pass. Residuals (if any) in client only (later tasks) — but this task adds no client breakage, so likely 0. Report.

- [ ] **Step 5: Commit**

```bash
git add server/pipeline-automation.ts
git commit -m "feat(pipelines): engine — applyAction +rule + notify branch (bell + webhook) (P4b-2)"
```

---

### Task 3: Routes — validate notify

**Files:** `server/routes.ts`

- [ ] **Step 1: `validateActionConfig` notify case**

Read `validateActionConfig` (~line 4276). It currently handles set_field/move_stage/assign and (likely) returns an error for unknown types. Add a `notify` branch before its final return:
```ts
  if (actionType === "notify") {
    const channels = Array.isArray(cfg?.channels) ? cfg.channels : [];
    const valid = channels.length > 0 && channels.every((c: any) => c === "bell" || c === "webhook");
    if (!valid) return "notify butuh minimal satu channel (bell/webhook)";
    if (channels.includes("bell")) {
      if (!["assignee", "user", "creator"].includes(cfg.bellTarget)) return "notify bell: target tidak valid";
      if (cfg.bellTarget === "user" && typeof cfg.bellUserId !== "number") return "notify bell: pilih user";
    }
    if (channels.includes("webhook")) {
      if (typeof cfg.webhookUrl !== "string" || !cfg.webhookUrl) return "notify webhook: URL wajib";
      try {
        const u = new URL(cfg.webhookUrl);
        if (u.protocol !== "http:" && u.protocol !== "https:") return "notify webhook: URL harus http/https";
      } catch { return "notify webhook: URL tidak valid"; }
    }
    return null;
  }
```
(Match the function's existing return-style — it returns a string error or null. If it has a trailing `return null;` for unknown types, place the notify branch before it.)

- [ ] **Step 2: `validateActions` allows notify**

Find `validateActions` (the P4d-1 per-action validator). It dispatches `set_field | move_stage | assign` to `validateActionConfig` and rejects unknown types. Add `"notify"` to that allowed set so it routes to `validateActionConfig`:
```ts
    } else if (t === "set_field" || t === "move_stage" || t === "assign" || t === "notify") {
      const cfgErr = await validateActionConfig(pipelineId, t, a.actionConfig);
      if (cfgErr) return cfgErr;
    } else {
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: routes.ts = 0 errors, build green. Report residuals (client, later tasks — likely none yet).

- [ ] **Step 4: Commit**

```bash
git add server/routes.ts
git commit -m "feat(pipelines): rule routes — validate notify action config (P4b-2)"
```

---

### Task 4: ruleFormState — notify draft fields

**Files:** `client/components/pipelines/ruleFormState.ts`

- [ ] **Step 1: `ActionDraft` notify fields + `emptyAction` defaults**

Add to the `ActionDraft` type (after `assignUserId: string;`):
```ts
  notifyBell: boolean;
  notifyWebhook: boolean;
  bellTarget: "assignee" | "user" | "creator";
  bellUserId: string;
  bellTitle: string;
  bellMessage: string;
  webhookUrl: string;
```
In `emptyAction()`, add to the returned object:
```ts
    notifyBell: true, notifyWebhook: false, bellTarget: "assignee", bellUserId: "", bellTitle: "", bellMessage: "", webhookUrl: "",
```

- [ ] **Step 2: `draftToPayload` notify branch**

In `draftToPayload`'s per-action loop (the `if (a.actionType === "create_card") {...} else if (...assign...) {...}` chain), add a `notify` branch (after the assign branch, before the `else { return tipe tidak dikenal }`):
```ts
    } else if (a.actionType === "notify") {
      const channels: ("bell" | "webhook")[] = [];
      if (a.notifyBell) channels.push("bell");
      if (a.notifyWebhook) channels.push("webhook");
      if (channels.length === 0) return { ok: false, error: "Pilih minimal satu channel notifikasi" };
      const cfg: Record<string, any> = { channels };
      if (a.notifyBell) {
        cfg.bellTarget = a.bellTarget;
        if (a.bellTarget === "user") {
          if (!a.bellUserId) return { ok: false, error: "Pilih user untuk notifikasi bell" };
          cfg.bellUserId = Number(a.bellUserId);
        }
        if (a.bellTitle.trim()) cfg.bellTitle = a.bellTitle.trim();
        if (a.bellMessage.trim()) cfg.bellMessage = a.bellMessage.trim();
      }
      if (a.notifyWebhook) {
        if (!a.webhookUrl.trim()) return { ok: false, error: "Isi URL webhook" };
        cfg.webhookUrl = a.webhookUrl.trim();
      }
      actions.push({ actionType: "notify", actionConfig: cfg });
    }
```

- [ ] **Step 3: `ruleToDraft` notify hydrate**

In `ruleToDraft`'s per-action mapping (the `if (a.actionType === "create_card") {...} else if (...assign...)` chain), add:
```ts
    } else if (a.actionType === "notify") {
      const cfg = a.actionConfig as any; // NotifyConfig
      if (cfg) {
        act.notifyBell = (cfg.channels ?? []).includes("bell");
        act.notifyWebhook = (cfg.channels ?? []).includes("webhook");
        act.bellTarget = cfg.bellTarget ?? "assignee";
        act.bellUserId = cfg.bellUserId != null ? String(cfg.bellUserId) : "";
        act.bellTitle = cfg.bellTitle ?? "";
        act.bellMessage = cfg.bellMessage ?? "";
        act.webhookUrl = cfg.webhookUrl ?? "";
      }
    }
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: ruleFormState.ts = 0 errors. Residuals now in `RuleActionEditor.tsx` (it doesn't render notify fields yet — but it compiles since it just won't reference them) and possibly none. Report. NOTE: if `RuleActionEditor.tsx` constructs `ActionDraft` objects literally anywhere it may need the new fields — but it uses `emptyAction()`/`patch()`, so it should still compile.

- [ ] **Step 5: Commit**

```bash
git add client/components/pipelines/ruleFormState.ts
git commit -m "feat(pipelines): ruleFormState — notify ActionDraft fields + draft<->payload (P4b-2)"
```

---

### Task 5: RuleActionEditor notify block + read-side label

**Files:** `client/components/pipelines/RuleActionEditor.tsx`, `client/components/pipelines/PipelineRulesDialog.tsx`, `client/hooks/usePipelines.ts`

- [ ] **Step 1: Hook — `RuleActionView.notifyLabel`**

In `client/hooks/usePipelines.ts`, add `notifyLabel?: string;` to the `RuleActionView` type (alongside `setFieldLabel?`, `moveStageName?`, etc.).

- [ ] **Step 2: Action-type option + notify block in `RuleActionEditor`**

In `client/components/pipelines/RuleActionEditor.tsx`:
- Add `{ value: "notify", label: "Kirim notifikasi (bell/webhook)" }` to the action-type `<Combobox>` options list.
- Add a notify block after the `assign` block (`{value.actionType === "notify" && (...)}`). Use the same `<FormField>`/`Combobox`/`Input`/`Switch`/`patch()` patterns the other blocks use:
```tsx
      {value.actionType === "notify" && (
        <div className="space-y-2">
          <div className="flex items-center gap-3 rounded-lg bg-muted/30 border border-border/40 px-4 py-2">
            <Switch checked={value.notifyBell} onCheckedChange={(c) => patch({ notifyBell: c })} />
            <div className="text-sm">Bell internal</div>
            <Switch checked={value.notifyWebhook} onCheckedChange={(c) => patch({ notifyWebhook: c })} />
            <div className="text-sm">Webhook</div>
          </div>
          {value.notifyBell && (
            <>
              <FormField label="Target bell" htmlFor={`notify-target-${value._key}`}>
                <Combobox
                  options={[
                    { value: "assignee", label: "Assignee kartu" },
                    { value: "user", label: "User tertentu" },
                    { value: "creator", label: "Pembuat rule" },
                  ]}
                  value={value.bellTarget}
                  onChange={(v) => patch({ bellTarget: (v || "assignee") as ActionDraft["bellTarget"] })}
                  clearable={false}
                />
              </FormField>
              {value.bellTarget === "user" && (
                <FormField label="User" htmlFor={`notify-user-${value._key}`}>
                  <Combobox
                    options={staffUsers.map((u) => ({ value: String(u.id), label: u.name || u.username || String(u.id) }))}
                    value={value.bellUserId}
                    onChange={(v) => patch({ bellUserId: v })}
                    placeholder="Pilih user…" searchPlaceholder="Cari user…"
                  />
                </FormField>
              )}
              <FormField label="Judul bell" htmlFor={`notify-title-${value._key}`} hint="{title} = judul kartu. Kosongkan untuk default.">
                <Input value={value.bellTitle} onChange={(e) => patch({ bellTitle: e.target.value })} placeholder="Otomasi: {title}" />
              </FormField>
              <FormField label="Pesan bell (opsional)" htmlFor={`notify-msg-${value._key}`}>
                <Input value={value.bellMessage} onChange={(e) => patch({ bellMessage: e.target.value })} placeholder="Pesan…" />
              </FormField>
            </>
          )}
          {value.notifyWebhook && (
            <FormField label="URL Webhook" htmlFor={`notify-url-${value._key}`} hint="POST JSON ke URL ini (mis. webhook n8n).">
              <Input type="url" value={value.webhookUrl} onChange={(e) => patch({ webhookUrl: e.target.value })} placeholder="https://…" />
            </FormField>
          )}
        </div>
      )}
```
(Confirm `staffUsers`, `FormField`, `Combobox`, `Input`, `Switch`, `ActionDraft` are already imported/props in this component — the assign block already uses `staffUsers` + the create_card block uses `Switch`. `value._key` exists on ActionDraft.)

- [ ] **Step 3: Dialog read-side notify label**

In `client/components/pipelines/PipelineRulesDialog.tsx`, the read-side `label(a)` helper (inside `actionSummary`, from P4d-1) covers create_card/set_field/move_stage/assign. Add a notify case so it reads the enriched `notifyLabel`:
```tsx
      a.actionType === "notify" ? `kirim notif (${a.notifyLabel ?? "?"})` :
```
Place it in the chain before the final create_card fallback (match the existing ternary structure — read it first).

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: **0 typecheck errors**, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add client/components/pipelines/RuleActionEditor.tsx client/components/pipelines/PipelineRulesDialog.tsx client/hooks/usePipelines.ts
git commit -m "feat(pipelines): RuleActionEditor notify block + read-side label (P4b-2)"
```

- [ ] **Step 6: Manual checklist (relay to user; run on dev)**

- Add a rule with a `notify` action, channel=bell, target=assignee → trigger on an assigned card → the assignee gets a bell (NotificationBell).
- target=user → that user gets it; target=creator → the rule's creator gets it.
- channel=webhook with a requestbin/n8n URL → POST arrives with `{event, ruleId, ruleName, card, values, firedAt}`.
- both channels in one notify; a notify alongside set_field in one rule (multi-action) → both run.
- target=assignee on an unassigned card → no bell, no crash; webhook (if on) still fires.
- invalid configs rejected at save: no channel; webhook checked but blank URL; bell target=user but no user.
- dedup once: no double-notify on re-entry; a time-trigger `every` rule re-notifies per interval.
- edit a notify rule → its channels/target/url hydrate; change + save round-trips.

---

## Self-Review notes (addressed)

- **Spec coverage:** §1 config → T1 (schema) + T4 (draft); §2 engine (applyAction+rule, notify branch, webhook helper, payload) → T2; §3 validation → T3; §4 helpers (parse + shape) → T1; §5 frontend (ruleFormState → T4, RuleActionEditor → T5, read-side → T5, hook → T5); §7 edge cases (no recipient, webhook fail, loop-safety, dedup, multi-action) covered by T2 logic + T5 manual.
- **Type consistency:** `NotifyConfig` shape identical in schema (T1), parseActionConfig (T1), engine cast (T2), validate (T3). `ActionDraft` notify fields identical in T4 (type+emptyAction+draft+hydrate) and consumed in T5 editor. `notifyLabel` produced in shapeRuleActions (T1), typed on RuleActionView (T5), read in dialog (T5).
- **No migration:** `action_type varchar(16)` fits "notify"; `action_config` opaque JSON — confirmed, no DB step.
- **No placeholders;** pure helpers TDD'd (T1); engine/routes verified via typecheck+build; UI via typecheck+build+manual.
- **DRY/SoC/semantic:** reuse `buildTargetTitle` for `{title}`; pure parse/shape helpers; `<FormField>` + `type="url"` input + all editor buttons already `type="button"` (notify block adds Switches/Inputs only, no new buttons).
