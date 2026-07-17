/**
 * One-off: pasang automation rule `billing_sync` di pipeline "Penagihan (Collections)".
 *
 * Tiap billing-sync (Phase 4 `runBillingIntakeRules`), rule ini:
 *   - BUAT kartu untuk tiap pelanggan yang cocok filter (default isIsolir=1) yang belum punya
 *     kartu aktif dari rule ini, di entry stage "Baru Isolir".
 *   - PINDAHKAN kartu ke "Lunas ?" saat pelanggannya tidak lagi cocok (mis. sudah lunas/un-isolir).
 *
 * Setara auto-open + auto-close /collections, tapi sebagai rule yang terlihat di website → otomasi.
 *
 * Default = REPLACE: wipe semua kartu pipeline 7 lebih dulu (snapshot lama), lalu rule isi ulang
 * dari data billing terkini. Pipeline + stage + field DIPERTAHANKAN.
 *
 * Stage & field di-resolve by label/key saat runtime (tahan beda ID antar dev/prod).
 *
 * Run: bundle dgn esbuild --packages=external, scp .mjs ke app dir, jalankan dgn node + .env.
 *   (lihat memory reference-run-oneoff-script-cpanel)
 *
 * Flags:
 *   --no-wipe       jangan hapus kartu lama (RISIKO dobel — hanya kalau kartu sudah ter-link customer)
 *   --allow-prod    izinkan jalan di DB yg DB_NAME-nya tidak mengandung "dev"
 */
import "../server/config.js"; // dotenv loader (DB_* eksplisit tetap menang)
import mysql from "mysql2/promise";

const MITRA_ID = 1;
const PIPELINE_ID = 7;
const ENTRY_STAGE_LABEL = "Baru Isolir";
// Resolve stage ("Lunas") di-match by prefix — labelnya bisa pakai emoji (mis. "Lunas ✅").
const RESOLVE_STAGE_PREFIX = "Lunas";
const RULE_NAME = "Auto-buat kartu pelanggan isolir (billing sync)";
// filter: customer yang ditarik jadi kartu. isIsolir=1 = semua pelanggan terisolir (semua jenis).
const FILTER = { isIsolir: 1 as 0 | 1 };
const TITLE_SOURCE = "name";

// attr billing → key field pipeline 7 (lihat shared/pipelineBillingIntake.ts BILLING_ATTRS).
const FIELD_MAP_BY_KEY: { attr: string; fieldKey: string }[] = [
  { attr: "customer_id", fieldKey: "customer_id" },
  { attr: "phone", fieldKey: "phone" },
  { attr: "package", fieldKey: "package" },
  { attr: "billingPrice", fieldKey: "opened_amount" },
  { attr: "dueDate", fieldKey: "opened_due_date" },
  { attr: "billingStatus", fieldKey: "opened_billing_status" },
  { attr: "isolirDate", fieldKey: "opened_isolir_date" },
  { attr: "pppoeUsername", fieldKey: "pppoe_username" },
  { attr: "district", fieldKey: "district" },
  { attr: "village", fieldKey: "village" },
  { attr: "address", fieldKey: "address" },
  { attr: "coordinate", fieldKey: "coordinate" },
];

// Tabel anak kartu (by card_id) — wajib dibersihkan agar tak ada baris yatim.
const CARD_CHILD_TABLES = [
  "pipeline_card_comments",
  "pipeline_card_activity",
  "pipeline_card_values",
  "pipeline_card_followers",
  "pipeline_card_assignees",
  "pipeline_card_attachments",
  "card_relations",
  "lead_card_links",
];

const args = process.argv.slice(2);
const DO_WIPE = !args.includes("--no-wipe");
const ALLOW_PROD = args.includes("--allow-prod");

if (!process.env.DB_USER || !process.env.DB_NAME) {
  console.error("ERROR: DB_USER + DB_NAME wajib di-set (env / .env). Dev: DB_NAME=jabnet_fiber_dev.");
  process.exit(1);
}
const DB_NAME = process.env.DB_NAME!;
console.log(`[db] target = ${DB_NAME} @ ${process.env.DB_HOST ?? "127.0.0.1"}:${process.env.DB_PORT ?? 3306} | wipe=${DO_WIPE}`);
if (!/dev/i.test(DB_NAME) && !ALLOW_PROD) {
  console.error(`ERROR: DB_NAME="${DB_NAME}" tidak mengandung "dev". Tool ini MENGHAPUS kartu pipeline ${PIPELINE_ID}. Untuk sengaja jalan di prod, tambahkan --allow-prod.`);
  process.exit(1);
}

const pool = await mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
});

const nowIso = () => new Date().toISOString();
async function q(sql: string, params: any[] = []): Promise<any[]> {
  const [rows] = await pool.execute(sql, params);
  return rows as any[];
}

async function main() {
  // 0. pipeline ada?
  const pipe = await q(`SELECT id, name FROM pipelines WHERE mitra_id = ? AND id = ?`, [MITRA_ID, PIPELINE_ID]);
  if (!pipe.length) throw new Error(`Pipeline ${PIPELINE_ID} tidak ada di DB ini.`);
  console.log(`[pipeline] ${PIPELINE_ID} "${pipe[0].name}"`);

  // 1. resolve stage IDs by label
  const stages = await q(`SELECT id, label FROM pipeline_stages WHERE mitra_id = ? AND pipeline_id = ?`, [MITRA_ID, PIPELINE_ID]);
  const stageByLabel = new Map<string, number>(stages.map((s: any) => [String(s.label), Number(s.id)]));
  const entryStageId = stageByLabel.get(ENTRY_STAGE_LABEL);
  const resolveStageRow = stages.find((s: any) => String(s.label).trim().startsWith(RESOLVE_STAGE_PREFIX));
  const resolveStageId = resolveStageRow ? Number(resolveStageRow.id) : undefined;
  if (!entryStageId) throw new Error(`Stage entry "${ENTRY_STAGE_LABEL}" tidak ditemukan. Stage ada: ${[...stageByLabel.keys()].join(", ")}`);
  if (!resolveStageId) throw new Error(`Stage resolve (prefix "${RESOLVE_STAGE_PREFIX}") tidak ditemukan. Stage ada: ${[...stageByLabel.keys()].join(", ")}`);
  console.log(`[stages] entry="${ENTRY_STAGE_LABEL}"=${entryStageId} resolve="${resolveStageRow!.label}"=${resolveStageId}`);

  // 2. resolve field IDs by key
  const fields = await q(`SELECT id, \`key\` FROM pipeline_fields WHERE mitra_id = ? AND pipeline_id = ?`, [MITRA_ID, PIPELINE_ID]);
  const fieldByKey = new Map<string, number>(fields.map((f: any) => [String(f.key), Number(f.id)]));
  const fieldMap: { attr: string; targetFieldId: number }[] = [];
  for (const m of FIELD_MAP_BY_KEY) {
    const fid = fieldByKey.get(m.fieldKey);
    if (!fid) { console.warn(`[warn] field key "${m.fieldKey}" tidak ada — attr ${m.attr} dilewati`); continue; }
    fieldMap.push({ attr: m.attr, targetFieldId: fid });
  }
  console.log(`[fieldMap] ${fieldMap.length} mapping`);

  // 3. WIPE kartu pipeline 7 + anak-anaknya (REPLACE)
  if (DO_WIPE) {
    const cards = await q(`SELECT id FROM pipeline_cards WHERE mitra_id = ? AND pipeline_id = ?`, [MITRA_ID, PIPELINE_ID]);
    const cardIds = cards.map((c: any) => c.id);
    if (cardIds.length) {
      const ph = cardIds.map(() => "?").join(",");
      for (const t of CARD_CHILD_TABLES) {
        const r: any = await pool.execute(`DELETE FROM ${t} WHERE card_id IN (${ph})`, cardIds);
        const n = Number(r?.[0]?.affectedRows ?? 0);
        if (n) console.log(`  [wipe] ${t}: ${n}`);
      }
      // rule_fires by source_card_id
      const rf: any = await pool.execute(`DELETE FROM pipeline_rule_fires WHERE source_card_id IN (${ph})`, cardIds);
      if (Number(rf?.[0]?.affectedRows ?? 0)) console.log(`  [wipe] pipeline_rule_fires: ${rf[0].affectedRows}`);
      const dc: any = await pool.execute(`DELETE FROM pipeline_cards WHERE mitra_id = ? AND pipeline_id = ?`, [MITRA_ID, PIPELINE_ID]);
      console.log(`[wipe] pipeline_cards: ${Number(dc?.[0]?.affectedRows ?? 0)}`);
    } else {
      console.log(`[wipe] tidak ada kartu untuk dihapus`);
    }
  }

  // 4. hapus billing_sync rule lama di pipeline ini (idempotent)
  const existRules = await q(`SELECT id FROM pipeline_rules WHERE mitra_id = ? AND pipeline_id = ? AND trigger_type = 'billing_sync'`, [MITRA_ID, PIPELINE_ID]);
  for (const r of existRules) {
    await pool.execute(`DELETE FROM pipeline_rule_actions WHERE rule_id = ?`, [r.id]);
    await pool.execute(`DELETE FROM pipeline_rule_field_maps WHERE rule_id = ?`, [r.id]);
    await pool.execute(`DELETE FROM pipeline_rule_fires WHERE rule_id = ?`, [r.id]);
    await pool.execute(`DELETE FROM pipeline_rules WHERE id = ?`, [r.id]);
    console.log(`[rule] hapus billing_sync rule lama #${r.id}`);
  }

  // 5. insert rule (struktur identik dgn yg dihasilkan UI: rule row + 1 action row)
  const triggerConfig = JSON.stringify({ filter: FILTER, resolveStageId, titleSource: TITLE_SOURCE, fieldMap });
  const ins: any = await pool.execute(
    `INSERT INTO pipeline_rules
      (mitra_id, pipeline_id, name, trigger_stage_id, action_type, target_pipeline_id, target_stage_id,
       title_template, copy_assignee, enabled, created_by, created_at, action_config, conditions, trigger_type, trigger_config, recurrence)
     VALUES (?, ?, ?, NULL, 'create_card', NULL, ?, NULL, 0, 1, 1, ?, NULL, NULL, 'billing_sync', ?, 'once')`,
    [MITRA_ID, PIPELINE_ID, RULE_NAME, entryStageId, nowIso(), triggerConfig],
  );
  const ruleId = Number(ins?.[0]?.insertId);
  await pool.execute(
    `INSERT INTO pipeline_rule_actions
      (mitra_id, rule_id, position, action_type, target_pipeline_id, target_stage_id, title_template, copy_assignee, action_config, created_at)
     VALUES (?, ?, 0, 'create_card', NULL, ?, NULL, 0, NULL, ?)`,
    [MITRA_ID, ruleId, entryStageId, nowIso()],
  );

  console.log(`[done] rule billing_sync #${ruleId} → pipeline ${PIPELINE_ID}, entry stage ${entryStageId}, resolve stage ${resolveStageId}, filter=${JSON.stringify(FILTER)}, ${fieldMap.length} field-map. Kartu akan dibuat saat billing-sync berikutnya / "Sync Now".`);
}

main()
  .then(() => pool.end())
  .catch(async (e) => {
    console.error("[error]", e);
    await pool.end();
    process.exit(1);
  });
