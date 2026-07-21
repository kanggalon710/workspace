# Coordinate Field Type + Location Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a singleton `coordinate` field type (lat/lng with a Google-Maps picker) whose filled value surfaces Wilayah (Kecamatan/Kabupaten/Provinsi) and the nearest ODP in the card detail.

**Architecture:** A pure `parseCoordinate` helper + registry entry (`singleton:true`) drive a new `CoordinateInput` (manual + map picker + GPS) and a `CoordinateInfo` panel that reuses the existing `reverseGeocode` helper and `POST /api/coverage-check` endpoint via cached react-query hooks. Value stored as `{"lat":…,"lng":…}` JSON in the existing card-values table - no DB migration.

**Tech Stack:** TypeScript, React 18, `@react-google-maps/api` (existing dep), TanStack Query, `node:test` via `npx tsx --test`. Spec: `docs/superpowers/specs/2026-06-07-coordinate-field-design.md`. Builds on slice A registry/singleton.

**Coding standards:** semantic HTML5 (`<label htmlFor>`, `<button type="button">`), DRY (`parseCoordinate` reused by input/validation/chip/info; reuse `reverseGeocode`/`coverage-check`/`useGoogleMaps`), SoC (focused `CoordinateInput`/`CoordinateInfo`/hooks), pure testable helpers. Client imports `@shared/...`/`@/...`; server `../shared/....js`; tests `./....js`.

---

## Task 1: `coordinate` type + registry + `parseCoordinate` (TDD)

**Files:**
- Modify: `shared/schema.ts`
- Modify: `shared/pipelineFieldTypes.ts`
- Modify: `shared/pipelineFieldTypes.test.ts`

- [ ] **Step 1: Write the failing tests**

In `shared/pipelineFieldTypes.test.ts`, add `parseCoordinate` to the existing destructured import from `./pipelineFieldTypes.js`, then append:

```ts
test("coordinate registry entry exists and is singleton", () => {
  const meta = PIPELINE_FIELD_TYPE_REGISTRY.coordinate;
  assert.ok(meta, "coordinate entry missing");
  assert.equal(meta.singleton, true);
  assert.equal(meta.label, "Koordinat");
});

test("parseCoordinate: valid object, out-of-range/garbage/empty → null", () => {
  assert.deepEqual(parseCoordinate(JSON.stringify({ lat: -6.12, lng: 106.81 })), { lat: -6.12, lng: 106.81 });
  assert.equal(parseCoordinate(JSON.stringify({ lat: 91, lng: 0 })), null);   // lat out of range
  assert.equal(parseCoordinate(JSON.stringify({ lat: 0, lng: 181 })), null);  // lng out of range
  assert.equal(parseCoordinate(JSON.stringify({ lat: "x", lng: 1 })), null);  // non-numeric
  assert.equal(parseCoordinate("not json"), null);
  assert.equal(parseCoordinate(""), null);
  assert.equal(parseCoordinate(null), null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx --test shared/pipelineFieldTypes.test.ts`
Expected: FAIL - `parseCoordinate` not exported; no `coordinate` registry entry.

- [ ] **Step 3: Add the type to the schema union/array**

In `shared/schema.ts`, find `export type PipelineFieldType =` and add `"coordinate"`, and add it to the `PIPELINE_FIELD_TYPES` array. The two declarations currently are:

```ts
export type PipelineFieldType =
 | "text" | "textarea" | "number" | "currency" | "date"
 | "dropdown" | "multiselect" | "checkbox" | "user" | "phone" | "url";
export const PIPELINE_FIELD_TYPES: PipelineFieldType[] =
  ["text","textarea","number","currency","date","dropdown","multiselect","checkbox","user","phone","url"];
```

Change them to:

```ts
export type PipelineFieldType =
 | "text" | "textarea" | "number" | "currency" | "date"
 | "dropdown" | "multiselect" | "checkbox" | "user" | "phone" | "url" | "coordinate";
export const PIPELINE_FIELD_TYPES: PipelineFieldType[] =
  ["text","textarea","number","currency","date","dropdown","multiselect","checkbox","user","phone","url","coordinate"];
```

- [ ] **Step 4: Add the registry entry + `parseCoordinate`**

In `shared/pipelineFieldTypes.ts`, add the `coordinate` entry to `PIPELINE_FIELD_TYPE_REGISTRY` (after the `url` entry):

```ts
  coordinate:  { type: "coordinate",  label: "Koordinat",      description: "Lokasi (lat/lng) + peta",    group: "special", hasOptions: false, singleton: true,  searchable: false, filterable: false, sortable: false },
```

And add the pure helper (after `getFieldTypeMeta`):

```ts
/** Parse a coordinate field value (`{"lat":n,"lng":n}`). Returns null if missing/garbage/out-of-range. */
export function parseCoordinate(value: string | null | undefined): { lat: number; lng: number } | null {
  if (!value) return null;
  try {
    const o = JSON.parse(value);
    if (!o || typeof o !== "object") return null;
    const lat = Number((o as any).lat);
    const lng = Number((o as any).lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx tsx --test shared/pipelineFieldTypes.test.ts`
Expected: PASS (incl. prior tests; the slice-A `canAddType` loop now also exercises the new singleton type).

- [ ] **Step 6: Commit**

```bash
git add shared/schema.ts shared/pipelineFieldTypes.ts shared/pipelineFieldTypes.test.ts
git commit -m "feat(pipelines): coordinate field type (singleton) + parseCoordinate helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Coordinate validation (TDD)

**Files:**
- Modify: `server/pipeline-field-helpers.ts`
- Modify: `server/pipeline-field-helpers.test.ts`

- [ ] **Step 1: Write the failing test**

In `server/pipeline-field-helpers.test.ts`, append:

```ts
test("coordinate: valid {lat,lng} ok; out-of-range/garbage fail; empty ok", () => {
  assert.equal(validateFieldValue("coordinate", JSON.stringify({ lat: -6.1, lng: 106.8 })).ok, true);
  assert.equal(validateFieldValue("coordinate", JSON.stringify({ lat: 91, lng: 0 })).ok, false);
  assert.equal(validateFieldValue("coordinate", "not json").ok, false);
  assert.equal(validateFieldValue("coordinate", "").ok, true); // soft-required
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx --test server/pipeline-field-helpers.test.ts`
Expected: FAIL - coordinate falls through to the default (length) case, so the out-of-range/garbage assertions fail.

- [ ] **Step 3: Implement the validation branch**

In `server/pipeline-field-helpers.ts`, add the import at the top of the file:

```ts
import { parseCoordinate } from "../shared/pipelineFieldTypes.js";
```

Then add a `case "coordinate":` to the `switch (type)` in `validateFieldValue` (place it before the `case "text": ... default:` block):

```ts
    case "coordinate":
      return parseCoordinate(value) ? { ok: true } : { ok: false, error: "Koordinat tidak valid" };
```

(The empty-value early-return at the top of `validateFieldValue` already allows `""`.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsx --test server/pipeline-field-helpers.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add server/pipeline-field-helpers.ts server/pipeline-field-helpers.test.ts
git commit -m "feat(pipelines): validate coordinate field value

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `CoordinateInput` (map picker + manual + GPS) + wire into `FieldValueInput`

**Files:**
- Create: `client/components/pipelines/CoordinateInput.tsx`
- Modify: `client/components/pipelines/FieldValueInput.tsx`

- [ ] **Step 1: Create `CoordinateInput`**

Create `client/components/pipelines/CoordinateInput.tsx`:

```tsx
import { useEffect, useState } from "react";
import { GoogleMap, Marker } from "@react-google-maps/api";
import { useGoogleMaps } from "@/context/GoogleMapsContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField, FormRow } from "@/components/ui/form-field";
import { parseCoordinate } from "@shared/pipelineFieldTypes";
import { Crosshair } from "lucide-react";
import { toast } from "sonner";

const GARUT_CENTER = { lat: -7.22, lng: 107.9 };

export function CoordinateInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const { isLoaded } = useGoogleMaps();
  const coord = parseCoordinate(value);
  const [latStr, setLatStr] = useState(coord ? String(coord.lat) : "");
  const [lngStr, setLngStr] = useState(coord ? String(coord.lng) : "");
  const [gps, setGps] = useState(false);

  // Keep the manual inputs in sync when value changes from the map / GPS / external edits.
  useEffect(() => {
    const c = parseCoordinate(value);
    setLatStr(c ? String(c.lat) : "");
    setLngStr(c ? String(c.lng) : "");
  }, [value]);

  const setLatLng = (lat: number, lng: number) => onChange(JSON.stringify({ lat, lng }));

  const emitFromInputs = (latS: string, lngS: string) => {
    if (latS.trim() === "" && lngS.trim() === "") { onChange(""); return; }
    const lat = parseFloat(latS);
    const lng = parseFloat(lngS);
    if (Number.isFinite(lat) && Number.isFinite(lng)) onChange(JSON.stringify({ lat, lng }));
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) { toast.error("Browser tidak mendukung GPS"); return; }
    setGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGps(false); setLatLng(pos.coords.latitude, pos.coords.longitude); },
      () => { setGps(false); toast.error("Gagal mendapatkan lokasi"); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <div className="space-y-2">
      <FormRow cols={2}>
        <FormField label="Latitude" htmlFor="coord-lat">
          <Input
            id="coord-lat"
            type="number"
            step="any"
            value={latStr}
            disabled={disabled}
            placeholder="-7.22"
            onChange={(e) => { setLatStr(e.target.value); emitFromInputs(e.target.value, lngStr); }}
          />
        </FormField>
        <FormField label="Longitude" htmlFor="coord-lng">
          <Input
            id="coord-lng"
            type="number"
            step="any"
            value={lngStr}
            disabled={disabled}
            placeholder="107.90"
            onChange={(e) => { setLngStr(e.target.value); emitFromInputs(latStr, e.target.value); }}
          />
        </FormField>
      </FormRow>

      {!disabled && (
        <Button type="button" variant="outline" size="sm" loading={gps} leftIcon={<Crosshair className="size-3.5" />} onClick={useMyLocation}>
          Gunakan lokasi saya
        </Button>
      )}

      {isLoaded && (
        <div className="h-56 w-full overflow-hidden rounded-md border border-border/60">
          <GoogleMap
            mapContainerClassName="h-full w-full"
            center={coord ?? GARUT_CENTER}
            zoom={coord ? 16 : 12}
            onClick={disabled ? undefined : (e) => { if (e.latLng) setLatLng(e.latLng.lat(), e.latLng.lng()); }}
            options={{
              fullscreenControl: false,
              streetViewControl: false,
              mapTypeControl: false,
              clickableIcons: false,
              draggableCursor: disabled ? undefined : "crosshair",
            }}
          >
            {coord && (
              <Marker
                position={coord}
                draggable={!disabled}
                onDragEnd={disabled ? undefined : (e) => { if (e.latLng) setLatLng(e.latLng.lat(), e.latLng.lng()); }}
              />
            )}
          </GoogleMap>
        </div>
      )}
    </div>
  );
}
```

(Static `id="coord-lat"/"coord-lng"` is safe: `coordinate` is singleton, so at most one `CoordinateInput` mounts per drawer. `GoogleMap`/`Marker` are from the already-installed `@react-google-maps/api`; `useGoogleMaps` provides `isLoaded`. `FormField`/`FormRow`/`Button`/`Input` are existing design-system components; `Button` supports `loading`+`leftIcon`.)

- [ ] **Step 2: Wire into `FieldValueInput`**

In `client/components/pipelines/FieldValueInput.tsx`, add the import:

```tsx
import { CoordinateInput } from "@/components/pipelines/CoordinateInput";
```

Add a `case "coordinate":` to the `switch (field.type)` (e.g. right after the `case "url":` block):

```tsx
    case "coordinate":
      return <CoordinateInput value={value} disabled={disabled} onChange={onChange} />;
```

- [ ] **Step 3: Verify typecheck + build**

Run: `npm run typecheck`
Expected: 0 errors.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add client/components/pipelines/CoordinateInput.tsx client/components/pipelines/FieldValueInput.tsx
git commit -m "feat(pipelines): coordinate field input (manual + map picker + GPS)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Location-intel hooks + `CoordinateInfo` + drawer wiring

**Files:**
- Create: `client/hooks/useGeoIntel.ts`
- Create: `client/components/pipelines/CoordinateInfo.tsx`
- Modify: `client/components/pipelines/CardDetailDrawer.tsx`

- [ ] **Step 1: Create the fetch hooks**

Create `client/hooks/useGeoIntel.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { reverseGeocode } from "@/lib/geocode";
import { api } from "@/lib/api";

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

export function useReverseGeocode(lat: number, lng: number) {
  return useQuery({
    queryKey: ["geo", "rev", round5(lat), round5(lng)],
    queryFn: () => reverseGeocode(lat, lng),
    enabled: Number.isFinite(lat) && Number.isFinite(lng),
    staleTime: Infinity,
  });
}

export type NearestOdp = {
  id: number; name: string; code: string;
  distanceMeters: number; status: string | null;
  availablePorts: number; inCoverage: boolean;
};

export function useNearestOdp(lat: number, lng: number) {
  return useQuery({
    queryKey: ["geo", "odp", round5(lat), round5(lng)],
    queryFn: async (): Promise<NearestOdp | null> => {
      const res = await api.post<{ nearestOdps: NearestOdp[]; recommended: NearestOdp | null }>(
        "/coverage-check",
        { lat, lng },
      );
      return res.recommended ?? res.nearestOdps?.[0] ?? null;
    },
    enabled: Number.isFinite(lat) && Number.isFinite(lng),
    staleTime: Infinity,
  });
}
```

(`reverseGeocode` returns `{ district, village, city, province, formatted }`. `POST /api/coverage-check` returns `{ nearestOdps, recommended, verdict, coverageRadiusMeters }`; `api.post` unwraps the success envelope to the data object - same as `CoverageCheckPage`.)

- [ ] **Step 2: Create `CoordinateInfo`**

Create `client/components/pipelines/CoordinateInfo.tsx`:

```tsx
import { MapPin, Navigation } from "lucide-react";
import { useReverseGeocode, useNearestOdp } from "@/hooks/useGeoIntel";

function distanceLabel(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m} m`;
}

export function CoordinateInfo({ lat, lng }: { lat: number; lng: number }) {
  const geoQ = useReverseGeocode(lat, lng);
  const odpQ = useNearestOdp(lat, lng);
  const geo = geoQ.data;
  const odp = odpQ.data;

  return (
    <div className="mt-2 space-y-2 rounded-md border border-border/50 bg-muted/20 p-2.5 text-xs">
      <div>
        <div className="mb-1 flex items-center gap-1 font-semibold text-muted-foreground">
          <MapPin className="size-3.5" /> Wilayah
        </div>
        {geoQ.isLoading ? (
          <div className="h-3 w-32 animate-pulse rounded bg-muted" />
        ) : geo ? (
          <ul className="space-y-0.5">
            {geo.district && <li>Kecamatan: {geo.district}</li>}
            {geo.village && <li>Desa/Kelurahan: {geo.village}</li>}
            {geo.city && <li>Kabupaten/Kota: {geo.city}</li>}
            {geo.province && <li>Provinsi: {geo.province}</li>}
            {geo.formatted && <li className="text-muted-foreground">{geo.formatted}</li>}
          </ul>
        ) : (
          <div className="text-muted-foreground">Info wilayah tak tersedia</div>
        )}
      </div>
      <div>
        <div className="mb-1 flex items-center gap-1 font-semibold text-muted-foreground">
          <Navigation className="size-3.5" /> ODP terdekat
        </div>
        {odpQ.isLoading ? (
          <div className="h-3 w-40 animate-pulse rounded bg-muted" />
        ) : odp ? (
          <div className="space-y-0.5">
            <div className="font-medium">
              {odp.name} <span className="text-muted-foreground">({odp.code})</span>
            </div>
            <div>Jarak: {distanceLabel(odp.distanceMeters)}</div>
            <div>Status: {odp.status ?? "-"} · Port tersedia: {odp.availablePorts}</div>
            <div className={odp.inCoverage ? "text-success" : "text-warning"}>
              {odp.inCoverage ? "Dalam coverage" : "Di luar radius coverage"}
            </div>
          </div>
        ) : (
          <div className="text-muted-foreground">Tidak ada data ODP</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Render `CoordinateInfo` in the drawer**

In `client/components/pipelines/CardDetailDrawer.tsx`, add imports:

```tsx
import { parseCoordinate } from "@shared/pipelineFieldTypes";
import { CoordinateInfo } from "@/components/pipelines/CoordinateInfo";
```

In `FieldCustomSection`, the per-field render currently is:

```tsx
              <FieldValueInput field={f} value={v} disabled={!writable} onChange={(nv) => setDraft((d) => ({ ...d, [f.id]: nv }))} />
```

Add the info panel right after it, inside the same `<div key={f.id}>`:

```tsx
              <FieldValueInput field={f} value={v} disabled={!writable} onChange={(nv) => setDraft((d) => ({ ...d, [f.id]: nv }))} />
              {f.type === "coordinate" && (() => {
                const c = parseCoordinate(v);
                return c ? <CoordinateInfo lat={c.lat} lng={c.lng} /> : null;
              })()}
```

(Driven by the draft value `v`, so the panel updates as the coordinate is edited; the hooks are cached per rounded coordinate so edits within the same point don't refetch.)

- [ ] **Step 4: Verify typecheck + build**

Run: `npm run typecheck`
Expected: 0 errors.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add client/hooks/useGeoIntel.ts client/components/pipelines/CoordinateInfo.tsx client/components/pipelines/CardDetailDrawer.tsx
git commit -m "feat(pipelines): coordinate location intel (wilayah + nearest ODP) in card detail

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Board chip for coordinate

**Files:**
- Modify: `client/components/pipelines/BoardCard.tsx`

- [ ] **Step 1: Render a ` lat,lng` chip**

In `client/components/pipelines/BoardCard.tsx`, add the import:

```tsx
import { parseCoordinate } from "@shared/pipelineFieldTypes";
```

In the `fieldText(f, raw)` function, add a `coordinate` branch before the final `return String(raw);`:

```tsx
  if (f.type === "coordinate") {
    const c = parseCoordinate(raw);
    return c ? ` ${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}` : String(raw);
  }
```

(`fieldText` is already used by the chip block; coordinate chips only show when the field is `showOnCard`, same as other types.)

- [ ] **Step 2: Verify typecheck + build**

Run: `npm run typecheck`
Expected: 0 errors.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add client/components/pipelines/BoardCard.tsx
git commit -m "feat(pipelines): coordinate chip on board cards

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Pure tests**

Run: `npx tsx --test shared/pipelineFieldTypes.test.ts server/pipeline-field-helpers.test.ts`
Expected: all PASS.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Manual checklist (record results)**

On the dev "Leads (Marketing)" pipeline:
- ManageFields → add field type **Koordinat**; then try to add a second Koordinat → it is disabled in the picker ("Sudah ada - hanya boleh 1 per pipeline") and the API rejects it (400).  (#7 singleton, first real use)
- Open a card → set the coordinate by clicking the map, by editing lat/lng, and via "Gunakan lokasi saya"; the marker + inputs stay in sync.  (#5)
- The info panel shows Wilayah (Kecamatan/Kabupaten/Provinsi) + nearest ODP (name, distance, status, ports); reopening the same card refetches nothing.  (#6)
- Board chip shows ` -7.xxxx, 107.xxxx` when the field is shown-on-card; empty coordinate → no chip, no panel.

- [ ] **Step 5: Final commit (only if the manual pass required a fixup; otherwise skip)**

```bash
git add -A
git commit -m "chore(pipelines): coordinate slice verification fixups

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes (author)

- **Spec coverage:** type+storage+singleton → Task 1; validation → Task 2; map-picker/manual/GPS input (#5) → Task 3; wilayah + nearest-ODP intel, auto+cached (#6) → Task 4; board chip → Task 5; verification → Task 6. No DB migration (matches spec). Existing leads lat/lng fields untouched (out of scope).
- **Type consistency:** `parseCoordinate` (shared) reused by validation (Task 2), input (Task 3), drawer (Task 4), chip (Task 5). `useReverseGeocode`/`useNearestOdp`/`NearestOdp`/`CoordinateInput`/`CoordinateInfo` names consistent. `reverseGeocode` return shape (`district/village/city/province/formatted`) and coverage-check response (`nearestOdps`/`recommended` with `name/code/distanceMeters/status/availablePorts/inCoverage`) match what the hooks/UI read.
- **Singleton:** the slice-A `canAddType` test loop now exercises `coordinate` automatically; the create-field 400 guard + picker disable need no new code (they read the registry).
- **No placeholders.**
