#!/usr/bin/env node
/**
 * Backfill foto base64 (photo_data) → filesystem (photo_path).
 *
 * Idempotent — re-run aman, hanya proses row yang punya photo_data tapi belum punya photo_path.
 * Setiap row sukses: tulis file ke filesystem + UPDATE photo_path + clear photo_data.
 *
 * Per-mitra: file masuk ke <UPLOAD_ROOT>/<mitra-slug>/<feature>/YYYY/MM/<id>-<8hex>.jpg
 *
 * Usage (dari root project, .env di-load oto):
 *   node tools/migrate-base64-to-fs.mjs                       # semua tabel default
 *   node tools/migrate-base64-to-fs.mjs --dry-run             # cek dulu, tanpa write
 *   node tools/migrate-base64-to-fs.mjs --tables canvassing_logs,bug_reports
 *   node tools/migrate-base64-to-fs.mjs --batch 50            # batch size (default 100)
 *
 * Env yang dibaca:
 *   JABNET_PRIVATE_ROOT  → load .env dari $ROOT/config/.env
 *   JABNET_UPLOAD_ROOT   → override absolute upload root (default $JABNET_PRIVATE_ROOT/uploads)
 *   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 */
import mysql from "mysql2/promise";
import { config as loadEnv } from "dotenv";
import { promises as fs } from "fs";
import path from "node:path";
import crypto from "node:crypto";
import { argv, exit } from "node:process";

// ── Load env ──
const privateRoot = process.env.JABNET_PRIVATE_ROOT;
if (privateRoot) loadEnv({ path: path.join(privateRoot, "config", ".env") });
else loadEnv();

// ── Parse args ──
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
const dryRun = !!args["dry-run"];
const batchSize = Number(args.batch ?? 100);
const DEFAULT_TABLES = "canvassing_logs,bug_reports,lead_activities";
const tables = String(args.tables ?? DEFAULT_TABLES).split(",").map((s) => s.trim()).filter(Boolean);

// ── Resolve upload root (same logic as server/uploads.ts) ──
function getUploadRoot() {
  const explicit = process.env.JABNET_UPLOAD_ROOT;
  if (explicit && explicit.trim()) return path.resolve(explicit.trim());
  if (process.env.JABNET_PRIVATE_ROOT) return path.resolve(process.env.JABNET_PRIVATE_ROOT, "uploads");
  return path.resolve(process.cwd(), "uploads");
}
const UPLOAD_ROOT = getUploadRoot();
console.log(`[migrate] upload root: ${UPLOAD_ROOT}`);
console.log(`[migrate] tables:      ${tables.join(", ")}`);
if (dryRun) console.log(`[migrate] DRY RUN — no files written, no DB changes`);

// ── DB pool ──
const dbConfig = {
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: "utf8mb4",
  waitForConnections: true,
  connectionLimit: 4,
};
if (!dbConfig.user || !dbConfig.database) {
  console.error("ERROR: DB_USER dan DB_NAME wajib di-set di env.");
  exit(1);
}
console.log(`[migrate] mysql:       ${dbConfig.user}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
const pool = await mysql.createPool(dbConfig);

// ── Build mitra_id → slug cache ──
const [mitraRows] = await pool.execute("SELECT id, slug FROM mitras WHERE slug IS NOT NULL AND slug != ''");
const slugByMitra = new Map();
for (const r of mitraRows) slugByMitra.set(Number(r.id), String(r.slug));
console.log(`[migrate] loaded ${slugByMitra.size} mitra slugs`);

// ── Helpers ──
function decodeBase64DataUrl(s) {
  if (!s || typeof s !== "string") throw new Error("photo_data empty");
  let b64 = s;
  const m = /^data:image\/[a-z0-9+.-]+;base64,(.+)$/i.exec(s);
  if (m) b64 = m[1];
  b64 = b64.replace(/\s+/g, "");
  if (!b64) throw new Error("base64 empty after strip");
  return Buffer.from(b64, "base64");
}

function buildPath(slug, feature, idHint) {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const suffix = crypto.randomBytes(4).toString("hex");
  return path.posix.join(slug, feature, yyyy, mm, `${idHint}-${suffix}.jpg`);
}

const TABLE_FEATURE = {
  canvassing_logs: "canvassing",
  bug_reports: "bugs",
  lead_activities: "leads",
};

// ── Per-table migration ──
const summary = { tables: {}, totalMigrated: 0, totalFailed: 0, totalSkipped: 0 };

for (const table of tables) {
  const feature = TABLE_FEATURE[table];
  if (!feature) {
    console.warn(`[migrate] ${table}: tidak ada mapping feature, skip`);
    summary.tables[table] = { migrated: 0, failed: 0, skipped: "no-feature-mapping" };
    continue;
  }

  // Count rows to migrate
  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS c FROM ${table}
      WHERE photo_data IS NOT NULL AND photo_data != ''
        AND (photo_path IS NULL OR photo_path = '')`,
  );
  const total = Number(countRows[0]?.c ?? 0);
  console.log(`\n[${table}] ${total} row to migrate`);
  if (total === 0) {
    summary.tables[table] = { migrated: 0, failed: 0, skipped: 0 };
    continue;
  }
  if (dryRun) {
    summary.tables[table] = { migrated: 0, failed: 0, skipped: total };
    summary.totalSkipped += total;
    continue;
  }

  let migrated = 0, failed = 0;
  let offset = 0;
  while (offset < total) {
    const [rows] = await pool.execute(
      `SELECT id, mitra_id, photo_data FROM ${table}
        WHERE photo_data IS NOT NULL AND photo_data != ''
          AND (photo_path IS NULL OR photo_path = '')
        ORDER BY id ASC
        LIMIT ${batchSize}`,
    );
    if (rows.length === 0) break;

    for (const row of rows) {
      const id = Number(row.id);
      const mitraId = Number(row.mitra_id) || 1;
      const slug = slugByMitra.get(mitraId) ?? "jabnet";
      try {
        const buf = decodeBase64DataUrl(row.photo_data);
        const relPath = buildPath(slug, feature, `${feature.slice(0,3)}-${id}`);
        const absPath = path.join(UPLOAD_ROOT, relPath);
        await fs.mkdir(path.dirname(absPath), { recursive: true });
        await fs.writeFile(absPath, buf);
        await pool.execute(
          `UPDATE ${table} SET photo_path = ?, photo_data = NULL WHERE id = ?`,
          [relPath, id],
        );
        migrated++;
        if (migrated % 25 === 0 || migrated === total) {
          console.log(`  [${table}] progress ${migrated}/${total}`);
        }
      } catch (e) {
        failed++;
        console.error(`  [${table}] id=${id} FAILED: ${e.message}`);
      }
    }
    // Re-query: kita pakai photo_path filter, jadi rows yg sudah ke-process tidak akan muncul lagi.
    // Tapi safety: kalau row tetap ada (failed batch), break supaya tidak infinite loop.
    if (rows.length < batchSize) break;
  }

  summary.tables[table] = { migrated, failed, skipped: 0 };
  summary.totalMigrated += migrated;
  summary.totalFailed += failed;
}

// ── Final report ──
console.log("\n================ MIGRATION REPORT ================");
for (const [t, s] of Object.entries(summary.tables)) {
  console.log(`  ${t.padEnd(25)} migrated=${s.migrated}  failed=${s.failed}  skipped=${s.skipped}`);
}
console.log(`  TOTAL                     migrated=${summary.totalMigrated}  failed=${summary.totalFailed}  skipped=${summary.totalSkipped}`);
if (dryRun) console.log("  (DRY RUN — no actual changes)");

await pool.end();
exit(summary.totalFailed > 0 ? 1 : 0);
