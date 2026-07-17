# Spec — Coordinate Field Type + Location Intelligence (Slice D)

> Date: 2026-06-07 · Status: **Approved (pending user spec review)** · Target: dev branch
> Part of the Pipelines Engine program — see [[project-pipelines-engine]]. **Slice D** of the Pipeline/Kanban
> Enhancement PRD (PRD items **#5** + **#6**). Builds on slice A's registry/singleton + config column.

## Context

PRD #5 asks for a **Coordinate** custom field type (lat/lng, with manual entry and a map picker), and #6 asks
that a filled coordinate surface **location intelligence** — the administrative area (Kecamatan / Kabupaten /
Provinsi) and the **nearest ODP** (name, distance, status).

The codebase already provides both intelligence sources, so #6 is mostly wiring:
- `client/lib/geocode.ts:reverseGeocode(lat,lng)` → `{ district (kecamatan), city (kabupaten),
  province (provinsi), village (desa), formatted }`, via the already-loaded Google Maps SDK (the same helper
  `OdcsPage` uses to auto-fill ODP district/village).
- `POST /api/coverage-check { lat, lng }` (an existing public endpoint, `server/routes.ts:2026`) →
  `{ nearestOdps[], recommended, verdict, coverageRadiusMeters }` with each ODP's name, code, distance,
  status, capacity/used/available ports, and an `inCoverage` flag — computed over the active tenant's ODPs.

Google Maps is app-loaded via `GoogleMapsContext` (`useJsApiLoader`, libraries `places`+`geometry`, key from
`/api/public-config`); `@react-google-maps/api` is already a dependency.

Per the brainstorm: location intel loads **automatically on card open**, cached per coordinate via react-query.

## Goals / Non-goals

**Goals**
1. A `coordinate` field type — singleton per pipeline — storing `{ lat, lng }`.
2. Input by manual lat/lng entry **and** a click/drag map picker (+ "use my location").
3. On opening a card with a filled coordinate, show Wilayah (Kecamatan/Kabupaten/Provinsi/Desa + address) and
   the nearest ODP (name, distance, status, ports), cached per coordinate.
4. A compact `📍 lat,lng` chip on the board when the field is shown-on-card.

**Non-goals (deferred)**
- Migrating the leads-import `lat`/`lng`/`odp_id`/`distance_m` text fields to a Coordinate field (slice F).
- Storing/snapshotting the derived wilayah or nearest ODP (always computed live + cached client-side).
- Editing ODPs or coverage logic; a non-Garut reverse-geocode (the existing helper is Garut-tuned).
- Routing/driving distance (straight-line haversine via coverage-check only).

## Coding standards
Per [[feedback-coding-standards]]: semantic HTML5 (`<label htmlFor>` for lat/lng, `<button type="button">`
for map/geo actions), DRY (one `parseCoordinate` helper reused by input/validation/chip/info; reuse
`reverseGeocode` + `coverage-check`), component/SoC (`CoordinateInput`, `CoordinateInfo`, and fetch hooks are
separate), pure testable helpers. Reuse `useGoogleMaps`, `Input`, `Button`, `StatusBadge`.

## Design

### 1. Field type + storage

- Add `"coordinate"` to `PipelineFieldType` and `PIPELINE_FIELD_TYPES` in `shared/schema.ts`. ("coordinate"
  is 10 chars — fits the existing `type varchar(16)`; no DB migration.)
- Registry entry (`shared/pipelineFieldTypes.ts`):
  `coordinate: { label: "Koordinat", description: "Lokasi (lat/lng) + peta", group: "special",
  hasOptions: false, singleton: true, searchable: false, filterable: false, sortable: false }`.
  This is the **first `singleton: true`** type — slice A's `canAddType` (client disable) + create-field 400
  guard now actually fire (max one Coordinate field per pipeline).
- Card value JSON: `{"lat":-6.12345,"lng":106.12345}` in `pipeline_card_values.value`. Empty = no value.
- Pure helper `parseCoordinate(value: string | null | undefined): { lat: number; lng: number } | null` in
  `shared/pipelineFieldTypes.ts` — JSON-parse, validate finite numbers in range, else `null`.

### 2. `CoordinateInput` (new client component)

Used by the `coordinate` case of `FieldValueInput`:
- Manual: Latitude / Longitude number inputs (`step="any"`), synced with the map.
- Map picker: a `GoogleMap` + single `Marker` (via `useGoogleMaps()` `isLoaded`); **click map or drag marker
  → set lat/lng**. Centers on the current value or a Garut default (≈ `-7.2,107.9`) when empty.
- "Gunakan lokasi saya" `<button type="button">` → `navigator.geolocation.getCurrentPosition` drops the
  marker (best-effort; silent no-op if denied/unavailable).
- Emits `{"lat":…,"lng":…}` JSON via `onChange`; clearing both inputs → `""`.
- Read-only (`disabled`): inputs disabled, map non-interactive (no click/drag), marker still shown.

**Validation** (`server/pipeline-field-helpers.ts`, pure + tested): `case "coordinate"` → parse JSON, require
`lat ∈ [-90,90]` and `lng ∈ [-180,180]`; empty allowed. (Reuses the `parseCoordinate` shape semantics.)

### 3. Location intelligence — `CoordinateInfo` (new) + hooks

Rendered in `CardDetailDrawer`'s `FieldCustomSection` immediately under a coordinate field whose value parses.
- Hooks (SoC; new `client/hooks/useGeoIntel.ts`):
  - `useReverseGeocode(lat, lng)` → react-query around `reverseGeocode`, key `["geo","rev",rLat,rLng]`
    (rounded to ~5 dp), `enabled` only when coords valid.
  - `useNearestOdp(lat, lng)` → react-query `POST /api/coverage-check`, key `["geo","odp",rLat,rLng]`.
  Caching by rounded coords means reopening the same card (or cards at the same point) refetches nothing.
- `CoordinateInfo` renders:
  - **Wilayah:** Kecamatan / Kabupaten / Provinsi / Desa + formatted address (only the parts returned).
  - **ODP terdekat:** from `recommended ?? nearestOdps[0]` — name, `distanceMeters` (m/km), status badge,
    available ports, in-coverage indicator (`verdict`/`inCoverage` already provided).
  - Loading → small skeleton; failure/empty → a quiet "Info wilayah/ODP tak tersedia" line. Never blocks the
    card; intel is read-only.

### 4. Board chip

`BoardCard.fieldText` gains a `coordinate` case: `parseCoordinate(raw)` → `📍 -6.1234, 106.1234` (≈4 dp);
falls back to the raw string if unparseable. Only shows when the field is `showOnCard`. No intel on the chip.

## Files

| File | Change |
|---|---|
| `shared/schema.ts` | + `"coordinate"` in `PipelineFieldType` + `PIPELINE_FIELD_TYPES`. |
| `shared/pipelineFieldTypes.ts` | + `coordinate` registry entry (singleton); + `parseCoordinate`. |
| `shared/pipelineFieldTypes.test.ts` | tests for `parseCoordinate` + registry entry. |
| `server/pipeline-field-helpers.ts` | + `coordinate` validation branch. |
| `server/pipeline-field-helpers.test.ts` | tests for coordinate validation. |
| `client/components/pipelines/CoordinateInput.tsx` | **New.** Manual + map picker + geolocation. |
| `client/components/pipelines/CoordinateInfo.tsx` | **New.** Wilayah + nearest-ODP panel. |
| `client/hooks/useGeoIntel.ts` | **New.** `useReverseGeocode`, `useNearestOdp`. |
| `client/components/pipelines/FieldValueInput.tsx` | `coordinate` case → `CoordinateInput`. |
| `client/components/pipelines/CardDetailDrawer.tsx` | render `CoordinateInfo` under a filled coordinate field. |
| `client/components/pipelines/BoardCard.tsx` | `coordinate` chip via `parseCoordinate`. |

## Testing

- **Pure (`npx tsx --test`):** `parseCoordinate` (valid; out-of-range → null; garbage/empty → null;
  non-numeric → null); registry has a `coordinate` entry with `singleton:true`; `validateFieldValue`
  coordinate (valid ok; out-of-range/garbage fail; empty ok).
- **Gates:** `npm run typecheck` = 0; `npm run build` green.
- **Manual (dev):** add a Coordinate field to a pipeline → confirm a **second** Coordinate can't be added
  (singleton: disabled in picker + 400 from server). Set a coordinate by map-click, by manual entry, and via
  "Gunakan lokasi saya". Open the card → Wilayah shows Kecamatan/Kabupaten/Provinsi + nearest ODP (name,
  distance, status); reopening refetches nothing (cache). Board chip shows `📍 lat,lng`. Empty coordinate →
  no chip, no info panel.

## Multi-tenant / RBAC
`coverage-check` computes over `storage.getOdps()` under the active tenant context (mitra-scoped); no new
auth surface (it's an existing public coverage endpoint). `reverseGeocode` is a client-side Google call. No
change to pipeline isolation/guards.

## Risks
1. **External look-ups** (Geocoding, coverage) can fail/throttle → the panel degrades to "tak tersedia"; the
   card and coordinate value are unaffected.
2. **Garut-tuned geocode** — components it can't resolve are hidden; acceptable for the single-region tenant.
3. **First singleton type** — manually verify slice A's add-guard blocks a 2nd coordinate field.
4. **Map mounts only in the lazy drawer** — no board/main bundle weight added.

## Acceptance criteria
- `coordinate` field type exists, singleton per pipeline (client + server enforced), stores `{lat,lng}`.
- Coordinate set via manual entry and map picker (click/drag) + "use my location".
- A filled coordinate shows Wilayah (Kecamatan/Kabupaten/Provinsi) + nearest ODP (name/distance/status) in the
  card detail, auto-loaded and cached per coordinate.
- Board chip shows `📍 lat,lng` when shown-on-card.
- No DB migration; typecheck 0, build green, pure tests pass; multi-tenant isolation unchanged.
