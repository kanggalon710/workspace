#!/usr/bin/env node
// Verify per-mitra role isolation invariants against a MySQL DB.
// Usage: DB_HOST=.. DB_USER=.. DB_PASSWORD=.. DB_NAME=.. node tools/verify-role-isolation.mjs
//
// Checks (post-migration these must ALL pass; pre-migration they demonstrate the bug):
//   1. roles.mitra_id column exists.
//   2. Every role row has a non-null mitra_id.
//   3. Every mitra in `mitras` has its own Admin role (name='Admin', mitra_id=that mitra).
//   4. No user_mitras.role_id points to a role belonging to a DIFFERENT mitra (cross-tenant leak).
import mysql from "mysql2/promise";

const cfg = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
};

const conn = await mysql.createConnection(cfg);
let failures = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { console.log(`  ✗ ${m}`); failures++; };

// 1. Column exists?
const [cols] = await conn.execute(
  `SELECT COUNT(*) AS c FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'roles' AND column_name = 'mitra_id'`
);
const hasCol = Number(cols[0].c) > 0;
console.log(`[1] roles.mitra_id column exists: ${hasCol}`);
if (!hasCol) {
  bad("roles table is NOT tenant-scoped (pre-migration / bug present). Stop.");
  await conn.end();
  process.exit(failures > 0 ? 1 : 0);
}
ok("column present");

// 2. No null mitra_id
const [nulls] = await conn.execute(`SELECT COUNT(*) AS c FROM roles WHERE mitra_id IS NULL`);
Number(nulls[0].c) === 0 ? ok("no roles with NULL mitra_id") : bad(`${nulls[0].c} roles have NULL mitra_id`);

// 3. Every mitra has its own Admin role
const [mitras] = await conn.execute(`SELECT id, COALESCE(display_name, name) AS nm FROM mitras`);
console.log(`[3] Admin role per mitra (${mitras.length} mitras):`);
for (const m of mitras) {
  const [r] = await conn.execute(
    `SELECT COUNT(*) AS c FROM roles WHERE mitra_id = ? AND name = 'Admin'`, [m.id]
  );
  Number(r[0].c) >= 1
    ? ok(`mitra ${m.id} (${m.nm}) has Admin role`)
    : bad(`mitra ${m.id} (${m.nm}) MISSING its own Admin role`);
}

// 4. No cross-tenant membership role references
const [leaks] = await conn.execute(`
  SELECT um.user_id, um.mitra_id AS membership_mitra, r.id AS role_id, r.name, r.mitra_id AS role_mitra
  FROM user_mitras um
  JOIN roles r ON r.id = um.role_id
  WHERE um.role_id IS NOT NULL AND r.mitra_id <> um.mitra_id
`);
console.log(`[4] cross-tenant membership role references: ${leaks.length}`);
if (leaks.length === 0) ok("no membership points to another mitra's role");
else for (const l of leaks) bad(`user ${l.user_id} @mitra ${l.membership_mitra} uses role ${l.role_id} "${l.name}" owned by mitra ${l.role_mitra}`);

// Summary of roles per mitra
const [dist] = await conn.execute(
  `SELECT mitra_id, COUNT(*) n, GROUP_CONCAT(name ORDER BY name SEPARATOR ', ') names FROM roles GROUP BY mitra_id ORDER BY mitra_id`
);
console.log("\nRoles per mitra:");
for (const d of dist) console.log(`  mitra ${d.mitra_id}: ${d.n} → ${d.names}`);

await conn.end();
console.log(`\n${failures === 0 ? "PASS ✅ — roles fully tenant-isolated" : `FAIL ❌ — ${failures} issue(s)`}`);
process.exit(failures > 0 ? 1 : 0);
