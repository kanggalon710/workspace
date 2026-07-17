import path from "node:path";
import { config as loadEnv } from "dotenv";

// Load .env from JABNET_PRIVATE_ROOT (cPanel deploy) or repo root (local dev).
const privateRoot = process.env.JABNET_PRIVATE_ROOT;
if (privateRoot) {
  loadEnv({ path: path.join(privateRoot, "config", ".env") });
} else {
  loadEnv();
}

export default {
  schema: "./shared/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "jabnet_fiber",
  },
};
