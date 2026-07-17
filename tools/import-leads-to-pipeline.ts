// Load DB creds the same way the server does (dotenv from JABNET_PRIVATE_ROOT/config/.env
// or HOME/private/fiber-jabnet/config/.env). Lets this run on cPanel without re-typing creds;
// explicit DB_* env still wins (dotenv never overrides already-set vars). MUST be first import.
import "../server/config.js";
import mysql from "mysql2/promise";
import { LEAD_STAGES } from "../shared/schema.js";
import {
  LEAD_PIPELINE_STAGES,
  LEAD_PIPELINE_FIELDS,
  leadToCard,
  leadToFieldValues,
  resolveAssignee,
  classifyActivity,
  activityToComment,
  activityToActivity,
  type LeadRow,
  type ActivityRow,
} from "./leadsToPipeline.js";

const MITRA_ID = 1; // JABNET only
const PIPELINE_NAME = "Leads (Marketing)";
const SENTINEL = "[leads-import]";
const PIPELINE_DESC = `Diimpor dari /leads (snapshot). ${SENTINEL}`;

// Lead attribute → created-field key map for the lead_created automation rule's fieldMap.
// Only attrs whose type is compatible with the field we create (see shared/leadIntake LEAD_ATTRS).
// odpId/loss_reason/source_lead_id intentionally omitted (no compatible attr or field type mismatch).
const RULE_FIELD_ATTRS: { attr: string; key: string }[] = [
  { attr: "phone", key: "phone" },
  { attr: "source", key: "source" },
  { attr: "category", key: "category" },
  { attr: "district", key: "district" },
  { attr: "village", key: "village" },
  { attr: "address", key: "address" },
  { attr: "notes", key: "notes" },
  { attr: "distanceMeters", key: "distance_m" },
  { attr: "coordinate", key: "coordinate" },
];

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(
    [
      "Usage: node import-leads-to-pipeline.mjs [--pipeline <id>] [--reset] [--with-rule] [--default-assignee <userId>]",
      "       (dev: bundle .mjs + run on cPanel, or npx tsx tools/import-leads-to-pipeline.ts ...)",
      "",
      "  Snapshot-import JABNET (mitra 1) leads as cards. DB from DB_* env or the app's config/.env",
      "  (dev: DB_NAME=jabnet_fiber_dev). Two modes:",
      "",
      "  (default)            create a fresh 'Leads (Marketing)' pipeline (matched by sentinel).",
      "  --pipeline <id>      import INTO an existing pipeline; its stages/fields/cards/rules are",
      "                       REPLACED with the lead shape (requires --reset to confirm the wipe).",
      "",
      "  --reset              wipe the target pipeline's contents before importing.",
      "                         · default mode: drops the prior sentinel pipeline, re-creates it.",
      "                         · --pipeline mode: clears the existing pipeline (row kept) then rebuilds.",
      "  --with-rule          also create a 'lead_created' automation rule on the pipeline so NEW",
      "                       leads auto-create a card in the entry stage (dedup by lead_id).",
      "  --allow-prod         allow running when DB_NAME does NOT contain 'dev' (production guard).",
      "  --default-assignee <userId>   fallback assignee when a lead's assignee isn't a JABNET user.",
      "",
      "  Photos: references existing lead activity photoPath files only; legacy base64-only photos",
      "  are skipped (never writes photo files).",
    ].join("\n"),
  );
  process.exit(0);
}
const RESET = args.includes("--reset");
const WITH_RULE = args.includes("--with-rule");
const pipIdx = args.indexOf("--pipeline");
const targetPipelineId = pipIdx >= 0 ? Number(args[pipIdx + 1]) : null;
if (pipIdx >= 0 && (!Number.isInteger(targetPipelineId as number) || (targetPipelineId as number) <= 0)) {
  console.error("ERROR: --pipeline harus id pipeline integer > 0.");
  process.exit(1);
}
const daIdx = args.indexOf("--default-assignee");
const defaultAssignee = daIdx >= 0 ? Number(args[daIdx + 1]) : null;
if (daIdx >= 0 && (!Number.isInteger(defaultAssignee as number) || (defaultAssignee as number) <= 0)) {
  console.error("ERROR: --default-assignee harus userId integer > 0.");
  process.exit(1);
}

if (!process.env.DB_USER || !process.env.DB_NAME) {
  console.error("ERROR: DB_USER + DB_NAME wajib di-set (env / config .env). Dev: DB_NAME=jabnet_fiber_dev.");
  process.exit(1);
}

// Destructive tool: refuse non-dev DBs unless explicitly confirmed, so a misconfigured
// JABNET_PRIVATE_ROOT (which falls back to the PROD .env) can't silently wipe prod's pipeline.
const DB_NAME = process.env.DB_NAME;
const ALLOW_PROD = args.includes("--allow-prod");
console.log(`[db] target = ${DB_NAME} @ ${process.env.DB_HOST ?? "127.0.0.1"}:${process.env.DB_PORT ?? 3306}`);
if (!/dev/i.test(DB_NAME) && !ALLOW_PROD) {
  console.error(
    `ERROR: DB_NAME="${DB_NAME}" tidak mengandung "dev" — tool ini MENGGANTI isi pipeline. ` +
      `Untuk sengaja jalan di DB produksi, tambahkan --allow-prod.`,
  );
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

/** Card-level child rows keyed by card_id (mitra-scoped), plus rule_fires keyed by source_card_id. */
async function deleteCardChildren(cardIds: number[]) {
  if (!cardIds.length) return;
  const ph = cardIds.map(() => "?").join(",");
  for (const t of [
    "pipeline_card_comments",
    "pipeline_card_activity",
    "pipeline_card_values",
    "pipeline_card_followers",
    "pipeline_card_assignees",
    "pipeline_card_attachments",
    "lead_card_links",
    "card_relations",
  ]) {
    await q(`DELETE FROM ${t} WHERE mitra_id = ? AND card_id IN (${ph})`, [MITRA_ID, ...cardIds]);
  }
  await q(`DELETE FROM pipeline_rule_fires WHERE mitra_id = ? AND source_card_id IN (${ph})`, [MITRA_ID, ...cardIds]);
}

/** Rule rows + their children for one pipeline. */
async function deletePipelineRules(pid: number) {
  const rules = await q(`SELECT id FROM pipeline_rules WHERE mitra_id = ? AND pipeline_id = ?`, [MITRA_ID, pid]);
  const ruleIds = rules.map((r: any) => r.id);
  if (ruleIds.length) {
    const rph = ruleIds.map(() => "?").join(",");
    for (const t of ["pipeline_rule_field_maps", "pipeline_rule_fires", "pipeline_rule_actions"]) {
      await q(`DELETE FROM ${t} WHERE mitra_id = ? AND rule_id IN (${rph})`, [MITRA_ID, ...ruleIds]);
    }
  }
  await q(`DELETE FROM pipeline_rules WHERE mitra_id = ? AND pipeline_id = ?`, [MITRA_ID, pid]);
}

/** Wipe a pipeline's contents. keepRow=true keeps the `pipelines` row + its access ACL (used when
 *  importing INTO an existing pipeline); false drops the whole pipeline (used in default sentinel mode). */
async function wipePipeline(pid: number, keepRow: boolean) {
  const cards = await q(`SELECT id FROM pipeline_cards WHERE mitra_id = ? AND pipeline_id = ?`, [MITRA_ID, pid]);
  await deleteCardChildren(cards.map((c: any) => c.id));
  await q(`DELETE FROM pipeline_cards WHERE mitra_id = ? AND pipeline_id = ?`, [MITRA_ID, pid]);
  await deletePipelineRules(pid);
  await q(`DELETE FROM pipeline_fields WHERE mitra_id = ? AND pipeline_id = ?`, [MITRA_ID, pid]);
  await q(`DELETE FROM pipeline_stages WHERE mitra_id = ? AND pipeline_id = ?`, [MITRA_ID, pid]);
  if (!keepRow) {
    await q(`DELETE FROM pipeline_access WHERE mitra_id = ? AND pipeline_id = ?`, [MITRA_ID, pid]);
    await q(`DELETE FROM pipelines WHERE mitra_id = ? AND id = ?`, [MITRA_ID, pid]);
  }
}

/** Create the 6 lead stages + lead fields under a pipeline. Returns id maps. */
async function buildStructure(pipelineId: number) {
  const stageIdByKey: Record<string, number> = {};
  for (const s of LEAD_PIPELINE_STAGES()) {
    const r = await q(
      `INSERT INTO pipeline_stages (mitra_id, pipeline_id, label, color, position, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [MITRA_ID, pipelineId, s.label, s.color, s.position, nowIso()],
    );
    stageIdByKey[s.key] = (r as any).insertId;
  }
  const fieldIdByKey: Record<string, number> = {};
  for (const f of LEAD_PIPELINE_FIELDS) {
    const r = await q(
      `INSERT INTO pipeline_fields (mitra_id, pipeline_id, \`key\`, label, type, options, required, show_on_card, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [MITRA_ID, pipelineId, f.key, f.label, f.type, f.options ? JSON.stringify(f.options) : null, f.showOnCard ? 1 : 0, f.position, nowIso()],
    );
    fieldIdByKey[f.key] = (r as any).insertId;
  }
  return { stageIdByKey, fieldIdByKey };
}

/** Insert a lead_created automation rule so NEW leads auto-create a card in the entry stage. */
async function createLeadRule(pipelineId: number, stageIdByKey: Record<string, number>, fieldIdByKey: Record<string, number>, userId: number) {
  const entryStageId = stageIdByKey[LEAD_STAGES[0]];
  const fieldMap = RULE_FIELD_ATTRS
    .filter((m) => fieldIdByKey[m.key] != null)
    .map((m) => ({ attr: m.attr, targetFieldId: fieldIdByKey[m.key] }));
  const triggerConfig = {
    sources: [] as string[], // empty = match all lead sources
    entryStageId,
    titleSource: "name",
    fieldMap,
    onDuplicate: "ignore", // skip if a card already linked to this lead by this rule
    dedupBy: "lead_id",
    reopenStageId: null,
  };
  await q(
    `INSERT INTO pipeline_rules
       (mitra_id, pipeline_id, name, trigger_type, trigger_config, action_type, copy_assignee, enabled, conditions, recurrence, created_by, created_at)
     VALUES (?, ?, ?, 'lead_created', ?, 'create_card', 0, 1, NULL, 'once', ?, ?)`,
    [MITRA_ID, pipelineId, "Auto: lead baru → kartu", JSON.stringify(triggerConfig), userId, nowIso()],
  );
  return { entryStageId, fieldMapCount: fieldMap.length };
}

async function main() {
  if (targetPipelineId != null && !RESET) {
    console.error(
      `ERROR: --pipeline ${targetPipelineId} akan MENGGANTI isi pipeline tsb (stage/field/kartu/rule). ` +
        `Tambahkan --reset untuk konfirmasi.`,
    );
    process.exit(1);
  }

  let pipelineId: number;
  let pipelineLabel: string;

  if (targetPipelineId != null) {
    // --- Mode: import INTO an existing pipeline (row kept, contents replaced) ---
    const existing = await q(`SELECT id, name FROM pipelines WHERE mitra_id = ? AND id = ?`, [MITRA_ID, targetPipelineId]);
    if (!existing.length) {
      console.error(`ERROR: pipeline id ${targetPipelineId} tidak ada untuk mitra ${MITRA_ID}.`);
      process.exit(1);
    }
    pipelineId = targetPipelineId;
    pipelineLabel = existing[0].name;
    await wipePipeline(pipelineId, /* keepRow */ true);
    console.log(`[reset] cleared existing pipeline id ${pipelineId} ("${pipelineLabel}") contents (row + access kept)`);
  } else {
    // --- Mode: create a fresh sentinel pipeline (legacy behavior) ---
    const existing = await q(
      `SELECT id FROM pipelines WHERE mitra_id = ? AND name = ? AND description LIKE ?`,
      [MITRA_ID, PIPELINE_NAME, `%${SENTINEL}%`],
    );
    if (existing.length) {
      if (!RESET) {
        console.error(`Pipeline "${PIPELINE_NAME}" sudah ada (id ${existing[0].id}). Pakai --reset untuk re-import.`);
        process.exit(1);
      }
      await wipePipeline(existing[0].id as number, /* keepRow */ false);
      console.log(`[reset] deleted prior pipeline id ${existing[0].id} + children`);
    }
    pipelineLabel = PIPELINE_NAME;
  }

  const us = await q(`SELECT id FROM users ORDER BY id ASC LIMIT 1`);
  const SYSTEM_USER: number = us.length ? us[0].id : 1;

  const userRows = await q(`SELECT DISTINCT user_id FROM user_mitras WHERE mitra_id = ?`, [MITRA_ID]);
  const validUserIds = new Set<number>(userRows.map((r: any) => Number(r.user_id)));

  if (targetPipelineId == null) {
    const pr = await q(
      `INSERT INTO pipelines (mitra_id, name, description, color, icon, position, is_archived, restricted, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, ?)`,
      [MITRA_ID, PIPELINE_NAME, PIPELINE_DESC, "#8B5CF6", "target", SYSTEM_USER, nowIso()],
    );
    pipelineId = (pr as any).insertId as number;
  }

  const { stageIdByKey, fieldIdByKey } = await buildStructure(pipelineId!);

  const leads = (await q(`SELECT * FROM leads WHERE mitra_id = ? ORDER BY id ASC`, [MITRA_ID])) as LeadRow[];
  let nCards = 0, nValues = 0, nComments = 0, nActivity = 0, nPhotos = 0, nPhotoSkipped = 0, nLinks = 0;
  let nAssignMatched = 0, nAssignDefault = 0, nAssignSkipped = 0, nCoord = 0;
  for (const lead of leads) {
    const assigneeId = resolveAssignee(lead.assigned_to ?? null, validUserIds, defaultAssignee);
    if (assigneeId != null && assigneeId === (lead.assigned_to ?? null)) nAssignMatched++;
    else if (assigneeId != null) nAssignDefault++;
    else nAssignSkipped++;
    const c = leadToCard(lead, stageIdByKey, assigneeId);
    const cr = await q(
      `INSERT INTO pipeline_cards (mitra_id, pipeline_id, stage_id, title, assignee_id, priority, position, created_by, created_at, stage_entered_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [MITRA_ID, pipelineId!, c.stageId, c.title, c.assigneeId, c.priority, c.createdBy ?? SYSTEM_USER, c.createdAt, c.stageEnteredAt],
    );
    const cardId = (cr as any).insertId as number;
    nCards++;

    // Traceability link lead→card (ruleId=null: snapshot import, not rule-created).
    await q(
      `INSERT INTO lead_card_links (mitra_id, lead_id, card_id, rule_id, created_at) VALUES (?, ?, ?, NULL, ?)`,
      [MITRA_ID, lead.id, cardId, nowIso()],
    );
    nLinks++;

    for (const v of leadToFieldValues(lead)) {
      const fid = fieldIdByKey[v.fieldKey];
      if (!fid) continue;
      await q(
        `INSERT INTO pipeline_card_values (mitra_id, card_id, field_id, value, created_at) VALUES (?, ?, ?, ?, ?)`,
        [MITRA_ID, cardId, fid, v.value, nowIso()],
      );
      nValues++;
      if (v.fieldKey === "coordinate") nCoord++;
    }

    const acts = (await q(`SELECT * FROM lead_activities WHERE lead_id = ? ORDER BY id ASC`, [lead.id])) as ActivityRow[];
    for (const a of acts) {
      if (classifyActivity(a.type) === "comment") {
        const cm = activityToComment(a);
        let photoPath: string | null = null;
        if (a.photo_path) { photoPath = a.photo_path; nPhotos++; }
        else if (a.photo_data) { nPhotoSkipped++; }
        await q(
          `INSERT INTO pipeline_card_comments (mitra_id, card_id, author_id, body, photo_path, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
          [MITRA_ID, cardId, cm.authorId ?? SYSTEM_USER, cm.body, photoPath, cm.createdAt],
        );
        nComments++;
      } else {
        const av = activityToActivity(a);
        await q(
          `INSERT INTO pipeline_card_activity (mitra_id, card_id, actor_id, type, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
          [MITRA_ID, cardId, av.actorId ?? SYSTEM_USER, av.type, av.detail, av.createdAt],
        );
        nActivity++;
      }
    }
  }

  let ruleNote = "";
  if (WITH_RULE) {
    const { entryStageId, fieldMapCount } = await createLeadRule(pipelineId!, stageIdByKey, fieldIdByKey, SYSTEM_USER);
    ruleNote = `; rule lead_created → stage ${entryStageId} (${fieldMapCount} field-map)`;
  }

  console.log(
    `[done] pipeline ${pipelineId} "${pipelineLabel}": ` +
      `${nCards} cards, ${nLinks} lead-links, ${nValues} field-values, ${nComments} comments ` +
      `(${nPhotos} photos linked, ${nPhotoSkipped} base64 skipped), ${nActivity} activity rows` +
      `, ${nCoord} coordinates` +
      `; assignees: ${nAssignMatched} matched, ${nAssignDefault} default, ${nAssignSkipped} unassigned` +
      ruleNote + ".",
  );
}

main()
  .then(() => pool.end())
  .catch(async (e) => {
    console.error("[error]", e);
    await pool.end();
    process.exit(1);
  });
