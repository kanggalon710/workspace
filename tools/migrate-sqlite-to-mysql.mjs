#!/usr/bin/env node
/**
 * SQLite → MySQL data migration script.
 *
 * Reads data dari file SQLite (`data.db`) dan insert batch-by-batch ke MySQL database
 * yang sudah punya schema (lewat `npm run db:push` sebelumnya).
 *
 * Usage:
 *   node tools/migrate-sqlite-to-mysql.mjs --src ./data.db --dst-from-env
 *   node tools/migrate-sqlite-to-mysql.mjs --src ./data.db --dst mysql://user:pass@host/dbname
 *
 * Env (kalau pakai --dst-from-env):
 *   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 *
 * Flags:
 *   --truncate         TRUNCATE tabel target dulu sebelum insert (default: false)
 *   --skip <tbl,tbl>   Skip tabel tertentu (comma-separated)
 *   --only <tbl,tbl>   Hanya migrate tabel tertentu
 *   --batch <n>        Batch size INSERT (default: 500)
 *   --dry-run          Cuma list tabel + row count, ngga insert
 */

import Database from "better-sqlite3";
import mysql from "mysql2/promise";
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { argv, exit } from "node:process";

// ── Parse args ──
const args = {};
for (let i = 2; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) {
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
}

const src = args.src || "./data.db";
const batchSize = Number(args.batch ?? 500);
const truncate = !!args.truncate;
const dryRun = !!args["dry-run"];
const skipTables = (args.skip ?? "").split(",").filter(Boolean);
const onlyTables = (args.only ?? "").split(",").filter(Boolean);

// ── Load env ──
const privateRoot = process.env.JABNET_PRIVATE_ROOT;
if (privateRoot) loadEnv({ path: path.join(privateRoot, "config", ".env") });
else loadEnv();

// ── Resolve MySQL connection ──
let mysqlConfig;
if (args["dst-from-env"]) {
  mysqlConfig = {
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  };
} else if (args.dst) {
  const url = new URL(args.dst);
  mysqlConfig = {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
  };
} else {
  console.error("ERROR: harus pakai --dst-from-env atau --dst mysql://...");
  exit(1);
}

if (!mysqlConfig.user || !mysqlConfig.database) {
  console.error("ERROR: DB_USER dan DB_NAME wajib di-set di env atau --dst URL.");
  exit(1);
}

// ── Open connections ──
console.log(`[migrate] source SQLite: ${src}`);
console.log(`[migrate] target MySQL:  ${mysqlConfig.user}@${mysqlConfig.host}:${mysqlConfig.port}/${mysqlConfig.database}`);
if (dryRun) console.log(`[migrate] DRY RUN — no writes`);

const sqlite = new Database(src, { readonly: true });
const pool = await mysql.createPool({
  ...mysqlConfig,
  charset: "utf8mb4",
  multipleStatements: false,
  waitForConnections: true,
  connectionLimit: 4,
});

// Disable FK checks for clean migration (FK violations during cross-table inserts)
if (!dryRun) {
  const c = await pool.getConnection();
  await c.query("SET FOREIGN_KEY_CHECKS=0");
  await c.query("SET UNIQUE_CHECKS=0");
  c.release();
}

// ── Enumerate tables ──
const sqliteTables = sqlite
  .prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%'`,
  )
  .all()
  .map((r) => r.name);

const targetTables = onlyTables.length > 0
  ? sqliteTables.filter((t) => onlyTables.includes(t))
  : sqliteTables.filter((t) => !skipTables.includes(t));

console.log(`[migrate] tables to process: ${targetTables.length}`);

// ── Per-table migration ──
const summary = { ok: [], failed: [], skipped: [], mismatch: [] };

for (let idx = 0; idx < targetTables.length; idx++) {
  const tbl = targetTables[idx];
  const label = `[${String(idx + 1).padStart(2, "0")}/${targetTables.length}]`;

  // 1. Count rows in source
  const srcCountRow = sqlite.prepare(`SELECT COUNT(*) as c FROM "${tbl}"`).get();
  const srcCount = srcCountRow?.c ?? 0;

  if (srcCount === 0) {
    console.log(`${label} ${tbl}: 0 rows → skip`);
    summary.skipped.push(tbl);
    continue;
  }

  // 2. Check if target table exists in MySQL
  const [tableExistsRows] = await pool.query(
    `SELECT COUNT(*) as c FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?`,
    [mysqlConfig.database, tbl],
  );
  if (tableExistsRows[0].c === 0) {
    console.warn(`${label} ${tbl}: target table tidak ada di MySQL, skip (apakah db:push sudah dijalankan?)`);
    summary.skipped.push(`${tbl} (no-target)`);
    continue;
  }

  if (dryRun) {
    console.log(`${label} ${tbl}: ${srcCount} rows (dry-run, skip insert)`);
    summary.ok.push(`${tbl} (${srcCount})`);
    continue;
  }

  try {
    // 3. Optional: truncate
    if (truncate) {
      await pool.query(`TRUNCATE TABLE \`${tbl}\``);
    }

    // 4. Get column names from SQLite (preserve order)
    const sqliteCols = sqlite
      .prepare(`PRAGMA table_info("${tbl}")`)
      .all()
      .map((r) => r.name);

    // 5. Filter cols yang exist di MySQL target (drop ekstra cols supaya tidak fail)
    const [mysqlColsRows] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=?`,
      [mysqlConfig.database, tbl],
    );
    const mysqlColSet = new Set(mysqlColsRows.map((r) => r.COLUMN_NAME));
    const cols = sqliteCols.filter((c) => mysqlColSet.has(c));
    if (cols.length === 0) {
      console.warn(`${label} ${tbl}: tidak ada column yang match, skip`);
      summary.skipped.push(`${tbl} (no-matching-cols)`);
      continue;
    }
    const droppedCols = sqliteCols.filter((c) => !mysqlColSet.has(c));
    if (droppedCols.length > 0) {
      console.warn(`${label} ${tbl}: drop columns yang tidak ada di MySQL: ${droppedCols.join(", ")}`);
    }

    // 6. Stream rows in batches
    const placeholders = `(${cols.map(() => "?").join(",")})`;
    const colList = cols.map((c) => `\`${c}\``).join(",");
    const stmt = sqlite.prepare(`SELECT ${cols.map((c) => `"${c}"`).join(",")} FROM "${tbl}"`);

    let inserted = 0;
    let buffer = [];
    let bufferRowCount = 0;

    const flushBuffer = async () => {
      if (bufferRowCount === 0) return;
      const sql = `INSERT INTO \`${tbl}\` (${colList}) VALUES ${Array(bufferRowCount).fill(placeholders).join(",")}`;
      await pool.query(sql, buffer);
      inserted += bufferRowCount;
      buffer = [];
      bufferRowCount = 0;
    };

    for (const row of stmt.iterate()) {
      for (const c of cols) {
        let v = row[c];
        // bigint → number (MySQL int)
        if (typeof v === "bigint") v = Number(v);
        // SQLite stores booleans as 0/1 (int) — pass-through OK
        // SQLite stores dates as ISO string — pass-through OK
        // Buffers / blobs — pass-through
        buffer.push(v);
      }
      bufferRowCount++;
      if (bufferRowCount >= batchSize) {
        await flushBuffer();
      }
    }
    await flushBuffer();

    // 7. Verify count
    const [mysqlCountRows] = await pool.query(`SELECT COUNT(*) as c FROM \`${tbl}\``);
    const mysqlCount = mysqlCountRows[0].c;
    if (mysqlCount === srcCount) {
      console.log(`${label} ${tbl}: ${srcCount} rows → ✓`);
      summary.ok.push(`${tbl} (${srcCount})`);
    } else {
      console.warn(`${label} ${tbl}: src=${srcCount}, mysql=${mysqlCount} (mismatch!)`);
      summary.mismatch.push(`${tbl} (src=${srcCount}, mysql=${mysqlCount})`);
    }
  } catch (e) {
    console.error(`${label} ${tbl}: FAILED — ${e.message}`);
    if (process.env.DEBUG) console.error(e.stack);
    summary.failed.push(`${tbl} (${e.message})`);
  }
}

// ── Re-enable checks ──
if (!dryRun) {
  const c = await pool.getConnection();
  await c.query("SET FOREIGN_KEY_CHECKS=1");
  await c.query("SET UNIQUE_CHECKS=1");
  c.release();
}

// ── Final report ──
console.log("");
console.log("================ MIGRATION REPORT ================");
console.log(`OK:       ${summary.ok.length} tables`);
console.log(`Skipped:  ${summary.skipped.length} tables`);
console.log(`Mismatch: ${summary.mismatch.length} tables`);
console.log(`Failed:   ${summary.failed.length} tables`);
if (summary.mismatch.length > 0) {
  console.log("\nMismatch detail:");
  summary.mismatch.forEach((s) => console.log(`  - ${s}`));
}
if (summary.failed.length > 0) {
  console.log("\nFailed detail:");
  summary.failed.forEach((s) => console.log(`  - ${s}`));
}

sqlite.close();
await pool.end();

exit(summary.failed.length > 0 ? 1 : 0);
