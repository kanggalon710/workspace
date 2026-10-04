// Keputusan seeding admin pertama (fresh install) - logika murni, unit-tested.
// Password WAJIB dari environment; tidak ada fallback hardcoded (lihat audit 2026-10-04).
// Identitas default mengikuti standar global AGENTS §21; bisa dioverride via env.

export interface AdminSeedEnv {
  ADMIN_DEFAULT_PASSWORD?: string;
  ADMIN_USERNAME?: string;
  ADMIN_NAME?: string;
}

export type AdminSeedDecision =
  | { action: "skip"; reason: string }
  | { action: "seed"; username: string; name: string; password: string }
  | { action: "fail"; reason: string };

// Error khusus supaya caller (server/index.ts) bisa fail-fast startup hanya untuk
// kasus seeding admin, tanpa menelan error migrasi lain.
export class AdminSeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminSeedError";
  }
}

const MIN_PASSWORD_LENGTH = 8;
export const DEFAULT_ADMIN_USERNAME = "chief0012";
export const DEFAULT_ADMIN_NAME = "Administrator";

export function decideAdminSeed(userCount: number, env: AdminSeedEnv): AdminSeedDecision {
  if (userCount > 0) {
    return { action: "skip", reason: "users already exist" };
  }
  const password = (env.ADMIN_DEFAULT_PASSWORD ?? "").trim();
  if (!password) {
    return {
      action: "fail",
      reason:
        "Fresh install terdeteksi (tabel users kosong) tapi env ADMIN_DEFAULT_PASSWORD tidak diset. " +
        "Set ADMIN_DEFAULT_PASSWORD di .env (di luar git) lalu restart. Server menolak start tanpa admin pertama.",
    };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      action: "fail",
      reason: `ADMIN_DEFAULT_PASSWORD terlalu pendek (minimal ${MIN_PASSWORD_LENGTH} karakter).`,
    };
  }
  return {
    action: "seed",
    username: (env.ADMIN_USERNAME ?? "").trim() || DEFAULT_ADMIN_USERNAME,
    name: (env.ADMIN_NAME ?? "").trim() || DEFAULT_ADMIN_NAME,
    password,
  };
}
