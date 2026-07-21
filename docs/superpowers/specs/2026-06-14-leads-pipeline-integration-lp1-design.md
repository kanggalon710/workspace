# LP1 - Lead Event Bus + Lead Intake (Fondasi) - Design

> Tanggal: 2026-06-14 · Status: spec disetujui (brainstorm), siap → writing-plans
> Epik: **Leads ↔ Pipeline Automation Engine** (lihat memory `project-pipelines-engine`, lanjutan P5)

## Konteks & latar

Workspace JABNET punya dua sistem terpisah:

- **Modul Leads** (`/leads`, tabel `leads`) - canvassing, prospect finder, coverage check, Meta/TikTok Lead Ads, kualifikasi, assignment.
- **Modul Pipelines** (`/pipelines`, `pipeline_*`) - engine Kanban + **automation engine yang sangat matang**: trigger (`stage_enter`, `time`, `billing_sync`, `card_updated`, `assignee_changed`, `field_updated`), aksi (`create_card`, `set_field`, `move_stage`, `assign`, `notify`, + aksi lintas-kartu lineage), kondisi grup OR-of-AND, field-map, dedup (`pipeline_rule_fires`), multi-action, custom field EAV, semua tenant-scoped + audit.

Permintaan user: jadikan Pipeline Engine sebagai **automation layer** - lead dari sumber mana pun otomatis membuat/memperbarui/memindahkan/menghubungkan card di `/pipelines`. **Bukan** mengganti `/leads`; `leads` tetap source of truth.

Request asli mencakup 18 bagian (terlalu besar untuk satu spec) → didekomposisi jadi program **LP1-LP6**:

| Slice | Isi | Status |
|---|---|---|
| **LP1** (spec ini) | Lead event bus + lead trigger + `lead_card_links` + intake create/update/link + field-map + dedup mode | **AKTIF** |
| LP2 | Lead-attribute rule builder (source kaya, jarak ODP, campaign capture) | nanti |
| LP3 | Lead conversion bundle (kartu Instalasi/Collection/CS) | nanti |
| LP4 | Reverse "Create Lead" dari pipeline + template pipeline lead | nanti |
| LP5 | Two-way/Mirror sync | **dibuang** (YAGNI) |
| LP6 | Metric baca data lead | dilipat ke epik Metrics **MP4** |

### Keputusan yang sudah diambil (brainstorm)
- Dekomposisi LP1-LP6, mulai LP1.
- **#7 sync mode:** LP1 dukung **Create-Only + One-Way (lead→card) + Reopen + Ignore**. Two-Way/Mirror dibuang.
- **#16:** **dispatch sinkron best-effort di dalam request** (pola `dispatchCardEvent`), tanpa queue/poll.
- **Campaign/Ad data:** ditunda ke LP2 (belum tersimpan di `leads`; Meta hanya menaruh `form_id/ad_id` di `notes`, TikTok tak menyimpan apa-apa).
- **Dedup key:** default per `lead_id` (via `lead_card_links`); opsi per `phone` di pipeline target untuk mode Update/Reopen.
- **Relasi lead↔card:** tabel `lead_card_links` (mendukung 1 lead → banyak card).

### Precedent kunci
`server/pipeline-billing-intake.ts` (+ `shared/pipelineBillingIntake.ts` + UI sub-form `billing_sync` di `PipelineRulesDialog`/`ruleFormState`) = pola persis "entitas eksternal → buat/pindah card dengan filter + field-map + `source_*` link". LP1 mengkloning pola ini, tetapi **event-driven** (bukan poll/reconcile).

## Prinsip arsitektur

Engine tetap **card-centric**. Lead **bukan** card - ia masuk lewat *intake service* (paralel `runBillingIntakeRules`) yang **memicu** create/update/link card. Tidak ada tabel lead baru; `leads` tetap source of truth.

```
Lead mutation (8 titik)  --►  emitLeadEvent(type, lead, actorId)     [server/lead-events.ts]
 | sinkron, best-effort, never throws
                                      ▼
                         runLeadIntake(type, lead, actorId)           [server/lead-intake.ts]
 | load rule lead-trigger (mitra=lead.mitraId, indexed)
 | filter source → cek dedup (lead_card_links / phone)
 | create | update | reopen | ignore
                                      ▼
                         storage.* (loop-safe, storage-direct)  +  lead_card_links  +  audit
```

## Data model

### Tabel baru: `lead_card_links`
```ts
export const leadCardLinks = mysqlTable("lead_card_links", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  leadId: int("lead_id").notNull(),
  cardId: int("card_id").notNull(),
  ruleId: int("rule_id"),                       // rule yang membuat link (audit; null bila manual nanti)
  createdAt: text("created_at").notNull(),
}, (t) => ({
  byMitraLead: index("idx_lead_card_links_mitra_lead").on(t.mitraId, t.leadId),
  byCard: index("idx_lead_card_links_card").on(t.cardId),
}));
```
Dibuat via startup `CREATE TABLE IF NOT EXISTS` (pola existing di `storage.ts`). 1 lead → banyak card (LP3). Memenuhi #8 (tracing/audit/sync/reporting).

### Registry source kanonik: `shared/leadSources.ts` (pure, tested)
Single source of truth - menyelesaikan inkonsistensi nilai `source` (kode menulis `landing_page`/`meta_ads`/`tiktok_ads`, beda dari ekspektasi spec):
```ts
export type CanonicalLeadSource =
 | "canvassing" | "prospect_finder" | "coverage_check"
 | "meta_leads" | "tiktok_leads" | "referral" | "inbound" | "other";

// normalisasi alias → kanonik
canonicalLeadSource("landing_page")  // "coverage_check"
canonicalLeadSource("meta_ads")      // "meta_leads"
canonicalLeadSource("tiktok_ads")    // "tiktok_leads"

export const LEAD_SOURCE_LABELS: Record<CanonicalLeadSource, string>;   // label id-ID
export const LEAD_SOURCE_OPTIONS: { value: CanonicalLeadSource; label: string }[];
```
Dipakai **server** (match rule `sources`) dan **client** (label + `LEAD_SOURCE_OPTIONS` di sub-form; `SOURCE_LABELS` lama di `LeadPipelinePage` di-dedup ke registry ini → DRY). Tidak mengubah nilai `source` yang tersimpan; normalisasi hanya saat matching/label.

### Tipe trigger baru (TANPA kolom DB baru)
`RuleTriggerType` (shared/schema.ts) += `"lead_created" | "lead_updated" | "lead_assigned" | "lead_stage_changed" | "lead_converted"`. `trigger_type` varchar(16) & `trigger_config` TEXT(JSON) sudah ada - cukup.

## Rule lead-trigger (reuse `pipeline_rules`)

Rule menempel ke **pipeline target** (sama seperti `billing_sync`), dikonfigurasi di panel **"Otomasi"** board tersebut. Bentuk `triggerConfig` (JSON, opaque - tanpa migrasi):
```jsonc
{
  "sources": ["meta_leads", "coverage_check"],  // filter (#3). Kosong/absen = semua source
  "entryStageId": 12,                           // stage masuk di pipeline target
  "titleSource": "name",
  "fieldMap": [{ "attr": "phone", "targetFieldId": 30 }],  // lead→card (#5)
  "onDuplicate": "ignore",                      // create | update | ignore | reopen (#9)
  "dedupBy": "lead_id",                         // lead_id | phone
  "reopenStageId": 12                           // dipakai bila onDuplicate=reopen
}
```

Aturan:
- **Filter source** (LP1) ada di `triggerConfig.sources`, BUKAN di ConditionsBuilder generik (kondisi atribut lead kaya = LP2). "WHEN Lead Source = X" (#3) terpenuhi di LP1.
- **Entry stage + field-map** mengikuti pola billing_sync (di level rule/trigger config), bukan action field-map card→card.
- **Intake LP1 hanya create/update/reopen + field-map** (paritas penuh dgn `runBillingIntakeRules`, yang TIDAK memanggil `applyRuleActions`). Aksi tambahan untuk lead rule (notify, assign berbasis aturan lanjutan, dst.) **ditunda ke LP3** agar LP1 tetap minimal & konsisten dgn precedent. `assignedTo` lead tetap dipetakan ke `card.assigneeId` lewat field-map intake (lihat §Field mapping).

### Mode dedup (#9)
Existing card dicari via `lead_card_links` (by `lead_id`), atau by `phone` di pipeline target bila `dedupBy: "phone"` (menangani orang sama masuk 2× sebagai 2 lead row, mis. Meta kirim ulang).

| `onDuplicate` | Perilaku |
|---|---|
| `create` | Selalu buat card baru (+link) |
| `ignore` | Bila sudah ada link/card → lewati |
| `update` | Re-apply field-map ke card existing |
| `reopen` | Pindah card existing ke `reopenStageId` (via `storage.moveCard`) + re-apply field-map |

Logika murni `resolveDuplicateAction(mode, existing)` → `"create" | "update" | "reopen" | "skip"` (di-unit-test).

## Field mapping lead → card (#5)

`shared/leadIntake.ts` (pure, tested) - paralel `customerToFieldValues`:
- `leadTitle(lead, titleSource)` - default `name`.
- `leadToFieldValues(lead, fieldMap, fieldTypeById)` → `{ fieldId, value }[]`.
- Atribut yang dapat dipetakan (dari schema `leads`): `name, phone, address, category, notes, source(kanonik), lat, lng, distanceMeters, district, village, stage, priority, odpId→nama ODP`.
- `lat/lng` → field **Koordinat** (`{lat,lng}` JSON) bila target bertipe coordinate, atau number tunggal; format ditentukan `fieldTypeById` (reuse normalisasi tanggal/angka pola billing).
- `assignedTo` lead → `card.assigneeId` (divalidasi `canUserAccessPipeline`; bila tak punya akses → card dibuat unassigned + warn, sama seperti billing).
- `odpId` butuh lookup nama ODP → batch di `runLeadIntake` (anti N+1; muat ODP sekali per event bila ada map odp).

## Titik emit event (8 lokasi)

Helper tunggal `emitLeadEvent(type, lead, actorId)` dipanggil setelah mutasi sukses. Tenant = `lead.mitraId` via `withMitra` (webhook publik tak punya req tenant; sumber kebenaran = lead row). Actor webhook = sistem (id 1).

| Event | Lokasi (server/routes.ts) |
|---|---|
| `lead_created` | `POST /api/marketing/leads` (manual canvassing+finder); `POST /api/coverage-check/register`; `POST /api/webhook/meta-leads`; `POST /api/webhook/tiktok-leads` |
| `lead_updated` | `PUT /api/marketing/leads/:id` |
| `lead_assigned` | `PATCH /api/marketing/leads/:id/assign` |
| `lead_stage_changed` | `PATCH /api/marketing/leads/:id/stage` |
| `lead_converted` | `POST /api/marketing/leads/:id/convert` |

Webhook Meta/TikTok membuat banyak lead dalam loop → `emitLeadEvent` dipanggil per lead (best-effort; tak boleh menggagalkan loop). `storage.createLead` mengembalikan row lead (dibutuhkan untuk event) - verifikasi method mengembalikan row; bila tidak, query ulang via `insertId` (pola MySQL refactor).

## UI

`PipelineRulesDialog` + `ruleFormState.ts`: tambah grup trigger **"Lead masuk / berubah"** dengan sub-form (klon sub-form `billing_sync`):
- Pilih event (`lead_created`…`lead_converted`).
- Multiselect **Source** dari `LEAD_SOURCE_OPTIONS` (kosong = semua).
- **Entry stage** (pipeline target).
- **Field-map lead→card** - reuse baris field-map billing, dropdown atribut dari daftar atribut lead.
- Dropdown **onDuplicate** (Buat baru / Perbarui / Abaikan / Buka lagi), **dedupBy** (lead_id/phone), **reopenStage** (muncul saat reopen).
- Panel detail rule menampilkan ringkasan trigger lead (label source dari registry).

Semantic `<form>`/`<fieldset>`, mobile-first, reuse Combobox/RuleActionEditor/field-map row. `ruleToDraft`/`draftToPayload` diperluas untuk cabang lead (pola yang sama dgn billing_sync di `ruleFormState`).

## Cross-cutting (wajib)

- **Tenant isolation (#15):** intake hanya memuat rule `mitra_id = lead.mitraId`; semua storage tenant-scoped; card dibuat di `withMitra(lead.mitraId)`. Tak ada cross-tenant card/automation/sync.
- **Performance (#16):** per event, muat rule lead-trigger tenant via query terindeks (`mitra_id, trigger_type`); cek dedup 1 query ke `lead_card_links` (atau 1 query phone→card); batch lookup ODP/field; tanpa polling, tanpa N+1, tanpa create card ganda (dedup).
- **Audit (#17):** tiap intake (create/update/reopen) → audit log + baris `lead_card_links`.
- **Loop-safe:** intake mutasi via `storage.*` langsung (tak re-invoke automation); lead event tak pernah dipicu oleh mutasi card.
- **Event-driven:** sinkron in-request, best-effort, `try/catch` membungkus seluruh intake (mutasi lead tetap sukses walau intake gagal).

## Testing

- Unit (`node:test` via `npx tsx --test`): `shared/leadSources.ts` (normalisasi alias + label), `shared/leadIntake.ts` (`leadTitle`, `leadToFieldValues` per tipe field), `resolveDuplicateAction` (4 mode × ada/tak-ada existing).
- Verifikasi mandiri di akhir: `npx tsc --noEmit` (0 errors), seluruh test pass, `npm run build` sukses (jangan percaya laporan subagent - verifikasi sendiri).
- Smoke manual (opsional, lokal): buat rule `lead_created` source=meta_leads → kirim webhook → card muncul di pipeline target dgn field ter-map + link tercatat; kirim ulang → sesuai mode dedup.

## Acceptance Criteria yang dipenuhi LP1

AC **1** (lead_created trigger), **2** (semua source via registry kanonik), **3** (create card otomatis), **4** (field-map konfigurable), **5** (custom field menampung data lead via field-map), **6** (relasi lead↔card tertelusur via `lead_card_links`), **7** (dedup: create/update/ignore/reopen), **8** (lead_converted memicu - sebagian; bundle penuh di LP3), **11** (tenant isolation), **12** (mobile-first/semantic/DRY/reusable).

> Catatan penomoran: AC di atas merujuk daftar Acceptance Criteria request asli (1-12). Item conversion-bundle penuh, campaign, metric, reverse-create, dan two-way berada di LP2/LP3/LP4/MP4 atau dibuang sesuai keputusan.

## Out of scope LP1 (sengaja)
Campaign/Ad capture (LP2) · kondisi atribut lead kaya: jarak ODP, campaign (LP2) · conversion bundle template (LP3) · "Create Lead" dari pipeline + template pipeline lead (LP4) · Two-way/Mirror (dibuang) · metric baca lead (MP4) · backfill lead lama → card (snapshot P5-step-1 sudah pernah; LP1 hanya menangani lead baru/berubah sejak aktif).
