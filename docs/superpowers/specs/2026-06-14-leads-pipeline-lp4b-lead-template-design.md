# LP4b - Built-in "Lead" Pipeline Template - Design

> Tanggal: 2026-06-14 · Status: spec disetujui (brainstorm), siap → writing-plans
> Epik: **Leads ↔ Pipeline Automation** ([[project-leads-pipeline-integration]]). Pelengkap LP4 (template pipeline lead, item #13).

## Konteks

Mesin template pipeline **sudah lengkap**: tabel `pipeline_templates` (+ `is_builtin`), `seedBuiltinTemplates(mitraId)` (idempotent by name, dipanggil startup per-mitra di storage.ts:7741-7744), `BUILTIN_TEMPLATES` array (`shared/pipelineTemplate.ts`, 4 preset: Sales/Collection/Project/CS), dialog "Buat dari Template" (`TemplatePickerDialog`), endpoint `apply`/`create-from-pipeline`/`delete`. Jadi LP4b **bukan** membangun sistem template - hanya **menambah satu preset "Lead" bawaan** agar user dapat pipeline lead siap pakai dalam satu klik.

## Perubahan (kecil, additive)

1. **`shared/pipelineTemplate.ts`** - tambah SATU entri `TemplateDefinition` ke array `BUILTIN_TEMPLATES`:
   - `pipeline`: `{ name: "Pipeline Lead", description: "Pipeline prospek/lead pemasaran", color: "#0EA5E9", icon: "users" }`.
   - `stages` (via helper `nowKeyStages`, sesuai #13): `Lead Baru` → `Dihubungi` → `Survey` → `Negosiasi` → `Won` → `Lost`. Warna mengikuti pola preset lain (abu→biru→ungu/amber→hijau menang→merah kalah).
   - `fields` (selaras LP1 field-map / LP4 auto-detect / LP2b campaign):
     | key | label | type | options | showOnCard |
     |---|---|---|---|---|
     | field_0 | Telepon | `phone` | null | 1 |
     | field_1 | Koordinat | `coordinate` | null | 0 |
     | field_2 | Sumber | `dropdown` | `["canvassing","prospect_finder","coverage_check","meta_leads","tiktok_leads","referral"]` | 1 |
     | field_3 | Campaign | `text` | null | 0 |
   - `rules: []` - tanpa auto-wire automation (user konfigurasi sendiri di panel Otomasi).

2. **`shared/pipelineTemplate.test.ts`** - naikkan assertion `BUILTIN_TEMPLATES.length >= 4` → `>= 5`; entri baru otomatis lolos loop shape-check existing. Tambah assertion ringan: ada template bernama "Pipeline Lead" dengan 6 stage + 4 field.

## Arsitektur / data flow
Tak ada perubahan arsitektur. Saat startup, `seedBuiltinTemplates` melihat entri baru, menyisipkan ke `pipeline_templates` tiap mitra (skip bila nama+is_builtin sudah ada → idempotent, deployment lama dapat saat restart). User membukanya via dialog "Buat dari Template" yang sudah ada; `instantiateTemplate` membuat pipeline+stages+fields (mekanisme existing). Tenant isolation, RBAC, dll. mengikuti engine template existing.

## Testing
- Unit `shared/pipelineTemplate.test.ts` (count + shape entri Lead). Tipe `TemplateDefinition` menjamin bentuk benar (tsc).
- Verifikasi mandiri: seluruh test pass, tsc 0, build ok.
- Smoke (opsional): startup → `/pipelines` → "Buat dari Template" → "Pipeline Lead" muncul → apply → pipeline baru dgn 6 stage + 4 field; field `phone`/`coordinate` siap untuk "Buat Lead" (LP4) + field-map intake (LP1).

## Acceptance Criteria
1. `BUILTIN_TEMPLATES` punya entri "Pipeline Lead" (6 stage Lead Baru→…→Lost, 4 field phone/coordinate/dropdown-sumber/campaign, rules kosong).
2. Auto-seed ke tiap mitra saat startup (idempotent); muncul di TemplatePickerDialog.
3. Apply menghasilkan pipeline lead siap pakai yang kompatibel dgn LP1 field-map + LP4 auto-detect + LP2b campaign.
4. Test diperbarui; tsc 0; build ok.

## Out of scope
- Auto-wire rule otomasi lead ke template (opsi C) - dibuang; user atur sendiri.
- UI/endpoint template baru - tak perlu (engine sudah ada).
- Mengubah preset existing (Sales/Collection/Project/CS) - jangan disentuh.
