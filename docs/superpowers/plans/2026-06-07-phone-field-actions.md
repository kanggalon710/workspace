# Phone Field Call/WhatsApp Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Call (`tel:`) and WhatsApp (`wa.me`) action links under each phone-type field value in the pipeline card-detail drawer.

**Architecture:** A new pure `shared/phone.ts` derives `tel:`/`wa.me` hrefs (reusing the existing Indonesian 08→62 convention); a focused `PhoneActions` component renders the two semantic `<a>` links; the `phone` case of `FieldValueInput` renders the input plus the actions when a value is present. No backend, schema, or migration.

**Tech Stack:** TypeScript, React 18, Lucide icons, `node:test` via `npx tsx --test`. Spec: `docs/superpowers/specs/2026-06-07-phone-field-actions-design.md`.

**Coding standards:** semantic HTML5 (actions are `<a href="tel:…">`/`<a href="https://wa.me/…">`, not `<button>`), DRY (one shared helper), SoC (focused `PhoneActions`), pure testable module. Client imports use `@shared/...` & `@/...`; tests use `./....js`.

---

## Task 1: Pure phone helpers (`shared/phone.ts`) — TDD

**Files:**
- Create: `shared/phone.ts`
- Test: `shared/phone.test.ts`

- [ ] **Step 1: Write the failing test**

Create `shared/phone.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { toWhatsappNumber, telHref, whatsappHref } from "./phone.js";

test("toWhatsappNumber normalizes Indonesian formats", () => {
  assert.equal(toWhatsappNumber("08123456789"), "628123456789");
  assert.equal(toWhatsappNumber("628123456789"), "628123456789");
  assert.equal(toWhatsappNumber("8123456789"), "628123456789");
  assert.equal(toWhatsappNumber("+62 812-345-678"), "62812345678");
  assert.equal(toWhatsappNumber(""), "");
  assert.equal(toWhatsappNumber("abc"), "");
});

test("telHref keeps + and digits, strips spacing; empty when no dialable chars", () => {
  assert.equal(telHref("08123456789"), "tel:08123456789");
  assert.equal(telHref("+62 812 345"), "tel:+62812345");
  assert.equal(telHref(""), "");
  assert.equal(telHref("abc"), "");
});

test("whatsappHref builds wa.me link with encoded greeting; empty when not normalizable", () => {
  assert.equal(whatsappHref("08123456789"), "https://wa.me/628123456789?text=Halo");
  assert.equal(whatsappHref("08123456789", "Halo kak"), "https://wa.me/628123456789?text=Halo%20kak");
  assert.equal(whatsappHref("abc"), "");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test shared/phone.test.ts`
Expected: FAIL — `Cannot find module './phone.js'`.

- [ ] **Step 3: Implement `shared/phone.ts`**

Create `shared/phone.ts`:

```ts
/** Pure phone helpers for tel:/wa.me links. No React, no DB. Mirrors server normalizePhone (08->62). */

/** Indonesian-aware international digits for wa.me. Returns "" if there are no usable digits. */
export function toWhatsappNumber(raw: string): string {
  if (!raw) return "";
  let p = String(raw).trim().replace(/[\s\-()+]/g, "");
  if (p.startsWith("0")) p = "62" + p.slice(1);
  else if (/^8\d+/.test(p)) p = "62" + p;
  return /^\d+$/.test(p) ? p : "";
}

/** tel: href — keeps a leading + and digits, strips spacing/dashes/parens. "" if no dialable chars. */
export function telHref(raw: string): string {
  const cleaned = String(raw ?? "").replace(/[\s\-()]/g, "");
  return /[+\d]/.test(cleaned) ? `tel:${cleaned}` : "";
}

/** wa.me link with a prefilled greeting. "" if the number can't be normalized. */
export function whatsappHref(raw: string, text = "Halo"): string {
  const n = toWhatsappNumber(raw);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : "";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test shared/phone.test.ts`
Expected: PASS (all 3 tests).

- [ ] **Step 5: Commit**

```bash
git add shared/phone.ts shared/phone.test.ts
git commit -m "feat(pipelines): pure phone helpers for tel/whatsapp links

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `PhoneActions` component + wire into `FieldValueInput`

**Files:**
- Create: `client/components/pipelines/PhoneActions.tsx`
- Modify: `client/components/pipelines/FieldValueInput.tsx`

- [ ] **Step 1: Create `PhoneActions`**

Create `client/components/pipelines/PhoneActions.tsx`:

```tsx
import { Phone, MessageCircle } from "lucide-react";
import { telHref, whatsappHref } from "@shared/phone";
import { cn } from "@/lib/utils";

const linkCls = "inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs font-medium hover:bg-muted/50 transition-colors";

export function PhoneActions({ value }: { value: string }) {
  const tel = telHref(value);
  const wa = whatsappHref(value);
  if (!tel && !wa) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tel && (
        <a href={tel} className={cn(linkCls, "text-primary")}>
          <Phone className="size-3.5" /> Telepon
        </a>
      )}
      {wa && (
        <a href={wa} target="_blank" rel="noreferrer" className={cn(linkCls, "text-success")}>
          <MessageCircle className="size-3.5" /> WhatsApp
        </a>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire into the `phone` case of `FieldValueInput`**

In `client/components/pipelines/FieldValueInput.tsx`, add the import at the top:

```tsx
import { PhoneActions } from "@/components/pipelines/PhoneActions";
```

The `case "phone":` currently is:

```tsx
    case "phone":
      return (
        <Input
          type="tel"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      );
```

Replace it with (input + actions stacked; actions only when the value is non-empty):

```tsx
    case "phone":
      return (
        <div className="space-y-1.5">
          <Input
            type="tel"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          />
          {value.trim() !== "" && <PhoneActions value={value} />}
        </div>
      );
```

- [ ] **Step 3: Verify typecheck + build**

Run: `npm run typecheck`
Expected: 0 errors.
Run: `npm run build`
Expected: build succeeds (Vite client + esbuild server bundle).

- [ ] **Step 4: Commit**

```bash
git add client/components/pipelines/PhoneActions.tsx client/components/pipelines/FieldValueInput.tsx
git commit -m "feat(pipelines): Call/WhatsApp action buttons on phone fields (card detail)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Pure tests**

Run: `npx tsx --test shared/phone.test.ts`
Expected: all PASS.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Manual checklist (record results)**

On the dev "Leads (Marketing)" pipeline (it has a phone field):
- Open a card whose phone field has a value → **Telepon** + **WhatsApp** buttons appear under the input. ✅
- WhatsApp link points to `https://wa.me/62…?text=Halo` (8/0/62 inputs all normalize to `62…`). ✅
- An empty phone field shows no buttons. ✅
- A card with two phone fields shows a button pair under each. ✅
- Read-only (non-edit) card: input disabled but buttons still tappable. ✅

- [ ] **Step 5: Final commit (only if the manual pass required a fixup; otherwise skip)**

```bash
git add -A
git commit -m "chore(pipelines): phone actions verification fixups

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes (author)

- **Spec coverage:** `shared/phone.ts` helpers → Task 1; `PhoneActions` + phone-case wiring (card detail only, per-field, read-only safe) → Task 2; verification → Task 3. WhatsApp 08→62 convention + fixed "Halo" greeting honored. No backend/schema/migration (matches spec). Board chips intentionally unchanged.
- **Type consistency:** `toWhatsappNumber`/`telHref`/`whatsappHref`/`PhoneActions` names used identically across tasks; `PhoneActions` takes `{ value: string }`.
- **No placeholders.**
