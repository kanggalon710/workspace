import mysql from "mysql2/promise";
import { saveBase64Photo } from "../server/uploads.js";
import {
  COLLECTION_PIPELINE_STAGES,
  COLLECTION_PIPELINE_FIELDS,
  collectionToCard,
  collectionToFieldValues,
  resolveAssignee,
  resolveMultiAssignees,
  classifyCollectionActivity,
  collectionActivityToComment,
  collectionActivityToActivity,
  type CollectionRow,
  type CustomerLite,
  type CollectionStageRow,
  type CollectionActivityRow,
} from "./collectionsToPipeline.js";

const MITRA_ID = 1; // JABNET only
const PIPELINE_NAME = "Penagihan (Collections)";
const SENTINEL = "[collections-import]";
const PIPELINE_DESC = `Diimpor dari /collections (snapshot). ${SENTINEL}`;

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(
    [
      "Usage: node import-collections.mjs [--reset] [--default-assignee <userId>]",
      "",
      "  Snapshot-import JABNET (mitra 1) collections into a 'Penagihan (Collections)' pipeline",
      "  on the DB given by DB_* env vars (use DB_NAME=jabnet_fiber for prod).",
      "",
      "  --reset   delete a previously-imported pipeline (matched by sentinel) then re-import.",
      "  --default-assignee <userId>   fallback assignee when a collection's assignee isn't a JABNET user.",
      "",
      "  Photos: collection_activities.photo_data (base64) are written to the filesystem via",
      "  saveBase64Photo — set JABNET_PRIVATE_ROOT (or JABNET_UPLOAD_ROOT) so they land in the",
      "  private uploads dir, not ./uploads.",
    ].join("\n"),
  );
  process.exit(0);
}
const RESET = args.includes("--reset");
const daIdx = args.indexOf("--default-assignee");
const defaultAssignee = daIdx >= 0 ? Number(args[daIdx + 1]) : null;
if (daIdx >= 0 && (!Number.isInteger(defaultAssignee as number) || (defaultAssignee as number) <= 0)) {
  console.error("ERROR: --default-assignee harus userId integer > 0.");
  process.exit(1);
}

if (!process.env.DB_USER || !process.env.DB_NAME) {
  console.error("ERROR: DB_USER + DB_NAME wajib di-set (env). Prod: DB_NAME=jabnet_fiber.");
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
  const existing = await q(
    `SELECT id FROM pipelines WHERE mitra_id = ? AND name = ? AND description LIKE ?`,
    [MITRA_ID, PIPELINE_NAME, `%${SENTINEL}%`],
  );
  if (existing.length) {
    if (!RESET) {
      console.error(`Pipeline "${PIPELINE_NAME}" sudah ada (id ${existing[0].id}). Pakai --reset untuk re-import.`);
      process.exit(1);
    }
    const pid = existing[0].id as number;
    const cards = await q(`SELECT id FROM pipeline_cards WHERE mitra_id = ? AND pipeline_id = ?`, [MITRA_ID, pid]);
    const cardIds = cards.map((c: any) => c.id);
    if (cardIds.length) {
      const ph = cardIds.map(() => "?").join(",");
      for (const t of ["pipeline_card_comments", "pipeline_card_activity", "pipeline_card_values", "pipeline_card_followers"]) {
        await q(`DELETE FROM ${t} WHERE mitra_id = ? AND card_id IN (${ph})`, [MITRA_ID, ...cardIds]);
      }
    }
    await q(`DELETE FROM pipeline_cards WHERE mitra_id = ? AND pipeline_id = ?`, [MITRA_ID, pid]);
    const rules = await q(`SELECT id FROM pipeline_rules WHERE mitra_id = ? AND pipeline_id = ?`, [MITRA_ID, pid]);
    const ruleIds = rules.map((r: any) => r.id);
    if (ruleIds.length) {
      const rph = ruleIds.map(() => "?").join(",");
      for (const t of ["pipeline_rule_field_maps", "pipeline_rule_fires", "pipeline_rule_actions"]) {
        await q(`DELETE FROM ${t} WHERE mitra_id = ? AND rule_id IN (${rph})`, [MITRA_ID, ...ruleIds]);
      }
    }
    await q(`DELETE FROM pipeline_rules WHERE mitra_id = ? AND pipeline_id = ?`, [MITRA_ID, pid]);
    await q(`DELETE FROM pipeline_fields WHERE mitra_id = ? AND pipeline_id = ?`, [MITRA_ID, pid]);
    await q(`DELETE FROM pipeline_access WHERE mitra_id = ? AND pipeline_id = ?`, [MITRA_ID, pid]);
    await q(`DELETE FROM pipeline_stages WHERE mitra_id = ? AND pipeline_id = ?`, [MITRA_ID, pid]);
    await q(`DELETE FROM pipelines WHERE mitra_id = ? AND id = ?`, [MITRA_ID, pid]);
    console.log(`[reset] deleted prior pipeline id ${pid} + children`);
  }

  // Resolve mitra slug for photo paths.
  const mitraRows = await q(`SELECT slug FROM mitras WHERE id = ?`, [MITRA_ID]);
  const slug: string = (mitraRows[0]?.slug as string) || "jabnet";

  const us = await q(`SELECT id FROM users ORDER BY id ASC LIMIT 1`);
  const SYSTEM_USER: number = us.length ? us[0].id : 1;

  const userRows = await q(`SELECT DISTINCT user_id FROM user_mitras WHERE mitra_id = ?`, [MITRA_ID]);
  const validUserIds = new Set<number>(userRows.map((r: any) => Number(r.user_id)));

  const pr = await q(
    `INSERT INTO pipelines (mitra_id, name, description, color, icon, position, is_archived, restricted, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, ?)`,
    [MITRA_ID, PIPELINE_NAME, PIPELINE_DESC, "#F59E0B", "banknote", SYSTEM_USER, nowIso()],
  );
  const pipelineId = (pr as any).insertId as number;

  const stageRows = (await q(
    `SELECT \`key\`, label, color, position, role FROM collection_stages WHERE mitra_id = ? ORDER BY position ASC`,
    [MITRA_ID],
  )) as CollectionStageRow[];
  const stages = COLLECTION_PIPELINE_STAGES(stageRows);
  const firstStageKey = stages[0].key;
  const stageIdByKey: Record<string, number> = {};
  for (const s of stages) {
    const r = await q(
      `INSERT INTO pipeline_stages (mitra_id, pipeline_id, label, color, position, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [MITRA_ID, pipelineId, s.label, s.color, s.position, nowIso()],
    );
    stageIdByKey[s.key] = (r as any).insertId;
  }

  const fieldIdByKey: Record<string, number> = {};
  for (const f of COLLECTION_PIPELINE_FIELDS) {
    const r = await q(
      `INSERT INTO pipeline_fields (mitra_id, pipeline_id, \`key\`, label, type, options, config, required, show_on_card, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [
        MITRA_ID, pipelineId, f.key, f.label, f.type,
        f.options ? JSON.stringify(f.options) : null,
        f.config ? JSON.stringify(f.config) : null,
        f.showOnCard ? 1 : 0, f.position, nowIso(),
      ],
    );
    fieldIdByKey[f.key] = (r as any).insertId;
  }

  const rows = await q(
    `SELECT c.*, cu.name AS cust_name, cu.customer_id AS cust_billing_id, cu.phone AS cust_phone,
            cu.pppoe_username AS cust_pppoe,
            cu.package AS cust_package, cu.address AS cust_address, cu.district AS cust_district,
            cu.village AS cust_village, cu.lat AS cust_lat, cu.lng AS cust_lng
     FROM collections c LEFT JOIN customers cu ON cu.id = c.customer_id
     WHERE c.mitra_id = ? ORDER BY c.id ASC`,
    [MITRA_ID],
  );

  let nCards = 0, nValues = 0, nComments = 0, nActivity = 0, nPhotos = 0, nPhotoFailed = 0, nCoord = 0;
  let nAssignMatched = 0, nAssignDefault = 0, nAssignSkipped = 0, nMulti = 0;

  for (const r of rows) {
    const col = r as CollectionRow;
    const customer: CustomerLite = {
      name: r.cust_name, customer_id: r.cust_billing_id, phone: r.cust_phone,
      pppoe_username: r.cust_pppoe,
      package: r.cust_package, address: r.cust_address, district: r.cust_district,
      village: r.cust_village, lat: r.cust_lat, lng: r.cust_lng,
    };

    const assigneeId = resolveAssignee(col.assigned_to ?? null, validUserIds, defaultAssignee);
    if (assigneeId != null && assigneeId === (col.assigned_to ?? null)) nAssignMatched++;
    else if (assigneeId != null) nAssignDefault++;
    else nAssignSkipped++;

    const c = collectionToCard(col, customer, stageIdByKey, firstStageKey, assigneeId);
    const cr = await q(
      `INSERT INTO pipeline_cards (mitra_id, pipeline_id, stage_id, title, assignee_id, priority, position, created_by, created_at, stage_entered_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [MITRA_ID, pipelineId, c.stageId, c.title, c.assigneeId, c.priority, c.createdBy ?? SYSTEM_USER, c.createdAt, c.stageEnteredAt],
    );
    const cardId = (cr as any).insertId as number;
    nCards++;

    for (const v of collectionToFieldValues(col, customer)) {
      const fid = fieldIdByKey[v.fieldKey];
      if (!fid) continue;
      await q(
        `INSERT INTO pipeline_card_values (mitra_id, card_id, field_id, value, created_at) VALUES (?, ?, ?, ?, ?)`,
        [MITRA_ID, cardId, fid, v.value, nowIso()],
      );
      nValues++;
      if (v.fieldKey === "coordinate") nCoord++;
    }

    // Multi-assignee field value (JSON array of valid user ids).
    const assigneeRows = await q(
      `SELECT user_id FROM collection_assignees WHERE mitra_id = ? AND collection_id = ?`,
      [MITRA_ID, col.id],
    );
    const multiIds = resolveMultiAssignees(assigneeRows as { user_id: number }[], validUserIds);
    if (multiIds.length && fieldIdByKey["assignees"]) {
      await q(
        `INSERT INTO pipeline_card_values (mitra_id, card_id, field_id, value, created_at) VALUES (?, ?, ?, ?, ?)`,
        [MITRA_ID, cardId, fieldIdByKey["assignees"], JSON.stringify(multiIds), nowIso()],
      );
      nValues++; nMulti++;
    }

    const acts = (await q(
      `SELECT * FROM collection_activities WHERE collection_id = ? ORDER BY id ASC`,
      [col.id],
    )) as CollectionActivityRow[];
    for (const a of acts) {
      if (classifyCollectionActivity(a.type) === "comment") {
        const cm = collectionActivityToComment(a);
        let photoPath: string | null = null;
        if (a.photo_data) {
          try {
            photoPath = await saveBase64Photo(slug, "collections", a.id, a.photo_data);
            nPhotos++;
          } catch {
            nPhotoFailed++;
          }
        }
        await q(
          `INSERT INTO pipeline_card_comments (mitra_id, card_id, author_id, body, photo_path, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
          [MITRA_ID, cardId, cm.authorId ?? SYSTEM_USER, cm.body, photoPath, cm.createdAt],
        );
        nComments++;
      } else {
        const av = collectionActivityToActivity(a);
        await q(
          `INSERT INTO pipeline_card_activity (mitra_id, card_id, actor_id, type, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
          [MITRA_ID, cardId, av.actorId ?? SYSTEM_USER, av.type, av.detail, av.createdAt],
        );
        nActivity++;
      }
    }
  }

  console.log(
    `[done] pipeline ${pipelineId} "${PIPELINE_NAME}": ` +
      `${nCards} cards, ${nValues} field-values (${nMulti} multi-assignee, ${nCoord} coordinates), ` +
      `${nComments} comments (${nPhotos} photos written, ${nPhotoFailed} failed), ${nActivity} activity rows; ` +
      `assignees: ${nAssignMatched} matched, ${nAssignDefault} default, ${nAssignSkipped} unassigned.`,
  );
}

main()
  .then(() => pool.end())
  .catch(async (e) => {
    console.error("[error]", e);
    await pool.end();
    process.exit(1);
  });
