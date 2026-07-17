# Card CSV Import/Export (Phase 6) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export a pipeline's cards to CSV and import a CSV as new cards (flexible column→target mapping, skip-invalid-rows-with-report).

**Architecture:** A pure module builds export columns/rows and resolves import rows (validator injected for purity). The export endpoint reuses the existing `toCSV` helper; the import endpoint maps + validates per row via the existing `validateFieldValue`. The UI adds an export download and an import dialog with a mapping step.

**Tech Stack:** TypeScript, Drizzle (MySQL), `node:test` via `npx tsx --test`, React. `.js` import extensions. No schema change.

**Refinement vs spec:** custom-field values export as the **raw stored string** (round-trip-safe — re-import passes `validateFieldValue`), not humanized; only the base columns (stage→label, assignee→name) are resolved. Coordinate/multiselect stay raw.

---

### Task 1: Pure module — columns, export-row, import-row resolver

**Files:**
- Create: `shared/cardCsv.ts`
- Test: `shared/cardCsv.test.ts`

- [ ] **Step 1: Write the failing test**

Create `shared/cardCsv.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildExportColumns, formatCardForExport, resolveImportRow, type ImportCtx } from "./cardCsv.js";

const fields = [{ id: 7, label: "Telepon", type: "phone" as const, options: null }, { id: 8, label: "Paket", type: "dropdown" as const, options: '["A","B"]' }];

test("buildExportColumns: base + per-field", () => {
  const cols = buildExportColumns(fields);
  assert.deepEqual(cols.slice(0, 5).map((c) => c.key), ["title", "stage", "assignee", "priority", "created"]);
  assert.deepEqual(cols.slice(5).map((c) => c.key), ["f_7", "f_8"]);
  assert.equal(cols[5].label, "Telepon");
});

test("formatCardForExport: base resolved + raw field values", () => {
  const row = formatCardForExport(
    { title: "Budi", priority: "high", createdAt: "2026-05-01T00:00:00.000Z", values: { 7: "0812", 8: "A" } },
    fields, "Negosiasi", "Andi",
  );
  assert.equal(row.title, "Budi");
  assert.equal(row.stage, "Negosiasi");
  assert.equal(row.assignee, "Andi");
  assert.equal(row.priority, "high");
  assert.equal(row.f_7, "0812");
  assert.equal(row.f_8, "A");
});

const ctx: ImportCtx = {
  stageByLabel: new Map([["negosiasi", 11], ["baru", 10]]),
  userByName: new Map([["andi", 3]]),
  fieldsById: new Map(fields.map((f) => [f.id, f])),
  firstStageId: 10,
};
const okValidate = () => null;

test("resolveImportRow: title required", () => {
  const r = resolveImportRow({ title: "", values: {} }, ctx, okValidate);
  assert.equal(r.ok, false);
});

test("resolveImportRow: stage by label, fallback to first", () => {
  const a = resolveImportRow({ title: "X", stage: "Negosiasi", values: {} }, ctx, okValidate);
  assert.equal(a.ok && a.draft.stageId, 11);
  const b = resolveImportRow({ title: "X", stage: "Ghost", values: {} }, ctx, okValidate);
  assert.equal(b.ok && b.draft.stageId, 10); // fallback firstStageId
});

test("resolveImportRow: assignee resolved or skipped; priority default", () => {
  const a = resolveImportRow({ title: "X", assignee: "Andi", priority: "weird", values: {} }, ctx, okValidate);
  assert.equal(a.ok && a.draft.assigneeId, 3);
  assert.equal(a.ok && a.draft.priority, "medium"); // invalid priority → medium
  const b = resolveImportRow({ title: "X", assignee: "Nobody", values: {} }, ctx, okValidate);
  assert.equal(b.ok && b.draft.assigneeId, null); // unknown assignee → null, not an error
});

test("resolveImportRow: field value failing validator → row error", () => {
  const bad = resolveImportRow({ title: "X", values: { 8: "Z" } }, ctx, (f) => (f.id === 8 ? "Nilai tidak valid" : null));
  assert.equal(bad.ok, false);
  assert.match((bad as any).error, /Paket/);
});

test("resolveImportRow: happy path → draft with values", () => {
  const r = resolveImportRow({ title: "Budi", stage: "Baru", values: { 7: "0812" } }, ctx, okValidate);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.draft.title, "Budi");
    assert.deepEqual(r.draft.values, [{ fieldId: 7, value: "0812" }]);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test shared/cardCsv.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the module**

Create `shared/cardCsv.ts`:

```ts
/** Pure helpers for card CSV export/import. No DB, no I/O. */

export interface ExportColumn { key: string; label: string }
export interface CsvField { id: number; label?: string; type: string; options?: string | null; config?: string | null }

const BASE_COLUMNS: ExportColumn[] = [
  { key: "title", label: "Judul" },
  { key: "stage", label: "Stage" },
  { key: "assignee", label: "Assignee" },
  { key: "priority", label: "Prioritas" },
  { key: "created", label: "Dibuat" },
];

export function buildExportColumns(fields: CsvField[]): ExportColumn[] {
  return [...BASE_COLUMNS, ...fields.map((f) => ({ key: `f_${f.id}`, label: f.label ?? `Field ${f.id}` }))];
}

/** Flat row keyed by ExportColumn keys. Custom field values are the RAW stored string (round-trip-safe);
 *  only stage/assignee are resolved (passed in by the caller). */
export function formatCardForExport(
  card: { title: string; priority: string; createdAt: string; values?: Record<number, string> },
  fields: CsvField[],
  stageLabel: string,
  assigneeName: string,
): Record<string, string> {
  const row: Record<string, string> = {
    title: card.title ?? "",
    stage: stageLabel,
    assignee: assigneeName,
    priority: card.priority ?? "",
    created: card.createdAt ?? "",
  };
  for (const f of fields) row[`f_${f.id}`] = (card.values?.[f.id] ?? "") + "";
  return row;
}

export interface MappedImportRow { title?: string; stage?: string; assignee?: string; priority?: string; values: Record<number, string> }
export interface ImportCtx {
  stageByLabel: Map<string, number>;   // lowercased label → stageId
  userByName: Map<string, number>;     // lowercased name/username → userId
  fieldsById: Map<number, CsvField>;
  firstStageId: number;
}
export interface CardDraft { stageId: number; title: string; assigneeId: number | null; priority: string; values: { fieldId: number; value: string }[] }

const PRIORITIES = new Set(["low", "medium", "high", "urgent"]);

export function resolveImportRow(
  row: MappedImportRow,
  ctx: ImportCtx,
  validateValue: (field: CsvField, value: string) => string | null,
): { ok: true; draft: CardDraft } | { ok: false; error: string } {
  const title = (row.title ?? "").trim();
  if (!title) return { ok: false, error: "Judul wajib diisi" };

  let stageId = ctx.firstStageId;
  if (row.stage && row.stage.trim()) {
    const found = ctx.stageByLabel.get(row.stage.trim().toLowerCase());
    if (found != null) stageId = found;
  }

  let assigneeId: number | null = null;
  if (row.assignee && row.assignee.trim()) {
    assigneeId = ctx.userByName.get(row.assignee.trim().toLowerCase()) ?? null;
  }

  const priority = row.priority && PRIORITIES.has(row.priority.trim().toLowerCase()) ? row.priority.trim().toLowerCase() : "medium";

  const values: { fieldId: number; value: string }[] = [];
  for (const [fid, raw] of Object.entries(row.values ?? {})) {
    const field = ctx.fieldsById.get(Number(fid));
    if (!field) continue;
    const value = String(raw ?? "");
    if (value.trim() === "") continue;
    const err = validateValue(field, value);
    if (err) return { ok: false, error: `${field.label ?? `Field ${fid}`}: ${err}` };
    values.push({ fieldId: Number(fid), value });
  }
  return { ok: true, draft: { stageId, title, assigneeId, priority, values } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test shared/cardCsv.test.ts`
Expected: PASS — all 7 tests.

- [ ] **Step 5: Commit**

```bash
git add shared/cardCsv.ts shared/cardCsv.test.ts
git commit -m "feat(pipelines): pure card CSV helpers (columns/export-row/import-resolver)"
```

---

### Task 2: Export endpoint

**Files:**
- Modify: `server/routes.ts`

- [ ] **Step 1: Add the import**

At the top of `server/routes.ts`, add:
```ts
import { buildExportColumns, formatCardForExport, resolveImportRow, type CsvField } from "../shared/cardCsv.js";
```
(`toCSV` already exists in routes.ts.)

- [ ] **Step 2: Add the export route**

Near the pipeline card routes, add (`requirePipelineCapability(..., "view")`):
```ts
  router.get("/api/pipelines/:id/cards/export", async (req, res) => {
    if (!requirePermission(req, res, "pipelines")) return;
    const pid = Number(req.params.id);
    const pipeline = await storage.getPipeline(pid);
    if (!pipeline) return sendError(res, "Pipeline tidak ditemukan", 404);
    if (!(await requirePipelineCapability(req, res, pid, "view"))) return;
    const [stages, fields, cards] = await Promise.all([storage.listStages(pid), storage.listFields(pid), storage.listCards(pid)]);
    const stageLabel = new Map(stages.map((s) => [s.id, s.label]));
    const users = await storage.getAssignableUsers(req.authUser!.activeMitraId, req.authUser!.isSystemAdmin);
    const userName = new Map(users.map((u) => [u.id, u.name || u.username]));
    const csvFields: CsvField[] = fields.map((f) => ({ id: f.id, label: f.label, type: f.type, options: f.options, config: (f as any).config }));
    const cols = buildExportColumns(csvFields);
    const rows = [];
    for (const c of cards) {
      const values = await storage.getCardValues(c.id);
      rows.push(formatCardForExport({ title: c.title, priority: c.priority, createdAt: c.createdAt, values }, csvFields, stageLabel.get(c.stageId) ?? "", c.assigneeId != null ? (userName.get(c.assigneeId) ?? "") : ""));
    }
    const csv = toCSV(rows, cols);
    const safeName = (pipeline.name || "pipeline").replace(/[^a-zA-Z0-9-_]+/g, "_");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}-cards.csv"`);
    res.send(csv);
  });
```
NOTE: `getCardValues` per card is N+1; acceptable for an export action. If a batch reader exists
(`getCardValuesForCards`/similar — grep), prefer it and build a per-card map. Report which you used.

- [ ] **Step 3: Verify typecheck + build**

Run: `npm run typecheck` → 0 errors.
Run: `npm run build` → success.

- [ ] **Step 4: Commit**

```bash
git add server/routes.ts
git commit -m "feat(pipelines): card CSV export endpoint"
```

---

### Task 3: Import endpoint

**Files:**
- Modify: `server/routes.ts`

- [ ] **Step 1: Add the import route**

Add (`requirePipelineCapability(..., "cards")`; reuse `validateFieldValue` + `isMultiUser` already imported in routes.ts — confirm; if `isMultiUser` isn't imported, import from `@shared/pipelineFieldTypes`):
```ts
  router.post("/api/pipelines/:id/cards/import", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    const pid = Number(req.params.id);
    const pipeline = await storage.getPipeline(pid);
    if (!pipeline) return sendError(res, "Pipeline tidak ditemukan", 404);
    if (!(await requirePipelineCapability(req, res, pid, "cards"))) return;
    const rows = (req.body?.rows ?? []) as any[];
    if (!Array.isArray(rows)) return sendError(res, "rows wajib array", 400);
    if (rows.length > 2000) return sendError(res, "Maksimal 2000 baris per import", 400);

    const stages = await storage.listStages(pid);
    const fields = await storage.listFields(pid);
    const users = await storage.getAssignableUsers(req.authUser!.activeMitraId, req.authUser!.isSystemAdmin);
    const ctx = {
      stageByLabel: new Map(stages.map((s) => [s.label.toLowerCase(), s.id])),
      userByName: new Map<string, number>(),
      fieldsById: new Map<number, CsvField>(fields.map((f) => [f.id, { id: f.id, label: f.label, type: f.type, options: f.options, config: (f as any).config }])),
      firstStageId: stages[0]?.id ?? 0,
    };
    for (const u of users) { if (u.name) ctx.userByName.set(u.name.toLowerCase(), u.id); ctx.userByName.set(u.username.toLowerCase(), u.id); }
    if (!ctx.firstStageId) return sendError(res, "Pipeline belum punya stage", 400);

    const validate = (field: CsvField, value: string): string | null => {
      const opts = field.options ? (JSON.parse(field.options) as string[]) : undefined;
      const r = validateFieldValue(field.type, value, opts, { multiple: isMultiUser(field as any) });
      return r.ok ? null : (r.error ?? "tidak valid");
    };

    let created = 0; const errors: { index: number; reason: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const resolved = resolveImportRow(rows[i], ctx, validate);
      if (!resolved.ok) { errors.push({ index: i, reason: resolved.error }); continue; }
      try {
        const card = await storage.createCard(pid, { stageId: resolved.draft.stageId, title: resolved.draft.title, assigneeId: resolved.draft.assigneeId, priority: resolved.draft.priority }, req.authUser!.id);
        if (resolved.draft.values.length) await storage.setCardValues(card.id, resolved.draft.values);
        created++;
      } catch (e: any) {
        errors.push({ index: i, reason: e?.message ?? "gagal membuat kartu" });
      }
    }
    sendSuccess(res, { created, skipped: errors.length, errors });
  });
```

- [ ] **Step 2: Verify typecheck + build**

Run: `npm run typecheck` → 0 errors.
Run: `npm run build` → success.

- [ ] **Step 3: Commit**

```bash
git add server/routes.ts
git commit -m "feat(pipelines): card CSV import endpoint (map + validate + report)"
```

---

### Task 4: Frontend — export download + import dialog

**Files:**
- Modify: `client/hooks/usePipelines.ts`, `client/pages/PipelineBoardPage.tsx`
- Create: `client/components/pipelines/CardImportDialog.tsx`

**Context:** READ `client/lib/api.ts` (how the auth token is attached + base URL), `client/pages/PipelineBoardPage.tsx` (toolbar, `pipeline.capabilities`/`can()` gating, `fields`/`stages`), and `client/pages/ExportImportPage.tsx` (its CSV parse function — copy/adapt it).

- [ ] **Step 1: Hooks + export helper**

In `client/hooks/usePipelines.ts` add:
```ts
export function useImportCards(pipelineId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rows: any[]) => api.post(`/pipelines/${pipelineId}/cards/import`, { rows }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline-cards", pipelineId] }),
  });
}
export async function downloadCardsCsv(pipelineId: number, pipelineName: string) {
  // fetch with auth (an <a download> can't send the Authorization header) → blob → download
  const blob = await api.getBlob(`/pipelines/${pipelineId}/cards/export`); // see step note
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${pipelineName.replace(/[^a-zA-Z0-9-_]+/g, "_")}-cards.csv`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
```
NOTE: confirm the real cards queryKey (grep `usePipelineCards` in this file) and use it for invalidate.
If `api` has no `getBlob`, add a tiny helper in `client/lib/api.ts` that does `fetch(base+path, { headers: { Authorization: ... } }).then(r => r.blob())` reusing the same token the other `api` methods use (read the file to match how the token is read). Report what you added.

- [ ] **Step 2: CardImportDialog**

Create `client/components/pipelines/CardImportDialog.tsx`: props `{ pipelineId, fields, open, onClose }`.
- Upload `.csv` (an `<input type="file" accept=".csv">`) → read text → parse to `string[][]` with a CSV
  parser copied from `ExportImportPage.tsx` (header row + data rows).
- **Mapping UI:** for each header, a `<select>` of targets: `Abaikan`, `Judul`, `Stage`, `Assignee`,
  `Prioritas`, and one option per custom field (`Field: <label>`). Default-map a header to a target when
  its lowercased text matches ("judul"/"title"→Judul, "stage"→Stage, etc., and exact field-label match).
- Require **exactly one** column mapped to `Judul` (disable submit otherwise, with a hint).
- On submit: build `MappedImportRow[]` from the data rows using the mapping (title/stage/assignee/priority
  strings; `values[fieldId] = cell`), call `useImportCards(pipelineId).mutateAsync(rows)`, then show the
  **report**: "Dibuat N, dilewati M" + a scrollable list of `errors` (`Baris {index+2}: {reason}` — +2 to
  account for header + 1-based). A "Selesai" button closes + (the mutation already invalidated the board).
- Use the project Dialog/Button/Input/Combobox + design conventions; semantic HTML + aria-labels.

- [ ] **Step 3: Wire into PipelineBoardPage**

In `PipelineBoardPage.tsx` toolbar: add an **Export** button (calls `downloadCardsCsv(pid, pipeline.name)`)
visible to anyone with view; and an **Import** button (opens `CardImportDialog`) gated by `can("cards")`.
Place them with the existing Field/Akses/Otomasi buttons, matching their style.

- [ ] **Step 4: Verify typecheck + build**

Run: `npm run typecheck` → 0 errors.
Run: `npm run build` → success.

- [ ] **Step 5: Commit**

```bash
git add client/hooks/usePipelines.ts client/components/pipelines/CardImportDialog.tsx client/pages/PipelineBoardPage.tsx client/lib/api.ts
git commit -m "feat(pipelines): card CSV export download + import dialog"
```

---

### Task 5: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Pure tests** — Run: `npx tsx --test shared/cardCsv.test.ts` → all PASS.
- [ ] **Step 2: Typecheck** — Run: `npm run typecheck` → 0 errors.
- [ ] **Step 3: Build** — Run: `npm run build` → success.
- [ ] **Step 4: Wiring** — Run: `grep -rln "cardCsv\|cards/export\|cards/import\|CardImportDialog" server/ shared/ client/ | sort` → expect shared module + test, routes, hook, dialog, board page.

---

## Self-Review

- **Spec coverage:** export columns + raw-value rows → Task 1 (`buildExportColumns`/`formatCardForExport`) + Task 2 (endpoint + `toCSV`). Import flexible-mapping + skip-invalid-report → Task 1 (`resolveImportRow`) + Task 3 (endpoint builds ctx, per-row validate via `validateFieldValue`, returns `{created,skipped,errors}`). Capability gating (view export / cards import) → Tasks 2–3. Frontend export-download + import-mapping dialog + report → Task 4. Injected validator for purity → Task 1 signature + Task 3 wrapper. Row cap → Task 3. Testing → Task 1 + Task 5. All covered. (Field-value humanization intentionally dropped for round-trip safety — documented at top.)
- **Placeholders:** Tasks 1–3 + 5 contain full code. Tasks 2/4 flag two real integration points (batch card-values reader if present; `api.getBlob` token reuse + real cards queryKey) with concrete fallbacks and instruct reading the files.
- **Type consistency:** `ExportColumn`/`CsvField`/`MappedImportRow`/`ImportCtx`/`CardDraft` + `buildExportColumns`/`formatCardForExport`/`resolveImportRow` (Task 1) consumed identically in Tasks 2–3. `resolveImportRow`'s injected validator signature `(field: CsvField, value) => string|null` matches the Task-3 wrapper over `validateFieldValue(type,value,options?,{multiple})`. `createCard({stageId,title,assigneeId,priority}, userId)` + `setCardValues(cardId, {fieldId,value}[])` match the real storage signatures.

## Deploy note
No schema change. Purely additive endpoints + UI. Import is create-only and capped at 2000 rows/request.
