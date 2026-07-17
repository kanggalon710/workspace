import { config as loadEnv } from "dotenv";
import { join } from "path";
import { existsSync } from "fs";

// Dijalankan sebagai modul PERTAMA sebelum storage.ts membuat MySQL pool.
// ESM evaluation order: modul yang di-import lebih dulu di index.ts dievaluasi lebih dulu.
const privateRoot = process.env.JABNET_PRIVATE_ROOT;

if (privateRoot) {
  loadEnv({ path: join(privateRoot, "config", ".env") });
} else {
  // Auto-detect untuk cPanel: coba lokasi standar berdasarkan HOME
  const home = process.env.HOME || "/home/jabnet";
  const candidates = [
    join(home, "private", "fiber-jabnet", "config", ".env"),
    ".env",
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      loadEnv({ path: candidate });
      break;
    }
  }
}
