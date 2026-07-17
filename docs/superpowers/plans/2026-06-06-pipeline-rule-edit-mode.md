# Pipeline Rule Edit-Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users edit an existing pipeline automation rule (currently create-only) by clicking a pencil on its row, which hydrates the shared bottom form and saves via `updateRule`.

**Architecture:** Extract the form's pure mapping/validation into a new React-free module `ruleFormState.ts` (`ruleToDraft` for hydration, `draftToPayload` for the request body — shared by create AND edit; `emptyDraft` for defaults). The dialog keeps its `useState` hooks but adds thin `applyDraft`/`currentDraft` glue, an `editingId`, a pencil entry, and a `submit` that branches create vs update. The add/edit fields become a semantic `<form>`.

**Tech Stack:** React 18 + TS + Vite; TanStack Query mutations (`useRules`/`usePipelineMutations`); shadcn `Button`/`Combobox`/`Input`/`FormField`/`FormSection`. No backend/schema/migration changes — the PATCH route already accepts the full payload.

**Base branch:** `feat/pipeline-rule-edit-mode` (off `dev`). Spec: `docs/superpowers/specs/2026-06-06-pipeline-rule-edit-mode-design.md`.

**Verification (whole-repo):** `npm run typecheck` (must end at **0 errors**) · `npm run build` (must succeed). No client unit-test runner exists; logic is verified via typecheck + build + the manual checklist in Task 3.

---

### Task 1: Pure module `ruleFormState.ts`

**Files:**
- Create: `client/components/pipelines/ruleFormState.ts`

- [ ] **Step 1: Write the module**

```ts
// Pure form-state helpers for the pipeline rule dialog — no React.
// SoC: hydration (ruleToDraft) + validation/body (draftToPayload) live here so
// the same logic drives BOTH create and edit, and can be reasoned about in isolation.
import type { PipelineRuleActionType } from "@shared/schema";
import type { RuleWithMaps } from "@/hooks/usePipelines";
import type { DraftCondition } from "./ConditionsBuilder";

export type RuleDraft = {
  triggerType: "stage_enter" | "time";
  triggerStageId: string;
  anchor: "stage_entered" | "card_created" | "field_date";
  anchorFieldId: string;
  offsetN: string;
  offsetUnit: "hours" | "days";
  direction: "after" | "before";
  repeat: "once" | "every";
  repeatEveryN: string;
  scopeStageId: string;
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
  conditions: DraftCondition[];
};

export function emptyDraft(): RuleDraft {
  return {
    triggerType: "stage_enter",
    triggerStageId: "",
    anchor: "stage_entered",
    anchorFieldId: "",
    offsetN: "3",
    offsetUnit: "days",
    direction: "after",
    repeat: "once",
    repeatEveryN: "1",
    scopeStageId: "",
    actionType: "create_card",
    targetPipelineId: "",
    targetStageId: "",
    titleTemplate: "",
    copyAssignee: false,
    maps: [],
    setFieldId: "",
    setFieldValue: "",
    moveStageId: "",
    assignUserId: "",
    conditions: [],
  };
}

/** Map a server rule back into editable form values (edit-mode hydration). */
export function ruleToDraft(r: RuleWithMaps): RuleDraft {
  const d = emptyDraft();
  d.triggerType = r.triggerType === "time" ? "time" : "stage_enter";
  if (d.triggerType === "time" && r.triggerConfig) {
    const c = r.triggerConfig;
    d.anchor = c.anchor;
    d.anchorFieldId = c.fieldId != null ? String(c.fieldId) : "";
    d.offsetN = String(c.offsetN);
    d.offsetUnit = c.offsetUnit;
    d.direction = c.direction;
    d.repeat = c.repeat;
    d.repeatEveryN = c.repeatEveryN != null ? String(c.repeatEveryN) : "1";
    d.scopeStageId = r.triggerStageId != null ? String(r.triggerStageId) : "";
  } else {
    d.triggerStageId = r.triggerStageId != null ? String(r.triggerStageId) : "";
  }

  d.actionType = r.actionType;
  if (r.actionType === "create_card") {
    d.targetPipelineId = r.targetPipelineId != null ? String(r.targetPipelineId) : "";
    d.targetStageId = r.targetStageId != null ? String(r.targetStageId) : "";
    d.titleTemplate = r.titleTemplate ?? "";
    d.copyAssignee = r.copyAssignee === 1;
    d.maps = (r.fieldMaps ?? []).map((m) => ({ sourceFieldId: m.sourceFieldId, targetFieldId: m.targetFieldId }));
  } else if (r.actionType === "set_field") {
    const cfg = r.actionConfig as { fieldId: number; value: string } | null;
    d.setFieldId = cfg ? String(cfg.fieldId) : "";
    d.setFieldValue = cfg?.value ?? "";
  } else if (r.actionType === "move_stage") {
    const cfg = r.actionConfig as { stageId: number } | null;
    d.moveStageId = cfg ? String(cfg.stageId) : "";
  } else if (r.actionType === "assign") {
    const cfg = r.actionConfig as { assigneeId: number | null } | null;
    d.assignUserId = cfg && cfg.assigneeId != null ? String(cfg.assigneeId) : "";
  }

  d.conditions = (r.conditions ?? []).map((c) => ({
    fieldId: c.fieldId,
    op: c.op,
    value: c.value ?? "",
  }));
  return d;
}

/** Validate a draft and build the create/update request body. Single source of truth. */
export function draftToPayload(d: RuleDraft):
  | { ok: true; payload: Record<string, any> }
  | { ok: false; error: string } {
  let triggerPart: Record<string, any>;
  if (d.triggerType === "stage_enter") {
    if (!d.triggerStageId) return { ok: false, error: "Pilih stage trigger" };
    triggerPart = { triggerType: "stage_enter", triggerStageId: Number(d.triggerStageId) };
  } else {
    if (d.anchor === "field_date" && !d.anchorFieldId) return { ok: false, error: "Pilih field tanggal untuk anchor" };
    const n = Number(d.offsetN);
    if (!Number.isFinite(n) || n < 0) return { ok: false, error: "Offset harus angka ≥ 0" };
    const cfg: Record<string, any> = { anchor: d.anchor, offsetN: n, offsetUnit: d.offsetUnit, direction: d.direction, repeat: d.repeat };
    if (d.anchor === "field_date") cfg.fieldId = Number(d.anchorFieldId);
    if (d.repeat === "every") {
      const e = Number(d.repeatEveryN);
      if (!Number.isFinite(e) || e <= 0) return { ok: false, error: "Interval ulang harus > 0" };
      cfg.repeatEveryN = e;
    }
    triggerPart = { triggerType: "time", triggerStageId: d.scopeStageId ? Number(d.scopeStageId) : null, triggerConfig: cfg };
  }

  const conditions = d.conditions
    .filter((c) => c.fieldId !== "")
    .map((c) => ({
      fieldId: Number(c.fieldId),
      op: c.op,
      ...(c.op === "empty" || c.op === "not_empty" ? {} : { value: c.value }),
    }));

  if (d.actionType === "create_card") {
    if (!d.targetPipelineId || !d.targetStageId) return { ok: false, error: "Lengkapi target sebelum menyimpan" };
    return { ok: true, payload: {
      actionType: "create_card",
      ...triggerPart,
      targetPipelineId: Number(d.targetPipelineId),
      targetStageId: Number(d.targetStageId),
      titleTemplate: d.titleTemplate.trim() || null,
      copyAssignee: d.copyAssignee ? 1 : 0,
      conditions,
      fieldMaps: d.maps
        .filter((r) => r.sourceFieldId !== "" && r.targetFieldId !== "")
        .map((r) => ({ sourceFieldId: Number(r.sourceFieldId), targetFieldId: Number(r.targetFieldId) })),
    } };
  }
  if (d.actionType === "set_field") {
    if (!d.setFieldId) return { ok: false, error: "Pilih field tujuan" };
    return { ok: true, payload: {
      actionType: "set_field",
      ...triggerPart,
      actionConfig: { fieldId: Number(d.setFieldId), value: d.setFieldValue },
      conditions,
    } };
  }
  if (d.actionType === "move_stage") {
    if (!d.moveStageId) return { ok: false, error: "Pilih stage tujuan" };
    return { ok: true, payload: {
      actionType: "move_stage",
      ...triggerPart,
      actionConfig: { stageId: Number(d.moveStageId) },
      conditions,
    } };
  }
  if (d.actionType === "assign") {
    return { ok: true, payload: {
      actionType: "assign",
      ...triggerPart,
      actionConfig: { assigneeId: d.assignUserId ? Number(d.assignUserId) : null },
      conditions,
    } };
  }
  return { ok: false, error: "Tipe aksi tidak dikenal" };
}
```

> This mirrors the dialog's existing `add()` payload logic exactly (same validation order, same body fields, `fieldMaps` only for create_card), so wiring it in (Task 2) is behavior-preserving for create.

- [ ] **Step 2: Typecheck the module compiles standalone**

Run: `npm run typecheck`
Expected: **0 errors** (the module has no consumers yet; it must compile on its own — confirms the type-only imports + `RuleWithMaps`/`TimeTriggerConfig`/`DraftCondition` shapes line up).

- [ ] **Step 3: Commit**

```bash
git add client/components/pipelines/ruleFormState.ts
git commit -m "feat(pipelines): pure ruleFormState module — emptyDraft/ruleToDraft/draftToPayload (rule edit-mode)"
```

---

### Task 2: Wire create-path through the module + semantic `<form>` (behavior-preserving)

**Files:**
- Modify: `client/components/pipelines/PipelineRulesDialog.tsx`
- Modify: `client/components/pipelines/ConditionsBuilder.tsx` (button `type`s)

This refactors the existing create flow to use the pure module (DRY) and makes the form a semantic `<form>`. No edit-mode yet — creating rules must still work identically.

- [ ] **Step 1: Imports**

In `PipelineRulesDialog.tsx`:
- Change `import { useState } from "react";` → `import { useState, type FormEvent } from "react";`
- Add after the existing `import type { RuleWithMaps } from "@/hooks/usePipelines";` line:
```ts
import { emptyDraft, draftToPayload, type RuleDraft } from "./ruleFormState";
```

- [ ] **Step 2: Add `applyDraft` + `currentDraft` glue**

Insert these two helpers just above the existing `resetForm` definition:

```ts
  const applyDraft = (d: RuleDraft) => {
    setTriggerType(d.triggerType);
    setTriggerStageId(d.triggerStageId);
    setAnchor(d.anchor);
    setAnchorFieldId(d.anchorFieldId);
    setOffsetN(d.offsetN);
    setOffsetUnit(d.offsetUnit);
    setDirection(d.direction);
    setRepeat(d.repeat);
    setRepeatEveryN(d.repeatEveryN);
    setScopeStageId(d.scopeStageId);
    setActionType(d.actionType);
    setTargetPipelineId(d.targetPipelineId);
    setTargetStageId(d.targetStageId);
    setTitleTemplate(d.titleTemplate);
    setCopyAssignee(d.copyAssignee);
    setMaps(d.maps);
    setSetFieldId(d.setFieldId);
    setSetFieldValue(d.setFieldValue);
    setMoveStageId(d.moveStageId);
    setAssignUserId(d.assignUserId);
    setConditions(d.conditions);
  };

  const currentDraft = (): RuleDraft => ({
    triggerType, triggerStageId, anchor, anchorFieldId, offsetN, offsetUnit,
    direction, repeat, repeatEveryN, scopeStageId, actionType, targetPipelineId,
    targetStageId, titleTemplate, copyAssignee, maps, setFieldId, setFieldValue,
    moveStageId, assignUserId, conditions,
  });
```

- [ ] **Step 3: Replace `resetForm` body**

Replace the entire existing `resetForm` (the 21 individual setters) with:

```ts
  const resetForm = () => {
    applyDraft(emptyDraft());
  };
```

- [ ] **Step 4: Replace `add` + `buildConditionsPayload` with `submit`**

Delete the `buildConditionsPayload` helper and the entire `add` function. Replace them with:

```ts
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const res = draftToPayload(currentDraft());
    if (!res.ok) { toast.error(res.error); return; }
    try {
      await m.createRule.mutateAsync(res.payload);
      toast.success("Otomasi ditambahkan");
      resetForm();
    } catch (err: any) {
      toast.error(err?.message || "Gagal menyimpan otomasi");
    }
  };
```

(The conditions-payload logic now lives inside `draftToPayload`.)

- [ ] **Step 5: Wrap the add fields in a semantic `<form>`**

In the JSX, the add-form lives in `<FormSection title="Tambah Otomasi" ...>`. Wrap ALL of its children — from the first `<FormField label="Pemicu" ...>` through the final submit `<Button>` — in a `<form>`:

- Immediately after the `<FormSection ...>` opening tag, add: `<form onSubmit={submit}>`
- Immediately before the `</FormSection>` closing tag, add: `</form>`

- [ ] **Step 6: Make the save button submit the form; type the others**

- The final submit button currently is `<Button leftIcon={...} onClick={add} loading={m.createRule.isPending} disabled={...}>Tambah Otomasi</Button>`. Change it to:
```tsx
              <Button
                type="submit"
                leftIcon={<Plus className="h-4 w-4" />}
                loading={m.createRule.isPending}
                disabled={
                  (triggerType === "stage_enter" && !triggerStageId) ||
                  (triggerType === "time" && anchor === "field_date" && !anchorFieldId) ||
                  (actionType === "create_card" && (!targetPipelineId || !targetStageId)) ||
                  (actionType === "set_field" && !setFieldId) ||
                  (actionType === "move_stage" && !moveStageId)
                }
                className="w-full sm:w-auto"
              >
                Tambah Otomasi
              </Button>
```
(removed `onClick={add}`, added `type="submit"`.)

- Add `type="button"` to the other buttons INSIDE the form so they don't submit it:
  - the field-map remove button: `<Button variant="ghost" size="icon-sm" ...>` with the `<Trash2 className="size-4" />` → add `type="button"`.
  - the "+ Buat di target" button (`createInTarget`) → add `type="button"`.
  - the "+ Tambah pemetaan" button (`addMapRow`) → add `type="button"`.

- [ ] **Step 7: Type the buttons inside `ConditionsBuilder` (it renders inside the form)**

In `client/components/pipelines/ConditionsBuilder.tsx`, add `type="button"` to BOTH buttons:
- the remove-row button: `<Button variant="ghost" size="icon-sm" className="shrink-0" onClick={() => removeRow(i)}>` → add `type="button"`.
- the "+ Tambah syarat" button: `<Button variant="ghost" size="sm" onClick={addRow}>` → add `type="button"`.

(Without this, pressing those buttons would submit the parent `<form>`.)

- [ ] **Step 8: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: **0 typecheck errors**, build succeeds.

- [ ] **Step 9: Commit**

```bash
git add client/components/pipelines/PipelineRulesDialog.tsx client/components/pipelines/ConditionsBuilder.tsx
git commit -m "refactor(pipelines): rule create path via pure draftToPayload + semantic <form> (rule edit-mode prep)"
```

---

### Task 3: Edit-mode

**Files:**
- Modify: `client/components/pipelines/PipelineRulesDialog.tsx`

- [ ] **Step 1: Imports + state + ref**

- Change `import { useState, type FormEvent } from "react";` → `import { useState, useRef, type FormEvent } from "react";`
- Add `ruleToDraft` to the ruleFormState import:
  `import { emptyDraft, ruleToDraft, draftToPayload, type RuleDraft } from "./ruleFormState";`
- Add `Pencil` to the lucide import: `import { Trash2, Plus, Zap, ChevronDown, Pencil } from "lucide-react";`
- Add state + ref near the other `useState` hooks:
```ts
  const [editingId, setEditingId] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
```

- [ ] **Step 2: `resetForm` also clears edit mode**

Update `resetForm`:
```ts
  const resetForm = () => {
    applyDraft(emptyDraft());
    setEditingId(null);
  };
```

- [ ] **Step 3: `startEdit` + `cancelEdit`**

Add below `currentDraft` (or near `resetForm`):
```ts
  const startEdit = (r: RuleWithMaps) => {
    applyDraft(ruleToDraft(r));
    setEditingId(r.id);
    setExpandedId(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const cancelEdit = () => resetForm();
```

- [ ] **Step 4: `submit` branches create vs update**

Replace the `submit` body's try-block with the create/update branch:
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

- [ ] **Step 5: Reset on dialog close**

Change the Dialog opener `<Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>` to:
```tsx
    <Dialog open={open} onOpenChange={(o) => { if (!o) { resetForm(); onClose(); } }}>
```

- [ ] **Step 6: Pencil entry + row highlight**

In the rule row, the action cluster currently holds the `<Switch>` and the delete `<Button>`. Add a pencil button as the FIRST child of that cluster (before the Switch):
```tsx
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary hover:bg-primary/10"
                            onClick={(e) => { e.stopPropagation(); startEdit(r); }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
```
Also add `type="button"` to the existing delete `<Button>` in that cluster (it's now adjacent; keep it from ever submitting if markup shifts).

Highlight the row being edited: on the row's outer `<div key={r.id} className="group rounded-lg border border-border/60 bg-card shadow-elev-sm transition-shadow hover:shadow-elev-md">`, append a conditional ring:
```tsx
                      className={`group rounded-lg border bg-card shadow-elev-sm transition-shadow hover:shadow-elev-md ${editingId === r.id ? "border-primary/50 ring-1 ring-primary/40" : "border-border/60"}`}
```

- [ ] **Step 7: Edit indicators on the form (title / description / buttons)**

- Add a lookup just before the `return (` of the component (or inline where used):
```ts
  const editingRule = editingId != null ? ruleList.find((r) => r.id === editingId) : null;
```
- The add-form `<FormSection title="Tambah Otomasi" description="Konfigurasikan pemicu dan aksi otomasi">` becomes:
```tsx
            <FormSection
              title={editingId != null ? "Edit Otomasi" : "Tambah Otomasi"}
              description={
                editingId != null && editingRule
                  ? `Mengedit: ${triggerSummary(editingRule)}`
                  : "Konfigurasikan pemicu dan aksi otomasi"
              }
            >
```
- Wrap the submit button in a flex row with a conditional "Batal" button, and make the submit label/loading edit-aware. Replace the submit `<Button type="submit" ...>Tambah Otomasi</Button>` with:
```tsx
              <div className="flex items-center gap-2">
                <Button
                  type="submit"
                  leftIcon={<Plus className="h-4 w-4" />}
                  loading={editingId != null ? m.updateRule.isPending : m.createRule.isPending}
                  disabled={
                    (triggerType === "stage_enter" && !triggerStageId) ||
                    (triggerType === "time" && anchor === "field_date" && !anchorFieldId) ||
                    (actionType === "create_card" && (!targetPipelineId || !targetStageId)) ||
                    (actionType === "set_field" && !setFieldId) ||
                    (actionType === "move_stage" && !moveStageId)
                  }
                  className="w-full sm:w-auto"
                >
                  {editingId != null ? "Simpan Perubahan" : "Tambah Otomasi"}
                </Button>
                {editingId != null && (
                  <Button type="button" variant="ghost" onClick={cancelEdit}>
                    Batal
                  </Button>
                )}
              </div>
```

- [ ] **Step 8: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: **0 typecheck errors**, build succeeds.

- [ ] **Step 9: Commit**

```bash
git add client/components/pipelines/PipelineRulesDialog.tsx
git commit -m "feat(pipelines): rule edit-mode — pencil entry, form hydration, update-or-create submit (rule edit-mode)"
```

- [ ] **Step 10: Manual checklist (relay to user; run on dev after deploy)**

- Click pencil on a **create_card** rule → form hydrates (trigger, target pipeline/stage, title, copy-assignee, field maps) → change a field → "Simpan Perubahan" → list reflects change.
- Repeat for **set_field**, **move_stage**, **assign** → each hydrates its config.
- Edit a **time-trigger** rule and a **stage_enter** rule → trigger fields hydrate correctly; switch trigger type and save.
- Edit **conditions** + **field maps**, save → GET shows the new values.
- Switch action type during edit (e.g. create_card → set_field) → saves; old target fields are inert.
- "Batal" → form returns to add-mode, clean, row highlight clears.
- Open dialog → start edit → close dialog → reopen → form is clean (no stuck edit).
- Enable toggle + delete still work; editing a disabled rule keeps it disabled.
- Create a brand-new rule still works (shared `draftToPayload` path).
- Keyboard: pressing a button inside the form (add condition / add map / remove) does NOT submit the form.

---

## Self-Review notes (addressed)

- **Spec coverage:** §1 pure module → Task 1; §2 dialog glue/entry/submit/indicators/`<form>`/close-reset → Tasks 2-3; §3 edge cases (action-switch inert, deleted refs blank, disabled preserved) → covered by `ruleToDraft` fallbacks + not sending `enabled` + manual checklist; §coding-standards (SoC module, DRY `draftToPayload`, semantic `<form>` + button types incl. ConditionsBuilder) → Tasks 1-3.
- **Type consistency:** `RuleDraft` shape identical in module (T1) and `currentDraft`/`applyDraft` (T2). `draftToPayload`/`ruleToDraft`/`emptyDraft` signatures used exactly as defined. The 21 fields in `applyDraft`/`currentDraft` match `RuleDraft` 1:1.
- **Behavior-preserving:** T2's `draftToPayload` reproduces the old `add()` logic (same validations, same body, `fieldMaps` create_card-only); create flow unchanged before edit-mode is added in T3.
- **Form gotcha:** every non-submit button inside the new `<form>` (map rows, createInTarget, addMap, delete, and ConditionsBuilder's two) gets `type="button"`; only the save button is `type="submit"`.
- **No backend/migration**: confirmed — uses existing `createRule`/`updateRule` mutations + PATCH route.
