# LP2 - Lead-Attribute Rule Builder - Design

> Tanggal: 2026-06-14 · Status: spec disetujui (brainstorm), siap → writing-plans
> Epik: **Leads ↔ Pipeline Automation** ([[project-leads-pipeline-integration]]). Slice ke-2 setelah LP1 (DONE on dev).

## Konteks

LP1 sudah membangun lead event bus + intake: lead event → rule lead-trigger (filter **source**) → create/update/reopen card. LP2 menambah **kondisi atribut lead** pada rule, sehingga rule bisa: `WHEN lead_created AND source=Meta AND nearest ODP exists THEN create card`, atau `WHEN source=Coverage Check AND jarak<200m THEN (create + assign)`. Memenuhi Acceptance Criteria #10 (advanced rule builder) dari request asli.

**Keputusan brainstorm:**
- LP2 = **lead-attribute rule builder saja**. **Campaign capture dipecah ke LP2b** (webhook Meta hanya kirim ID bukan nama; match-by-nama butuh Meta Graph API - diputuskan terpisah).
- **Reverse "Create Lead dari tambah kartu" = LP4**, dikerjakan setelah LP2. LP2 dipastikan tidak menghalangi LP4 (lead tetap source of truth; `lead_card_links` sudah ada; jalur create-card manual tak diubah).
- Atribut kondisi versi awal disetujui (lihat tabel di bawah).
- Kondisi lead **di-restrict ke source `"lead"` saja** (field/stage/billing tidak relevan - kartu belum ada saat intake).

## Precedent yang diikuti

Condition engine SUDAH mendukung sumber non-card: `RuleCondition.source = "billing"` dengan `attr`, dievaluasi via `compareAttr(snapshot, attr, op, value)` (server/pipeline-automation-helpers.ts), dan `ConditionsBuilder` sudah punya selector sumber (Field/Stage/Billing) + dropdown attr billing. **LP2 menambah `source:"lead"` dengan pola identik.**

## Arsitektur & alur

```
runLeadIntake(eventType, lead, actorId)            [server/lead-intake.ts, LP1]
  → listLeadRules(triggerType)
  → for each rule:
       parse triggerConfig; filter sources (LP1)
       -- LP2: parse rule.conditions → evaluateLeadConditionGroups(groups, lead) --
              gagal → continue (skip rule, SEBELUM dedup/create)
       dedup → create/update/reopen (LP1)
```

Kondisi dievaluasi terhadap **objek lead** (bukan card values), saat intake, **sebelum** dedup & create. Best-effort & tenant-scoped tak berubah (sudah di `withMitra` LP1).

## Data model

**TANPA tabel/kolom DB baru.** Kondisi disimpan di kolom `pipeline_rules.conditions` (JSON `{groups: RuleCondition[][]}` yang sudah ada - opaque, tanpa migrasi). Satu-satunya perubahan schema = menambah literal `"lead"` ke union sumber kondisi.

`shared/schema.ts`:
```ts
// RuleCondition saat ini:
export type RuleCondition = {
  source?: "field" | "stage" | "billing";   // + "lead"
  fieldId?: number;
  attr?: string;
  op: RuleConditionOp;
  value?: string;
};
```
→ tambah `"lead"`:
```ts
  source?: "field" | "stage" | "billing" | "lead";
```

## Atribut kondisi lead (`LEAD_CONDITION_ATTRS`)

Pure catalog di `shared/leadConditions.ts` (baru). Memakai field yang SUDAH ADA di tabel `leads`:

| `attr` | Label | Op didukung | Semantik |
|---|---|---|---|
| `source` | Sumber | eq, neq | dibandingkan **kanonik** via `canonicalLeadSource` (registry LP1) |
| `category` | Kategori | eq, neq | rumahan/bisnis/perkantoran/sekolah/lainnya |
| `district` | Kecamatan | eq, neq, contains | |
| `village` | Desa/Kelurahan | eq, neq, contains | |
| `priority` | Prioritas | eq, neq | low/medium/high |
| `distanceMeters` | Jarak ke ODP (m) | gt, lt | numerik |
| `odpId` | Nearest ODP | empty, not_empty | not_empty = "ODP terdekat ada" |

Catalog menyediakan `{ key, label, ops }[]` agar UI hanya menawarkan op yang valid per attr.

## Logika murni (testable)

`shared/leadConditions.ts` (baru, no I/O):
- `applyConditionOp(stored: string, op: RuleConditionOp, target: string): boolean` - op generik (eq/neq/contains/gt/lt/empty/not_empty), case-insensitive utk string, numerik utk gt/lt. **Di-EKSTRAK dari** logika op yang ada di `evaluateConditions` (server helpers) lalu dipakai bersama (DRY - evaluator card existing direfactor memanggil ini, perilaku identik).
- `leadConditionRaw(lead, attr)` - ambil nilai attr dari lead; `source` → `canonicalLeadSource(lead.source)`; `odpId` → string id atau "" (untuk empty/not_empty); lainnya apa adanya.
- `compareLeadAttr(lead, attr, op, value)` - `applyConditionOp(leadConditionRaw(lead, attr), op, value)`.
- `evaluateLeadConditionGroups(groups: RuleCondition[][], lead): boolean` - OR-of-AND; group kosong/none → true (no-op). Hanya menilai kondisi `source==="lead"` (kondisi non-lead di rule lead diabaikan/anggap true - seharusnya tak ada karena UI me-restrict).
- `LEAD_CONDITION_ATTRS` catalog + `leadConditionAttrValid(attr)` / `opValidForAttr(attr, op)`.

Tipe `RuleConditionOp` & `RuleCondition` dari `@shared/schema` (shared). **Parsing JSON groups** memakai `parseConditionGroups` yang sudah ada **di `server/pipeline-automation-helpers.ts`** (BUKAN shared) - `server/lead-intake.ts` meng-import dari sana; `shared/leadConditions.ts` tetap pure (terima `RuleCondition[][]` yang sudah ter-parse, tak mem-parse JSON sendiri). Bila perlu parse di UI, ConditionsBuilder sudah bekerja dengan groups in-memory.

## Server

- `server/lead-intake.ts` (LP1): tambah-setelah filter source, sebelum dedup-`const groups = parseConditionGroups(rule.conditions); if (groups.length && !evaluateLeadConditionGroups(groups, lead)) continue;`.
- `server/routes.ts` `validateTriggerConfig` / rule POST+PATCH: untuk trigger lead, validasi `conditions` (jika ada) = setiap kondisi `source==="lead"`, `attr` ∈ `LEAD_CONDITION_ATTRS`, `op` valid utk attr. (createRule/updateRule sudah menerima `conditions`; cukup validasi.)
- `server/pipeline-automation-helpers.ts`: refactor `evaluateConditions` agar memakai `applyConditionOp` (DRY; tak ubah perilaku card/billing). Tes existing harus tetap hijau.

## UI

LP1 menyembunyikan section conditions untuk trigger lead. LP2 menampilkannya kembali untuk trigger lead, **mode lead**:
- `ConditionsBuilder` (`client/components/pipelines/ConditionsBuilder.tsx`) dapat prop baru `leadMode?: boolean` (atau `attrCatalog`): saat aktif, sumber dikunci `"lead"` (selector sumber disembunyikan), tiap baris = dropdown **atribut lead** (`LEAD_CONDITION_ATTRS`) + op (difilter per attr) + value. Untuk attr `odpId` (empty/not_empty), input value disembunyikan. Reuse struktur grup (DAN dalam grup / ATAU antar grup) yang sudah ada.
- `ruleFormState.ts`: lead branch di `draftToPayload` kini menyertakan `conditions` (groups). `ruleToDraft` lead branch menghidrasi `conditions`. (Draft sudah punya `conditions` untuk trigger lain - reuse field yang sama.)
- `PipelineRulesDialog.tsx`: untuk trigger `lead_*`, render `<ConditionsBuilder leadMode .../>` di sub-form lead (sebelumnya conditions di-hide untuk lead). Actions tetap hidden (intake LP1 hanya create/update/reopen; aksi tambahan = LP3).
- Ringkasan rule (`triggerSummary` / detail panel): bila ada kondisi lead, tampilkan ringkas (mis. "+2 kondisi").

DRY/semantic: reuse `ConditionsBuilder` (jangan bikin builder baru), `<fieldset>`/`<label>`, mobile-first.

## Cross-cutting

- **Tenant isolation:** tak berubah - evaluasi murni terhadap objek lead di dalam `withMitra` LP1.
- **Performance:** kondisi dievaluasi in-memory terhadap lead yang sudah di tangan; tak ada query tambahan. Skip rule lebih awal (sebelum listFields/getOdps/dedup) → malah lebih hemat.
- **Loop-safe / audit / best-effort:** tak berubah dari LP1.
- **Testing:** unit `applyConditionOp` (semua op), `compareLeadAttr` (source kanonik, odpId empty/not_empty, distance gt/lt numeric), `evaluateLeadConditionGroups` (OR-of-AND, group kosong=true, multi-grup). Refactor evaluator card harus lulus tes existing.

## Acceptance Criteria (LP2)
1. Rule lead bisa punya kondisi atribut lead (OR-of-AND) selain filter source.
2. Intake meng-skip rule bila kondisi lead tak terpenuhi (sebelum create/dedup).
3. Atribut: source, category, district, village, priority, distanceMeters, odpId(exists) - dengan op valid per attr.
4. UI: ConditionsBuilder mode lead (source terkunci lead, dropdown attr, op terfilter) di dialog rule lead.
5. Validasi server menolak kondisi lead dengan attr/op tak valid.
6. `applyConditionOp` diekstrak & dipakai bersama evaluator card (DRY) tanpa regresi.
7. Tenant isolation, best-effort, no extra query - terjaga.

## Out of scope LP2 (sengaja)
- Campaign capture / kondisi campaign → **LP2b** (butuh kerja ad-platform + mungkin Meta Graph API).
- Reverse "Create Lead dari tambah kartu" → **LP4** (berikutnya; LP2 dipastikan kompatibel).
- Aksi tambahan untuk lead rule (notify/assign-by-rule) → **LP3**.
- Kondisi yang butuh lookup eksternal (mis. kapasitas ODP real-time) - pakai field lead yang ada saja.
