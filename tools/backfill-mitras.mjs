#!/usr/bin/env node
/**
 * Phase H — Multi-tenant backfill + FK audit script.
 *
 * Usage:
 *   node tools/backfill-mitras.mjs [--apply-fk] [--check-only]
 *
 * Flags:
 *   --check-only    Hanya audit (count tables, count NULL mitra_id rows). NO writes.
 *   --apply-fk      Tambah FOREIGN KEY constraints ke 61 tenant tables. RISKY: gagal kalau ada
 *                   row dengan mitra_id pointing ke mitra yang tidak ada.
 *
 * Default (no flags): full backfill — set mitra_id=1 untuk semua NULL row + run audit.
 *
 * Environment: pakai env var sama seperti server (JABNET_PRIVATE_ROOT, atau .env loaded).
 * Aman dijalankan berkali-kali — semua operasi idempotent.
 */

import mysql from "mysql2/promise";
import { config as loadEnv } from "dotenv";
import { existsSync } from "fs";
import { resolve } from "path";

// Try common .env locations
const envPaths = [
  process.env.JABNET_PRIVATE_ROOT ? `${process.env.JABNET_PRIVATE_ROOT}/config/.env` : null,
  "/home/jabnet/private/fiber-jabnet/config/.env",
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), ".env.local"),
].filter(Boolean);

for (const p of envPaths) {
  if (existsSync(p)) {
    console.log(`[backfill] Loading env from ${p}`);
    loadEnv({ path: p });
    break;
  }
}

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check-only");
const applyFk = args.has("--apply-fk");

// Aligned with runMitraMigrations() tenantTables list in server/storage.ts.
// manual_discounts, referral_invitations, canvassing_reports were in the original plan
// but were never created in schema.ts — removed from audit to avoid false positives.
const TENANT_TABLES = [
  "pops", "odcs", "odps", "poles", "cables", "otbs", "bestrays", "splitters",
  "cable_cores", "core_connections", "odp_scrape_cache",
  "customers", "customer_otps", "customer_portal_sessions", "traffic_snapshots",
  "customer_loyalty", "customer_discounts", "customer_referrals",
  "point_transactions", "point_redemptions",
  "prospects", "leads", "lead_activities",
  "canvassing_sessions", "canvassing_logs",
  "ad_campaigns",
  "collections", "collection_activities",
  "tickets", "ticket_categories", "ticket_activities", "ticket_team",
  "ticket_evidence", "ticket_gps_logs", "ticket_stage_transitions",
  "ticket_stage_edit_log", "ticket_comments", "ticket_pauses", "ticket_checkpoints",
  "ticket_csat", "ticket_sla_escalations", "network_alarms",
  "chatwoot_config", "chatwoot_keyword_rules", "chatwoot_ticket_links",
  "broadcast_campaigns", "broadcast_recipients", "broadcast_segments",
  "mpwa_templates", "wa_devices", "wa_inbox", "phonebooks", "phonebook_contacts",
  "announcements", "notifications", "api_keys", "api_key_usage_logs",
  "bug_reports", "bug_comments", "audit_logs", "mikrotik_routers",
];

async function main() {
  const host = process.env.DB_HOST || "localhost";
  const user = process.env.DB_USER || "jabnet_crm_user";
  const password = process.env.DB_PASSWORD || "";
  const database = process.env.DB_NAME || "jabnet_fiber";
  const socketPath = process.env.DB_SOCKET || undefined;

  const conn = await mysql.createConnection({
    host: socketPath ? undefined : host,
    user, password, database,
    socketPath,
  });

  console.log(`[backfill] Connected to ${database}@${socketPath ?? host}`);
  console.log(`[backfill] Mode: ${checkOnly ? "CHECK-ONLY" : applyFk ? "BACKFILL + FK" : "BACKFILL"}`);
  console.log("");

  // 1. Audit: count tables with mitra_id column.
  // NOTE: information_schema returns TABLE_NAME (uppercase) via mysql2 — must alias for portable lowercase access.
  const [colRows] = await conn.execute(`
    SELECT table_name AS tn, COUNT(*) AS has_col FROM information_schema.columns
    WHERE table_schema = ? AND column_name = 'mitra_id'
    GROUP BY table_name
  `, [database]);
  const tablesWithCol = new Set(colRows.map(r => String(r.tn ?? r.TABLE_NAME ?? r.table_name).toLowerCase()));
  console.log(`[audit] Tables with mitra_id column: ${tablesWithCol.size}/${TENANT_TABLES.length}`);
  const missing = TENANT_TABLES.filter(t => !tablesWithCol.has(t));
  if (missing.length > 0) {
    console.warn(`[audit] MISSING mitra_id on: ${missing.join(", ")}`);
  } else {
    console.log("[audit] OK — all tenant tables have mitra_id column");
  }
  console.log("");

  // 2. Verify JABNET seed exists
  const [mitraRows] = await conn.execute("SELECT id, slug, name FROM mitras WHERE id = 1");
  if (mitraRows.length === 0) {
    console.error("[audit] FATAL — mitra_id=1 (JABNET) row not found. Aborting.");
    process.exit(1);
  }
  console.log(`[audit] Default mitra: id=1 slug=${mitraRows[0].slug} name="${mitraRows[0].name}"`);

  const [allMitras] = await conn.execute("SELECT id, slug, name, is_active FROM mitras ORDER BY id");
  console.log(`[audit] Total mitras: ${allMitras.length} (${allMitras.filter(m => m.is_active === 1).length} active)`);
  for (const m of allMitras) console.log(`  - id=${m.id} slug=${m.slug} active=${m.is_active}`);
  console.log("");

  // 3. Count NULL mitra_id per table + customer count
  let totalBackfilled = 0;
  console.log("[audit] Per-table row count + NULL mitra_id check:");
  for (const t of TENANT_TABLES) {
    if (!tablesWithCol.has(t)) continue;
    try {
      const [cntRows] = await conn.execute(`SELECT COUNT(*) AS total, SUM(CASE WHEN mitra_id IS NULL THEN 1 ELSE 0 END) AS null_count FROM \`${t}\``);
      const total = Number(cntRows[0]?.total ?? 0);
      const nullCount = Number(cntRows[0]?.null_count ?? 0);
      if (total === 0) continue; // skip empty tables
      const tag = nullCount > 0 ? ` ⚠ ${nullCount} NULL` : "";
      console.log(`  ${t.padEnd(30)} total=${total}${tag}`);
      // Backfill NULL rows to mitra_id=1
      if (!checkOnly && nullCount > 0) {
        const [r] = await conn.execute(`UPDATE \`${t}\` SET mitra_id = 1 WHERE mitra_id IS NULL`);
        const affected = Number(r?.affectedRows ?? 0);
        if (affected > 0) {
          console.log(`    → backfilled ${affected} NULL row(s) to mitra_id=1`);
          totalBackfilled += affected;
        }
      }
    } catch (e) {
      console.warn(`  ${t.padEnd(30)} ERR: ${e.message}`);
    }
  }
  console.log("");
  if (!checkOnly) console.log(`[backfill] Total rows backfilled to mitra_id=1: ${totalBackfilled}`);

  // 4. (Optional) Apply FK constraints
  if (applyFk) {
    console.log("");
    console.log("[fk] Applying FOREIGN KEY constraints (REFERENCES mitras(id))...");
    let fkAdded = 0;
    let fkExisted = 0;
    let fkFailed = 0;
    for (const t of TENANT_TABLES) {
      if (!tablesWithCol.has(t)) continue;
      const fkName = `fk_${t}_mitra`;
      try {
        // Check if FK already exists
        const [existing] = await conn.execute(`
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_schema = ? AND table_name = ? AND constraint_name = ? AND constraint_type = 'FOREIGN KEY'
        `, [database, t, fkName]);
        if (existing.length > 0) {
          fkExisted++;
          continue;
        }
        await conn.execute(`ALTER TABLE \`${t}\` ADD CONSTRAINT \`${fkName}\` FOREIGN KEY (mitra_id) REFERENCES mitras(id) ON UPDATE CASCADE ON DELETE RESTRICT`);
        console.log(`  ✓ ${t}.${fkName}`);
        fkAdded++;
      } catch (e) {
        console.warn(`  ✗ ${t}.${fkName} FAILED: ${e.message}`);
        fkFailed++;
      }
    }
    console.log(`[fk] Added=${fkAdded} ExistedAlready=${fkExisted} Failed=${fkFailed}`);
  } else {
    console.log("[fk] Skipped — pass --apply-fk to add FOREIGN KEY constraints.");
  }

  await conn.end();
  console.log("");
  console.log("[done]");
}

main().catch(e => {
  console.error("[fatal]", e);
  process.exit(1);
});
