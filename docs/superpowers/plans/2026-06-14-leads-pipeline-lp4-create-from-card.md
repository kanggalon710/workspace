# LP4 — Create Lead from Pipeline Card — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tombol "Buat Lead" di modal detail kartu membuat lead (source of truth di modul Leads) dari data kartu + menautkannya via `lead_card_links`, tanpa memicu intake (anti-loop).

**Architecture:** Reuse `lead_card_links` (LP1) + `createLead`/`createLeadCardLink`. New card-id endpoints (`loadGuardedCard` gating) create the lead with `source="pipeline"` and write the link, WITHOUT `emitLeadEvent`. Client pre-fills a confirm dialog via a pure `detectLeadPrefill` (auto-detect phone/coordinate from card fields by type).

**Tech Stack:** TypeScript, Express 5, Drizzle (MySQL), React 18 + TanStack Query + shadcn/ui, `node:test` via `npx tsx --test`. Spec: `docs/superpowers/specs/2026-06-14-leads-pipeline-lp4-create-from-card-design.md`. Sibling imports use `.js`.

---

## File Structure

| File | Responsibility |
|---|---|
| `shared/leadSources.ts` (modify) + test | Add canonical `"pipeline"` (label "Dari Pipeline"). |
| `shared/cardToLead.ts` (create) + test | Pure `detectLeadPrefill(title, values, fields)`. |
| `server/storage.ts` (modify) | `getLeadCardLinkByCard(cardId)`. |
| `server/routes.ts` (modify) | `GET /api/pipelines/cards/:cardId/lead-link` + `POST /api/pipelines/cards/:cardId/create-lead`. |
| `client/hooks/usePipelines.ts` (modify) | `useCardLeadLink`, `useCreateLeadFromCard`. |
| `client/components/pipelines/CreateLeadFromCardDialog.tsx` (create) | Pre-filled confirm dialog. |
| `client/components/pipelines/CardDetailModal.tsx` (modify) | "Buat Lead" button + "Tertaut ke Lead" badge. |

---

## Task 1: Source registry — add `"pipeline"`

**Files:**
- Modify: `shared/leadSources.ts`
- Modify: `shared/leadSources.test.ts`

- [ ] **Step 1: Extend the test**

In `shared/leadSources.test.ts`, add to the first test (`normalizes known aliases`):
```ts
  assert.equal(canonicalLeadSource("pipeline"), "pipeline");
```
And add a new test:
```ts
test("pipeline source has label", () => {
  assert.equal(LEAD_SOURCE_LABELS["pipeline"], "Dari Pipeline");
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npx tsx --test shared/leadSources.test.ts`
Expected: FAIL (`canonicalLeadSource("pipeline")` → `"other"`; label undefined).

- [ ] **Step 3: Add "pipeline" to the registry**

In `shared/leadSources.ts`:
- Add `"pipeline"` to the `CanonicalLeadSource` union:
```ts
export type CanonicalLeadSource =
  | "canvassing" | "prospect_finder" | "coverage_check"
  | "meta_leads" | "tiktok_leads" | "referral" | "inbound" | "pipeline" | "other";
```
- Add alias entry in `ALIASES`:
```ts
  pipeline: "pipeline",
```
- Add label in `LEAD_SOURCE_LABELS`:
```ts
  pipeline: "Dari Pipeline",
```
(`LEAD_SOURCE_OPTIONS` is derived, so it updates automatically.)

- [ ] **Step 4: Run — expect pass**

Run: `npx tsx --test shared/leadSources.test.ts`
Expected: PASS. Then `npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add shared/leadSources.ts shared/leadSources.test.ts
git commit -m "feat(leads): add 'pipeline' canonical source (LP4 task 1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Pure `detectLeadPrefill` (`shared/cardToLead.ts`)

**Files:**
- Create: `shared/cardToLead.ts`
- Test: `shared/cardToLead.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// shared/cardToLead.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectLeadPrefill } from "./cardToLead.js";

const fields = [
  { id: 10, type: "text" },
  { id: 11, type: "phone" },
  { id: 12, type: "coordinate" },
];

test("name from title; phone from phone field; lat/lng from coordinate field", () => {
  const values = { 10: "abaikan", 11: "08123456", 12: JSON.stringify({ lat: -7.1, lng: 107.9 }) };
  assert.deepEqual(detectLeadPrefill("  Budi Santoso ", values, fields), {
    name: "Budi Santoso", phone: "08123456", lat: -7.1, lng: 107.9,
  });
});

test("missing/empty fields omitted; only name present", () => {
  assert.deepEqual(detectLeadPrefill("Ana", {}, fields), { name: "Ana" });
  assert.deepEqual(detectLeadPrefill("Ana", { 11: "  " }, fields), { name: "Ana" });
});

test("first field of each type wins; bad coordinate JSON ignored", () => {
  const f2 = [{ id: 1, type: "phone" }, { id: 2, type: "phone" }, { id: 3, type: "coordinate" }];
  const values = { 1: "0811", 2: "0822", 3: "not-json" };
  assert.deepEqual(detectLeadPrefill("X", values, f2), { name: "X", phone: "0811" });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npx tsx --test shared/cardToLead.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// shared/cardToLead.ts
/** Pure: derive a lead prefill from a pipeline card (title + custom field values). No I/O.
 *  Auto-detect by field type: first phone-type → phone; first coordinate-type → lat/lng. */
import { parseCoordinate } from "./pipelineFieldTypes.js";

export interface CardFieldMeta { id: number; type: string }
export interface LeadPrefill { name: string; phone?: string; lat?: number; lng?: number }

export function detectLeadPrefill(
  title: string,
  values: Record<number, string>,
  fields: CardFieldMeta[],
): LeadPrefill {
  const out: LeadPrefill = { name: String(title ?? "").trim() };

  const phoneField = fields.find((f) => f.type === "phone");
  if (phoneField) {
    const v = String(values[phoneField.id] ?? "").trim();
    if (v) out.phone = v;
  }

  const coordField = fields.find((f) => f.type === "coordinate");
  if (coordField) {
    const c = parseCoordinate(values[coordField.id]);
    if (c) { out.lat = c.lat; out.lng = c.lng; }
  }

  return out;
}
```

> Verify `parseCoordinate` is exported from `shared/pipelineFieldTypes.ts` with signature `(value: string|null|undefined) => {lat:number;lng:number}|null`. (It is — `shared/pipelineFieldTypes.ts:39`.)

- [ ] **Step 4: Run — expect pass**

Run: `npx tsx --test shared/cardToLead.test.ts`
Expected: PASS (3 tests). Then `npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add shared/cardToLead.ts shared/cardToLead.test.ts
git commit -m "feat(leads): pure detectLeadPrefill card→lead (LP4 task 2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Storage — `getLeadCardLinkByCard`

**Files:**
- Modify: `server/storage.ts` (near `getLeadCardLinks`, added in LP1 ~line 2680)

- [ ] **Step 1: Add the method**

After `getLeadCardLinks` (LP1), add:
```ts
  /** Link untuk satu CARD (tenant-scoped) — null kalau kartu belum tertaut lead. */
  async getLeadCardLinkByCard(cardId: number): Promise<LeadCardLink | null> {
    const mitraId = getMitraId();
    const rows = await this.db.select().from(leadCardLinks)
      .where(and(eq(leadCardLinks.mitraId, mitraId), eq(leadCardLinks.cardId, cardId)));
    return rows[0] ?? null;
  }
```
(`leadCardLinks`, `LeadCardLink`, `getMitraId`, `and`, `eq` already imported from LP1.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` → 0 errors.

- [ ] **Step 3: Commit**

```bash
git add server/storage.ts
git commit -m "feat(leads): getLeadCardLinkByCard (LP4 task 3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Endpoints — lead-link + create-lead

**Files:**
- Modify: `server/routes.ts` (add near other `/api/pipelines/cards/:cardId/*` routes, e.g. after the relations routes ~line 5440)

Background: `loadGuardedCard(req, res, gate)` loads `req.params.cardId`, runs the 404→pipeline-gate→card-access chain, returns the card or null (error already sent). `logAudit(req, action, entityType, entityId, entityName, details?)` is the audit helper used by lead routes. `storage.createLead(data)` returns the Lead row. `storage.createLeadCardLink({leadId, cardId, ruleId})` + `storage.getLeadCardLinkByCard(cardId)` exist.

- [ ] **Step 1: GET lead-link**

Add:
```ts
  router.get("/api/pipelines/cards/:cardId/lead-link", async (req, res) => {
    const card = await loadGuardedCard(req, res, "view");
    if (!card) return;
    const link = await storage.getLeadCardLinkByCard(card.id);
    return sendSuccess(res, { link: link ? { leadId: link.leadId, cardId: link.cardId } : null });
  });
```

- [ ] **Step 2: POST create-lead**

Add:
```ts
  router.post("/api/pipelines/cards/:cardId/create-lead", async (req, res) => {
    const card = await loadGuardedCard(req, res, "cards");
    if (!card) return;
    const b = req.body ?? {};
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (!name) return sendError(res, "Nama wajib diisi", 400);
    if (b.lat != null && Number.isNaN(Number(b.lat))) return sendError(res, "lat tidak valid", 400);
    if (b.lng != null && Number.isNaN(Number(b.lng))) return sendError(res, "lng tidak valid", 400);

    const existing = await storage.getLeadCardLinkByCard(card.id);
    if (existing) return sendError(res, "Kartu ini sudah tertaut ke lead", 409);

    const actor = req.authUser!.id;
    const now = new Date().toISOString();
    const lead = await storage.createLead({
      name,
      phone: typeof b.phone === "string" && b.phone.trim() ? b.phone.trim() : null,
      address: typeof b.address === "string" && b.address.trim() ? b.address.trim() : null,
      category: typeof b.category === "string" && b.category.trim() ? b.category.trim() : null,
      district: typeof b.district === "string" && b.district.trim() ? b.district.trim() : null,
      village: typeof b.village === "string" && b.village.trim() ? b.village.trim() : null,
      lat: b.lat != null ? Number(b.lat) : null,
      lng: b.lng != null ? Number(b.lng) : null,
      source: "pipeline",
      stage: "new",
      priority: "medium",
      createdBy: actor,
      assignedTo: actor,
      assignedBy: actor,
      assignedAt: now,
      createdAt: now,
    } as any);

    await storage.createLeadCardLink({ leadId: lead.id, cardId: card.id, ruleId: null });
    await logAudit(req, "CREATE", "lead", lead.id, lead.name, { fromCardId: card.id });
    // NOTE: intentionally NO emitLeadEvent — the card already exists and is now linked (anti-loop).
    return sendSuccess(res, { lead, link: { leadId: lead.id, cardId: card.id } }, 201);
  });
```

> Verify `createLead`'s `InsertLead` accepts these fields (name/phone/address/category/district/village/lat/lng/source/stage/priority/createdBy/assignedTo/assignedBy/assignedAt/createdAt). The `as any` matches how webhook/coverage callers invoke it. If `logAudit` signature differs (grep `function logAudit`/`const logAudit`), adapt the call to match the existing lead-route usage `logAudit(req, "CREATE", "lead", lead.id, lead.name)`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit` → 0 errors.

- [ ] **Step 4: Commit**

```bash
git add server/routes.ts
git commit -m "feat(leads): create-lead-from-card + lead-link endpoints (LP4 task 4)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Client hooks + api

**Files:**
- Modify: `client/hooks/usePipelines.ts`

Background: this file already defines pipeline hooks using the project's `api` client (`api.get`/`api.post`). Match the existing import + call style (read a couple existing hooks in the file first).

- [ ] **Step 1: Add the two hooks**

Add (matching the file's existing `useQuery`/`useMutation` + `api` conventions):
```ts
export function useCardLeadLink(cardId: number) {
  return useQuery<{ link: { leadId: number; cardId: number } | null }>({
    queryKey: ["card-lead-link", cardId],
    queryFn: () => api.get(`/pipelines/cards/${cardId}/lead-link`),
    enabled: cardId != null,
    retry: 0,
  });
}

export function useCreateLeadFromCard(cardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; phone?: string; address?: string; category?: string; district?: string; village?: string; lat?: number; lng?: number }) =>
      api.post(`/pipelines/cards/${cardId}/create-lead`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["card-lead-link", cardId] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}
```
(Ensure `useQuery`, `useMutation`, `useQueryClient`, `api` are imported in the file — they are, used by existing hooks. If the api base path differs, e.g. it already prefixes `/api`, follow the existing hook calls' exact pathing.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` → 0 errors.

- [ ] **Step 3: Commit**

```bash
git add client/hooks/usePipelines.ts
git commit -m "feat(leads): useCardLeadLink + useCreateLeadFromCard hooks (LP4 task 5)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Dialog + CardDetailModal wiring

**Files:**
- Create: `client/components/pipelines/CreateLeadFromCardDialog.tsx`
- Modify: `client/components/pipelines/CardDetailModal.tsx`

- [ ] **Step 1: Create the dialog**

```tsx
// client/components/pipelines/CreateLeadFromCardDialog.tsx
import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Combobox } from "@/components/ui/combobox";
import { useCreateLeadFromCard } from "@/hooks/usePipelines";
import { detectLeadPrefill } from "@shared/cardToLead";

const CATEGORIES = [
  { value: "rumahan", label: "Rumahan" },
  { value: "bisnis", label: "Bisnis" },
  { value: "perkantoran", label: "Perkantoran" },
  { value: "sekolah", label: "Sekolah" },
  { value: "lainnya", label: "Lainnya" },
];

export function CreateLeadFromCardDialog({
  cardId, title, values, fields, onClose,
}: {
  cardId: number;
  title: string;
  values: Record<number, string>;
  fields: { id: number; type: string }[];
  onClose: () => void;
}) {
  const prefill = detectLeadPrefill(title, values, fields);
  const [name, setName] = useState(prefill.name);
  const [phone, setPhone] = useState(prefill.phone ?? "");
  const [address, setAddress] = useState("");
  const [category, setCategory] = useState("rumahan");
  const [district, setDistrict] = useState("");
  const [village, setVillage] = useState("");
  const create = useCreateLeadFromCard(cardId);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      {
        name: name.trim(),
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        category,
        district: district.trim() || undefined,
        village: village.trim() || undefined,
        lat: prefill.lat, lng: prefill.lng,
      },
      {
        onSuccess: () => { toast.success("Lead dibuat & ditautkan"); onClose(); },
        onError: (err: any) => toast.error(err.message || "Gagal membuat lead"),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Buat Lead dari kartu</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={submit}>
          <FormField label="Nama" htmlFor="lead-name" required>
            <Input id="lead-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama calon pelanggan" />
          </FormField>
          <FormField label="Telepon" htmlFor="lead-phone">
            <Input id="lead-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08…" />
          </FormField>
          <FormField label="Alamat" htmlFor="lead-address">
            <Input id="lead-address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </FormField>
          <FormField label="Kategori" htmlFor="lead-category">
            <Combobox options={CATEGORIES} value={category} onChange={(v) => setCategory(v || "rumahan")} clearable={false} />
          </FormField>
          <div className="grid grid-cols-2 gap-2">
            <FormField label="Kecamatan" htmlFor="lead-district"><Input id="lead-district" value={district} onChange={(e) => setDistrict(e.target.value)} /></FormField>
            <FormField label="Desa/Kelurahan" htmlFor="lead-village"><Input id="lead-village" value={village} onChange={(e) => setVillage(e.target.value)} /></FormField>
          </div>
          {prefill.lat != null && prefill.lng != null && (
            <p className="text-xs text-muted-foreground">Koordinat terdeteksi: {prefill.lat}, {prefill.lng}</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>Batal</Button>
            <Button type="submit" loading={create.isPending} disabled={!name.trim()}>Buat Lead</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

> Verify component import paths against the repo: `@/components/ui/dialog` (Dialog/DialogContent/DialogHeader/DialogTitle), `@/components/ui/form-field` (FormField), `@/components/ui/combobox` (Combobox), `@/components/ui/input`, `@/components/ui/button`. These are the same imports CardDetailModal/PipelineRulesDialog use — copy the exact specifiers from those files if any differ.

- [ ] **Step 2: Wire into CardDetailModal**

In `client/components/pipelines/CardDetailModal.tsx`:
- Add imports:
```ts
import { useCardLeadLink } from "@/hooks/usePipelines";
import { CreateLeadFromCardDialog } from "./CreateLeadFromCardDialog";
```
- Inside the component (after `const cf = useCardFields(...)`), add:
```ts
  const { data: leadLink } = useCardLeadLink(cardId);
  const [showCreateLead, setShowCreateLead] = useState(false);
```
(`useState` is already imported in the modal.)
- In the JSX, near the card metadata/header area (a sensible spot is alongside the description or in the left/meta column — place it after the description block, before `<CardRelations>`), add a lead-link row:
```tsx
              <div className="flex items-center gap-2 pt-1">
                {leadLink?.link ? (
                  <a href="/leads" className="inline-flex items-center gap-1 text-xs text-primary underline">
                    Tertaut ke Lead #{leadLink.link.leadId}
                  </a>
                ) : writable ? (
                  <Button type="button" variant="outline-primary" size="xs" onClick={() => setShowCreateLead(true)}>
                    Buat Lead
                  </Button>
                ) : null}
              </div>
```
- Render the dialog (near the modal's other conditional dialogs, inside the component's returned tree but it can be a sibling at the end):
```tsx
      {showCreateLead && card && (
        <CreateLeadFromCardDialog
          cardId={cardId}
          title={card.title}
          values={card.values}
          fields={card.fields.map((f) => ({ id: f.id, type: f.type }))}
          onClose={() => setShowCreateLead(false)}
        />
      )}
```
(`card.values` is `Record<number,string>`; `card.fields` are the field metas with `id`+`type` — confirm property names by reading the `CardDetail` type / `useCardFields` usage at the top of the file, which references `card.values` and `card.fields`.)

- [ ] **Step 3: Build + typecheck**

Run: `npx tsc --noEmit && npm run build`
Expected: 0 errors, build success.

- [ ] **Step 4: Commit**

```bash
git add client/components/pipelines/CreateLeadFromCardDialog.tsx client/components/pipelines/CardDetailModal.tsx
git commit -m "feat(leads): Buat Lead button + dialog in card detail modal (LP4 task 6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Final verification + memory

- [ ] **Step 1: Lead tests**

Run: `npx tsx --test shared/leadSources.test.ts shared/cardToLead.test.ts shared/leadIntake.test.ts shared/leadConditions.test.ts`
Expected: all PASS.

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit` → 0 errors. `npm run build` → success.

- [ ] **Step 3: Full regression**

Run: `npx tsx --test shared/*.test.ts server/*.test.ts client/**/*.test.ts`
Expected: all PASS (≥ prior count).

- [ ] **Step 4: Smoke (optional, local DB)**

Buka kartu di /pipelines → "Buat Lead" → dialog pre-filled (nama=judul; phone/koordinat terisi bila field ada) → simpan → cek lead muncul di /leads (sumber "Dari Pipeline") + kartu kini badge "Tertaut ke Lead #N". Klik "Buat Lead" lagi → tak muncul (badge gantinya); panggil endpoint kedua kali → 409.

- [ ] **Step 5: Update memory**

Update `memory/project-leads-pipeline-integration.md`: LP4 DONE on dev (belum push) — reverse create-lead-from-card, source "pipeline", lead_card_links reuse, no-emit anti-loop, detectLeadPrefill, badge. LP4b (template) berikutnya bila diminta.

---

## Self-Review (penulis plan — sudah dijalankan)

**Spec coverage:** §source "pipeline"→T1; §detectLeadPrefill→T2; §getLeadCardLinkByCard→T3; §endpoints (lead-link + create-lead, 409 guard, no-emit, audit, tenant via loadGuardedCard)→T4; §hooks→T5; §dialog + modal button/badge→T6; §tenant/audit/loop-safe→T4 by construction; §testing→T1/T2/T7. AC1-7 covered.

**Placeholder scan:** no TBD/TODO; full code in every code step. "Verify X" notes are defensive signature checks with the expected value stated, not placeholders.

**Type consistency:** `detectLeadPrefill(title, values, fields)`→`LeadPrefill{name,phone?,lat?,lng?}` consistent T2/T6. `getLeadCardLinkByCard(cardId)`→`LeadCardLink|null` T3 used in T4. Endpoint paths `/pipelines/cards/:cardId/lead-link` + `/create-lead` consistent T4/T5. Hook names `useCardLeadLink`/`useCreateLeadFromCard` consistent T5/T6. `source:"pipeline"` consistent T1/T4. Body shape (name/phone/address/category/district/village/lat/lng) consistent T4/T5/T6.
