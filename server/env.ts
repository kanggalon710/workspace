// Boundary konfigurasi environment server yang TERVALIDASI (audit 2026-10-04).
// Nilai salah -> throw saat startup (fail loud), bukan diam-diam pakai default aneh.
// Pakai `serverEnv` untuk nilai runtime; `loadServerEnv(env)` untuk unit test.
//
// Cakupan saat ini: nilai yang dipakai server/index.ts. Pembacaan env lain yang
// sudah tervalidasi lewat helper sendiri: shared/adminSeed.ts (ADMIN_*),
// server/dev-db-sync.ts (DEV_DB_SYNC_ENABLED/PROD_DB_NAME), server/mpwa.ts
// (OTP_DEV_EXPOSE via otpDebugExposeEnabled). Migrasi read lain menyusul bertahap.

export interface ServerEnv {
  nodeEnv: string;
  isProd: boolean;
  port: number;
  /** Nilai utk app.set("trust proxy", ...): false (tanpa proxy) atau jumlah hop. */
  trustProxy: number | false;
  /** Base URL publik kanonis, tanpa trailing slash. */
  appPublicUrl: string;
  workersGloballyEnabled: boolean;
  /** Flag worker per-nama (BILLING_SYNC_ENABLED, dst) - semantik sama dgn flag() lama. */
  workerFlag(name: string, defaultVal?: boolean): boolean;
}

export function loadServerEnv(env: NodeJS.ProcessEnv = process.env): ServerEnv {
  const nodeEnv = (env.NODE_ENV ?? "development").toLowerCase();
  const isProd = nodeEnv === "production";

  const portRaw = env.PORT ?? "3002";
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Env PORT tidak valid: "${portRaw}" (harus integer 1-65535)`);
  }

  // cPanel = tepat 1 hop (Apache/Passenger). Dev lokal tanpa proxy: jangan trust
  // (X-Forwarded-For bisa dipalsukan klien langsung -> rate limit per-IP jebol).
  let trustProxy: number | false;
  if (env.TRUST_PROXY !== undefined) {
    trustProxy = env.TRUST_PROXY === "false" ? false : (Number(env.TRUST_PROXY) || 1);
  } else {
    trustProxy = isProd ? 1 : false;
  }

  const urlRaw = (env.APP_PUBLIC_URL ?? "https://workspace.jabnet.id").trim();
  let appPublicUrl: string;
  try {
    const u = new URL(urlRaw);
    appPublicUrl = `${u.protocol}//${u.host}`;
  } catch {
    throw new Error(`Env APP_PUBLIC_URL tidak valid: "${urlRaw}" (harus URL absolut)`);
  }

  const workersGloballyEnabled = env.WORKERS_ENABLED !== "false";
  const workerFlag = (name: string, defaultVal = true): boolean => {
    const v = env[name];
    if (v === undefined) return defaultVal && workersGloballyEnabled;
    return v.toLowerCase() === "true" && workersGloballyEnabled;
  };

  return { nodeEnv, isProd, port, trustProxy, appPublicUrl, workersGloballyEnabled, workerFlag };
}

export const serverEnv = loadServerEnv();
