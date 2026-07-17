# Pipeline Rule Edit-Mode Design

> Fast-follow for the pipelines automation program. Adds **edit** capability to
> the rule dialog, which is currently create-only (rules can only be toggled
> enabled/disabled or deleted). Frontend-only — the PATCH endpoint already
> accepts the full rule payload (built in P4b-1 + P4c).

**Base branch:** new branch off `dev`.
**Status:** Approved design, ready for spec review.

---

## Goal

In `client/components/pipelines/PipelineRulesDialog.tsx`, let a user edit an
existing rule by clicking a pencil icon on its row: the bottom form (which
already holds every field) hydrates with that rule's values, switches to
"edit" mode, and saves via `updateRule` instead of `createRule`.

## Coding standards applied (per user directive)

- **Separation of concern + testability:** the pure mapping/validation logic
  lives in a new React-free module `ruleFormState.ts` (mirrors the
  `pipeline-automation-helpers.ts` pure-helper pattern). The component only owns
  the `useState` glue.
- **DRY:** one `draftToPayload()` builds the request body for BOTH create and
  edit (today the payload is assembled inline per action branch). One
  `applyDraft()` drives both `resetForm` and `startEdit`. One `emptyDraft()`
  owns the defaults (today scattered across `resetForm`).
- **Semantic HTML5:** the add/edit fields are wrapped in a real `<form>` with
  `onSubmit` (preventDefault) and a `type="submit"` button; auxiliary buttons get
  explicit `type="button"`. Labels already come via `<FormField htmlFor>`.

---

## 1. New pure module — `client/components/pipelines/ruleFormState.ts`

No React imports. Pure, deterministic, unit-testable in isolation.

```ts
export type RuleDraft = {
  // trigger
  triggerType: "stage_enter" | "time";
  triggerStageId: string;            // stage_enter picker
  anchor: "stage_entered" | "card_created" | "field_date";
  anchorFieldId: string;
  offsetN: string;
  offsetUnit: "hours" | "days";
  direction: "after" | "before";
  repeat: "once" | "every";
  repeatEveryN: string;
  scopeStageId: string;              // time: optional stage scope
  // action
  actionType: PipelineRuleActionType;
  targetPipelineId: string;
  targetStageId: string;
  titleTemplate: string;
  copyAssignee: boolean;
  maps: { sourceFieldId: number | ""; targetFieldId: number | "" }[];
  setFieldId: string;
  setFieldValue: string;
  moveStageId: string;
  assignUserId: string;
  // conditions
  conditions: DraftCondition[];      // reuse ConditionsBuilder's DraftCondition
};

export function emptyDraft(): RuleDraft;          // the current resetForm defaults
export function ruleToDraft(r: RuleWithMaps): RuleDraft;   // hydration (edit)
export function draftToPayload(d: RuleDraft):
  | { ok: true; payload: Record<string, any> }
  | { ok: false; error: string };                 // validation + request body
```

- `RuleWithMaps`, `PipelineRuleActionType`, `DraftCondition` imported **type-only**
  (erased at build; no runtime React/hook dependency).
- `ruleToDraft` maps a server rule back to form values:
  - trigger: `triggerType`; stage_enter → `triggerStageId = String(r.triggerStageId ?? "")`;
    time → from parsed `r.triggerConfig` (anchor, offsetN→String, offsetUnit,
    direction, repeat, repeatEveryN→String, `fieldId`→`anchorFieldId`) and
    `scopeStageId = String(r.triggerStageId ?? "")`.
  - action: per `r.actionType` — create_card (target ids, titleTemplate,
    copyAssignee, `maps` from `r.fieldMaps`), set_field / move_stage / assign from
    `r.actionConfig`.
  - `conditions` from `r.conditions` → `{ fieldId, op, value: c.value ?? "" }`.
  - Missing/`null` config (e.g. a malformed row) falls back to `emptyDraft()`'s
    value for that field so the form never holds `undefined`.
- `draftToPayload` is the single source of truth for validation + body shape:
  - builds the `triggerPart` (stage_enter requires `triggerStageId`; time
    validates anchorFieldId-when-field_date, finite `offsetN ≥ 0`, finite
    `repeatEveryN > 0`-when-every, and emits `triggerConfig`),
  - then per `actionType` the action fields (create_card requires target ids and
    includes `fieldMaps`; set_field/move_stage/assign include `actionConfig`),
  - plus `conditions`,
  - returns `{ ok: false, error }` on the first validation failure (the dialog
    toasts it) or `{ ok: true, payload }`.
  - `fieldMaps` is included **only** for create_card (matches today's behavior and
    the PATCH route, which rejects `fieldMaps` without a resolvable target pipeline).

## 2. Dialog changes — `PipelineRulesDialog.tsx`

### Glue helpers (the only React-aware mapping, kept tiny)
- `applyDraft(d: RuleDraft)` — calls the 21 setters from a draft. Used by both
  `resetForm` and `startEdit` (DRY).
- `currentDraft(): RuleDraft` — assembles a draft from current state. Used by
  `submit`.
- `resetForm = () => { applyDraft(emptyDraft()); setEditingId(null); }`.

### Mode + entry
- New state `editingId: number | null` (null = add, number = editing that rule).
- A **pencil** icon button (`Pencil`, lucide) in each row's action cluster, left
  of the enable Switch and the Trash button, `opacity-0 group-hover:opacity-100`
  (matches Trash), `type="button"`, `onClick={() => startEdit(r)}`.
- `startEdit(r) = () => { applyDraft(ruleToDraft(r)); setEditingId(r.id); formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }`.

### Submit (replaces `add`)
```ts
const submit = async (e?: FormEvent) => {
  e?.preventDefault();
  const res = draftToPayload(currentDraft());
  if (!res.ok) { toast.error(res.error); return; }
  try {
    if (editingId != null) {
      await m.updateRule.mutateAsync({ ruleId: editingId, ...res.payload });
      toast.success("Otomasi diperbarui");
    } else {
      await m.createRule.mutateAsync(res.payload);
      toast.success("Otomasi ditambahkan");
    }
    resetForm();
  } catch (err: any) {
    toast.error(err?.message || "Gagal menyimpan otomasi");
  }
};
```

### Edit affordances (when `editingId != null`)
- `<FormSection>` title → **"Edit Otomasi"**, description → the edited rule's
  `triggerSummary(r) → actionSummary` (looked up from `ruleList`).
- Submit button label → **"Simpan Perubahan"**, `loading={m.updateRule.isPending}`,
  `type="submit"`.
- A **"Batal"** button (`type="button"`, `variant="ghost"`) next to submit →
  `cancelEdit = () => resetForm()`.
- The edited row gets a subtle `ring-1 ring-primary/40` when `editingId === r.id`.

### Semantic form
Wrap the add/edit fields in `<form ref={formRef} onSubmit={submit}>`; submit
button `type="submit"`; pencil/cancel/delete/map-row buttons `type="button"`
(prevents implicit form submission). The rules-list section stays outside the form.

### Lifecycle
Reset on dialog close so an aborted edit doesn't persist into the next open:
the existing `<Dialog onOpenChange={(o) => { if (!o) onClose(); }}>` becomes
`onOpenChange={(o) => { if (!o) { resetForm(); onClose(); } }}`.

## 3. Edge cases

- **Action-type switched during edit** (e.g. create_card → set_field): the new
  payload omits target/fieldMaps; the old columns remain in the DB row but are
  **inert** — the server reads only the fields relevant to the current
  `actionType` (same accepted "stale-but-harmless" pattern as P4c's
  `triggerConfig`). No migration, no backend change.
- **Deleted referenced entities** (a mapped field / target stage removed after the
  rule was made): `ruleToDraft` still hydrates the stored id; the Combobox shows
  no matching option (blank) and the user re-picks. No crash.
- **Edit + enable-toggle/delete**: unchanged; toggle still calls `updateRule({enabled})`,
  delete still works. Editing a disabled rule keeps it disabled (we don't send
  `enabled` in the edit payload, so it's preserved).

## 4. Files

| File | Change |
|---|---|
| `client/components/pipelines/ruleFormState.ts` | **new** — pure `RuleDraft`, `emptyDraft`, `ruleToDraft`, `draftToPayload` |
| `client/components/pipelines/PipelineRulesDialog.tsx` | `editingId` + glue (`applyDraft`/`currentDraft`), pencil entry, `startEdit`/`cancelEdit`, `submit` via `draftToPayload`, edit indicators, `<form>` wrapper, close-resets |

No backend, schema, or migration changes.

## 5. Testing

Client has no unit-test runner (server-only `tsx --test`), so verification is
`npm run typecheck` + `npm run build` + a manual checklist. The pure module is
written React-free specifically so it *could* be unit-tested later and so its
logic is reviewable in isolation.

**Manual checklist (dev):**
- Edit each action type (create_card/set_field/move_stage/assign) → form hydrates
  with correct values → change something → Simpan → list reflects the change.
- Edit a time-trigger rule and a stage_enter rule → trigger fields hydrate right;
  switch trigger type and save.
- Edit conditions + field maps → persisted correctly on GET.
- "Batal" returns to add-mode with a clean form; editing row highlight clears.
- Open dialog → start edit → close dialog → reopen → form is clean (no stuck edit).
- Enable toggle + delete still work; editing a disabled rule keeps it disabled.
- Create a brand-new rule still works (shared `draftToPayload` path).

## Out of scope

- Optimistic UI / inline diffing of changes.
- Editing the `enabled` flag from within the form (stays on the row toggle).
- Reordering rules.

## Consistency with memory

- [[feedback-coding-standards]] — pure module (SoC/testable), shared
  `draftToPayload` (DRY), semantic `<form>`.
- [[project-pipelines-engine]] — fast-follow closing the create-only gap noted
  in the P4c entry; update that note on merge.
- [[reference-api-response-envelope]] — uses the existing `updateRule`/`createRule`
  mutations (already envelope-aware via `apiFetch`).
