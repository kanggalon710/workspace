# LP2b — Campaign Capture — Design

> Tanggal: 2026-06-14 · Status: spec disetujui (brainstorm), siap → writing-plans
> Epik: **Leads ↔ Pipeline Automation** ([[project-leads-pipeline-integration]]). Pelengkap LP2 (campaign yang dulu ditunda).

## Konteks

LP1/LP2 sudah jalan tapi **campaign tidak tertangkap** (webhook Meta hanya menaruh `form_id`/`ad_id` di `notes`; TikTok tak menyimpan apa-apa). LP2b menangkap campaign/ad set/ad name dari lead iklan ke tabel `leads`, lalu mengeksposnya sebagai **field-map** (LP1) + **kondisi rule** (LP2: `WHEN Campaign contains "Promo"`) + tampil di `/leads`. Memenuhi #5 (Campaign→field) + #10 (rule campaign) dari request asli.

**Keputusan brainstorm:**
- **3 kolom**: `campaign`, `adSet`, `adName` di `leads`.
- **Resolusi nama via registry `ad_campaigns` yang SUDAH ADA** (tanpa Meta Graph API). `ad_campaigns` punya `campaignName` + `externalId` (ID campaign platform) + `getAdCampaignByExternalId(platform, externalId)`, di-push bot eksternal via Public API.
- **Best-effort capture** dari apa pun yang dikirim payload webhook (Meta leadgen reliabel kasih `ad_id`/`form_id`; `campaign_id`/`campaign_name` hanya bila integrasi n8n/Zapier meng-enrich). Tak mengasumsikan bentuk payload spesifik.

## Arsitektur

```
Webhook (meta/tiktok) menerima lead
  → extractAdRefs(payload)  [shared/adCampaignFields.ts, pure]
        → { campaign?:{externalId?,name?}, adSet?:{externalId?,name?}, adName?:{externalId?,name?} }
  → resolve di server (per platform):
        campaign: ad_campaigns.externalId match → campaignName  (registry, ramah)
                  else payload name  else externalId mentah  else null
        adSet / adName: payload name  else externalId mentah  else null   (registry hanya level-campaign)
  → createLead({ ..., campaign, adSet, adName, source })   (+ emitLeadEvent LP1 seperti biasa)
```

Resolusi best-effort, **tak boleh menggagalkan** pembuatan lead (try/catch; gagal resolve → fallback id/null).

## Data model

Tabel `leads` + 3 kolom nullable (migrasi startup terjaga via info_schema check — pola `loyaltyColumnAdditions`; DB menolak `ADD COLUMN IF NOT EXISTS`, lihat [[reference-startup-add-column]]):
```ts
campaign: text("campaign"),   // nama campaign (ramah) atau id; null kalau bukan dari iklan
adSet: text("ad_set"),
adName: text("ad_name"),
```
`shared/schema.ts` `leads` table + (jika ada) `InsertLead`/`Lead` types ikut otomatis.

## Pure module

`shared/adCampaignFields.ts` (no I/O, tested):
```ts
export interface AdRef { externalId?: string; name?: string }
export interface AdRefs { campaign?: AdRef; adSet?: AdRef; adName?: AdRef }
export function extractAdRefs(payload: any): AdRefs;
```
- Ambil dari key umum (case-insensitive tak perlu; cek beberapa alias):
  - campaign: `campaign_id`/`campaignId` → externalId; `campaign_name`/`campaignName` → name.
  - adSet: `adset_id`/`adgroup_id`/`adSetId` → externalId; `adset_name`/`adgroup_name`/`adSetName` → name.
  - adName: `ad_id`/`adId` → externalId; `ad_name`/`adName` → name.
- Hanya sertakan ref yang punya minimal satu nilai non-empty. String di-trim; kosong → diabaikan.
- Pure — tak query registry (server yang resolve).

Helper resolusi (server-side, kecil, di webhook handler atau `server/lead-campaign.ts`): `resolveCampaignName(platform, ref, lookup)` → `name ?? externalId ?? null` di mana `lookup(externalId)` = `getAdCampaignByExternalId(platform, externalId)?.campaignName`. Untuk adSet/adName tak ada lookup → `ref.name ?? ref.externalId ?? null`.

## Server

- `IntakeLead` (`shared/leadIntake.ts`) += `campaign?`, `adSet?`, `adName?` (string|null).
- `server/routes.ts` `POST /webhook/meta-leads`: `extractAdRefs(change.value)`; resolve campaign via `getAdCampaignByExternalId("meta_ads", ref.campaign.externalId)`; set `campaign/adSet/adName` di `createLead`. (Boleh hapus dump `form_id`/`ad_id` di notes karena kini terstruktur — opsional.)
- `server/routes.ts` `POST /webhook/tiktok-leads`: `extractAdRefs(lead)`; resolve via `"tiktok_ads"`.
- Resolusi dibungkus try/catch (best-effort).

## Field-map & kondisi (integrasi LP1/LP2)

- `LEAD_ATTRS` (`shared/leadIntake.ts`) += `campaign`/`adSet`/`adName` (fieldTypes TEXTISH) → bisa dipetakan ke field kartu (LP1 intake). `attrRaw`/`leadToFieldValues` otomatis menangani via `(lead as any)[attr]`.
- `LEAD_CONDITION_ATTRS` (`shared/leadConditions.ts`) += `campaign`/`adSet`/`adName` (ops eq/neq/contains). `leadConditionRaw` otomatis via `(lead as any)[attr]` (default branch). → rule `WHEN campaign contains "Promo"` jalan.

## Client

- `LeadPipelinePage` detail lead: tampilkan `campaign` (+ adSet/adName bila ada) di info section, bila tidak null.
- (ConditionsBuilder & field-map UI otomatis menampilkan attr baru dari katalog — tak perlu kode UI khusus.)

## Cross-cutting
- **Tenant isolation:** `getAdCampaignByExternalId` sudah tenant-scoped; lead di mitra dari webhook (`mitraId` default 1 / lead row). Tak ada cross-tenant.
- **Best-effort:** resolusi tak menggagalkan webhook; gagal → fallback id/null.
- **Performance:** 1 query registry per lead webhook (hanya bila ada campaign externalId). Webhook volume rendah; acceptable. (Bisa batch/cached nanti bila perlu.)
- **DRY/testing:** `extractAdRefs` pure + tested; integrasi attr lewat katalog existing (LP1/LP2) tanpa duplikasi.

## Acceptance Criteria (LP2b)
1. Kolom `campaign`/`adSet`/`adName` ada di `leads` (migrasi startup terjaga).
2. Webhook Meta/TikTok mengisi ketiganya best-effort dari payload; campaign ter-resolve ke nama ramah via `ad_campaigns` bila externalId cocok, else fallback nama payload → id → null.
3. `campaign`/`adSet`/`adName` jadi atribut field-map (LP1) — bisa dipetakan ke field kartu.
4. `campaign`/`adSet`/`adName` jadi atribut kondisi (LP2, eq/neq/contains) — rule `WHEN campaign ...` jalan.
5. `/leads` detail menampilkan campaign bila ada.
6. Resolusi best-effort, tenant-scoped, tak menggagalkan webhook.

## Out of scope LP2b
- Meta Graph API name resolution (registry sudah cukup) — dibuang.
- Auto-bikin row `ad_campaigns` dari lead (registry tetap di-push terpisah) — defer.
- Time-series metrik campaign (sudah di `ad_campaigns`) — terpisah.
- Campaign di jalur manual (canvassing/finder/coverage/create-from-card) — null (bukan dari iklan).
