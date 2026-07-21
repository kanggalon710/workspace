# LP3 - Notify Action for Lead Rules - Design

> Tanggal: 2026-06-14 · Status: spec disetujui (brainstorm), siap → writing-plans
> Epik: **Leads ↔ Pipeline Automation** ([[project-leads-pipeline-integration]]). Menutup gap "Send Notification" (#11) yang ditunda dari LP1.

## Konteks

`lead_converted` (dan trigger lead lain) sudah ada di LP1, dan **bikin kartu Instalasi/Collection/CS sudah bisa** via beberapa rule `lead_converted` (intake LP1 create per rule). Gap nyata dari #11 = **Send Notification**: intake LP1 hanya create/update/reopen + field-map, **tanpa notify** (mesin notify ada di card automation engine, tapi intake lead tak menjalankan action). LP3 menambah notify ke rule lead, reuse mesin existing.

**Keputusan brainstorm:**
- **Notify menyertai kartu** - `entryStageId` tetap wajib; notify jalan bersama create/update/reopen. Notify-only (tanpa kartu) ditunda.
- **DRY UI** - ekstrak komponen bersama `<NotifyConfigFields>`, dipakai di sub-form lead **dan** refactor notify `RuleActionEditor` (kartu) untuk memakainya.
- **Move-existing-card** = LP3b terpisah (butuh refactor dedup pipeline-scoped).

## Arsitektur

```
runLeadIntake (LP1): match source + conditions (LP2) → create/update/reopen (LP1)
  → LP3: if cfg.notify → runLeadNotify(cfg.notify, lead, cardId|null, rule, actorId)  [best-effort, never throws]
        bell  → storage.createNotification ke target (assignee=lead.assignedTo / user=bellUserId / creator=rule.createdBy)
                title/message = buildTargetTitle(tpl, lead.name); entityType "lead", entityId lead.id, link "/leads"
        webhook → postPipelineWebhook(url, { event:"lead.automation", ruleId, ruleName, leadId, leadName, source, campaign, cardId, firedAt })
```

Notify fire saat rule **cocok** (source+kondisi lolos), setelah keputusan kartu - terlepas dari create/update/reopen/skip. Best-effort: dibungkus try/catch, tak menggagalkan intake.

## Data model

TANPA tabel/kolom baru. Notify disimpan di lead `triggerConfig` JSON (LP1) sebagai `notify: NotifyConfig`. `NotifyConfig` sudah ada di `shared/schema.ts`: `{ channels:("bell"|"webhook")[], bellTarget?:"assignee"|"user"|"creator", bellUserId?, bellTitle?, bellMessage?, webhookUrl? }`.

## Shared

`shared/leadIntake.ts`:
- `LeadTriggerConfig` += `notify?: NotifyConfig` (import type dari `./schema.js`).
- `parseLeadTriggerConfig`: baca `notify` bila objek valid (`channels` array) - else undefined.

## Server

- `server/pipeline-automation.ts`: **export** `postPipelineWebhook` (saat ini private `async function` → `export async function`) agar dipakai bersama (DRY). Tak ubah perilaku.
- `server/lead-intake.ts`: tambah `runLeadNotify(notify, lead, cardId, rule, actorId)` (best-effort):
  - bell: target userId via `bellTarget` (`assignee`→`lead.assignedTo`, `user`→`bellUserId`, `creator`→`rule.createdBy`); skip bila null. `createNotification({ userId, type:"automation", title: buildTargetTitle(bellTitle||"Lead: {title}", lead.name), message: bellMessage?buildTargetTitle(...):undefined, link:"/leads", entityType:"lead", entityId:lead.id, fromUserId:actorId })`.
  - webhook: `postPipelineWebhook(webhookUrl, payload)` dgn payload lead-spesifik (lihat atas).
  - dipanggil di `runLeadIntake` setelah blok create/update/reopen, di dalam try/catch per-rule yang sudah ada.
- `server/routes.ts` `validateTriggerConfig` cabang lead: bila `triggerConfig.notify` ada, validasi: `channels` array non-empty subset `["bell","webhook"]`; `bellTarget`∈{assignee,user,creator} bila bell; `bellUserId` number bila bellTarget="user"; `webhookUrl` string non-empty bila channel webhook. (Validator kecil, bisa reuse logika dari validasi notify action kartu bila ada.)

## Client

- **`client/components/pipelines/NotifyConfigFields.tsx`** (baru): komponen presentasional `{ value: NotifyConfig; onChange: (n: NotifyConfig)=>void; users?: {id,label}[] }` - toggle channel bell/webhook, bellTarget select (Assignee/User tertentu/Pembuat rule), user picker (bila target=user), title/message input, webhook URL input. Semantic `<fieldset>`, mobile-first.
- **`RuleActionEditor.tsx`** (refactor): ganti blok inline notify (action type "notify") agar memakai `<NotifyConfigFields>` - perilaku identik (diverifikasi build). DRY.
- **`ruleFormState.ts`**: lead draft += `leadNotify: NotifyConfig | null`; `draftToPayload` lead branch sertakan `notify` di triggerConfig (bila ada channel); `ruleToDraft` lead branch hidrasi `notify`. `emptyDraft` default null.
- **`PipelineRulesDialog.tsx`**: di sub-form lead, render section "Notifikasi (opsional)" pakai `<NotifyConfigFields>` (users dari `useAssignableUsers`).

## Cross-cutting
- **Tenant isolation:** notify pakai `createNotification` (tenant-scoped) + target user di mitra (intake jalan dalam `withMitra` LP1). Webhook = URL user-config (http(s) guard di postPipelineWebhook).
- **Best-effort:** runLeadNotify try/catch; gagal notify tak menggagalkan lead/kartu.
- **Loop-safe:** notify tak memicu event lead/kartu lain.
- **DRY/testing:** `NotifyConfigFields` reusable; `postPipelineWebhook` shared; pure `parseLeadTriggerConfig` notify-parse di-test (extend `shared/leadIntake.test.ts`). Validator notify server tertutup oleh test ringan bila praktis.

## Acceptance Criteria
1. Rule lead bisa punya config `notify` (bell + webhook) di triggerConfig.
2. Saat rule cocok, notify terkirim: bell ke target (assignee/user/creator) + webhook POST best-effort.
3. Notify menyertai create/update/reopen (entryStage tetap wajib); gagal notify tak menggagalkan intake.
4. UI: section notify di sub-form lead via `<NotifyConfigFields>`; RuleActionEditor (kartu) di-refactor pakai komponen yang sama (DRY).
5. Server memvalidasi config notify; `postPipelineWebhook` di-export & dipakai bersama.
6. Tenant-scoped, best-effort, loop-safe.

## Out of scope LP3
- **Move existing card** saat convert → **LP3b** (butuh dedup pipeline-scoped).
- **Notify-only rule** (tanpa kartu) - ditunda; entryStage tetap wajib.
- Channel notify selain bell/webhook (WA/email) - pakai NotifyConfig existing saja.
