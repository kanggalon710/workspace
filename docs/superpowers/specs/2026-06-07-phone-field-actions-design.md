# Spec — Phone Field Call/WhatsApp Actions (Slice C)

> Date: 2026-06-07 · Status: **Approved (pending user spec review)** · Target: dev branch
> Part of the Pipelines Engine program — see [[project-pipelines-engine]]. **Slice C** of the Pipeline/Kanban
> Enhancement PRD (PRD item **#4**). Pure display enhancement — no backend, schema, or migration.

## Context

The pipelines engine has a `phone` custom field type (rendered as `<Input type="tel">` in
`client/components/pipelines/FieldValueInput.tsx`, used only by the card-detail drawer's
`FieldCustomSection`). PRD #4 asks that every phone-type field value gain **Call** (`tel:`) and **WhatsApp**
(`wa.me`) action buttons, e.g.:

```
Nomor PIC
08123456789
[ Telepon ]  [ WhatsApp ]
```

A tenant may create many phone fields (Nomor Utama, PIC, Teknisi, …) with no limit — each must get its own
buttons. The codebase already normalizes Indonesian numbers to the `62…` WhatsApp form in
`server/mpwa-client.ts:normalizePhone` (strip spaces/dashes/parens/`+`; leading `0`→`62`; bare `8…`→`62`);
this slice reuses that exact convention in a shared helper so the client and tests can use it too.

Per the brainstorm decision, action buttons appear in the **card-detail drawer only** (where you act on a
contact); board card chips keep showing just the number (compact).

## Goals / Non-goals

**Goals**
1. Each phone-type field value in the card-detail drawer shows **Telepon** (`tel:`) and **WhatsApp**
   (`https://wa.me/<intl>?text=Halo`) actions.
2. Works for any number of phone fields on a card (one set of buttons per field).
3. WhatsApp number conversion matches the existing `normalizePhone` convention.

**Non-goals (deferred)**
- Action buttons on board card chips (chips stay number-only).
- A configurable WhatsApp greeting (fixed "Halo" for now) or per-field message templates.
- Click-to-call/log integration, MPWA send-from-app, or analytics on taps.
- Changing the phone storage format or adding validation beyond what exists.

## Coding standards
Per [[feedback-coding-standards]]: semantic HTML5 (the actions are `<a href="tel:…">` / `<a href="https://wa.me/…">`,
not `<button>`), DRY (one shared phone helper reused by client + tests; mirrors the server convention),
component/SoC (a focused `PhoneActions` component), pure testable module. Reuse design-system button styling +
Lucide icons.

## Design

### 1. Shared pure helper — `shared/phone.ts` (new)

React-free, DB-free; unit-tested. Mirrors `server/mpwa-client.ts:normalizePhone`:

```ts
/** Indonesian-aware international digits for wa.me (mirrors server normalizePhone). "" if no digits. */
export function toWhatsappNumber(raw: string): string {
  if (!raw) return "";
  let p = String(raw).trim().replace(/[\s\-()+]/g, "");
  if (p.startsWith("0")) p = "62" + p.slice(1);
  else if (/^8\d+/.test(p)) p = "62" + p;
  return /^\d+$/.test(p) ? p : "";
}

/** tel: href — keeps leading + and digits, strips spacing. "" if no dialable chars. */
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

(Note: this slice does NOT refactor the server's `normalizePhone` to import from here — out of scope; the
shared helper simply re-states the same small convention. A future cleanup could unify them.)

### 2. `PhoneActions` component (new) — `client/components/pipelines/PhoneActions.tsx`

Focused, presentational. Given a raw number, renders two link-buttons (only when the corresponding href is
non-empty):

```
<a href={telHref(value)}>            → "Telepon"  (Phone icon)
<a href={whatsappHref(value)} target="_blank" rel="noreferrer">  → "WhatsApp" (MessageCircle icon)
```

Links (not buttons) so the browser handles `tel:`/`https:` natively. Styled with the design-system button
classes (small, outline/ghost). Renders nothing if both hrefs are empty.

### 3. Wire into `FieldValueInput` phone case

In `client/components/pipelines/FieldValueInput.tsx`, the `case "phone":` currently returns just the
`<Input type="tel">`. Wrap it so the input and the actions stack vertically, and render `PhoneActions` only
when the value is non-empty:

```tsx
    case "phone":
      return (
        <div className="space-y-1.5">
          <Input type="tel" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
          {value.trim() !== "" && <PhoneActions value={value} />}
        </div>
      );
```

This renders inside the drawer's `FieldCustomSection`, once per phone field — so multiple phone fields each
get their own buttons. Works in read-only mode too (disabled input, actions still tappable).

## Files

| File | Change |
|---|---|
| `shared/phone.ts` | **New.** `toWhatsappNumber`, `telHref`, `whatsappHref`. |
| `shared/phone.test.ts` | **New.** node:test for the three helpers. |
| `client/components/pipelines/PhoneActions.tsx` | **New.** Telepon + WhatsApp link-buttons. |
| `client/components/pipelines/FieldValueInput.tsx` | Phone case renders input + `PhoneActions`. |

## Testing

- **Pure (`npx tsx --test shared/phone.test.ts`):**
  - `toWhatsappNumber`: `"08123456789"`→`"628123456789"`; `"628…"`→unchanged; `"8123…"`→`"628123…"`;
    `"+62 812-345-678"`→(strip `+`/spaces/dashes, already starts `62`)→`"62812345678"`; `""`→`""`; `"abc"`→`""`.
  - `telHref`: `"08123456789"`→`"tel:08123456789"`; `"+62 812 345"`→`"tel:+62812345"`; `""`→`""`.
  - `whatsappHref`: includes the normalized number + `?text=Halo` (URL-encoded); `""` when not normalizable.
- **Gates:** `npm run typecheck` = 0; `npm run build` green.
- **Manual (dev "Leads (Marketing)", which has a phone field):** open a card with a phone value → Telepon +
  WhatsApp buttons appear; WhatsApp opens `https://wa.me/62…?text=Halo`; an empty phone field shows no buttons;
  a second phone field gets its own buttons.

## Multi-tenant / RBAC
No change — purely client-side display over already-authorized card data; no new endpoints or storage.

## Risks
1. **Number formats vary** — the helper handles the common Indonesian cases (0…, 62…, 8…, with spacing/dashes);
   a malformed value yields no WhatsApp link (button hidden) rather than a broken link. Acceptable.
2. **Divergence from server `normalizePhone`** — re-stated, not imported, to avoid a client→server import; the
   conventions are identical and both are covered by tests. Noted for a future unify.

## Acceptance criteria
- Every phone-type field with a value shows Telepon (`tel:`) + WhatsApp (`wa.me/<intl>?text=Halo`) actions in
  the card detail; empty phone fields show none; multiple phone fields each get their own.
- WhatsApp number matches the `normalizePhone` convention (08→62).
- No backend/schema/migration; typecheck 0, build green, pure helper tests pass.
