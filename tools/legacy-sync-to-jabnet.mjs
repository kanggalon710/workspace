#!/usr/bin/env node
/**
 * Legacy prod SQLite → cPanel MySQL (mitra=1 / JABNET) sync.
 *
 * Re-runnable: setiap kali jalan, wipe mitra_id=1 di tabel target lalu re-insert
 * semua data dari SQLite legacy. Idempotent — bisa di-run berkali-kali sampai
 * cutover final. Data mitra lain (mitra_id != 1) di cPanel tidak di-touch.
 *
 * Yang DI-MIGRATE: asset network (pops/odcs/odps/poles/cables/...), customers,
 * leads, canvassing, collections, tickets, loyalty, audit_logs, notifications.
 *
 * Yang TIDAK di-touch: users (cPanel users dipertahankan; old user IDs di-remap
 * by username), roles, mitras, user_mitras, mitra_integrations, mpwa_templates,
 * mikrotik_routers, wa_devices, wa_inbox, app_settings, chatwoot_*, api_keys,
 * broadcast_*, network_alarms, traffic_snapshots, customer_otps,
 * customer_portal_sessions.
 *
 * Usage:
 *   # Run dari cPanel (DB_* dari .env):
 *   node tools/legacy-sync-to-jabnet.mjs --src ./legacy-data.db
 *
 *   # Run dari lokal via SSH tunnel ke cPanel MySQL:
 *   ssh -L 3307:127.0.0.1:3306 jabnet@103.194.47.165   # terminal lain
 *   DB_HOST=127.0.0.1 DB_PORT=3307 DB_USER=jabnet_crm_user \\
 *     DB_PASSWORD='Galon@12345' DB_NAME=jabnet_fiber \\
 *     node tools/legacy-sync-to-jabnet.mjs --src ./legacy-data.db
 *
 * Flags:
 *   --src <path>     Path ke SQLite legacy (default ./legacy-data.db)
 *   --dry-run        Print plan + counts, jangan tulis ke MySQL
 *   --only <tbl,..>  Hanya tabel tertentu (debug)
 *   --skip <tbl,..>  Skip tabel tertentu (tambahan dari default skip list)
 *   --no-backup      Lewati mysqldump backup mitra=1 (untuk SSH tunnel atau dev)
 *   --verbose        Print setiap row insert (sangat noisy)
 */

import Database from "better-sqlite3";
import mysql from "mysql2/promise";
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { argv, exit } from "node:process";

// ── Parse args ─────────────────────────────────────────────────────────────
const args = {};
for (let i = 2; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) {
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) { args[key] = next; i++; }
    else args[key] = true;
  }
}
const srcPath = args.src || "./legacy-data.db";
const dryRun = !!args["dry-run"];
const verbose = !!args.verbose;
const noBackup = !!args["no-backup"];
const onlyTables = (args.only ?? "").split(",").filter(Boolean);
const extraSkip = (args.skip ?? "").split(",").filter(Boolean);

// ── Load env ───────────────────────────────────────────────────────────────
const privateRoot = process.env.JABNET_PRIVATE_ROOT;
if (privateRoot) loadEnv({ path: path.join(privateRoot, "config", ".env") });
else loadEnv();

const dbConfig = {
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  socketPath: process.env.DB_SOCKET || undefined,
};
if (!dbConfig.user || !dbConfig.database) {
  console.error("ERROR: DB_USER dan DB_NAME wajib di-set (via .env atau env var).");
  exit(1);
}

// ── Table config: order = topological (parent → child) ─────────────────────
// fk: { col → refTable } - remap via idMap
// userCols: [col, ...] - remap via userIdMap (by username match)
// poly: [{ typeCol, idCol, map: { typeValue → refTable } }] - polymorphic FK
// pkCol: nama PK column kalau bukan "id" (e.g. customer_loyalty.customer_id)
// skipPkRemap: true kalau pkCol = FK ke parent table (jangan add ke idMap sebagai source-of-truth)
const TABLES = [
  // Tier 0 — no FK to migrated tables
  { name: "pops" },
  { name: "poles" },
  { name: "cables" },
  { name: "prospects" },
  { name: "ticket_categories" },
  { name: "phonebooks", userCols: ["created_by"] },
  // Tier 1
  { name: "odcs", fk: { pop_id: "pops" } },
  { name: "otbs", fk: { pop_id: "pops" } },
  {
    name: "cable_cores",
    fk: { cable_id: "cables" },
    // global_core_number = (tube-1)*12 + core, NOT NULL di MySQL schema baru, gak ada di SQLite lama
    extraCols: { global_core_number: (row) => ((Number(row.tube_number) || 1) - 1) * 12 + (Number(row.core_number) || 0) },
  },
  { name: "canvassing_sessions", userCols: ["user_id"] },
  { name: "announcements", userCols: ["created_by", "published_by"] },
  { name: "phonebook_contacts", fk: { phonebook_id: "phonebooks" } },
  { name: "ad_campaigns", userCols: ["created_by"] },
  // Tier 2
  { name: "odps", fk: { odc_id: "odcs" } },
  { name: "bestrays", fk: { odc_id: "odcs" } },
  { name: "canvassing_logs", fk: { session_id: "canvassing_sessions" }, userCols: ["user_id"] },
  // Tier 3
  {
    name: "leads",
    fk: { odp_id: "odps", prospect_id: "prospects", canvassing_session_id: "canvassing_sessions" },
    userCols: ["created_by", "assigned_to", "assigned_by"],
  },
  // Tier 4
  { name: "customers", fk: { odp_id: "odps", lead_id: "leads" } },
  // Tier 5
  { name: "lead_activities", fk: { lead_id: "leads" }, userCols: ["user_id"] },
  {
    name: "splitters",
    poly: [{ typeCol: "parent_type", idCol: "parent_id", map: { pop: "pops", odc: "odcs", odp: "odps", otb: "otbs" } }],
  },
  {
    name: "core_connections",
    poly: [
      { typeCol: "from_type", idCol: "from_id", map: { cable: "cables", pop: "pops", odc: "odcs", odp: "odps", otb: "otbs" } },
      { typeCol: "to_type",   idCol: "to_id",   map: { cable: "cables", pop: "pops", odc: "odcs", odp: "odps", otb: "otbs" } },
    ],
  },
  { name: "tickets", fk: { customer_id: "customers", category_id: "ticket_categories" }, userCols: ["created_by", "assigned_to"] },
  { name: "collections", fk: { customer_id: "customers" } },
  { name: "customer_loyalty", pkCol: "customer_id", skipPkRemap: true, fk: { customer_id: "customers" } },
  { name: "customer_referrals", fk: { referrer_customer_id: "customers", referee_customer_id: "customers" } },
  { name: "customer_discounts", fk: { customer_id: "customers" } },
  { name: "point_transactions", fk: { customer_id: "customers" } },
  { name: "point_redemptions", fk: { customer_id: "customers" } },
  { name: "notifications", userCols: ["user_id"] },
  { name: "audit_logs", userCols: ["user_id"] }, // entity_id polymorphic — leave as-is (history record only)
  { name: "bug_reports", userCols: ["reported_by", "assigned_to"] },
  // Tier 6
  { name: "collection_activities", fk: { collection_id: "collections" }, userCols: ["user_id"] },
  { name: "ticket_activities", fk: { ticket_id: "tickets" }, userCols: ["user_id"] },
  { name: "ticket_comments", fk: { ticket_id: "tickets" }, userCols: ["author_id"] },
  { name: "ticket_team", fk: { ticket_id: "tickets" }, userCols: ["user_id"] },
  { name: "ticket_evidence", fk: { ticket_id: "tickets" }, userCols: ["uploaded_by"] },
  { name: "ticket_gps_logs", fk: { ticket_id: "tickets" }, userCols: ["user_id"] },
  { name: "ticket_csat", fk: { ticket_id: "tickets", customer_id: "customers" } },
  { name: "ticket_sla_escalations", fk: { ticket_id: "tickets" } },
  { name: "ticket_pauses", fk: { ticket_id: "tickets" }, userCols: ["created_by"] },
  { name: "ticket_stage_edit_log", fk: { ticket_id: "tickets" }, userCols: ["user_id"] },
  { name: "ticket_stage_transitions", fk: { ticket_id: "tickets" }, userCols: ["user_id"] },
  { name: "ticket_checkpoints", fk: { ticket_id: "tickets" } },
  { name: "bug_comments", fk: { bug_id: "bug_reports" }, userCols: ["author_id"] },
];

// Tabel SKIP — tidak di-migrate (mitra-shared infra / per-tenant cPanel-managed)
const DEFAULT_SKIP = new Set([
  "users", "roles", "mitras", "user_mitras", "mitra_integrations",
  "mpwa_templates", "mikrotik_routers", "wa_devices", "wa_inbox",
  "app_settings", "chatwoot_config", "chatwoot_keyword_rules", "chatwoot_ticket_links",
  "api_keys", "api_key_usage_logs",
  "broadcast_campaigns", "broadcast_recipients", "broadcast_segments",
  "network_alarms", "traffic_snapshots", "customer_otps", "customer_portal_sessions",
  "odp_scrape_cache",
  // SQLite-only meta tables
  "sqlite_sequence",
]);

// ── Open SQLite + MySQL ────────────────────────────────────────────────────
if (!existsSync(srcPath)) {
  console.error(`ERROR: SQLite source tidak ada: ${srcPath}`);
  console.error(`       Jalankan dulu: bash tools/legacy-sync-fetch.sh ${srcPath}`);
  exit(1);
}

console.log(`[sync] source SQLite : ${srcPath}`);
console.log(`[sync] target MySQL  : ${dbConfig.user}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
console.log(`[sync] mode          : ${dryRun ? "DRY RUN (no writes)" : "LIVE"}`);

const sqlite = new Database(srcPath, { readonly: true });
const pool = await mysql.createPool({
  ...dbConfig,
  charset: "utf8mb4",
  multipleStatements: false,
  waitForConnections: true,
  connectionLimit: 4,
});

// ── Backup mitra=1 data sebelum apa-apa ────────────────────────────────────
if (!dryRun && !noBackup) {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const backupDir = path.resolve("./tools/backups");
    mkdirSync(backupDir, { recursive: true });
    const out = path.join(backupDir, `mitra1-pre-sync-${stamp}.sql`);
    const tablesWithMitraCol = TABLES.map(t => t.name).filter(t => !extraSkip.includes(t));
    console.log(`[backup] mysqldump mitra_id=1 → ${out}`);
    execSync(
      `mysqldump --skip-add-drop-table --no-create-info --skip-extended-insert ` +
      `--where="mitra_id=1" ` +
      `-h ${dbConfig.host} -P ${dbConfig.port} -u ${dbConfig.user} ` +
      `-p"${dbConfig.password}" ${dbConfig.database} ${tablesWithMitraCol.join(" ")} > ${out}`,
      { stdio: ["ignore", "ignore", "pipe"] }
    );
    console.log(`[backup] OK`);
  } catch (e) {
    console.warn(`[backup] WARNING: mysqldump gagal — ${String(e.message ?? e).split("\n")[0]}`);
    console.warn(`[backup] lanjut tanpa backup. Pakai --no-backup untuk skip warning ini.`);
  }
}

// ── Disable FK checks (safer untuk delete order sembarang) ─────────────────
if (!dryRun) {
  const c = await pool.getConnection();
  await c.query("SET FOREIGN_KEY_CHECKS=0");
  c.release();
}

// ── Build userIdMap (old user.id → cPanel user.id by username) ─────────────
const userIdMap = new Map();
{
  const oldUsers = sqlite.prepare(`SELECT id, username FROM users`).all();
  const [cpUsers] = await pool.query(`SELECT id, username FROM users`);
  const byUsername = new Map();
  for (const u of cpUsers) byUsername.set(String(u.username).toLowerCase(), u.id);
  for (const u of oldUsers) {
    const newId = byUsername.get(String(u.username).toLowerCase());
    if (newId) userIdMap.set(u.id, newId);
  }
  console.log(`[users] mapped ${userIdMap.size}/${oldUsers.length} old users → cPanel users by username`);
  const unmapped = oldUsers.filter(u => !userIdMap.has(u.id));
  if (unmapped.length > 0) {
    console.log(`[users] unmapped (assigned-to akan jadi NULL): ${unmapped.map(u => `${u.id}=${u.username}`).join(", ")}`);
  }
}

// ── Helper: get column intersection antara SQLite & MySQL ──────────────────
async function getCommonColumns(tbl) {
  const sqliteCols = sqlite.prepare(`PRAGMA table_info("${tbl}")`).all().map(r => r.name);
  const [mysqlColsRows] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=?`,
    [dbConfig.database, tbl],
  );
  const mysqlColSet = new Set(mysqlColsRows.map(r => r.COLUMN_NAME));
  return { sqliteCols, mysqlColSet, common: sqliteCols.filter(c => mysqlColSet.has(c)) };
}

// ── Per-table migration ────────────────────────────────────────────────────
const idMaps = new Map();   // refTable → Map<oldId, newId>
const summary = { ok: [], failed: [], skipped: [], empty: [] };

const targetTables = onlyTables.length > 0
  ? TABLES.filter(t => onlyTables.includes(t.name))
  : TABLES.filter(t => !DEFAULT_SKIP.has(t.name) && !extraSkip.includes(t.name));

for (let i = 0; i < targetTables.length; i++) {
  const cfg = targetTables[i];
  const tbl = cfg.name;
  const label = `[${String(i + 1).padStart(2, "0")}/${targetTables.length}] ${tbl.padEnd(28)}`;

  try {
    // 1. Verify source rows exist
    let srcCount;
    try { srcCount = sqlite.prepare(`SELECT COUNT(*) as c FROM "${tbl}"`).get()?.c ?? 0; }
    catch (e) { console.warn(`${label} SQLite tidak punya tabel ini, skip`); summary.skipped.push(`${tbl} (no-src)`); continue; }

    if (srcCount === 0) {
      // Tetap perlu wipe mitra=1 di MySQL kalau ada data stale dari run sebelumnya
      if (!dryRun) {
        const { mysqlColSet } = await getCommonColumns(tbl);
        if (mysqlColSet.has("mitra_id")) {
          await pool.query(`DELETE FROM \`${tbl}\` WHERE mitra_id=1`);
        }
      }
      console.log(`${label} 0 rows di SQLite (cleared mitra=1 di MySQL)`);
      summary.empty.push(tbl);
      continue;
    }

    // 2. Get column intersection
    const { mysqlColSet, common } = await getCommonColumns(tbl);
    if (common.length === 0) { console.warn(`${label} 0 common columns, skip`); summary.skipped.push(`${tbl} (no-cols)`); continue; }
    const hasMitraCol = mysqlColSet.has("mitra_id");
    const pkCol = cfg.pkCol ?? "id";

    // 3. Wipe mitra_id=1 di MySQL (FK_CHECKS=0 supaya bisa delete order sembarang)
    if (!dryRun && hasMitraCol) {
      await pool.query(`DELETE FROM \`${tbl}\` WHERE mitra_id=1`);
    }

    if (dryRun) { console.log(`${label} ${srcCount} rows (dry-run)`); summary.ok.push(`${tbl} (${srcCount})`); continue; }

    // 4. Determine insert columns (skip auto-increment id; inject mitra_id; add extraCols)
    const insertCols = common.filter(c => !(c === "id" && !cfg.pkCol)); // strip PK only kalau auto-id
    if (hasMitraCol && !insertCols.includes("mitra_id")) insertCols.push("mitra_id");
    for (const col of Object.keys(cfg.extraCols ?? {})) {
      if (mysqlColSet.has(col) && !insertCols.includes(col)) insertCols.push(col);
    }

    // 5. Stream rows
    const ourIdMap = new Map();
    if (!cfg.skipPkRemap) idMaps.set(tbl, ourIdMap);

    const colSelectList = common.map(c => `"${c}"`).join(",");
    const stmt = sqlite.prepare(`SELECT ${colSelectList} FROM "${tbl}"`);

    let inserted = 0;
    let skippedRows = 0;
    let failedRows = 0;
    for (const row of stmt.iterate()) {
      const oldId = row[pkCol];

      // Remap user columns
      for (const ucol of cfg.userCols ?? []) {
        if (row[ucol] != null) {
          const mapped = userIdMap.get(row[ucol]);
          row[ucol] = mapped ?? null;
        }
      }

      // Remap FK columns
      let dropRow = false;
      for (const [col, refTbl] of Object.entries(cfg.fk ?? {})) {
        if (row[col] != null) {
          const mapped = idMaps.get(refTbl)?.get(row[col]);
          if (mapped == null) {
            // parent row gak ada (kemungkinan parent skip atau di-delete). Untuk PK-as-FK (customer_loyalty), drop row.
            if (cfg.skipPkRemap && col === pkCol) { dropRow = true; break; }
            row[col] = null;
          } else {
            row[col] = mapped;
          }
        }
      }
      if (dropRow) { skippedRows++; continue; }

      // Remap polymorphic
      for (const poly of cfg.poly ?? []) {
        const type = row[poly.typeCol];
        const refTbl = type ? poly.map[String(type).toLowerCase()] : null;
        if (refTbl && row[poly.idCol] != null) {
          const mapped = idMaps.get(refTbl)?.get(row[poly.idCol]);
          row[poly.idCol] = mapped ?? null;
        }
      }

      // Convert bigint → number
      for (const k of Object.keys(row)) if (typeof row[k] === "bigint") row[k] = Number(row[k]);

      // Compute extraCols
      const extras = {};
      for (const [col, fn] of Object.entries(cfg.extraCols ?? {})) {
        extras[col] = fn(row);
      }

      // Build INSERT
      const vals = insertCols.map(c => {
        if (c === "mitra_id") return 1;
        if (c in extras) return extras[c];
        if (c === "id" && !cfg.pkCol) return undefined; // shouldn't be here
        return row[c] ?? null;
      });
      const colList = insertCols.map(c => `\`${c}\``).join(",");
      const placeholders = insertCols.map(() => "?").join(",");

      try {
        const [result] = await pool.query(`INSERT INTO \`${tbl}\` (${colList}) VALUES (${placeholders})`, vals);
        const newId = cfg.skipPkRemap ? row[pkCol] : (result.insertId || row[pkCol]);
        if (!cfg.skipPkRemap && oldId != null) ourIdMap.set(oldId, newId);
        inserted++;
        if (verbose) console.log(`  ${tbl}.${oldId} → ${newId}`);
      } catch (e) {
        failedRows++;
        if (failedRows <= 3) console.warn(`  ${tbl}.${oldId} FAIL: ${e.message.split("\n")[0]}`);
      }
    }

    const msg = `${srcCount} src → ${inserted} inserted` +
      (skippedRows ? ` (${skippedRows} skipped: parent missing)` : "") +
      (failedRows ? ` (${failedRows} failed)` : "");
    console.log(`${label} ${msg}`);
    summary.ok.push(`${tbl} (${inserted}/${srcCount})`);
  } catch (e) {
    console.error(`${label} FAILED — ${e.message}`);
    if (process.env.DEBUG) console.error(e.stack);
    summary.failed.push(`${tbl} (${e.message.split("\n")[0]})`);
  }
}

// ── Re-enable FK checks ────────────────────────────────────────────────────
if (!dryRun) {
  const c = await pool.getConnection();
  await c.query("SET FOREIGN_KEY_CHECKS=1");
  c.release();
}

// ── Final verification ─────────────────────────────────────────────────────
console.log("\n=================== SYNC REPORT ===================");
console.log(`OK:      ${summary.ok.length}`);
console.log(`Empty:   ${summary.empty.length}`);
console.log(`Skipped: ${summary.skipped.length}`);
console.log(`Failed:  ${summary.failed.length}`);
if (summary.failed.length > 0) {
  console.log("\nFailed detail:");
  summary.failed.forEach(s => console.log(`  - ${s}`));
}

sqlite.close();
await pool.end();
exit(summary.failed.length > 0 ? 1 : 0);
