// config.ts harus jadi import PERTAMA — dia load dotenv sebelum storage.ts buat MySQL pool
import "./config.js";
import express from "express";
import session from "express-session";
import path from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { router } from "./routes.js";
import { storage } from "./storage.js";
import { billingSyncWorker } from "./billing-sync-worker.js";
import { chatwootContactSyncWorker } from "./chatwoot-contact-sync-worker.js";
import { customerPortalRouter } from "./customer-portal-routes.js";
import { publicApiRouter } from "./public-api-routes.js";
import { pipelinesTickRouter } from "./pipelines-tick-route.js";
import { trafficSnapshotWorker } from "./traffic-snapshot-worker.js";
import { teamspaceWorker } from "./teamspace-worker.js";
import { withMitra } from "./tenant-context.js";

// Worker enable flags — di-set di .env (default: enable kalau env tidak diset = backward compat).
// Untuk cPanel "prod baru", default-nya false (avoid dual-write dgn prod existing).
const workersGloballyEnabled = process.env.WORKERS_ENABLED !== "false";
const flag = (name: string, defaultVal = true): boolean => {
  const v = process.env[name];
  if (v === undefined) return defaultVal && workersGloballyEnabled;
  return v.toLowerCase() === "true" && workersGloballyEnabled;
};
const BILLING_SYNC_ENABLED = flag("BILLING_SYNC_ENABLED");
const TRAFFIC_SNAPSHOT_ENABLED = flag("TRAFFIC_SNAPSHOT_ENABLED");
const SLA_ESCALATION_ENABLED = flag("SLA_ESCALATION_ENABLED");
const CSAT_SCHEDULER_ENABLED = flag("CSAT_SCHEDULER_ENABLED");
const BOOST_EXPIRE_ENABLED = flag("BOOST_EXPIRE_ENABLED");
const BROADCAST_WORKER_ENABLED = flag("BROADCAST_WORKER_ENABLED");
const CHATWOOT_CONTACT_SYNC_ENABLED = flag("CHATWOOT_CONTACT_SYNC_ENABLED");
const TEAMSPACE_WORKER_ENABLED = flag("TEAMSPACE_WORKER_ENABLED");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
// Limit 10MB — cukup untuk foto bukti lapangan (auto-compress ke ~300KB per foto)
// Tapi bisa tahan kalau user upload batch, foto mentah sebelum compress, dll.
// Default Express 100KB kekecilan → "request entity too large" error.
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

if (!process.env.SESSION_SECRET && process.env.NODE_ENV === "production") {
  console.warn("[WARN] SESSION_SECRET tidak diset di production! Set env var SESSION_SECRET.");
}

app.use(session({
  secret: process.env.SESSION_SECRET || "ftth-jabnet-secret-dev-only",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 1 day
    secure: false,
    httpOnly: true,
    sameSite: "lax",
  },
}));

// v4.2.13: Multi-domain — portal.jabnet.id khusus pelanggan, fiber-tools.arkanova.id staff
// Saat request masuk dari domain portal, batasi hanya /api/portal/* + /portal/* + static
const PORTAL_HOSTS = new Set(["portal.jabnet.id", "portal.jabnet.local"]);
function isPortalHost(req: express.Request): boolean {
  const h = (req.hostname || (req.headers.host ?? "").toString().split(":")[0] || "").toLowerCase();
  return PORTAL_HOSTS.has(h);
}

// Block staff API endpoints kalau diakses lewat portal domain (security: customer ngga boleh ke staff)
app.use((req, res, next) => {
  if (!isPortalHost(req)) return next();
  if (!req.path.startsWith("/api/")) return next(); // frontend SPA tetap bisa load static
  // Whitelist API: hanya /api/portal/* boleh dari portal domain
  if (req.path.startsWith("/api/portal/")) return next();
  // Health endpoint juga boleh (untuk monitoring uptime check)
  if (req.path === "/api/health" || req.path === "/api/auth/me") return next();
  return res.status(404).json({ success: false, error: "Endpoint tidak tersedia di domain ini" });
});

// API Routes — urutan mount penting:
//   1. Portal pelanggan (public customer endpoints)
//   2. Public API v1 (API key bearer auth, untuk integrasi eksternal)
//   3. Main router (staff endpoints)
app.use(customerPortalRouter);
app.use(publicApiRouter);
app.use(pipelinesTickRouter);
app.use(router);

// Serve frontend — auto-detect dev (tsx) vs production (esbuild bundle):
//   - Production bundle di dist/index.mjs → __dirname=/var/www/ftth-tools/dist → publicPath=./public
//   - Dev via tsx server/index.ts → __dirname=/tmp/ftth-v4xx/server → publicPath=../dist/public
const publicPath = existsSync(path.join(__dirname, "public"))
  ? path.join(__dirname, "public")
  : path.join(__dirname, "..", "dist", "public");
app.use(express.static(publicPath));

// v4.2.21: /api/* yang ngga match endpoint → return 404 JSON (bukan SPA HTML fallback)
// Mencegah confusion "Server error: 200 OK" saat ada route mismatch atau server lama running.
app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    error: `API endpoint tidak ditemukan: ${req.method} ${req.path}. Kemungkinan: (1) typo path, (2) server perlu di-restart dengan kode baru, (3) endpoint belum di-implement.`,
    path: req.path,
    method: req.method,
  });
});

// SPA fallback HANYA untuk non-API path
app.use((_req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

// Global error handler — catch any uncaught error from route handlers
// (Express 5 sudah handle Promise rejection, ini safety net untuk sync throws)
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[ExpressError]", err?.stack ?? err);
  if (res.headersSent) return;
  res.status(500).json({ success: false, error: err?.message ?? "Internal server error" });
});

storage.seedAdminIfNeeded().catch(console.error);

// One-shot cleanup: hapus billing sync worker audit log (noise) setiap startup
storage.cleanupBillingSyncAuditLogs()
  .then((deleted) => { if (deleted > 0) console.log(`[Startup] cleaned up ${deleted} billing-sync worker audit rows`); })
  .catch((e) => console.error("[Startup] cleanup error:", e.message));

// v4.2.19: Seed default broadcast segments + resume stuck campaigns
storage.seedDefaultBroadcastSegments()
  .then(() => console.log("[Startup] broadcast segments seeded"))
  .catch((e) => console.error("[Startup] seed broadcast segments failed:", e.message));
if (BROADCAST_WORKER_ENABLED) {
  import("./broadcast-worker.js").then(({ resumeStuckCampaigns }) => {
    resumeStuckCampaigns().catch(e => console.error("[Startup] resume broadcast campaigns failed:", e.message));
  }).catch(e => console.error("[Startup] broadcast-worker module load failed:", e.message));
} else {
  console.log("[Startup] broadcast worker disabled via env (BROADCAST_WORKER_ENABLED=false)");
}

// v4.1.2: Start BillingSyncWorker (non-blocking)
if (BILLING_SYNC_ENABLED) {
  billingSyncWorker.start().catch(e => console.error("[BillingSyncWorker] startup failed:", e));
} else {
  console.log("[Startup] billing sync worker disabled via env (BILLING_SYNC_ENABLED=false)");
}

// Batch 2f: Chatwoot contact auto-sync worker (opsional, default off — perlu CHATWOOT_CONTACT_SYNC_ENABLED=true)
if (CHATWOOT_CONTACT_SYNC_ENABLED) {
  chatwootContactSyncWorker.start().catch(e => console.error("[ChatwootContactSyncWorker] startup failed:", e));
} else {
  console.log("[Startup] chatwoot contact sync worker disabled (CHATWOOT_CONTACT_SYNC_ENABLED!=true)");
}

// v4.1.3: Start TrafficSnapshotWorker (non-blocking)
if (TRAFFIC_SNAPSHOT_ENABLED) {
  trafficSnapshotWorker.start().catch(e => console.error("[TrafficSnapshotWorker] startup failed:", e));
} else {
  console.log("[Startup] traffic snapshot worker disabled via env (TRAFFIC_SNAPSHOT_ENABLED=false)");
}

// v5.0 Teamspace: scheduler check-in rutin (notifikasi in-app + WA via MPWA)
if (TEAMSPACE_WORKER_ENABLED) {
  teamspaceWorker.start().catch(e => console.error("[TeamspaceWorker] startup failed:", e));
} else {
  console.log("[Startup] teamspace worker disabled via env (TEAMSPACE_WORKER_ENABLED=false)");
}

// v4.2.3: Atomic expire+revert worker untuk Speed-on-Demand boost (poll tiap 60 detik)
// IMPORTANT: revert MikroTik DULU, baru mark expired di DB. Kalau revert gagal,
// tetap status=active untuk retry loop berikutnya — supaya customer ga dapat boost
// gratis selamanya kalau MikroTik sempat offline saat expire fire.
if (!BOOST_EXPIRE_ENABLED) console.log("[Startup] boost expire worker disabled via env (BOOST_EXPIRE_ENABLED=false)");
const boostExpireInterval = !BOOST_EXPIRE_ENABLED ? null : setInterval(async () => {
  try {
    const overdue = await storage.getOverdueActiveRedemptions();
    if (overdue.length === 0) return;

    const { revertBoost } = await import("./mikrotik-boost.js");
    const { sendLoyaltyNotification } = await import("./mpwa.js");

    let success = 0, failed = 0, retries = 0;
    for (const r of overdue) {
      const hasProfile = !!(r as any).originalPppProfile;

      // ── Step 1: Revert MikroTik (kalau ada data profile) ──
      if (hasProfile) {
        const result = await revertBoost(
          r.customerId,
          (r as any).originalPppProfile,
          (r as any).routerId,  // hint, tidak wajib
        ).catch((e: any) => ({ success: false, error: e.message }));

        if (!result.success) {
          // GAGAL revert → JANGAN mark expired, retry next loop
          const attempts = await storage.recordRevertFailure(r.id, result.error ?? "unknown error");
          retries++;
          console.warn(`[BoostExpire] ✗ revert failed #${r.id} (attempt ${attempts}): ${result.error}`);
          // Setelah 10 percobaan gagal (~10 menit), eskalasi log sebagai critical
          if (attempts >= 10 && attempts % 10 === 0) {
            console.error(`[BoostExpire] CRITICAL: redemption #${r.id} GAGAL revert ${attempts}× berturut-turut. Customer #${r.customerId} masih boost. Admin perlu force-expire manual atau benerin MikroTik.`);
          }
          continue; // skip mark expired, lanjut next row
        }
        console.log(`[BoostExpire] ✓ reverted profile for redemption #${r.id} (customer #${r.customerId})`);
      }

      // ── Step 2: Mark expired di DB (atomic) ──
      try {
        await storage.markRevertedAndExpired(r.id);
        success++;
      } catch (e: any) {
        console.warn(`[BoostExpire] markExpired failed #${r.id}:`, e.message);
        failed++;
        continue;
      }

      // ── Step 3: WA notif ke customer ──
      try {
        const customer = await storage.getCustomer(r.customerId);
        const loyalty = await storage.getOrCreateCustomerLoyalty(r.customerId);
        if (customer?.phone) {
          await sendLoyaltyNotification("sahabat_boost_expired", customer.phone, {
            nama: customer.name,
            rewardLabel: r.rewardLabel,
            normalPackage: customer.package || "paket berlangganan",
            lifetimeEarned: String((loyalty as any).pointsLifetimeEarned ?? 0),
            balance: String((loyalty as any).pointsBalance ?? 0),
          });
        }
      } catch (e: any) { console.warn(`[BoostExpire] WA notif #${r.id}:`, e.message); }
    }

    if (success + retries + failed > 0) {
      console.log(`[BoostExpire] processed ${overdue.length}: ${success} reverted+expired, ${retries} retry, ${failed} fail`);
    }
  } catch (e: any) {
    console.warn("[BoostExpire] loop error:", e.message);
  }
}, 60_000);

// v4.2.17: SLA escalation worker — cek tiket aktif tiap 5 menit
// Trigger di 25%/10% time remaining, dan saat breached. Notif supervisor + log.
if (!SLA_ESCALATION_ENABLED) console.log("[Startup] SLA escalation worker disabled via env (SLA_ESCALATION_ENABLED=false)");
const slaEscalationInterval = !SLA_ESCALATION_ENABLED ? null : setInterval(async () => {
  try {
    // Multi-tenant: iterate semua mitra aktif. Storage methods (getTicketsNeedingSlaEscalation,
    // createNotification, recordSlaEscalation) butuh tenant context — tanpa withMitra mereka throw
    // "Missing context" dan escalation diam-diam tidak pernah jalan.
    const mitras = await storage.listMitras(false);
    const { notifyRolesTelegram } = await import("./telegram.js");
    const isSupervisorRole = (role?: string | null) =>
      role === "System-Admin" || role === "Admin" || role === "Administrator" /* legacy */
      || role === "admin" || role === "Supervisor";
    for (const m of mitras) {
      await withMitra(m.id, async () => {
        const escalations = await storage.getTicketsNeedingSlaEscalation();
        if (escalations.length === 0) return;
        // Supervisor in-app notif di-scope ke anggota mitra ini saja.
        const memberIds = await storage.getUserIdsInMitra(m.id);
        const supervisorIds = (await storage.getAllUsers())
          .filter((u: any) => memberIds.has(u.id) && isSupervisorRole(u.role))
          .map((u: any) => u.id);

        for (const { ticket, level } of escalations) {
          const emoji = level === "breached" ? "🚨" : level === "warning_10pct" ? "⚠️" : "⏰";
          const headline =
            level === "breached" ? "SLA TERLEWAT" :
            level === "warning_10pct" ? "SLA hampir habis (<10%)" :
            "SLA segera habis (<25%)";
          const msg = `${emoji} *${headline}*\n\n*${(ticket as any).ticketNumber}* — ${(ticket as any).title}\nDeadline: ${new Date((ticket as any).slaDeadline).toLocaleString("id-ID")}\nStatus: ${(ticket as any).status}`;
          try {
            await notifyRolesTelegram(["System-Admin", "Admin", "Administrator", "admin", "Supervisor"], "sla_escalation", msg);
          } catch (e: any) { console.warn("[SLA Esc] telegram fail:", e.message); }
          // Notif in-app ke supervisor mitra ini
          for (const sid of supervisorIds) {
            try {
              await storage.createNotification({
                userId: sid,
                type: "sla_escalation",
                title: headline,
                message: `${(ticket as any).ticketNumber}: ${(ticket as any).title}`,
                link: `/tickets`,
                entityType: "ticket", entityId: (ticket as any).id,
              });
            } catch {}
          }
          await storage.recordSlaEscalation((ticket as any).id, level, supervisorIds);
          console.log(`[SLA Esc] mitra ${m.id}: ${level} fired untuk #${(ticket as any).id} (${(ticket as any).ticketNumber})`);
        }
      });
    }
  } catch (e: any) {
    console.warn("[SLA Esc] loop error:", e.message);
  }
}, 5 * 60_000);

// v4.2.17: CSAT scheduler — kirim WhatsApp survey 24h setelah ticket close (tiap 10 menit cek due ones)
if (!CSAT_SCHEDULER_ENABLED) console.log("[Startup] CSAT scheduler disabled via env (CSAT_SCHEDULER_ENABLED=false)");
const csatSchedulerInterval = !CSAT_SCHEDULER_ENABLED ? null : setInterval(async () => {
  try {
    // Multi-tenant: getDueCsatSurveys + getTicket + markCsatSent/Failed butuh tenant context.
    const mitras = await storage.listMitras(false);
    const { sendLoyaltyNotification } = await import("./mpwa.js");
    for (const m of mitras) {
      await withMitra(m.id, async () => {
        const due = await storage.getDueCsatSurveys(50);
        if (due.length === 0) return;
        let sent = 0, failed = 0;
        for (const csat of due) {
          try {
            const ticket = await storage.getTicket(csat.ticketId);
            if (!ticket || !csat.customerId) { await storage.markCsatFailed(csat.id, "ticket/customer missing"); continue; }
            const customer = await storage.getCustomer(csat.customerId);
            if (!customer?.phone) { await storage.markCsatFailed(csat.id, "no phone"); continue; }
            // Cari domain portal — default portal.jabnet.id, fallback fiber-tools
            const portalBase = (await storage.getSetting("portal_base_url")) || "https://portal.jabnet.id";
            const csatUrl = `${portalBase}/csat/${csat.token}`;
            // Cari teknisi yang resolve
            let teknisiName = "tim teknisi";
            if (csat.resolvedByUserId) {
              const u = await storage.getUser(csat.resolvedByUserId).catch(() => null);
              if (u) teknisiName = u.name;
            }
            await sendLoyaltyNotification("csat_survey", customer.phone, {
              nama: customer.name,
              ticketNumber: ticket.ticketNumber,
              teknisi: teknisiName,
              csatUrl,
            });
            await storage.markCsatSent(csat.id);
            sent++;
          } catch (e: any) {
            await storage.markCsatFailed(csat.id, e.message);
            failed++;
            console.warn(`[CSAT] send #${csat.id} fail:`, e.message);
          }
        }
        if (sent + failed > 0) console.log(`[CSAT] mitra ${m.id} processed ${due.length}: ${sent} sent, ${failed} failed`);
      });
    }
  } catch (e: any) {
    console.warn("[CSAT] loop error:", e.message);
  }
}, 10 * 60_000);

// Graceful shutdown untuk PM2 restart — drain in-flight sync sebelum exit
const shutdown = async (sig: string) => {
  console.log(`[Server] ${sig} received, stopping workers...`);
  if (boostExpireInterval) clearInterval(boostExpireInterval);
  if (slaEscalationInterval) clearInterval(slaEscalationInterval);
  if (csatSchedulerInterval) clearInterval(csatSchedulerInterval);
  if (BILLING_SYNC_ENABLED) {
    try { await billingSyncWorker.stop(); } catch (e: any) { console.error("[Shutdown] billing worker stop error:", e.message); }
  }
  if (TRAFFIC_SNAPSHOT_ENABLED) {
    try { await trafficSnapshotWorker.stop(); } catch (e: any) { console.error("[Shutdown] traffic worker stop error:", e.message); }
  }
  if (CHATWOOT_CONTACT_SYNC_ENABLED) {
    try { await chatwootContactSyncWorker.stop(); } catch (e: any) { console.error("[Shutdown] chatwoot contact sync worker stop error:", e.message); }
  }
  if (TEAMSPACE_WORKER_ENABLED) {
    try { await teamspaceWorker.stop(); } catch (e: any) { console.error("[Shutdown] teamspace worker stop error:", e.message); }
  }
  process.exit(0);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Defensive: jangan crash proses karena unhandled rejection/exception dari async worker/HTTP client
process.on("unhandledRejection", (reason: any) => {
  console.error("[unhandledRejection]", reason?.stack ?? reason);
});
process.on("uncaughtException", (err: Error) => {
  console.error("[uncaughtException]", err?.stack ?? err);
  // Keep running — worker loops auto-recover
});

app.listen(PORT, () => {
  console.log(`[JABNET FTTH] Server running on http://localhost:${PORT}`);
  if (process.env.NODE_ENV !== "production") {
    console.log(`[JABNET FTTH] Frontend: http://localhost:${PORT} (Vite middleware aktif)`);
  }
});

export default app;
