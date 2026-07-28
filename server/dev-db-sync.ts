/**
 * Pure helpers for the dev-only "tarik data dari production" feature (prod → dev DB copy).
 * No I/O - unit-tested. The runner lives in storage.ts; the endpoint in routes.ts.
 */

/** Backtick-quote a MySQL identifier (schema/table/column). */
function q(id: string): string {
  return "`" + id.replace(/`/g, "``") + "`";
}

/**
 * The feature may run ONLY when all hold:
 *  1. DEV_DB_SYNC_ENABLED === "true"  (set only in dev's .env)
 *  2. PROD_DB_NAME is set and differs from the current DB_NAME (never copy a DB onto itself)
 *  3. current DB_NAME ends with "_dev" (defence in depth - prod's DB is `jabnet_fiber`)
 * On production these env vars are absent, so this returns false there.
 */
export function devDbSyncAvailable(env: NodeJS.ProcessEnv): boolean {
  if (env.DEV_DB_SYNC_ENABLED !== "true") return false;
  const prod = (env.PROD_DB_NAME ?? "").trim();
  const cur = (env.DB_NAME ?? "").trim();
  if (!prod || !cur) return false;
  if (prod === cur) return false;
  if (!cur.endsWith("_dev")) return false;
  return true;
}

/** Tables present in BOTH schemas (only these can be mirrored). Prod order preserved. */
export function tablesToMirror(prodTables: string[], devTables: string[]): string[] {
  const dev = new Set(devTables);
  return prodTables.filter((t) => dev.has(t));
}

/**
 * Tables that exist in DEV but NOT in prod - these CANNOT be mirrored (no source table),
 * so their dev rows are left untouched. Surfacing them explains an incomplete "1:1" copy
 * (e.g. teamspace tables when PROD_DB_NAME points at an older schema). Dev order preserved.
 */
export function tablesMissingInProd(prodTables: string[], devTables: string[]): string[] {
  const prod = new Set(prodTables);
  return devTables.filter((t) => !prod.has(t));
}

/**
 * Columns present in BOTH schemas for a table. Dev schema is usually NEWER (extra columns),
 * so copying only shared columns avoids "column count mismatch". Empty → caller skips the table.
 */
export function copyColumns(prodCols: string[], devCols: string[]): string[] {
  const dev = new Set(devCols);
  return prodCols.filter((c) => dev.has(c));
}

/** Per-table statements: TRUNCATE the dev table, then copy shared columns from prod.
 *  Returns [] when there are no shared columns (caller should skip the table). */
export function buildCopySql(devDb: string, prodDb: string, table: string, cols: string[]): string[] {
  if (cols.length === 0) return [];
  const dst = `${q(devDb)}.${q(table)}`;
  const src = `${q(prodDb)}.${q(table)}`;
  const colList = cols.map(q).join(", ");
  return [
    `TRUNCATE TABLE ${dst}`,
    `INSERT INTO ${dst} (${colList}) SELECT ${colList} FROM ${src}`,
  ];
}
