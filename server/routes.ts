import { Router, type Request, type Response, type NextFunction } from "express";
import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { storage } from "./storage.js";
import { computeManualSyncCooldown, canWriteMitraIntegration } from "./billing-admin-helpers.js";
import { tenantContext, withMitra } from "./tenant-context.js";
import { resolveAdFields } from "./lead-campaign.js";
import { getCached, setCached, invalidateCached, invalidateCachedPrefix } from "./route-cache.js";
import { resolveMapMitraId } from "./map-helpers.js";
import { invalidatePermCacheAtMitra } from "./perm-cache.js";
import { validateFieldValue } from "./pipeline-field-helpers.js";
import { resolvePipelineCapabilities, deriveLevel, PIPELINE_CAPABILITY_LABELS, isAdminLockedRole, type PipelineCapability } from "../shared/pipelineCapabilities.js";
import { resolveTeamPipelineCapabilities, parseTeamRole, canManageTeam, canCreateTeam, canSeePrivateCard, parseMovePermission, canMoveWithStage, parseEnabledViews, type PermKeyLevel } from "../shared/teamAccess.js";
import { parseSendDays, isValidSendTime, localDateStr } from "../shared/checkinSchedule.js";
import { parseEventRecurrence, buildTeamCalendarIcs } from "../shared/eventRecurrence.js";
import { computeScore, parseScoreWeights } from "../shared/performanceScore.js";
import { customerConnStatus } from "../shared/customerStatus.js";
import { DEFAULT_OPTICAL_THRESHOLDS, type OpticalThresholds } from "../shared/opticalPower.js";
import { buildDeviceIndexes, matchCustomerDevice } from "./ont-match.js";
import { runStageEnterAutomations, dispatchCardEvent } from "./pipeline-automation.js";
import { parseRecurrence } from "../shared/ruleRecurrence.js";
import { COLLECTION_ATTRS } from "../shared/collectionMetrics.js";
import { shapeRuleActions, parseConditionGroups, parseTimeTriggerConfig } from "./pipeline-automation-helpers.js";
import { devDbSyncAvailable } from "./dev-db-sync.js";
import { getBuildInfo, checkForUpdate, runSelfUpdate, passengerRestartSupported, type SelfUpdateConfig } from "./self-update.js";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { streamPhoto, ensureMitraDirs, renameMitraDir, trashMitraDir, saveUploadedFile, streamFile, deletePhoto } from "./uploads.js";
import { parseMultipart } from "./multipart.js";
import { validateAttachment, ATTACHMENT_MAX_BYTES } from "../shared/attachmentRules.js";
import { emitLeadEvent } from "./lead-events.js";
import {
  insertPopSchema, insertOdcSchema, insertOdpSchema,
  insertCustomerSchema, insertPoleSchema, insertCableSchema,
  insertOtbSchema, insertBestraySchema, insertSplitterSchema,
  insertCableCoreSchema, insertCoreConnectionSchema,
  LEAD_STAGES, LEAD_STAGE_LABELS,
  ALL_PERMISSION_KEYS, type PermissionLevel, checkPermLevel, cleansePermissionMatrix,
  ALL_FEATURES, TEAM_DEFAULT_VIEWS,
  type RuleTriggerType,
  type PipelineCard,
  type PipelineCardAttachment,
} from "../shared/schema.js";
import { canAddType, getFieldTypeMeta, isMultiUser } from "../shared/pipelineFieldTypes.js";
import { BILLING_ATTRS, attrCompatibleWithFieldType, OVERDUE_DATE_ATTRS } from "../shared/pipelineBillingIntake.js";
import { parseLeadTriggerConfig, LEAD_ATTRS, attrCompatibleWithFieldType as leadAttrCompatible } from "../shared/leadIntake.js";
import { leadConditionAttrValid, opValidForAttr, LEAD_CONDITION_ATTRS } from "../shared/leadConditions.js";
import { isValidEntityType } from "../shared/cardRelations.js";
import { parseFieldRules, isFieldVisible, isFieldRequired, hasRequiredWhen } from "../shared/fieldRules.js";
import { buildExportColumns, formatCardForExport, resolveImportRow, type CsvField } from "../shared/cardCsv.js";
import { resolveFieldAccess, type FieldAccessLevel } from "../shared/fieldPermissions.js";
import { resolveCardFilter, cardPassesFilter } from "../shared/cardRowFilter.js";
import { parseCollectionsMode } from "../shared/collectionsMode.js";
import { validateBulkRequest, applyTagChange, parseTags, type BulkOp } from "../shared/bulkCardOps.js";
import { getCollectionMetrics } from "./collection-metrics.js";
import { computeAllPipelineMetrics } from "./pipeline-metrics-engine.js";
import { METRIC_SOURCES, METRIC_AGGREGATIONS, METRIC_TYPES } from "../shared/pipelineMetrics.js";
import { TIME_PRESETS } from "../shared/metricTimeWindow.js";
import { FORMULA_TERM_KEYS, parseFormula } from "../shared/metricFormula.js";

declare module "express-serve-static-core" {
  interface Request {
    authUser?: {
      id: number;
      username: string;
      name: string;
      role: string;
      roleId: number | null;
      effectiveRoleId: number | null;  // resolved per-mitra role id (distinct from global roleId)
      roleName: string | null;
      isSystemAdmin: boolean;        // true jika role bawaan System-Admin di mitra=1 (cross-tenant full access)
      canSeeAllData: boolean;        // supervisor flag - lihat data semua user
      permLevels: Record<string, PermissionLevel>;  // {feature: "read"|"write"|"none"}
      permissions: string[];          // DEPRECATED: legacy array of permission keys (read or write >= "read")
      activeMitraId: number;          // Phase B: currently active tenant (default 1 = JABNET)
    };
  }
}

export const router = Router();

// Auto-invalidate route-cache on successful mutations.
// Asset/customer mutations bust the dashboard + map-infra caches that
// aggregate them; isolated GETs and unrelated mutations pass through.
router.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  res.on("finish", () => {
    if (res.statusCode >= 400) return;
    const p = req.path;
    if (/\/api\/(pops|odcs|odps|poles|cables|cable-cores)(\/|$)/.test(p)) {
      invalidateCached("dashboard");
      invalidateCachedPrefix("map-infra");
    } else if (/\/api\/customers(\/|$)/.test(p)) {
      invalidateCached("dashboard");
    }
  });
  next();
});

// v4.2.21: Health check + version endpoint untuk verify server live
const SERVER_VERSION = "4.2.27";
const SERVER_FEATURES = ["wa-v2", "mpwa-full-spec", "direct-recipients", "broadcast-worker", "audience-grouping", "phonebook", "template-preview", "broadcast-detail", "phonebook-tags", "phonebook-cross-import", "phonebook-smart-filter"];
router.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      ok: true,
      version: SERVER_VERSION,
      features: SERVER_FEATURES,
      startedAt: SERVER_STARTED_AT,
      uptime: Math.round((Date.now() - SERVER_STARTED_AT) / 1000),
      timestamp: new Date().toISOString(),
    },
  });
});
const SERVER_STARTED_AT = Date.now();

// Public, unauthenticated config - used by GoogleMapsProvider on app load.
// Only safe values exposed (Maps key is domain-restricted at GCP side).
// In-memory cache per mitra (slug or id) with 60s TTL to avoid DB hammer.
// Phase F: respect per-mitra google_maps_api_key override (falls back to global app_settings).
const publicConfigCache = new Map<string, { data: { googleMapsApiKey: string }; expiresAt: number }>();
/** GET /api/public/mitras/by-slug/:slug - public lookup for portal slug resolution. NO AUTH. */
router.get("/api/public/mitras/by-slug/:slug", async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug ?? "").toLowerCase().trim();
    if (!slug || slug.length > 50) return sendError(res, "Slug tidak valid", 400);
    const m = await storage.getMitraBySlug(slug);
    if (!m || (m as any).isActive === 0) return sendError(res, "Mitra tidak ditemukan", 404);
    // Return only public-safe fields
    sendSuccess(res, {
      id: m.id,
      slug: m.slug,
      name: (m as any).displayName ?? m.name,
      logoUrl: (m as any).logoUrl ?? null,
    });
  } catch (e: any) {
    sendError(res, e.message ?? "Internal error", 500);
  }
});

router.get("/api/public-config", async (req: Request, res: Response) => {
  try {
    // Resolve target mitra: ?slug=jabnet OR ?mitra=1 OR default to mitra 1
    const slugParam = String(req.query.slug ?? "").trim();
    const mitraIdParam = Number(req.query.mitra);
    let targetMitraId = 1;
    if (slugParam) {
      const m = await storage.getMitraBySlug(slugParam);
      if (m) targetMitraId = m.id;
    } else if (Number.isFinite(mitraIdParam) && mitraIdParam > 0) {
      targetMitraId = mitraIdParam;
    }
    const cacheKey = String(targetMitraId);
    const now = Date.now();
    const cached = publicConfigCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return res.json({ success: true, data: cached.data });
    }
    // Resolve key inside target mitra context (helper falls back to app_settings)
    const googleMapsApiKey = await new Promise<string>((resolve) => {
      tenantContext.run({ mitraId: targetMitraId, userId: 0, isSuperAdmin: true }, async () => {
        try {
          const v = (await storage.getMitraSetting("google_maps_api_key")) || "";
          resolve(v);
        } catch { resolve(""); }
      });
    });
    const data = { googleMapsApiKey, devDbSync: devDbSyncAvailable(process.env) };
    publicConfigCache.set(cacheKey, { data, expiresAt: now + 60_000 });
    res.json({ success: true, data });
  } catch (e: any) {
    res.json({ success: true, data: { googleMapsApiKey: "", devDbSync: false } });
  }
});

router.post("/api/dev/db-sync", async (req: Request, res: Response) => {
  // Env gate FIRST - on production these vars are absent, so the route 404s (looks like it doesn't exist).
  if (!devDbSyncAvailable(process.env)) return sendError(res, "Not found", 404);
  if (!requireWritePermission(req, res, "integrations")) return;
  try {
    const result = await storage.runDevDbSyncFromProd(process.env.PROD_DB_NAME!);
    const failed = result.tables.filter((t) => !t.ok);
    sendSuccess(res, {
      tablesCopied: result.tables.filter((t) => t.ok).length,
      totalRows: result.totalRows,
      durationMs: result.durationMs,
      perTable: result.tables,
      failed,
    });
    // Best-effort: trigger a Passenger reload so in-memory caches (route-cache, perm cache,
    // public-config) are rebuilt against the freshly-copied data. Reloads on next HTTP request.
    try {
      const tmpDir = path.join(process.cwd(), "tmp");
      await mkdir(tmpDir, { recursive: true });
      await writeFile(path.join(tmpDir, "restart.txt"), new Date().toISOString());
    } catch { /* ignore - not fatal */ }
  } catch (e: any) {
    sendError(res, e?.message || "Sinkronisasi gagal", 500);
  }
});

// ==================== SELF-UPDATE (pembaruan aplikasi dari GitHub) ====================

/** Baca konfigurasi self-update dari app_settings (global). */
async function loadSelfUpdateConfig(): Promise<SelfUpdateConfig> {
  const [enabled, repo, branch, token, runNpm] = await Promise.all([
    storage.getSetting("self_update_enabled"),
    storage.getSetting("self_update_repo"),
    storage.getSetting("self_update_branch"),
    storage.getSetting("self_update_github_token"),
    storage.getSetting("self_update_run_npm"),
  ]);
  return {
    enabled: enabled === "true",
    repo: (repo || "kanggalon710/workspace").trim(),
    branch: (branch || "deploy").trim(),
    token: token && token.trim() ? token.trim() : null,
    runNpm: runNpm !== "false",
  };
}

// Cache hasil check GitHub agar poll klien tidak spam API (rate limit).
let _updateCheckCache: { at: number; data: any } | null = null;
const UPDATE_CHECK_TTL_MS = 5 * 60_000;

/** Notifikasi admin sekali per SHA baru (dedup via setting self_update_notified_sha). */
async function notifyAdminsOfUpdate(remoteSha: string, remoteShort: string): Promise<void> {
  const last = await storage.getSetting("self_update_notified_sha");
  if (last === remoteSha) return;
  try {
    const users = await storage.getAllUsers();
    const admins = users.filter((u: any) => u.isActive === 1 && (u.isSystemAdmin || u.role === "admin" || u.role === "Administrator"));
    for (const a of admins) {
      await storage.createNotification({
        userId: a.id, type: "system_update",
        title: "Versi terbaru tersedia",
        message: `Pembaruan aplikasi (${remoteShort}) sudah tersedia. Buka Integrasi untuk update.`,
        link: "/integrations", entityType: "system_update",
      });
    }
    await storage.setSetting("self_update_notified_sha", remoteSha, "update", "SHA terakhir dinotifikasi");
  } catch (e: any) { console.error("[self-update] notify gagal:", e?.message); }
}

// Info versi lokal - boleh dibaca semua user login (untuk tampil di footer/pengaturan).
router.get("/api/system/version", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const info = await getBuildInfo();
    const restartSupported = await passengerRestartSupported();
    sendSuccess(res, { ...info, restartSupported });
  } catch (e: any) { sendError(res, e?.message || "Gagal baca versi", 500); }
});

// Cek pembaruan ke GitHub (admin). Cache 5 menit; buat notifikasi admin saat ada versi baru.
router.get("/api/system/update/check", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const force = req.query.force === "true";
    if (!force && _updateCheckCache && Date.now() - _updateCheckCache.at < UPDATE_CHECK_TTL_MS) {
      return sendSuccess(res, { ...(_updateCheckCache.data), cached: true });
    }
    const cfg = await loadSelfUpdateConfig();
    const result = await checkForUpdate(cfg);
    const payload = { ...result, enabled: cfg.enabled, repo: cfg.repo, branch: cfg.branch, tokenSet: !!cfg.token };
    _updateCheckCache = { at: Date.now(), data: payload };
    if (result.updateAvailable && result.remote.sourceSha) {
      await notifyAdminsOfUpdate(result.remote.sourceSha, result.remote.sourceShaShort || result.remote.sourceSha.slice(0, 7));
    }
    sendSuccess(res, { ...payload, cached: false });
  } catch (e: any) { sendError(res, e?.message || "Gagal cek pembaruan", 500); }
});

// Terapkan pembaruan (admin + self_update_enabled). Menjalankan git reset + restart.
router.post("/api/system/update/apply", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const cfg = await loadSelfUpdateConfig();
    if (!cfg.enabled) return sendError(res, "Update otomatis dinonaktifkan. Aktifkan dulu di Integrasi (self_update_enabled).", 403);
    if (!cfg.repo || !cfg.branch) return sendError(res, "Repo/branch update belum di-set.", 400);
    const result = await runSelfUpdate(cfg);
    try { await logAudit(req, "UPDATE", "system", 0, `Self-update ${result.newBuild.sourceShaShort ?? "?"}`, { ok: result.ok, restart: result.restartTriggered }); } catch { /* - */ }
    _updateCheckCache = null; // reset cache supaya cek berikutnya akurat
    if (result.newBuild.sourceSha) await storage.setSetting("self_update_notified_sha", result.newBuild.sourceSha, "update", "SHA terakhir dinotifikasi").catch(() => {});
    sendSuccess(res, result);
  } catch (e: any) { sendError(res, e?.message || "Gagal menerapkan pembaruan", 500); }
});

// ==================== HELPERS ====================

function sendSuccess(res: Response, data: unknown, statusCode = 200) {
  res.status(statusCode).json({ success: true, data });
}

function sendError(res: Response, message: string, statusCode = 400) {
  res.status(statusCode).json({ success: false, error: message });
}

async function computeAuthFlags(userId: number, activeMitraId: number) {
  const ownerEff = await storage.getUserEffectivePermissionsAtMitra(userId, 1);
  const eff = activeMitraId === 1
    ? ownerEff
    : await storage.getUserEffectivePermissionsAtMitra(userId, activeMitraId);
  return { eff, isSystemAdmin: ownerEff.roleName === "System-Admin" && ownerEff.isSystem };
}

// ==================== AUTH MIDDLEWARE ====================

/** Parse "Cookie: a=1; b=2" header → record. Lightweight inline parser (no cookie-parser dep). */
function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Prefer Authorization header (API clients); fallback ke ftth_session cookie (untuk <img> tag).
  let token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    const cookies = parseCookieHeader(req.headers.cookie);
    if (cookies.ftth_session) token = cookies.ftth_session;
  }
  if (token) {
    const user = await storage.getUserByToken(token);
    if (user && user.isActive) {
      // Phase B: load active mitra (validate user is still member; fallback to 1)
      let activeMitraId = Number((user as any).activeMitraId ?? 1);
      const isMember = await storage.isUserMemberOfMitra(user.id, activeMitraId);
      if (!isMember) {
        // User's activeMitraId is invalid/revoked - fallback to primary membership or 1
        const memberships = await storage.getUserMitras(user.id);
        activeMitraId = memberships[0]?.id ?? 1;
      }
      // Resolve per-mitra permissions. isSystemAdmin is true only for System-Admin role at mitra=1.
      const { eff, isSystemAdmin } = await computeAuthFlags(user.id, activeMitraId);
      const legacyPerms = Object.keys(eff.perms).filter(k => eff.perms[k] === "read" || eff.perms[k] === "write");
      req.authUser = {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role ?? "operator",
        roleId: (user as any).roleId ?? null,
        effectiveRoleId: eff.roleId,
        roleName: eff.roleName,
        isSystemAdmin,
        canSeeAllData: eff.canSeeAllData,
        permLevels: eff.perms,
        permissions: legacyPerms,
        activeMitraId,
      };
    }
  }
  // Phase B: wrap downstream handlers in tenant context so storage.getMitraId() works.
  if (req.authUser) {
    tenantContext.run({
      mitraId: req.authUser.activeMitraId,
      userId: req.authUser.id,
      isSuperAdmin: req.authUser.isSystemAdmin,
    }, () => next());
  } else {
    // Unauthenticated public requests (coverage-check landing page, ad-lead webhooks,
    // login, public-config). Default to JABNET (mitra 1, the root billing provider) so
    // public storage reads/writes have a tenant scope instead of crashing in getMitraId().
    // Login is unaffected: getUserByUsername/getUserByToken are NOT tenant-scoped. Protected
    // endpoints still reject anon via the auth guard + globalWriteGuard below.
    tenantContext.run({ mitraId: 1, userId: 0, isSuperAdmin: false }, () => next());
  }
}
router.use(authMiddleware);

/** Check if user has READ access to a feature. System admin always passes. */
function hasPermission(req: Request, feature: string): boolean {
  if (!req.authUser) return false;
  if (req.authUser.isSystemAdmin) return true;
  // Legacy: kalau role === "admin" text tapi belum migrate (JABNET mitra=1 only)
  if (req.authUser.role === "admin" && !req.authUser.roleId && req.authUser.activeMitraId === 1) return true;
  return checkPermLevel(req.authUser.permLevels, feature, "read");
}

/** Check if user has WRITE access to a feature. System admin always passes. */
function hasWritePermission(req: Request, feature: string): boolean {
  if (!req.authUser) return false;
  if (req.authUser.isSystemAdmin) return true;
  if (req.authUser.role === "admin" && !req.authUser.roleId && req.authUser.activeMitraId === 1) return true;
  return checkPermLevel(req.authUser.permLevels, feature, "write");
}

/** Guard: require READ permission or return 403 */
function requirePermission(req: Request, res: Response, feature: string): boolean {
  if (!req.authUser) { sendError(res, "Unauthorized", 401); return false; }
  if (!hasPermission(req, feature)) { sendError(res, `Akses ditolak: tidak memiliki izin '${feature}' (read)`, 403); return false; }
  return true;
}

/** Guard: require WRITE permission or return 403 */
function requireWritePermission(req: Request, res: Response, feature: string): boolean {
  if (!req.authUser) { sendError(res, "Unauthorized", 401); return false; }
  if (!hasWritePermission(req, feature)) { sendError(res, `Akses ditolak: fitur '${feature}' bersifat read-only untuk role Anda`, 403); return false; }
  return true;
}

/** Teamspace v5.0: endpoint pipeline melayani juga board tugas tim, jadi gerbang fitur
 *  menerima key `pipelines` ATAU `team_tasks`. Ini TIDAK membocorkan data: resolusi
 *  per-pipeline di getPipelineCapabilities tetap ketat - pemegang team_tasks tanpa
 *  key pipelines mendapat nol kapabilitas atas pipeline ops, dan sebaliknya pemegang
 *  pipelines yang bukan anggota tim mendapat nol kapabilitas atas board tim. */
function requirePipelinesFeature(req: Request, res: Response): boolean {
  if (!req.authUser) { sendError(res, "Unauthorized", 401); return false; }
  if (hasPermission(req, "pipelines") || hasPermission(req, "team_tasks")) return true;
  sendError(res, "Akses ditolak: tidak memiliki izin 'pipelines' (read)", 403);
  return false;
}

function requireWritePipelinesFeature(req: Request, res: Response): boolean {
  if (!req.authUser) { sendError(res, "Unauthorized", 401); return false; }
  if (hasWritePermission(req, "pipelines") || hasWritePermission(req, "team_tasks")) return true;
  sendError(res, "Akses ditolak: fitur 'pipelines' bersifat read-only untuk role Anda", 403);
  return false;
}

/**
 * Map URL path → feature permission key. Dipakai global write guard middleware.
 * Pattern match diurutkan dari yang paling spesifik ke yang umum (prefix).
 */
const PATH_TO_FEATURE: Array<{ pattern: RegExp; feature: string }> = [
  // Marketing & leads
  { pattern: /^\/api\/marketing\/canvassing\b/, feature: "canvassing" },
  { pattern: /^\/api\/marketing\/leads\b/, feature: "leads" },
  { pattern: /^\/api\/marketing\/prospects\b/, feature: "prospects" },
  { pattern: /^\/api\/marketing\/ads\b/, feature: "marketing_ads" },
  { pattern: /^\/api\/marketing\b/, feature: "marketing_dashboard" },
  // Billing / MikroTik / ONT
  // v4.1.2: Collections + billing sync - urutkan SEBELUM /api/billing\b biar spesifik tangkap duluan
  { pattern: /^\/api\/collections\b/, feature: "collections" },
  { pattern: /^\/api\/billing\/sync\b/, feature: "billing_sync" },
  { pattern: /^\/api\/billing\b/, feature: "billing_sync" },
  { pattern: /^\/api\/customers\b/, feature: "customers" },
  { pattern: /^\/api\/tickets\b/, feature: "tickets" },
  { pattern: /^\/api\/ticket-categories\b/, feature: "tickets" },
  { pattern: /^\/api\/mikrotik\/routers\b/, feature: "routers" },
  { pattern: /^\/api\/mikrotik\/[^/]+\/ppp\/profile\b/, feature: "packages" },
  { pattern: /^\/api\/mikrotik\/[^/]+\/ppp\/secret\b/, feature: "customers" },
  { pattern: /^\/api\/mikrotik\/[^/]+\/queue\b/, feature: "monitoring" },
  { pattern: /^\/api\/mikrotik\b/, feature: "monitoring" },
  { pattern: /^\/api\/genieacs\b/, feature: "devices" },
  // Aset jaringan
  { pattern: /^\/api\/pops\b/, feature: "pops" },
  { pattern: /^\/api\/odcs\b/, feature: "odcs" },
  { pattern: /^\/api\/odps\b/, feature: "odps" },
  { pattern: /^\/api\/poles\b/, feature: "poles" },
  { pattern: /^\/api\/cables\b/, feature: "cables" },
  { pattern: /^\/api\/otbs\b/, feature: "otbs" },
  { pattern: /^\/api\/bestrays\b/, feature: "bestrays" },
  { pattern: /^\/api\/splitters\b/, feature: "splitters" },
  { pattern: /^\/api\/cable-cores\b/, feature: "cable_cores" },
  { pattern: /^\/api\/core-connections\b/, feature: "core_connections" },
  // Tools
  { pattern: /^\/api\/export-import\b/, feature: "export_import" },
  { pattern: /^\/api\/settings\b/, feature: "integrations" },
  { pattern: /^\/api\/mpwa\b/, feature: "mpwa" },
  { pattern: /^\/api\/pipelines\b/, feature: "pipelines" },
];

/**
 * Global write guard: auto-applied ke SEMUA endpoint mutation (POST/PUT/PATCH/DELETE).
 * Hanya admin/user_management endpoints bypass (sudah punya requireAdmin sendiri).
 * Ini defense-in-depth: meski route handler tidak panggil requireWritePermission, guard ini tangkap.
 */
function globalWriteGuard(req: Request, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  // Only block mutation methods
  if (method !== "POST" && method !== "PUT" && method !== "PATCH" && method !== "DELETE") {
    return next();
  }
  // Skip untuk auth, user-management, roles, audit (sudah ada requireAdmin)
  // Juga skip public endpoints (coverage-check, login)
  const path = req.path;
  const skipPrefixes = [
    "/api/auth/",
    "/api/users",
    "/api/roles",
    "/api/audit-logs",
    "/api/coverage-check",
    "/api/telegram/webhook",  // Telegram Bot API hit endpoint ini tanpa auth
    "/api/integrations/chatwoot/webhook",  // v4.2.5: Chatwoot webhook tanpa auth (pakai HMAC verify)
  ];
  if (skipPrefixes.some(p => path.startsWith(p))) return next();
  // Tickets: self-service endpoints (check-in, evidence, gps) dibiarkan lewat karena teknisi pakai role dengan write tickets
  // Skip ticket self-service yang di /api/tickets/:id/... → sudah covered di pattern "tickets"

  if (!req.authUser) return sendError(res, "Unauthorized", 401);

  // System admin bypass
  if (req.authUser.isSystemAdmin) return next();
  if (req.authUser.role === "admin" && !req.authUser.roleId && req.authUser.activeMitraId === 1) return next();

  // Match path → feature
  const matched = PATH_TO_FEATURE.find(m => m.pattern.test(path));
  if (!matched) return next(); // endpoint belum di-map → biarkan (fallback ke guard internal route)

  // Teamspace: endpoint pipeline dipakai juga board tugas tim - team_tasks write setara
  // (keamanan per-pipeline tetap di getPipelineCapabilities).
  if (matched.feature === "pipelines" && hasWritePermission(req, "team_tasks")) return next();

  if (!hasWritePermission(req, matched.feature)) {
    return sendError(res, `Akses ditolak: fitur '${matched.feature}' bersifat read-only untuk role Anda (path=${path})`, 403);
  }
  next();
}
router.use(globalWriteGuard);

/** Check if user is system admin (System-Admin role di mitra=1) */
function isSystemAdmin(req: Request): boolean {
  if (!req.authUser) return false;
  if (req.authUser.isSystemAdmin) return true;
  if (req.authUser.role === "admin" && !req.authUser.roleId && req.authUser.activeMitraId === 1) return true; // legacy (JABNET only)
  return false;
}

/** Validate a user may be assigned to a card in this pipeline, in the current request context.
 *  Returns null if OK, else an Indonesian error string.
 *  - Always: target user must exist and be active.
 *  - JABNET sysadmin: any existing+active user (cross-tenant, record-only - grants no access).
 *  - Everyone else: target must already have access to the pipeline (existing rule preserved). */
async function validateAssignTarget(req: Request, userId: number, pipelineId: number): Promise<string | null> {
  const u = await storage.getUser(userId);
  if (!u || (u as any).isActive === 0) return "User tidak ditemukan atau nonaktif";
  if (isSystemAdmin(req)) return null;
  if (!(await storage.canUserAccessPipeline(userId, pipelineId))) return "User tidak punya akses ke pipeline ini";
  return null;
}

async function logAudit(req: Request, action: string, entityType: string, entityId?: number, entityName?: string, details?: object) {
  if (!req.authUser) return;
  // Fire-and-forget - no await. Errors logged inside createAuditLog.
  void storage.createAuditLog({
    userId: req.authUser.id,
    username: req.authUser.username,
    userName: req.authUser.name,
    action,
    entityType,
    entityId: entityId ?? null,
    entityName: entityName ?? null,
    details: details ? JSON.stringify(details) : null,
    createdAt: new Date().toISOString(),
  });
}

/**
 * v4.2.18 (A.3): logTicketActivity - capture IP/User-Agent/GPS dari request automatically.
 * Pakai action enum yang konsisten:
 *   "ticket.created" | "ticket.assigned" | "ticket.priority_changed" |
 *   "stage.started" | "stage.completed" | "stage.edited" |
 *   "comment.added" | "attachment.uploaded" | "status.changed" |
 *   "team.added" | "team.removed" | "ticket.held" | "ticket.escalated" |
 *   "csat.scheduled" | "csat.responded"
 */
async function logTicketActivity(
  req: Request,
  ticketId: number,
  action: string,
  payload?: any,
  summary?: string,
): Promise<void> {
  if (!req.authUser) return;
  // GPS dari body kalau ada (frontend kirim saat advance-stage / check-in)
  const gpsLat = typeof req.body?.lat === "number" ? req.body.lat : null;
  const gpsLng = typeof req.body?.lng === "number" ? req.body.lng : null;
  await storage.logActivity({
    ticketId,
    actorId: req.authUser.id,
    action,
    payload,
    ip: getClientIp(req),
    userAgent: (req.headers["user-agent"] ?? null) as string | null,
    gpsLat, gpsLng,
    summary: summary ?? (typeof payload === "string" ? payload : undefined),
  }).catch((e: any) => console.warn(`[logTicketActivity] ${action} fail:`, e.message));
}

// ==================== RATE LIMITING ====================

const loginAttempts = new Map<string, { count: number; lastAttempt: number; lockedUntil: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 menit
const ATTEMPT_WINDOW_MS = 5 * 60 * 1000; // 5 menit

function getClientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
}

function checkRateLimit(key: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry) return { allowed: true };
  if (entry.lockedUntil > now) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.lockedUntil - now) / 1000) };
  }
  // Reset if window expired
  if (now - entry.lastAttempt > ATTEMPT_WINDOW_MS) {
    loginAttempts.delete(key);
    return { allowed: true };
  }
  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    entry.lockedUntil = now + LOCK_DURATION_MS;
    return { allowed: false, retryAfterSec: Math.ceil(LOCK_DURATION_MS / 1000) };
  }
  return { allowed: true };
}

function recordFailedLogin(key: string) {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now - entry.lastAttempt > ATTEMPT_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, lastAttempt: now, lockedUntil: 0 });
  } else {
    entry.count++;
    entry.lastAttempt = now;
  }
}

function clearLoginAttempts(key: string) {
  loginAttempts.delete(key);
}

// --------------------------------------------------------------------------
// Generic rate limiter - reusable across integration / billing endpoints.
// Buckets are isolated per name so verify abuse doesn't lock save abuse.
// --------------------------------------------------------------------------

interface RateBucketEntry { count: number; firstAttempt: number; lastAttempt: number; lockedUntil: number; }
const rateBuckets = new Map<string, Map<string, RateBucketEntry>>();

interface RateLimiterOpts {
  bucket: string;
  maxAttempts: number;
  windowMs: number;
  lockoutMs: number;
  /** Custom key extractor - default `${userId}:${activeMitraId}:${ip}` */
  keyOf?: (req: Request) => string;
}

function createRateLimiter(opts: RateLimiterOpts) {
  if (!rateBuckets.has(opts.bucket)) rateBuckets.set(opts.bucket, new Map());
  const bucket = rateBuckets.get(opts.bucket)!;

  return function rateLimiterMiddleware(req: Request, res: Response, next: () => void) {
    const key = opts.keyOf
      ? opts.keyOf(req)
      : `${req.authUser?.id ?? "anon"}:${req.authUser?.activeMitraId ?? "-"}:${getClientIp(req)}`;
    const now = Date.now();
    const entry = bucket.get(key);
    if (entry) {
      if (entry.lockedUntil > now) {
        const retryAfterSec = Math.ceil((entry.lockedUntil - now) / 1000);
        res.setHeader("Retry-After", String(retryAfterSec));
        return res.status(429).json({
          success: false,
          error: `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(retryAfterSec / 60)} menit.`,
          retryAfterSec,
          bucket: opts.bucket,
        });
      }
      if (now - entry.firstAttempt > opts.windowMs) {
        // Window expired - reset
        bucket.delete(key);
      }
    }
    next();
  };
}

function recordRateAttempt(bucket: string, key: string, opts: { maxAttempts: number; windowMs: number; lockoutMs: number }) {
  const b = rateBuckets.get(bucket);
  if (!b) return;
  const now = Date.now();
  const entry = b.get(key);
  if (!entry || now - entry.firstAttempt > opts.windowMs) {
    b.set(key, { count: 1, firstAttempt: now, lastAttempt: now, lockedUntil: 0 });
    return;
  }
  entry.count++;
  entry.lastAttempt = now;
  if (entry.count >= opts.maxAttempts) {
    entry.lockedUntil = now + opts.lockoutMs;
  }
}

function clearRateAttempts(bucket: string, key: string) {
  rateBuckets.get(bucket)?.delete(key);
}

function rateLimitKey(req: Request): string {
  return `${req.authUser?.id ?? "anon"}:${req.authUser?.activeMitraId ?? "-"}:${getClientIp(req)}`;
}

// Pre-configured limiters
const VERIFY_RESELLER_LIMIT = { bucket: "verify-reseller", maxAttempts: 5,  windowMs: 5 * 60_000,  lockoutMs: 15 * 60_000 };
const BILLING_SYNC_LIMIT    = { bucket: "billing-sync",    maxAttempts: 10, windowMs: 5 * 60_000,  lockoutMs: 5  * 60_000 };
const INTEGRATIONS_LIMIT    = { bucket: "integrations",    maxAttempts: 30, windowMs: 5 * 60_000,  lockoutMs: 5  * 60_000 };
const MANUAL_SYNC_COOLDOWN_MS = 10 * 60_000; // 1 manual sync per mitra per 10 minutes

const verifyResellerLimiter = createRateLimiter(VERIFY_RESELLER_LIMIT);
const billingSyncLimiter    = createRateLimiter(BILLING_SYNC_LIMIT);
const integrationsLimiter   = createRateLimiter(INTEGRATIONS_LIMIT);

// ==================== PASSWORD VALIDATION ====================

function validatePassword(password: string): string | null {
  if (password.length < 8) return "Password minimal 8 karakter";
  if (!/[A-Z]/.test(password)) return "Password harus mengandung huruf besar";
  if (!/[a-z]/.test(password)) return "Password harus mengandung huruf kecil";
  if (!/[0-9]/.test(password)) return "Password harus mengandung angka";
  return null;
}

// Legacy SHA-256 check for migration - will auto-upgrade to bcrypt on login
function isLegacyHash(hash: string): boolean {
  return /^[a-f0-9]{64}$/.test(hash) && !hash.startsWith("$2");
}

async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (isLegacyHash(hash)) {
    // Legacy SHA-256 check
    return createHash("sha256").update(plain).digest("hex") === hash;
  }
  return bcrypt.compare(plain, hash);
}

async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

function generateSecureToken(): string {
  return randomBytes(48).toString("hex");
}

// ==================== AUTH ====================

router.post("/api/auth/login", async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return sendError(res, "Username dan password wajib diisi");

    const ip = getClientIp(req);
    const rateLimitKey = `${ip}:${username}`;

    // Rate limit check
    const rl = checkRateLimit(rateLimitKey);
    if (!rl.allowed) {
      await logAudit(req, "LOGIN_BLOCKED", "auth", undefined, username, { ip, reason: "rate_limit", retryAfterSec: rl.retryAfterSec });
      return sendError(res, `Terlalu banyak percobaan login. Coba lagi dalam ${rl.retryAfterSec} detik`, 429);
    }

    const user = await storage.getUserByUsername(username);
    if (!user || !(await verifyPassword(password, user.password)) || !user.isActive) {
      recordFailedLogin(rateLimitKey);
      // Log failed attempt
      await storage.createAuditLog({
        userId: user?.id ?? null,
        username: username,
        userName: user?.name ?? username,
        action: "LOGIN_FAILED",
        entityType: "auth",
        entityId: null,
        entityName: username,
        details: JSON.stringify({ ip, reason: !user ? "user_not_found" : !user.isActive ? "account_inactive" : "wrong_password" }),
        createdAt: new Date().toISOString(),
      });
      return sendError(res, "Username atau password salah", 401);
    }

    // Auto-upgrade legacy SHA-256 hash to bcrypt
    if (isLegacyHash(user.password)) {
      const bcryptHash = await hashPassword(password);
      await storage.updateUser(user.id, { password: bcryptHash });
    }

    clearLoginAttempts(rateLimitKey);

    const token = generateSecureToken();
    await storage.updateUserToken(user.id, token);
    await storage.updateUserLastLogin(user.id);

    // Phase B: ensure user has mitra membership (backfill safeguard for users created pre-migration)
    let mitraMemberships = await storage.getUserMitras(user.id);
    if (mitraMemberships.length === 0) {
      await storage.addUserToMitra(user.id, 1, true);
      mitraMemberships = await storage.getUserMitras(user.id);
    }
    let activeMitraId = Number((user as any).activeMitraId ?? 1);
    if (!mitraMemberships.some(m => m.id === activeMitraId)) {
      activeMitraId = mitraMemberships[0]?.id ?? 1;
      await storage.setActiveMitra(user.id, activeMitraId);
    }
    const activeMitra = mitraMemberships.find(m => m.id === activeMitraId) ?? mitraMemberships[0];

    // Resolve per-mitra permissions. isSystemAdmin is true only for System-Admin role at mitra=1.
    const { eff, isSystemAdmin } = await computeAuthFlags(user.id, activeMitraId);
    const legacyPerms = Object.keys(eff.perms).filter(k => eff.perms[k] === "read" || eff.perms[k] === "write");

    req.authUser = {
      id: user.id, username: user.username, name: user.name,
      role: user.role ?? "operator",
      roleId: (user as any).roleId ?? null,
      effectiveRoleId: eff.roleId,
      roleName: eff.roleName,
      isSystemAdmin,
      canSeeAllData: eff.canSeeAllData,
      permLevels: eff.perms,
      permissions: legacyPerms,
      activeMitraId,
    };
    await logAudit(req, "LOGIN", "auth", user.id, user.username, { ip });
    // Cookie untuk <img> tag (Authorization header tidak terkirim oleh browser pada <img src>).
    // Token sama dengan localStorage `ftth_user.token` - di-validate via requirePhotoAuth.
    const isProd = (process.env.NODE_ENV ?? "").toLowerCase() === "production";
    res.cookie("ftth_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: isProd,
      path: "/",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 hari
    });
    const { password: _, token: __, ...safeUser } = user;
    sendSuccess(res, {
      user: {
        ...safeUser,
        token,
        permLevels: eff.perms,
        roleName: eff.roleName,
        isSystemAdmin,
        canSeeAllData: eff.canSeeAllData,
        activeMitraId,
        activeMitra: activeMitra ?? null,
        mitraMemberships,
      }
    });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/auth/logout", async (req: Request, res: Response) => {
  try {
    if (req.authUser) {
      await storage.updateUserToken(req.authUser.id, null);
      await logAudit(req, "LOGOUT", "auth", req.authUser.id, req.authUser.username);
    }
    res.clearCookie("ftth_session", { path: "/" });
    sendSuccess(res, { message: "Logout berhasil" });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/auth/me", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const full = await storage.getUser(req.authUser.id);
    if (!full) return sendError(res, "User tidak ditemukan", 404);
    const { password: _p, token: _t, ...safe } = full;
    // Phase B: include mitra memberships + active mitra
    const mitraMemberships = await storage.getUserMitras(req.authUser.id);
    const activeMitra = mitraMemberships.find(m => m.id === req.authUser!.activeMitraId) ?? mitraMemberships[0] ?? null;
    // Resolve per-mitra permissions. isSystemAdmin is true only for System-Admin role at mitra=1.
    const { eff, isSystemAdmin } = await computeAuthFlags(req.authUser.id, req.authUser.activeMitraId);
    sendSuccess(res, {
      ...safe,
      permLevels: eff.perms,
      roleName: eff.roleName,
      isSystemAdmin,
      canSeeAllData: eff.canSeeAllData,
      activeMitraId: req.authUser.activeMitraId,
      activeMitra,
      mitraMemberships,
    });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// Phase B: tenant switcher - change user's active mitra
router.post("/api/auth/switch-tenant", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const { mitraId } = req.body ?? {};
    const targetId = Number(mitraId);
    if (!Number.isFinite(targetId) || targetId < 1) {
      return sendError(res, "mitraId tidak valid", 400);
    }
    const newActive = await storage.setActiveMitra(req.authUser.id, targetId);
    if (!newActive) {
      return sendError(res, "Anda bukan member mitra ini atau mitra non-aktif", 403);
    }
    await logAudit(req, "TENANT_SWITCH", "auth", targetId, newActive.slug ?? undefined, {
      from: req.authUser.activeMitraId,
      to: targetId,
    });
    // Update in-flight context for this response (next request will reload via authMiddleware)
    req.authUser.activeMitraId = targetId;
    sendSuccess(res, { activeMitra: newActive, activeMitraId: targetId });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// Phase B: list mitras user belongs to (for switcher dropdown)
router.get("/api/auth/mitras", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const memberships = await storage.getUserMitras(req.authUser.id);
    sendSuccess(res, { mitras: memberships, activeMitraId: req.authUser.activeMitraId });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ==================== PHASE E: MITRA OWNER CRUD ====================
// Owner-only endpoints. Requires `mitra_admin` permission (write level).

function isMitraAdmin(req: Request): boolean {
  return !!req.authUser && (
    req.authUser.isSystemAdmin ||
    req.authUser.role === "admin" ||
    hasWritePermission(req, "mitra_admin")
  );
}

/** JABNET-root = System-Admin role at mitra 1 (cross-tenant owner). Gate for centralized billing config. */
function isJabnetRoot(req: Request): boolean {
  return !!req.authUser?.isSystemAdmin;
}

/** GET /api/mitras - list all mitras (owner cross-tenant view) */
router.get("/api/mitras", async (req: Request, res: Response) => {
  // System admin only - mitra admin tidak boleh lihat list mitra lain
  if (!req.authUser?.isSystemAdmin) return sendError(res, "Forbidden - system admin only", 403);
  try {
    const includeInactive = String(req.query.includeInactive ?? "false") === "true";
    const list = await storage.listMitras(includeInactive);
    // Enrich each with customer count + user count
    const enriched = await Promise.all(list.map(async (m: any) => {
      let customerCount = 0;
      let userCount = 0;
      try {
        const rows: any = (await (storage as any).pool.execute(
          "SELECT COUNT(*) AS n FROM customers WHERE mitra_id = ?", [m.id]
        ));
        customerCount = Number(rows?.[0]?.[0]?.n ?? 0);
      } catch {}
      try {
        const rows: any = (await (storage as any).pool.execute(
          "SELECT COUNT(*) AS n FROM user_mitras WHERE mitra_id = ?", [m.id]
        ));
        userCount = Number(rows?.[0]?.[0]?.n ?? 0);
      } catch {}
      let features: Record<string, boolean> = {};
      try { features = JSON.parse(m.features ?? "{}"); } catch {}
      return { ...m, features, customerCount, userCount };
    }));
    sendSuccess(res, enriched);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** GET /api/mitras/:id - detail + members list */
router.get("/api/mitras/:id", async (req: Request, res: Response) => {
  if (!isMitraAdmin(req)) return sendError(res, "Forbidden", 403);
  try {
    const id = Number(req.params.id);
    const m = await storage.getMitra(id);
    if (!m) return sendError(res, "Mitra tidak ditemukan", 404);
    let features: Record<string, boolean> = {};
    try { features = JSON.parse((m as any).features ?? "{}"); } catch {}
    // Enrich with member list (user_mitras + users join)
    let members: any[] = [];
    try {
      const pool: any = (storage as any).pool;
      const [rows]: any = await pool.execute(
        `SELECT u.id AS userId, u.username, u.name, u.role, u.role_id AS globalRoleId,
                u.is_active AS isActive, u.last_login AS lastLoginAt,
                um.is_primary AS isPrimary, um.created_at AS joinedAt,
                um.role_id AS memberRoleId,
                r.name AS roleName
           FROM user_mitras um
           INNER JOIN users u ON u.id = um.user_id
           LEFT JOIN roles r ON r.id = um.role_id
          WHERE um.mitra_id = ?
          ORDER BY um.is_primary DESC, u.name ASC`,
        [id]
      );
      members = rows ?? [];
    } catch (e: any) {
      console.warn("[Mitra] members enrich failed:", e?.message);
    }
    sendSuccess(res, { ...m, features, members });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/mitras - create new mitra (owner only) */
router.post("/api/mitras", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!req.authUser.isSystemAdmin) return sendError(res, "Hanya System-Admin yang boleh create mitra", 403);

  const b = req.body ?? {};

  // Validate mitra fields
  if (!b.name || typeof b.name !== "string" || b.name.trim().length < 2) {
    return sendError(res, "Nama mitra wajib diisi");
  }
  const slug = String(b.slug ?? b.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
  if (!slug) return sendError(res, "Slug tidak valid");

  // Validate admin body - wajib, setiap mitra butuh minimal 1 Admin
  const admin = b.admin;
  if (!admin || typeof admin !== "object") {
    return sendError(res, "Field 'admin' wajib di body - setiap mitra butuh minimal 1 Admin", 400);
  }
  const { username, name: adminName, email: adminEmail, phone: adminPhone, password } = admin;
  if (!username || !adminName || !password) {
    return sendError(res, "Admin requires username, name, dan password", 400);
  }
  if (typeof password !== "string" || password.length < 8) {
    return sendError(res, "Password Admin minimal 8 karakter", 400);
  }
  if (typeof username !== "string" || username.length < 3 || username.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(username)) {
    return sendError(res, "Username harus 3-64 karakter (huruf, angka, _, -)", 400);
  }

  // Pre-check slug uniqueness
  const existingSlug = await storage.getMitraBySlug(slug);
  if (existingSlug) return sendError(res, `Slug "${slug}" sudah dipakai mitra lain`, 409);

  // Pre-check username uniqueness
  const existingUser = await storage.getUserByUsername(username);
  if (existingUser) return sendError(res, `Username '${username}' sudah dipakai`, 400);

  // Per-mitra Admin role dibuat di dalam transaksi (lihat step 2b) - isolasi role per mitra.

  // Pre-compute password hash BEFORE acquiring pool connection (~80ms, don't hold conn idle)
  const passwordHash = await hashPassword(password);

  // Build features map - start with all true unless caller provides
  const callerFeatures = typeof b.features === "object" && b.features ? b.features : {};
  const featuresMap: Record<string, boolean> = {};
  for (const f of ALL_FEATURES) {
    featuresMap[f.key] = callerFeatures[f.key] === false ? false : true;
  }
  const now = new Date().toISOString();

  let newMitraId: number;
  let newUserId: number;

  // Transaction - mitra + admin user + user_mitras membership atomically
  const pool: any = (storage as any).pool;
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  try {
    // 1. Insert mitra
    const [mitraResult]: any = await conn.execute(
      `INSERT INTO mitras (slug, display_name, name, phone, email, address, district,
        primary_contact_name, primary_contact_phone, logo_url, features, is_active, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [
        slug,
        b.displayName ?? b.name,
        b.name,
        b.phone ?? b.primaryContactPhone ?? "",
        b.email ?? null,
        b.address ?? null,
        b.district ?? null,
        b.primaryContactName ?? null,
        b.primaryContactPhone ?? b.phone ?? null,
        b.logoUrl ?? null,
        JSON.stringify(featuresMap),
        b.notes ?? null,
        now,
        now,
      ]
    );
    newMitraId = Number(mitraResult.insertId);

    // 2b. Create per-mitra locked "Admin" role (isolasi role per mitra). Full-write, isSystem=1
    //     → tidak bisa diedit/dihapus oleh admin mitra (hanya platform owner). Setiap mitra wajib punya ini.
    const adminPermsObj: Record<string, string> = {};
    for (const k of ALL_PERMISSION_KEYS) adminPermsObj[k] = "write";
    const [roleResult]: any = await conn.execute(
      `INSERT INTO roles (mitra_id, name, description, is_system, can_see_all_data, permissions, created_at, updated_at)
       VALUES (?, 'Admin', ?, 1, 0, ?, ?, ?)`,
      [
        newMitraId,
        "Akses penuh di satu mitra (intra-tenant). Role bawaan terkunci - tidak bisa diedit/dihapus oleh admin mitra.",
        JSON.stringify(adminPermsObj),
        now,
        now,
      ]
    );
    const newAdminRoleId = Number(roleResult.insertId);

    // 2. Insert admin user (role text = "admin" lowercase per legacy convention, active_mitra_id = new mitra)
    // Note: users.role is legacy text column. Lowercase "admin" keeps requireAdmin() legacy guard happy.
    // Effective permissions are resolved via user_mitras.role_id (step 3), not users.role.
    const [userResult]: any = await conn.execute(
      `INSERT INTO users (username, name, password, email, phone, role, role_id, is_active, active_mitra_id, created_at)
       VALUES (?, ?, ?, ?, ?, 'admin', NULL, 1, ?, ?)`,
      [username, adminName, passwordHash, adminEmail ?? null, adminPhone ?? null, newMitraId, now]
    );
    newUserId = Number(userResult.insertId);

    // 3. Insert user_mitras membership as primary Admin (role per-mitra, bukan Admin global)
    await conn.execute(
      `INSERT INTO user_mitras (user_id, mitra_id, is_primary, role_id, created_at)
       VALUES (?, ?, 1, ?, ?)`,
      [newUserId, newMitraId, newAdminRoleId, now]
    );

    await conn.commit();
  } catch (e: any) {
    await conn.rollback();
    console.error("[create-mitra] transaction failed:", e);
    return sendError(res, "Gagal create mitra: " + (e?.message ?? "unknown"), 500);
  } finally {
    conn.release();
  }

  // Post-commit hooks (conn already released - failure here does NOT rollback committed data)
  try {
    const seedResult = await storage.seedMitraIntegrationDefaults(newMitraId!);
    console.log(`[mitras] seeded ${seedResult.inserted} default integrations for new mitra ${newMitraId!} (${slug})`);
  } catch (e: any) {
    console.warn(`[mitras] seed defaults failed for mitra ${newMitraId!}: ${e.message}`);
  }

  try {
    await ensureMitraDirs(slug);
    console.log(`[mitras] upload dirs ensured for ${slug}`);
  } catch (e: any) {
    console.warn(`[mitras] ensureMitraDirs failed for ${slug}: ${e.message}`);
  }

  try {
    const n = await storage.seedCollectionStagesForMitra(newMitraId!);
    if (n > 0) console.log(`[mitras] seeded ${n} collection stages (template JABNET) for mitra ${newMitraId!} (${slug})`);
  } catch (e: any) {
    console.warn(`[mitras] seedCollectionStagesForMitra failed for mitra ${newMitraId!}: ${e.message}`);
  }

  try {
    await storage.createAuditLog({
      userId: req.authUser!.id,
      username: req.authUser!.username,
      userName: req.authUser!.name,
      action: "CREATE_MITRA",
      entityType: "mitra",
      entityId: newMitraId!,
      entityName: b.name,
      details: JSON.stringify({ mitraId: newMitraId!, slug, adminUserId: newUserId!, adminUsername: username }),
      createdAt: now,
    } as any);
  } catch {}

  const created = await storage.getMitra(newMitraId!);
  return sendSuccess(res, { ...created, features: featuresMap, adminUser: { id: newUserId!, username, name: adminName } });
});

/** PUT /api/mitras/:id - update mitra fields + features */
router.put("/api/mitras/:id", async (req: Request, res: Response) => {
  if (!isMitraAdmin(req)) return sendError(res, "Forbidden", 403);
  try {
    const id = Number(req.params.id);
    const existing = await storage.getMitra(id);
    if (!existing) return sendError(res, "Mitra tidak ditemukan", 404);
    const b = req.body ?? {};
    const updates: string[] = [];
    const params: any[] = [];
    const mapField = (key: string, col: string) => {
      if (b[key] !== undefined) { updates.push(`${col} = ?`); params.push(b[key]); }
    };
    mapField("displayName", "display_name");
    mapField("name", "name");
    mapField("phone", "phone");
    mapField("email", "email");
    mapField("address", "address");
    mapField("district", "district");
    mapField("primaryContactName", "primary_contact_name");
    mapField("primaryContactPhone", "primary_contact_phone");
    mapField("logoUrl", "logo_url");
    mapField("notes", "notes");
    if (typeof b.isActive === "number" || typeof b.isActive === "boolean") {
      updates.push("is_active = ?");
      params.push(b.isActive ? 1 : 0);
    }
    // Slug change - validate uniqueness, rename upload dir SEBELUM DB update (best-effort rollback di catch)
    let pendingSlugRename: { from: string; to: string } | null = null;
    if (b.slug !== undefined && b.slug !== existing.slug) {
      const newSlug = String(b.slug).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
      if (!newSlug) return sendError(res, "Slug tidak valid");
      const dup = await storage.getMitraBySlug(newSlug);
      if (dup && dup.id !== id) return sendError(res, `Slug "${newSlug}" sudah dipakai mitra lain`, 409);
      updates.push("slug = ?"); params.push(newSlug);
      pendingSlugRename = { from: existing.slug || `mitra-${id}`, to: newSlug };
    }
    // Features merge - caller can patch partial
    if (b.features && typeof b.features === "object") {
      let current: Record<string, boolean> = {};
      try { current = JSON.parse((existing as any).features ?? "{}"); } catch {}
      const merged = { ...current, ...b.features };
      updates.push("features = ?"); params.push(JSON.stringify(merged));
    }
    if (updates.length === 0) return sendError(res, "Tidak ada field untuk di-update");
    updates.push("updated_at = ?"); params.push(new Date().toISOString());
    params.push(id);
    const pool: any = (storage as any).pool;
    // Rename upload dir dulu (kalau gagal, jangan UPDATE DB - biar tidak drift)
    if (pendingSlugRename) {
      try {
        await renameMitraDir(pendingSlugRename.from, pendingSlugRename.to);
      } catch (e: any) {
        return sendError(res, `Gagal rename direktori upload: ${e.message}`, 500);
      }
    }
    try {
      await pool.execute(`UPDATE mitras SET ${updates.join(", ")} WHERE id = ?`, params);
    } catch (e: any) {
      // Rollback rename kalau DB update gagal
      if (pendingSlugRename) {
        try { await renameMitraDir(pendingSlugRename.to, pendingSlugRename.from); } catch {}
      }
      throw e;
    }
    if (pendingSlugRename) storage.invalidateMitraSlugCache(id);
    if (b.features && typeof b.features === "object") {
      // Feature toggle changes effective permissions for this mitra's users - drop cached perms.
      invalidatePermCacheAtMitra();
    }
    const after = await storage.getMitra(id);
    let features: Record<string, boolean> = {};
    try { features = JSON.parse((after as any).features ?? "{}"); } catch {}
    try {
      await storage.createAuditLog({
        userId: req.authUser!.id,
        username: req.authUser!.username,
        userName: req.authUser!.name,
        action: "UPDATE",
        entityType: "mitra",
        entityId: id,
        entityName: (after as any).name,
        details: JSON.stringify({ fields: updates.length - 1 }),
        createdAt: new Date().toISOString(),
      } as any);
    } catch {}
    sendSuccess(res, { ...after, features });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** DELETE /api/mitras/:id - soft delete (set inactive). Hard delete needs explicit ?hard=true */
router.delete("/api/mitras/:id", async (req: Request, res: Response) => {
  if (!isMitraAdmin(req)) return sendError(res, "Forbidden", 403);
  try {
    const id = Number(req.params.id);
    if (id === 1) return sendError(res, "Mitra default (JABNET) tidak boleh dihapus", 400);
    const existing = await storage.getMitra(id);
    if (!existing) return sendError(res, "Mitra tidak ditemukan", 404);
    const hard = String(req.query.hard ?? "false") === "true";
    const pool: any = (storage as any).pool;
    if (hard) {
      // Safety check - refuse hard delete if mitra has customers
      const [rows]: any = await pool.execute("SELECT COUNT(*) AS n FROM customers WHERE mitra_id = ?", [id]);
      const n = Number(rows?.[0]?.n ?? 0);
      if (n > 0) return sendError(res, `Tidak bisa hard-delete: mitra punya ${n} customer. Soft-delete dulu atau migrasi data.`, 400);
      await pool.execute("DELETE FROM mitras WHERE id = ?", [id]);
      // Move upload dir mitra ke _trash (best-effort, kalau dir tidak ada juga no-op)
      try {
        if (existing.slug) await trashMitraDir(existing.slug);
      } catch (e: any) {
        console.warn(`[mitras] trashMitraDir(${existing.slug}) failed: ${e.message}`);
      }
      storage.invalidateMitraSlugCache(id);
    } else {
      await pool.execute("UPDATE mitras SET is_active = 0, updated_at = ? WHERE id = ?", [new Date().toISOString(), id]);
    }
    try {
      await storage.createAuditLog({
        userId: req.authUser!.id,
        username: req.authUser!.username,
        userName: req.authUser!.name,
        action: hard ? "DELETE" : "DEACTIVATE",
        entityType: "mitra",
        entityId: id,
        entityName: (existing as any).name,
        createdAt: new Date().toISOString(),
      } as any);
    } catch {}
    sendSuccess(res, { ok: true, hard });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/mitras/:id/users - add existing user as member of this mitra */
router.post("/api/mitras/:id/users", async (req: Request, res: Response) => {
  if (!isMitraAdmin(req)) return sendError(res, "Forbidden", 403);
  try {
    const mitraId = Number(req.params.id);
    const { userId, isPrimary, roleId } = req.body ?? {};
    if (!Number.isFinite(Number(userId))) return sendError(res, "userId wajib");
    const m = await storage.getMitra(mitraId);
    if (!m) return sendError(res, "Mitra tidak ditemukan", 404);
    const u = await storage.getUser(Number(userId));
    if (!u) return sendError(res, "User tidak ditemukan", 404);
    // Resolve roleId: use provided, else fall back to this mitra's own "Admin" role
    let finalRoleId: number | null = null;
    if (Number.isFinite(Number(roleId)) && Number(roleId) > 0) {
      finalRoleId = Number(roleId);
    } else {
      const adminRole = await storage.seedAdminRoleForMitra(mitraId);
      finalRoleId = adminRole.id;
    }
    // Tenant isolation + System-Admin guard
    if (finalRoleId) {
      const role = await storage.getRoleById(finalRoleId);
      if (!role) return sendError(res, "Role tidak ditemukan", 404);
      // Role yang di-assign harus milik mitra target (kecuali System-Admin yang memang lintas-tenant di mitra 1)
      if (role.mitraId !== mitraId) {
        return sendError(res, "Role bukan milik mitra ini", 400);
      }
      if (role.name === "System-Admin" && !req.authUser?.isSystemAdmin) {
        return sendError(res, "Hanya System-Admin yang boleh assign role System-Admin", 403);
      }
      if (role.name === "System-Admin" && mitraId !== 1) {
        return sendError(res, "Role System-Admin hanya berlaku di mitra JABNET (mitra=1)", 400);
      }
    }
    await storage.addUserToMitra(Number(userId), mitraId, !!isPrimary, finalRoleId ?? undefined);
    sendSuccess(res, { ok: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** DELETE /api/mitras/:id/users/:userId - remove user membership */
router.delete("/api/mitras/:id/users/:userId", async (req: Request, res: Response) => {
  if (!isMitraAdmin(req)) return sendError(res, "Forbidden", 403);
  try {
    const mitraId = Number(req.params.id);
    const userId = Number(req.params.userId);
    if (mitraId === 1 && userId === req.authUser!.id) {
      return sendError(res, "Tidak boleh hapus membership diri sendiri dari mitra default", 400);
    }
    const ok = await storage.removeUserFromMitra(userId, mitraId);
    sendSuccess(res, { ok });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** PATCH /api/mitras/:mitraId/members/:userId - update per-membership role */
router.patch("/api/mitras/:mitraId/members/:userId", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  const mitraId = Number(req.params.mitraId);
  const userId = Number(req.params.userId);
  const { roleId } = req.body ?? {};
  if (!Number.isFinite(mitraId) || !Number.isFinite(userId) || !Number.isFinite(Number(roleId))) {
    return sendError(res, "Invalid params (mitraId, userId, roleId required)", 400);
  }
  const roleIdNum = Number(roleId);

  // Authz: System-Admin atau Admin di target mitra.
  // Cek role di TARGET mitra (bukan activeMitraId) supaya Admin bisa manage own mitra
  // dari context/browser mitra apapun (activeMitraId != home mitra).
  let canManage = req.authUser.isSystemAdmin;
  if (!canManage) {
    const requesterEff = await storage.getUserEffectivePermissionsAtMitra(req.authUser.id, mitraId);
    canManage = requesterEff.roleName === "Admin" || requesterEff.roleName === "System-Admin";
  }
  if (!canManage) {
    return sendError(res, "Forbidden - only System-Admin or Admin di mitra yang sama bisa change roles", 403);
  }

  try {
    // Lookup target role
    const role = await storage.getRoleById(roleIdNum);
    if (!role) return sendError(res, "Role tidak ditemukan", 404);

    // Tenant isolation: role yang di-assign wajib milik mitra target (cegah assign role mitra lain).
    if (role.mitraId !== mitraId) {
      return sendError(res, "Role bukan milik mitra ini", 400);
    }

    // Only System-Admin can grant System-Admin role
    if (role.name === "System-Admin" && !req.authUser.isSystemAdmin) {
      return sendError(res, "Hanya System-Admin yang boleh grant role System-Admin", 403);
    }
    // System-Admin role hanya valid di mitra=1 (JABNET)
    if (role.name === "System-Admin" && mitraId !== 1) {
      return sendError(res, "Role System-Admin hanya bisa di-assign di mitra JABNET (mitra=1)", 400);
    }

    // Protect minimum 1 System-Admin di mitra=1
    if (mitraId === 1) {
      const currentMembership = await storage.getUserMitraMembership(userId, 1);
      const currentRole = currentMembership?.roleId ? await storage.getRoleById(currentMembership.roleId) : null;
      if (currentRole?.name === "System-Admin" && role.name !== "System-Admin") {
        const count = await storage.countSystemAdminsAtMitra1();
        if (count <= 1) {
          return sendError(res, "Tidak bisa demote - minimal 1 System-Admin di JABNET wajib ada", 400);
        }
      }
    }

    // Verify target user is actually member of this mitra
    const isMember = await storage.isUserMemberOfMitra(userId, mitraId);
    if (!isMember) return sendError(res, "User bukan anggota mitra ini", 404);

    const updated = await storage.updateMitraMemberRole(mitraId, userId, roleIdNum);
    await storage.createAuditLog({
      userId: req.authUser.id,
      username: req.authUser.username,
      userName: req.authUser.name,
      action: "UPDATE_MITRA_MEMBER_ROLE",
      entityType: "user_mitras",
      entityId: userId,
      details: JSON.stringify({ mitraId, targetUserId: userId, newRoleId: roleIdNum, newRoleName: role.name }),
    } as any);
    return res.json({ ok: true, membership: updated });
  } catch (e: any) { return sendError(res, e.message, 500); }
});

// ==================== Phase F: per-mitra integration settings ====================
// Known integration keys (UI hint + secret marker). Anything else also allowed for forward compat.
const INTEGRATION_KEY_SPECS: Array<{ key: string; group: string; label: string; isSecret: boolean }> = [
  { key: "mpwa_enabled",          group: "MPWA",     label: "MPWA Enabled (true/false)",            isSecret: false },
  { key: "mpwa_url",              group: "MPWA",     label: "MPWA Base URL",                        isSecret: false },
  { key: "mpwa_token",            group: "MPWA",     label: "MPWA API Token",                       isSecret: true  },
  { key: "mpwa_sender_number",    group: "MPWA",     label: "MPWA Sender (62xxx)",                  isSecret: false },
  { key: "mpwa_message_template", group: "MPWA",     label: "MPWA OTP Message Template",            isSecret: false },
  { key: "google_maps_api_key",   group: "Maps",     label: "Google Maps API Key",                  isSecret: true  },
  // NOTE: billing_api_url + billing_api_token are SHARED across all mitras (single JABNET billing
  // backend). Set via process.env.BILLING_API_URL & BILLING_API_TOKEN di .env. Tidak per-mitra.
  { key: "billing_reseller_id",   group: "Billing",  label: "Billing Reseller ID (kode_reseller)",  isSecret: false },
  { key: "billing_reseller_nama",   group: "Billing", label: "Reseller Profil - Nama",               isSecret: false },
  { key: "billing_reseller_alamat", group: "Billing", label: "Reseller Profil - Alamat",             isSecret: false },
  { key: "billing_reseller_phone",  group: "Billing", label: "Reseller Profil - Nomor Telepon",      isSecret: false },
  { key: "billing_reseller_email",  group: "Billing", label: "Reseller Profil - Email",              isSecret: false },
  { key: "billing_reseller_password", group: "Billing", label: "Reseller Profil - Password Verifikasi", isSecret: true },
  { key: "company_name",          group: "Branding", label: "Company Display Name",                 isSecret: false },
  { key: "company_wa_cs",         group: "Branding", label: "WhatsApp CS Link",                     isSecret: false },
  { key: "company_wa_finance",    group: "Branding", label: "WhatsApp Finance Link",                isSecret: false },
  { key: "customer_portal_url",   group: "Branding", label: "Customer Portal URL",                  isSecret: false },
  // GenieACS per-mitra (sebelumnya hilang dari specs → save salah masuk app_settings global
  // sedangkan getGenieConfig baca mitra_integrations → mitra non-JABNET throw. Sudah di-seed
  // di seedMitraIntegrationDefaults, jadi tinggal didaftarkan agar save/read/merge konsisten).
  { key: "genieacs_host",         group: "GenieACS", label: "GenieACS NBI Host",                    isSecret: false },
  { key: "genieacs_port",         group: "GenieACS", label: "GenieACS NBI Port (default 7557)",     isSecret: false },
  { key: "genieacs_username",     group: "GenieACS", label: "GenieACS NBI Username",                isSecret: false },
  { key: "genieacs_password",     group: "GenieACS", label: "GenieACS NBI Password",                isSecret: true  },
  { key: "optical_rx_warn",       group: "GenieACS", label: "Optical RX Warning (dBm)",             isSecret: false },
  { key: "optical_rx_crit",       group: "GenieACS", label: "Optical RX Critical (dBm)",            isSecret: false },
];

function isKnownIntegrationKey(key: string): boolean {
  return INTEGRATION_KEY_SPECS.some(s => s.key === key);
}
function isSecretIntegrationKey(key: string): boolean {
  return INTEGRATION_KEY_SPECS.find(s => s.key === key)?.isSecret ?? false;
}

/** GET /api/mitras/:id/integrations - list current overrides for this mitra */
router.get("/api/mitras/:id/integrations", async (req: Request, res: Response) => {
  if (!isMitraAdmin(req)) return sendError(res, "Forbidden", 403);
  try {
    const mitraId = Number(req.params.id);
    const m = await storage.getMitra(mitraId);
    if (!m) return sendError(res, "Mitra tidak ditemukan", 404);
    if (mitraId !== req.authUser!.activeMitraId && !isJabnetRoot(req)) {
      return sendError(res, "Tidak boleh melihat integrasi mitra lain", 403);
    }
    const unmask = String(req.query.unmask ?? "false") === "true";
    // Run inside target mitra context so storage helpers resolve correctly
    const settings = await new Promise<any[]>((resolve, reject) => {
      tenantContext.run({ mitraId, userId: req.authUser!.id, isSuperAdmin: true }, async () => {
        try { resolve(await storage.listMitraSettings({ unmask })); } catch (e) { reject(e); }
      });
    });
    sendSuccess(res, { keys: INTEGRATION_KEY_SPECS, settings });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** PUT /api/mitras/:id/integrations - upsert one or many key/value pairs.
 *  Body: { settings: [{ key, value }, ...] }  - null value deletes the override (revert to global fallback). */
router.put("/api/mitras/:id/integrations", integrationsLimiter, async (req: Request, res: Response) => {
  if (!isMitraAdmin(req)) return sendError(res, "Forbidden", 403);
  recordRateAttempt(INTEGRATIONS_LIMIT.bucket, rateLimitKey(req), INTEGRATIONS_LIMIT);
  try {
    const mitraId = Number(req.params.id);
    const m = await storage.getMitra(mitraId);
    if (!m) return sendError(res, "Mitra tidak ditemukan", 404);
    const items = Array.isArray(req.body?.settings) ? req.body.settings : [];
    if (items.length === 0) return sendError(res, "Body kosong - kirim settings: [{key,value}]");
    const applied: string[] = [];
    const skipped: string[] = [];
    await new Promise<void>((resolve, reject) => {
      tenantContext.run({ mitraId, userId: req.authUser!.id, isSuperAdmin: true }, async () => {
        try {
          for (const it of items) {
            if (!it?.key || typeof it.key !== "string") { skipped.push("(missing key)"); continue; }
            if (it.key.length > 100 || /[^a-z0-9_]/i.test(it.key)) { skipped.push(it.key); continue; }
            const authz = canWriteMitraIntegration({
              isJabnetRoot: isJabnetRoot(req),
              activeMitraId: req.authUser!.activeMitraId,
              targetMitraId: mitraId,
              key: it.key,
            });
            if (!authz.allowed) { skipped.push(it.key); continue; }
            if (it.value === null || it.value === undefined || it.value === "") {
              await storage.deleteMitraSetting(it.key);
            } else {
              await storage.setMitraSetting(it.key, String(it.value), { isSecret: isSecretIntegrationKey(it.key) });
            }
            applied.push(it.key);
            if (it.key === "google_maps_api_key") publicConfigCache.clear();
          }
          resolve();
        } catch (e) { reject(e); }
      });
    });
    try {
      await storage.createAuditLog({
        userId: req.authUser!.id,
        username: req.authUser!.username,
        userName: req.authUser!.name,
        action: "UPDATE",
        entityType: "mitra_integrations",
        entityId: mitraId,
        entityName: (m as any).name,
        details: JSON.stringify({ applied, skipped }),
        createdAt: new Date().toISOString(),
      } as any);
    } catch {}
    sendSuccess(res, { applied, skipped });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// Allowed fields user dapat edit sendiri (bukan role/isActive/notes yang admin-only)
const SELF_EDITABLE_FIELDS = [
  "name", "email", "phone", "address",
  "birthDate", "emergencyContact",
] as const;

function validateEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
function validatePhone(s: string): boolean {
  // Indonesian phone: 8-15 digits, optional leading + or 0
  return /^[+0][0-9]{7,14}$/.test(s.replace(/\s|-/g, ""));
}

// -- Self-service: update own profile (name, email, phone, address, birthDate, emergencyContact) --
router.patch("/api/auth/me", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const body = req.body ?? {};
    const updateData: Record<string, any> = {};
    const changedFields: string[] = [];

    for (const field of SELF_EDITABLE_FIELDS) {
      if (!(field in body)) continue;
      const val = body[field];
      if (val === null || val === "") {
        // Allow clearing optional fields
        if (field === "name") {
          return sendError(res, "Nama wajib diisi");
        }
        updateData[field] = null;
        changedFields.push(field);
        continue;
      }
      if (typeof val !== "string") {
        return sendError(res, `Field ${field} harus berupa teks`);
      }
      const trimmed = val.trim();
      if (field === "name") {
        if (trimmed.length < 2 || trimmed.length > 60) {
          return sendError(res, "Nama harus 2-60 karakter");
        }
      } else if (field === "email") {
        if (!validateEmail(trimmed)) {
          return sendError(res, "Format email tidak valid");
        }
      } else if (field === "phone") {
        if (!validatePhone(trimmed)) {
          return sendError(res, "Format nomor HP tidak valid (contoh: 08123456789)");
        }
      } else if (field === "birthDate") {
        // YYYY-MM-DD
        if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
          return sendError(res, "Format tanggal lahir harus YYYY-MM-DD");
        }
      }
      updateData[field] = trimmed;
      changedFields.push(field);
    }

    if (changedFields.length === 0) {
      return sendError(res, "Tidak ada perubahan data");
    }

    const updated = await storage.updateUser(req.authUser.id, updateData);
    if (!updated) return sendError(res, "User tidak ditemukan", 404);
    await logAudit(req, "UPDATE", "profile", updated.id, updated.username, { fields: changedFields });
    const { password: _p, token: _t, ...safe } = updated;
    sendSuccess(res, safe);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- Self-service: upload/remove own photo profile --
// Accept data URL (base64) max ~500KB (after base64 encoding = ~380KB raw).
// Frontend wajib sudah resize ke <=256x256 square + JPEG quality ~0.85.
router.put("/api/auth/me/photo", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const { photoUrl } = req.body ?? {};
    if (photoUrl === null || photoUrl === "") {
      await storage.updateUser(req.authUser.id, { photoUrl: null });
      await logAudit(req, "UPDATE", "profile", req.authUser.id, req.authUser.username, { field: "photoUrl", cleared: true });
      return sendSuccess(res, { photoUrl: null });
    }
    if (typeof photoUrl !== "string") return sendError(res, "photoUrl harus string");
    const m = photoUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return sendError(res, "Format foto harus data:image/(png|jpeg|webp);base64,...");
    // Estimasi size: base64 encoded ~ 4/3 raw. Max data URL 500KB → raw ~375KB.
    if (photoUrl.length > 500_000) return sendError(res, "Foto terlalu besar (max ~500KB setelah resize di client)");
    await storage.updateUser(req.authUser.id, { photoUrl });
    await logAudit(req, "UPDATE", "profile", req.authUser.id, req.authUser.username, { field: "photoUrl", sizeBytes: photoUrl.length });
    sendSuccess(res, { photoUrl });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/**
 * Sync plain-text password ke `billing_reseller_password` di mitra_integrations untuk
 * semua mitra di mana user ini adalah primary admin (is_primary=1).
 * Mitra JABNET (id=1) di-skip - JABNET adalah owner billing, tidak butuh shared secret.
 * Dipanggil dari endpoint perubahan password (self change-password, admin reset, create user).
 */
async function syncBillingResellerPasswordForUser(userId: number, plainPassword: string, byUserId: number) {
  try {
    const mitras = await storage.getUserMitras(userId);
    for (const m of mitras) {
      if (!m.isPrimary) continue;
      if (m.id === 1) continue; // JABNET - skip
      await new Promise<void>((resolve, reject) => {
        tenantContext.run({ mitraId: m.id, userId: byUserId, isSuperAdmin: true }, async () => {
          try {
            await storage.setMitraSetting("billing_reseller_password", plainPassword, { isSecret: true });
            console.log(`[password-sync] mitra ${m.id} (${m.slug}) billing_reseller_password updated`);
            resolve();
          } catch (e) { reject(e); }
        });
      });
    }
  } catch (e: any) {
    console.warn(`[password-sync] failed for user ${userId}: ${e.message}`);
  }
}

// -- Self-service: change own password --
router.post("/api/auth/change-password", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const { currentPassword, newPassword } = req.body ?? {};
    if (!currentPassword || !newPassword) {
      return sendError(res, "Password lama dan baru wajib diisi");
    }
    const pwError = validatePassword(newPassword);
    if (pwError) return sendError(res, pwError);
    if (currentPassword === newPassword) {
      return sendError(res, "Password baru harus berbeda dari password lama");
    }
    const fullUser = await storage.getUser(req.authUser.id);
    if (!fullUser) return sendError(res, "User tidak ditemukan", 404);
    const valid = await verifyPassword(currentPassword, fullUser.password);
    if (!valid) return sendError(res, "Password lama salah", 401);
    const hashed = await hashPassword(newPassword);
    await storage.updateUser(req.authUser.id, { password: hashed });
    // Sync plain-text password ke billing_reseller_password untuk mitras di mana user adalah primary admin
    await syncBillingResellerPasswordForUser(req.authUser.id, newPassword, req.authUser.id);
    await logAudit(req, "UPDATE", "profile", req.authUser.id, req.authUser.username, { field: "password" });
    sendSuccess(res, { message: "Password berhasil diubah" });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/audit-logs", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 200;
    const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
    const action = req.query.action ? String(req.query.action) : undefined;
    const entityType = req.query.entityType ? String(req.query.entityType) : undefined;
    const sinceDays = req.query.sinceDays ? parseInt(req.query.sinceDays as string) : undefined;
    const since = sinceDays ? new Date(Date.now() - sinceDays * 86400_000).toISOString() : undefined;
    const includeSync = req.query.includeSync === "true";
    const logs = await storage.getAuditLogs({
      limit, userId, action, entityType, since,
      excludeAutoSync: !includeSync,
    });
    sendSuccess(res, logs);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** GET /api/activity/stats - productivity dashboard data */
router.get("/api/activity/stats", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const sinceDays = req.query.sinceDays ? parseInt(req.query.sinceDays as string) : 7;
    const stats = await storage.getActivityStats(sinceDays);
    sendSuccess(res, stats);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/activity/cleanup-sync-logs - admin one-shot cleanup */
router.post("/api/activity/cleanup-sync-logs", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const deleted = await storage.cleanupBillingSyncAuditLogs();
    await logAudit(req, "CLEANUP", "audit_logs", undefined, "billing_sync_worker_rows", { deleted });
    sendSuccess(res, { deleted });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ==================== USER MANAGEMENT (admin only) ====================

function requireAdmin(req: Request, res: Response): boolean {
  if (!req.authUser) { sendError(res, "Unauthorized", 401); return false; }
  // Accept: isSystemAdmin flag, per-mitra roleName (new schema: "Admin"/"System-Admin"),
  // or legacy users.role text ("admin"/"Administrator").
  const isAdmin = req.authUser.isSystemAdmin
               || req.authUser.roleName === "Admin"
               || req.authUser.roleName === "System-Admin"
               || req.authUser.role === "admin"
               || req.authUser.role === "Administrator";
  if (!isAdmin) { sendError(res, "Forbidden: Admin only", 403); return false; }
  return true;
}

/** Tenant isolation untuk endpoint user-by-id: non-sysadmin hanya boleh menyentuh user
 *  yang member mitra aktifnya. 404 (bukan 403) supaya keberadaan user mitra lain tidak bocor. */
async function requireUserInScope(req: Request, res: Response, targetUserId: number): Promise<boolean> {
  if (req.authUser!.isSystemAdmin) return true;
  const memberIds = await storage.getUserIdsInMitra(req.authUser!.activeMitraId ?? 1);
  if (!memberIds.has(targetUserId)) { sendError(res, "User tidak ditemukan", 404); return false; }
  return true;
}

/** Authorize a preset mutation. Returns null if allowed, else an Indonesian error string.
 *  - global preset (or any is_system): only System-Admin JABNET (isSystemAdmin).
 *  - tenant preset: only an admin of that SAME mitra.
 *  - is_system: never delete. */
function authorizePresetMutation(
  req: Request,
  preset: { scope: string; mitraId: number; isSystem: number },
  action: "update" | "delete",
): string | null {
  if (action === "delete" && preset.isSystem === 1) return "Preset bawaan tidak bisa dihapus";
  if (preset.scope === "global" || preset.isSystem === 1) {
    return isSystemAdmin(req) ? null : "Hanya System-Admin JABNET yang boleh mengubah preset global";
  }
  if (preset.mitraId !== (req.authUser!.activeMitraId ?? 1)) return "Preset milik mitra lain";
  return null;
}

router.get("/api/users", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    let allUsers = await storage.getAllUsers();
    // Tenant isolation: DEFAULT semua admin (termasuk JABNET System-Admin) hanya lihat
    // user member mitra aktif. JABNET System-Admin boleh opt-in lintas mitra via
    // ?scope=cross - di-honor server-side hanya untuk isSystemAdmin (mirror assignable-users).
    const wantCross = req.query.scope === "cross" && isSystemAdmin(req);
    if (!wantCross && req.authUser!.activeMitraId) {
      const memberIds = await storage.getUserIdsInMitra(req.authUser!.activeMitraId);
      allUsers = allUsers.filter(u => memberIds.has(u.id));
    }
    // Enrich: nama mitra yang bisa diakses tiap user (batched, anti-N+1)
    const mitraNames = await storage.getMitraNamesByUserIds(allUsers.map(u => u.id));
    // Strip passwords and tokens from response
    const safe = allUsers.map(({ password, token, ...u }) => ({
      ...u,
      mitraNames: mitraNames.get(u.id) ?? [],
    }));
    sendSuccess(res, safe);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// Fields admin bisa set saat create/edit user (selain kredensial)
const ADMIN_EDITABLE_FIELDS = [
  "name", "username", "email", "phone", "address",
  "employeeId", "position", "department", "branch",
  "joinDate", "birthDate", "emergencyContact", "notes",
] as const;

router.post("/api/users", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { username, password, name, role, roleId, permissions } = req.body;
    if (!username || !password || !name) return sendError(res, "Username, password, dan nama wajib diisi");
    if (username.length < 3 || username.length > 30) return sendError(res, "Username harus 3-30 karakter");
    if (!/^[a-zA-Z0-9._-]+$/.test(username)) return sendError(res, "Username hanya boleh huruf, angka, titik, underscore, dash");
    const pwError = validatePassword(password);
    if (pwError) return sendError(res, pwError);
    const existing = await storage.getUserByUsername(username);
    if (existing) return sendError(res, "Username sudah digunakan");
    const hashed = await hashPassword(password);

    const extra: Record<string, any> = {};
    for (const f of ADMIN_EDITABLE_FIELDS) {
      if (f === "name") continue;
      if (req.body[f] !== undefined && req.body[f] !== "") {
        extra[f] = String(req.body[f]).trim();
      }
    }
    if (extra.email && !validateEmail(extra.email)) return sendError(res, "Format email tidak valid");
    if (extra.phone && !validatePhone(extra.phone)) return sendError(res, "Format nomor HP tidak valid");

    // Resolve roleId - tenant-scoped ke mitra aktif pembuat user
    const creatorMitraId = req.authUser!.activeMitraId ?? 1;
    // Tenant isolation (pre-insert, before any user row is created): a non-sysadmin may only
    // create users in their OWN mitra. The form never sends mitraId; a foreign one = tampering.
    const reqMitra = Number(req.body?.mitraId);
    if (Number.isFinite(reqMitra) && reqMitra > 0 && reqMitra !== creatorMitraId && !req.authUser!.isSystemAdmin) {
      return sendError(res, "Tidak boleh membuat user untuk mitra lain", 403);
    }
    let resolvedRoleId: number | null = null;
    if (roleId !== undefined && roleId !== null && roleId !== "") {
      const r = await storage.getRoleById(Number(roleId));
      if (!r) return sendError(res, "Role tidak ditemukan");
      // Tenant isolation: hanya boleh assign role milik mitra sendiri (System-Admin boleh lintas)
      if (r.mitraId !== creatorMitraId && !req.authUser!.isSystemAdmin) {
        return sendError(res, "Role bukan milik mitra Anda", 403);
      }
      resolvedRoleId = r.id;
    } else if (role === "admin") {
      // Admin user: platform owner di mitra 1 → System-Admin; selain itu Admin per-mitra terkunci.
      if (req.authUser!.isSystemAdmin && creatorMitraId === 1) {
        const r = await storage.getRoleByName("System-Admin", 1);
        resolvedRoleId = r?.id ?? null;
      } else {
        const r = await storage.seedAdminRoleForMitra(creatorMitraId);
        resolvedRoleId = r.id;
      }
    } else {
      // Default: Read Only milik mitra aktif (kalau ada; mitra non-JABNET mungkin belum punya → null)
      const r = await storage.getRoleByName("Read Only", creatorMitraId);
      resolvedRoleId = r?.id ?? null;
    }

    // FIX BUG 1: handle legacy `permissions` array (backward compat) - simpan sebagai JSON
    let legacyPermissions: string | undefined = undefined;
    if (permissions !== undefined) {
      if (Array.isArray(permissions)) {
        const filtered = permissions.filter((p: any) => typeof p === "string" && ALL_PERMISSION_KEYS.includes(p as any));
        legacyPermissions = JSON.stringify(filtered);
      } else if (typeof permissions === "string") {
        legacyPermissions = permissions;
      }
    }

    const user = await storage.createUser({
      username, password: hashed, name,
      role: role || "operator",
      roleId: resolvedRoleId,
      isActive: 1,
      createdAt: new Date().toISOString(),
      ...(legacyPermissions !== undefined ? { permissions: legacyPermissions } : {}),
      ...extra,
    });
    // Link the new user to a tenant. Default = creator's active mitra, so a tenant admin's
    // new users are scoped + visible (without this the user is created but never linked in
    // user_mitras → GET /api/users filters it out for non-sysadmins → "user tidak terbentuk").
    // An explicit body.mitraId is the "buat admin baru mitra X" flow (drives password sync);
    // a non-sysadmin may NOT target another mitra (tenant isolation).
    const bodyMitra = Number(req.body?.mitraId);
    const hasExplicitMitra = Number.isFinite(bodyMitra) && bodyMitra > 0;
    const assignMitraId = hasExplicitMitra ? bodyMitra : creatorMitraId;
    const isPrimary = req.body?.isPrimary !== undefined ? !!req.body.isPrimary : true;
    if (assignMitraId > 0) {
      try {
        const mitraExists = await storage.getMitra(assignMitraId);
        if (mitraExists) {
          // Attach the resolved role to the membership only when it belongs to the target mitra
          // (auto-link / same-tenant case - resolvedRoleId was validated against creatorMitraId).
          // For cross-mitra explicit creation, leave membership role unset (preserve prior behavior).
          const membershipRoleId = assignMitraId === creatorMitraId ? resolvedRoleId : undefined;
          await storage.addUserToMitra(user.id, assignMitraId, isPrimary, membershipRoleId);
          if (hasExplicitMitra && isPrimary && assignMitraId !== 1) {
            // Sync plain-text password ke mitra ini sebagai billing_reseller_password
            await new Promise<void>((resolve, reject) => {
              tenantContext.run({ mitraId: assignMitraId, userId: req.authUser!.id, isSuperAdmin: true }, async () => {
                try {
                  await storage.setMitraSetting("billing_reseller_password", password, { isSecret: true });
                  console.log(`[password-sync] mitra ${assignMitraId} billing_reseller_password seeded for new admin user ${user.id}`);
                  resolve();
                } catch (e) { reject(e); }
              });
            });
          }
        }
      } catch (e: any) {
        console.warn(`[POST /api/users] mitra assignment failed: ${e.message}`);
      }
    }
    await logAudit(req, "CREATE", "user", user.id, user.username);
    const { password: _, token: __, ...safeUser } = user;
    sendSuccess(res, safeUser, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.put("/api/users/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id as string);
    if (!(await requireUserInScope(req, res, id))) return;
    const { role, roleId, permissions, isActive, password } = req.body;
    const updateData: any = {};
    const changes: string[] = [];

    // Team/HR fields
    for (const f of ADMIN_EDITABLE_FIELDS) {
      if (req.body[f] === undefined) continue;
      const v = req.body[f];
      if (v === null || v === "") {
        if (f === "name") return sendError(res, "Nama wajib diisi");
        if (f === "username") return sendError(res, "Username wajib diisi");
        updateData[f] = null;
        changes.push(f);
        continue;
      }
      const s = String(v).trim();
      if (f === "email" && !validateEmail(s)) return sendError(res, "Format email tidak valid");
      if (f === "phone" && !validatePhone(s)) return sendError(res, "Format nomor HP tidak valid");
      if (f === "username") {
        if (s.length < 3 || s.length > 30) return sendError(res, "Username harus 3-30 karakter");
        if (!/^[a-zA-Z0-9_.-]+$/.test(s)) return sendError(res, "Username hanya boleh huruf, angka, titik, underscore, atau strip");
        // Uniqueness check - skip if unchanged
        const current = await storage.getUser(id);
        if (current && current.username !== s) {
          const dup = await storage.getUserByUsername(s);
          if (dup && dup.id !== id) return sendError(res, `Username "${s}" sudah dipakai user lain`, 409);
        }
      }
      updateData[f] = s;
      changes.push(f);
    }

    if (role !== undefined) { updateData.role = role; changes.push(`role→${role}`); }

    // Handle roleId - FIX BUG 1 (role_id tersimpan ke DB)
    if (roleId !== undefined) {
      if (roleId === null || roleId === "") {
        updateData.roleId = null;
        changes.push("roleId→null");
      } else {
        const r = await storage.getRoleById(Number(roleId));
        if (!r) return sendError(res, "Role tidak ditemukan");
        // Tenant isolation: hanya role milik mitra aktif (System-Admin boleh lintas) - parity dengan POST create.
        if (r.mitraId !== (req.authUser!.activeMitraId ?? 1) && !req.authUser!.isSystemAdmin) {
          return sendError(res, "Role bukan milik mitra Anda", 403);
        }
        updateData.roleId = r.id;
        changes.push(`roleId→${r.name}`);
      }
    }

    // Handle legacy permissions array - FIX BUG 1 (permissions tersimpan ke DB)
    if (permissions !== undefined) {
      if (Array.isArray(permissions)) {
        const filtered = permissions.filter((p: any) => typeof p === "string" && ALL_PERMISSION_KEYS.includes(p as any));
        updateData.permissions = JSON.stringify(filtered);
        changes.push(`permissions(${filtered.length})`);
      } else if (typeof permissions === "string") {
        updateData.permissions = permissions;
        changes.push("permissions(string)");
      } else if (permissions === null) {
        updateData.permissions = null;
        changes.push("permissions→null");
      }
    }

    if (isActive !== undefined) {
      updateData.isActive = isActive;
      changes.push(isActive ? "activated" : "deactivated");
    }
    let plainPasswordToSync: string | null = null;
    if (password) {
      const pwError = validatePassword(password);
      if (pwError) return sendError(res, pwError);
      updateData.password = await hashPassword(password);
      plainPasswordToSync = password;
      changes.push("password_reset");
    }

    const updated = await storage.updateUser(id, updateData);
    if (!updated) return sendError(res, "User tidak ditemukan", 404);
    // If deactivated, invalidate token
    if (isActive === 0 || isActive === false) {
      await storage.updateUserToken(id, null);
    }
    // Sync plain-text password ke billing_reseller_password (mitras primary admin)
    if (plainPasswordToSync) {
      await syncBillingResellerPasswordForUser(id, plainPasswordToSync, req.authUser!.id);
    }
    await logAudit(req, "UPDATE", "user", id, updated.username, { changes, ip: getClientIp(req) });
    const { password: _, token: __, ...safeUser } = updated;
    sendSuccess(res, safeUser);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.delete("/api/users/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id as string);
    if (!(await requireUserInScope(req, res, id))) return;
    if (req.authUser!.id === id) return sendError(res, "Tidak bisa menghapus akun sendiri");
    const user = await storage.getUser(id);
    if (!user) return sendError(res, "User tidak ditemukan", 404);
    await storage.deleteUser(id);
    await logAudit(req, "DELETE", "user", id, user.username, { ip: getClientIp(req) });
    sendSuccess(res, { deleted: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** GET /api/users/:id/activity - timeline aktivitas user dari audit_logs (untuk user detail drawer) */
router.get("/api/users/:id/activity", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const userId = parseInt(req.params.id as string);
    if (!(await requireUserInScope(req, res, userId))) return;
    const limit = Math.min(200, Number(req.query.limit) || 50);
    const sinceDays = Number(req.query.sinceDays) || 30;
    const since = new Date(Date.now() - sinceDays * 86400_000).toISOString();
    const logs = await storage.getAuditLogs({
      limit, userId, since, excludeAutoSync: true,
    });
    sendSuccess(res, logs);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** GET /api/users/:id/stats - quick stats untuk user profile (productivity counters) */
router.get("/api/users/:id/stats", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const userId = parseInt(req.params.id as string);
    if (!(await requireUserInScope(req, res, userId))) return;
    const stats = await storage.getUserProductivityStats(userId);
    sendSuccess(res, stats);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/users/bulk-action - bulk activate/deactivate/role-change/delete */
router.post("/api/users/bulk-action", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { action, userIds, payload } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) return sendError(res, "userIds wajib (array, min 1)");
    if (!["activate", "deactivate", "set_role", "delete"].includes(action)) {
      return sendError(res, "action tidak valid (activate | deactivate | set_role | delete)");
    }
    // Guard: jangan modify diri sendiri
    const filteredIds = userIds.filter((id: number) => id !== req.authUser!.id);
    if (filteredIds.length === 0) return sendError(res, "Tidak bisa apply action ke akun sendiri");

    // Tenant isolation: non-sysadmin hanya boleh bulk-action ke user mitra aktifnya.
    let scopedIds = filteredIds;
    if (!req.authUser!.isSystemAdmin) {
      const memberIds = await storage.getUserIdsInMitra(req.authUser!.activeMitraId ?? 1);
      scopedIds = filteredIds.filter((id: number) => memberIds.has(id));
      if (scopedIds.length === 0) return sendError(res, "Tidak ada user yang valid di mitra Anda", 404);
    }
    // set_role: role target wajib milik mitra aktif (System-Admin boleh lintas)
    if (action === "set_role") {
      const r = await storage.getRoleById(Number(payload?.roleId));
      if (!r) return sendError(res, "Role tidak ditemukan");
      if (!req.authUser!.isSystemAdmin && r.mitraId !== (req.authUser!.activeMitraId ?? 1)) {
        return sendError(res, "Role bukan milik mitra Anda", 403);
      }
    }

    let affected = 0;
    const errors: string[] = [];
    for (const id of scopedIds) {
      try {
        if (action === "activate") {
          await storage.updateUser(id, { isActive: 1 } as any);
        } else if (action === "deactivate") {
          await storage.updateUser(id, { isActive: 0 } as any);
        } else if (action === "set_role") {
          if (!payload?.roleId) { errors.push(`#${id}: roleId wajib`); continue; }
          await storage.updateUser(id, { roleId: Number(payload.roleId) } as any);
        } else if (action === "delete") {
          await storage.deleteUser(id);
        }
        affected++;
      } catch (e: any) {
        errors.push(`#${id}: ${e.message}`);
      }
    }
    await logAudit(req, "BULK_" + action.toUpperCase(), "user", undefined, `${affected} users`, { userIds: scopedIds, errors });
    sendSuccess(res, { affected, requested: userIds.length, errors });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ==================== ROLES MANAGEMENT (custom role + read/write permission) ====================

// GET /api/roles - list all roles (semua user login boleh read untuk dropdown)
// Admin dapat tambahan: userCount per role
router.get("/api/roles", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    // Tenant isolation: hanya role milik mitra aktif user (Ygao admin tidak lihat role JABNET).
    const scopeMitraId = req.authUser.activeMitraId ?? 1;
    const rows = await storage.getRoles(scopeMitraId);
    const isAdmin = req.authUser.role === "admin";
    // Bulk get user counts kalau admin (untuk tampilkan "X users" per role di RolesPage).
    // Tenant isolation: non-system-admin hanya hitung user member dari mitra aktif.
    const userCounts: Record<number, number> = {};
    if (isAdmin) {
      let mitraScope: Set<number> | null = null;
      if (!req.authUser.isSystemAdmin && req.authUser.activeMitraId) {
        mitraScope = await storage.getUserIdsInMitra(req.authUser.activeMitraId);
      }
      const allUsers = await storage.getAllUsers();
      for (const u of allUsers) {
        if (mitraScope && !mitraScope.has(u.id)) continue;
        if (u.roleId) userCounts[u.roleId] = (userCounts[u.roleId] ?? 0) + 1;
      }
    }
    const parsed = rows.map((r: any) => {
      let perms: Record<string, PermissionLevel> = {};
      try { perms = JSON.parse(r.permissions); } catch { perms = {}; }
      return {
        id: r.id, name: r.name, description: r.description,
        isSystem: r.isSystem === 1,
        canSeeAllData: r.canSeeAllData === 1,
        permissions: perms,
        userCount: userCounts[r.id] ?? 0,
        createdAt: r.createdAt, updatedAt: r.updatedAt,
      };
    });
    sendSuccess(res, parsed);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** GET /api/roles/:id/users - list users yang assigned ke role ini (admin only) */
router.get("/api/roles/:id/users", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const roleId = parseInt(req.params.id as string);
    const role = await storage.getRoleById(roleId);
    if (!role) return sendError(res, "Role tidak ditemukan", 404);
    if (!req.authUser!.isSystemAdmin && role.mitraId !== (req.authUser!.activeMitraId ?? 1)) {
      return sendError(res, "Role tidak ditemukan", 404); // sembunyikan keberadaan role mitra lain
    }
    const all = await storage.getAllUsers();
    const filtered = all.filter((u: any) => u.roleId === roleId).map((u: any) => ({
      id: u.id, username: u.username, name: u.name,
      role: u.role, roleId: u.roleId, isActive: u.isActive,
      lastLogin: u.lastLogin, createdAt: u.createdAt,
      email: u.email, position: u.position, department: u.department,
    }));
    sendSuccess(res, filtered);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// POST /api/roles - create custom role (admin only)
router.post("/api/roles", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { name, description, canSeeAllData, permissions } = req.body;
    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return sendError(res, "Nama role wajib diisi (min 2 karakter)");
    }
    const trimmed = name.trim();
    // Tenant scope: role baru dibuat di mitra aktif; nama unik per-mitra (bukan global).
    const scopeMitraId = req.authUser!.activeMitraId ?? 1;
    const existing = await storage.getRoleByName(trimmed, scopeMitraId);
    if (existing) return sendError(res, "Nama role sudah digunakan di mitra ini");

    // Validate permissions object: key harus di ALL_PERMISSION_KEYS, value harus "none"|"read"|"write"
    const cleanPerms = cleansePermissionMatrix(permissions);

    const role = await storage.createRole({
      mitraId: scopeMitraId,
      name: trimmed,
      description: (description ?? "").toString().trim() || null,
      isSystem: 0,
      canSeeAllData: canSeeAllData ? 1 : 0,
      permissions: JSON.stringify(cleanPerms),
      createdBy: req.authUser!.id,
    } as any);
    await logAudit(req, "CREATE", "role", role.id, role.name);
    sendSuccess(res, { ...role, permissions: cleanPerms, isSystem: false, canSeeAllData: canSeeAllData === true || canSeeAllData === 1 }, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// PUT /api/roles/:id - update role (admin only; system role hanya boleh ubah description + permissions)
router.put("/api/roles/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id as string);
    const existing = await storage.getRoleById(id);
    if (!existing) return sendError(res, "Role tidak ditemukan", 404);

    // Tenant isolation: role hanya bisa diedit dari dalam mitra pemiliknya.
    const scopeMitraId = req.authUser!.activeMitraId ?? 1;
    if (existing.mitraId !== scopeMitraId) {
      return sendError(res, "Role ini milik mitra lain - tidak bisa diedit dari sini", 403);
    }
    // Role terkunci (Admin per-mitra & System-Admin): hanya platform owner (System-Admin) yang boleh edit.
    const isLockedRole = existing.isSystem === 1 && (existing.name === "Admin" || existing.name === "System-Admin" || existing.name === "Administrator");
    if (isLockedRole && !req.authUser!.isSystemAdmin) {
      return sendError(res, "Role Admin bawaan terkunci - tidak bisa diubah oleh admin mitra", 403);
    }

    const { name, description, canSeeAllData, permissions } = req.body;
    const update: any = {};

    if (name !== undefined && existing.isSystem !== 1) {
      const trimmed = String(name).trim();
      if (trimmed.length < 2) return sendError(res, "Nama role min 2 karakter");
      if (trimmed !== existing.name) {
        const dup = await storage.getRoleByName(trimmed, scopeMitraId);
        if (dup && dup.id !== id) return sendError(res, "Nama role sudah digunakan di mitra ini");
      }
      update.name = trimmed;
    }
    if (description !== undefined) {
      update.description = String(description).trim() || null;
    }
    if (canSeeAllData !== undefined
        && existing.name !== "System-Admin"
        && existing.name !== "Admin"
        && existing.name !== "Administrator") {
      update.canSeeAllData = canSeeAllData ? 1 : 0;
    }
    if (permissions && typeof permissions === "object") {
      const cleanPerms: Record<string, PermissionLevel> = {};
      for (const key of ALL_PERMISSION_KEYS) {
        const v = (permissions as any)[key];
        if (v === "read" || v === "write") cleanPerms[key] = v;
        else cleanPerms[key] = "none";
      }
      // System-Admin wajib tetap full write
      if (existing.name === "System-Admin") {
        for (const key of ALL_PERMISSION_KEYS) cleanPerms[key] = "write";
      }
      update.permissions = JSON.stringify(cleanPerms);
    }

    const updated = await storage.updateRole(id, update);
    if (!updated) return sendError(res, "Gagal update role", 500);
    await logAudit(req, "UPDATE", "role", id, updated.name, { fields: Object.keys(update) });
    let parsedPerms: Record<string, PermissionLevel> = {};
    try { parsedPerms = JSON.parse(updated.permissions); } catch { parsedPerms = {}; }
    sendSuccess(res, { ...updated, permissions: parsedPerms, isSystem: updated.isSystem === 1, canSeeAllData: updated.canSeeAllData === 1 });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// DELETE /api/roles/:id - delete custom role (admin only, tidak bisa hapus system role)
router.delete("/api/roles/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id as string);
    const role = await storage.getRoleById(id);
    if (!role) return sendError(res, "Role tidak ditemukan", 404);
    // Tenant isolation: tidak bisa hapus role milik mitra lain.
    const scopeMitraId = req.authUser!.activeMitraId ?? 1;
    if (role.mitraId !== scopeMitraId) {
      return sendError(res, "Role ini milik mitra lain - tidak bisa dihapus dari sini", 403);
    }
    if (role.isSystem === 1) return sendError(res, "Role bawaan sistem tidak bisa dihapus", 403);
    const ok = await storage.deleteRole(id);
    if (!ok) return sendError(res, "Gagal hapus role", 500);
    await logAudit(req, "DELETE", "role", id, role.name);
    sendSuccess(res, { deleted: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ==================== ROLE PRESETS (DB-managed; scope/ownership enforced) ====================

function parsePresetRow(p: any) {
  let permissions: Record<string, string> = {};
  try { permissions = JSON.parse(p.permissions || "{}"); } catch { permissions = {}; }
  return { ...p, permissions };
}

router.get("/api/role-presets", async (req: Request, res: Response) => {
  const manage = req.query.manage === "1";
  if (manage) {
    if (!requireAdmin(req, res)) return;
    const list = await storage.getManageablePresets({
      mitraId: req.authUser!.activeMitraId ?? 1,
      isSystemAdmin: isSystemAdmin(req),
    });
    return sendSuccess(res, list.map(parsePresetRow));
  }
  if (!requirePermission(req, res, "roles")) return;
  const list = await storage.getApplicablePresets(req.authUser!.activeMitraId ?? 1);
  sendSuccess(res, list.map(parsePresetRow));
});

router.post("/api/role-presets", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const { name, description, icon, color, permissions, scope, isActive, isDefault } = req.body ?? {};
  if (!name || typeof name !== "string" || name.trim().length < 2) return sendError(res, "Nama preset wajib (min 2 karakter)");
  const wantGlobal = scope === "global";
  if (wantGlobal && !isSystemAdmin(req)) return sendError(res, "Hanya System-Admin JABNET yang boleh membuat preset global", 403);
  const mitraId = wantGlobal ? 1 : (req.authUser!.activeMitraId ?? 1);
  const preset = await storage.createRolePreset({
    mitraId, scope: wantGlobal ? "global" : "tenant",
    name: name.trim(), description: (description ?? "").toString().trim() || null,
    icon: icon ?? null, color: color || "primary",
    permissions: JSON.stringify(cleansePermissionMatrix(permissions)),
    isSystem: 0, isActive: isActive === 0 ? 0 : 1, isDefault: 0,
    createdBy: req.authUser!.id,
  } as any);
  if (isDefault) await storage.setDefaultRolePreset(preset.id);
  await logAudit(req, "CREATE", "role_preset", preset.id, preset.name);
  sendSuccess(res, parsePresetRow((await storage.getRolePresetById(preset.id))!), 201);
});

router.put("/api/role-presets/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const existing = await storage.getRolePresetById(Number(req.params.id));
  if (!existing) return sendError(res, "Preset tidak ditemukan", 404);
  const err = authorizePresetMutation(req, existing, "update");
  if (err) return sendError(res, err, 403);
  const { name, description, icon, color, permissions, isActive } = req.body ?? {};
  const patch: any = {};
  if (name !== undefined && existing.isSystem !== 1) patch.name = String(name).trim();
  if (description !== undefined) patch.description = String(description).trim() || null;
  if (icon !== undefined) patch.icon = icon ?? null;
  if (color !== undefined) patch.color = color || "primary";
  if (permissions !== undefined) patch.permissions = JSON.stringify(cleansePermissionMatrix(permissions));
  if (isActive !== undefined) patch.isActive = isActive ? 1 : 0;
  patch.updatedBy = req.authUser!.id;
  await storage.updateRolePreset(existing.id, patch);
  await logAudit(req, "UPDATE", "role_preset", existing.id, existing.name);
  sendSuccess(res, parsePresetRow((await storage.getRolePresetById(existing.id))!));
});

router.delete("/api/role-presets/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const existing = await storage.getRolePresetById(Number(req.params.id));
  if (!existing) return sendError(res, "Preset tidak ditemukan", 404);
  const err = authorizePresetMutation(req, existing, "delete");
  if (err) return sendError(res, err, 403);
  await storage.deleteRolePreset(existing.id);
  await logAudit(req, "DELETE", "role_preset", existing.id, existing.name);
  sendSuccess(res, { ok: true });
});

router.post("/api/role-presets/:id/default", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const existing = await storage.getRolePresetById(Number(req.params.id));
  if (!existing) return sendError(res, "Preset tidak ditemukan", 404);
  const err = authorizePresetMutation(req, existing, "update");
  if (err) return sendError(res, err, 403);
  await storage.setDefaultRolePreset(existing.id);
  await logAudit(req, "UPDATE", "role_preset", existing.id, `set default: ${existing.name}`);
  sendSuccess(res, { ok: true });
});

// ==================== COVERAGE CHECK (PUBLIC - no login required) ====================
//
// Public tool agar tim lain (sales, marketing, customer) bisa cek apakah suatu lokasi
// tercover jaringan FTTH JABNET tanpa harus login. Input lat/lng → return ODP terdekat,
// status coverage, dan rekomendasi ODP terbaik dengan estimasi power budget.

const COVERAGE_RADIUS_METERS = 250; // standar drop cable FTTH

router.post("/api/coverage-check", async (req: Request, res: Response) => {
  try {
    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return sendError(res, "Koordinat tidak valid");
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return sendError(res, "Koordinat di luar range");

    const allOdps = await storage.getOdps();
    const validOdps = allOdps.filter(o => o.lat != null && o.lng != null);
    if (validOdps.length === 0) {
      return sendSuccess(res, {
        target: { lat, lng },
        coverageRadiusMeters: COVERAGE_RADIUS_METERS,
        nearestOdps: [],
        recommended: null,
        message: "Belum ada data ODP",
      });
    }

    // Compute distance ke setiap ODP, sort, ambil top 5
    const ranked = validOdps
      .map(o => {
        const distance = Math.round(haversineDistance(lat, lng, o.lat as number, o.lng as number));
        const capacity = o.capacity ?? 8;
        const used = o.usedCapacity ?? 0;
        const available = Math.max(0, capacity - used);
        return {
          id: o.id,
          name: o.name,
          code: o.code,
          lat: o.lat,
          lng: o.lng,
          address: o.address,
          district: o.district,
          village: o.village,
          splitterType: o.splitterType,
          status: o.status,
          capacity,
          usedCapacity: used,
          availablePorts: available,
          distanceMeters: distance,
          inCoverage: distance <= COVERAGE_RADIUS_METERS,
        };
      })
      .sort((a, b) => a.distanceMeters - b.distanceMeters);

    const nearestOdps = ranked.slice(0, 5);

    // Rekomendasi: ODP TERDEKAT yang masih punya port + status active.
    // Fallback: kalau semua penuh, ambil yang terdekat saja sebagai info.
    const { calculatePowerBudget, POWER_BUDGET } = await import("../shared/schema.js");
    const recommendedRaw = ranked.find(o => o.availablePorts > 0 && o.status === "active") ?? ranked[0];

    let recommended: any = null;
    if (recommendedRaw) {
      const splitter = recommendedRaw.splitterType || "1:8";
      const fiberKm = recommendedRaw.distanceMeters / 1000;
      const power = calculatePowerBudget({
        fiberKm,
        splices: 2,
        connectors: 2,
        splitters: [splitter],
      });
      recommended = {
        ...recommendedRaw,
        powerBudget: {
          ...power,
          assumptions: {
            fiberKm: Math.round(fiberKm * 1000) / 1000,
            splices: 2,
            connectors: 2,
            splitters: [splitter],
            gponOutputDbm: POWER_BUDGET.gponOutput,
            rxSensitivityDbm: POWER_BUDGET.rxSensitivity,
            rxMaxTargetDbm: POWER_BUDGET.rxMaxTarget,
          },
        },
      };
    }

    // Verdict cepat
    const closest = nearestOdps[0];
    const verdict = closest.inCoverage && closest.availablePorts > 0
      ? "covered"
      : closest.inCoverage && closest.availablePorts === 0
      ? "covered_full"
      : closest.distanceMeters <= COVERAGE_RADIUS_METERS * 2
      ? "marginal"
      : "out_of_coverage";

    sendSuccess(res, {
      target: { lat, lng },
      coverageRadiusMeters: COVERAGE_RADIUS_METERS,
      verdict,
      nearestOdps,
      recommended,
    });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// Meta CAPI helper - lazy load config from settings
import { trackLead as metaTrackLead, trackPurchase as metaTrackPurchase, type MetaCapiConfig } from "./meta-capi.js";

async function getMetaCapiConfig(): Promise<MetaCapiConfig | null> {
  const pixelId = await storage.getSetting("meta_pixel_id");
  const accessToken = await storage.getSetting("meta_access_token");
  if (!pixelId || !accessToken) return null;
  return { pixelId, accessToken };
}

// Public registration from coverage check landing page
router.post("/api/coverage-check/register", async (req: Request, res: Response) => {
  try {
    const { name, phone, address, lat, lng, odpId, packageInterest } = req.body;
    if (!name || !phone) return sendError(res, "Nama dan nomor WhatsApp wajib diisi");
    const lead = await storage.createLead({
      name, phone, address: address || "",
      lat: lat ?? undefined, lng: lng ?? undefined,
      odpId: odpId ?? undefined,
      source: "landing_page", stage: "new", priority: "medium",
      category: "rumahan",
      notes: packageInterest ? `Paket diminati: ${packageInterest}` : "Dari landing page coverage check",
      createdBy: 1, createdAt: new Date().toISOString(),
    } as any);

    // Fire Meta CAPI "Lead" event (non-blocking)
    getMetaCapiConfig().then(cfg => {
      if (cfg) metaTrackLead(cfg, { name, phone, city: address, leadId: lead.id, source: "landing_page" }).catch(() => {});
    });

    await emitLeadEvent("created", lead as any, 1);
    sendSuccess(res, { leadId: lead.id, message: "Pendaftaran berhasil! Tim kami akan menghubungi Anda." }, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ==================== GLOBAL AUTH GUARD (all routes below require login) ====================

router.use("/api", (req: Request, res: Response, next: Function) => {
  // Skip auth for public endpoints
  if (req.path === "/auth/login") return next();
  if (req.path.startsWith("/webhook/")) return next(); // Meta/TikTok webhook endpoints
  if (req.path === "/coverage-check" || req.path === "/coverage-check/register") return next(); // Public landing page
  if (req.path === "/integrations/chatwoot/webhook") return next(); // v4.2.5: Chatwoot webhook (HMAC verify di handler)
  if (!req.authUser) {
    return sendError(res, "Unauthorized - silakan login terlebih dahulu", 401);
  }
  next();
});

// ==================== DASHBOARD ====================

router.get("/api/dashboard", async (_req: Request, res: Response) => {
  try {
    const cached = getCached<any>("dashboard");
    if (cached) return sendSuccess(res, cached);
    const stats = await storage.getDashboardStats();
    setCached("dashboard", stats, 60_000);
    sendSuccess(res, stats);
  } catch (e: any) {
    sendError(res, e.message, 500);
  }
});

// ==================== MAP DATA ====================

router.get("/api/map-data", async (_req: Request, res: Response) => {
  try {
    const data = await storage.getMapData();
    sendSuccess(res, data);
  } catch (e: any) {
    sendError(res, e.message, 500);
  }
});

/** GET /api/map-data/customer-search?q= - cari pelanggan di luar viewport untuk map search.
 *  Hasil menyertakan odpId supaya search bisa menampilkan relasi pelanggan→ODP. */
router.get("/api/map-data/customer-search", async (req: Request, res: Response) => {
  if (!requirePermission(req, res, "map")) return;
  try {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 3) return sendSuccess(res, { customers: [] });
    const customersFound = await storage.searchMapCustomers(q, 15);
    sendSuccess(res, { customers: customersFound });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/map-data/infra", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const target = resolveMapMitraId({
      isJabnetRoot: isJabnetRoot(req),
      queryMitra: Number(req.query.mitra),
      activeMitraId: req.authUser.activeMitraId,
    });
    const cacheKey = `map-infra:${target}`;
    const cached = getCached<any>(cacheKey);
    if (cached) return sendSuccess(res, cached);
    const data = await new Promise<any>((resolve, reject) => {
      tenantContext.run({ mitraId: target, userId: req.authUser!.id, isSuperAdmin: true }, async () => {
        try { resolve(await storage.getMapInfra()); } catch (e) { reject(e); }
      });
    });
    setCached(cacheKey, data, 60_000);
    sendSuccess(res, data);
  } catch (err: any) {
    console.error("[map-infra]", err);
    sendError(res, err.message, 500);
  }
});

router.get("/api/map-data/customers", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const bboxStr = String(req.query.bbox || "");
    if (!bboxStr) {
      return sendError(res, "Missing bbox query param (format: swLat,swLng,neLat,neLng)", 400);
    }
    const parts = bboxStr.split(",").map(Number);
    if (parts.length !== 4 || parts.some(Number.isNaN)) {
      return sendError(res, "Invalid bbox format", 400);
    }
    const [swLat, swLng, neLat, neLng] = parts;
    const limit = Math.min(Number(req.query.limit) || 500, 1000);
    const target = resolveMapMitraId({
      isJabnetRoot: isJabnetRoot(req),
      queryMitra: Number(req.query.mitra),
      activeMitraId: req.authUser.activeMitraId,
    });
    const customers = await new Promise<any[]>((resolve, reject) => {
      tenantContext.run({ mitraId: target, userId: req.authUser!.id, isSuperAdmin: true }, async () => {
        try { resolve(await storage.getMapCustomersInBounds({ swLat, swLng, neLat, neLng }, limit)); }
        catch (e) { reject(e); }
      });
    });
    sendSuccess(res, { customers, count: customers.length, bbox: { swLat, swLng, neLat, neLng } });
  } catch (err: any) {
    console.error("[map-customers]", err);
    sendError(res, err.message, 500);
  }
});

// ==================== POP ====================

router.get("/api/pops", async (_req, res) => {
  try {
    const data = await storage.getPops();
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/pops/:id", async (req, res) => {
  try {
    const data = await storage.getPop(Number(req.params.id));
    if (!data) return sendError(res, "POP not found", 404);
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/pops", async (req, res) => {
  try {
    const parsed = insertPopSchema.parse(req.body);
    const data = await storage.createPop(parsed);
    await logAudit(req, "CREATE", "POP", data.id, data.name);
    sendSuccess(res, data, 201);
  } catch (e: any) { sendError(res, e.message); }
});

router.put("/api/pops/:id", async (req, res) => {
  try {
    const parsed = insertPopSchema.partial().parse(req.body);
    const data = await storage.updatePop(Number(req.params.id), parsed);
    if (!data) return sendError(res, "POP not found", 404);
    await logAudit(req, "UPDATE", "POP", data.id, data.name);
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message); }
});

router.delete("/api/pops/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await storage.getPop(id);
    const ok = await storage.deletePop(id);
    if (!ok) return sendError(res, "POP not found", 404);
    await logAudit(req, "DELETE", "POP", id, existing?.name);
    sendSuccess(res, { deleted: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ==================== ODC ====================

router.get("/api/odcs", async (_req, res) => {
  try {
    const data = await storage.getOdcs();
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/odcs/:id", async (req, res) => {
  try {
    const data = await storage.getOdc(Number(req.params.id));
    if (!data) return sendError(res, "ODC not found", 404);
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/odcs", async (req, res) => {
  try {
    const parsed = insertOdcSchema.parse(req.body);
    const data = await storage.createOdc(parsed);
    await logAudit(req, "CREATE", "ODC", data.id, data.name);
    sendSuccess(res, data, 201);
  } catch (e: any) { sendError(res, e.message); }
});

router.put("/api/odcs/:id", async (req, res) => {
  try {
    const parsed = insertOdcSchema.partial().parse(req.body);
    const data = await storage.updateOdc(Number(req.params.id), parsed);
    if (!data) return sendError(res, "ODC not found", 404);
    await logAudit(req, "UPDATE", "ODC", data.id, data.name);
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message); }
});

router.delete("/api/odcs/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await storage.getOdc(id);
    const ok = await storage.deleteOdc(id);
    if (!ok) return sendError(res, "ODC not found", 404);
    await logAudit(req, "DELETE", "ODC", id, existing?.name);
    sendSuccess(res, { deleted: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ==================== ODP ====================

router.get("/api/odps", async (_req, res) => {
  try {
    const data = await storage.getOdps();
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ODP utilization - real-time dari customer data
router.get("/api/odps/utilization", async (_req, res) => {
  try {
    const [allOdps, allCustomers] = await Promise.all([
      storage.getOdps(),
      storage.getCustomers(),
    ]);

    // Count customers per ODP - group by odpId
    // custsByOdp: { count = total pelanggan, assignedPorts = port yang sudah terisi (non-null) }
    const custsByOdp = new Map<number, { count: number; assignedPorts: Set<number> }>();
    allCustomers.forEach((c) => {
      if (!c.odpId) return;
      const existing = custsByOdp.get(c.odpId) ?? { count: 0, assignedPorts: new Set<number>() };
      existing.count++;
      if (c.portNumber) existing.assignedPorts.add(c.portNumber);
      custsByOdp.set(c.odpId, existing);
    });

    const result = allOdps.map((odp) => {
      const usage = custsByOdp.get(odp.id) ?? { count: 0, assignedPorts: new Set<number>() };
      const capacity = odp.capacity || 8;
      const usedPorts = usage.count; // total pelanggan = total port terpakai
      const availablePorts = Math.max(0, capacity - usedPorts);

      // Cari port kosong terendah (bukan sekedar maxPort+1)
      let nextPort: number | null = null;
      for (let p = 1; p <= capacity; p++) {
        if (!usage.assignedPorts.has(p)) { nextPort = p; break; }
      }
      if (usedPorts >= capacity) nextPort = null; // penuh

      const pct = Math.min(100, Math.round((usedPorts / capacity) * 100));
      // Status berdasarkan TARGET 80%
      const status = pct >= 100 ? "full" : pct >= 80 ? "nearly_full" : pct >= 50 ? "active" : "empty";

      return {
        ...odp,
        usedPorts,
        availablePorts,
        capacity,
        nextPort,
        usedPct: pct,
        status,
        usedPortList: Array.from(usage.assignedPorts).sort((a, b) => a - b),
      };
    });

    // Summary totals
    const summary = {
      totalOdp: result.length,
      totalCapacity: result.reduce((s, o) => s + o.capacity, 0),
      totalUsed: result.reduce((s, o) => s + o.usedPorts, 0),
      totalAvailable: result.reduce((s, o) => s + o.availablePorts, 0),
      fullOdp: result.filter((o) => o.status === "full").length,
      nearlyFullOdp: result.filter((o) => o.status === "nearly_full").length,
      emptyOdp: result.filter((o) => o.status === "empty").length,
    };

    sendSuccess(res, { summary, odps: result });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/odps/:id", async (req, res) => {
  try {
    const data = await storage.getOdp(Number(req.params.id));
    if (!data) return sendError(res, "ODP not found", 404);
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/odps", async (req, res) => {
  try {
    const parsed = insertOdpSchema.parse(req.body);
    const data = await storage.createOdp(parsed);
    await logAudit(req, "CREATE", "ODP", data.id, data.name);
    sendSuccess(res, data, 201);
  } catch (e: any) { sendError(res, e.message); }
});

router.put("/api/odps/:id", async (req, res) => {
  try {
    const parsed = insertOdpSchema.partial().parse(req.body);
    const data = await storage.updateOdp(Number(req.params.id), parsed);
    if (!data) return sendError(res, "ODP not found", 404);
    await logAudit(req, "UPDATE", "ODP", data.id, data.name);
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message); }
});

router.delete("/api/odps/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await storage.getOdp(id);
    const ok = await storage.deleteOdp(id);
    if (!ok) return sendError(res, "ODP not found", 404);
    await logAudit(req, "DELETE", "ODP", id, existing?.name);
    sendSuccess(res, { deleted: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- ODP photo gallery (filesystem-backed) --

/** GET /api/odps/:id/photos - list semua foto ODP (metadata only, tanpa binary) */
router.get("/api/odps/:id/photos", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const odpId = Number(req.params.id);
    const photos = await storage.getOdpPhotosForOdp(odpId);
    sendSuccess(res, photos.map((p) => ({
      id: p.id,
      caption: p.caption,
      uploadedBy: p.uploadedBy,
      isCover: Boolean(p.isCover),
      createdAt: p.createdAt,
      // photoPath NOT exposed ke client - pakai endpoint stream sebagai gantinya
    })));
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/odps/:id/photos - upload foto baru (base64 di body, decode + write fs di backend) */
router.post("/api/odps/:id/photos", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const odpId = Number(req.params.id);
    const { photoData, caption, isCover } = req.body ?? {};
    if (!photoData || typeof photoData !== "string") {
      return sendError(res, "photoData (base64 data URL) wajib");
    }
    if (photoData.length > 7_500_000) {
      return sendError(res, "Foto terlalu besar - max 5MB", 413);
    }
    const photo = await storage.addOdpPhoto({
      odpId,
      photoData,
      caption: caption ? String(caption).slice(0, 500) : null,
      isCover: !!isCover,
      userId: req.authUser!.id,
    });
    await logAudit(req, "CREATE", "OdpPhoto", photo.id, `odp:${odpId}`);
    sendSuccess(res, {
      id: photo.id,
      caption: photo.caption,
      uploadedBy: photo.uploadedBy,
      isCover: Boolean(photo.isCover),
      createdAt: photo.createdAt,
    }, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** GET /api/odps/:id/photos/:photoId - stream binary foto */
router.get("/api/odps/:id/photos/:photoId", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const odpId = Number(req.params.id);
    const photoId = Number(req.params.photoId);
    const photo = await storage.getOdpPhoto(photoId);
    if (!photo || photo.odpId !== odpId) return sendError(res, "Foto tidak ditemukan", 404);
    await streamPhoto(photo.photoPath, res);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/odps/:id/photos/:photoId/cover - set foto cover (1 cover per ODP) */
router.post("/api/odps/:id/photos/:photoId/cover", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const odpId = Number(req.params.id);
    const photoId = Number(req.params.photoId);
    await storage.setOdpCoverPhoto(odpId, photoId);
    await logAudit(req, "UPDATE", "OdpPhoto", photoId, `cover odp:${odpId}`);
    sendSuccess(res, { ok: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** DELETE /api/odps/:id/photos/:photoId - hapus foto (file + row) */
router.delete("/api/odps/:id/photos/:photoId", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const odpId = Number(req.params.id);
    const photoId = Number(req.params.photoId);
    const photo = await storage.getOdpPhoto(photoId);
    if (!photo || photo.odpId !== odpId) return sendError(res, "Foto tidak ditemukan", 404);
    const ok = await storage.deleteOdpPhoto(photoId);
    await logAudit(req, "DELETE", "OdpPhoto", photoId, `odp:${odpId}`);
    sendSuccess(res, { deleted: ok });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- Galeri foto aset generik (odp/odc/pole) - sumber data tunggal asset_photos --
// Lihat foto cukup login; upload/ubah/hapus butuh izin tulis sesuai tipe aset
// (odp→odps, odc→odcs, pole→poles). globalWriteGuard tidak match path ini, jadi
// gating tulis dilakukan eksplisit di handler.
const ASSET_PHOTO_FEATURE: Record<string, string> = { odp: "odps", odc: "odcs", pole: "poles" };
function assetPhotoFeature(type: string): string | null {
  return ASSET_PHOTO_FEATURE[type] ?? null;
}

/** GET /api/asset-photos/:type/:id - list metadata foto (tanpa binary) */
router.get("/api/asset-photos/:type/:id", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const type = String(req.params.type);
    if (!assetPhotoFeature(type)) return sendError(res, "Tipe aset tidak didukung", 400);
    const assetId = Number(req.params.id);
    const photos = await storage.getAssetPhotos(type, assetId);
    sendSuccess(res, photos.map((p) => ({
      id: p.id, caption: p.caption, uploadedBy: p.uploadedBy,
      isCover: Boolean(p.isCover), createdAt: p.createdAt,
    })));
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/asset-photos/:type/:id - upload foto (base64 di body) */
router.post("/api/asset-photos/:type/:id", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const type = String(req.params.type);
    const feature = assetPhotoFeature(type);
    if (!feature) return sendError(res, "Tipe aset tidak didukung", 400);
    if (!hasWritePermission(req, feature)) return sendError(res, "Akses ditolak (write)", 403);
    const assetId = Number(req.params.id);
    const { photoData, caption, isCover } = req.body ?? {};
    if (!photoData || typeof photoData !== "string") return sendError(res, "photoData (base64 data URL) wajib");
    if (photoData.length > 7_500_000) return sendError(res, "Foto terlalu besar - max 5MB", 413);
    const photo = await storage.addAssetPhoto({
      assetType: type, assetId, photoData,
      caption: caption ? String(caption).slice(0, 500) : null,
      isCover: !!isCover, userId: req.authUser!.id,
    });
    await logAudit(req, "CREATE", "AssetPhoto", photo.id, `${type}:${assetId}`);
    sendSuccess(res, {
      id: photo.id, caption: photo.caption, uploadedBy: photo.uploadedBy,
      isCover: Boolean(photo.isCover), createdAt: photo.createdAt,
    }, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** GET /api/asset-photos/:type/:id/:photoId - stream binary foto */
router.get("/api/asset-photos/:type/:id/:photoId", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const type = String(req.params.type);
    if (!assetPhotoFeature(type)) return sendError(res, "Tipe aset tidak didukung", 400);
    const assetId = Number(req.params.id);
    const photoId = Number(req.params.photoId);
    const photo = await storage.getAssetPhoto(photoId);
    if (!photo || photo.assetType !== type || photo.assetId !== assetId) return sendError(res, "Foto tidak ditemukan", 404);
    await streamPhoto(photo.photoPath, res);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/asset-photos/:type/:id/:photoId/cover - set foto cover (1 cover per aset) */
router.post("/api/asset-photos/:type/:id/:photoId/cover", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const type = String(req.params.type);
    const feature = assetPhotoFeature(type);
    if (!feature) return sendError(res, "Tipe aset tidak didukung", 400);
    if (!hasWritePermission(req, feature)) return sendError(res, "Akses ditolak (write)", 403);
    const assetId = Number(req.params.id);
    const photoId = Number(req.params.photoId);
    await storage.setAssetCoverPhoto(type, assetId, photoId);
    await logAudit(req, "UPDATE", "AssetPhoto", photoId, `cover ${type}:${assetId}`);
    sendSuccess(res, { ok: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** DELETE /api/asset-photos/:type/:id/:photoId - hapus foto (file + row) */
router.delete("/api/asset-photos/:type/:id/:photoId", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const type = String(req.params.type);
    const feature = assetPhotoFeature(type);
    if (!feature) return sendError(res, "Tipe aset tidak didukung", 400);
    if (!hasWritePermission(req, feature)) return sendError(res, "Akses ditolak (write)", 403);
    const assetId = Number(req.params.id);
    const photoId = Number(req.params.photoId);
    const photo = await storage.getAssetPhoto(photoId);
    if (!photo || photo.assetType !== type || photo.assetId !== assetId) return sendError(res, "Foto tidak ditemukan", 404);
    const ok = await storage.deleteAssetPhoto(photoId);
    await logAudit(req, "DELETE", "AssetPhoto", photoId, `${type}:${assetId}`);
    sendSuccess(res, { deleted: ok });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** GET /api/odps/:id/detail - mini-dashboard ODP (lazy, dipanggil saat klik di map).
 *  DB-only supaya cepat; data ACS dipisah di /ont-status. */
router.get("/api/odps/:id/detail", async (req: Request, res: Response) => {
  if (!requirePermission(req, res, "map")) return;
  try {
    const id = Number(req.params.id);
    const odp = await storage.getOdp(id);
    if (!odp) return sendError(res, "ODP tidak ditemukan", 404);

    const custs = await storage.getCustomersByOdp(id);
    const capacity = odp.capacity || 8;
    const used = custs.length; // semantik sama dengan /api/odps/utilization
    const counts = { total: custs.length, active: 0, isolir: 0, suspend: 0, terminated: 0, unknown: 0 };
    const customersOut = custs.map((c) => {
      const st = customerConnStatus(c);
      counts[st]++;
      return {
        id: c.id, customerId: c.customerId, name: c.name, connStatus: st,
        package: c.package, portNumber: c.portNumber,
        ontSerialNumber: c.ontSerialNumber, phone: c.phone,
      };
    });

    sendSuccess(res, {
      odp: {
        id: odp.id, name: odp.name, code: odp.code, splitterType: odp.splitterType,
        status: odp.status, address: odp.address, district: odp.district, village: odp.village,
        lat: odp.lat, lng: odp.lng,
      },
      utilization: {
        capacity, used, available: Math.max(0, capacity - used),
        pct: capacity > 0 ? Math.min(Math.round((used / capacity) * 100), 100) : 0,
      },
      counts,
      customers: customersOut,
    });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** GET /api/odps/:id/ont-status - optical power ONT semua pelanggan satu ODP.
 *  Device list GenieACS di-cache 60s per-mitra (klik ODP berurutan tidak refetch ACS). */
router.get("/api/odps/:id/ont-status", async (req: Request, res: Response) => {
  if (!requirePermission(req, res, "map")) return;
  try {
    const id = Number(req.params.id);
    const config = await getGenieConfig().catch(() => null);
    if (!config) return sendSuccess(res, { configured: false, thresholds: DEFAULT_OPTICAL_THRESHOLDS, byCustomer: {} });

    const custs = await storage.getCustomersByOdp(id);

    // Strategi 2-tier (mitigasi "loading lama" saat klik ODP):
    //  (a) full device list per-mitra kalau SUDAH warm di cache → coverage penuh, gratis.
    //  (b) cold → query NBI HANYA device milik pelanggan ODP ini (≤ jumlah pelanggan),
    //      bukan fetch ~10k device. Hasil targeted TIDAK di-cache di mitraKey (partial).
    //      Trade-off: match PON-serial murni belum ter-cover saat cold (butuh full list warm).
    const mitraKey = `genieacs:devices:${req.authUser!.activeMitraId ?? 1}`;
    let devices = getCached<any[]>(mitraKey);
    if (!devices) {
      const serials = custs.map((c) => c.ontSerialNumber);
      const pppoeUsernames = custs.map((c) => c.pppoeUsername);
      devices = await Promise.race([
        genieGetDevicesByIdentifiers(config, { serials, pppoeUsernames }, 10000).catch(() => [] as any[]),
        new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 8000)),
      ]);
    }

    const idx = buildDeviceIndexes(devices as any);
    const thresholds = await getOpticalThresholds();
    const byCustomer: Record<number, {
      matched: boolean; status: "online" | "offline" | null;
      rxPower: string | null; txPower: string | null;
      lastInform: string | null; uptime: number | null;
      deviceId: string | null; model: string | null;
    }> = {};
    for (const c of custs) {
      const { device } = matchCustomerDevice(c, idx);
      byCustomer[c.id] = {
        matched: !!device,
        status: device?.status ?? null,
        rxPower: device?.rxPower || null,
        txPower: device?.txPower || null,
        lastInform: device?.lastInform ?? null,
        uptime: device?.uptime ?? null,
        deviceId: device?.deviceId ?? null,
        model: device?.productClass ?? null,
      };
    }
    sendSuccess(res, { configured: true, thresholds, byCustomer });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ==================== CUSTOMERS ====================

router.get("/api/customers", async (_req, res) => {
  try {
    const data = await storage.getCustomers();
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// v4.2.5: Integration audit - find customers dengan PPPoE tapi tidak match GenieACS,
// coba fuzzy match supaya bisa di-pair semi-auto.
// Strategi matching (urutan confidence dari tinggi ke rendah):
//   1. exact (sudah handled di /ont-status)
//   2. strip non-alphanumeric        → confidence 95
//   3. strip leading zeros            → confidence 92
//   4. one contains other (>= 6 char) → confidence 80
//   5. levenshtein <= 2 (>= 6 char)   → confidence 70

function normalizeAlphanumeric(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function stripLeadingZeros(s: string): string {
  return s.replace(/^0+/, "");
}

function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

interface IntegrationCandidate {
  customerId: number;
  customerName: string;
  customerBillingId: string;
  customerPppoe: string;
  candidates: Array<{
    deviceId: string;
    devicePppoe: string;
    deviceSerialNumber: string | null;
    devicePonSerialNumber: string | null;
    deviceStatus: "online" | "offline" | null;
    deviceManufacturer: string | null;
    deviceModel: string | null;
    confidence: number;
    matchMethod: "alphanumeric" | "leading_zero" | "substring" | "levenshtein";
  }>;
}

router.get("/api/customers/integration-audit", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const config = await getGenieConfig().catch(() => null);
    if (!config) return sendError(res, "GenieACS belum dikonfigurasi", 400);

    // 8s timeout untuk GenieACS fetch - kalau lambat fail-fast supaya frontend ga gantung
    const genieDevicesPromise = Promise.race([
      genieGetDevices(config, {}, 10000, 0).catch(() => [] as any[]),
      new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 8000)),
    ]);
    const [allCustomers, devices] = await Promise.all([
      storage.getCustomers(),
      genieDevicesPromise,
    ]);

    // Build device pool dengan PPPoE username yang valid
    const devicePool = devices.filter((d: any) => d.pppoeUsername && d.pppoeUsername.length > 0);
    const exactMatchedSet = new Set<string>();
    for (const d of devicePool) exactMatchedSet.add(d.pppoeUsername.toLowerCase());

    // Customer pool: punya PPPoE tapi belum exact-matched, dan belum ada ontSerialNumber tersimpan
    const unmatched = allCustomers.filter((c: any) => {
      if (!c.pppoeUsername) return false;
      if (c.ontSerialNumber) return false; // sudah pernah di-pair manual
      return !exactMatchedSet.has(c.pppoeUsername.toLowerCase());
    });

    const result: IntegrationCandidate[] = [];

    for (const c of unmatched) {
      const cPppoe = (c as any).pppoeUsername as string;
      const cAlnum = normalizeAlphanumeric(cPppoe);
      const cStripped = stripLeadingZeros(cAlnum);
      const cands: IntegrationCandidate["candidates"] = [];

      for (const d of devicePool) {
        const dPppoe = d.pppoeUsername as string;
        const dAlnum = normalizeAlphanumeric(dPppoe);
        const dStripped = stripLeadingZeros(dAlnum);

        // Strategy 1: alphanumeric match (strip _, -, .)
        if (cAlnum === dAlnum && cAlnum.length >= 4) {
          cands.push({
            deviceId: d.deviceId, devicePppoe: dPppoe, deviceSerialNumber: d.serialNumber, devicePonSerialNumber: d.ponSerialNumber || null,
            deviceStatus: d.status, deviceManufacturer: d.manufacturer, deviceModel: d.productClass,
            confidence: 95, matchMethod: "alphanumeric",
          });
          continue;
        }
        // Strategy 2: strip leading zeros
        if (cStripped === dStripped && cStripped.length >= 4) {
          cands.push({
            deviceId: d.deviceId, devicePppoe: dPppoe, deviceSerialNumber: d.serialNumber, devicePonSerialNumber: d.ponSerialNumber || null,
            deviceStatus: d.status, deviceManufacturer: d.manufacturer, deviceModel: d.productClass,
            confidence: 92, matchMethod: "leading_zero",
          });
          continue;
        }
        // Strategy 3: one contains other (>= 6 char)
        if (cAlnum.length >= 6 && dAlnum.length >= 6 && (cAlnum.includes(dAlnum) || dAlnum.includes(cAlnum))) {
          cands.push({
            deviceId: d.deviceId, devicePppoe: dPppoe, deviceSerialNumber: d.serialNumber, devicePonSerialNumber: d.ponSerialNumber || null,
            deviceStatus: d.status, deviceManufacturer: d.manufacturer, deviceModel: d.productClass,
            confidence: 80, matchMethod: "substring",
          });
          continue;
        }
        // Strategy 4: Levenshtein <= 2 (only for length >= 6 both, expensive)
        if (cAlnum.length >= 6 && dAlnum.length >= 6 && Math.abs(cAlnum.length - dAlnum.length) <= 2) {
          const dist = levenshtein(cAlnum, dAlnum);
          if (dist > 0 && dist <= 2) {
            cands.push({
              deviceId: d.deviceId, devicePppoe: dPppoe, deviceSerialNumber: d.serialNumber, devicePonSerialNumber: d.ponSerialNumber || null,
              deviceStatus: d.status, deviceManufacturer: d.manufacturer, deviceModel: d.productClass,
              confidence: 70, matchMethod: "levenshtein",
            });
          }
        }
      }

      // Sort by confidence desc + dedup by deviceId (keep highest)
      const dedup = new Map<string, IntegrationCandidate["candidates"][number]>();
      for (const c2 of cands.sort((a, b) => b.confidence - a.confidence)) {
        if (!dedup.has(c2.deviceId)) dedup.set(c2.deviceId, c2);
      }

      result.push({
        customerId: c.id,
        customerName: c.name,
        customerBillingId: c.customerId,
        customerPppoe: cPppoe,
        candidates: Array.from(dedup.values()).slice(0, 3), // top 3 candidates
      });
    }

    // Summary stats
    const withCandidate = result.filter(r => r.candidates.length > 0);
    const highConfidence = result.filter(r => r.candidates.some(c => c.confidence >= 90)).length;
    const noCandidate = result.filter(r => r.candidates.length === 0);

    sendSuccess(res, {
      totalUnmatched: unmatched.length,
      totalDevices: devices.length,
      devicesWithPppoe: devicePool.length,
      withCandidate: withCandidate.length,
      highConfidenceCount: highConfidence,
      noCandidate: noCandidate.length,
      items: result,
    });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/**
 * v4.2.5: POST /api/customers/auto-pair-ont
 * Bulk apply ONT pairing - save ontSerialNumber ke customer DB untuk pasangan yang dipilih.
 * Body: { pairs: [{ customerId: number, deviceSerialNumber: string }] }
 */
router.post("/api/customers/auto-pair-ont", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "customer_view")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const pairs = (req.body?.pairs ?? []) as Array<{ customerId: number; deviceSerialNumber: string }>;
    if (!Array.isArray(pairs) || pairs.length === 0) return sendError(res, "pairs[] kosong");

    let success = 0, failed = 0;
    const errors: Array<{ customerId: number; error: string }> = [];

    for (const p of pairs) {
      try {
        if (!p.customerId || !p.deviceSerialNumber) {
          failed++; errors.push({ customerId: p.customerId, error: "missing fields" }); continue;
        }
        await storage.updateCustomer(p.customerId, { ontSerialNumber: p.deviceSerialNumber } as any);
        success++;
      } catch (e: any) {
        failed++; errors.push({ customerId: p.customerId, error: e.message });
      }
    }

    await logAudit(req, "UPDATE", "customer", undefined, `auto-pair ONT: ${success} paired, ${failed} failed`);
    sendSuccess(res, { success, failed, errors });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// Get ONT status for all customers (match by pppoeUsername or ontSerialNumber)
router.get("/api/customers/ont-status", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const config = await getGenieConfig().catch(() => null);
    if (!config) return sendSuccess(res, { configured: false, statuses: {} });

    const [allCustomers, devices] = await Promise.all([
      storage.getCustomers(),
      genieGetDevices(config, {}, 10000, 0).catch(() => []),
    ]);

    // Build lookup maps from devices
    // v4.2.10: index PON Serial juga (yang OLT register-kan), bukan cuma factory serial
    const deviceIdx = buildDeviceIndexes(devices as any);

    // Match each customer
    const statuses: Record<number, {
      matched: boolean;
      matchBy: "pppoe" | "sn" | "pon_sn" | null;
      ontStatus: "online" | "offline" | null;
      ontSerialNumber: string | null;
      ontPonSerialNumber: string | null;
      ontDeviceId: string | null;
      ontManufacturer: string | null;
      ontModel: string | null;
      ontRxPower: string | null;
      ontIpAddress: string | null;
      ontLastInform: string | null;
    }> = {};

    for (const c of allCustomers) {
      const { device, matchBy } = matchCustomerDevice(c as any, deviceIdx);

      statuses[c.id] = {
        matched: !!device,
        matchBy,
        ontStatus: device?.status || null,
        ontSerialNumber: device?.serialNumber || null,
        ontPonSerialNumber: device?.ponSerialNumber || null,
        ontDeviceId: device?.deviceId || null,
        ontManufacturer: device?.manufacturer || null,
        ontModel: device?.productClass || null,
        ontRxPower: device?.rxPower || null,
        ontIpAddress: device?.ipAddress || null,
        ontLastInform: device?.lastInform || null,
      };
    }

    sendSuccess(res, { configured: true, statuses, totalDevices: devices.length });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// Auto-generate customer billing ID (must be before :id route)
router.get("/api/customers/generate-id", async (req, res) => {
  try {
    const district = (req.query.district as string) || null;
    const id = await storage.generateCustomerId(district);
    sendSuccess(res, { customerId: id });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/customers/:id", async (req, res) => {
  try {
    const data = await storage.getCustomer(Number(req.params.id));
    if (!data) return sendError(res, "Customer not found", 404);
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/**
 * v4.2.18 (B.2): Customer 360 profile - full info + recent tickets + billing snapshot
 * Used by ticket detail screen Customer Panel
 */
router.get("/api/customers/:id/profile", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const id = Number(req.params.id);
    const customer = await storage.getCustomer(id);
    if (!customer) return sendError(res, "Customer not found", 404);
    // Recent tickets (last 5)
    const recentTickets = await storage.getTicketsByCustomerId(id);
    const top5 = recentTickets.slice(0, 5).map(t => ({
      id: t.id, ticketNumber: t.ticketNumber, title: t.title,
      status: t.status, priority: t.priority,
      createdAt: t.createdAt, resolvedAt: t.resolvedAt,
      categoryId: t.categoryId,
    }));
    // ODP info kalau ada
    let odp: any = null;
    if ((customer as any).odpId) {
      odp = await storage.getOdp((customer as any).odpId).catch(() => null);
    }
    sendSuccess(res, {
      customer: {
        id: customer.id,
        customerId: customer.customerId,
        name: customer.name,
        phone: (customer as any).phone,
        email: (customer as any).email,
        address: customer.address,
        lat: (customer as any).lat,
        lng: (customer as any).lng,
        package: (customer as any).package,
        billingPrice: (customer as any).billingPrice,
        billingStatus: (customer as any).billingStatus,
        installDate: (customer as any).installDate,
        ontSerialNumber: (customer as any).ontSerialNumber,
        macAddress: (customer as any).macAddress,
        pppoeUsername: customer.pppoeUsername,
        isIsolir: (customer as any).isIsolir,
        district: (customer as any).district,
        village: (customer as any).village,
        odpId: (customer as any).odpId,
      },
      odp: odp ? { id: odp.id, name: odp.name, totalPorts: odp.totalPorts, district: odp.district } : null,
      recentTickets: top5,
      totalTickets: recentTickets.length,
    });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- PPPoE Auto-Sync Helper --
async function syncPppoeToMikrotik(
  customer: { pppoeUsername?: string | null; pppoePassword?: string | null; pppoeProfile?: string | null; pppoeRouterId?: number | null; pppoeMikrotikId?: string | null; name?: string | null; isIsolir?: number | null },
  action: "create" | "update" | "delete" | "isolir" | "activate",
): Promise<{ success: boolean; mikrotikId?: string; error?: string }> {
  try {
    if (!customer.pppoeRouterId) return { success: false, error: "Router belum dipilih" };
    const router = await storage.getMikrotikRouter(customer.pppoeRouterId);
    if (!router) return { success: false, error: "Router tidak ditemukan" };
    const creds = routerToCreds(router);

    if (action === "create") {
      if (!customer.pppoeUsername || !customer.pppoePassword) return { success: false, error: "Username/password kosong" };
      const data: Record<string, any> = { name: customer.pppoeUsername, password: customer.pppoePassword, service: "pppoe" };
      if (customer.pppoeProfile) data.profile = customer.pppoeProfile;
      if (customer.name) data.comment = customer.name;
      const result = await createPppSecret(creds, data);
      return { success: true, mikrotikId: result?.ret || result?.id };
    }

    if (action === "update" && customer.pppoeMikrotikId) {
      const data: Record<string, any> = {};
      if (customer.pppoeUsername) data.name = customer.pppoeUsername;
      if (customer.pppoePassword) data.password = customer.pppoePassword;
      if (customer.pppoeProfile) data.profile = customer.pppoeProfile;
      if (customer.name) data.comment = customer.name;
      await updatePppSecret(creds, customer.pppoeMikrotikId, data);
      return { success: true };
    }

    if (action === "delete" && customer.pppoeMikrotikId) {
      await deletePppSecret(creds, customer.pppoeMikrotikId);
      return { success: true };
    }

    if (action === "isolir" && customer.pppoeMikrotikId) {
      await enableDisablePppSecret(creds, customer.pppoeMikrotikId, false);
      return { success: true };
    }

    if (action === "activate" && customer.pppoeMikrotikId) {
      await enableDisablePppSecret(creds, customer.pppoeMikrotikId, true);
      return { success: true };
    }

    return { success: false, error: "Aksi tidak valid atau MikroTik ID kosong" };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}


/**
 * v4.1.3+: Data pelanggan adalah MIRROR dari billing.jabnet.id (read-only sync).
 * - POST /api/customers: DISABLED - pelanggan baru harus register di billing dulu, lalu sync worker akan auto-import
 * - PUT /api/customers/:id: RESTRICTED - hanya 6 field local (koordinat + ODP mapping + ONT SN + notes) yang boleh diedit
 */

// Whitelist field yang boleh di-edit via PUT (local data, bukan dari billing)
const LOCAL_EDITABLE_FIELDS = [
  "lat", "lng",           // Koordinat peta
  "odpId", "portNumber",  // ODP mapping
  "ontSerialNumber",      // SN ONT (untuk match GenieACS)
  "notes",                // Catatan internal tim
] as const;

router.post("/api/customers", async (req, res) => {
  return sendError(
    res,
    "Pelanggan baru harus ditambahkan via billing.jabnet.id. Data akan otomatis sync ke FTTH Tools dalam beberapa menit. Koordinat & ODP mapping bisa di-set setelah data masuk.",
    403,
  );
});

router.put("/api/customers/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await storage.getCustomer(id);
    if (!existing) return sendError(res, "Customer not found", 404);

    // Extract HANYA local editable fields dari body, reject sisanya
    const updateData: Record<string, any> = {};
    const rejectedFields: string[] = [];
    for (const key of Object.keys(req.body ?? {})) {
      if (LOCAL_EDITABLE_FIELDS.includes(key as any)) {
        updateData[key] = req.body[key];
      } else {
        rejectedFields.push(key);
      }
    }

    if (Object.keys(updateData).length === 0) {
      return sendError(res, "Tidak ada field yang valid untuk di-update. Field billing (nama, phone, alamat, paket, dll) hanya bisa diubah di billing.jabnet.id");
    }

    // Validasi koordinat kalau di-set
    if (updateData.lat !== undefined && updateData.lat !== null) {
      const lat = Number(updateData.lat);
      if (isNaN(lat) || lat < -90 || lat > 90) return sendError(res, "Lat tidak valid");
      updateData.lat = lat;
    }
    if (updateData.lng !== undefined && updateData.lng !== null) {
      const lng = Number(updateData.lng);
      if (isNaN(lng) || lng < -180 || lng > 180) return sendError(res, "Lng tidak valid");
      updateData.lng = lng;
    }

    // Auto-assign port kalau pindah ODP tapi portNumber tidak diisi
    if (updateData.odpId && !updateData.portNumber && updateData.odpId !== existing.odpId) {
      const allInOdp = await storage.getCustomers();
      const usedPorts = new Set(
        allInOdp.filter((c) => c.odpId === updateData.odpId && c.portNumber && c.id !== id).map((c) => c.portNumber!)
      );
      const odp = await storage.getOdp(updateData.odpId);
      const cap = odp?.capacity || 8;
      for (let p = 1; p <= cap; p++) {
        if (!usedPorts.has(p)) { updateData.portNumber = p; break; }
      }
    }

    const data = await storage.updateCustomer(id, updateData);
    if (!data) return sendError(res, "Customer not found", 404);
    await logAudit(req, "UPDATE", "Pelanggan", data.id, data.name, {
      fields: Object.keys(updateData),
      rejected: rejectedFields,
    });

    sendSuccess(res, {
      ...data,
      _info: rejectedFields.length > 0
        ? `Field berikut hanya bisa diubah di billing, tidak di-update: ${rejectedFields.join(", ")}`
        : undefined,
    });
  } catch (e: any) { sendError(res, e.message); }
});

// Clear manual overrides for a customer (allow billing sync to update protected fields again)
router.post("/api/customers/:id/clear-overrides", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const fields: string[] | undefined = Array.isArray(req.body?.fields) ? req.body.fields : undefined;
    const result = await storage.clearCustomerOverrides(id, fields);
    if (!result) return sendError(res, "Customer not found", 404);
    await logAudit(req, "UPDATE", "Pelanggan", id, result.name, { action: "clear_overrides", fields: fields ?? "all" });
    sendSuccess(res, result);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.delete("/api/customers/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await storage.getCustomer(id);
    if (!existing) return sendError(res, "Customer not found", 404);

    // Auto-delete PPPoE from MikroTik if linked
    let pppoeSync: { success: boolean; error?: string } | undefined;
    if (existing.pppoeMikrotikId && existing.pppoeRouterId) {
      pppoeSync = await syncPppoeToMikrotik(existing, "delete");
    }

    const ok = await storage.deleteCustomer(id);
    if (!ok) return sendError(res, "Customer not found", 404);
    await logAudit(req, "DELETE", "Pelanggan", id, existing?.name);
    sendSuccess(res, { deleted: true, _pppoeSync: pppoeSync });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ==================== POLES ====================

router.get("/api/poles", async (_req, res) => {
  try {
    const data = await storage.getPoles();
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/poles/:id", async (req, res) => {
  try {
    const data = await storage.getPole(Number(req.params.id));
    if (!data) return sendError(res, "Pole not found", 404);
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/poles", async (req, res) => {
  try {
    const parsed = insertPoleSchema.parse(req.body);
    const data = await storage.createPole(parsed);
    await logAudit(req, "CREATE", "Tiang", data.id, data.name);
    sendSuccess(res, data, 201);
  } catch (e: any) { sendError(res, e.message); }
});

router.put("/api/poles/:id", async (req, res) => {
  try {
    const parsed = insertPoleSchema.partial().parse(req.body);
    const data = await storage.updatePole(Number(req.params.id), parsed);
    if (!data) return sendError(res, "Pole not found", 404);
    await logAudit(req, "UPDATE", "Tiang", data.id, data.name);
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message); }
});

router.delete("/api/poles/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await storage.getPole(id);
    const ok = await storage.deletePole(id);
    if (!ok) return sendError(res, "Pole not found", 404);
    await logAudit(req, "DELETE", "Tiang", id, existing?.name);
    sendSuccess(res, { deleted: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ==================== CABLES ====================

router.get("/api/cables", async (_req, res) => {
  try {
    const data = await storage.getCables();
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/cables/:id", async (req, res) => {
  try {
    const data = await storage.getCable(Number(req.params.id));
    if (!data) return sendError(res, "Cable not found", 404);
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/cables", async (req, res) => {
  try {
    const parsed = insertCableSchema.parse(req.body);
    const data = await storage.createCable(parsed);
    // Auto-generate cable cores
    if (parsed.totalCore && parsed.totalTube) {
      await storage.autoGenerateCableCores(data.id, parsed.totalCore, parsed.totalTube);
    }
    await logAudit(req, "CREATE", "Kabel", data.id, data.name);
    sendSuccess(res, data, 201);
  } catch (e: any) { sendError(res, e.message); }
});

router.put("/api/cables/:id", async (req, res) => {
  try {
    const parsed = insertCableSchema.partial().parse(req.body);
    const data = await storage.updateCable(Number(req.params.id), parsed);
    if (!data) return sendError(res, "Cable not found", 404);
    await logAudit(req, "UPDATE", "Kabel", data.id, data.name);
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message); }
});

router.delete("/api/cables/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await storage.getCable(id);
    const ok = await storage.deleteCable(id);
    if (!ok) return sendError(res, "Cable not found", 404);
    await logAudit(req, "DELETE", "Kabel", id, existing?.name);
    sendSuccess(res, { deleted: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ==================== OTB ====================

router.get("/api/otbs", async (_req, res) => {
  try {
    const data = await storage.getOtbs();
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/otbs/:id", async (req, res) => {
  try {
    const data = await storage.getOtb(Number(req.params.id));
    if (!data) return sendError(res, "OTB not found", 404);
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/pops/:popId/otbs", async (req, res) => {
  try {
    const data = await storage.getOtbsByPop(Number(req.params.popId));
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/otbs", async (req, res) => {
  try {
    const parsed = insertOtbSchema.parse(req.body);
    const data = await storage.createOtb(parsed);
    await logAudit(req, "CREATE", "OTB", data.id, data.name);
    sendSuccess(res, data, 201);
  } catch (e: any) { sendError(res, e.message); }
});

router.put("/api/otbs/:id", async (req, res) => {
  try {
    const parsed = insertOtbSchema.partial().parse(req.body);
    const data = await storage.updateOtb(Number(req.params.id), parsed);
    if (!data) return sendError(res, "OTB not found", 404);
    await logAudit(req, "UPDATE", "OTB", data.id, data.name);
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message); }
});

router.delete("/api/otbs/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await storage.getOtb(id);
    const ok = await storage.deleteOtb(id);
    if (!ok) return sendError(res, "OTB not found", 404);
    await logAudit(req, "DELETE", "OTB", id, existing?.name);
    sendSuccess(res, { deleted: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ==================== BESTRAY ====================

router.get("/api/bestrays", async (_req, res) => {
  try {
    const data = await storage.getBestrays();
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/bestrays/:id", async (req, res) => {
  try {
    const data = await storage.getBestray(Number(req.params.id));
    if (!data) return sendError(res, "Bestray not found", 404);
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/odcs/:odcId/bestrays", async (req, res) => {
  try {
    const data = await storage.getBestraysByOdc(Number(req.params.odcId));
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/bestrays", async (req, res) => {
  try {
    const parsed = insertBestraySchema.parse(req.body);
    const data = await storage.createBestray(parsed);
    await logAudit(req, "CREATE", "Bestray", data.id, data.label ?? `Slot ${data.slotNumber}`);
    sendSuccess(res, data, 201);
  } catch (e: any) { sendError(res, e.message); }
});

router.put("/api/bestrays/:id", async (req, res) => {
  try {
    const parsed = insertBestraySchema.partial().parse(req.body);
    const data = await storage.updateBestray(Number(req.params.id), parsed);
    if (!data) return sendError(res, "Bestray not found", 404);
    await logAudit(req, "UPDATE", "Bestray", data.id, data.label ?? `Slot ${data.slotNumber}`);
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message); }
});

router.delete("/api/bestrays/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await storage.getBestray(id);
    const ok = await storage.deleteBestray(id);
    if (!ok) return sendError(res, "Bestray not found", 404);
    await logAudit(req, "DELETE", "Bestray", id, existing?.label ?? `Slot ${existing?.slotNumber}`);
    sendSuccess(res, { deleted: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ==================== SPLITTERS ====================

router.get("/api/splitters", async (_req, res) => {
  try {
    const data = await storage.getSplitters();
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/splitters/:id", async (req, res) => {
  try {
    const data = await storage.getSplitter(Number(req.params.id));
    if (!data) return sendError(res, "Splitter not found", 404);
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/splitters", async (req, res) => {
  try {
    const parsed = insertSplitterSchema.parse(req.body);
    const data = await storage.createSplitter(parsed);
    await logAudit(req, "CREATE", "Splitter", data.id, data.name);
    sendSuccess(res, data, 201);
  } catch (e: any) { sendError(res, e.message); }
});

router.put("/api/splitters/:id", async (req, res) => {
  try {
    const parsed = insertSplitterSchema.partial().parse(req.body);
    const data = await storage.updateSplitter(Number(req.params.id), parsed);
    if (!data) return sendError(res, "Splitter not found", 404);
    await logAudit(req, "UPDATE", "Splitter", data.id, data.name);
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message); }
});

router.delete("/api/splitters/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await storage.getSplitter(id);
    const ok = await storage.deleteSplitter(id);
    if (!ok) return sendError(res, "Splitter not found", 404);
    await logAudit(req, "DELETE", "Splitter", id, existing?.name);
    sendSuccess(res, { deleted: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ==================== CABLE CORES ====================

router.get("/api/cable-cores", async (_req, res) => {
  try {
    const data = await storage.getCableCores();
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/cable-cores/:id", async (req, res) => {
  try {
    const data = await storage.getCableCore(Number(req.params.id));
    if (!data) return sendError(res, "Cable core not found", 404);
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/cables/:cableId/cores", async (req, res) => {
  try {
    const data = await storage.getCableCoreByCable(Number(req.params.cableId));
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/cables/:cableId/generate-cores", async (req, res) => {
  try {
    const cableId = Number(req.params.cableId);
    const { totalCore, totalTube } = req.body;
    if (!totalCore || !totalTube) return sendError(res, "totalCore and totalTube required");
    const data = await storage.generateCableCores(cableId, totalCore, totalTube);
    sendSuccess(res, data, 201);
  } catch (e: any) { sendError(res, e.message); }
});

router.put("/api/cable-cores/:id", async (req, res) => {
  try {
    const parsed = insertCableCoreSchema.partial().parse(req.body);
    const data = await storage.updateCableCore(Number(req.params.id), parsed);
    if (!data) return sendError(res, "Cable core not found", 404);
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message); }
});

router.delete("/api/cable-cores/:id", async (req, res) => {
  try {
    const ok = await storage.deleteCableCore(Number(req.params.id));
    if (!ok) return sendError(res, "Cable core not found", 404);
    sendSuccess(res, { deleted: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ==================== CORE CONNECTIONS ====================

router.get("/api/core-connections", async (_req, res) => {
  try {
    const data = await storage.getCoreConnections();
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/core-connections/by-entity", async (req, res) => {
  try {
    const { type, id } = req.query;
    if (!type || !id) return sendError(res, "type and id query params required");
    const data = await storage.getCoreConnectionsByEntity(String(type), Number(id));
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/core-connections/:id", async (req, res) => {
  try {
    const data = await storage.getCoreConnection(Number(req.params.id));
    if (!data) return sendError(res, "Core connection not found", 404);
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/core-connections", async (req, res) => {
  try {
    const parsed = insertCoreConnectionSchema.parse(req.body);
    const data = await storage.createCoreConnection(parsed);
    await logAudit(req, "CREATE", "Koneksi Core", data.id, data.label ?? undefined);
    sendSuccess(res, data, 201);
  } catch (e: any) { sendError(res, e.message); }
});

router.put("/api/core-connections/:id", async (req, res) => {
  try {
    const parsed = insertCoreConnectionSchema.partial().parse(req.body);
    const data = await storage.updateCoreConnection(Number(req.params.id), parsed);
    if (!data) return sendError(res, "Core connection not found", 404);
    await logAudit(req, "UPDATE", "Koneksi Core", data.id, data.label ?? undefined);
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message); }
});

router.delete("/api/core-connections/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await storage.getCoreConnection(id);
    const ok = await storage.deleteCoreConnection(id);
    if (!ok) return sendError(res, "Core connection not found", 404);
    await logAudit(req, "DELETE", "Koneksi Core", id, existing?.label ?? undefined);
    sendSuccess(res, { deleted: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ==================== POWER BUDGET ====================

router.post("/api/power-budget", async (req, res) => {
  try {
    const { calculatePowerBudget } = await import("../shared/schema.js");
    const result = calculatePowerBudget(req.body);
    sendSuccess(res, result);
  } catch (e: any) { sendError(res, e.message); }
});

// ==================== AUTH GUARD ====================

function requireAuth(req: Request, res: Response): boolean {
  if (!req.authUser) {
    sendError(res, "Unauthorized - silakan login terlebih dahulu", 401);
    return false;
  }
  return true;
}

// ==================== EXPORT ====================

// Helper: convert array of objects to CSV string
function toCSV(data: any[], columns: { key: string; label: string }[]): string {
  const header = columns.map(c => c.label).join(",");
  const rows = data.map(row =>
    columns.map(c => {
      const val = row[c.key];
      if (val === null || val === undefined) return "";
      const str = String(val);
      // Escape quotes and wrap in quotes if contains comma/newline/quote
      if (str.includes(",") || str.includes("\n") || str.includes("\r") || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(",")
  );
  return [header, ...rows].join("\n");
}

router.get("/api/export/pops", async (_req, res) => {
  try {
    const data = await storage.getPops();
    const csv = toCSV(data, [
      { key: "id", label: "ID" },
      { key: "name", label: "Nama" },
      { key: "code", label: "Kode" },
      { key: "address", label: "Alamat" },
      { key: "totalPorts", label: "Total Port" },
      { key: "usedPorts", label: "Port Terpakai" },
      { key: "lat", label: "Latitude" },
      { key: "lng", label: "Longitude" },
      { key: "status", label: "Status" },
    ]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=pops.csv");
    res.send(csv);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/export/odcs", async (_req, res) => {
  try {
    const data = await storage.getOdcs();
    const csv = toCSV(data, [
      { key: "id", label: "ID" },
      { key: "name", label: "Nama" },
      { key: "code", label: "Kode" },
      { key: "popId", label: "POP ID" },
      { key: "capacity", label: "Kapasitas" },
      { key: "usedCapacity", label: "Kapasitas Terpakai" },
      { key: "splitterType", label: "Tipe Splitter" },
      { key: "lat", label: "Latitude" },
      { key: "lng", label: "Longitude" },
      { key: "status", label: "Status" },
    ]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=odcs.csv");
    res.send(csv);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/export/odps", async (_req, res) => {
  try {
    const data = await storage.getOdps();
    const csv = toCSV(data, [
      { key: "id", label: "ID" },
      { key: "name", label: "Nama" },
      { key: "code", label: "Kode" },
      { key: "odcId", label: "ODC ID" },
      { key: "capacity", label: "Kapasitas" },
      { key: "usedCapacity", label: "Kapasitas Terpakai" },
      { key: "lat", label: "Latitude" },
      { key: "lng", label: "Longitude" },
      { key: "status", label: "Status" },
    ]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=odps.csv");
    res.send(csv);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/export/customers", async (_req, res) => {
  try {
    const data = await storage.getCustomers();
    const csv = toCSV(data, [
      { key: "id", label: "ID" },
      { key: "name", label: "Nama" },
      { key: "customerId", label: "ID Pelanggan" },
      { key: "odpId", label: "ODP ID" },
      { key: "phone", label: "Telepon" },
      { key: "address", label: "Alamat" },
      { key: "package", label: "Paket" },
      { key: "lat", label: "Latitude" },
      { key: "lng", label: "Longitude" },
      { key: "status", label: "Status" },
    ]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=customers.csv");
    res.send(csv);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/export/cables", async (_req, res) => {
  try {
    const data = await storage.getCables();
    const csv = toCSV(data, [
      { key: "id", label: "ID" },
      { key: "name", label: "Nama" },
      { key: "code", label: "Kode" },
      { key: "cableType", label: "Tipe" },
      { key: "totalCore", label: "Total Core" },
      { key: "usedCore", label: "Core Terpakai" },
      { key: "totalTube", label: "Total Tube" },
      { key: "lengthMeters", label: "Panjang (m)" },
      { key: "status", label: "Status" },
    ]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=cables.csv");
    res.send(csv);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/export/cable-cores", async (_req, res) => {
  try {
    const data = await storage.getCableCores();
    const csv = toCSV(data, [
      { key: "id", label: "ID" },
      { key: "cableId", label: "Kabel ID" },
      { key: "tubeNumber", label: "Tube" },
      { key: "tubeColor", label: "Warna Tube" },
      { key: "coreNumber", label: "Core" },
      { key: "coreColor", label: "Warna Core" },
      { key: "globalCoreNumber", label: "Core Global" },
      { key: "status", label: "Status" },
    ]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=cable-cores.csv");
    res.send(csv);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/export/otbs", async (_req, res) => {
  try {
    const data = await storage.getOtbs();
    const csv = toCSV(data, [
      { key: "id", label: "ID" },
      { key: "name", label: "Nama" },
      { key: "popId", label: "POP ID" },
      { key: "totalCores", label: "Total Core" },
      { key: "status", label: "Status" },
      { key: "notes", label: "Catatan" },
    ]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=otbs.csv");
    res.send(csv);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/export/core-connections", async (_req, res) => {
  try {
    const data = await storage.getCoreConnections();
    const csv = toCSV(data, [
      { key: "id", label: "ID" },
      { key: "label", label: "Label" },
      { key: "fromType", label: "Tipe Asal" },
      { key: "fromId", label: "ID Asal" },
      { key: "fromPort", label: "Port Asal" },
      { key: "toType", label: "Tipe Tujuan" },
      { key: "toId", label: "ID Tujuan" },
      { key: "toPort", label: "Port Tujuan" },
      { key: "cableCoreId", label: "Cable Core ID" },
      { key: "splitterId", label: "Splitter ID" },
      { key: "notes", label: "Catatan" },
    ]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=core-connections.csv");
    res.send(csv);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// Full network export (all data in one report)
router.get("/api/export/full-report", async (_req, res) => {
  try {
    const [pops, odcs, odps, customers, cables, otbs, coreConns] = await Promise.all([
      storage.getPops(),
      storage.getOdcs(),
      storage.getOdps(),
      storage.getCustomers(),
      storage.getCables(),
      storage.getOtbs(),
      storage.getCoreConnections(),
    ]);

    const report = {
      generatedAt: new Date().toISOString(),
      summary: {
        totalPops: pops.length,
        totalOdcs: odcs.length,
        totalOdps: odps.length,
        totalCustomers: customers.length,
        totalCables: cables.length,
        totalOtbs: otbs.length,
        totalCoreConnections: coreConns.length,
      },
      data: { pops, odcs, odps, customers, cables, otbs, coreConnections: coreConns },
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", "attachment; filename=ftth-full-report.json");
    res.json(report);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ==================== IMPORT ====================

router.post("/api/import/pops", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const items = req.body;
    if (!Array.isArray(items)) return sendError(res, "Expected array of items");
    const results = [];
    for (const item of items) {
      const parsed = insertPopSchema.parse(item);
      const result = await storage.createPop(parsed);
      results.push(result);
    }
    await logAudit(req, "CREATE", "import_pops", undefined, undefined, { count: results.length });
    sendSuccess(res, { imported: results.length });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/import/odcs", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const items = req.body;
    if (!Array.isArray(items)) return sendError(res, "Expected array of items");
    const results = [];
    for (const item of items) {
      const parsed = insertOdcSchema.parse(item);
      const result = await storage.createOdc(parsed);
      results.push(result);
    }
    await logAudit(req, "CREATE", "import_odcs", undefined, undefined, { count: results.length });
    sendSuccess(res, { imported: results.length });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/import/odps", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const items = req.body;
    if (!Array.isArray(items)) return sendError(res, "Expected array of items");
    const results = [];
    for (const item of items) {
      const parsed = insertOdpSchema.parse(item);
      const result = await storage.createOdp(parsed);
      results.push(result);
    }
    await logAudit(req, "CREATE", "import_odps", undefined, undefined, { count: results.length });
    sendSuccess(res, { imported: results.length });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/import/customers", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const items = req.body;
    if (!Array.isArray(items)) return sendError(res, "Expected array of items");
    const results = [];
    for (const item of items) {
      const parsed = insertCustomerSchema.parse(item);
      const result = await storage.createCustomer(parsed);
      results.push(result);
    }
    await logAudit(req, "CREATE", "import_customers", undefined, undefined, { count: results.length });
    sendSuccess(res, { imported: results.length });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/import/cables", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const items = req.body;
    if (!Array.isArray(items)) return sendError(res, "Expected array of items");
    const results = [];
    for (const item of items) {
      const parsed = insertCableSchema.parse(item);
      const cable = await storage.createCable(parsed);
      if (parsed.totalCore && parsed.totalTube) {
        await storage.autoGenerateCableCores(cable.id, parsed.totalCore, parsed.totalTube);
      }
      results.push(cable);
    }
    await logAudit(req, "CREATE", "import_cables", undefined, undefined, { count: results.length });
    sendSuccess(res, { imported: results.length });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/import/otbs", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const items = req.body;
    if (!Array.isArray(items)) return sendError(res, "Expected array of items");
    const results = [];
    for (const item of items) {
      const parsed = insertOtbSchema.parse(item);
      const result = await storage.createOtb(parsed);
      results.push(result);
    }
    await logAudit(req, "CREATE", "import_otbs", undefined, undefined, { count: results.length });
    sendSuccess(res, { imported: results.length });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ==================== BILLING SYNC (v4.1.2 - delegate ke BillingSyncWorker) ====================

import { billingSyncWorker } from "./billing-sync-worker.js";

router.post("/api/billing/sync", billingSyncLimiter, async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  recordRateAttempt(BILLING_SYNC_LIMIT.bucket, rateLimitKey(req), BILLING_SYNC_LIMIT);
  if (!hasWritePermission(req, "billing_sync")) {
    return sendError(res, "Akses ditolak: billing_sync write required", 403);
  }
  // Per-mitra cooldown (persisted, shared across users in the mitra)
  const lastAt = await storage.getMitraSetting("billing_manual_sync_last_at", { fallbackToGlobal: false });
  const cd = computeManualSyncCooldown(lastAt, Date.now(), MANUAL_SYNC_COOLDOWN_MS);
  if (!cd.canSync) {
    return res.status(429).json({
      success: false,
      error: `Sync baru bisa dilakukan lagi dalam ${Math.ceil(cd.remainingSec / 60)} menit`,
      remainingSec: cd.remainingSec,
      nextAvailableAt: cd.nextAvailableAt,
    });
  }
  try {
    const stats = await billingSyncWorker.triggerManual(req.authUser.id);
    await storage.setMitraSetting("billing_manual_sync_last_at", new Date().toISOString());
    await logAudit(req, "SYNC", "billing", undefined, "manual_trigger", stats);
    sendSuccess(res, { ...stats, syncedAt: new Date().toISOString() });
  } catch (e: any) {
    sendError(res, `Sync gagal: ${e.message}`, 500);
  }
});

/** GET /api/billing/sync/cooldown - manual-sync availability for the active mitra. */
router.get("/api/billing/sync/cooldown", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  const lastAt = await storage.getMitraSetting("billing_manual_sync_last_at", { fallbackToGlobal: false });
  const cd = computeManualSyncCooldown(lastAt, Date.now(), MANUAL_SYNC_COOLDOWN_MS);
  sendSuccess(res, { ...cd, cooldownMinutes: MANUAL_SYNC_COOLDOWN_MS / 60_000 });
});

// -- JABNET-root billing admin: manage each mitra's reseller_id centrally --

/** GET /api/billing/mitras - list all mitras + billing_id + last sync status + customer count. JABNET-root only. */
router.get("/api/billing/mitras", async (req: Request, res: Response) => {
  if (!isJabnetRoot(req)) return sendError(res, "Akses ditolak: khusus JABNET", 403);
  try {
    const mitras = await storage.listMitras(true);
    const out = [];
    for (const m of mitras) {
      const row = await new Promise<any>((resolve) => {
        tenantContext.run({ mitraId: m.id, userId: req.authUser!.id, isSuperAdmin: true }, async () => {
          try {
            const billingId = (await storage.getMitraSetting("billing_reseller_id", { fallbackToGlobal: false })) ?? "";
            const lastAt = (await storage.getMitraSetting("billing_manual_sync_last_at", { fallbackToGlobal: false })) ?? null;
            const pool: any = (storage as any).pool;
            const counts: any = ((await pool.execute("SELECT COUNT(*) AS c FROM customers WHERE mitra_id = ?", [m.id]))[0] as any);
            resolve({ billingId, lastAt, customerCount: Number(counts?.[0]?.c ?? 0) });
          } catch { resolve({ billingId: "", lastAt: null, customerCount: 0 }); }
        });
      });
      out.push({
        mitraId: m.id,
        name: m.displayName ?? m.name,
        slug: m.slug,
        isJabnet: m.id === 1,
        billingId: row.billingId,
        lastSyncAt: row.lastAt,
        customerCount: row.customerCount,
      });
    }
    sendSuccess(res, { mitras: out });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** PUT /api/billing/mitras/:id - save billing_reseller_id for a mitra. JABNET-root only. */
router.put("/api/billing/mitras/:id", integrationsLimiter, async (req: Request, res: Response) => {
  if (!isJabnetRoot(req)) return sendError(res, "Akses ditolak: khusus JABNET", 403);
  const mitraId = Number(req.params.id);
  const billingId = String(req.body?.billingId ?? "").trim();
  if (mitraId === 1) return sendError(res, "JABNET adalah billing root (reseller_id=12, via .env) - tidak bisa diubah di sini", 400);
  const m = await storage.getMitra(mitraId);
  if (!m) return sendError(res, "Mitra tidak ditemukan", 404);
  if (billingId && !/^\d+$/.test(billingId)) return sendError(res, "Billing ID harus angka", 400);
  try {
    await new Promise<void>((resolve, reject) => {
      tenantContext.run({ mitraId, userId: req.authUser!.id, isSuperAdmin: true }, async () => {
        try {
          if (billingId) await storage.setMitraSetting("billing_reseller_id", billingId);
          else await storage.deleteMitraSetting("billing_reseller_id");
          resolve();
        } catch (e) { reject(e); }
      });
    });
    await logAudit(req, "UPDATE", "billing_reseller", mitraId, m.name, { billingId: billingId || null });
    sendSuccess(res, { mitraId, billingId: billingId || null });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/billing/mitras/:id/test - does this reseller_id pull customers? JABNET-root only. */
router.post("/api/billing/mitras/:id/test", billingSyncLimiter, async (req: Request, res: Response) => {
  if (!isJabnetRoot(req)) return sendError(res, "Akses ditolak: khusus JABNET", 403);
  recordRateAttempt(BILLING_SYNC_LIMIT.bucket, rateLimitKey(req), BILLING_SYNC_LIMIT);
  const mitraId = Number(req.params.id);
  let billingId = String(req.body?.billingId ?? "").trim();
  try {
    if (!billingId) {
      billingId = await new Promise<string>((resolve) => {
        tenantContext.run({ mitraId, userId: req.authUser!.id, isSuperAdmin: true }, async () => {
          resolve((await storage.getMitraSetting("billing_reseller_id", { fallbackToGlobal: false })) ?? "");
        });
      });
    }
    const resellerId = parseInt(billingId);
    if (!Number.isFinite(resellerId) || resellerId <= 0) {
      return sendError(res, "Billing ID belum di-set / bukan angka", 400);
    }
    const t0 = Date.now();
    const { totalFound, sample } = await billingSyncWorker.testResellerData(resellerId);
    sendSuccess(res, { ok: totalFound > 0, resellerId, totalFound, elapsedMs: Date.now() - t0, sample });
  } catch (e: any) { sendError(res, `Test gagal: ${e.message}`, 502); }
});

/** POST /api/billing/mitras/:id/sync - full sync of a specific mitra. JABNET-root only. Exempt from manual cooldown. */
router.post("/api/billing/mitras/:id/sync", billingSyncLimiter, async (req: Request, res: Response) => {
  if (!isJabnetRoot(req)) return sendError(res, "Akses ditolak: khusus JABNET", 403);
  recordRateAttempt(BILLING_SYNC_LIMIT.bucket, rateLimitKey(req), BILLING_SYNC_LIMIT);
  const mitraId = Number(req.params.id);
  const m = await storage.getMitra(mitraId);
  if (!m) return sendError(res, "Mitra tidak ditemukan", 404);
  try {
    const stats = await new Promise<any>((resolve, reject) => {
      tenantContext.run({ mitraId, userId: req.authUser!.id, isSuperAdmin: true }, async () => {
        try { resolve(await billingSyncWorker.triggerManual(req.authUser!.id)); } catch (e) { reject(e); }
      });
    });
    await logAudit(req, "SYNC", "billing", mitraId, m.name, stats);
    sendSuccess(res, { ...stats, mitraId, syncedAt: new Date().toISOString() });
  } catch (e: any) { sendError(res, `Sync gagal: ${e.message}`, 500); }
});

/**
 * POST /api/billing/verify-reseller
 * Body: { resellerId, expectedNama, expectedPhone, expectedEmail, expectedAlamat?, password }
 *
 * STRICT 5-field verification (gated by rate limit 5/5min/15min lockout). Passes only when ALL hold:
 *   1. resellerId returns customers in billing (totalFound > 0)
 *   2. expectedNama matches billing.reseller (case-insensitive)
 *   3. expectedPhone, expectedEmail are non-empty AND match values stored in mitra_integrations
 *   4. password matches stored `billing_reseller_password` (plain-text compare; shared secret)
 *   5. all 5 inputs filled
 *
 * Note: billing list_pelanggan endpoint only exposes reseller NAME, not phone/email/alamat,
 * so phone/email are validated against locally-stored values (set by owner via /integrations).
 * Password is a shared secret between JABNET-owner & mitra-admin (NOT verified against billing).
 * Failed attempts are tracked per (user+mitra+IP); 5 fails in 5min → 15min lockout.
 */
router.post("/api/billing/verify-reseller", verifyResellerLimiter, async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "billing_sync")) {
    return sendError(res, "Akses ditolak: billing_sync write required", 403);
  }
  const rlKey = rateLimitKey(req);
  try {
    const b = req.body ?? {};
    const mitraId = req.authUser.activeMitraId ?? 1;

    // JABNET bypass: JABNET adalah billing provider root, bukan reseller. Tidak perlu verify.
    // Return passed=true langsung dengan reseller_id=12.
    if (mitraId === 1) {
      return sendSuccess(res, {
        passed: true,
        mitraId: 1,
        resellerId: 12,
        isJabnetRoot: true,
        message: "Mitra JABNET adalah billing provider root - tidak perlu verifikasi reseller.",
        totalFound: 0,
        resellerNameFromBilling: null,
        elapsedMs: 0,
        profile: null,
        sample: [],
      });
    }

    const resellerStored = await storage.getMitraSetting("billing_reseller_id");
    const namaStored = await storage.getMitraSetting("billing_reseller_nama");
    const alamatStored = await storage.getMitraSetting("billing_reseller_alamat");
    const phoneStored = await storage.getMitraSetting("billing_reseller_phone");
    const emailStored = await storage.getMitraSetting("billing_reseller_email");
    const passwordStored = await storage.getMitraSetting("billing_reseller_password");

    const expectedBillingId = String(b.resellerId ?? resellerStored ?? "").trim();
    const expectedNama = String(b.expectedNama ?? namaStored ?? "").trim();
    const expectedAlamat = String(b.expectedAlamat ?? alamatStored ?? "").trim();
    const expectedPhone = String(b.expectedPhone ?? phoneStored ?? "").trim();
    const expectedEmail = String(b.expectedEmail ?? emailStored ?? "").trim();
    const inputPassword = String(b.password ?? "").trim();

    const FAIL_MSG = "Gagal mengambil data. Informasi tidak diketahui.";

    // Pre-check: all 5 critical fields must be filled (alamat optional)
    const missing: string[] = [];
    if (!expectedBillingId) missing.push("Billing ID");
    if (!expectedNama) missing.push("Nama");
    if (!expectedPhone) missing.push("Nomor Telepon");
    if (!expectedEmail) missing.push("Email");
    if (!inputPassword) missing.push("Password");
    if (missing.length > 0) {
      recordRateAttempt(VERIFY_RESELLER_LIMIT.bucket, rlKey, VERIFY_RESELLER_LIMIT);
      return sendSuccess(res, {
        passed: false,
        failureReason: `${FAIL_MSG} Field belum diisi: ${missing.join(", ")}.`,
        mitraId,
        resellerId: expectedBillingId || null,
        totalFound: 0,
        resellerNameFromBilling: null,
        elapsedMs: 0,
        profile: {
          billingId: { value: expectedBillingId, verifiedByBilling: false, ok: false },
          nama: { value: expectedNama, fromBilling: null, verifiedByBilling: false, ok: false },
          phone: { value: expectedPhone, stored: phoneStored ?? "", verifiedByBilling: false, ok: !!expectedPhone },
          email: { value: expectedEmail, stored: emailStored ?? "", verifiedByBilling: false, ok: !!expectedEmail },
          alamat: { value: expectedAlamat, stored: alamatStored ?? "", verifiedByBilling: false, ok: !!expectedAlamat },
          password: { provided: !!inputPassword, configured: !!passwordStored, ok: false },
        },
        sample: [],
      });
    }

    const resellerId = parseInt(expectedBillingId);
    if (!Number.isFinite(resellerId) || resellerId <= 0) {
      return sendSuccess(res, {
        passed: false,
        failureReason: `${FAIL_MSG} Billing ID harus angka positif.`,
        mitraId, resellerId: expectedBillingId, totalFound: 0, resellerNameFromBilling: null, elapsedMs: 0,
        profile: { billingId: { value: expectedBillingId, verifiedByBilling: false, ok: false }, nama: {}, phone: {}, email: {}, alamat: {} },
        sample: [],
      });
    }
    const apiUrl = process.env.BILLING_API_URL || "https://billing.jabnet.id/api/pelanggan/list_pelanggan";
    const apiToken = process.env.BILLING_API_TOKEN ?? "";
    if (!apiToken) return sendError(res, "BILLING_API_TOKEN belum di-set di .env server. Hubungi admin server.", 500);

    const qs = new URLSearchParams({
      jenis_pelanggan: "rumahan",
      status_pelanggan: "aktif",
      reseller_id: String(resellerId),
      api_token: apiToken,
    });
    const t0 = Date.now();
    const r = await fetch(`${apiUrl}?${qs}`, { signal: AbortSignal.timeout(20_000) });
    const elapsedMs = Date.now() - t0;
    if (!r.ok) {
      return sendError(res, `Billing API HTTP ${r.status} - periksa URL/token`, 502);
    }
    const json: any = await r.json();
    const rows: any[] = json?.data?.data_pelanggan ?? json?.data ?? [];
    const first = rows[0] ?? null;
    const resellerNameFromBilling: string | null = first?.reseller ?? null;

    // Per-field check
    const billingIdOk = rows.length > 0;
    const namaOk = !!resellerNameFromBilling && expectedNama.toLowerCase() === resellerNameFromBilling.toLowerCase();
    const phoneOk = !!expectedPhone && (!phoneStored || expectedPhone === String(phoneStored).trim());
    const emailOk = !!expectedEmail && (!emailStored || expectedEmail.toLowerCase() === String(emailStored).trim().toLowerCase());
    // Alamat: ALWAYS informational only - TIDAK termasuk dalam passed check (per user spec).
    const alamatMatches = !expectedAlamat || !alamatStored || expectedAlamat.toLowerCase() === String(alamatStored).trim().toLowerCase();
    // Password: shared secret stored plain-text in mitra_integrations. Fails if not configured (force owner to set).
    const passwordOk = !!passwordStored && inputPassword === String(passwordStored).trim();

    // Alamat di-skip dari passed: kalau billingId/nama/phone/email/password OK, lulus.
    const passed = billingIdOk && namaOk && phoneOk && emailOk && passwordOk;

    let failureReason: string | null = null;
    if (!passed) {
      const reasons: string[] = [];
      if (!billingIdOk) reasons.push("Billing ID tidak ditemukan di billing");
      if (!namaOk) reasons.push(`Nama tidak cocok (input: "${expectedNama}", billing: "${resellerNameFromBilling ?? "-"}")`);
      if (!phoneOk) reasons.push("Nomor Telepon tidak cocok dengan yang tersimpan");
      if (!emailOk) reasons.push("Email tidak cocok dengan yang tersimpan");
      if (!passwordOk) {
        reasons.push(passwordStored ? "Password salah" : "Password verifikasi belum di-set (hubungi JABNET)");
      }
      failureReason = `${FAIL_MSG} ${reasons.join("; ")}.`;
      recordRateAttempt(VERIFY_RESELLER_LIMIT.bucket, rlKey, VERIFY_RESELLER_LIMIT);
    } else {
      // Clear penalty on success
      clearRateAttempts(VERIFY_RESELLER_LIMIT.bucket, rlKey);
    }

    sendSuccess(res, {
      passed,
      failureReason,
      mitraId,
      resellerId,
      totalFound: rows.length,
      resellerNameFromBilling,
      elapsedMs,
      profile: {
        billingId: { value: expectedBillingId, verifiedByBilling: true, ok: billingIdOk },
        nama: { value: expectedNama, fromBilling: resellerNameFromBilling, verifiedByBilling: true, ok: namaOk },
        phone: { value: expectedPhone, stored: phoneStored ?? "", verifiedByBilling: false, ok: phoneOk },
        email: { value: expectedEmail, stored: emailStored ?? "", verifiedByBilling: false, ok: emailOk },
        alamat: { value: expectedAlamat, stored: alamatStored ?? "", verifiedByBilling: false, ok: alamatMatches, informational: true },
        password: { provided: !!inputPassword, configured: !!passwordStored, ok: passwordOk },
      },
      // sample only if passed; limited to 10 for testing
      sample: passed
        ? rows.slice(0, 10).map(c => ({
            customer_id: c.customer_id,
            nama: c.nama_lengkap ?? c.nama_panggilan,
            alamat: c.alamat_pelanggan,
            paket: c.paket_layanan,
            status: c.status_pelanggan,
            is_isolir: c.is_isolir,
          }))
        : [],
    });
  } catch (e: any) {
    recordRateAttempt(VERIFY_RESELLER_LIMIT.bucket, rlKey, VERIFY_RESELLER_LIMIT);
    sendError(res, `Verifikasi gagal: ${e.message}`, 500);
  }
});

// GET status - dipakai Dashboard banner & IntegrationPage
router.get("/api/billing/sync/status", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  // Baik read billing_sync maupun dashboard boleh akses status (banner perlu ini)
  if (!hasPermission(req, "billing_sync") && !hasPermission(req, "dashboard")) {
    return sendError(res, "Akses ditolak", 403);
  }
  try {
    const status = await billingSyncWorker.getStatus();
    sendSuccess(res, status);
  } catch (e: any) {
    sendError(res, e.message, 500);
  }
});

/** GET /api/billing/sync/health - drift detection (customer isolir vs open collection) */
router.get("/api/billing/sync/health", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "billing_sync") && !hasPermission(req, "dashboard")) {
    return sendError(res, "Akses ditolak", 403);
  }
  try {
    const health = await storage.getSyncHealthStats();
    sendSuccess(res, health);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/billing/sync/reconcile - manual trigger reconciliation pass (admin only) */
router.post("/api/billing/sync/reconcile", billingSyncLimiter, async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "billing_sync")) return sendError(res, "Akses ditolak (write)", 403);
  recordRateAttempt(BILLING_SYNC_LIMIT.bucket, rateLimitKey(req), BILLING_SYNC_LIMIT);
  try {
    const result = await storage.reconcileCollectionState();
    await logAudit(req, "RECONCILE", "billing_sync", undefined, `${result.fixesApplied} fixes / ${result.mismatchesFound} mismatches`, result);
    sendSuccess(res, result);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/billing/sync/customer/:id/force - force resync 1 customer dari billing API */
router.post("/api/billing/sync/customer/:id/force", billingSyncLimiter, async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  recordRateAttempt(BILLING_SYNC_LIMIT.bucket, rateLimitKey(req), BILLING_SYNC_LIMIT);
  if (!hasWritePermission(req, "billing_sync") && !hasWritePermission(req, "customers")) {
    return sendError(res, "Akses ditolak (write)", 403);
  }
  try {
    const id = Number(req.params.id);
    const customer = await storage.getCustomer(id);
    if (!customer) return sendError(res, "Customer tidak ditemukan", 404);
    const result = await billingSyncWorker.forceResyncOne(customer.customerId);
    await logAudit(req, "FORCE_RESYNC", "customer", id, customer.name, result);
    sendSuccess(res, result);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/customers/:id/manual-overrides - toggle locked fields (admin/CS) */
router.post("/api/customers/:id/manual-overrides", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "customers")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const id = Number(req.params.id);
    const customer = await storage.getCustomer(id);
    if (!customer) return sendError(res, "Customer tidak ditemukan", 404);
    const lockedFields = Array.isArray(req.body?.lockedFields) ? req.body.lockedFields : [];
    // Validasi field name yang di-lock (whitelist supaya tidak bisa lock critical fields)
    const allowedToLock = ["name", "phone", "email", "address", "package", "pppoeUsername", "installDate", "district", "village", "customerType"];
    const validLocked = lockedFields.filter((f: any) => typeof f === "string" && allowedToLock.includes(f));
    await storage.updateCustomer(id, { manualOverrides: JSON.stringify(validLocked) } as any);
    await logAudit(req, "UPDATE", "customer", id, customer.name, { lockedFields: validLocked });
    sendSuccess(res, { lockedFields: validLocked });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ==================== COLLECTION PIPELINE (v4.1.2) ====================

/**
 * Collection Settings - parameter auto-trigger & auto-action
 * Stored in app_settings, configurable admin-only.
 */
router.get("/api/collections/settings", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "collections")) return sendError(res, "Akses ditolak", 403);
  try {
    sendSuccess(res, {
      enabled: (await storage.getSetting("collection_enabled")) !== "false",
      triggerDays: Number(await storage.getSetting("collection_trigger_days") ?? "3"),
      writeoffDays: Number(await storage.getSetting("collection_writeoff_days") ?? "0"),
      reminderH3Enabled: (await storage.getSetting("collection_reminder_h3_enabled")) === "true",
      reminderH3TemplateKey: (await storage.getSetting("collection_reminder_h3_template")) || "tagihan_reminder",
      lastRunAt: await storage.getSetting("collection_trigger_last_run_at"),
      lastOpenedCount: Number(await storage.getSetting("collection_trigger_last_opened") ?? "0"),
    });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.put("/api/collections/settings", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { enabled, triggerDays, writeoffDays, reminderH3Enabled, reminderH3TemplateKey } = req.body ?? {};
    if (enabled !== undefined) await storage.setSetting("collection_enabled", enabled ? "true" : "false", "collection");
    if (triggerDays !== undefined) {
      const n = Number(triggerDays);
      if (isNaN(n) || n < 0 || n > 365) return sendError(res, "triggerDays harus 0-365 hari");
      await storage.setSetting("collection_trigger_days", String(n), "collection");
    }
    if (writeoffDays !== undefined) {
      const n = Number(writeoffDays);
      if (isNaN(n) || n < 0 || n > 3650) return sendError(res, "writeoffDays harus 0-3650 (0 = disabled)");
      await storage.setSetting("collection_writeoff_days", String(n), "collection");
    }
    if (reminderH3Enabled !== undefined) await storage.setSetting("collection_reminder_h3_enabled", reminderH3Enabled ? "true" : "false", "collection");
    if (reminderH3TemplateKey !== undefined) await storage.setSetting("collection_reminder_h3_template", String(reminderH3TemplateKey).trim(), "collection");
    await logAudit(req, "UPDATE", "collection_settings", undefined, undefined, { enabled, triggerDays, writeoffDays, reminderH3Enabled });
    sendSuccess(res, { saved: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/collections/engine-mode", async (req: Request, res: Response) => {
  if (!requirePermission(req, res, "collections")) return;
  try {
    const mode = parseCollectionsMode(await storage.getMitraSetting("collections_engine_mode"));
    const pidRaw = await storage.getMitraSetting("collections_pipeline_id");
    const pipelineId = pidRaw && /^\d+$/.test(pidRaw) ? Number(pidRaw) : null;
    sendSuccess(res, { mode, pipelineId });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.put("/api/collections/engine-mode", async (req: Request, res: Response) => {
  if (!requireWritePermission(req, res, "collections")) return;
  try {
    const { mode, pipelineId } = req.body ?? {};
    if (mode !== "legacy" && mode !== "pipeline") return sendError(res, "mode harus legacy/pipeline", 400);
    if (mode === "pipeline") {
      const pid = Number(pipelineId);
      if (!Number.isInteger(pid) || pid <= 0) return sendError(res, "pipelineId wajib untuk mode pipeline", 400);
      const pipe = await storage.getPipeline(pid);
      if (!pipe) return sendError(res, "Pipeline tidak ditemukan", 404);
      await storage.setMitraSetting("collections_pipeline_id", String(pid));
    }
    await storage.setMitraSetting("collections_engine_mode", mode);
    sendSuccess(res, { ok: true, mode });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ==================== Pipelines Engine (Phase 1) ====================

async function notifyPipelineCardWatchers(cardId: number, actorId: number, title: string, message: string) {
  try {
    const card = await storage.getCard(cardId);
    if (!card) return;
    const followers = await storage.listFollowers(cardId);
    const targets = new Set<number>();
    if (card.assigneeId) targets.add(card.assigneeId);
    for (const f of followers) targets.add(f.userId);
    const secondary = await storage.listCardAssignees(cardId);
    for (const s of secondary) targets.add(s.userId);
    targets.delete(actorId);
    // Teamspace: kartu board tim mengarah ke route teamspace agar gate permission client cocok.
    const ownerTeam = await storage.getTeamByPipelineId(card.pipelineId);
    const link = ownerTeam ? `/teamspace/boards/${card.pipelineId}` : `/pipelines/${card.pipelineId}`;
    for (const uid of targets) {
      await storage.createNotification({
        userId: uid, type: "pipeline_card", title, message,
        link, entityType: "pipeline_card", entityId: cardId,
        fromUserId: actorId,
      });
    }
  } catch (e: any) {
    console.warn("[notif] pipeline_card failed:", e?.message);
  }
}

function isPipelineAdmin(req: Request): boolean {
  const au = req.authUser!;
  if (au.isSystemAdmin) return true;
  // Tenant-level admins have full control over pipelines in their own tenant
  // (pipeline queries are already mitra-scoped, so this never crosses tenants).
  if (au.roleName === "Admin" || au.roleName === "Administrator" || au.roleName === "System-Admin") return true;
  if (au.role === "admin" && !au.roleId && au.activeMitraId === 1) return true;
  return false;
}

async function getPipelineCapabilities(req: Request, pipelineId: number): Promise<Set<PipelineCapability>> {
  const isAdmin = isPipelineAdmin(req);
  const p = await storage.getPipeline(pipelineId);
  if (!p) return new Set();
  // Teamspace v5.0: pipeline milik tim → resolusi via keanggotaan tim (bukan grants pipelineAccess).
  // Isolasi dua arah: pemegang key `pipelines` yang bukan anggota tim mendapat nol caps di sini.
  if ((p as any).teamId != null) {
    const membership = await storage.getTeamMembership(Number((p as any).teamId), req.authUser!.id);
    return resolveTeamPipelineCapabilities({
      isAdmin,
      isCreator: (p as any).createdBy === req.authUser!.id,
      teamRole: membership ? parseTeamRole(membership.role) : null,
      keyLevel: (req.authUser!.permLevels["team_tasks"] ?? "none") as PermKeyLevel,
    });
  }
  const isCreator = (p as any).createdBy === req.authUser!.id;
  const restricted = (p as any).restricted === 1;
  let grantCapabilities: PipelineCapability[] = [];
  if (restricted && req.authUser!.effectiveRoleId) {
    grantCapabilities = await storage.getGrantCapabilitiesForRole(pipelineId, req.authUser!.effectiveRoleId);
  }
  return resolvePipelineCapabilities({
    isAdmin, isCreator, restricted,
    keyLevel: (req.authUser!.permLevels["pipelines"] ?? "none") as "none" | "read" | "write",
    grantCapabilities,
  });
}

/** Resolve each field's access level for the requesting user on a pipeline. */
async function fieldAccessForRequest(req: Request, pipelineId: number, fields: { id: number; config: string | null }[]): Promise<Map<number, FieldAccessLevel>> {
  const caps = await getPipelineCapabilities(req, pipelineId);
  const ctx = { isAdmin: isPipelineAdmin(req), baseEditable: caps.has("cards") };
  const roleId = req.authUser!.effectiveRoleId ?? null;
  const m = new Map<number, FieldAccessLevel>();
  for (const f of fields) m.set(f.id, resolveFieldAccess(f, roleId, ctx));
  return m;
}

async function getCardFilterForRequest(req: Request, pipelineId: number): Promise<import("../shared/fieldRules.js").FieldRuleCondition[][] | null> {
  const p = await storage.getPipeline(pipelineId);
  if (!p) return null;
  const grantFilter = req.authUser!.effectiveRoleId ? await storage.getCardFilterForRole(pipelineId, req.authUser!.effectiveRoleId) : null;
  return resolveCardFilter({
    isAdmin: isPipelineAdmin(req),
    isCreator: (p as any).createdBy === req.authUser!.id,
    restricted: (p as any).restricted === 1,
    grantFilter,
  });
}

/** Guard a single-card route by the requester's row filter. 404 (hide existence) when blocked. */
async function requireCardAccess(req: Request, res: Response, card: { id: number; pipelineId: number; stageId: number }): Promise<boolean> {
  const filter = await getCardFilterForRequest(req, card.pipelineId);
  if (!filter) return true;
  const rec = await storage.getCardValues(card.id);
  const values = new Map<number, string>(Object.entries(rec).map(([k, v]) => [Number(k), String(v)]));
  if (cardPassesFilter(filter, { values, stageId: card.stageId })) return true;
  sendError(res, "Kartu tidak ditemukan", 404);
  return false;
}

/** Guard: require a specific capability on the pipeline. */
async function requirePipelineCapability(req: Request, res: Response, pipelineId: number, cap: PipelineCapability): Promise<boolean> {
  const caps = await getPipelineCapabilities(req, pipelineId);
  if (!caps.has(cap)) { sendError(res, `Akses ditolak: butuh izin '${PIPELINE_CAPABILITY_LABELS[cap]}' pada pipeline ini`, 403); return false; }
  return true;
}

/** Guard: require >= view on the pipeline. Returns false + 403 otherwise. */
async function requirePipelineView(req: Request, res: Response, pipelineId: number): Promise<boolean> {
  const caps = await getPipelineCapabilities(req, pipelineId);
  if (caps.size === 0) { sendError(res, "Akses ditolak untuk pipeline ini", 403); return false; }
  return true;
}

/** Standard card-route guard chain on an already-loaded card:
 *  404 if the card is missing → pipeline gate ("view" → requirePipelineView, any other capability →
 *  requirePipelineCapability) → per-card row access. Returns true to proceed; otherwise the error
 *  response is already sent. Takes an already-loaded card so callers that derive it from a
 *  comment/attachment id can reuse the same chain. */
async function guardCard(req: Request, res: Response, card: PipelineCard | undefined, gate: PipelineCapability): Promise<boolean> {
  if (!card) { sendError(res, "Kartu tidak ditemukan", 404); return false; }
  const ok = gate === "view"
    ? await requirePipelineView(req, res, card.pipelineId)
    : await requirePipelineCapability(req, res, card.pipelineId, gate);
  if (!ok) return false;
  // Teamspace FR-1404: kartu "Rahasia" hanya untuk creator/assignee/follower/admin - 404 (sembunyikan keberadaan).
  if ((card as any).isPrivate === 1 && !(await canAccessPrivateCard(req, card))) {
    sendError(res, "Kartu tidak ditemukan", 404);
    return false;
  }
  return requireCardAccess(req, res, card);
}

/** Cek akses kartu Rahasia untuk requester (server-side, dipakai guard tunggal + filter list). */
async function canAccessPrivateCard(req: Request, card: PipelineCard): Promise<boolean> {
  if (isPipelineAdmin(req)) return true;
  const uid = req.authUser!.id;
  if (card.createdBy === uid || card.assigneeId === uid) return true;
  const [secondary, followers] = await Promise.all([
    storage.listCardAssignees(card.id),
    storage.listFollowers(card.id),
  ]);
  return canSeePrivateCard({
    isAdmin: false, userId: uid, createdBy: card.createdBy,
    assigneeIds: [card.assigneeId ?? -1, ...secondary.map((s) => s.userId)],
    followerIds: followers.map((f) => f.userId),
  });
}

/** Load the card named by req.params.cardId, then run guardCard. Returns the card, or null when the
 *  guard already sent an error response (so callers do `if (!card) return;`). */
async function loadGuardedCard(req: Request, res: Response, gate: PipelineCapability): Promise<PipelineCard | null> {
  const card = await storage.getCard(Number(req.params.cardId));
  return (await guardCard(req, res, card, gate)) ? (card as PipelineCard) : null;
}

async function validateConditions(pipelineId: number, conditions: any): Promise<string | null> {
  if (conditions == null) return null;
  const groups: any[] | null = Array.isArray(conditions) ? [conditions]
    : (conditions && Array.isArray(conditions.groups)) ? conditions.groups
    : null;
  if (groups == null) return "conditions harus array atau {groups:[...]}";
  const ops = new Set(["eq", "neq", "contains", "gt", "lt", "empty", "not_empty"]);
  const attrKeys = new Set(COLLECTION_ATTRS.map((a) => a.key));
  const ids = new Set((await storage.listFields(pipelineId)).map((f) => f.id));
  for (const g of groups) {
    if (!Array.isArray(g)) return "Setiap grup syarat harus array";
    for (const c of g) {
      if (!c || typeof c.op !== "string" || !ops.has(c.op)) return "Operator kondisi tidak valid";
      if (c.source === "billing") {
        if (typeof c.attr !== "string" || !attrKeys.has(c.attr)) return "Atribut billing tidak valid";
        if (c.op !== "empty" && c.op !== "not_empty" && (c.value == null || String(c.value).trim() === "")) {
          return "Nilai syarat billing wajib diisi";
        }
      } else if (c.source === "lead") {
        if (typeof c.attr !== "string" || !leadConditionAttrValid(c.attr)) return "Atribut lead tidak valid";
        if (!opValidForAttr(c.attr, c.op)) return `Operator '${c.op}' tak cocok untuk atribut lead '${c.attr}'`;
        if (c.op !== "empty" && c.op !== "not_empty" && (c.value == null || String(c.value).trim() === "")) {
          return "Nilai syarat lead wajib diisi";
        }
      } else {
        if (typeof c.fieldId !== "number" || !ids.has(c.fieldId)) return "Kondisi merujuk field yang tidak ada di pipeline ini";
      }
    }
  }
  return null;
}

const FIELD_RULE_OPS = new Set(["eq", "neq", "contains", "gt", "lt", "empty", "not_empty"]);

async function validateMetricDef(pipelineId: number, b: any): Promise<string | null> {
  if (!b || typeof b.name !== "string" || !b.name.trim()) return "Nama metric wajib diisi";
  if (!METRIC_SOURCES.some((s) => s.source === b.source)) return "Source metric tidak valid";
  if (!METRIC_AGGREGATIONS.some((a) => a.aggregation === b.aggregation)) return "Agregasi tidak valid";
  if (!METRIC_TYPES.some((t) => t.type === b.type)) return "Tipe metric tidak valid";
  const fields = await storage.listFields(pipelineId);
  const fieldIds = new Set(fields.map((f) => f.id));
  if (b.source === "field_agg" && (typeof b.fieldId !== "number" || !fieldIds.has(b.fieldId))) return "Field agregasi tidak valid";
  if (b.source === "formula") {
    if (!Array.isArray(b.terms) || b.terms.length === 0) return "Formula butuh minimal satu term";
    if (b.terms.length > FORMULA_TERM_KEYS.length) return `Maksimal ${FORMULA_TERM_KEYS.length} term`;
    const stageIdSet = new Set((await storage.listStages(pipelineId)).map((s) => s.id));
    const seen = new Set<string>();
    for (const t of b.terms) {
      if (!FORMULA_TERM_KEYS.includes(t.key)) return "Key term tidak valid";
      if (seen.has(t.key)) return "Key term duplikat";
      seen.add(t.key);
      if (t.source !== "card_count" && t.source !== "field_agg") return "Source term tidak valid";
      if (!METRIC_AGGREGATIONS.some((a) => a.aggregation === t.aggregation)) return "Agregasi term tidak valid";
      if (t.source === "field_agg" && (typeof t.fieldId !== "number" || !fieldIds.has(t.fieldId))) return "Field term tidak valid";
      if (t.stageIds != null) {
        if (!Array.isArray(t.stageIds)) return "stageIds term harus array";
        for (const sid of t.stageIds) if (!stageIdSet.has(Number(sid))) return "Stage term tidak ada di pipeline ini";
      }
      if (t.conditions != null) {
        const condErr = await validateConditions(pipelineId, t.conditions);
        if (condErr) return condErr;
      }
    }
    const fr = parseFormula(typeof b.formula === "string" ? b.formula : "", b.terms.map((t: any) => t.key));
    if (!fr.ok) return `Formula tidak valid: ${fr.error}`;
  }
  if (b.stageIds != null) {
    if (!Array.isArray(b.stageIds)) return "stageIds harus array";
    const stageIds = new Set((await storage.listStages(pipelineId)).map((s) => s.id));
    for (const sid of b.stageIds) if (!stageIds.has(Number(sid))) return "Stage yang dirujuk tidak ada di pipeline ini";
  }
  if (b.conditions != null) {
    const condErr = await validateConditions(pipelineId, b.conditions);
    if (condErr) return condErr;
  }
  if (b.timeField != null && b.timeField !== "none") {
    if (typeof b.timeField !== "string") return "timeField tidak valid";
    if (b.timeField === "created" || b.timeField === "updated") {
      // ok
    } else if (b.timeField.startsWith("field:")) {
      const fid = Number(b.timeField.slice(6));
      const dateFieldIds = new Set(fields.filter((f) => f.type === "date").map((f) => f.id));
      if (!dateFieldIds.has(fid)) return "Field tanggal untuk basis waktu tidak valid";
    } else {
      return "timeField tidak valid";
    }
  }
  if (b.timePreset != null && b.timePreset !== "") {
    if (!TIME_PRESETS.some((p) => p.preset === b.timePreset)) return "Preset waktu tidak valid";
  }
  return null;
}

/** Validate visibleWhen/requiredWhen condition groups inside a field's config JSON.
 *  fieldId conditions must reference a field of this pipeline and not the field being edited;
 *  stage conditions must reference a stage of this pipeline. Returns an error string or null. */
async function validateFieldRules(pipelineId: number, selfFieldId: number | null, config: string | null): Promise<string | null> {
  if (config != null && typeof config !== "string") return "config harus berupa string JSON";
  const { visibleWhen, requiredWhen } = parseFieldRules(config);
  if (visibleWhen.length === 0 && requiredWhen.length === 0) return null;
  const fields = await storage.listFields(pipelineId);
  const fieldIds = new Set(fields.map((f) => f.id));
  const stages = await storage.listStages(pipelineId);
  const stageIds = new Set(stages.map((s) => s.id));
  for (const groups of [visibleWhen, requiredWhen]) {
    for (const g of groups) {
      for (const c of g) {
        if (!FIELD_RULE_OPS.has(String(c.op))) return `Operator kondisi tidak valid: ${c.op}`;
        if (c.source === "stage") {
          if (c.op !== "eq" && c.op !== "neq") return "Kondisi stage hanya mendukung 'sama dengan' / 'tidak sama dengan'";
          if (!stageIds.has(Number(c.value))) return "Kondisi stage menunjuk stage yang tidak ada di pipeline ini";
        } else {
          const fid = Number(c.fieldId);
          if (!fieldIds.has(fid)) return "Kondisi field menunjuk field yang tidak ada di pipeline ini";
          if (selfFieldId != null && fid === selfFieldId) return "Field tidak boleh memakai dirinya sendiri sebagai kondisi";
        }
      }
    }
  }
  return null;
}

async function validateActionConfig(req: Request, pipelineId: number, actionType: string, cfg: any): Promise<string | null> {
  if (actionType === "set_field") {
    if (!cfg || typeof cfg.fieldId !== "number" || typeof cfg.value !== "string") return "set_field butuh actionConfig {fieldId, value}";
    const ids = new Set((await storage.listFields(pipelineId)).map((f) => f.id));
    if (!ids.has(cfg.fieldId)) return "Field tidak ada di pipeline ini";
    return null;
  }
  if (actionType === "move_stage") {
    if (!cfg || typeof cfg.stageId !== "number") return "move_stage butuh actionConfig {stageId}";
    const ids = new Set((await storage.listStages(pipelineId)).map((s) => s.id));
    if (!ids.has(cfg.stageId)) return "Stage tidak ada di pipeline ini";
    return null;
  }
  if (actionType === "assign") {
    if (!cfg || (cfg.assigneeId !== null && typeof cfg.assigneeId !== "number")) return "assign butuh actionConfig {assigneeId|null}";
    return null;
  }
  if (actionType === "notify") {
    const channels = Array.isArray(cfg?.channels) ? cfg.channels : [];
    const valid = channels.length > 0 && channels.every((c: any) => c === "bell" || c === "webhook");
    if (!valid) return "notify butuh minimal satu channel (bell/webhook)";
    if (channels.includes("bell")) {
      if (!["assignee", "user", "creator"].includes(cfg.bellTarget)) return "notify bell: target tidak valid";
      if (cfg.bellTarget === "user") {
        if (typeof cfg.bellUserId !== "number") return "notify bell: pilih user";
        // Same tenant guard as assign/follow: non-sysadmin can only notify users with pipeline access;
        // JABNET sysadmin may target cross-tenant. Prevents notifying arbitrary/foreign user ids.
        const uerr = await validateAssignTarget(req, cfg.bellUserId, pipelineId);
        if (uerr) return `notify bell: ${uerr}`;
      }
    }
    if (channels.includes("webhook")) {
      if (typeof cfg.webhookUrl !== "string" || !cfg.webhookUrl) return "notify webhook: URL wajib";
      try {
        const u = new URL(cfg.webhookUrl);
        if (u.protocol !== "http:" && u.protocol !== "https:") return "notify webhook: URL harus http/https";
      } catch { return "notify webhook: URL tidak valid"; }
    }
    return null;
  }
  return "actionType tidak dikenal";
}

// Validate field maps: each source field belongs to sourcePipelineId, each target to
// targetPipelineId, and the two share the same type. Returns an error string or null.
async function validateRuleFieldMaps(sourcePipelineId: number, targetPipelineId: number, maps: any): Promise<string | null> {
  if (maps === undefined) return null;
  if (!Array.isArray(maps)) return "fieldMaps harus array";
  if (maps.length === 0) return null;
  const srcFields = new Map((await storage.listFields(sourcePipelineId)).map((f) => [f.id, f]));
  const tgtFields = new Map((await storage.listFields(targetPipelineId)).map((f) => [f.id, f]));
  const seenSource = new Set<number>();
  for (const m of maps) {
    const sf = srcFields.get(Number(m.sourceFieldId));
    const tf = tgtFields.get(Number(m.targetFieldId));
    if (!sf) return `Field sumber ${m.sourceFieldId} tidak ada di pipeline ini`;
    if (!tf) return `Field target ${m.targetFieldId} tidak ada di pipeline target`;
    if (sf.type !== tf.type) return `Tipe field tidak cocok: "${sf.label}" (${sf.type}) → "${tf.label}" (${tf.type})`;
    // One mapping per source field (matches the unique index on (rule_id, source_field_id)).
    if (seenSource.has(sf.id)) return `Field sumber "${sf.label}" dipetakan lebih dari sekali`;
    seenSource.add(sf.id);
  }
  return null;
}

async function validateActions(req: any, pipelineId: number, actions: any): Promise<{ error: string; status: number } | null> {
  if (!Array.isArray(actions) || actions.length === 0) return { error: "Minimal satu aksi wajib", status: 400 };
  for (const a of actions) {
    const t = String(a?.actionType ?? "");
    if (t === "create_card") {
      if (!a.targetPipelineId || !a.targetStageId) return { error: "create_card: targetPipelineId & targetStageId wajib", status: 400 };
      if ((await getPipelineCapabilities(req, Number(a.targetPipelineId))).size === 0) return { error: "Tidak punya akses ke pipeline target", status: 403 };
      const mapErr = await validateRuleFieldMaps(pipelineId, Number(a.targetPipelineId), a.fieldMaps);
      if (mapErr) return { error: mapErr, status: 400 };
    } else if (t === "move_linked") {
      if (!a.targetPipelineId || !a.targetStageId) return { error: "move_linked: targetPipelineId & targetStageId wajib", status: 400 };
      if ((await getPipelineCapabilities(req, Number(a.targetPipelineId))).size === 0) return { error: "Tidak punya akses ke pipeline target", status: 403 };
    } else if (t === "set_field_linked") {
      if (!a.targetPipelineId) return { error: "set_field_linked: targetPipelineId wajib", status: 400 };
      if ((await getPipelineCapabilities(req, Number(a.targetPipelineId))).size === 0) return { error: "Tidak punya akses ke pipeline target", status: 403 };
      const mapErr = await validateRuleFieldMaps(pipelineId, Number(a.targetPipelineId), a.fieldMaps);
      if (mapErr) return { error: mapErr, status: 400 };
    } else if (t === "assign_linked") {
      if (!a.targetPipelineId) return { error: "assign_linked: targetPipelineId wajib", status: 400 };
      if ((await getPipelineCapabilities(req, Number(a.targetPipelineId))).size === 0) return { error: "Tidak punya akses ke pipeline target", status: 403 };
    } else if (t === "set_field" || t === "move_stage" || t === "assign" || t === "notify") {
      const cfgErr = await validateActionConfig(req, pipelineId, t, a.actionConfig);
      if (cfgErr) return { error: cfgErr, status: 400 };
    } else {
      return { error: `Tipe aksi tidak dikenal: ${t}`, status: 400 };
    }
  }
  return null;
}

async function validateTriggerConfig(
  pipelineId: number,
  triggerType: string,
  triggerStageId: number | null | undefined,
  triggerConfig: any,
  entryStageId?: number | null,
): Promise<string | null> {
  const stages = await storage.listStages(pipelineId);
  const stageIds = new Set(stages.map((s) => s.id));

  if (triggerType === "stage_enter") {
    if (!triggerStageId || !stageIds.has(Number(triggerStageId))) return "triggerStageId wajib & harus stage di pipeline ini";
    return null;
  }
  if (triggerType === "billing_sync") {
    if (entryStageId == null || !stageIds.has(Number(entryStageId))) return "Stage masuk wajib & harus stage di pipeline ini";
    const c = triggerConfig;
    if (!c || typeof c !== "object") return "triggerConfig wajib untuk trigger billing";
    const filter = c.filter ?? {};
    const allowed = new Set(["customerType", "status", "isIsolir", "billingStatus", "minDaysOverdue", "overdueFromAttr"]);
    for (const k of Object.keys(filter)) {
      if (!allowed.has(k)) return `filter key tidak dikenal: ${k}`;
    }
    if (filter.isIsolir != null && filter.isIsolir !== 0 && filter.isIsolir !== 1) return "filter.isIsolir harus 0/1";
    if (filter.minDaysOverdue != null && (!Number.isFinite(Number(filter.minDaysOverdue)) || Number(filter.minDaysOverdue) < 0)) return "filter.minDaysOverdue harus angka ≥ 0";
    if (filter.overdueFromAttr != null && !OVERDUE_DATE_ATTRS.some((a) => a.value === String(filter.overdueFromAttr))) return "filter.overdueFromAttr tidak valid";
    if (c.resolveStageId != null && !stageIds.has(Number(c.resolveStageId))) return "resolveStageId bukan stage pipeline ini";
    const fields = await storage.listFields(pipelineId);
    const fieldById = new Map(fields.map((f) => [f.id, f]));
    const titleAllowed = new Set(BILLING_ATTRS.filter((a) => a.key !== "coordinate").map((a) => a.key));
    if (c.titleSource != null && !titleAllowed.has(String(c.titleSource))) return "titleSource tidak valid";
    if (c.fieldMap != null) {
      if (!Array.isArray(c.fieldMap)) return "fieldMap harus array";
      for (const m of c.fieldMap) {
        const f = fieldById.get(Number(m?.targetFieldId));
        if (!f) return "fieldMap.targetFieldId tidak ditemukan di pipeline ini";
        if (!attrCompatibleWithFieldType(String(m?.attr), f.type)) return `atribut '${m?.attr}' tak cocok dengan tipe field '${f.type}'`;
      }
    }
    if (triggerStageId != null && !stageIds.has(Number(triggerStageId))) return "batasan stage tidak valid";
    return null;
  }
  if (triggerType === "card_updated" || triggerType === "assignee_changed") {
    return null;
  }
  if (triggerType === "field_updated") {
    const c = triggerConfig;
    if (c && c.fieldId != null) {
      const fields = await storage.listFields(pipelineId);
      if (!fields.some((f) => f.id === Number(c.fieldId))) return "field_updated: fieldId bukan field pipeline ini";
    }
    return null;
  }
  if (["lead_created", "lead_updated", "lead_assigned", "lead_stage_changed", "lead_converted"].includes(triggerType)) {
    const c = parseLeadTriggerConfig(typeof triggerConfig === "string" ? triggerConfig : JSON.stringify(triggerConfig ?? null));
    if (!c || c.entryStageId == null || !stageIds.has(Number(c.entryStageId))) return "Stage masuk wajib & harus stage di pipeline ini";
    if (c.reopenStageId != null && !stageIds.has(Number(c.reopenStageId))) return "reopenStageId bukan stage pipeline ini";
    const fields = await storage.listFields(pipelineId);
    const fieldById = new Map(fields.map((f) => [f.id, f]));
    const titleAllowed = new Set(LEAD_ATTRS.filter((a) => a.key !== "coordinate").map((a) => a.key));
    if (c.titleSource && c.titleSource !== "name" && !titleAllowed.has(String(c.titleSource))) return "titleSource tidak valid";
    for (const m of c.fieldMap) {
      const f = fieldById.get(Number(m.targetFieldId));
      if (!f) return "fieldMap.targetFieldId tidak ditemukan di pipeline ini";
      if (!leadAttrCompatible(String(m.attr), f.type)) return `atribut '${m.attr}' tak cocok dengan tipe field '${f.type}'`;
    }
    if (c.notify) {
      const n: any = c.notify;
      const chans = Array.isArray(n.channels) ? n.channels : [];
      if (!chans.length || chans.some((x: any) => x !== "bell" && x !== "webhook")) return "notify.channels harus subset [bell, webhook] dan non-empty";
      if (chans.includes("bell")) {
        if (n.bellTarget && !["assignee", "user", "creator"].includes(n.bellTarget)) return "notify.bellTarget tidak valid";
        if (n.bellTarget === "user" && (n.bellUserId == null || Number.isNaN(Number(n.bellUserId)))) return "notify.bellUserId wajib untuk target user";
      }
      if (chans.includes("webhook") && (typeof n.webhookUrl !== "string" || !n.webhookUrl.trim())) return "notify.webhookUrl wajib untuk channel webhook";
    }
    return null;
  }
  if (triggerType !== "time") return "triggerType tidak dikenal";

  const c = triggerConfig;
  if (!c || typeof c !== "object") return "triggerConfig wajib untuk trigger waktu";
  if (!["stage_entered", "card_created", "field_date"].includes(c.anchor)) return "anchor tidak valid";
  if (typeof c.offsetN !== "number" || !Number.isFinite(c.offsetN) || c.offsetN < 0) return "offsetN harus angka ≥ 0";
  if (c.offsetUnit !== "hours" && c.offsetUnit !== "days") return "offsetUnit harus hours/days";
  if (c.direction !== "after" && c.direction !== "before") return "direction harus after/before";
  if (c.repeat !== "once" && c.repeat !== "every") return "repeat harus once/every";
  if (c.repeat === "every" && !(Number.isFinite(c.repeatEveryN) && c.repeatEveryN > 0)) return "repeatEveryN harus > 0";
  if (c.anchor === "field_date") {
    const fields = await storage.listFields(pipelineId);
    const f = fields.find((x) => x.id === Number(c.fieldId));
    if (!f) return "fieldId untuk anchor tanggal tidak ditemukan";
    if (f.type !== "date") return "anchor field_date harus menunjuk field bertipe date";
  }
  if (triggerStageId != null && !stageIds.has(Number(triggerStageId))) return "batasan stage tidak valid";
  return null;
}

  router.get("/api/pipelines", async (req, res) => {
    if (!requirePipelinesFeature(req, res)) return;
    const includeArchived = req.query.archived === "1";
    // Teamspace: pipeline milik tim disembunyikan dari daftar ops (NFR-012) -
    // board tim diakses via /api/teamspace/* + GET /api/pipelines/:id.
    const all = (await storage.listPipelines(includeArchived)).filter((p) => (p as any).teamId == null);
    const admin = isPipelineAdmin(req);
    const grantMap = (!admin && req.authUser!.effectiveRoleId)
      ? await storage.getGrantCapabilitiesMapForRole(req.authUser!.effectiveRoleId) : {};
    const keyLevel = (req.authUser!.permLevels["pipelines"] ?? "none") as "none" | "read" | "write";
    const out: any[] = [];
    for (const p of all) {
      const caps = resolvePipelineCapabilities({
        isAdmin: admin,
        isCreator: (p as any).createdBy === req.authUser!.id,
        restricted: (p as any).restricted === 1,
        keyLevel,
        grantCapabilities: (grantMap as any)[p.id] ?? [],
      });
      if (caps.size === 0) continue;
      out.push({ ...p, level: deriveLevel([...caps]), capabilities: [...caps] });
    }
    sendSuccess(res, out);
  });

  router.post("/api/pipelines", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    const { name, description, color, icon } = req.body ?? {};
    if (!name || typeof name !== "string") return sendError(res, "Nama pipeline wajib diisi", 400);
    sendSuccess(res, await storage.createPipeline({ name, description, color, icon }, req.authUser!.id));
  });

  // NOTE: reorder must be registered BEFORE /:id routes to avoid Express capturing "reorder" as :id param
  router.post("/api/pipelines/reorder", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    // reorder is a list-level op; per-pipeline gating N/A
    const { orderedIds } = req.body ?? {};
    if (!Array.isArray(orderedIds)) return sendError(res, "orderedIds wajib array", 400);
    await storage.reorderPipelines(orderedIds.map(Number));
    sendSuccess(res, { ok: true });
  });

  router.patch("/api/pipelines/:id", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    if (!(await requirePipelineCapability(req, res, Number(req.params.id), "manage"))) return;
    const { name, description, color, icon, isArchived } = req.body ?? {};
    try {
      sendSuccess(res, await storage.updatePipeline(Number(req.params.id), { name, description, color, icon, isArchived }, req.authUser!.id));
    } catch (e: any) {
      if (String(e?.message).includes("tidak ditemukan")) return sendError(res, e.message, 404);
      throw e;
    }
  });

  router.post("/api/pipelines/:id/archive", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    if (!(await requirePipelineCapability(req, res, Number(req.params.id), "manage"))) return;
    await storage.archivePipeline(Number(req.params.id), req.authUser!.id);
    sendSuccess(res, { ok: true });
  });

  router.delete("/api/pipelines/:id", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    const pid = Number(req.params.id);
    const pipe = await storage.getPipeline(pid);
    if (!pipe) return sendError(res, "Pipeline tidak ditemukan", 404);
    // The "delete" capability gate is authoritative (admins/creators get it via the resolver;
    // a role can be explicitly granted it) - no redundant creator/sysadmin guard.
    if (!(await requirePipelineCapability(req, res, pid, "delete"))) return;
    await storage.deletePipeline(pid);
    sendSuccess(res, { ok: true });
  });

  router.get("/api/pipelines/:id/stages", async (req, res) => {
    if (!requirePipelinesFeature(req, res)) return;
    if (!(await requirePipelineView(req, res, Number(req.params.id)))) return;
    sendSuccess(res, await storage.listStages(Number(req.params.id)));
  });

  router.post("/api/pipelines/:id/stages", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    if (!(await requirePipelineCapability(req, res, Number(req.params.id), "stages"))) return;
    const { label, color, description } = req.body ?? {};
    if (!label) return sendError(res, "Label stage wajib diisi", 400);
    const desc = typeof description === "string" ? (description.trim() || null) : null;
    sendSuccess(res, await storage.createStage(Number(req.params.id), { label, color, description: desc }));
  });

  router.patch("/api/pipelines/:id/stages/:stageId", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    if (!(await requirePipelineCapability(req, res, Number(req.params.id), "stages"))) return;
    const { label, color, description } = req.body ?? {};
    const desc = description === undefined ? undefined : (typeof description === "string" ? (description.trim() || null) : null);
    try {
      sendSuccess(res, await storage.updateStage(Number(req.params.stageId), { label, color, description: desc }));
    } catch (e: any) {
      if (String(e?.message).includes("tidak ditemukan")) return sendError(res, e.message, 404);
      throw e;
    }
  });

  router.delete("/api/pipelines/:id/stages/:stageId", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    if (!(await requirePipelineCapability(req, res, Number(req.params.id), "stages"))) return;
    try {
      await storage.deleteStage(Number(req.params.stageId));
      sendSuccess(res, { ok: true });
    } catch (e: any) {
      return sendError(res, e?.message ?? "Gagal hapus stage", 409);
    }
  });

  router.post("/api/pipelines/:id/stages/reorder", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    if (!(await requirePipelineCapability(req, res, Number(req.params.id), "stages"))) return;
    const { orderedIds } = req.body ?? {};
    if (!Array.isArray(orderedIds)) return sendError(res, "orderedIds wajib array", 400);
    await storage.reorderStages(Number(req.params.id), orderedIds.map(Number));
    sendSuccess(res, { ok: true });
  });

  // -- Assignable users - literal path; MUST be before GET /api/pipelines/:id --
  router.get("/api/pipelines/assignable-users", async (req, res) => {
    if (!requirePipelinesFeature(req, res)) return;
    const allowCross = req.query.scope === "cross" && isSystemAdmin(req);
    const list = await storage.getAssignableUsers(req.authUser!.activeMitraId, allowCross);
    sendSuccess(res, list);
  });

  // -- Card routes - MUST be registered BEFORE GET /api/pipelines/:id ----------
  router.get("/api/pipelines/:id/cards", async (req, res) => {
    if (!requirePipelinesFeature(req, res)) return;
    if (!(await requirePipelineView(req, res, Number(req.params.id)))) return;
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const assigneeId = req.query.assignee ? Number(req.query.assignee) : undefined;
    const cards = await storage.listCards(Number(req.params.id), { q, assigneeId });
    const valuesByCard = await storage.getBoardCardValues(Number(req.params.id));
    const fieldsForAccess = await storage.listFields(Number(req.params.id));
    const access = await fieldAccessForRequest(req, Number(req.params.id), fieldsForAccess);
    const hidden = new Set([...access.entries()].filter(([, lvl]) => lvl === "hidden").map(([id]) => id));
    // Row-level filter: resolve once, then drop cards that don't pass the requester's card filter.
    const rowFilter = await getCardFilterForRequest(req, Number(req.params.id));
    let visibleCards = cards;
    if (rowFilter) {
      const fullValues = await storage.getAllCardValuesForPipeline(Number(req.params.id));
      visibleCards = cards.filter((c) => cardPassesFilter(rowFilter, {
        values: new Map<number, string>(Object.entries(fullValues.get(c.id) ?? {}).map(([k, v]) => [Number(k), String(v)])),
        stageId: c.stageId,
      }));
    }
    const secondaryByCard = await storage.getSecondaryAssigneesForCards(visibleCards.map((c) => c.id));
    // Teamspace FR-1404: kartu "Rahasia" disaring server-side untuk non-creator/assignee/follower.
    const boardAdmin = isPipelineAdmin(req);
    if (!boardAdmin && visibleCards.some((c) => (c as any).isPrivate === 1)) {
      const followersByCard = await storage.getFollowersForCards(visibleCards.filter((c) => (c as any).isPrivate === 1).map((c) => c.id));
      const uid = req.authUser!.id;
      visibleCards = visibleCards.filter((c) => (c as any).isPrivate !== 1 || canSeePrivateCard({
        isAdmin: false, userId: uid, createdBy: c.createdBy,
        assigneeIds: [c.assigneeId ?? -1, ...(secondaryByCard.get(c.id) ?? [])],
        followerIds: followersByCard.get(c.id) ?? [],
      }));
    }
    // Teamspace: enrich label berwarna + progres checklist (batched, anti-N+1).
    const labelsByCard = await storage.getLabelsForCards(visibleCards.map((c) => c.id));
    const checklistByCard = await storage.getChecklistProgressForCards(visibleCards.map((c) => c.id));
    sendSuccess(res, visibleCards.map((c) => {
      const extra = {
        secondaryAssigneeIds: secondaryByCard.get(c.id) ?? [],
        labels: labelsByCard.get(c.id) ?? [],
        checklistProgress: checklistByCard.get(c.id) ?? null,
      };
      const v = valuesByCard[c.id] ?? {};
      if (hidden.size === 0) return { ...c, values: v, ...extra };
      const fv: Record<number, string> = {};
      for (const [fid, val] of Object.entries(v)) if (!hidden.has(Number(fid))) fv[Number(fid)] = val as string;
      return { ...c, values: fv, ...extra };
    }));
  });

  router.post("/api/pipelines/:id/cards", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    if (!(await requirePipelineCapability(req, res, Number(req.params.id), "cards"))) return;
    const { stageId, title, description, assigneeId, priority, dueDate, tags } = req.body ?? {};
    if (!stageId || !title) return sendError(res, "stageId & title wajib diisi", 400);
    const card = await storage.createCard(Number(req.params.id), { stageId: Number(stageId), title, description, assigneeId, priority, dueDate, tags }, req.authUser!.id);
    await notifyPipelineCardWatchers(card.id, req.authUser!.id, "Kartu baru ditugaskan", `Kartu "${card.title}" dibuat`);
    await runStageEnterAutomations(card, req.authUser!.id);
    sendSuccess(res, card);
  });

  router.get("/api/pipelines/:id/cards/export", async (req, res) => {
    if (!requirePipelinesFeature(req, res)) return;
    const pid = Number(req.params.id);
    const pipeline = await storage.getPipeline(pid);
    if (!pipeline) return sendError(res, "Pipeline tidak ditemukan", 404);
    if (!(await requirePipelineCapability(req, res, pid, "export"))) return;
    const [stages, fields, cards] = await Promise.all([storage.listStages(pid), storage.listFields(pid), storage.listCards(pid)]);
    const stageLabel = new Map(stages.map((s) => [s.id, s.label]));
    const users = await storage.getAssignableUsers(req.authUser!.activeMitraId, req.authUser!.isSystemAdmin);
    const userName = new Map(users.map((u) => [u.id, u.name || u.username]));
    const exportAccess = await fieldAccessForRequest(req, pid, fields);
    const exportableFields = fields.filter((f) => (exportAccess.get(f.id) ?? "view") !== "hidden");
    const csvFields: CsvField[] = exportableFields.map((f) => ({ id: f.id, label: f.label, type: f.type, options: f.options, config: (f as any).config }));
    const cols = buildExportColumns(csvFields);
    // Row-level filter: build exportCards list (use for-loop - await inside .filter doesn't work).
    // Single batched fetch of all card values for the pipeline (anti-N+1) reused for both loops.
    const rowFilter = await getCardFilterForRequest(req, pid);
    const cachedCardValues = await storage.getAllCardValuesForPipeline(pid);
    const exportCards: typeof cards = [];
    if (rowFilter) {
      for (const c of cards) {
        const vals = cachedCardValues.get(c.id) ?? {};
        const valMap = new Map<number, string>(Object.entries(vals).map(([k, v]) => [Number(k), String(v)]));
        if (cardPassesFilter(rowFilter, { values: valMap, stageId: c.stageId })) exportCards.push(c);
      }
    } else {
      exportCards.push(...cards);
    }
    const rows = [];
    for (const c of exportCards) {
      const values = cachedCardValues.get(c.id) ?? {};
      rows.push(formatCardForExport({ title: c.title, priority: c.priority, createdAt: c.createdAt, values }, csvFields, stageLabel.get(c.stageId) ?? "", c.assigneeId != null ? (userName.get(c.assigneeId) ?? "") : ""));
    }
    const csv = toCSV(rows, cols);
    const safeName = (pipeline.name || "pipeline").replace(/[^a-zA-Z0-9-_]+/g, "_");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}-cards.csv"`);
    res.send(csv);
  });

  router.post("/api/pipelines/:id/cards/import", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    const pid = Number(req.params.id);
    const pipeline = await storage.getPipeline(pid);
    if (!pipeline) return sendError(res, "Pipeline tidak ditemukan", 404);
    if (!(await requirePipelineCapability(req, res, pid, "import"))) return;
    const rows = (req.body?.rows ?? []) as any[];
    if (!Array.isArray(rows)) return sendError(res, "rows wajib array", 400);
    if (rows.length > 2000) return sendError(res, "Maksimal 2000 baris per import", 400);

    const stages = await storage.listStages(pid);
    const fields = await storage.listFields(pid);
    const users = await storage.getAssignableUsers(req.authUser!.activeMitraId, req.authUser!.isSystemAdmin);
    // Field-level permissions: only edit-accessible fields can be written via import (others ignored).
    const importAccess = await fieldAccessForRequest(req, pid, fields);
    const editableFields = fields.filter((f) => (importAccess.get(f.id) ?? "view") === "edit");
    const ctx = {
      stageByLabel: new Map(stages.map((s) => [s.label.toLowerCase(), s.id])),
      userByName: new Map<string, number>(),
      fieldsById: new Map<number, CsvField>(editableFields.map((f) => [f.id, { id: f.id, label: f.label, type: f.type, options: f.options, config: (f as any).config }])),
      firstStageId: stages[0]?.id ?? 0,
    };
    for (const u of users) { if (u.name) ctx.userByName.set(u.name.toLowerCase(), u.id); ctx.userByName.set(u.username.toLowerCase(), u.id); }
    if (!ctx.firstStageId) return sendError(res, "Pipeline belum punya stage", 400);

    const validate = (field: CsvField, value: string): string | null => {
      let opts: string[] | undefined;
      if (field.options) { try { opts = JSON.parse(field.options) as string[]; } catch { opts = undefined; } }
      const r = validateFieldValue(field.type, value, opts, { multiple: isMultiUser(field as any) });
      return r.ok ? null : (r.error ?? "tidak valid");
    };

    let created = 0; const errors: { index: number; reason: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const resolved = resolveImportRow(rows[i], ctx, validate);
      if (!resolved.ok) { errors.push({ index: i, reason: resolved.error }); continue; }
      try {
        const card = await storage.createCard(pid, { stageId: resolved.draft.stageId, title: resolved.draft.title, assigneeId: resolved.draft.assigneeId, priority: resolved.draft.priority }, req.authUser!.id);
        if (resolved.draft.values.length) await storage.setCardValues(card.id, resolved.draft.values);
        created++;
      } catch (e: any) {
        errors.push({ index: i, reason: e?.message ?? "gagal membuat kartu" });
      }
    }
    sendSuccess(res, { created, skipped: errors.length, errors });
  });

  router.get("/api/pipelines/cards/:cardId", async (req, res) => {
    if (!requirePipelinesFeature(req, res)) return;
    const card = await loadGuardedCard(req, res, "view");
    if (!card) return;
    const [comments, activity, followers, fields, values] = await Promise.all([
      storage.listComments(card.id), storage.listActivity(card.id), storage.listFollowers(card.id),
      storage.listFields(card.pipelineId), storage.getCardValues(card.id),
    ]);
    const access = await fieldAccessForRequest(req, card.pipelineId, fields);
    const visibleValues: Record<number, string> = {};
    const fieldAccess: Record<number, FieldAccessLevel> = {};
    for (const f of fields) {
      const lvl = access.get(f.id) ?? "view";
      if (lvl === "hidden") continue;
      fieldAccess[f.id] = lvl;
      if (values[f.id] !== undefined) visibleValues[f.id] = values[f.id];
    }
    const attByComment = await storage.getAttachmentsByCardGrouped(card.id);
    const userList = await storage.getAssignableUsers(req.authUser!.activeMitraId, false);
    const nameById = new Map(userList.map((u) => [u.id, u.name || u.username]));
    const commentsOut = comments.map((c) => ({
      ...c,
      authorName: nameById.get(c.authorId) ?? "Pengguna",
      attachments: attByComment.get(c.id) ?? [],
    }));
    sendSuccess(res, { ...card, comments: commentsOut, activity, followers, fields, values: visibleValues, fieldAccess });
  });

  router.patch("/api/pipelines/cards/:cardId", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    const bodyKeys = Object.keys(req.body ?? {});
    const onlyAssignee = bodyKeys.length > 0 && bodyKeys.every((k) => k === "assigneeId");
    const neededCap: PipelineCapability = onlyAssignee ? "assign" : "cards";
    const cardForGuard = await loadGuardedCard(req, res, neededCap);
    if (!cardForGuard) return;
    if (req.body && req.body.assigneeId != null) {
      const aerr = await validateAssignTarget(req, Number(req.body.assigneeId), cardForGuard.pipelineId);
      if (aerr) return sendError(res, aerr, 400);
    }
    try {
      const card = await storage.updateCard(Number(req.params.cardId), req.body ?? {}, req.authUser!.id);
      await notifyPipelineCardWatchers(card.id, req.authUser!.id, "Kartu diperbarui", `Kartu "${card.title}" diperbarui`);
      await dispatchCardEvent("card_updated", card, req.authUser!.id);
      if (cardForGuard.assigneeId !== card.assigneeId) {
        await dispatchCardEvent("assignee_changed", card, req.authUser!.id);
      }
      sendSuccess(res, card);
    } catch (e: any) {
      if (String(e?.message).includes("tidak ditemukan")) return sendError(res, e.message, 404);
      throw e;
    }
  });

  router.post("/api/pipelines/cards/:cardId/move", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    const cardForGuard = await loadGuardedCard(req, res, "cards");
    if (!cardForGuard) return;
    const { toStageId, toPosition } = req.body ?? {};
    if (!toStageId) return sendError(res, "toStageId wajib diisi", 400);
    // Target stage must belong to this card's pipeline (mirrors the bulk-move guard).
    // Without this, a caller could point their card at an arbitrary/cross-pipeline stage id,
    // corrupting the card and firing stage-enter automations against a stage the pipeline doesn't own.
    const moveStages = await storage.listStages(cardForGuard.pipelineId);
    if (!moveStages.some((s) => s.id === Number(toStageId))) return sendError(res, "Stage tujuan tidak valid untuk pipeline ini", 400);
    // Teamspace FR-403: move permission per list - enforce pada stage asal DAN tujuan.
    const fromStageRow = moveStages.find((s) => s.id === cardForGuard.stageId);
    const toStageRow = moveStages.find((s) => s.id === Number(toStageId));
    const mpFrom = parseMovePermission((fromStageRow as any)?.movePermission);
    const mpTo = parseMovePermission((toStageRow as any)?.movePermission);
    if (mpFrom || mpTo) {
      const movePipe = await storage.getPipeline(cardForGuard.pipelineId);
      let isTeamManager = false;
      if (movePipe && (movePipe as any).teamId != null) {
        const membership = await storage.getTeamMembership(Number((movePipe as any).teamId), req.authUser!.id);
        isTeamManager = membership?.role === "manager";
      }
      const moveArgs = { isAdmin: isPipelineAdmin(req), isManager: isTeamManager, userId: req.authUser!.id, roleId: req.authUser!.effectiveRoleId ?? null };
      if (!canMoveWithStage({ movePermission: mpFrom, ...moveArgs }) || !canMoveWithStage({ movePermission: mpTo, ...moveArgs })) {
        return sendError(res, "Anda tidak diizinkan memindahkan kartu pada list ini", 403);
      }
    }
    try {
      const card = await storage.moveCard(Number(req.params.cardId), Number(toStageId), toPosition === undefined ? undefined : Number(toPosition), req.authUser!.id);
      await notifyPipelineCardWatchers(card.id, req.authUser!.id, "Kartu dipindahkan", `Kartu "${card.title}" dipindahkan`);
      if (cardForGuard.stageId !== card.stageId) {
        await storage.clearReentryFires(card.id, cardForGuard.stageId, card.pipelineId);
        await runStageEnterAutomations(card, req.authUser!.id);
      }
      sendSuccess(res, card);
    } catch (e: any) {
      if (String(e?.message).includes("tidak ditemukan")) return sendError(res, e.message, 404);
      throw e;
    }
  });

  router.post("/api/pipelines/cards/:cardId/retrigger", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    const card = await loadGuardedCard(req, res, "cards");
    if (!card) return;
    await storage.clearStageFires(card.id, card.stageId, card.pipelineId);
    await runStageEnterAutomations(card, req.authUser!.id);
    sendSuccess(res, { retriggered: true });
  });

  router.delete("/api/pipelines/cards/:cardId", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    const card = await loadGuardedCard(req, res, "cards");
    if (!card) return;
    await storage.deleteCard(Number(req.params.cardId));
    sendSuccess(res, { ok: true });
  });

  // -- Bulk card actions --
  router.post("/api/pipelines/:id/cards/bulk", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    const pid = Number(req.params.id);
    if (!(await requirePipelineView(req, res, pid))) return;
    const { op, cardIds, payload, runAutomation, overwrite } = req.body ?? {};
    const v = validateBulkRequest(op, cardIds, payload);
    if (!v.ok) return sendError(res, v.error, 400);

    // Capability for the op (same as each op's single-card endpoint): assign→"assign", rest→"cards".
    const caps = await getPipelineCapabilities(req, pid);
    const neededCap = op === "assign" ? "assign" : "cards";
    if (!caps.has(neededCap as any) && !isPipelineAdmin(req)) {
      return sendError(res, `Akses ditolak: butuh kapabilitas '${neededCap}'`, 403);
    }

    // set_field: one field for all cards - validate field + edit-access + value once up front.
    let field: any = null;
    let fieldOpts: string[] | undefined;
    let fieldMultiple = false;
    if (op === "set_field") {
      const fields = await storage.listFields(pid);
      field = fields.find((f) => f.id === Number(payload.fieldId));
      if (!field) return sendError(res, "Field tidak ditemukan", 400);
      const access = await fieldAccessForRequest(req, pid, fields);
      if (access.get(field.id) !== "edit" && !isPipelineAdmin(req)) {
        return sendError(res, "Tidak boleh mengedit field ini", 403);
      }
      fieldOpts = field.options ? JSON.parse(field.options) : undefined;
      fieldMultiple = field.config ? !!JSON.parse(field.config)?.multiple : false;
      const vv = validateFieldValue(field.type, String(payload.value ?? ""), fieldOpts, { multiple: fieldMultiple });
      if (!vv.ok) return sendError(res, vv.error, 400);
    }

    // Row-level filter resolved once; fetch all values once if filtering is active.
    const rowFilter = await getCardFilterForRequest(req, pid);
    const allValues = rowFilter ? await storage.getAllCardValuesForPipeline(pid) : null;

    const actor = req.authUser!.id;
    const failed: { cardId: number; reason: string }[] = [];
    let succeeded = 0;

    for (const id of cardIds as number[]) {
      try {
        const card = await storage.getCard(id);
        if (!card || card.pipelineId !== pid) { failed.push({ cardId: id, reason: "tidak ditemukan" }); continue; }
        if (rowFilter) {
          const vals = new Map<number, string>(Object.entries(allValues!.get(id) ?? {}).map(([k, val]) => [Number(k), String(val)]));
          if (!cardPassesFilter(rowFilter, { values: vals, stageId: card.stageId })) {
            failed.push({ cardId: id, reason: "tidak ditemukan" }); continue;
          }
        }

        let updated = card;
        if (op === "assign") {
          updated = await storage.updateCard(id, { assigneeId: payload.assigneeId ?? null }, actor);
        } else if (op === "move") {
          if (card.stageId === Number(payload.stageId)) { succeeded++; continue; } // no-op
          const stages = await storage.listStages(pid);
          if (!stages.some((s) => s.id === Number(payload.stageId))) { failed.push({ cardId: id, reason: "stage tidak valid" }); continue; }
          updated = await storage.moveCard(id, Number(payload.stageId), undefined, actor);
        } else if (op === "set_field") {
          if (overwrite === false) {
            const cur = await storage.getCardValues(id);
            if (cur[field.id] != null && String(cur[field.id]).trim() !== "") { failed.push({ cardId: id, reason: "sudah terisi" }); continue; }
          }
          await storage.setCardValues(id, [{ fieldId: field.id, value: String(payload.value ?? "") }]);
          await storage.recordCardActivity(id, actor, "edited", { fieldId: field.id });
        } else if (op === "add_tag" || op === "remove_tag") {
          const tags = applyTagChange(parseTags(card.tags), op as "add_tag" | "remove_tag", String(payload.tag));
          updated = await storage.updateCard(id, { tags }, actor);
        } else if (op === "delete") {
          await storage.deleteCard(id);
          succeeded++; continue;
        }

        if (runAutomation) {
          // Mutation already committed - an automation error must NOT flip this card to failed.
          try {
            if (op === "move") await runStageEnterAutomations(updated, actor);
            else if (op === "assign") await dispatchCardEvent("assignee_changed", updated, actor);
            else if (op === "set_field") await dispatchCardEvent("field_updated", updated, actor, { changedFieldIds: [field.id] });
          } catch (autoErr: any) {
            console.warn(`[bulk] card ${id}: automation after ${op} failed: ${autoErr?.message}`);
          }
        }
        succeeded++;
      } catch (e: any) {
        failed.push({ cardId: id, reason: e?.message || "gagal" });
      }
    }

    sendSuccess(res, { processed: (cardIds as number[]).length, succeeded, failed });
  });

  // -- Card relations (Phase 1) --
  router.get("/api/pipelines/cards/:cardId/relations", async (req, res) => {
    if (!requirePipelinesFeature(req, res)) return;
    const card = await loadGuardedCard(req, res, "view");
    if (!card) return;

    const explicit = await storage.listCardRelations(card.id);
    const toResolve: { entityType: string; entityId: number }[] = explicit.map((r) => ({ entityType: r.entityType, entityId: r.entityId }));
    const srcCustomerId = (card as any).sourceCustomerId as number | null;
    const hasExplicitCustomer = explicit.some((r) => r.entityType === "customer" && r.entityId === srcCustomerId);
    if (srcCustomerId != null && !hasExplicitCustomer) toResolve.push({ entityType: "customer", entityId: srcCustomerId });

    const labels = await storage.resolveRelationLabels(toResolve);
    const k = (t: string, id: number) => `${t}:${id}`;
    const items: any[] = explicit.map((r) => {
      const meta = labels.get(k(r.entityType, r.entityId));
      return {
        id: r.id, entityType: r.entityType, entityId: r.entityId, label: r.label,
        entityLabel: meta?.label ?? `${r.entityType} #${r.entityId} (dihapus)`,
        entitySubtitle: meta?.subtitle ?? null, pipelineId: meta?.pipelineId ?? null, implicit: false,
      };
    });
    if (srcCustomerId != null && !hasExplicitCustomer) {
      const meta = labels.get(k("customer", srcCustomerId));
      items.unshift({
        id: null, entityType: "customer", entityId: srcCustomerId, label: "dari billing",
        entityLabel: meta?.label ?? `Pelanggan #${srcCustomerId}`, entitySubtitle: meta?.subtitle ?? null,
        pipelineId: null, implicit: true,
      });
    }
    sendSuccess(res, items);
  });

  router.post("/api/pipelines/cards/:cardId/relations", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    const card = await loadGuardedCard(req, res, "cards");
    if (!card) return;
    const { entityType, entityId, label } = req.body ?? {};
    if (!isValidEntityType(String(entityType))) return sendError(res, "entityType tidak valid", 400);
    const eid = Number(entityId);
    if (!Number.isInteger(eid) || eid <= 0) return sendError(res, "entityId tidak valid", 400);
    if (!(await storage.entityExistsInMitra(String(entityType), eid))) return sendError(res, "Entity tidak ditemukan di tenant ini", 404);
    const lbl = typeof label === "string" ? (label.trim() || null) : null;
    try {
      const row = await storage.addCardRelation(card.id, { entityType: String(entityType), entityId: eid, label: lbl }, req.authUser!.id);
      sendSuccess(res, row);
    } catch (e: any) {
      if (String(e?.message).match(/duplicate|UNIQUE/i)) return sendError(res, "Relasi sudah ada", 409);
      throw e;
    }
  });

  router.delete("/api/pipelines/cards/:cardId/relations/:relationId", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    const card = await loadGuardedCard(req, res, "cards");
    if (!card) return;
    const n = await storage.deleteCardRelation(card.id, Number(req.params.relationId));
    if (n === 0) return sendError(res, "Relasi tidak ditemukan", 404);
    sendSuccess(res, { ok: true });
  });

  // -- Lead-link endpoints ------------------------------------------------------

  router.get("/api/pipelines/cards/:cardId/lead-link", async (req, res) => {
    const card = await loadGuardedCard(req, res, "view");
    if (!card) return;
    const link = await storage.getLeadCardLinkByCard(card.id);
    return sendSuccess(res, { link: link ? { leadId: link.leadId, cardId: link.cardId } : null });
  });

  router.post("/api/pipelines/cards/:cardId/create-lead", async (req, res) => {
    const card = await loadGuardedCard(req, res, "cards");
    if (!card) return;
    const b = req.body ?? {};
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (!name) return sendError(res, "Nama wajib diisi", 400);
    if (b.lat != null && Number.isNaN(Number(b.lat))) return sendError(res, "lat tidak valid", 400);
    if (b.lng != null && Number.isNaN(Number(b.lng))) return sendError(res, "lng tidak valid", 400);

    const existing = await storage.getLeadCardLinkByCard(card.id);
    if (existing) return sendError(res, "Kartu ini sudah tertaut ke lead", 409);

    const actor = req.authUser!.id;
    const now = new Date().toISOString();
    const lead = await storage.createLead({
      name,
      phone: typeof b.phone === "string" && b.phone.trim() ? b.phone.trim() : null,
      address: typeof b.address === "string" && b.address.trim() ? b.address.trim() : null,
      category: typeof b.category === "string" && b.category.trim() ? b.category.trim() : null,
      district: typeof b.district === "string" && b.district.trim() ? b.district.trim() : null,
      village: typeof b.village === "string" && b.village.trim() ? b.village.trim() : null,
      lat: b.lat != null ? Number(b.lat) : null,
      lng: b.lng != null ? Number(b.lng) : null,
      source: "pipeline",
      stage: "new",
      priority: "medium",
      createdBy: actor,
      assignedTo: actor,
      assignedBy: actor,
      assignedAt: now,
      createdAt: now,
    } as any);

    await storage.createLeadCardLink({ leadId: lead.id, cardId: card.id, ruleId: null });
    await logAudit(req, "CREATE", "lead", lead.id, lead.name, { fromCardId: card.id });
    // NOTE: intentionally NO emitLeadEvent - the card already exists and is now linked (anti-loop).
    return sendSuccess(res, { lead, link: { leadId: lead.id, cardId: card.id } }, 201);
  });

  router.get("/api/pipelines/relations/search", async (req, res) => {
    if (!requirePipelinesFeature(req, res)) return;
    const type = String(req.query.type ?? "");
    if (!isValidEntityType(type)) return sendError(res, "type tidak valid", 400);
    const q = String(req.query.q ?? "").trim();
    if (q.length < 1) return sendSuccess(res, []);
    const results = await storage.searchRelatableEntities(type, q);
    if (type !== "card") return sendSuccess(res, results);
    // For card results, exclude cards the requester can't access via their row filter.
    // Cap is ~20 results so per-card fetch is fine. Cache filters per pipelineId.
    const filterCache = new Map<number, import("../shared/fieldRules.js").FieldRuleCondition[][] | null>();
    const visible: typeof results = [];
    for (const r of results) {
      const pid = (r as any).pipelineId as number | undefined;
      if (!pid) continue; // no pipelineId → conservatively exclude
      if (!filterCache.has(pid)) filterCache.set(pid, await getCardFilterForRequest(req, pid));
      const filter = filterCache.get(pid)!;
      if (!filter) { visible.push(r); continue; }
      const cardRow = await storage.getCard(r.id);
      if (!cardRow) continue; // card disappeared
      const vals = await storage.getCardValues(r.id);
      const valMap = new Map<number, string>(Object.entries(vals).map(([k, v]) => [Number(k), String(v)]));
      if (cardPassesFilter(filter, { values: valMap, stageId: cardRow.stageId })) visible.push(r);
    }
    sendSuccess(res, visible);
  });

  router.get("/api/pipelines/cards/:cardId/comments", async (req, res) => {
    if (!requirePipelinesFeature(req, res)) return;
    const card = await loadGuardedCard(req, res, "view");
    if (!card) return;
    sendSuccess(res, await storage.listComments(card.id));
  });

  router.post("/api/pipelines/cards/:cardId/comments", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    const card = await loadGuardedCard(req, res, "comment");
    if (!card) return;
    let parsed;
    try {
      parsed = await parseMultipart(req, { maxBytes: ATTACHMENT_MAX_BYTES, maxFiles: 10, maxTotalBytes: 60 * 1024 * 1024 });
    } catch (e: any) {
      return sendError(res, e?.message || "Upload gagal", 413);
    }
    const body = (parsed.fields.body ?? "").trim();
    const type = parsed.fields.type ?? "note";
    if (!body && parsed.files.length === 0) return sendError(res, "Komentar atau lampiran wajib diisi", 400);
    const comment = await storage.addComment(card.id, req.authUser!.id, body || "(lampiran)", type);
    if (parsed.files.length) {
      const slug = await storage.getMitraSlug(req.authUser!.activeMitraId);
      for (const f of parsed.files) {
        try {
          await saveOneAttachment({
            slug, cardId: card.id, pipelineId: card.pipelineId, commentId: comment.id,
            file: { fileName: f.fileName, buffer: f.buffer }, uploadedBy: req.authUser!.id,
          });
        } catch (e: any) {
          return sendError(res, e?.message || "Upload gagal", 400);
        }
      }
    }
    await notifyPipelineCardWatchers(card.id, req.authUser!.id, "Komentar baru", (body || "lampiran").slice(0, 80));
    sendSuccess(res, comment);
  });

  router.delete("/api/pipelines/cards/comments/:id", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    const cardId = await storage.getCommentCardId(Number(req.params.id));
    if (cardId === null) return sendError(res, "Komentar tidak ditemukan", 404);
    const card = await storage.getCard(cardId);
    if (!(await guardCard(req, res, card, "comment"))) return;
    const paths = await storage.deleteCommentAttachments(Number(req.params.id));
    for (const p of paths) await deletePhoto(p);
    await storage.deleteComment(Number(req.params.id));
    sendSuccess(res, { ok: true });
  });

  router.get("/api/pipelines/cards/comments/:id/photo", async (req, res) => {
    if (!requirePipelinesFeature(req, res)) return;
    const meta = await storage.getCommentPhotoMeta(Number(req.params.id));
    if (!meta || !meta.photoPath) return sendError(res, "Foto tidak ditemukan", 404);
    const card = await storage.getCard(meta.cardId);
    if (!(await guardCard(req, res, card, "view"))) return;
    await streamPhoto(meta.photoPath, res);
  });

/** Validate + persist one uploaded file as a card attachment row. Shared by the
 *  generic attachments endpoint (commentId=null) and the comment endpoint. Returns
 *  the created row, or throws an Error whose message is safe to surface (400). */
async function saveOneAttachment(opts: {
  slug: string; cardId: number; pipelineId: number; commentId: number | null;
  file: { fileName: string; buffer: Buffer }; uploadedBy: number;
}): Promise<PipelineCardAttachment> {
  const v = validateAttachment(opts.file.fileName, opts.file.buffer.length);
  if (!v.ok) throw new Error(`${opts.file.fileName}: ${v.error}`);
  const relPath = await saveUploadedFile(opts.slug, opts.cardId, opts.file.buffer, v.ext);
  return storage.addCardAttachment({
    cardId: opts.cardId, commentId: opts.commentId, pipelineId: opts.pipelineId,
    fileName: opts.file.fileName, filePath: relPath, mimeType: v.mime,
    sizeBytes: opts.file.buffer.length, kind: v.kind, uploadedBy: opts.uploadedBy,
  });
}

  // -- Card attachments ------------------------------------------------------
  router.post("/api/pipelines/cards/:cardId/attachments", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    const card = await loadGuardedCard(req, res, "cards");
    if (!card) return;
    let parsed;
    try {
      parsed = await parseMultipart(req, { maxBytes: ATTACHMENT_MAX_BYTES, maxFiles: 10, maxTotalBytes: 60 * 1024 * 1024 });
    } catch (e: any) {
      return sendError(res, e?.message || "Upload gagal", 413);
    }
    if (!parsed.files.length) return sendError(res, "Tidak ada file", 400);
    const slug = await storage.getMitraSlug(req.authUser!.activeMitraId);
    const created = [];
    for (const f of parsed.files) {
      try {
        created.push(await saveOneAttachment({
          slug, cardId: card.id, pipelineId: card.pipelineId, commentId: null,
          file: { fileName: f.fileName, buffer: f.buffer }, uploadedBy: req.authUser!.id,
        }));
      } catch (e: any) {
        return sendError(res, e?.message || "Upload gagal", 400);
      }
    }
    sendSuccess(res, created, 201);
  });

  router.get("/api/pipelines/cards/:cardId/attachments", async (req, res) => {
    if (!requirePipelinesFeature(req, res)) return;
    const card = await loadGuardedCard(req, res, "view");
    if (!card) return;
    sendSuccess(res, await storage.listCardAttachments(card.id));
  });

  router.get("/api/pipelines/attachments/:id/raw", async (req, res) => {
    if (!requirePipelinesFeature(req, res)) return;
    const att = await storage.getCardAttachment(Number(req.params.id));
    if (!att) return sendError(res, "File tidak ditemukan", 404);
    const card = await storage.getCard(att.cardId);
    if (!(await guardCard(req, res, card, "view"))) return;
    await streamFile(att.filePath, res, { download: req.query.download === "1", fileName: att.fileName });
  });

  router.delete("/api/pipelines/attachments/:id", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    const att = await storage.getCardAttachment(Number(req.params.id));
    if (!att) return sendError(res, "File tidak ditemukan", 404);
    const card = await storage.getCard(att.cardId);
    if (!card) return sendError(res, "Kartu tidak ditemukan", 404);
    if (!(await requireCardAccess(req, res, card))) return;
    // Delete only by the uploader OR a pipeline admin. isPipelineAdmin already covers
    // the admin/manage case; do NOT call requirePipelineCapability here (it writes its
    // own error response, which would double-send).
    if (att.uploadedBy !== req.authUser!.id && !isPipelineAdmin(req)) {
      return sendError(res, "Hanya pengunggah atau admin pipeline yang boleh menghapus", 403);
    }
    await deletePhoto(att.filePath);
    await storage.deleteCardAttachment(att.id, req.authUser!.id);
    sendSuccess(res, { deleted: true });
  });

  router.get("/api/pipelines/cards/:cardId/followers", async (req, res) => {
    if (!requirePipelinesFeature(req, res)) return;
    const card = await loadGuardedCard(req, res, "view");
    if (!card) return;
    sendSuccess(res, await storage.listFollowers(card.id));
  });

  router.get("/api/pipelines/cards/:cardId/related", async (req, res) => {
    if (!requirePipelinesFeature(req, res)) return;
    const card = await loadGuardedCard(req, res, "view");
    if (!card) return;
    sendSuccess(res, await storage.getRelatedCards(card.id));
  });

  router.post("/api/pipelines/cards/:cardId/followers", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    const card = await loadGuardedCard(req, res, "cards");
    if (!card) return;
    const { userId } = req.body ?? {};
    if (!userId) return sendError(res, "userId wajib diisi", 400);
    // Same tenant guard as assignees: non-sysadmin can only follow users with pipeline access;
    // JABNET sysadmin may add cross-tenant (record-only - being a follower grants no read access).
    const ferr = await validateAssignTarget(req, Number(userId), card.pipelineId);
    if (ferr) return sendError(res, ferr, 400);
    await storage.addFollower(card.id, Number(userId), req.authUser!.id);
    sendSuccess(res, { ok: true });
  });

  router.delete("/api/pipelines/cards/:cardId/followers/:userId", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    const card = await loadGuardedCard(req, res, "cards");
    if (!card) return;
    await storage.removeFollower(card.id, Number(req.params.userId), req.authUser!.id);
    sendSuccess(res, { ok: true });
  });

  router.get("/api/pipelines/cards/:cardId/assignees", async (req, res) => {
    if (!requirePipelinesFeature(req, res)) return;
    const card = await loadGuardedCard(req, res, "view");
    if (!card) return;
    sendSuccess(res, await storage.listCardAssignees(card.id));
  });

  router.post("/api/pipelines/cards/:cardId/assignees", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    const card = await loadGuardedCard(req, res, "cards");
    if (!card) return;
    const { userId } = req.body ?? {};
    if (!userId) return sendError(res, "userId wajib diisi", 400);
    const aerr = await validateAssignTarget(req, Number(userId), card.pipelineId);
    if (aerr) return sendError(res, aerr, 400);
    await storage.addCardAssignee(card.id, Number(userId), req.authUser!.id);
    if (Number(userId) !== req.authUser!.id) {
      const assigneeTeam = await storage.getTeamByPipelineId(card.pipelineId);
      await storage.createNotification({
        userId: Number(userId), type: "pipeline_card",
        title: "Ditugaskan ke kartu", message: `Anda ditambahkan sebagai penanggung jawab "${card.title}"`,
        link: assigneeTeam ? `/teamspace/boards/${card.pipelineId}` : `/pipelines/${card.pipelineId}`,
        entityType: "pipeline_card", entityId: card.id, fromUserId: req.authUser!.id,
      });
    }
    sendSuccess(res, { ok: true });
  });

  router.delete("/api/pipelines/cards/:cardId/assignees/:userId", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    const card = await loadGuardedCard(req, res, "cards");
    if (!card) return;
    await storage.removeCardAssignee(card.id, Number(req.params.userId), req.authUser!.id);
    sendSuccess(res, { ok: true });
  });

  // -- Field routes - registered BEFORE GET /:id to avoid :id swallowing "fields" --
  router.get("/api/pipelines/:id/fields", async (req, res) => {
    if (!requirePipelinesFeature(req, res)) return;
    if (!(await requirePipelineView(req, res, Number(req.params.id)))) return;
    sendSuccess(res, await storage.listFields(Number(req.params.id)));
  });

  router.post("/api/pipelines/:id/fields", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    if (!(await requirePipelineCapability(req, res, Number(req.params.id), "fields"))) return;
    const { label, type, options, required, showOnCard, config } = req.body ?? {};
    if (!label || !type) return sendError(res, "label & type wajib diisi", 400);
    const meta = getFieldTypeMeta(String(type));
    if (!meta) return sendError(res, "Tipe field tidak dikenal", 400);
    const existing = await storage.listFields(Number(req.params.id));
    if (!canAddType(existing, String(type))) {
      return sendError(res, `Tipe ${meta.label} hanya boleh 1 per pipeline`, 400);
    }
    const configErr = await validateFieldRules(Number(req.params.id), null, config ?? null);
    if (configErr) return sendError(res, configErr, 400);
    sendSuccess(res, await storage.createField(Number(req.params.id), { label, type, options, required, showOnCard, config }));
  });

  router.patch("/api/pipelines/:id/fields/:fieldId", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    if (!(await requirePipelineCapability(req, res, Number(req.params.id), "fields"))) return;
    const { label, options, required, showOnCard, config } = req.body ?? {};
    if (config !== undefined) {
      const configErr = await validateFieldRules(Number(req.params.id), Number(req.params.fieldId), config);
      if (configErr) return sendError(res, configErr, 400);
    }
    try {
      sendSuccess(res, await storage.updateField(Number(req.params.fieldId), { label, options, required, showOnCard, config: config !== undefined ? config : undefined }));
    } catch (e: any) {
      if (String(e?.message).includes("tidak ditemukan")) return sendError(res, e.message, 404);
      throw e;
    }
  });

  router.delete("/api/pipelines/:id/fields/:fieldId", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    if (!(await requirePipelineCapability(req, res, Number(req.params.id), "fields"))) return;
    await storage.deleteField(Number(req.params.fieldId));
    sendSuccess(res, { ok: true });
  });

  router.post("/api/pipelines/:id/fields/reorder", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    if (!(await requirePipelineCapability(req, res, Number(req.params.id), "fields"))) return;
    const { orderedIds } = req.body ?? {};
    if (!Array.isArray(orderedIds)) return sendError(res, "orderedIds wajib array", 400);
    await storage.reorderFields(Number(req.params.id), orderedIds.map(Number));
    sendSuccess(res, { ok: true });
  });

  router.put("/api/pipelines/cards/:cardId/values", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    const cardId = Number(req.params.cardId);
    const { values } = req.body ?? {};
    if (!Array.isArray(values)) return sendError(res, "values wajib array", 400);
    const card = await loadGuardedCard(req, res, "cards");
    if (!card) return;
    const fields = await storage.listFields(card.pipelineId);
    const byId = new Map(fields.map((f) => [f.id, f]));
    for (const v of values) {
      const f = byId.get(Number(v.fieldId));
      if (!f) return sendError(res, `Field ${v.fieldId} tidak ada di pipeline ini`, 400);
      const opts = f.options ? (JSON.parse(f.options) as string[]) : undefined;
      const check = validateFieldValue(f.type, String(v.value ?? ""), opts, { multiple: isMultiUser(f) });
      if (!check.ok) return sendError(res, `${f.label}: ${check.error}`, 400);
    }
    const accessMap = await fieldAccessForRequest(req, card.pipelineId, fields);
    // Conditional-required enforcement: only fields that opt in via a requiredWhen rule block save.
    // Skip fields this role can't edit (view/hidden) - can't require what the user can't fill.
    const existingVals = await storage.getCardValues(cardId);
    const effective = new Map<number, string>(Object.entries(existingVals).map(([k, v]) => [Number(k), String(v)]));
    for (const v of values) effective.set(Number(v.fieldId), String(v.value ?? ""));
    const ruleCtx = { values: effective, stageId: card.stageId };
    for (const f of fields) {
      if ((accessMap.get(f.id) ?? "view") !== "edit") continue; // not editable by this role → not enforced
      if (!hasRequiredWhen(f)) continue;              // static-required stays soft (legacy)
      if (!isFieldRequired(f, ruleCtx)) continue;     // also false when hidden by visibleWhen
      if ((effective.get(f.id) ?? "").trim() === "") return sendError(res, `${f.label}: wajib diisi`, 400);
    }
    for (const v of values) {
      if ((accessMap.get(Number(v.fieldId)) ?? "view") !== "edit") {
        const f = byId.get(Number(v.fieldId));
        return sendError(res, `${f?.label ?? "Field"}: tidak boleh diubah oleh role Anda`, 403);
      }
    }
    await storage.setCardValues(cardId, values.map((v: any) => ({ fieldId: Number(v.fieldId), value: String(v.value ?? "") })));
    const changedFieldIds = values.map((v: any) => Number(v.fieldId)).filter((n: number) => Number.isInteger(n));
    await dispatchCardEvent("field_updated", card, req.authUser!.id, { changedFieldIds });
    sendSuccess(res, { ok: true });
  });

  router.get("/api/pipelines/:id/access", async (req, res) => {
    if (!requirePipelinesFeature(req, res)) return;
    if (!(await requirePipelineCapability(req, res, Number(req.params.id), "manage"))) return;
    sendSuccess(res, await storage.getPipelineAccess(Number(req.params.id)));
  });
  router.put("/api/pipelines/:id/access", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    if (!(await requirePipelineCapability(req, res, Number(req.params.id), "manage"))) return;
    const { restricted, grants } = req.body ?? {};
    if (typeof restricted !== "boolean" || !Array.isArray(grants)) return sendError(res, "restricted (boolean) & grants (array) wajib", 400);
    // Admin/System-Admin akses-nya fixed full (isPipelineAdmin) - grant untuk mereka
    // tidak pernah dibaca dan hanya menyesatkan UI. Buang sebelum simpan.
    const mitraRoles = await storage.getRoles(req.authUser!.activeMitraId ?? 1);
    const lockedRoleIds = new Set(mitraRoles.filter((r: any) => isAdminLockedRole(r)).map((r: any) => r.id));
    const cleanGrants = grants.filter((g: any) => !lockedRoleIds.has(Number(g.roleId)));
    await storage.setPipelineAccess(Number(req.params.id), restricted, cleanGrants.map((g: any) => ({
      roleId: Number(g.roleId),
      capabilities: Array.isArray(g.capabilities) ? g.capabilities.map(String) : [],
      cardFilter: Array.isArray(g.cardFilter) && g.cardFilter.length > 0 ? g.cardFilter : null,
    })));
    sendSuccess(res, { ok: true });
  });

  // -- Collection config --------------------------------------------------------
  router.get("/api/pipelines/:id/collection-metrics", async (req: Request, res: Response) => {
    const pid = Number(req.params.id);
    if (!requirePipelinesFeature(req, res)) return;
    if (!(await requirePipelineView(req, res, pid))) return;
    const metrics = await getCollectionMetrics(pid);
    return sendSuccess(res, metrics);
  });

  // --- Pipeline universal metrics ---

  router.get("/api/pipelines/:id/metrics", async (req: Request, res: Response) => {
    const pid = Number(req.params.id);
    if (!requirePipelinesFeature(req, res)) return;
    if (!(await requirePipelineView(req, res, pid))) return;
    const rowFilter = await getCardFilterForRequest(req, pid);
    const presetRaw = typeof req.query.ctx === "string" ? req.query.ctx : "";
    const ctx =
      presetRaw && presetRaw !== "all"
        ? { preset: presetRaw, from: typeof req.query.from === "string" ? req.query.from : null, to: typeof req.query.to === "string" ? req.query.to : null }
        : null;
    return sendSuccess(res, await computeAllPipelineMetrics(req, pid, rowFilter, ctx));
  });

  router.get("/api/pipelines/:id/metric-defs", async (req: Request, res: Response) => {
    const pid = Number(req.params.id);
    if (!requirePipelinesFeature(req, res)) return;
    if (!(await requirePipelineView(req, res, pid))) return;
    return sendSuccess(res, await storage.listMetricDefs(pid));
  });

  router.post("/api/pipelines/:id/metric-defs", async (req: Request, res: Response) => {
    const pid = Number(req.params.id);
    if (!requireWritePipelinesFeature(req, res)) return;
    if (!(await requirePipelineCapability(req, res, pid, "manage"))) return;
    const err = await validateMetricDef(pid, req.body);
    if (err) return sendError(res, err, 400);
    return sendSuccess(res, await storage.createMetricDef(pid, req.body));
  });

  router.patch("/api/pipelines/:id/metric-defs/:metricId", async (req: Request, res: Response) => {
    const pid = Number(req.params.id);
    if (!requireWritePipelinesFeature(req, res)) return;
    if (!(await requirePipelineCapability(req, res, pid, "manage"))) return;
    const existing = await storage.getMetricDef(Number(req.params.metricId));
    if (!existing || existing.pipelineId !== pid) return sendError(res, "Metric tidak ditemukan", 404);
    const err = await validateMetricDef(pid, { ...existing, ...req.body, stageIds: req.body.stageIds, conditions: req.body.conditions });
    if (err) return sendError(res, err, 400);
    await storage.updateMetricDef(Number(req.params.metricId), req.body);
    return sendSuccess(res, { ok: true });
  });

  router.delete("/api/pipelines/:id/metric-defs/:metricId", async (req: Request, res: Response) => {
    const pid = Number(req.params.id);
    if (!requireWritePipelinesFeature(req, res)) return;
    if (!(await requirePipelineCapability(req, res, pid, "manage"))) return;
    const existing = await storage.getMetricDef(Number(req.params.metricId));
    if (!existing || existing.pipelineId !== pid) return sendError(res, "Metric tidak ditemukan", 404);
    await storage.deleteMetricDef(Number(req.params.metricId));
    return sendSuccess(res, { ok: true });
  });

  // -- Automation rules ---------------------------------------------------------
  router.get("/api/pipelines/:id/rules", async (req, res) => {
    if (!requirePipelinesFeature(req, res)) return;
    if (!(await requirePipelineCapability(req, res, Number(req.params.id), "automation"))) return;
    const pid = Number(req.params.id);
    const rules = await storage.listRules(pid);

    // One-time lookups (source side + pipeline names + this pipeline's stages + users)
    const allPipes = await storage.listPipelines(true);
    const pipeName = new Map(allPipes.map((p) => [p.id, p.name]));
    const srcFieldList = await storage.listFields(pid);
    const srcFields = new Map(srcFieldList.map((f) => [f.id, { label: f.label, type: f.type }]));
    const selfStages = new Map((await storage.listStages(pid)).map((s) => [s.id, s.label]));
    // Mitra-scoped label map (not global getAllUsers): only this tenant's users label assign/notify actions.
    const userName = new Map((await storage.getAssignableUsers(req.authUser!.activeMitraId, false)).map((u) => [u.id, u.name || u.username]));

    // Batched actions + per-action field maps
    const actionsByRule = await storage.listRuleActionsByRuleIds(rules.map((r) => r.id));
    const allActions: any[] = [...actionsByRule.values()].flat();
    const tgtIds = [...new Set(allActions.filter((a) => a.actionType === "create_card" && a.targetPipelineId).map((a) => a.targetPipelineId as number))];
    const tgtStages = new Map<number, Map<number, string>>();
    const tgtFields = new Map<number, Map<number, { label: string; type: string }>>();
    await Promise.all(tgtIds.map(async (tid) => {
      const [stages, fields] = await Promise.all([storage.listStages(tid), storage.listFields(tid)]);
      tgtStages.set(tid, new Map(stages.map((s) => [s.id, s.label])));
      tgtFields.set(tid, new Map(fields.map((f) => [f.id, { label: f.label, type: f.type }])));
    }));
    const mapsByAction = new Map<number, any[]>();
    await Promise.all(allActions.filter((a) => a.actionType === "create_card").map(async (a) => {
      mapsByAction.set(a.id, (await storage.getActionFieldMaps(a.id)).map((m) => ({ id: m.id, sourceFieldId: m.sourceFieldId, targetFieldId: m.targetFieldId })));
    }));
    const actionsLk = { fields: srcFields, stages: selfStages, users: userName, pipes: pipeName, tgtStages, tgtFields, mapsByAction };

    const withMaps = rules.map((r) => {
      const conditionGroups = parseConditionGroups(r.conditions);
      const conditions = {
        groups: conditionGroups.map((g) => g.map((c) =>
          c.source === "billing"
            ? { ...c, fieldLabel: COLLECTION_ATTRS.find((a) => a.key === c.attr)?.label ?? `Billing: ${c.attr}` }
            : c.source === "lead"
            ? { ...c, fieldLabel: LEAD_CONDITION_ATTRS.find((a) => a.key === c.attr)?.label ?? `Lead: ${c.attr}` }
            : { ...c, fieldLabel: srcFields.get(c.fieldId as number)?.label ?? `Field #${c.fieldId} (dihapus)` })),
      };

      let triggerConfig: any = null;
      let triggerFieldLabel: string | undefined;
      const triggerStageScopeName = (r.triggerType === "time" && r.triggerStageId != null)
        ? (selfStages.get(r.triggerStageId) ?? `Stage #${r.triggerStageId} (dihapus)`)
        : undefined;
      if (r.triggerType === "time") {
        triggerConfig = parseTimeTriggerConfig(r.triggerConfig);
        if (triggerConfig?.anchor === "field_date" && triggerConfig.fieldId != null) {
          triggerFieldLabel = srcFields.get(triggerConfig.fieldId)?.label ?? `Field #${triggerConfig.fieldId} (dihapus)`;
        }
      } else if (r.triggerType === "billing_sync" || String(r.triggerType ?? "").startsWith("lead_")) {
        // lead_* rules keep entryStage/sources/fieldMap/notify inside triggerConfig JSON - must
        // be parsed back so the rule renders + edit-mode hydration (ruleToDraft) restores the form.
        try { triggerConfig = r.triggerConfig ? JSON.parse(r.triggerConfig) : null; } catch { triggerConfig = null; }
      }

      return {
        ...r,
        conditions,
        actions: shapeRuleActions(actionsByRule.get(r.id) ?? [], actionsLk),
        triggerConfig, triggerFieldLabel, triggerStageScopeName,
      };
    });
    sendSuccess(res, withMaps);
  });

  router.post("/api/pipelines/:id/rules", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    if (!(await requirePipelineCapability(req, res, Number(req.params.id), "automation"))) return;
    const pid = Number(req.params.id);
    const b = req.body ?? {};

    const condErr = await validateConditions(pid, b.conditions);
    if (condErr) return sendError(res, condErr, 400);

    const triggerType = (b.triggerType ?? "stage_enter") as RuleTriggerType;
    const entryStageId = b.targetStageId != null ? Number(b.targetStageId) : null;
    const trigErr = await validateTriggerConfig(pid, triggerType, b.triggerStageId != null ? Number(b.triggerStageId) : null, b.triggerConfig, entryStageId);
    if (trigErr) return sendError(res, trigErr, 400);

    // billing_sync and lead_* rules create cards directly (no rule-actions); other triggers need >= 1 action.
    const noActionTriggers = ["billing_sync", "lead_created", "lead_updated", "lead_assigned", "lead_stage_changed", "lead_converted"];
    if (!noActionTriggers.includes(triggerType)) {
      const actErr = await validateActions(req, pid, b.actions);
      if (actErr) return sendError(res, actErr.error, actErr.status);
    }
    return sendSuccess(res, await storage.createRule(pid, {
      name: b.name,
      triggerType: (b.triggerType ?? "stage_enter"),
      triggerStageId: b.triggerStageId != null ? Number(b.triggerStageId) : null,
      targetStageId: entryStageId,
      triggerConfig: (b.triggerType === "time" || b.triggerType === "billing_sync" || b.triggerType === "field_updated" || String(b.triggerType ?? "").startsWith("lead_")) ? (b.triggerConfig ?? null) : null,
      enabled: b.enabled,
      conditions: b.conditions ?? null,
      recurrence: parseRecurrence(b.recurrence),
      actions: (b.actions ?? []).map((a: any) => ({
        actionType: String(a.actionType),
        actionConfig: a.actionConfig ?? null,
        targetPipelineId: a.targetPipelineId != null ? Number(a.targetPipelineId) : null,
        targetStageId: a.targetStageId != null ? Number(a.targetStageId) : null,
        titleTemplate: a.titleTemplate ?? null,
        copyAssignee: a.copyAssignee ? 1 : 0,
        fieldMaps: a.fieldMaps,
      })),
    }, req.authUser!.id));
  });

  router.patch("/api/pipelines/:id/rules/:ruleId", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    if (!(await requirePipelineCapability(req, res, Number(req.params.id), "automation"))) return;
    const pid = Number(req.params.id);
    const ruleId = Number(req.params.ruleId);
    const b = req.body ?? {};

    // Bind the rule to the path pipeline: listRules(pid) is mitra+pipeline scoped, so a ruleId
    // belonging to another pipeline (even within the same mitra) resolves to nothing → 404.
    const current = (await storage.listRules(pid)).find((r) => r.id === ruleId);
    if (!current) return sendError(res, "Rule tidak ditemukan", 404);

    if (b.conditions !== undefined) {
      const condErr = await validateConditions(pid, b.conditions);
      if (condErr) return sendError(res, condErr, 400);
    }
    if (b.triggerType !== undefined || b.triggerConfig !== undefined || b.triggerStageId !== undefined || b.targetStageId !== undefined) {
      const tType = String(b.triggerType ?? current?.triggerType ?? "stage_enter");
      const tStage = b.triggerStageId !== undefined ? (b.triggerStageId != null ? Number(b.triggerStageId) : null)
        : (current?.triggerStageId ?? null);
      const tCfg = b.triggerConfig !== undefined ? b.triggerConfig
        : (current?.triggerConfig ? JSON.parse(current.triggerConfig) : null);
      const tEntry = b.targetStageId !== undefined ? (b.targetStageId != null ? Number(b.targetStageId) : null)
        : ((current as any)?.targetStageId ?? null);
      const trigErr = await validateTriggerConfig(pid, tType, tStage, tCfg, tEntry);
      if (trigErr) return sendError(res, trigErr, 400);
    }
    if (b.actions !== undefined) {
      const effectiveTriggerType = String(b.triggerType ?? current?.triggerType ?? "stage_enter");
      const noActionTriggersPatch = ["billing_sync", "lead_created", "lead_updated", "lead_assigned", "lead_stage_changed", "lead_converted"];
      if (!noActionTriggersPatch.includes(effectiveTriggerType)) {
        const actErr = await validateActions(req, pid, b.actions);
        if (actErr) return sendError(res, actErr.error, actErr.status);
      }
    }
    try {
      sendSuccess(res, await storage.updateRule(ruleId, {
        name: b.name,
        triggerType: b.triggerType,
        triggerStageId: b.triggerStageId !== undefined ? (b.triggerStageId != null ? Number(b.triggerStageId) : null) : undefined,
        targetStageId: b.targetStageId !== undefined ? (b.targetStageId != null ? Number(b.targetStageId) : null) : undefined,
        triggerConfig: b.triggerType === "stage_enter" ? null : b.triggerConfig,
        enabled: b.enabled,
        conditions: b.conditions,
        recurrence: b.recurrence !== undefined ? parseRecurrence(b.recurrence) : undefined,
        actions: b.actions !== undefined ? b.actions.map((a: any) => ({
          actionType: String(a.actionType),
          actionConfig: a.actionConfig ?? null,
          targetPipelineId: a.targetPipelineId != null ? Number(a.targetPipelineId) : null,
          targetStageId: a.targetStageId != null ? Number(a.targetStageId) : null,
          titleTemplate: a.titleTemplate ?? null,
          copyAssignee: a.copyAssignee ? 1 : 0,
          fieldMaps: a.fieldMaps,
        })) : undefined,
      }));
    } catch (e: any) {
      if (String(e?.message).includes("tidak ditemukan")) return sendError(res, e.message, 404);
      throw e;
    }
  });

  router.delete("/api/pipelines/:id/rules/:ruleId", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    if (!(await requirePipelineCapability(req, res, Number(req.params.id), "automation"))) return;
    const pid = Number(req.params.id);
    const ruleId = Number(req.params.ruleId);
    // Bind ruleId to the path pipeline (mitra+pipeline scoped) before deleting.
    if (!(await storage.listRules(pid)).some((r) => r.id === ruleId)) return sendError(res, "Rule tidak ditemukan", 404);
    await storage.deleteRule(ruleId);
    sendSuccess(res, { ok: true });
  });

  // -- Pipeline detail - registered AFTER all /cards/... literals and /:id/fields --
  router.get("/api/pipelines/:id", async (req, res) => {
    if (!requirePipelinesFeature(req, res)) return;
    const pipeline = await storage.getPipeline(Number(req.params.id));
    if (!pipeline) return sendError(res, "Pipeline tidak ditemukan", 404);
    const caps = await getPipelineCapabilities(req, pipeline.id);
    if (caps.size === 0) { sendError(res, "Akses ditolak untuk pipeline ini", 403); return; }
    const [stages, fields] = await Promise.all([
      storage.listStages(pipeline.id),
      storage.listFields(pipeline.id),
    ]);
    sendSuccess(res, { ...pipeline, stages, fields, level: deriveLevel([...caps]), capabilities: [...caps] });
  });

  // -- Pipeline Templates --

  router.get("/api/pipeline-templates", async (req, res) => {
    if (!requirePipelinesFeature(req, res)) return;
    sendSuccess(res, await storage.listTemplates());
  });

  router.post("/api/pipeline-templates", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    const { fromPipelineId, name, description } = req.body ?? {};
    if (!name || !fromPipelineId) return sendError(res, "name + fromPipelineId wajib", 400);
    if (!(await requirePipelineCapability(req, res, Number(fromPipelineId), "view"))) return;
    try {
      sendSuccess(res, await storage.createTemplateFromPipeline(Number(fromPipelineId), { name: String(name), description: description ?? null }, req.authUser!.id));
    } catch (e: any) {
      if (String(e?.message).includes("tidak ditemukan")) return sendError(res, e.message, 404);
      throw e;
    }
  });

  router.post("/api/pipeline-templates/:id/apply", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    const { name, color, icon } = req.body ?? {};
    if (!name) return sendError(res, "name pipeline baru wajib", 400);
    try {
      const pipeline = await storage.instantiateTemplate(Number(req.params.id), { name: String(name), color, icon }, req.authUser!.id);
      sendSuccess(res, pipeline);
    } catch (e: any) {
      if (String(e?.message).includes("tidak ditemukan")) return sendError(res, e.message, 404);
      throw e;
    }
  });

  router.delete("/api/pipeline-templates/:id", async (req, res) => {
    if (!requireWritePipelinesFeature(req, res)) return;
    const n = await storage.deleteTemplate(Number(req.params.id));
    if (n === 0) return sendError(res, "Template tidak ditemukan atau bawaan", 404);
    sendSuccess(res, { ok: true });
  });

// ==================== TEAMSPACE (v5.0 Fase 1) ====================
// Tim internal + board tugas + Semua Tugas (PRD-JABNET-TEAMSPACE.md §7).
// Board tugas tim memakai endpoint /api/pipelines/* eksisting (kapabilitas via
// keanggotaan tim di getPipelineCapabilities); di sini hanya CRUD tim + agregasi.

function teamsKeyLevelOf(req: Request): PermKeyLevel {
  return (req.authUser!.permLevels["teams"] ?? "none") as PermKeyLevel;
}

/** Gerbang masuk modul Teamspace: minimal team_tasks read ATAU teams read. */
function requireTeamspaceAccess(req: Request, res: Response): boolean {
  if (!req.authUser) { sendError(res, "Unauthorized", 401); return false; }
  if (hasPermission(req, "team_tasks") || hasPermission(req, "teams")) return true;
  sendError(res, "Akses ditolak: tidak memiliki izin 'team_tasks' (read)", 403);
  return false;
}

/** Load tim :id + cek boleh kelola (admin / teams:write / manager tim). 403/404 sudah dikirim bila gagal. */
async function loadTeamForManage(req: Request, res: Response): Promise<import("../shared/schema.js").Team | null> {
  const team = await storage.getTeam(Number(req.params.id));
  if (!team) { sendError(res, "Tim tidak ditemukan", 404); return null; }
  const membership = await storage.getTeamMembership(team.id, req.authUser!.id);
  const ok = canManageTeam({
    isAdmin: isPipelineAdmin(req),
    teamsKeyLevel: teamsKeyLevelOf(req),
    teamRole: membership ? parseTeamRole(membership.role) : null,
  });
  if (!ok) { sendError(res, "Akses ditolak: hanya manager tim / admin yang boleh mengelola tim ini", 403); return null; }
  return team;
}

/** Load tim :id untuk BACA - anggota, admin, atau pemegang teams:read. */
async function loadTeamForView(req: Request, res: Response): Promise<{ team: import("../shared/schema.js").Team; myRole: string | null } | null> {
  const team = await storage.getTeam(Number(req.params.id));
  if (!team) { sendError(res, "Tim tidak ditemukan", 404); return null; }
  const membership = await storage.getTeamMembership(team.id, req.authUser!.id);
  const myRole = membership ? parseTeamRole(membership.role) : null;
  if (myRole || isPipelineAdmin(req) || teamsKeyLevelOf(req) !== "none") return { team, myRole };
  sendError(res, "Akses ditolak: Anda bukan anggota tim ini", 403);
  return null;
}

/** Enrich daftar tim dengan jumlah anggota + ringkasan tugas + unread chat (batched). */
async function enrichTeams(teamsList: Array<any>, forUserId?: number): Promise<Array<any>> {
  const memberCounts = await storage.getTeamMemberCounts(teamsList.map((t) => t.id));
  const pipelineIds = teamsList.map((t) => t.taskPipelineId).filter((x): x is number => x != null);
  const summaries = await storage.getTeamTaskSummaries(pipelineIds);
  const unread = forUserId != null
    ? await storage.getUnreadChatCounts(forUserId, teamsList.map((t) => t.id))
    : new Map<number, number>();
  return teamsList.map((t) => {
    // Tim lama menyimpan enabledViews sebelum view default baru (mis. "announcements")
    // ada - merge default agar tab baru langsung muncul tanpa migrasi data.
    const stored = parseEnabledViews(t.enabledViews);
    const views = [...stored, ...TEAM_DEFAULT_VIEWS.filter((v) => !stored.includes(v))];
    return {
    ...t,
    enabledViews: views,
    memberCount: memberCounts.get(t.id) ?? 0,
    taskSummary: (t.taskPipelineId != null ? summaries.get(t.taskPipelineId) : null) ?? { total: 0, done: 0, overdue: 0 },
    unreadChat: unread.get(t.id) ?? 0,
    };
  });
}

/** Search All gaya Cicle: tim + kartu board tim + dokumen (scoped keanggotaan) - dipakai ⌘K. */
router.get("/api/teamspace/search", async (req, res) => {
  if (!requireTeamspaceAccess(req, res)) return;
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) return sendSuccess(res, { teams: [], cards: [], docs: [] });
  const isAdmin = isPipelineAdmin(req) || teamsKeyLevelOf(req) !== "none";
  sendSuccess(res, await storage.searchTeamspace(req.authUser!.id, q, { isAdmin }));
});

router.get("/api/teamspace/teams", async (req, res) => {
  if (!requireTeamspaceAccess(req, res)) return;
  const includeArchived = req.query.archived === "1";
  const wantAll = req.query.all === "1";
  const canSeeAll = isPipelineAdmin(req) || teamsKeyLevelOf(req) !== "none";
  let list: any[];
  if (wantAll && canSeeAll) {
    const all = await storage.listTeams(includeArchived);
    const mine = await storage.listTeamsForUser(req.authUser!.id, true);
    const roleByTeam = new Map(mine.map((t) => [t.id, t.myRole]));
    list = all.map((t) => ({ ...t, myRole: roleByTeam.get(t.id) ?? null }));
  } else {
    list = await storage.listTeamsForUser(req.authUser!.id, includeArchived);
  }
  sendSuccess(res, await enrichTeams(list, req.authUser!.id));
});

router.post("/api/teamspace/teams", async (req, res) => {
  if (!requireTeamspaceAccess(req, res)) return;
  if (!canCreateTeam({ isAdmin: isPipelineAdmin(req), teamsKeyLevel: teamsKeyLevelOf(req) })) {
    return sendError(res, "Akses ditolak: butuh izin 'teams' (write) untuk membuat tim", 403);
  }
  const { name, description, icon, color, type, memberIds, managerIds, parentId } = req.body ?? {};
  if (!name || typeof name !== "string" || !name.trim()) return sendError(res, "Nama tim wajib diisi", 400);
  // FR-302: nested tree - validasi tim induk ada (& belum diarsip).
  let parent: number | null = null;
  if (parentId != null && Number(parentId) > 0) {
    const p = await storage.getTeam(Number(parentId));
    if (!p || p.archivedAt) return sendError(res, "Tim induk tidak ditemukan", 400);
    parent = p.id;
  }
  const team = await storage.createTeam(
    { name: name.trim(), description, icon, color, type, parentId: parent },
    req.authUser!.id,
  );
  // Anggota awal (pembuat sudah otomatis manager di storage.createTeam).
  const managers = new Set<number>(Array.isArray(managerIds) ? managerIds.map(Number).filter((n: number) => Number.isFinite(n) && n > 0) : []);
  const members: number[] = Array.isArray(memberIds) ? memberIds.map(Number).filter((n: number) => Number.isFinite(n) && n > 0) : [];
  for (const uid of new Set<number>([...members, ...managers])) {
    if (uid === req.authUser!.id) continue;
    const u = await storage.getUser(uid);
    if (!u || (u as any).isActive === 0) continue;
    await storage.addTeamMember(team.id, uid, managers.has(uid) ? "manager" : "member");
  }
  await logAudit(req, "TEAM_CREATE", "team", team.id, team.name);
  const [enriched] = await enrichTeams([{ ...team, myRole: "manager" }]);
  sendSuccess(res, enriched);
});

router.get("/api/teamspace/teams/:id", async (req, res) => {
  if (!requireTeamspaceAccess(req, res)) return;
  const loaded = await loadTeamForView(req, res);
  if (!loaded) return;
  const members = await storage.listTeamMembers(loaded.team.id);
  const [enriched] = await enrichTeams([loaded.team]);
  const membership = loaded.myRole;
  const manageable = canManageTeam({
    isAdmin: isPipelineAdmin(req), teamsKeyLevel: teamsKeyLevelOf(req),
    teamRole: membership ? parseTeamRole(membership) : null,
  });
  sendSuccess(res, { ...enriched, myRole: loaded.myRole, canManage: manageable, members });
});

router.patch("/api/teamspace/teams/:id", async (req, res) => {
  if (!requireTeamspaceAccess(req, res)) return;
  const team = await loadTeamForManage(req, res);
  if (!team) return;
  const { name, description, icon, color, type, enabledViews, parentId } = req.body ?? {};
  if (name !== undefined && (!name || typeof name !== "string" || !name.trim())) return sendError(res, "Nama tim tidak valid", 400);
  const views = enabledViews !== undefined ? parseEnabledViews(JSON.stringify(enabledViews)) : undefined;
  // FR-302: validasi pindah induk - ada, bukan diri sendiri, dan tidak membentuk siklus
  // (walk rantai induk calon parent; jumlah tim kecil sehingga loop murah).
  let parentPatch: number | null | undefined = undefined;
  if (parentId !== undefined) {
    if (parentId == null || Number(parentId) <= 0) parentPatch = null;
    else {
      const target = Number(parentId);
      if (target === team.id) return sendError(res, "Tim tidak bisa menjadi induk dirinya sendiri", 400);
      let cursor = await storage.getTeam(target);
      if (!cursor || cursor.archivedAt) return sendError(res, "Tim induk tidak ditemukan", 400);
      for (let i = 0; i < 20 && cursor; i++) {
        if (cursor.id === team.id) return sendError(res, "Tidak bisa: membentuk siklus induk-anak", 400);
        cursor = cursor.parentId ? await storage.getTeam(cursor.parentId) : undefined;
      }
      parentPatch = target;
    }
  }
  const updated = await storage.updateTeam(team.id, {
    name: name?.trim(), description, icon, color, type,
    enabledViews: views as string[] | undefined,
    parentId: parentPatch,
  });
  await logAudit(req, "TEAM_UPDATE", "team", team.id, updated.name);
  sendSuccess(res, updated);
});

router.post("/api/teamspace/teams/:id/archive", async (req, res) => {
  if (!requireTeamspaceAccess(req, res)) return;
  const team = await loadTeamForManage(req, res);
  if (!team) return;
  const archived = req.body?.archived !== false;
  await storage.setTeamArchived(team.id, archived);
  await logAudit(req, archived ? "TEAM_ARCHIVE" : "TEAM_UNARCHIVE", "team", team.id, team.name);
  sendSuccess(res, { ok: true });
});

router.get("/api/teamspace/teams/:id/members", async (req, res) => {
  if (!requireTeamspaceAccess(req, res)) return;
  const loaded = await loadTeamForView(req, res);
  if (!loaded) return;
  sendSuccess(res, await storage.listTeamMembers(loaded.team.id));
});

router.post("/api/teamspace/teams/:id/members", async (req, res) => {
  if (!requireTeamspaceAccess(req, res)) return;
  const team = await loadTeamForManage(req, res);
  if (!team) return;
  const userId = Number(req.body?.userId);
  const role = req.body?.role === "manager" ? "manager" : "member";
  if (!Number.isFinite(userId) || userId <= 0) return sendError(res, "userId wajib diisi", 400);
  const u = await storage.getUser(userId);
  if (!u || (u as any).isActive === 0) return sendError(res, "User tidak ditemukan atau nonaktif", 400);
  await storage.addTeamMember(team.id, userId, role);
  await logAudit(req, "TEAM_MEMBER_ADD", "team", team.id, team.name, { userId, role });
  sendSuccess(res, { ok: true });
});

router.patch("/api/teamspace/teams/:id/members/:userId", async (req, res) => {
  if (!requireTeamspaceAccess(req, res)) return;
  const team = await loadTeamForManage(req, res);
  if (!team) return;
  const userId = Number(req.params.userId);
  const role = req.body?.role === "manager" ? "manager" : "member";
  const existing = await storage.getTeamMembership(team.id, userId);
  if (!existing) return sendError(res, "Anggota tidak ditemukan di tim ini", 404);
  // Cegah tim tanpa manager: demote manager terakhir ditolak.
  if (existing.role === "manager" && role === "member") {
    const members = await storage.listTeamMembers(team.id);
    if (members.filter((m) => m.teamRole === "manager").length <= 1) {
      return sendError(res, "Tim harus punya minimal satu manager", 400);
    }
  }
  await storage.addTeamMember(team.id, userId, role);   // upsert role
  await logAudit(req, "TEAM_MEMBER_ROLE", "team", team.id, team.name, { userId, role });
  sendSuccess(res, { ok: true });
});

router.delete("/api/teamspace/teams/:id/members/:userId", async (req, res) => {
  if (!requireTeamspaceAccess(req, res)) return;
  const team = await loadTeamForManage(req, res);
  if (!team) return;
  const userId = Number(req.params.userId);
  const existing = await storage.getTeamMembership(team.id, userId);
  if (!existing) return sendError(res, "Anggota tidak ditemukan di tim ini", 404);
  if (existing.role === "manager") {
    const members = await storage.listTeamMembers(team.id);
    if (members.filter((m) => m.teamRole === "manager").length <= 1) {
      return sendError(res, "Tim harus punya minimal satu manager - tunjuk manager lain dulu", 400);
    }
  }
  await storage.removeTeamMember(team.id, userId);
  await logAudit(req, "TEAM_MEMBER_REMOVE", "team", team.id, team.name, { userId });
  sendSuccess(res, { ok: true });
});

/** Semua Tugas (FR-412): agregasi kartu dari seluruh tim milik user - batched, hormati Rahasia. */
router.get("/api/teamspace/tasks", async (req, res) => {
  if (!requireTeamspaceAccess(req, res)) return;
  const myTeams = await storage.listTeamsForUser(req.authUser!.id);
  const withBoard = myTeams.filter((t) => t.taskPipelineId != null);
  const pipelineIds = withBoard.map((t) => t.taskPipelineId!) as number[];
  let cards = await storage.listCardsForPipelines(pipelineIds);
  const stagesMap = await storage.listStagesForPipelines(pipelineIds);
  const secondaryByCard = await storage.getSecondaryAssigneesForCards(cards.map((c) => c.id));
  // Filter kartu Rahasia (server-side).
  if (!isPipelineAdmin(req) && cards.some((c) => (c as any).isPrivate === 1)) {
    const followersByCard = await storage.getFollowersForCards(cards.filter((c) => (c as any).isPrivate === 1).map((c) => c.id));
    const uid = req.authUser!.id;
    cards = cards.filter((c) => (c as any).isPrivate !== 1 || canSeePrivateCard({
      isAdmin: false, userId: uid, createdBy: c.createdBy,
      assigneeIds: [c.assigneeId ?? -1, ...(secondaryByCard.get(c.id) ?? [])],
      followerIds: followersByCard.get(c.id) ?? [],
    }));
  }
  const labelsByCard = await storage.getLabelsForCards(cards.map((c) => c.id));
  const checklistByCard = await storage.getChecklistProgressForCards(cards.map((c) => c.id));
  const teamByPipeline = new Map(withBoard.map((t) => [t.taskPipelineId!, t]));
  sendSuccess(res, {
    teams: withBoard.map((t) => ({ id: t.id, name: t.name, color: t.color, icon: t.icon, pipelineId: t.taskPipelineId })),
    stages: Object.fromEntries([...stagesMap.entries()].map(([pid, stages]) => [pid, stages])),
    cards: cards.map((c) => ({
      ...c,
      teamId: teamByPipeline.get(c.pipelineId)?.id ?? null,
      teamName: teamByPipeline.get(c.pipelineId)?.name ?? null,
      secondaryAssigneeIds: secondaryByCard.get(c.id) ?? [],
      labels: labelsByCard.get(c.id) ?? [],
      checklistProgress: checklistByCard.get(c.id) ?? null,
    })),
  });
});

// -- Ekstensi kartu: checklist (FR-406) --

router.get("/api/pipelines/cards/:cardId/checklists", async (req, res) => {
  if (!requirePipelinesFeature(req, res)) return;
  const card = await loadGuardedCard(req, res, "view");
  if (!card) return;
  sendSuccess(res, await storage.listChecklistsForCard(card.id));
});

router.post("/api/pipelines/cards/:cardId/checklists", async (req, res) => {
  if (!requireWritePipelinesFeature(req, res)) return;
  const card = await loadGuardedCard(req, res, "cards");
  if (!card) return;
  const title = String(req.body?.title ?? "").trim();
  if (!title) return sendError(res, "Judul checklist wajib diisi", 400);
  sendSuccess(res, await storage.createChecklist(card.id, title, req.authUser!.id));
});

/** Resolve checklist :id → kartunya, jalankan guardCard. */
async function loadGuardedChecklist(req: Request, res: Response, gate: PipelineCapability): Promise<{ checklistId: number; cardId: number } | null> {
  const checklist = await storage.getChecklist(Number(req.params.id));
  if (!checklist) { sendError(res, "Checklist tidak ditemukan", 404); return null; }
  const card = await storage.getCard(checklist.cardId);
  if (!(await guardCard(req, res, card, gate))) return null;
  return { checklistId: checklist.id, cardId: checklist.cardId };
}

router.patch("/api/pipelines/checklists/:id", async (req, res) => {
  if (!requireWritePipelinesFeature(req, res)) return;
  const ref = await loadGuardedChecklist(req, res, "cards");
  if (!ref) return;
  const title = String(req.body?.title ?? "").trim();
  if (!title) return sendError(res, "Judul checklist wajib diisi", 400);
  await storage.updateChecklist(ref.checklistId, title);
  sendSuccess(res, { ok: true });
});

router.delete("/api/pipelines/checklists/:id", async (req, res) => {
  if (!requireWritePipelinesFeature(req, res)) return;
  const ref = await loadGuardedChecklist(req, res, "cards");
  if (!ref) return;
  await storage.deleteChecklist(ref.checklistId);
  await storage.recordCardActivity(ref.cardId, req.authUser!.id, "checklist_removed");
  sendSuccess(res, { ok: true });
});

router.post("/api/pipelines/checklists/:id/items", async (req, res) => {
  if (!requireWritePipelinesFeature(req, res)) return;
  const ref = await loadGuardedChecklist(req, res, "cards");
  if (!ref) return;
  const text = String(req.body?.text ?? "").trim();
  if (!text) return sendError(res, "Isi item wajib diisi", 400);
  sendSuccess(res, await storage.addChecklistItem(ref.checklistId, text));
});

/** Resolve item :id → checklist → kartu, jalankan guardCard. */
async function loadGuardedChecklistItem(req: Request, res: Response): Promise<{ itemId: number } | null> {
  const item = await storage.getChecklistItem(Number(req.params.id));
  if (!item) { sendError(res, "Item checklist tidak ditemukan", 404); return null; }
  const checklist = await storage.getChecklist(item.checklistId);
  if (!checklist) { sendError(res, "Checklist tidak ditemukan", 404); return null; }
  const card = await storage.getCard(checklist.cardId);
  if (!(await guardCard(req, res, card, "cards"))) return null;
  return { itemId: item.id };
}

router.patch("/api/pipelines/checklist-items/:id", async (req, res) => {
  if (!requireWritePipelinesFeature(req, res)) return;
  const ref = await loadGuardedChecklistItem(req, res);
  if (!ref) return;
  const patch: { text?: string; isChecked?: boolean } = {};
  if (req.body?.text !== undefined) {
    const text = String(req.body.text).trim();
    if (!text) return sendError(res, "Isi item wajib diisi", 400);
    patch.text = text;
  }
  if (req.body?.isChecked !== undefined) patch.isChecked = Boolean(req.body.isChecked);
  await storage.updateChecklistItem(ref.itemId, patch);
  sendSuccess(res, { ok: true });
});

router.delete("/api/pipelines/checklist-items/:id", async (req, res) => {
  if (!requireWritePipelinesFeature(req, res)) return;
  const ref = await loadGuardedChecklistItem(req, res);
  if (!ref) return;
  await storage.deleteChecklistItem(ref.itemId);
  sendSuccess(res, { ok: true });
});

// -- Ekstensi kartu: label berwarna (FR-413) --

router.get("/api/pipelines/:id/labels", async (req, res) => {
  if (!requirePipelinesFeature(req, res)) return;
  if (!(await requirePipelineView(req, res, Number(req.params.id)))) return;
  sendSuccess(res, await storage.listLabels(Number(req.params.id)));
});

router.post("/api/pipelines/:id/labels", async (req, res) => {
  if (!requireWritePipelinesFeature(req, res)) return;
  if (!(await requirePipelineCapability(req, res, Number(req.params.id), "cards"))) return;
  const name = String(req.body?.name ?? "").trim();
  if (!name) return sendError(res, "Nama label wajib diisi", 400);
  const colorHex = typeof req.body?.colorHex === "string" && /^#[0-9A-Fa-f]{6}$/.test(req.body.colorHex) ? req.body.colorHex : undefined;
  sendSuccess(res, await storage.createLabel(Number(req.params.id), { name, colorHex }));
});

router.patch("/api/pipelines/labels/:labelId", async (req, res) => {
  if (!requireWritePipelinesFeature(req, res)) return;
  const label = await storage.getLabel(Number(req.params.labelId));
  if (!label) return sendError(res, "Label tidak ditemukan", 404);
  if (!(await requirePipelineCapability(req, res, label.pipelineId, "cards"))) return;
  const patch: { name?: string; colorHex?: string } = {};
  if (req.body?.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) return sendError(res, "Nama label wajib diisi", 400);
    patch.name = name;
  }
  if (req.body?.colorHex !== undefined) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(String(req.body.colorHex))) return sendError(res, "Warna label tidak valid", 400);
    patch.colorHex = String(req.body.colorHex);
  }
  sendSuccess(res, await storage.updateLabel(label.id, patch));
});

router.delete("/api/pipelines/labels/:labelId", async (req, res) => {
  if (!requireWritePipelinesFeature(req, res)) return;
  const label = await storage.getLabel(Number(req.params.labelId));
  if (!label) return sendError(res, "Label tidak ditemukan", 404);
  if (!(await requirePipelineCapability(req, res, label.pipelineId, "cards"))) return;
  await storage.deleteLabel(label.id);
  sendSuccess(res, { ok: true });
});

router.put("/api/pipelines/cards/:cardId/labels", async (req, res) => {
  if (!requireWritePipelinesFeature(req, res)) return;
  const card = await loadGuardedCard(req, res, "cards");
  if (!card) return;
  const labelIds: number[] = Array.isArray(req.body?.labelIds)
    ? req.body.labelIds.map(Number).filter((n: number) => Number.isFinite(n) && n > 0) : [];
  // Validasi scope: semua label harus milik pipeline kartu ini.
  const valid = await storage.listLabels(card.pipelineId);
  const validIds = new Set(valid.map((l) => l.id));
  if (labelIds.some((id) => !validIds.has(id))) return sendError(res, "Label tidak valid untuk board ini", 400);
  await storage.setCardLabels(card.id, labelIds, req.authUser!.id);
  sendSuccess(res, { ok: true });
});

// -- Ekstensi kartu: selesai / rahasia / arsip / salin (FR-405, 409, 414) --

router.post("/api/pipelines/cards/:cardId/complete", async (req, res) => {
  if (!requireWritePipelinesFeature(req, res)) return;
  const card = await loadGuardedCard(req, res, "cards");
  if (!card) return;
  const completed = req.body?.completed !== false;
  const updated = await storage.setCardCompleted(card.id, completed, req.authUser!.id);
  let nextCard = null;
  if (completed) {
    await notifyPipelineCardWatchers(card.id, req.authUser!.id, "Tugas selesai", `"${card.title}" ditandai selesai`);
    // FR-408 "Ulangi": kartu berulang → buat instance berikutnya otomatis.
    if ((card as any).recurrenceRule) {
      nextCard = await storage.spawnRecurringCard(card.id, req.authUser!.id);
      if (nextCard) {
        await notifyPipelineCardWatchers(nextCard.id, req.authUser!.id, "Tugas berulang dibuat",
          `Instance baru "${nextCard.title}" - tenggat ${nextCard.dueDate ? new Date(nextCard.dueDate).toLocaleDateString("id-ID") : "-"}`);
      }
    }
  }
  sendSuccess(res, { ...updated, nextCard });
});

/** FR-408: set aturan "Ulangi" kartu. */
router.patch("/api/pipelines/cards/:cardId/recurrence", async (req, res) => {
  if (!requireWritePipelinesFeature(req, res)) return;
  const card = await loadGuardedCard(req, res, "cards");
  if (!card) return;
  const freq = req.body?.freq;
  if (freq != null && freq !== "" && !["daily", "weekly", "monthly"].includes(freq)) {
    return sendError(res, "freq harus daily/weekly/monthly atau kosong", 400);
  }
  const interval = Number.isInteger(req.body?.interval) && req.body.interval >= 1 ? req.body.interval : 1;
  const json = freq ? JSON.stringify({ freq, interval }) : null;
  await storage.setCardRecurrence(card.id, json, req.authUser!.id);
  sendSuccess(res, { ok: true, recurrenceRule: json });
});

router.post("/api/pipelines/cards/:cardId/private", async (req, res) => {
  if (!requireWritePipelinesFeature(req, res)) return;
  const card = await loadGuardedCard(req, res, "cards");
  if (!card) return;
  // §9: tandai Rahasia = admin / manager tim / creator kartu.
  let allowed = isPipelineAdmin(req) || card.createdBy === req.authUser!.id;
  if (!allowed) {
    const pipe = await storage.getPipeline(card.pipelineId);
    if (pipe && (pipe as any).teamId != null) {
      const membership = await storage.getTeamMembership(Number((pipe as any).teamId), req.authUser!.id);
      allowed = membership?.role === "manager";
    }
  }
  if (!allowed) return sendError(res, "Hanya pembuat kartu, manager tim, atau admin yang boleh mengubah kerahasiaan", 403);
  sendSuccess(res, await storage.setCardPrivate(card.id, Boolean(req.body?.isPrivate), req.authUser!.id));
});

router.post("/api/pipelines/cards/:cardId/archive", async (req, res) => {
  if (!requireWritePipelinesFeature(req, res)) return;
  const card = await loadGuardedCard(req, res, "cards");
  if (!card) return;
  await storage.setCardArchived(card.id, req.body?.archived !== false, req.authUser!.id);
  sendSuccess(res, { ok: true });
});

router.post("/api/pipelines/cards/:cardId/duplicate", async (req, res) => {
  if (!requireWritePipelinesFeature(req, res)) return;
  const card = await loadGuardedCard(req, res, "cards");
  if (!card) return;
  sendSuccess(res, await storage.duplicateCard(card.id, req.authUser!.id));
});

// BUG-007: cover image kartu (upload / stream / hapus)
router.post("/api/pipelines/cards/:cardId/cover", async (req, res) => {
  if (!requireWritePipelinesFeature(req, res)) return;
  const card = await loadGuardedCard(req, res, "cards");
  if (!card) return;
  let parsed;
  try {
    parsed = await parseMultipart(req, { maxBytes: ATTACHMENT_MAX_BYTES, maxFiles: 1, maxTotalBytes: ATTACHMENT_MAX_BYTES });
  } catch (e: any) {
    return sendError(res, e?.message || "Upload gagal", 413);
  }
  if (parsed.files.length === 0) return sendError(res, "Pilih satu gambar cover", 400);
  const f = parsed.files[0];
  const v = validateAttachment(f.fileName, f.buffer.length);
  if (!v.ok) return sendError(res, v.error!, 400);
  if (v.kind !== "image") return sendError(res, "Cover harus berupa gambar", 400);
  const slug = await storage.getMitraSlug(req.authUser!.activeMitraId);
  const rel = await saveUploadedFile(slug, `cover-${card.id}`, f.buffer, v.ext!);
  await storage.setCardCover(card.id, rel, req.authUser!.id);
  sendSuccess(res, { coverPath: rel });
});

router.get("/api/pipelines/cards/:cardId/cover/raw", async (req, res) => {
  if (!requirePipelinesFeature(req, res)) return;
  const card = await loadGuardedCard(req, res, "view");
  if (!card) return;
  if (!(card as any).coverPath) return sendError(res, "Kartu belum punya cover", 404);
  await streamFile((card as any).coverPath, res);
});

router.delete("/api/pipelines/cards/:cardId/cover", async (req, res) => {
  if (!requireWritePipelinesFeature(req, res)) return;
  const card = await loadGuardedCard(req, res, "cards");
  if (!card) return;
  await storage.setCardCover(card.id, null, req.authUser!.id);
  sendSuccess(res, { ok: true });
});

router.get("/api/pipelines/:id/cards/archived", async (req, res) => {
  if (!requirePipelinesFeature(req, res)) return;
  if (!(await requirePipelineView(req, res, Number(req.params.id)))) return;
  sendSuccess(res, await storage.listArchivedCards(Number(req.params.id)));
});

/** FR-403: atur siapa yang boleh memindahkan kartu di sebuah list (manager/admin - capability "stages"). */
router.patch("/api/pipelines/:id/stages/:stageId/move-permission", async (req, res) => {
  if (!requireWritePipelinesFeature(req, res)) return;
  if (!(await requirePipelineCapability(req, res, Number(req.params.id), "stages"))) return;
  const stages = await storage.listStages(Number(req.params.id));
  const stage = stages.find((s) => s.id === Number(req.params.stageId));
  if (!stage) return sendError(res, "Stage tidak ditemukan", 404);
  const raw = req.body?.movePermission == null ? null : JSON.stringify(req.body.movePermission);
  const parsed = parseMovePermission(raw);
  await storage.setStageMovePermission(stage.id, parsed ? JSON.stringify(parsed) : null);
  sendSuccess(res, { ok: true, movePermission: parsed });
});

// -- Teamspace Fase 2 - helper guard modul --

type TeamModuleKey = "team_chat" | "team_schedule" | "team_checkins" | "team_docs" | "team_announcements";

/** Gerbang per-modul Teamspace: cek permission key modul (read/write). */
function requireTeamModule(req: Request, res: Response, key: TeamModuleKey, write = false): boolean {
  if (!req.authUser) { sendError(res, "Unauthorized", 401); return false; }
  const ok = write ? hasWritePermission(req, key) : hasPermission(req, key);
  if (!ok) {
    sendError(res, `Akses ditolak: fitur '${key}' ${write ? "bersifat read-only" : "tidak diizinkan"} untuk role Anda`, 403);
    return false;
  }
  return true;
}

/** Load tim :id, wajib ANGGOTA tim (atau admin) - untuk ruang khusus anggota (chat, jawab check-in). */
async function loadTeamForMember(req: Request, res: Response): Promise<{ team: import("../shared/schema.js").Team; myRole: string | null } | null> {
  const team = await storage.getTeam(Number(req.params.id));
  if (!team) { sendError(res, "Tim tidak ditemukan", 404); return null; }
  const membership = await storage.getTeamMembership(team.id, req.authUser!.id);
  const myRole = membership ? parseTeamRole(membership.role) : null;
  if (myRole || isPipelineAdmin(req)) return { team, myRole };
  sendError(res, "Akses ditolak: Anda bukan anggota tim ini", 403);
  return null;
}

/** Boleh melihat konten Rahasia? (creator / penerima eksplisit / admin). */
function canSeeConfidential(req: Request, createdBy: number, recipientIds: number[]): boolean {
  if (isPipelineAdmin(req)) return true;
  const uid = req.authUser!.id;
  return createdBy === uid || recipientIds.includes(uid);
}

// -- Teamspace Fase 2: Chat Grup (FR-5xx) --

router.get("/api/teamspace/teams/:id/chat", async (req, res) => {
  if (!requireTeamModule(req, res, "team_chat")) return;
  const loaded = await loadTeamForMember(req, res);
  if (!loaded) return;
  const beforeId = req.query.before ? Number(req.query.before) : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  sendSuccess(res, await storage.listChatMessages(loaded.team.id, { beforeId, limit }));
});

router.post("/api/teamspace/teams/:id/chat", async (req, res) => {
  if (!requireTeamModule(req, res, "team_chat", true)) return;
  const loaded = await loadTeamForMember(req, res);
  if (!loaded) return;
  let parsed;
  try {
    parsed = await parseMultipart(req, { maxBytes: ATTACHMENT_MAX_BYTES, maxFiles: 1, maxTotalBytes: ATTACHMENT_MAX_BYTES });
  } catch (e: any) {
    return sendError(res, e?.message || "Upload gagal", 413);
  }
  const body = (parsed.fields.body ?? "").trim();
  const replyToId = parsed.fields.replyToId ? Number(parsed.fields.replyToId) : null;
  if (!body && parsed.files.length === 0) return sendError(res, "Pesan atau lampiran wajib diisi", 400);
  let attachment: { path: string; name: string; mime: string; size: number } | null = null;
  if (parsed.files.length > 0) {
    const f = parsed.files[0];
    const v = validateAttachment(f.fileName, f.buffer.length);
    if (!v.ok) return sendError(res, v.error!, 400);
    const slug = await storage.getMitraSlug(req.authUser!.activeMitraId);
    const rel = await saveUploadedFile(slug, `chat-${loaded.team.id}`, f.buffer, v.ext!);
    attachment = { path: rel, name: f.fileName, mime: v.mime!, size: f.buffer.length };
  }
  const msg = await storage.addChatMessage({
    teamId: loaded.team.id, senderId: req.authUser!.id, body: body || null, replyToId,
    attachmentPath: attachment?.path ?? null, attachmentName: attachment?.name ?? null,
    attachmentMime: attachment?.mime ?? null, attachmentSize: attachment?.size ?? null,
  });
  await storage.markChatRead(loaded.team.id, req.authUser!.id);
  sendSuccess(res, msg);
});

router.post("/api/teamspace/teams/:id/chat/read", async (req, res) => {
  if (!requireTeamModule(req, res, "team_chat")) return;
  const loaded = await loadTeamForMember(req, res);
  if (!loaded) return;
  await storage.markChatRead(loaded.team.id, req.authUser!.id);
  sendSuccess(res, { ok: true });
});

/** Read-by gaya Cicle: state baca tiap anggota, dipoll bareng chat. */
router.get("/api/teamspace/teams/:id/chat/read-states", async (req, res) => {
  if (!requireTeamModule(req, res, "team_chat")) return;
  const loaded = await loadTeamForMember(req, res);
  if (!loaded) return;
  sendSuccess(res, await storage.getChatReadStates(loaded.team.id));
});

router.get("/api/teamspace/teams/:id/chat/media", async (req, res) => {
  if (!requireTeamModule(req, res, "team_chat")) return;
  const loaded = await loadTeamForMember(req, res);
  if (!loaded) return;
  sendSuccess(res, await storage.listChatMedia(loaded.team.id));
});

/** Stream lampiran chat (cookie/bearer auth; guard keanggotaan via pesan→tim). */
router.get("/api/teamspace/chat/:messageId/attachment", async (req, res) => {
  if (!requireTeamModule(req, res, "team_chat")) return;
  const msg = await storage.getChatMessage(Number(req.params.messageId));
  if (!msg || !msg.attachmentPath) return sendError(res, "Lampiran tidak ditemukan", 404);
  const membership = await storage.getTeamMembership(msg.teamId, req.authUser!.id);
  if (!membership && !isPipelineAdmin(req)) return sendError(res, "Akses ditolak", 403);
  const download = req.query.download === "1";
  await streamFile(msg.attachmentPath, res, { download, fileName: msg.attachmentName ?? undefined });
});

router.delete("/api/teamspace/chat/:messageId", async (req, res) => {
  if (!requireTeamModule(req, res, "team_chat", true)) return;
  const msg = await storage.getChatMessage(Number(req.params.messageId));
  if (!msg) return sendError(res, "Pesan tidak ditemukan", 404);
  if (msg.senderId !== req.authUser!.id) {
    const team = await storage.getTeam(msg.teamId);
    const membership = team ? await storage.getTeamMembership(team.id, req.authUser!.id) : undefined;
    const ok = canManageTeam({
      isAdmin: isPipelineAdmin(req), teamsKeyLevel: teamsKeyLevelOf(req),
      teamRole: membership ? parseTeamRole(membership.role) : null,
    });
    if (!ok) return sendError(res, "Hanya pengirim atau manager tim yang boleh menghapus pesan", 403);
  }
  await storage.softDeleteChatMessage(msg.id);
  sendSuccess(res, { ok: true });
});

// -- Teamspace Fase 2: Jadwal (FR-7xx) --

router.get("/api/teamspace/teams/:id/events", async (req, res) => {
  if (!requireTeamModule(req, res, "team_schedule")) return;
  const loaded = await loadTeamForView(req, res);
  if (!loaded) return;
  const events = await storage.listTeamEvents(loaded.team.id);
  const participants = await storage.getParticipantsForEvents(events.map((e) => e.id));
  const visible = events.filter((e) => {
    if (e.isConfidential !== 1) return true;
    return canSeeConfidential(req, e.createdBy, participants.get(e.id) ?? []);
  });
  sendSuccess(res, visible.map((e) => ({ ...e, participantIds: participants.get(e.id) ?? [] })));
});

router.post("/api/teamspace/teams/:id/events", async (req, res) => {
  if (!requireTeamspaceAccess(req, res)) return;
  const team = await loadTeamForManage(req, res);   // FR: buat jadwal = manager/admin (§9)
  if (!team) return;
  const { title, startAt, endAt, recurrence, isConfidential, notes, participantIds } = req.body ?? {};
  if (!title || typeof title !== "string" || !title.trim()) return sendError(res, "Nama acara wajib diisi", 400);
  const s = new Date(startAt); const e = new Date(endAt);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return sendError(res, "Tanggal mulai/selesai tidak valid", 400);
  if (e.getTime() < s.getTime()) return sendError(res, "Waktu selesai harus setelah waktu mulai", 400);
  const rec = parseEventRecurrence(recurrence ? JSON.stringify(recurrence) : null);
  const pids: number[] = Array.isArray(participantIds) ? participantIds.map(Number).filter((n: number) => Number.isFinite(n) && n > 0) : [];
  const ev = await storage.createTeamEvent({
    teamId: team.id, title: title.trim(), startAt: s.toISOString(), endAt: e.toISOString(),
    recurrence: rec.freq === "none" ? null : JSON.stringify(rec),
    isConfidential: Boolean(isConfidential), notes: typeof notes === "string" ? notes : null,
    participantIds: pids,
  }, req.authUser!.id);
  // Notifikasi peserta (in-app).
  for (const uid of pids) {
    if (uid === req.authUser!.id) continue;
    await storage.createNotification({
      userId: uid, type: "team_event", title: "Jadwal baru",
      message: `"${ev.title}" - ${new Date(ev.startAt).toLocaleString("id-ID")}`,
      link: `/teamspace/teams/${team.id}`, entityType: "team_event", entityId: ev.id,
      fromUserId: req.authUser!.id,
    });
  }
  await logAudit(req, "TEAM_EVENT_CREATE", "team_event", ev.id, ev.title, { teamId: team.id });
  sendSuccess(res, ev);
});

/** Guard edit event: creator ATAU manager/admin tim tsb. */
async function loadEventForEdit(req: Request, res: Response): Promise<import("../shared/schema.js").TeamEvent | null> {
  const ev = await storage.getTeamEvent(Number(req.params.eventId));
  if (!ev) { sendError(res, "Event tidak ditemukan", 404); return null; }
  if (ev.createdBy === req.authUser!.id || isPipelineAdmin(req)) return ev;
  const membership = await storage.getTeamMembership(ev.teamId, req.authUser!.id);
  const ok = canManageTeam({
    isAdmin: false, teamsKeyLevel: teamsKeyLevelOf(req),
    teamRole: membership ? parseTeamRole(membership.role) : null,
  });
  if (!ok) { sendError(res, "Hanya pembuat atau manager tim yang boleh mengubah event ini", 403); return null; }
  return ev;
}

router.patch("/api/teamspace/events/:eventId", async (req, res) => {
  if (!requireTeamspaceAccess(req, res)) return;
  const ev = await loadEventForEdit(req, res);
  if (!ev) return;
  const { title, startAt, endAt, recurrence, isConfidential, notes, participantIds } = req.body ?? {};
  const patch: any = {};
  if (title !== undefined) {
    if (!title || !String(title).trim()) return sendError(res, "Nama acara tidak valid", 400);
    patch.title = String(title).trim();
  }
  if (startAt !== undefined || endAt !== undefined) {
    const s = new Date(startAt ?? ev.startAt); const e = new Date(endAt ?? ev.endAt);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e.getTime() < s.getTime()) {
      return sendError(res, "Rentang waktu tidak valid", 400);
    }
    patch.startAt = s.toISOString(); patch.endAt = e.toISOString();
  }
  if (recurrence !== undefined) {
    const rec = parseEventRecurrence(recurrence ? JSON.stringify(recurrence) : null);
    patch.recurrence = rec.freq === "none" ? null : JSON.stringify(rec);
  }
  if (isConfidential !== undefined) patch.isConfidential = Boolean(isConfidential);
  if (notes !== undefined) patch.notes = typeof notes === "string" ? notes : null;
  if (Array.isArray(participantIds)) patch.participantIds = participantIds.map(Number).filter((n: number) => Number.isFinite(n) && n > 0);
  sendSuccess(res, await storage.updateTeamEvent(ev.id, patch));
});

router.delete("/api/teamspace/events/:eventId", async (req, res) => {
  if (!requireTeamspaceAccess(req, res)) return;
  const ev = await loadEventForEdit(req, res);
  if (!ev) return;
  await storage.archiveTeamEvent(ev.id);
  await logAudit(req, "TEAM_EVENT_ARCHIVE", "team_event", ev.id, ev.title);
  sendSuccess(res, { ok: true });
});

/** Token feed iCal personal (FR-703). */
router.post("/api/teamspace/calendar-token", async (req, res) => {
  if (!requireTeamspaceAccess(req, res)) return;
  const token = await storage.getOrCreateCalendarFeedToken(req.authUser!.id, req.body?.regenerate === true);
  sendSuccess(res, { feedToken: token });
});

/** Feed iCal per tim - TANPA header auth (dipakai Google/Apple Calendar).
 *  Autentikasi via feedToken personal; wajib anggota tim tsb. */
router.get("/api/teamspace/teams/:id/calendar.ics", async (req, res) => {
  try {
    const token = String(req.query.feedToken ?? "");
    const user = await storage.getUserByCalendarFeedToken(token);
    if (!user || (user as any).isActive === 0) return sendError(res, "Feed token tidak valid", 401);
    // Route anonim berjalan di tenant ctx default (mitra 1) - resolve tim via pool lalu
    // jalankan sisa query di tenant ctx tim tsb.
    const [teamRows]: any = await (storage as any).pool.execute(`SELECT * FROM teams WHERE id = ?`, [Number(req.params.id)]);
    const teamRaw = (teamRows as any[])[0];
    if (!teamRaw) return sendError(res, "Tim tidak ditemukan", 404);
    await new Promise<void>((resolve) => {
      tenantContext.run({ mitraId: Number(teamRaw.mitra_id), userId: user.id, isSuperAdmin: false }, async () => {
        try {
          const membership = await storage.getTeamMembership(Number(teamRaw.id), user.id);
          if (!membership) { sendError(res, "Bukan anggota tim ini", 403); return resolve(); }
          const events = await storage.listTeamEvents(Number(teamRaw.id));
          const participants = await storage.getParticipantsForEvents(events.map((e) => e.id));
          const visible = events.filter((e) => e.isConfidential !== 1
            || e.createdBy === user.id || (participants.get(e.id) ?? []).includes(user.id));
          const ics = buildTeamCalendarIcs(
            `JABNET - ${teamRaw.name}`,
            visible.map((e) => ({ id: e.id, title: e.title, startAt: e.startAt, endAt: e.endAt, recurrence: e.recurrence, notes: e.notes })),
            new Date(),
          );
          res.setHeader("Content-Type", "text/calendar; charset=utf-8");
          res.setHeader("Content-Disposition", `inline; filename="jabnet-team-${teamRaw.id}.ics"`);
          res.send(ics);
        } catch (e: any) {
          sendError(res, e?.message ?? "Internal error", 500);
        }
        resolve();
      });
    });
  } catch (e: any) {
    sendError(res, e?.message ?? "Internal error", 500);
  }
});

// -- Teamspace Fase 2: Check-in (FR-8xx) --

router.get("/api/teamspace/teams/:id/checkins", async (req, res) => {
  if (!requireTeamModule(req, res, "team_checkins")) return;
  const loaded = await loadTeamForView(req, res);
  if (!loaded) return;
  const questions = await storage.listCheckinQuestions(loaded.team.id);
  const recipients = await storage.getRecipientsForQuestions(questions.map((q) => q.id));
  const uid = req.authUser!.id;
  const out = [];
  for (const q of questions) {
    const rcpts = recipients.get(q.id) ?? [];
    // Instance terakhir: completion + apakah SAYA masih perlu menjawab.
    let lastCompletion: { date: string; responded: number; total: number } | null = null;
    let myPending = false;
    let myResponse: string | null = null;
    if (q.lastSentDate) {
      const responses = await storage.listCheckinResponses(q.id, 200);
      const lastResponses = responses.filter((r) => r.responseDate === q.lastSentDate);
      lastCompletion = { date: q.lastSentDate, responded: lastResponses.length, total: rcpts.length };
      const mine = lastResponses.find((r) => r.userId === uid);
      myResponse = mine?.responseText ?? null;
      myPending = rcpts.includes(uid) && !mine;
    }
    out.push({ ...q, sendDays: parseSendDays(q.sendDays), recipientIds: rcpts, lastCompletion, myPending, myResponse });
  }
  sendSuccess(res, out);
});

router.post("/api/teamspace/teams/:id/checkins", async (req, res) => {
  if (!requireTeamspaceAccess(req, res)) return;
  const team = await loadTeamForManage(req, res);   // buat pertanyaan = manager/admin (§9)
  if (!team) return;
  const { questionText, sendDays, sendTime, isConfidential, recipientIds } = req.body ?? {};
  if (!questionText || typeof questionText !== "string" || !questionText.trim()) return sendError(res, "Pertanyaan wajib diisi", 400);
  const days = Array.isArray(sendDays) ? [...new Set(sendDays.map(Number).filter((n: number) => Number.isInteger(n) && n >= 1 && n <= 7))] : [];
  if (days.length === 0) return sendError(res, "Pilih minimal satu hari pengiriman", 400);
  if (!isValidSendTime(sendTime)) return sendError(res, "Jam kirim tidak valid (format HH:mm)", 400);
  const rcpts: number[] = Array.isArray(recipientIds) ? recipientIds.map(Number).filter((n: number) => Number.isFinite(n) && n > 0) : [];
  if (rcpts.length === 0) return sendError(res, "Pilih minimal satu penerima", 400);
  const q = await storage.createCheckinQuestion({
    teamId: team.id, questionText: questionText.trim(), sendDays: days as number[], sendTime,
    isConfidential: Boolean(isConfidential), recipientIds: rcpts,
  }, req.authUser!.id);
  await logAudit(req, "CHECKIN_CREATE", "checkin_question", q.id, questionText.trim().slice(0, 80), { teamId: team.id });
  sendSuccess(res, q);
});

/** Guard edit pertanyaan: creator ATAU manager/admin tim. */
async function loadCheckinForEdit(req: Request, res: Response): Promise<import("../shared/schema.js").CheckinQuestion | null> {
  const q = await storage.getCheckinQuestion(Number(req.params.qid));
  if (!q) { sendError(res, "Pertanyaan tidak ditemukan", 404); return null; }
  if (q.createdBy === req.authUser!.id || isPipelineAdmin(req)) return q;
  const membership = await storage.getTeamMembership(q.teamId, req.authUser!.id);
  const ok = canManageTeam({
    isAdmin: false, teamsKeyLevel: teamsKeyLevelOf(req),
    teamRole: membership ? parseTeamRole(membership.role) : null,
  });
  if (!ok) { sendError(res, "Hanya pembuat atau manager tim yang boleh mengubah pertanyaan ini", 403); return null; }
  return q;
}

router.patch("/api/teamspace/checkins/:qid", async (req, res) => {
  if (!requireTeamspaceAccess(req, res)) return;
  const q = await loadCheckinForEdit(req, res);
  if (!q) return;
  const { questionText, sendDays, sendTime, isConfidential, isActive, recipientIds } = req.body ?? {};
  const patch: any = {};
  if (questionText !== undefined) {
    if (!questionText || !String(questionText).trim()) return sendError(res, "Pertanyaan tidak valid", 400);
    patch.questionText = String(questionText).trim();
  }
  if (sendDays !== undefined) {
    const days = Array.isArray(sendDays) ? [...new Set(sendDays.map(Number).filter((n: number) => Number.isInteger(n) && n >= 1 && n <= 7))] : [];
    if (days.length === 0) return sendError(res, "Pilih minimal satu hari", 400);
    patch.sendDays = days;
  }
  if (sendTime !== undefined) {
    if (!isValidSendTime(sendTime)) return sendError(res, "Jam kirim tidak valid", 400);
    patch.sendTime = sendTime;
  }
  if (isConfidential !== undefined) patch.isConfidential = Boolean(isConfidential);
  if (isActive !== undefined) patch.isActive = Boolean(isActive);
  if (Array.isArray(recipientIds)) patch.recipientIds = recipientIds.map(Number).filter((n: number) => Number.isFinite(n) && n > 0);
  sendSuccess(res, await storage.updateCheckinQuestion(q.id, patch));
});

router.delete("/api/teamspace/checkins/:qid", async (req, res) => {
  if (!requireTeamspaceAccess(req, res)) return;
  const q = await loadCheckinForEdit(req, res);
  if (!q) return;
  await storage.deleteCheckinQuestion(q.id);
  await logAudit(req, "CHECKIN_DELETE", "checkin_question", q.id, q.questionText.slice(0, 80));
  sendSuccess(res, { ok: true });
});

/** Jawab instance check-in (FR-804) - penerima saja; instance = lastSentDate (default). */
router.post("/api/teamspace/checkins/:qid/respond", async (req, res) => {
  if (!requireTeamModule(req, res, "team_checkins")) return;
  const q = await storage.getCheckinQuestion(Number(req.params.qid));
  if (!q) return sendError(res, "Pertanyaan tidak ditemukan", 404);
  const rcpts = (await storage.getRecipientsForQuestions([q.id])).get(q.id) ?? [];
  if (!rcpts.includes(req.authUser!.id)) return sendError(res, "Anda bukan penerima pertanyaan ini", 403);
  const text = String(req.body?.responseText ?? "").trim();
  if (!text) return sendError(res, "Jawaban wajib diisi", 400);
  const responseDate = q.lastSentDate ?? new Date().toISOString().slice(0, 10);
  const row = await storage.upsertCheckinResponse(q.id, req.authUser!.id, responseDate, text);
  // Beritahu pembuat pertanyaan.
  if (q.createdBy !== req.authUser!.id) {
    await storage.createNotification({
      userId: q.createdBy, type: "checkin_response", title: "Jawaban check-in baru",
      message: `${req.authUser!.name}: ${text.slice(0, 60)}`,
      link: `/teamspace/teams/${q.teamId}`, entityType: "checkin_question", entityId: q.id,
      fromUserId: req.authUser!.id,
    });
  }
  sendSuccess(res, row);
});

/** Rekap jawaban (FR-804). Rahasia → hanya pembuat/manager/admin. */
router.get("/api/teamspace/checkins/:qid/responses", async (req, res) => {
  if (!requireTeamModule(req, res, "team_checkins")) return;
  const q = await storage.getCheckinQuestion(Number(req.params.qid));
  if (!q) return sendError(res, "Pertanyaan tidak ditemukan", 404);
  const membership = await storage.getTeamMembership(q.teamId, req.authUser!.id);
  if (!membership && !isPipelineAdmin(req) && teamsKeyLevelOf(req) === "none") {
    return sendError(res, "Akses ditolak", 403);
  }
  if (q.isConfidential === 1) {
    const isManager = membership ? parseTeamRole(membership.role) === "manager" : false;
    if (!(q.createdBy === req.authUser!.id || isManager || isPipelineAdmin(req))) {
      // Penerima hanya boleh lihat jawaban miliknya sendiri.
      const mine = (await storage.listCheckinResponses(q.id)).filter((r) => r.userId === req.authUser!.id);
      return sendSuccess(res, mine);
    }
  }
  sendSuccess(res, await storage.listCheckinResponses(q.id));
});

// -- Teamspace Fase 2: Dokumen & File (FR-9xx) --

router.get("/api/teamspace/teams/:id/docs", async (req, res) => {
  if (!requireTeamModule(req, res, "team_docs")) return;
  const loaded = await loadTeamForView(req, res);
  if (!loaded) return;
  const includeArchived = req.query.archived === "1";
  const [folders, documents, files] = await Promise.all([
    storage.listTeamFolders(loaded.team.id),
    storage.listTeamDocuments(loaded.team.id, includeArchived),
    storage.listTeamFiles(loaded.team.id, includeArchived),
  ]);
  const confidentialIds = documents.filter((d) => d.isConfidential === 1).map((d) => d.id);
  const recipientsMap = await storage.getRecipientsForOwners("document", confidentialIds);
  const visibleDocs = documents.filter((d) => d.isConfidential !== 1
    || canSeeConfidential(req, d.createdBy, recipientsMap.get(d.id) ?? []));
  sendSuccess(res, {
    folders,
    documents: visibleDocs.map((d) => ({ ...d, recipientIds: recipientsMap.get(d.id) ?? [] })),
    files,
  });
});

router.post("/api/teamspace/teams/:id/folders", async (req, res) => {
  if (!requireTeamModule(req, res, "team_docs", true)) return;
  const loaded = await loadTeamForMember(req, res);
  if (!loaded) return;
  const name = String(req.body?.name ?? "").trim();
  if (!name) return sendError(res, "Nama folder wajib diisi", 400);
  const parentFolderId = req.body?.parentFolderId ? Number(req.body.parentFolderId) : null;
  if (parentFolderId != null) {
    const parent = await storage.getTeamFolder(parentFolderId);
    if (!parent || parent.teamId !== loaded.team.id) return sendError(res, "Folder induk tidak valid", 400);
  }
  sendSuccess(res, await storage.createTeamFolder(loaded.team.id, name, parentFolderId, req.authUser!.id));
});

router.patch("/api/teamspace/folders/:folderId", async (req, res) => {
  if (!requireTeamModule(req, res, "team_docs", true)) return;
  const folder = await storage.getTeamFolder(Number(req.params.folderId));
  if (!folder) return sendError(res, "Folder tidak ditemukan", 404);
  const name = String(req.body?.name ?? "").trim();
  if (!name) return sendError(res, "Nama folder wajib diisi", 400);
  await storage.renameTeamFolder(folder.id, name);
  sendSuccess(res, { ok: true });
});

router.delete("/api/teamspace/folders/:folderId", async (req, res) => {
  if (!requireTeamModule(req, res, "team_docs", true)) return;
  const folder = await storage.getTeamFolder(Number(req.params.folderId));
  if (!folder) return sendError(res, "Folder tidak ditemukan", 404);
  try {
    await storage.deleteTeamFolder(folder.id);
  } catch (e: any) {
    return sendError(res, e?.message ?? "Gagal menghapus folder", 400);
  }
  sendSuccess(res, { ok: true });
});

router.post("/api/teamspace/teams/:id/docs", async (req, res) => {
  if (!requireTeamModule(req, res, "team_docs", true)) return;
  const loaded = await loadTeamForMember(req, res);
  if (!loaded) return;
  const { title, content, folderId, isConfidential, recipientIds } = req.body ?? {};
  if (!title || typeof title !== "string" || !title.trim()) return sendError(res, "Judul dokumen wajib diisi", 400);
  const doc = await storage.createTeamDocument({
    teamId: loaded.team.id, folderId: folderId ? Number(folderId) : null,
    title: title.trim(), content: typeof content === "string" ? content : null,
    isConfidential: Boolean(isConfidential),
    recipientIds: Array.isArray(recipientIds) ? recipientIds.map(Number).filter((n: number) => n > 0) : [],
  }, req.authUser!.id);
  await logAudit(req, "TEAM_DOC_CREATE", "team_document", doc.id, doc.title, { teamId: loaded.team.id });
  sendSuccess(res, doc);
});

/** Guard dokumen: baca = anggota + (non-rahasia | creator/penerima/admin); edit = creator/manager/admin. */
async function loadDocForAccess(req: Request, res: Response, forEdit: boolean): Promise<import("../shared/schema.js").TeamDocument | null> {
  const doc = await storage.getTeamDocument(Number(req.params.docId));
  if (!doc) { sendError(res, "Dokumen tidak ditemukan", 404); return null; }
  const membership = await storage.getTeamMembership(doc.teamId, req.authUser!.id);
  if (!membership && !isPipelineAdmin(req) && teamsKeyLevelOf(req) === "none") {
    sendError(res, "Akses ditolak", 403); return null;
  }
  if (doc.isConfidential === 1) {
    const rcpts = await storage.getContentRecipients("document", doc.id);
    if (!canSeeConfidential(req, doc.createdBy, rcpts)) { sendError(res, "Dokumen tidak ditemukan", 404); return null; }
  }
  if (forEdit) {
    const ok = doc.createdBy === req.authUser!.id || isPipelineAdmin(req) || canManageTeam({
      isAdmin: false, teamsKeyLevel: teamsKeyLevelOf(req),
      teamRole: membership ? parseTeamRole(membership.role) : null,
    });
    if (!ok) { sendError(res, "Hanya pembuat atau manager tim yang boleh mengubah dokumen ini", 403); return null; }
  }
  return doc;
}

router.get("/api/teamspace/docs/:docId", async (req, res) => {
  if (!requireTeamModule(req, res, "team_docs")) return;
  const doc = await loadDocForAccess(req, res, false);
  if (!doc) return;
  const recipientIds = doc.isConfidential === 1 ? await storage.getContentRecipients("document", doc.id) : [];
  sendSuccess(res, { ...doc, recipientIds });
});

router.patch("/api/teamspace/docs/:docId", async (req, res) => {
  if (!requireTeamModule(req, res, "team_docs", true)) return;
  const doc = await loadDocForAccess(req, res, true);
  if (!doc) return;
  const { title, content, folderId, isConfidential, recipientIds } = req.body ?? {};
  const patch: any = {};
  if (title !== undefined) {
    if (!title || !String(title).trim()) return sendError(res, "Judul tidak valid", 400);
    patch.title = String(title).trim();
  }
  if (content !== undefined) patch.content = typeof content === "string" ? content : null;
  if (folderId !== undefined) patch.folderId = folderId ? Number(folderId) : null;
  if (isConfidential !== undefined) patch.isConfidential = Boolean(isConfidential);
  if (Array.isArray(recipientIds)) patch.recipientIds = recipientIds.map(Number).filter((n: number) => n > 0);
  sendSuccess(res, await storage.updateTeamDocument(doc.id, patch, req.authUser!.id));
});

router.post("/api/teamspace/docs/:docId/archive", async (req, res) => {
  if (!requireTeamModule(req, res, "team_docs", true)) return;
  const doc = await loadDocForAccess(req, res, true);
  if (!doc) return;
  await storage.setTeamDocumentArchived(doc.id, req.body?.archived !== false);
  sendSuccess(res, { ok: true });
});

router.post("/api/teamspace/teams/:id/files", async (req, res) => {
  if (!requireTeamModule(req, res, "team_docs", true)) return;
  const loaded = await loadTeamForMember(req, res);
  if (!loaded) return;
  let parsed;
  try {
    parsed = await parseMultipart(req, { maxBytes: ATTACHMENT_MAX_BYTES, maxFiles: 5, maxTotalBytes: 60 * 1024 * 1024 });
  } catch (e: any) {
    return sendError(res, e?.message || "Upload gagal", 413);
  }
  if (parsed.files.length === 0) return sendError(res, "Pilih minimal satu file", 400);
  const folderId = parsed.fields.folderId ? Number(parsed.fields.folderId) : null;
  const slug = await storage.getMitraSlug(req.authUser!.activeMitraId);
  const saved = [];
  for (const f of parsed.files) {
    const v = validateAttachment(f.fileName, f.buffer.length);
    if (!v.ok) return sendError(res, `${f.fileName}: ${v.error}`, 400);
    const rel = await saveUploadedFile(slug, `teamfile-${loaded.team.id}`, f.buffer, v.ext!);
    saved.push(await storage.addTeamFile({
      teamId: loaded.team.id, folderId, fileName: f.fileName, filePath: rel,
      mimeType: v.mime!, sizeBytes: f.buffer.length,
    }, req.authUser!.id));
  }
  sendSuccess(res, saved);
});

router.get("/api/teamspace/files/:fileId/raw", async (req, res) => {
  if (!requireTeamModule(req, res, "team_docs")) return;
  const file = await storage.getTeamFile(Number(req.params.fileId));
  if (!file) return sendError(res, "File tidak ditemukan", 404);
  const membership = await storage.getTeamMembership(file.teamId, req.authUser!.id);
  if (!membership && !isPipelineAdmin(req) && teamsKeyLevelOf(req) === "none") {
    return sendError(res, "Akses ditolak", 403);
  }
  await streamFile(file.filePath, res, { download: req.query.download === "1", fileName: file.fileName });
});

router.post("/api/teamspace/files/:fileId/archive", async (req, res) => {
  if (!requireTeamModule(req, res, "team_docs", true)) return;
  const file = await storage.getTeamFile(Number(req.params.fileId));
  if (!file) return sendError(res, "File tidak ditemukan", 404);
  if (file.uploadedBy !== req.authUser!.id && !isPipelineAdmin(req)) {
    const membership = await storage.getTeamMembership(file.teamId, req.authUser!.id);
    const ok = canManageTeam({
      isAdmin: false, teamsKeyLevel: teamsKeyLevelOf(req),
      teamRole: membership ? parseTeamRole(membership.role) : null,
    });
    if (!ok) return sendError(res, "Hanya pengunggah atau manager tim yang boleh mengarsipkan file ini", 403);
  }
  await storage.setTeamFileArchived(file.id, req.body?.archived !== false);
  sendSuccess(res, { ok: true });
});

// -- Teamspace: Pengumuman per-tim (BUG-004 / FR-6xx) --
// Berbeda dari /announcements company-wide (changelog): ini komunikasi internal tim,
// bertarget + Rahasia + expiry, dikirim manager tim ke anggotanya.

router.get("/api/teamspace/teams/:id/announcements", async (req, res) => {
  if (!requireTeamModule(req, res, "team_announcements")) return;
  const loaded = await loadTeamForView(req, res);
  if (!loaded) return;
  const list = await storage.listTeamAnnouncements(loaded.team.id);
  const confidentialIds = list.filter((a) => (a as any).isConfidential === 1).map((a) => a.id);
  const recipientsMap = await storage.getRecipientsForOwners("announcement", confidentialIds);
  const nowIso = new Date().toISOString();
  const visible = list.filter((a) => (a as any).isConfidential !== 1
    || canSeeConfidential(req, a.authorId, recipientsMap.get(a.id) ?? []));
  sendSuccess(res, visible.map((a) => ({
    ...a,
    recipientIds: (a as any).isConfidential === 1 ? (recipientsMap.get(a.id) ?? []) : [],
    isExpired: Boolean((a as any).expiresAt && (a as any).expiresAt < nowIso),
  })));
});

router.post("/api/teamspace/teams/:id/announcements", async (req, res) => {
  if (!requireTeamModule(req, res, "team_announcements", true)) return;
  const team = await loadTeamForManage(req, res);   // kirim pengumuman = manager/admin (§9)
  if (!team) return;
  const { title, content, isConfidential, recipientIds, expiresInDays } = req.body ?? {};
  if (!title || typeof title !== "string" || !title.trim()) return sendError(res, "Judul pengumuman wajib diisi", 400);
  if (!content || typeof content !== "string" || !content.trim()) return sendError(res, "Isi pengumuman wajib diisi", 400);
  const targetIds: number[] = Array.isArray(recipientIds) ? recipientIds.map(Number).filter((n: number) => Number.isFinite(n) && n > 0) : [];
  if (isConfidential && targetIds.length === 0) return sendError(res, "Pengumuman Rahasia butuh minimal satu penerima", 400);
  const expiresAt = Number.isFinite(Number(expiresInDays)) && Number(expiresInDays) > 0
    ? new Date(Date.now() + Number(expiresInDays) * 86400_000).toISOString() : null;
  const row = await storage.createAnnouncement({
    title: title.trim(), content: content.trim(), category: "announcement",
    authorId: req.authUser!.id, publishedAt: new Date().toISOString(),
    teamId: team.id, isConfidential: Boolean(isConfidential), expiresAt,
  } as any);
  if (targetIds.length > 0) await storage.setContentRecipients("announcement", row.id, targetIds);
  // Notifikasi: ke penerima terpilih, atau ke seluruh anggota tim bila broadcast.
  const notifyIds = targetIds.length > 0 ? targetIds
    : (await storage.listTeamMembers(team.id)).map((mb) => mb.userId);
  for (const uid of notifyIds) {
    if (uid === req.authUser!.id) continue;
    await storage.createNotification({
      userId: uid, type: "announcement", title: ` ${team.name}: ${row.title}`,
      message: row.content.length > 140 ? row.content.slice(0, 137) + "..." : row.content,
      link: `/teamspace/teams/${team.id}?tab=announcements`, entityType: "announcement", entityId: row.id,
      fromUserId: req.authUser!.id,
    }).catch(() => {});
  }
  await logAudit(req, "TEAM_ANNOUNCEMENT_CREATE", "announcement", row.id, row.title, { teamId: team.id });
  sendSuccess(res, row);
});

/** Guard edit pengumuman tim: penulis ATAU manager/admin tim tsb. */
async function loadTeamAnnouncementForEdit(req: Request, res: Response): Promise<import("../shared/schema.js").Announcement | null> {
  const row = await storage.getAnnouncement(Number(req.params.aid));
  if (!row || (row as any).teamId == null) { sendError(res, "Pengumuman tidak ditemukan", 404); return null; }
  if (row.authorId === req.authUser!.id || isPipelineAdmin(req)) return row;
  const membership = await storage.getTeamMembership((row as any).teamId, req.authUser!.id);
  const ok = canManageTeam({
    isAdmin: false, teamsKeyLevel: teamsKeyLevelOf(req),
    teamRole: membership ? parseTeamRole(membership.role) : null,
  });
  if (!ok) { sendError(res, "Hanya penulis atau manager tim yang boleh mengubah pengumuman ini", 403); return null; }
  return row;
}

router.patch("/api/teamspace/announcements/:aid", async (req, res) => {
  if (!requireTeamModule(req, res, "team_announcements", true)) return;
  const row = await loadTeamAnnouncementForEdit(req, res);
  if (!row) return;
  const patch: any = {};
  if (req.body?.title !== undefined) {
    if (!String(req.body.title).trim()) return sendError(res, "Judul tidak valid", 400);
    patch.title = String(req.body.title).trim();
  }
  if (req.body?.content !== undefined) {
    if (!String(req.body.content).trim()) return sendError(res, "Isi tidak valid", 400);
    patch.content = String(req.body.content).trim();
  }
  if (Object.keys(patch).length > 0) await storage.updateAnnouncement(row.id, patch);
  if (req.body?.isConfidential !== undefined || req.body?.expiresInDays !== undefined) {
    const expiresAt = req.body.expiresInDays !== undefined
      ? (Number(req.body.expiresInDays) > 0 ? new Date(Date.now() + Number(req.body.expiresInDays) * 86400_000).toISOString() : null)
      : undefined;
    await storage.setAnnouncementTargeting(row.id, {
      isConfidential: req.body.isConfidential !== undefined ? Boolean(req.body.isConfidential) : undefined,
      expiresAt,
    });
  }
  if (Array.isArray(req.body?.recipientIds)) {
    await storage.setContentRecipients("announcement", row.id, req.body.recipientIds.map(Number).filter((n: number) => n > 0));
  }
  sendSuccess(res, { ok: true });
});

router.delete("/api/teamspace/announcements/:aid", async (req, res) => {
  if (!requireTeamModule(req, res, "team_announcements", true)) return;
  const row = await loadTeamAnnouncementForEdit(req, res);
  if (!row) return;
  await storage.deleteAnnouncement(row.id);
  await storage.setContentRecipients("announcement", row.id, []);
  await logAudit(req, "TEAM_ANNOUNCEMENT_DELETE", "announcement", row.id, row.title);
  sendSuccess(res, { ok: true });
});

// -- Teamspace Fase 3: Laporan Kinerja terpadu (FR-10xx) --

interface TsPerfParams { from: string; to: string; teamId?: number; userId?: number }

/** Hitung laporan kinerja: tugas tim + check-in + output ops, per user + total.
 *  Scope: supervisor (admin / teams / performance_reports:write) lihat semua;
 *  manager lihat tim yang ia kelola; member lihat dirinya sendiri. */
async function computeTeamspacePerformance(req: Request, opts: TsPerfParams) {
  const uid = req.authUser!.id;
  const supervisor = isPipelineAdmin(req) || teamsKeyLevelOf(req) !== "none" || hasWritePermission(req, "performance_reports");
  let teamsList: any[] = supervisor
    ? (await storage.listTeams(false)).map((t) => ({ ...t, myRole: null as string | null }))
    : await storage.listTeamsForUser(uid);
  const managedIds = new Set<number>();
  if (!supervisor) for (const t of teamsList) if (t.myRole === "manager") managedIds.add(t.id);
  if (opts.teamId) teamsList = teamsList.filter((t) => t.id === opts.teamId);

  // Visible users: supervisor → semua; manager → anggota tim yang dikelola + diri sendiri; member → diri sendiri.
  let visibleUsers: Set<number> | null = null;
  if (!supervisor) {
    visibleUsers = new Set<number>([uid]);
    for (const tid of managedIds) {
      for (const mb of await storage.listTeamMembers(tid)) visibleUsers.add(mb.userId);
    }
  }
  const userVisible = (id: number | null | undefined): boolean =>
    id != null && (visibleUsers === null || visibleUsers.has(id)) && (opts.userId == null || id === opts.userId);

  const pipelineIds = teamsList.map((t) => t.taskPipelineId).filter((x): x is number => x != null);
  const [stagesMap, cards] = await Promise.all([
    storage.listStagesForPipelines(pipelineIds),
    storage.listCardsForPipelines(pipelineIds),
  ]);
  const secondaryByCard = await storage.getSecondaryAssigneesForCards(cards.map((c) => c.id));
  const doneStages = new Set<number>();
  const cancelledStages = new Set<number>();
  for (const stages of stagesMap.values()) {
    for (const s of stages) {
      if ((s as any).semanticType === "done") doneStages.add(s.id);
      if ((s as any).semanticType === "cancelled") cancelledStages.add(s.id);
    }
  }
  const fromIso = new Date(`${opts.from}T00:00:00`).toISOString();
  const toIso = new Date(`${opts.to}T23:59:59`).toISOString();
  const nowIso = new Date().toISOString();
  const teamByPipeline = new Map(teamsList.filter((t) => t.taskPipelineId != null).map((t) => [t.taskPipelineId as number, t]));

  const isDone = (c: any) => c.isCompleted === 1 || doneStages.has(c.stageId);
  const completedDateOf = (c: any): string | null => c.completedAt ?? (doneStages.has(c.stageId) ? (c.stageEnteredAt ?? c.updatedAt ?? null) : null);
  const statusOf = (c: any): "selesai" | "terlambat" | "dikerjakan" | "belum" => {
    if (isDone(c)) return "selesai";
    if (c.dueDate && c.dueDate < nowIso) return "terlambat";
    const st = (stagesMap.get(c.pipelineId) ?? []).find((s) => s.id === c.stageId);
    return (st as any)?.semanticType === "in_progress" ? "dikerjakan" : "belum";
  };
  // Aktif pada periode: dibuat sebelum akhir periode, dan (belum selesai ATAU selesai setelah awal periode).
  const periodCards = cards.filter((c) => !cancelledStages.has(c.stageId)
    && c.createdAt <= toIso
    && (!isDone(c) || (completedDateOf(c) ?? nowIso) >= fromIso));

  // -- Totals (per kartu, tanpa double-count assignee) --
  const distribution = { belum: 0, dikerjakan: 0, terlambat: 0, selesai: 0 };
  let totOnTimeNum = 0, totOnTimeDen = 0, totCycleSum = 0, totCycleN = 0;
  for (const c of periodCards) {
    distribution[statusOf(c)]++;
    if (isDone(c)) {
      const done = completedDateOf(c);
      if (done && c.dueDate) { totOnTimeDen++; if (done <= c.dueDate) totOnTimeNum++; }
      if (done) { totCycleSum += Math.max(0, (new Date(done).getTime() - new Date(c.createdAt).getTime()) / 86400_000); totCycleN++; }
    }
  }

  // -- Per-user tugas --
  interface UserAgg {
    selesai: number; dikerjakan: number; belum: number; terlambat: number;
    onTimeNum: number; onTimeDen: number; cycleSum: number; cycleN: number;
    checkinExpected: number; checkinResponded: number;
  }
  const perUser = new Map<number, UserAgg>();
  const aggOf = (id: number): UserAgg => {
    const cur = perUser.get(id) ?? { selesai: 0, dikerjakan: 0, belum: 0, terlambat: 0, onTimeNum: 0, onTimeDen: 0, cycleSum: 0, cycleN: 0, checkinExpected: 0, checkinResponded: 0 };
    perUser.set(id, cur);
    return cur;
  };
  for (const c of periodCards) {
    const targets = new Set<number>([c.assigneeId ?? -1, ...(secondaryByCard.get(c.id) ?? [])]);
    targets.delete(-1);
    // BUG-006: kartu tanpa penanggung jawab dikreditkan ke pembuatnya, supaya angka
    // "Kinerja per Anggota" rekonsiliasi dengan total di atas (tiap kartu non-batal
    // pasti punya creator) - bukan hilang dari tabel dan memunculkan empty-state palsu.
    if (targets.size === 0) targets.add(c.createdBy);
    const st = statusOf(c);
    for (const t of targets) {
      if (!userVisible(t)) continue;
      const a = aggOf(t);
      a[st]++;
      if (st === "selesai") {
        const done = completedDateOf(c);
        if (done && c.dueDate) { a.onTimeDen++; if (done <= c.dueDate) a.onTimeNum++; }
        if (done) { a.cycleSum += Math.max(0, (new Date(done).getTime() - new Date(c.createdAt).getTime()) / 86400_000); a.cycleN++; }
      }
    }
  }

  // -- Check-in rate per user (instance = tanggal jawaban terobservasi ∪ lastSentDate dalam periode) --
  for (const t of teamsList) {
    const questions = await storage.listCheckinQuestions(t.id);
    if (questions.length === 0) continue;
    const recipientsMap = await storage.getRecipientsForQuestions(questions.map((q) => q.id));
    for (const q of questions) {
      const responses = (await storage.listCheckinResponses(q.id)).filter((r) => r.responseDate >= opts.from && r.responseDate <= opts.to);
      const instanceDates = new Set(responses.map((r) => r.responseDate));
      if (q.lastSentDate && q.lastSentDate >= opts.from && q.lastSentDate <= opts.to) instanceDates.add(q.lastSentDate);
      if (instanceDates.size === 0) continue;
      const rcpts = recipientsMap.get(q.id) ?? [];
      for (const r of rcpts) {
        if (!userVisible(r)) continue;
        const a = aggOf(r);
        a.checkinExpected += instanceDates.size;
        a.checkinResponded += responses.filter((x) => x.userId === r).length;
      }
    }
  }

  // -- Ops terpadu (FR-1006) --
  const opsMap = await storage.getOpsStatsForUsers(fromIso, toIso);
  for (const [id] of opsMap) if (userVisible(id)) aggOf(id);   // pastikan user ops-only ikut tampil
  let maxOpsTotal = 0;
  const opsTotalOf = (id: number) => {
    const o = opsMap.get(id);
    return o ? o.ticketsResolved + o.leadsWon + o.collectionsClosed + o.canvassingReports : 0;
  };
  for (const id of perUser.keys()) maxOpsTotal = Math.max(maxOpsTotal, opsTotalOf(id));

  // -- Kemungkinan Penghambat (FR-1003) --
  const threshold = Number(await storage.getMitraSetting("teamspace_stuck_threshold_days")) || 40;
  const nowMs = Date.now();
  const blockers = cards
    .filter((c) => !isDone(c) && !cancelledStages.has(c.stageId))
    .map((c) => ({ card: c, ageDays: Math.floor((nowMs - new Date(c.createdAt).getTime()) / 86400_000) }))
    .filter((x) => x.ageDays >= threshold)
    .filter((x) => supervisor
      || managedIds.has(teamByPipeline.get(x.card.pipelineId)?.id ?? -1)
      || x.card.assigneeId === uid
      || (secondaryByCard.get(x.card.id) ?? []).includes(uid))
    .sort((a, b) => b.ageDays - a.ageDays)
    .slice(0, 10)
    .map((x) => ({
      id: x.card.id, title: x.card.title, ageDays: x.ageDays,
      assigneeId: x.card.assigneeId,
      teamId: teamByPipeline.get(x.card.pipelineId)?.id ?? null,
      teamName: teamByPipeline.get(x.card.pipelineId)?.name ?? null,
      pipelineId: x.card.pipelineId,
      status: statusOf(x.card),
    }));

  // -- Skor deterministik (§14.3) --
  const weights = parseScoreWeights(await storage.getMitraSetting("teamspace_score_weights"));
  const users = [...perUser.entries()].map(([id, a]) => {
    const total = a.selesai + a.dikerjakan + a.belum + a.terlambat;
    const ops = opsMap.get(id) ?? { ticketsResolved: 0, leadsWon: 0, collectionsClosed: 0, canvassingClosed: 0, canvassingReports: 0 } as any;
    const opsTotal = opsTotalOf(id);
    const inputs = {
      onTimeRate: a.onTimeDen > 0 ? a.onTimeNum / a.onTimeDen : null,
      completionRate: total > 0 ? a.selesai / total : null,
      checkinRate: a.checkinExpected > 0 ? a.checkinResponded / a.checkinExpected : null,
      opsNorm: maxOpsTotal > 0 ? opsTotal / maxOpsTotal : null,
    };
    return {
      userId: id,
      tasks: { selesai: a.selesai, dikerjakan: a.dikerjakan, belum: a.belum, terlambat: a.terlambat, total },
      onTimeRate: inputs.onTimeRate,
      avgCycleDays: a.cycleN > 0 ? Math.round((a.cycleSum / a.cycleN) * 10) / 10 : null,
      checkin: { expected: a.checkinExpected, responded: a.checkinResponded, rate: inputs.checkinRate },
      ops: { ticketsResolved: ops.ticketsResolved ?? 0, leadsWon: ops.leadsWon ?? 0, collectionsClosed: ops.collectionsClosed ?? 0, canvassingReports: ops.canvassingReports ?? 0, total: opsTotal },
      ...(computeScore(inputs, weights) ?? { score: null, stars: null, label: null }),
    };
  }).sort((x, y) => (y.score ?? -1) - (x.score ?? -1));

  return {
    period: { from: opts.from, to: opts.to },
    scope: { supervisor, teamIds: teamsList.map((t) => t.id) },
    teams: teamsList.map((t) => ({ id: t.id, name: t.name, color: t.color })),
    totals: {
      distribution,
      totalActive: periodCards.length,
      onTimeRate: totOnTimeDen > 0 ? totOnTimeNum / totOnTimeDen : null,
      avgCycleDays: totCycleN > 0 ? Math.round((totCycleSum / totCycleN) * 10) / 10 : null,
    },
    users,
    blockers,
    threshold,
    weights,
  };
}

function parsePerfParams(req: Request): TsPerfParams {
  const now = new Date();
  const defTo = localDateStr(now);
  const defFrom = localDateStr(new Date(now.getTime() - 29 * 86400_000));
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from ?? "")) ? String(req.query.from) : defFrom;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to ?? "")) ? String(req.query.to) : defTo;
  const teamId = req.query.teamId ? Number(req.query.teamId) : undefined;
  const userId = req.query.userId ? Number(req.query.userId) : undefined;
  return { from, to, teamId, userId };
}

router.get("/api/teamspace/performance", async (req, res) => {
  if (!requirePermission(req, res, "performance_reports")) return;
  sendSuccess(res, await computeTeamspacePerformance(req, parsePerfParams(req)));
});

/** Saran AI (FR-1004): 1 paragraf bahasa natural dari statistik AKTUAL via Claude API.
 *  Key & toggle di appSettings (pola google_maps_api_key) - cache 24 jam per kombinasi filter. */
const tsAiCache = new Map<string, { text: string; expiresAt: number }>();
router.get("/api/teamspace/performance/suggestion", async (req, res) => {
  if (!requirePermission(req, res, "performance_reports")) return;
  const enabled = (await storage.getMitraSetting("teamspace_ai_enabled")) === "true";
  const apiKey = await storage.getMitraSetting("anthropic_api_key");
  if (!enabled || !apiKey) {
    return sendError(res, "Saran AI belum aktif - set 'teamspace_ai_enabled=true' dan 'anthropic_api_key' di pengaturan (halaman Integrasi / app_settings)", 400);
  }
  const p = parsePerfParams(req);
  const cacheKey = `${req.authUser!.activeMitraId}:${p.from}:${p.to}:${p.teamId ?? 0}:${p.userId ?? 0}:${localDateStr(new Date())}`;
  const hit = tsAiCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return sendSuccess(res, { suggestion: hit.text, cached: true });

  const stats = await computeTeamspacePerformance(req, p);
  // Prompt deterministik: angka disuntik apa adanya; instruksi anti-halusinasi eksplisit (FR-1004).
  const prompt = [
    "Kamu adalah asisten analisis kinerja tim untuk ISP JABNET (bahasa Indonesia).",
    "Berdasarkan data JSON berikut, tulis TEPAT SATU paragraf (4-6 kalimat) rangkuman kondisi kinerja periode ini.",
    "Aturan ketat: sebut hanya angka yang ADA di data - jangan mengarang angka, nama, atau penyebab.",
    "Sorot: distribusi status tugas, on-time rate, tugas macet (blockers) bila ada, dan 1 saran tindakan konkret.",
    "",
    "DATA:",
    JSON.stringify({
      periode: stats.period,
      totalTugasAktif: stats.totals.totalActive,
      distribusi: stats.totals.distribution,
      onTimeRatePersen: stats.totals.onTimeRate != null ? Math.round(stats.totals.onTimeRate * 100) : null,
      rataCycleHari: stats.totals.avgCycleDays,
      jumlahAnggotaDinilai: stats.users.length,
      skorTertinggi: stats.users[0]?.score ?? null,
      skorTerendah: stats.users.length ? stats.users[stats.users.length - 1]?.score ?? null : null,
      tugasMacet: stats.blockers.map((b) => ({ judul: b.title, umurHari: b.ageDays, tim: b.teamName })),
      thresholdMacetHari: stats.threshold,
    }),
  ].join("\n");
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const json: any = await resp.json();
    if (!resp.ok) return sendError(res, `Claude API error: ${json?.error?.message ?? resp.status}`, 502);
    const text = String(json?.content?.[0]?.text ?? "").trim();
    if (!text) return sendError(res, "Claude API mengembalikan jawaban kosong", 502);
    tsAiCache.set(cacheKey, { text, expiresAt: Date.now() + 24 * 3600_000 });
    sendSuccess(res, { suggestion: text, cached: false });
  } catch (e: any) {
    sendError(res, `Gagal memanggil Claude API: ${e?.message}`, 502);
  }
});

// -- Teamspace Fase 3: Cheers (FR-1203) --

// ==================== SDM / HRD Fase 1 (v5.1) ====================
// Kehadiran & rekap: butuh izin hr_sdm. Cuti: semua staff boleh ajukan untuk
// diri sendiri + lihat riwayatnya (self-service, "ngelink ke HRD"); daftar
// penuh + approve/reject butuh hr_sdm.

/** Registry karyawan: cek akun mana yang karyawan resmi - hub data lintas divisi. */
router.get("/api/hr/employees", async (req, res) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "hr_sdm")) return sendError(res, "Akses ditolak: butuh izin 'hr_sdm'", 403);
  sendSuccess(res, await storage.listEmployees());
});

router.post("/api/hr/employees/:userId", async (req, res) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "hr_sdm")) return sendError(res, "Akses ditolak: butuh izin 'hr_sdm' (write)", 403);
  await storage.setEmployeeFlag(Number(req.params.userId), !!(req.body ?? {}).isEmployee);
  sendSuccess(res, { ok: true });
});

router.get("/api/hr/attendance", async (req, res) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "hr_sdm")) return sendError(res, "Akses ditolak: butuh izin 'hr_sdm'", 403);
  const date = String(req.query.date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return sendError(res, "Param date wajib format YYYY-MM-DD", 400);
  sendSuccess(res, await storage.listAttendanceByDate(date));
});

router.post("/api/hr/attendance", async (req, res) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "hr_sdm")) return sendError(res, "Akses ditolak: butuh izin 'hr_sdm' (write)", 403);
  const { records } = req.body ?? {};
  if (!Array.isArray(records) || records.length === 0) return sendError(res, "records wajib array", 400);
  if (records.length > 200) return sendError(res, "Maks 200 record per simpan", 400);
  const { HR_ATTENDANCE_STATUSES } = await import("../shared/schema.js");
  for (const r of records) {
    if (!r || !Number(r.userId) || !/^\d{4}-\d{2}-\d{2}$/.test(String(r.date ?? "")) ||
        !(HR_ATTENDANCE_STATUSES as readonly string[]).includes(String(r.status))) {
      return sendError(res, "Record tidak valid (userId/date/status)", 400);
    }
  }
  for (const r of records) {
    await storage.upsertAttendance({
      userId: Number(r.userId), date: String(r.date), status: String(r.status),
      checkIn: r.checkIn ? String(r.checkIn).slice(0, 5) : null,
      checkOut: r.checkOut ? String(r.checkOut).slice(0, 5) : null,
      note: r.note ? String(r.note).slice(0, 255) : null,
      createdBy: req.authUser!.id,
    });
  }
  sendSuccess(res, { saved: records.length });
});

router.get("/api/hr/attendance/summary", async (req, res) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "hr_sdm")) return sendError(res, "Akses ditolak: butuh izin 'hr_sdm'", 403);
  const month = String(req.query.month ?? "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return sendError(res, "Param month wajib format YYYY-MM", 400);
  sendSuccess(res, await storage.attendanceSummary(month));
});

router.get("/api/hr/leaves", async (req, res) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  // FR-HR-502: ?approver=1 → cuti tim yang menunggu SAYA (atasan langsung)
  if (req.query.approver === "1") return sendSuccess(res, await storage.listLeavesForSupervisor(req.authUser.id));
  const mineOnly = req.query.mine === "1" || !hasPermission(req, "hr_sdm");
  const status = req.query.status ? String(req.query.status) : undefined;
  sendSuccess(res, await storage.listLeaves({ userId: mineOnly ? req.authUser.id : undefined, status }));
});

router.post("/api/hr/leaves", async (req, res) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  const { startDate, endDate, type, reason, userId } = req.body ?? {};
  const { HR_LEAVE_TYPES } = await import("../shared/schema.js");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate ?? "")) || !/^\d{4}-\d{2}-\d{2}$/.test(String(endDate ?? "")))
    return sendError(res, "startDate/endDate wajib format YYYY-MM-DD", 400);
  if (String(endDate) < String(startDate)) return sendError(res, "endDate tidak boleh sebelum startDate", 400);
  if (!(HR_LEAVE_TYPES as readonly string[]).includes(String(type))) return sendError(res, "Jenis cuti tidak valid", 400);
  // Ajukan untuk orang lain hanya boleh oleh HR (hr_sdm write)
  const targetUserId = userId && Number(userId) !== req.authUser.id
    ? (hasWritePermission(req, "hr_sdm") ? Number(userId) : null)
    : req.authUser.id;
  if (targetUserId == null) return sendError(res, "Akses ditolak: hanya HR yang boleh mengajukan untuk user lain", 403);
  sendSuccess(res, await storage.createLeave({
    userId: targetUserId, startDate: String(startDate), endDate: String(endDate),
    type: String(type), reason: reason ? String(reason).slice(0, 500) : null,
  }));
});

router.post("/api/hr/leaves/:id/review", async (req, res) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  const { status, note } = req.body ?? {};
  if (status !== "approved" && status !== "rejected") return sendError(res, "status wajib approved/rejected", 400);
  const id = Number(req.params.id);
  const current = (await storage.listLeaves({ limit: 500 })).find((l) => l.id === id);
  if (!current) return sendError(res, "Pengajuan cuti tidak ditemukan", 404);
  const isHr = hasWritePermission(req, "hr_sdm");
  // FR-HR-502: tahap manager - hanya atasan langsung pengaju (atau HR) yang boleh memutus.
  if (current.status === "pending" && (current as any).stage === "manager" && !isHr) {
    const profile = await storage.getEmployeeProfile(current.userId);
    if (profile?.supervisorId !== req.authUser.id) return sendError(res, "Akses ditolak: bukan atasan langsung pengaju", 403);
    if (status === "approved") {
      await storage.managerApproveLeave(id, req.authUser.id);   // lanjut ke tahap HR
      return sendSuccess(res, { ...current, stage: "hr", managerApproved: true });
    }
    const rejected = await storage.reviewLeave(id, "rejected", req.authUser.id, note ? String(note) : null);
    return sendSuccess(res, rejected);
  }
  if (!isHr) return sendError(res, "Akses ditolak: butuh izin 'hr_sdm' (write)", 403);
  const row = await storage.reviewLeave(id, status, req.authUser.id, note ? String(note) : null);
  if (!row) return sendError(res, "Pengajuan cuti tidak ditemukan", 404);
  // Cuti disetujui → otomatis isi kehadiran "cuti" untuk rentang tanggalnya (max 60 hari).
  if (status === "approved") {
    const start = new Date(`${row.startDate}T00:00:00`);
    const end = new Date(`${row.endDate}T00:00:00`);
    for (let d = new Date(start), i = 0; d <= end && i < 60; d.setDate(d.getDate() + 1), i++) {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      await storage.upsertAttendance({ userId: row.userId, date: iso, status: "cuti", createdBy: req.authUser!.id });
    }
  }
  sendSuccess(res, row);
});

// -- PRD-HR HR-1a: presensi ESS (GPS+selfie) + approval + shift + libur + saldo cuti --

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** ESS clock in/out: semua staff. Radius kantor → di luar = antre approval (FR-HR-204/205). */
router.post("/api/hr/clock", async (req, res) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  let parsed;
  try { parsed = await parseMultipart(req, { maxBytes: 8 * 1024 * 1024, maxFiles: 1, maxTotalBytes: 8 * 1024 * 1024 }); }
  catch (e: any) { return sendError(res, e?.message || "Upload gagal", 413); }
  const kind = parsed.fields.kind === "out" ? "out" : "in";
  const lat = parsed.fields.lat ? Number(parsed.fields.lat) : null;
  const lng = parsed.fields.lng ? Number(parsed.fields.lng) : null;
  let selfiePath: string | null = null;
  if (parsed.files.length > 0) {
    const f = parsed.files[0];
    const ext = (f.fileName.split(".").pop() || "jpg").toLowerCase();
    if (!["jpg", "jpeg", "png", "webp"].includes(ext)) return sendError(res, "Selfie harus gambar (jpg/png/webp)", 400);
    const slug = await storage.getMitraSlug(req.authUser.activeMitraId);
    selfiePath = await saveUploadedFile(slug, `hr-selfie-${req.authUser.id}`, f.buffer, ext);
  }
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const offices = await storage.listOfficeLocations();
  const withinRadius = offices.length === 0 || (lat != null && lng != null &&
    offices.some((o) => haversineM(lat, lng, o.lat, o.lng) <= o.radiusM));
  const approvalStatus = withinRadius ? "approved" as const : "pending" as const;
  const ip = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0].trim();
  const ev = await storage.createAttendanceEvent({
    userId: req.authUser.id, date, kind, at: now.toISOString(), lat, lng, selfiePath, ip, withinRadius, approvalStatus,
  });
  if (approvalStatus === "approved") {
    await storage.applyAttendanceEvent(ev, req.authUser.id);
    // Hitung telat vs shift user (FR-HR-304) - dicatat sebagai note kehadiran.
    if (kind === "in") {
      // FR-HR-301: roster shift per-tanggal menang atas jadwal tetap
      const shift = await storage.effectiveShift(req.authUser.id, date);
      if (shift) {
        const [h, m] = shift.startTime.split(":").map(Number);
        const lateMin = Math.round((now.getTime() - new Date(now).setHours(h, m, 0, 0)) / 60000) - shift.lateToleranceMin;
        if (lateMin > 0) {
          await storage.upsertAttendance({ userId: req.authUser.id, date, status: "hadir", checkIn: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`, note: `Terlambat ${lateMin} mnt`, createdBy: req.authUser.id });
        }
      }
    }
  }
  sendSuccess(res, { ...ev, needsApproval: approvalStatus === "pending" });
});

/** Status absen hari ini milik sendiri (beranda ESS). */
router.get("/api/hr/my/today", async (req, res) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const events = await storage.listAttendanceEvents({ date, userId: req.authUser.id });
  const att = (await storage.listAttendanceByDate(date)).find((a) => a.userId === req.authUser!.id) ?? null;
  const shift = await storage.effectiveShift(req.authUser.id, date);
  sendSuccess(res, { date, events, attendance: att, shift });
});

router.get("/api/hr/attendance/events", async (req, res) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "hr_sdm")) return sendError(res, "Akses ditolak: butuh izin 'hr_sdm'", 403);
  sendSuccess(res, await storage.listAttendanceEvents({
    date: req.query.date ? String(req.query.date) : undefined,
    status: req.query.status ? String(req.query.status) : undefined,
  }));
});

router.post("/api/hr/attendance/events/:id/review", async (req, res) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "hr_sdm")) return sendError(res, "Akses ditolak: butuh izin 'hr_sdm' (write)", 403);
  const { status } = req.body ?? {};
  if (status !== "approved" && status !== "rejected") return sendError(res, "status wajib approved/rejected", 400);
  const ev = await storage.getAttendanceEvent(Number(req.params.id));
  if (!ev) return sendError(res, "Event tidak ditemukan", 404);
  await storage.reviewAttendanceEvent(ev.id, status, req.authUser.id);
  if (status === "approved") await storage.applyAttendanceEvent(ev, req.authUser.id);
  sendSuccess(res, { ok: true });
});

// Pengaturan HR-1: lokasi kantor (radius), shift, jadwal, libur (izin hr_sdm)
router.get("/api/hr/locations", async (req, res) => {
  if (!req.authUser || !hasPermission(req, "hr_sdm")) return sendError(res, "Akses ditolak", 403);
  sendSuccess(res, await storage.listOfficeLocations());
});
router.post("/api/hr/locations", async (req, res) => {
  if (!req.authUser || !hasWritePermission(req, "hr_sdm")) return sendError(res, "Akses ditolak", 403);
  const { id, name, lat, lng, radiusM } = req.body ?? {};
  if (!name || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return sendError(res, "name/lat/lng wajib", 400);
  await storage.saveOfficeLocation({ id: id ? Number(id) : undefined, name: String(name), lat: Number(lat), lng: Number(lng), radiusM: Math.max(20, Number(radiusM) || 150) });
  sendSuccess(res, { ok: true });
});
router.delete("/api/hr/locations/:id", async (req, res) => {
  if (!req.authUser || !hasWritePermission(req, "hr_sdm")) return sendError(res, "Akses ditolak", 403);
  await storage.deleteOfficeLocation(Number(req.params.id));
  sendSuccess(res, { ok: true });
});
router.get("/api/hr/shifts", async (req, res) => {
  if (!req.authUser || !hasPermission(req, "hr_sdm")) return sendError(res, "Akses ditolak", 403);
  sendSuccess(res, { shifts: await storage.listShifts(), assignments: await storage.listScheduleAssignments() });
});
router.post("/api/hr/shifts", async (req, res) => {
  if (!req.authUser || !hasWritePermission(req, "hr_sdm")) return sendError(res, "Akses ditolak", 403);
  const { id, name, startTime, endTime, lateToleranceMin, workDays } = req.body ?? {};
  if (!name || !/^\d{2}:\d{2}$/.test(String(startTime)) || !/^\d{2}:\d{2}$/.test(String(endTime))) return sendError(res, "name/startTime/endTime wajib (HH:MM)", 400);
  await storage.saveShift({ id: id ? Number(id) : undefined, name: String(name), startTime: String(startTime), endTime: String(endTime), lateToleranceMin: Number(lateToleranceMin) || 10, workDays: String(workDays || "1,2,3,4,5") });
  sendSuccess(res, { ok: true });
});
// FR-HR-301: roster shift per tanggal (rotasi)
router.get("/api/hr/roster", async (req, res) => {
  if (!req.authUser || !hasPermission(req, "hr_sdm")) return sendError(res, "Akses ditolak", 403);
  const date = String(req.query.date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return sendError(res, "Param date wajib YYYY-MM-DD", 400);
  sendSuccess(res, await storage.getRosterByDate(date));
});
router.post("/api/hr/roster", async (req, res) => {
  if (!req.authUser || !hasWritePermission(req, "hr_sdm")) return sendError(res, "Akses ditolak", 403);
  const { userId, date, shiftId } = req.body ?? {};
  if (!Number(userId) || !/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? ""))) return sendError(res, "userId/date wajib", 400);
  await storage.setRoster(Number(userId), String(date), shiftId ? Number(shiftId) : null);
  sendSuccess(res, { ok: true });
});

router.post("/api/hr/schedule", async (req, res) => {
  if (!req.authUser || !hasWritePermission(req, "hr_sdm")) return sendError(res, "Akses ditolak", 403);
  const { userId, shiftId } = req.body ?? {};
  if (!Number(userId)) return sendError(res, "userId wajib", 400);
  await storage.setScheduleAssignment(Number(userId), shiftId ? Number(shiftId) : null);
  sendSuccess(res, { ok: true });
});
router.get("/api/hr/holidays", async (req, res) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  const year = String(req.query.year ?? new Date().getFullYear()).slice(0, 4);
  sendSuccess(res, await storage.listHolidays(year));
});
router.post("/api/hr/holidays", async (req, res) => {
  if (!req.authUser || !hasWritePermission(req, "hr_sdm")) return sendError(res, "Akses ditolak", 403);
  const { date, name } = req.body ?? {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? "")) || !name) return sendError(res, "date/name wajib", 400);
  await storage.saveHoliday(String(date), String(name).slice(0, 128));
  sendSuccess(res, { ok: true });
});
router.delete("/api/hr/holidays/:id", async (req, res) => {
  if (!req.authUser || !hasWritePermission(req, "hr_sdm")) return sendError(res, "Akses ditolak", 403);
  await storage.deleteHoliday(Number(req.params.id));
  sendSuccess(res, { ok: true });
});

// -- FR-HR-901: pelacakan lokasi (aktif hanya saat status kerja; transparan ke karyawan) --
router.post("/api/hr/ping", async (req, res) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  const { lat, lng, accuracy } = req.body ?? {};
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return sendError(res, "lat/lng wajib", 400);
  // Hanya rekam saat sedang jam kerja: sudah clock-in hari ini dan belum clock-out.
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const att = (await storage.listAttendanceByDate(date)).find((a) => a.userId === req.authUser!.id);
  const working = !!att?.checkIn && !att?.checkOut;
  if (!working) return sendSuccess(res, { tracked: false, reason: "di luar jam kerja" });
  await storage.addLocationPing(req.authUser.id, Number(lat), Number(lng), accuracy != null ? Number(accuracy) : null);
  sendSuccess(res, { tracked: true });
});

router.get("/api/hr/tracking", async (req, res) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  // QA BUG3: lokasi GPS = PII sensitif → hanya hr_sdm (izin 'map' terlalu luas, dipegang marketing).
  if (!hasPermission(req, "hr_sdm")) return sendError(res, "Akses ditolak", 403);
  sendSuccess(res, await storage.latestLocations());
});

router.get("/api/hr/tracking/:userId", async (req, res) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "hr_sdm")) return sendError(res, "Akses ditolak", 403);
  const date = String(req.query.date ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  sendSuccess(res, await storage.listUserPings(Number(req.params.userId), date));
});

// -- FR-HR-1501/1502: Dashboard HR --
router.get("/api/hr/dashboard", async (req, res) => {
  if (!req.authUser || !hasPermission(req, "hr_sdm")) return sendError(res, "Akses ditolak", 403);
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  sendSuccess(res, await storage.hrDashboard(date));
});

// -- FR-HR-902/903: master klien + kunjungan (check-in sah hanya dalam radius) --
router.get("/api/hr/clients", async (req, res) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  sendSuccess(res, await storage.listClients());
});
router.post("/api/hr/clients", async (req, res) => {
  if (!req.authUser || !hasWritePermission(req, "hr_sdm")) return sendError(res, "Akses ditolak", 403);
  const { id, name, phone, lat, lng, radiusM } = req.body ?? {};
  if (!name || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return sendError(res, "name/lat/lng wajib", 400);
  await storage.saveClient({ id: id ? Number(id) : undefined, name: String(name), phone: phone ? String(phone) : null, lat: Number(lat), lng: Number(lng), radiusM: Math.max(20, Number(radiusM) || 100) });
  sendSuccess(res, { ok: true });
});
router.post("/api/hr/visits", async (req, res) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  const { clientId, lat, lng, note } = req.body ?? {};
  const client = (await storage.listClients()).find((c) => c.id === Number(clientId));
  if (!client) return sendError(res, "Klien tidak ditemukan", 404);
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return sendError(res, "GPS wajib untuk kunjungan", 400);
  const within = haversineM(Number(lat), Number(lng), client.lat, client.lng) <= client.radiusM;
  const visit = await storage.createVisit({ clientId: client.id, userId: req.authUser.id, lat: Number(lat), lng: Number(lng), withinRadius: within, note: note ? String(note).slice(0, 255) : null });
  sendSuccess(res, { ...visit, valid: within });
});
router.get("/api/hr/visits", async (req, res) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  const mineOnly = req.query.mine === "1" || !hasPermission(req, "hr_sdm");
  sendSuccess(res, await storage.listVisits({ userId: mineOnly ? req.authUser.id : undefined }));
});

// -- FR-HR-12xx: KPI formulir + penilaian --
router.get("/api/hr/kpi", async (req, res) => {
  if (!req.authUser || !hasPermission(req, "hr_sdm")) return sendError(res, "Akses ditolak", 403);
  sendSuccess(res, { forms: await storage.listKpiForms(), assessments: await storage.listKpiAssessments(req.query.period ? String(req.query.period) : undefined) });
});
router.post("/api/hr/kpi/forms", async (req, res) => {
  if (!req.authUser || !hasWritePermission(req, "hr_sdm")) return sendError(res, "Akses ditolak", 403);
  const { name, questions } = req.body ?? {};
  if (!name || !Array.isArray(questions) || questions.length === 0) return sendError(res, "name + questions wajib", 400);
  const clean = questions.filter((q: any) => q?.text).map((q: any) => ({ text: String(q.text).slice(0, 255), weight: Math.max(1, Number(q.weight) || 1) }));
  if (clean.length === 0) return sendError(res, "Minimal 1 pertanyaan", 400);
  await storage.saveKpiForm(String(name).slice(0, 128), JSON.stringify(clean));
  sendSuccess(res, { ok: true });
});
router.post("/api/hr/kpi/assess", async (req, res) => {
  if (!req.authUser || !hasWritePermission(req, "hr_sdm")) return sendError(res, "Akses ditolak", 403);
  const { formId, userId, period, scores } = req.body ?? {};
  const form = (await storage.listKpiForms()).find((f) => f.id === Number(formId));
  if (!form) return sendError(res, "Formulir tidak ditemukan", 404);
  if (!/^\d{4}-\d{2}$/.test(String(period ?? ""))) return sendError(res, "period wajib YYYY-MM", 400);
  let questions: Array<{ weight: number }> = [];
  try { questions = JSON.parse(form.questions); } catch { /* invalid */ }
  if (!Array.isArray(scores) || scores.length !== questions.length) return sendError(res, "scores harus sesuai jumlah pertanyaan", 400);
  const vals = scores.map((s: any) => Math.min(5, Math.max(1, Number(s) || 1)));
  const totalWeight = questions.reduce((s, q) => s + q.weight, 0) || 1;
  // Skor 0-100: rata-rata tertimbang (nilai 1-5 → ×20)
  const total = Math.round(vals.reduce((s, v, i) => s + v * 20 * questions[i].weight, 0) / totalWeight);
  await storage.saveKpiAssessment({ formId: form.id, userId: Number(userId), assessorId: req.authUser.id, period: String(period), scores: JSON.stringify(vals), total });
  sendSuccess(res, { total });
});

// -- KPI Otomatis (data-driven): skor dari output kerja nyata + kehadiran vs target per role --
router.get("/api/hr/kpi/config", async (req, res) => {
  if (!req.authUser || !hasPermission(req, "hr_sdm")) return sendError(res, "Akses ditolak", 403);
  try {
    const { DEFAULT_KPI_TEMPLATES } = await import("../shared/kpiAuto.js");
    const raw = await storage.getSetting("hr_kpi_auto_config");
    let templates = DEFAULT_KPI_TEMPLATES;
    if (raw) { try { const p = JSON.parse(raw); if (Array.isArray(p) && p.length) templates = p; } catch { /* pakai default */ } }
    sendSuccess(res, { templates });
  } catch (e: any) { sendError(res, e.message, 500); }
});
router.put("/api/hr/kpi/config", async (req, res) => {
  if (!req.authUser || !hasWritePermission(req, "hr_sdm")) return sendError(res, "Akses ditolak", 403);
  try {
    const { templates } = req.body ?? {};
    if (!Array.isArray(templates) || templates.length === 0) return sendError(res, "templates wajib array", 400);
    // Validasi ringan: tiap template punya role + metrics array dengan weight numeric.
    for (const t of templates) {
      if (!t || typeof t.role !== "string" || !Array.isArray(t.metrics)) return sendError(res, "format template tidak valid", 400);
      for (const m of t.metrics) {
        if (!m || typeof m.key !== "string" || (m.kind !== "count" && m.kind !== "rate") || !(Number(m.weight) >= 0))
          return sendError(res, "format metrik tidak valid", 400);
      }
    }
    await storage.setSetting("hr_kpi_auto_config", JSON.stringify(templates), "hr");
    sendSuccess(res, { saved: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});
router.get("/api/hr/kpi/auto", async (req, res) => {
  if (!req.authUser || !hasPermission(req, "hr_sdm")) return sendError(res, "Akses ditolak", 403);
  const period = String(req.query.period ?? "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(period)) return sendError(res, "period wajib YYYY-MM", 400);
  try {
    const { DEFAULT_KPI_TEMPLATES, computeKpiScore, templateForRole } = await import("../shared/kpiAuto.js");
    const raw = await storage.getSetting("hr_kpi_auto_config");
    let templates = DEFAULT_KPI_TEMPLATES;
    if (raw) { try { const p = JSON.parse(raw); if (Array.isArray(p) && p.length) templates = p; } catch { /* default */ } }

    const fromIso = new Date(`${period}-01T00:00:00`).toISOString();
    const endD = new Date(`${period}-01T00:00:00`); endD.setMonth(endD.getMonth() + 1); endD.setSeconds(endD.getSeconds() - 1);
    const toIso = endD.toISOString();

    const [employees, opsMap, attMap] = await Promise.all([
      storage.listEmployees(),
      storage.getOpsStatsForUsers(fromIso, toIso),
      storage.getAttendanceKpiStatsForMonth(period),
    ]);
    const rows = employees
      .filter((e) => e.isEmployee === 1)
      .map((e) => {
        const ops = opsMap.get(e.id) ?? { ticketsResolved: 0, leadsWon: 0, collectionsClosed: 0, canvassingReports: 0 };
        const att = attMap.get(e.id) ?? { hadir: 0, alpha: 0, late: 0, onTime: 0, attendanceRate: 100, punctualRate: 100 };
        const metricValues: Record<string, number> = {
          tickets: ops.ticketsResolved, leads: ops.leadsWon, collections: ops.collectionsClosed,
          canvassing: ops.canvassingReports, attendance: att.attendanceRate, punctual: att.punctualRate,
        };
        const tpl = templateForRole(templates, String(e.role ?? ""));
        const result = computeKpiScore(tpl, metricValues);
        return {
          userId: e.id, name: e.name || e.username, role: e.role, roleLabel: tpl.label,
          total: result.total, breakdown: result.breakdown,
          attendance: { hadir: att.hadir, alpha: att.alpha, late: att.late },
        };
      })
      .sort((a, b) => b.total - a.total);
    sendSuccess(res, { period, count: rows.length, rows });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- FR-HR-703: petty cash --
router.get("/api/hr/pettycash", async (req, res) => {
  if (!req.authUser || !hasPermission(req, "hr_sdm")) return sendError(res, "Akses ditolak", 403);
  sendSuccess(res, await storage.pettyCashLedger());
});
router.post("/api/hr/pettycash", async (req, res) => {
  if (!req.authUser || !hasWritePermission(req, "hr_sdm")) return sendError(res, "Akses ditolak", 403);
  const { holderId, kind, amount, note } = req.body ?? {};
  if (!Number(holderId) || (kind !== "topup" && kind !== "expense")) return sendError(res, "holderId + kind (topup/expense) wajib", 400);
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return sendError(res, "amount > 0 wajib", 400);
  await storage.addPettyCash({ holderId: Number(holderId), kind, amount: amt, note: note ? String(note).slice(0, 255) : null, createdBy: req.authUser.id });
  sendSuccess(res, { ok: true });
});

// -- HR-1b: profil karyawan (wizard), org/jabatan, lembur --

router.get("/api/hr/profile/:userId", async (req, res) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  const target = Number(req.params.userId);
  if (target !== req.authUser.id && !hasPermission(req, "hr_sdm")) return sendError(res, "Akses ditolak", 403);
  sendSuccess(res, (await storage.getEmployeeProfile(target)) ?? null);
});

router.post("/api/hr/profile/:userId", async (req, res) => {
  if (!req.authUser || !hasWritePermission(req, "hr_sdm")) return sendError(res, "Akses ditolak: butuh izin 'hr_sdm' (write)", 403);
  const target = Number(req.params.userId);
  if (!target) return sendError(res, "userId tidak valid", 400);
  const body = req.body ?? {};
  // Whitelist kolom profil - cegah field liar masuk DB.
  const ALLOWED = ["birthPlace","maritalStatus","bloodType","religion","nationality","idType","idNumber","kkNumber",
    "addressKtp","addressDomisili","educationLevel","educationInstitution","educationMajor",
    "orgUnitId","positionId","rank","employmentStatus","supervisorId","resignDate",
    "bankName","bankAccount","npwp","ptkpStatus","bpjsTkNumber","bpjsKesNumber"] as const;
  const patch: any = {};
  for (const k of ALLOWED) if (k in body) patch[k] = body[k] === "" ? null : body[k];
  if (patch.orgUnitId != null) patch.orgUnitId = Number(patch.orgUnitId) || null;
  if (patch.positionId != null) patch.positionId = Number(patch.positionId) || null;
  if (patch.supervisorId != null) patch.supervisorId = Number(patch.supervisorId) || null;
  sendSuccess(res, await storage.saveEmployeeProfile(target, patch, req.authUser.id));
});

router.get("/api/hr/orgs", async (req, res) => {
  if (!req.authUser || !hasPermission(req, "hr_sdm")) return sendError(res, "Akses ditolak", 403);
  sendSuccess(res, { orgUnits: await storage.listOrgUnits(), positions: await storage.listPositions() });
});
router.post("/api/hr/orgs", async (req, res) => {
  if (!req.authUser || !hasWritePermission(req, "hr_sdm")) return sendError(res, "Akses ditolak", 403);
  const { kind, name, parentId } = req.body ?? {};
  if (!name || typeof name !== "string") return sendError(res, "name wajib", 400);
  if (kind === "position") await storage.savePosition(name.trim());
  else await storage.saveOrgUnit(name.trim(), parentId ? Number(parentId) : null);
  sendSuccess(res, { ok: true });
});

/** Lembur (FR-HR-207): staff ajukan sendiri; HR approve → jadi input payroll HR-2. */
router.get("/api/hr/overtime", async (req, res) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  const mineOnly = req.query.mine === "1" || !hasPermission(req, "hr_sdm");
  sendSuccess(res, await storage.listOvertime({
    userId: mineOnly ? req.authUser.id : undefined,
    status: req.query.status ? String(req.query.status) : undefined,
  }));
});
router.post("/api/hr/overtime", async (req, res) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  const { date, hours, reason } = req.body ?? {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? ""))) return sendError(res, "date wajib YYYY-MM-DD", 400);
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0 || h > 12) return sendError(res, "hours wajib 0-12", 400);
  sendSuccess(res, await storage.createOvertime({ userId: req.authUser.id, date: String(date), hours: h, reason: reason ? String(reason).slice(0, 255) : null }));
});
router.post("/api/hr/overtime/:id/review", async (req, res) => {
  if (!req.authUser || !hasWritePermission(req, "hr_sdm")) return sendError(res, "Akses ditolak", 403);
  const { status } = req.body ?? {};
  if (status !== "approved" && status !== "rejected") return sendError(res, "status wajib approved/rejected", 400);
  const row = await storage.reviewOvertime(Number(req.params.id), status, req.authUser.id);
  if (!row) return sendError(res, "Lembur tidak ditemukan", 404);
  sendSuccess(res, row);
});

// -- HR-2: PAYROLL (FR-HR-6xx) - metode GROSS + TER bulanan; data gaji = hr_sdm write only --

router.get("/api/hr/salary", async (req, res) => {
  if (!req.authUser || !hasWritePermission(req, "hr_sdm")) return sendError(res, "Akses ditolak: data gaji butuh 'hr_sdm' (write)", 403);
  sendSuccess(res, await storage.listSalaryComponents());
});
router.post("/api/hr/salary/:userId", async (req, res) => {
  if (!req.authUser || !hasWritePermission(req, "hr_sdm")) return sendError(res, "Akses ditolak", 403);
  const b = req.body ?? {};
  await storage.saveSalaryComponent(Number(req.params.userId), {
    baseSalary: Number(b.baseSalary) || 0, fixedAllowance: Number(b.fixedAllowance) || 0,
    fixedDeduction: Number(b.fixedDeduction) || 0, workingDays: Number(b.workingDays) || 22,
    enrollBpjsTk: b.enrollBpjsTk !== false, enrollBpjsKes: b.enrollBpjsKes !== false,
  });
  sendSuccess(res, { ok: true });
});

/** Generate payroll massal 1 periode (FR-HR-604/608): kehadiran + lembur + cuti unpaid otomatis. */
router.post("/api/hr/payroll/generate", async (req, res) => {
  if (!req.authUser || !hasWritePermission(req, "hr_sdm")) return sendError(res, "Akses ditolak", 403);
  const period = String((req.body ?? {}).period ?? "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(period)) return sendError(res, "period wajib YYYY-MM", 400);
  const { computePayslip } = await import("../shared/payroll.js");
  // Rentang tanggal periode untuk overlap cuti (M1) & filter reimburse (H1).
  const periodStart = `${period}-01`;
  const [py, pm] = period.split("-").map(Number);
  const lastDay = new Date(py, pm, 0).getDate();
  const periodEnd = `${period}-${String(lastDay).padStart(2, "0")}`;
  const overlapDays = (start: string, end: string): number => {
    const s = start > periodStart ? start : periodStart;
    const e = end < periodEnd ? end : periodEnd;
    if (e < s) return 0;
    return Math.round((new Date(`${e}T00:00:00Z`).getTime() - new Date(`${s}T00:00:00Z`).getTime()) / 86400_000) + 1;
  };
  const comps = await storage.listSalaryComponents();
  const employees = (await storage.listEmployees()).filter((e) => e.isEmployee === 1 && e.isActive !== 0);
  const attSummary = await storage.attendanceSummary(period);
  const overtime = (await storage.listOvertime({ status: "approved" })).filter((o) => o.date.startsWith(period));
  const activeKasbon = (await storage.listCashAdvances({ status: "approved" })).filter((k) => k.remaining > 0);
  // QA H1: reimburse hanya untuk periode tanggalnya sendiri → tidak dobel bayar lintas periode.
  const approvedReimburse = (await storage.listReimbursements({ status: "approved" })).filter((r) => r.date.startsWith(period));
  // QA M1: cuti unpaid yang OVERLAP periode (bukan hanya yang mulai di periode).
  const unpaidLeaves = (await storage.listLeaves({ status: "approved", limit: 500 }))
    .filter((l) => l.type === "unpaid" && l.startDate <= periodEnd && l.endDate >= periodStart);
  // QA H3 (belt-and-suspenders): slip yang sudah dibayar di periode ini tidak di-generate ulang.
  const existingPaid = new Set((await storage.listPayslips({ period, paidOnly: true })).map((s) => s.userId));
  let generated = 0; const skipped: string[] = [];
  for (const emp of employees) {
    if (existingPaid.has(emp.id)) { skipped.push(`${emp.username} (sudah dibayar)`); continue; }
    const c = comps.find((x) => x.userId === emp.id);
    if (!c || c.baseSalary <= 0) { skipped.push(emp.username); continue; }
    const profile = await storage.getEmployeeProfile(emp.id);
    const alphaDays = attSummary.find((a) => a.userId === emp.id && a.status === "alpha")?.c ?? 0;
    const otHours = overtime.filter((o) => o.userId === emp.id).reduce((s, o) => s + o.hours, 0);
    const unpaidDays = unpaidLeaves.filter((l) => l.userId === emp.id).reduce((s, l) => s + overlapDays(l.startDate, l.endDate), 0);
    const myReimburse = approvedReimburse.filter((r) => r.userId === emp.id);
    const reimburseTotal = myReimburse.reduce((s, r) => s + r.amount, 0);
    // Hitung slip TANPA kasbon dulu (M4): cicilan di-cap agar THP tidak negatif.
    const base = computePayslip({
      baseSalary: c.baseSalary, fixedAllowance: c.fixedAllowance, variableAllowance: 0,
      overtimeHours: otHours, alphaDays, unpaidLeaveDays: unpaidDays, workingDays: c.workingDays,
      fixedDeduction: c.fixedDeduction, ptkp: (profile?.ptkpStatus as any) || "TK/0",
      enrollBpjsTk: c.enrollBpjsTk === 1, enrollBpjsKes: c.enrollBpjsKes === 1,
    });
    const netBeforeKasbon = base.takeHomePay + reimburseTotal;
    const kasbon = activeKasbon.find((k) => k.userId === emp.id);
    // FR-HR-701: cicilan tak pernah melebihi sisa kasbon MAUPUN net yang tersedia (cegah THP negatif).
    const installment = kasbon ? Math.max(0, Math.min(kasbon.monthlyInstallment, kasbon.remaining, netBeforeKasbon)) : 0;
    const result = computePayslip({
      baseSalary: c.baseSalary, fixedAllowance: c.fixedAllowance, variableAllowance: 0,
      overtimeHours: otHours, alphaDays, unpaidLeaveDays: unpaidDays, workingDays: c.workingDays,
      fixedDeduction: c.fixedDeduction + installment, ptkp: (profile?.ptkpStatus as any) || "TK/0",
      enrollBpjsTk: c.enrollBpjsTk === 1, enrollBpjsKes: c.enrollBpjsKes === 1,
    });
    // Reimburse bukan objek pajak - ditambahkan SETELAH hitung PPh/BPJS.
    result.totalAllowance += reimburseTotal;
    result.takeHomePay += reimburseTotal;
    await storage.upsertPayslip({
      period, userId: emp.id,
      detail: JSON.stringify({ ...result, kasbonId: kasbon?.id ?? null, installment, reimburseIds: myReimburse.map((r) => r.id), reimburseTotal, input: { baseSalary: c.baseSalary, fixedAllowance: c.fixedAllowance, fixedDeduction: c.fixedDeduction, otHours, alphaDays, unpaidDays, ptkp: profile?.ptkpStatus || "TK/0" } }),
      gross: result.gross, totalAllowance: result.totalAllowance,
      totalDeduction: result.totalDeduction, takeHomePay: result.takeHomePay,
      generatedBy: req.authUser.id,
    });
    generated++;
  }
  sendSuccess(res, { generated, skipped });
});

router.get("/api/hr/payroll", async (req, res) => {
  if (!req.authUser || !hasWritePermission(req, "hr_sdm")) return sendError(res, "Akses ditolak", 403);
  sendSuccess(res, await storage.listPayslips({ period: req.query.period ? String(req.query.period) : undefined }));
});
router.post("/api/hr/payroll/:id/status", async (req, res) => {
  if (!req.authUser || !hasWritePermission(req, "hr_sdm")) return sendError(res, "Akses ditolak", 403);
  const { status } = req.body ?? {};
  if (status !== "ready" && status !== "paid") return sendError(res, "status wajib ready/paid", 400);
  const slip = await storage.getPayslip(Number(req.params.id));
  if (!slip) return sendError(res, "Slip tidak ditemukan", 404);
  await storage.setPayslipStatus(slip.id, status);
  // QA H2: efek uang (potong sisa kasbon + tandai reimburse paid) dijalankan SEKALI
  // seumur slip via flag effects_applied - kebal terhadap transisi paid→ready→paid.
  if (status === "paid" && (slip as any).effectsApplied !== 1) {
    try {
      const d = JSON.parse(slip.detail);
      if (d.kasbonId && d.installment > 0) await storage.payCashAdvanceInstallment(Number(d.kasbonId), Number(d.installment));
      for (const rid of d.reimburseIds ?? []) await storage.setReimbursementStatus(Number(rid), "paid");
      await storage.markPayslipEffectsApplied(slip.id);
    } catch (e: any) { console.warn(`[payroll] efek paid slip ${slip.id}: ${e.message}`); }
  }
  sendSuccess(res, { ok: true });
});

// -- FR-HR-701/702: kasbon + reimburse (self-service + review HR) --
router.get("/api/hr/kasbon", async (req, res) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  const mineOnly = req.query.mine === "1" || !hasPermission(req, "hr_sdm");
  sendSuccess(res, await storage.listCashAdvances({ userId: mineOnly ? req.authUser.id : undefined, status: req.query.status ? String(req.query.status) : undefined }));
});
router.post("/api/hr/kasbon", async (req, res) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  const { amount, months, reason } = req.body ?? {};
  const amt = Number(amount), m = Number(months) || 1;
  if (!Number.isFinite(amt) || amt <= 0) return sendError(res, "amount wajib > 0", 400);
  if (m < 1 || m > 12) return sendError(res, "months 1-12", 400);
  // Plafon: configurable via app_settings hr_kasbon_plafon (default 1× gaji pokok; tanpa gaji → 5jt)
  let plafon = 5_000_000;
  try {
    const raw = await storage.getSetting("hr_kasbon_plafon");
    if (raw) plafon = Number(raw) || plafon;
    else { const c = await storage.getSalaryComponent(req.authUser.id); if (c && c.baseSalary > 0) plafon = c.baseSalary; }
  } catch { /* default */ }
  const outstanding = (await storage.listCashAdvances({ userId: req.authUser.id }))
    .filter((k) => k.status === "approved" || k.status === "pending").reduce((s, k) => s + k.remaining, 0);
  if (amt + outstanding > plafon) return sendError(res, `Melebihi plafon kasbon (sisa plafon Rp ${Math.max(0, plafon - outstanding).toLocaleString("id-ID")})`, 400);
  sendSuccess(res, await storage.createCashAdvance({ userId: req.authUser.id, amount: amt, months: m, reason: reason ? String(reason).slice(0, 255) : null }));
});
router.post("/api/hr/kasbon/:id/review", async (req, res) => {
  if (!req.authUser || !hasWritePermission(req, "hr_sdm")) return sendError(res, "Akses ditolak", 403);
  const { status } = req.body ?? {};
  if (status !== "approved" && status !== "rejected") return sendError(res, "status wajib approved/rejected", 400);
  const all = await storage.listCashAdvances({});
  const target = all.find((k) => k.id === Number(req.params.id));
  if (!target) return sendError(res, "Kasbon tidak ditemukan", 404);
  // QA M2: gerbang plafon nyata ada di approve - cegah dua pengajuan konkuren
  // yang sama-sama lolos cek saat pengajuan lalu di-approve melebihi plafon.
  if (status === "approved") {
    let plafon = 5_000_000;
    try {
      const raw = await storage.getSetting("hr_kasbon_plafon");
      if (raw) plafon = Number(raw) || plafon;
      else { const c = await storage.getSalaryComponent(target.userId); if (c && c.baseSalary > 0) plafon = c.baseSalary; }
    } catch { /* default */ }
    const otherOutstanding = all.filter((k) => k.userId === target.userId && k.id !== target.id && k.status === "approved")
      .reduce((s, k) => s + k.remaining, 0);
    if (target.remaining + otherOutstanding > plafon) return sendError(res, `Menyetujui kasbon ini akan melebihi plafon (Rp ${plafon.toLocaleString("id-ID")})`, 400);
  }
  await storage.reviewCashAdvance(target.id, status, req.authUser.id);
  sendSuccess(res, { ok: true });
});
router.get("/api/hr/reimburse", async (req, res) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  const mineOnly = req.query.mine === "1" || !hasPermission(req, "hr_sdm");
  sendSuccess(res, await storage.listReimbursements({ userId: mineOnly ? req.authUser.id : undefined, status: req.query.status ? String(req.query.status) : undefined }));
});
router.post("/api/hr/reimburse", async (req, res) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  const { date, category, amount, note } = req.body ?? {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? ""))) return sendError(res, "date wajib YYYY-MM-DD", 400);
  if (!category) return sendError(res, "category wajib", 400);
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return sendError(res, "amount wajib > 0", 400);
  sendSuccess(res, await storage.createReimbursement({ userId: req.authUser.id, date: String(date), category: String(category).slice(0, 48), amount: amt, note: note ? String(note).slice(0, 255) : null }));
});
router.post("/api/hr/reimburse/:id/review", async (req, res) => {
  if (!req.authUser || !hasWritePermission(req, "hr_sdm")) return sendError(res, "Akses ditolak", 403);
  const { status } = req.body ?? {};
  if (status !== "approved" && status !== "rejected") return sendError(res, "status wajib approved/rejected", 400);
  await storage.setReimbursementStatus(Number(req.params.id), status, req.authUser.id);
  sendSuccess(res, { ok: true });
});
/** ESS: slip gaji milik sendiri - hanya yang SUDAH dibayar (FR-HR-1104). */
router.get("/api/hr/my/payslips", async (req, res) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  sendSuccess(res, await storage.listPayslips({ userId: req.authUser.id, paidOnly: true }));
});
/** FR-HR-606: slip gaji versi cetak (HTML print-friendly → Simpan sebagai PDF dari browser).
 *  Akses: pemilik slip (hanya bila sudah dibayar) atau HR. */
router.get("/api/hr/payslip/:id/print", async (req, res) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  const slip = await storage.getPayslip(Number(req.params.id));
  if (!slip) return sendError(res, "Slip tidak ditemukan", 404);
  const isHr = hasWritePermission(req, "hr_sdm");
  if (!isHr && (slip.userId !== req.authUser.id || slip.status !== "paid")) return sendError(res, "Akses ditolak", 403);
  const emp = (await storage.listEmployees()).find((u) => u.id === slip.userId);
  const profile = await storage.getEmployeeProfile(slip.userId);
  let d: any = {}; try { d = JSON.parse(slip.detail); } catch { /* rincian kosong */ }
  const rp = (n: number) => `Rp ${Math.round(n || 0).toLocaleString("id-ID")}`;
  const row = (label: string, val: string, bold = false) =>
    `<tr><td style="padding:4px 8px">${label}</td><td style="padding:4px 8px;text-align:right;${bold ? "font-weight:700" : ""}">${val}</td></tr>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Slip Gaji ${slip.period} - ${emp?.name ?? ""}</title>
<style>body{font-family:Arial,sans-serif;max-width:640px;margin:24px auto;color:#111}h1{font-size:18px;margin:0}h2{font-size:13px;color:#555;font-weight:400;margin:2px 0 16px}table{width:100%;border-collapse:collapse;font-size:13px}thead td{font-weight:700;border-bottom:2px solid #111;padding:6px 8px}tfoot td{border-top:2px solid #111}@media print{button{display:none}}</style></head><body>
<h1>PT Arkanova Cipta Inovasi - JABNET</h1><h2>Slip Gaji Periode ${slip.period} · RAHASIA</h2>
<table><tr><td style="padding:2px 8px"><b>${emp?.name ?? "-"}</b> (${emp?.username ?? "-"})</td><td style="padding:2px 8px;text-align:right">NIK: ${emp?.employeeId ?? "-"} · PTKP: ${profile?.ptkpStatus ?? "-"}</td></tr>
<tr><td style="padding:2px 8px">${emp?.position ?? ""} ${emp?.department ? "· " + emp.department : ""}</td><td style="padding:2px 8px;text-align:right">Bank: ${profile?.bankName ?? "-"} ${profile?.bankAccount ?? ""}</td></tr></table><br>
<table><thead><tr><td>Komponen</td><td style="text-align:right">Jumlah</td></tr></thead><tbody>
${row("Gaji Pokok", rp(d.input?.baseSalary))}
${row("Tunjangan Tetap", rp(d.input?.fixedAllowance))}
${d.overtimePay ? row(`Lembur (${d.input?.otHours ?? 0} jam)`, rp(d.overtimePay)) : ""}
${d.reimburseTotal ? row("Reimburse", rp(d.reimburseTotal)) : ""}
${d.absenceDeduction ? row("Potongan Absen/Cuti Tidak Dibayar", "− " + rp(d.absenceDeduction)) : ""}
${d.installment ? row("Cicilan Kasbon", "− " + rp(d.installment)) : ""}
${row("BPJS Ketenagakerjaan (karyawan)", "− " + rp(d.bpjsTkEmp))}
${row("BPJS Kesehatan (karyawan)", "− " + rp(d.bpjsKesEmp))}
${row(`PPh 21 (TER ${d.terRatePct ?? 0}%)`, "− " + rp(d.pph21))}
</tbody><tfoot>${row("TAKE HOME PAY", rp(slip.takeHomePay), true)}</tfoot></table>
<p style="font-size:11px;color:#666">Status: ${slip.status === "paid" ? "SUDAH DIBAYAR" + (slip.paidAt ? " · " + slip.paidAt.slice(0, 10) : "") : "Siap Bayar"} · Dibuat otomatis oleh JABNET Workspace.</p>
<button onclick="window.print()" style="padding:8px 16px">Cetak / Simpan PDF</button></body></html>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

/** FR-HR-802 (subset): rekap PPh 21 bulanan per karyawan - CSV siap lapor. */
router.get("/api/hr/payroll/export-pph", async (req, res) => {
  if (!req.authUser || !hasWritePermission(req, "hr_sdm")) return sendError(res, "Akses ditolak", 403);
  const period = String(req.query.period ?? "").slice(0, 7);
  const slips = await storage.listPayslips({ period });
  const emps = await storage.listEmployees();
  const rows = [["Periode", "Nama", "NIK", "NPWP", "PTKP", "Bruto", "Tarif TER %", "PPh 21"].join(";")];
  for (const s of slips) {
    const e = emps.find((u) => u.id === s.userId);
    const p = await storage.getEmployeeProfile(s.userId);
    let d: any = {}; try { d = JSON.parse(s.detail); } catch { /* skip */ }
    rows.push([s.period, e?.name ?? "", e?.employeeId ?? "", p?.npwp ?? "", p?.ptkpStatus ?? "", s.gross, d.terRatePct ?? "", d.pph21 ?? ""].join(";"));
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="pph21-${period}.csv"`);
  res.send(rows.join("\n"));
});

/** Ekspor jurnal CSV per periode (default keputusan §15.1 = CSV). */
router.get("/api/hr/payroll/export", async (req, res) => {
  if (!req.authUser || !hasWritePermission(req, "hr_sdm")) return sendError(res, "Akses ditolak", 403);
  const period = String(req.query.period ?? "").slice(0, 7);
  const slips = await storage.listPayslips({ period });
  const users = await storage.listEmployees();
  const nameOf = (id: number) => users.find((u) => u.id === id)?.name ?? `#${id}`;
  const rows = [["Periode", "Karyawan", "Bruto", "Total Tunjangan", "Total Potongan", "PPh21", "THP", "Status"].join(";")];
  for (const s of slips) {
    let pph = ""; try { pph = String(JSON.parse(s.detail).pph21 ?? ""); } catch { /* biarkan kosong */ }
    rows.push([s.period, nameOf(s.userId), s.gross, s.totalAllowance, s.totalDeduction, pph, s.takeHomePay, s.status].join(";"));
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="payroll-${period}.csv"`);
  res.send(rows.join("\n"));
});

/** Saldo cuti milik sendiri (FR-HR-403). Kuota configurable via app_settings hr_leave_quota. */
router.get("/api/hr/leaves/balance", async (req, res) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  let quotas: Record<string, number> = { tahunan: 12, khusus: 6, sakit: 0, izin: 0, unpaid: 0 };
  try { const raw = await storage.getSetting("hr_leave_quota"); if (raw) quotas = { ...quotas, ...JSON.parse(raw) }; } catch { /* pakai default */ }
  const userId = req.query.userId && hasPermission(req, "hr_sdm") ? Number(req.query.userId) : req.authUser.id;
  sendSuccess(res, await storage.leaveBalance(userId, String(new Date().getFullYear()), quotas));
});

router.post("/api/teamspace/cheers", async (req, res) => {
  if (!requireWritePermission(req, res, "cheers")) return;
  const toUserId = Number(req.body?.toUserId);
  const message = String(req.body?.message ?? "").trim();
  if (!Number.isFinite(toUserId) || toUserId <= 0) return sendError(res, "toUserId wajib diisi", 400);
  if (toUserId === req.authUser!.id) return sendError(res, "Tidak bisa mengirim cheers ke diri sendiri", 400);
  if (!message) return sendError(res, "Pesan apresiasi wajib diisi", 400);
  if (message.length > 500) return sendError(res, "Pesan maksimal 500 karakter", 400);
  const target = await storage.getUser(toUserId);
  if (!target || (target as any).isActive === 0) return sendError(res, "User tujuan tidak ditemukan/nonaktif", 400);
  const cardId = req.body?.cardId ? Number(req.body.cardId) : null;
  const cheer = await storage.createCheer(req.authUser!.id, toUserId, message, cardId);
  await storage.createNotification({
    userId: toUserId, type: "cheers_received", title: "Kamu dapat Cheers!",
    message: `${req.authUser!.name}: "${message.slice(0, 80)}"`,
    link: "/teamspace/cheers", entityType: "cheer", entityId: cheer.id,
    fromUserId: req.authUser!.id,
  });
  sendSuccess(res, cheer);
});

router.get("/api/teamspace/cheers", async (req, res) => {
  if (!requirePermission(req, res, "cheers")) return;
  const box = req.query.box === "sent" ? "sent" : "received";
  const rows = box === "sent"
    ? await storage.listCheersSent(req.authUser!.id)
    : await storage.listCheersReceived(req.authUser!.id);
  sendSuccess(res, rows);
});

router.get("/api/teamspace/cheers/leaderboard", async (req, res) => {
  if (!requirePermission(req, res, "cheers")) return;
  const now = new Date();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from ?? "")) ? String(req.query.from) : localDateStr(new Date(now.getTime() - 29 * 86400_000));
  const to = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to ?? "")) ? String(req.query.to) : localDateStr(now);
  sendSuccess(res, await storage.cheersLeaderboard(new Date(`${from}T00:00:00`).toISOString(), new Date(`${to}T23:59:59`).toISOString()));
});

// ==================== LOYALTY ADMIN (v4.1.8) ====================

/** GET /api/loyalty/admin/summary - dashboard top stats */
router.get("/api/loyalty/admin/summary", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak", 403);
  try {
    const summary = await storage.getLoyaltyAdminSummary();
    sendSuccess(res, summary);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** GET /api/loyalty/admin/discounts?status=pending|applied|cancelled|expired&includeDeleted=true */
router.get("/api/loyalty/admin/discounts", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak", 403);
  try {
    const status = String(req.query.status ?? "pending");
    const includeDeleted = req.query.includeDeleted === "true";
    const list = await storage.listAllDiscountsAdmin({
      status,
      limit: req.query.limit ? Number(req.query.limit) : 200,
      includeDeleted,
    });
    sendSuccess(res, list);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/loyalty/admin/discounts/:id/apply - mark discount applied + save invoice_ref */
router.post("/api/loyalty/admin/discounts/:id/apply", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const id = Number(req.params.id);
    const invoiceRef = req.body?.invoiceRef ? String(req.body.invoiceRef) : undefined;
    const row = await storage.applyDiscountByAdmin(id, req.authUser.id, invoiceRef);
    await logAudit(req, "APPLY", "loyalty_discount", id, `discount #${id}`, { invoiceRef });
    sendSuccess(res, row);
  } catch (e: any) { sendError(res, e.message, 400); }
});

/** POST /api/loyalty/admin/discounts/:id/cancel - cancel pending discount */
router.post("/api/loyalty/admin/discounts/:id/cancel", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const id = Number(req.params.id);
    const reason = req.body?.reason ? String(req.body.reason) : undefined;
    const row = await storage.cancelDiscountByAdmin(id, req.authUser.id, reason);
    await logAudit(req, "CANCEL", "loyalty_discount", id, `discount #${id}`, { reason });
    sendSuccess(res, row);
  } catch (e: any) { sendError(res, e.message, 400); }
});

/** PUT /api/loyalty/admin/discounts/:id - edit type/value/source/description (status='pending' only) */
router.put("/api/loyalty/admin/discounts/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return sendError(res, "ID invalid", 400);
  try {
    const { discountType, discountValue, source, description } = req.body || {};
    const updated = await storage.updateCustomerDiscount(id, { discountType, discountValue, source, description });
    await logAudit(req, "UPDATE", "loyalty_discount", id, `#${id}`, {
      discountType, discountValue, source, description,
    });
    sendSuccess(res, updated);
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    const status = msg.includes("tidak bisa di-edit") ? 409 :
                   msg.includes("tidak ditemukan") ? 404 : 400;
    sendError(res, e?.message ?? "Update gagal", status);
  }
});

/** DELETE /api/loyalty/admin/discounts/:id - soft delete (block status='applied') */
router.delete("/api/loyalty/admin/discounts/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return sendError(res, "ID invalid", 400);
  try {
    const reason = String(req.body?.reason ?? "").trim() || null;
    const { statusAtDelete } = await storage.softDeleteCustomerDiscount(id);
    await logAudit(req, "DELETE", "loyalty_discount", id, `#${id}`, { reason, statusAtDelete });
    sendSuccess(res, { success: true });
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    const status = msg.includes("tidak bisa dihapus") ? 409 :
                   msg.includes("tidak ditemukan") ? 404 : 400;
    sendError(res, e?.message ?? "Hapus gagal", status);
  }
});

/** GET /api/loyalty/admin/leaderboard - top Sahabat (default sort=referrals, fallback streak) */
router.get("/api/loyalty/admin/leaderboard", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak", 403);
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const sortBy = req.query.sortBy === "streak" ? "streak" : "referrals";
    sendSuccess(res, await storage.getLoyaltyLeaderboard(limit, sortBy as any));
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** GET /api/loyalty/admin/referrals */
router.get("/api/loyalty/admin/referrals", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak", 403);
  try {
    const status = req.query.status ? String(req.query.status) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 200;
    const includeDeleted = req.query.includeDeleted === "true";
    sendSuccess(res, await storage.listAllReferralsAdmin({ status, limit, includeDeleted }));
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/loyalty/admin/referrals - admin manual create (offline referral entry) */
router.post("/api/loyalty/admin/referrals", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const referrerCustomerId = Number(req.body?.referrerCustomerId);
    const refereeName = String(req.body?.refereeName ?? "").trim();
    const refereePhone = String(req.body?.refereePhone ?? "").trim();
    const notes = req.body?.notes ? String(req.body.notes).trim() : undefined;
    if (!referrerCustomerId) return sendError(res, "referrerCustomerId (pengundang) wajib");
    if (!refereeName) return sendError(res, "Nama tetangga yang direfer wajib diisi");
    const referrer = await storage.getCustomer(referrerCustomerId);
    if (!referrer) return sendError(res, "Customer pengundang tidak ditemukan", 404);
    const row = await storage.createReferralInvitation({
      referrerCustomerId,
      refereeName,
      refereePhone: refereePhone || undefined,
      notes: notes ? `[MANUAL by ${req.authUser.username}] ${notes}` : `[MANUAL by ${req.authUser.username}]`,
    });
    await logAudit(req, "CREATE", "referral", row.id, `${referrer.name} → ${refereeName}`, { source: "manual_admin" });
    // Fire-and-forget WA notif ke referrer
    notifyReferrerInviteRecorded(referrer, refereeName, refereePhone || null).catch(() => {});
    sendSuccess(res, row, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** Helper: kirim WA "referral dicatat" ke referrer. Idempotent fire-and-forget. */
async function notifyReferrerInviteRecorded(referrer: any, refereeName: string, refereePhone: string | null): Promise<void> {
  try {
    if (!referrer?.phone) return;
    const { sendLoyaltyNotification } = await import("./mpwa.js");
    const loyalty = await storage.getOrCreateCustomerLoyalty(referrer.id);
    const allRefs = await storage.getReferralsByCustomer(referrer.id);
    await sendLoyaltyNotification("sahabat_invite_recorded", referrer.phone, {
      nama: referrer.name,
      refereeName,
      refereePhoneLine: refereePhone ? `\n ${refereePhone}` : "",
      sahabatCode: (loyalty as any).sahabatCode ?? loyalty.referralCode ?? "-",
      totalInvited: String(allRefs.length),
    });
  } catch (e: any) {
    console.warn("[Sahabat] notifyReferrerInviteRecorded error:", e.message);
  }
}

/** Helper: kirim WA "referee terdaftar" ke referrer saat referral pindah ke status registered. */
async function notifyReferrerInviteRegistered(referral: { referrerCustomerId: number; refereeName: string | null }): Promise<void> {
  try {
    const { sendLoyaltyNotification } = await import("./mpwa.js");
    const r = referral;
    const referrer = await storage.getCustomer(r.referrerCustomerId);
    if (!referrer?.phone) return;
    const loyalty = await storage.getOrCreateCustomerLoyalty(r.referrerCustomerId);
    const level = (loyalty as any).sahabatLevel ?? "new";
    const totalSuccessful = (loyalty as any).totalSuccessfulReferrals ?? 0;
    const LEVEL_LABEL: Record<string, string> = {
      new: "Pelanggan", perunggu: "Perunggu ", perak: "Perak ",
      emas: "Emas ", platinum: "Platinum ", berlian: "Berlian ", ambassador: "Ambassador ",
    };
    const NEXT: Record<string, string> = {
      new: "5 lagi ke Perunggu (Bonus Rp 200K + Speed Boost)",
      perunggu: "5 lagi ke Perak (GRATIS 12 bulan)",
      perak: "10 lagi ke Emas (GRATIS 24 bulan)",
      emas: "10 lagi ke Platinum (Cash Rp 2jt)",
      platinum: "20 lagi ke Berlian (Cash Rp 5jt)",
      berlian: "Level maksimal - Legend ",
      ambassador: "Rev share 15% aktif",
    };
    await sendLoyaltyNotification("sahabat_invite_registered", referrer.phone, {
      nama: referrer.name,
      refereeName: r.refereeName || "Tetangga",
      totalSuccessful: String(totalSuccessful),
      level: LEVEL_LABEL[level] ?? level,
      nextInfo: NEXT[level] ?? "",
      sahabatCode: (loyalty as any).sahabatCode ?? loyalty.referralCode ?? "-",
    });
  } catch (e: any) {
    console.warn("[Sahabat] notifyReferrerInviteRegistered error:", e.message);
  }
}

/** POST /api/loyalty/admin/referrals/:id/link - admin manual link referee to customer */
router.post("/api/loyalty/admin/referrals/:id/link", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const referralId = Number(req.params.id);
    const customerId = Number(req.body?.customerId);
    if (!customerId) return sendError(res, "customerId wajib diisi");
    const row = await storage.linkReferralToCustomer(referralId, customerId, req.authUser.id);
    await logAudit(req, "LINK", "loyalty_referral", referralId, `→ customer #${customerId}`, { customerId });
    // Fire-and-forget WA ke referrer
    notifyReferrerInviteRegistered({ referrerCustomerId: row.referrerCustomerId, refereeName: row.refereeName }).catch(() => {});
    sendSuccess(res, row);
  } catch (e: any) { sendError(res, e.message, 400); }
});

/** PUT /api/loyalty/admin/referrals/:id - edit referee name/phone/notes (block rewarded) */
router.put("/api/loyalty/admin/referrals/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return sendError(res, "ID invalid", 400);
  try {
    const { refereeName, refereePhone, notes } = req.body || {};
    const updated = await storage.updateCustomerReferral(id, { refereeName, refereePhone, notes });
    await logAudit(req, "UPDATE", "loyalty_referral", id, updated.refereeName ?? `#${id}`, {
      refereeName, refereePhone, notes,
    });
    sendSuccess(res, updated);
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    const status = msg.includes("tidak diizinkan") ? 409 :
                   msg.includes("tidak ditemukan") ? 404 : 400;
    sendError(res, e?.message ?? "Update gagal", status);
  }
});

/** DELETE /api/loyalty/admin/referrals/:id - soft delete (block rewarded) */
router.delete("/api/loyalty/admin/referrals/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return sendError(res, "ID invalid", 400);
  try {
    const reason = String(req.body?.reason ?? "").trim() || null;
    const { statusAtDelete } = await storage.softDeleteCustomerReferral(id);
    await logAudit(req, "DELETE", "loyalty_referral", id, `#${id}`, { reason, statusAtDelete });
    sendSuccess(res, { success: true });
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    const status = msg.includes("tidak bisa dihapus") ? 409 :
                   msg.includes("tidak ditemukan") ? 404 : 400;
    sendError(res, e?.message ?? "Hapus gagal", status);
  }
});

/** POST /api/loyalty/admin/discounts - manual issue reward (admin ad-hoc) */
router.post("/api/loyalty/admin/discounts", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const customerId = Number(req.body?.customerId);
    const discountType = String(req.body?.discountType ?? "");
    const discountValue = Number(req.body?.discountValue);
    const description = String(req.body?.description ?? "").trim();
    const reason = String(req.body?.reason ?? "").trim();
    const eligibleForPeriod = req.body?.eligibleForPeriod ? String(req.body.eligibleForPeriod) : null;
    const expiresInDays = Number(req.body?.expiresInDays) || 90;
    const VALID_TYPES = ["percent", "free_days", "voucher_indomaret", "cash_bonus", "speed_upgrade"];
    if (!customerId) return sendError(res, "customerId wajib");
    if (!VALID_TYPES.includes(discountType)) return sendError(res, `discountType harus: ${VALID_TYPES.join(", ")}`);
    if (!isFinite(discountValue) || discountValue <= 0) return sendError(res, "discountValue harus > 0");
    if (!reason) return sendError(res, "Alasan wajib diisi untuk audit trail");
    const customer = await storage.getCustomer(customerId);
    if (!customer) return sendError(res, "Customer tidak ditemukan", 404);
    const fullDesc = description || `${discountType} ${discountValue} - ${reason}`;
    const row = await storage.createManualDiscount({
      customerId,
      discountType,
      discountValue,
      description: fullDesc,
      source: "manual_admin",
      eligibleForPeriod,
      expiresAt: new Date(Date.now() + expiresInDays * 86400_000).toISOString(),
      issuedBy: req.authUser.id,
      reason,
    });
    await logAudit(req, "CREATE", "loyalty_discount", row.id, customer.name, { discountType, discountValue, source: "manual_admin", reason });
    sendSuccess(res, row, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** GET /api/loyalty/admin/sahabat/:customerId - detail Sahabat lengkap untuk drawer */
router.get("/api/loyalty/admin/sahabat/:customerId", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak", 403);
  try {
    const customerId = Number(req.params.customerId);
    if (!customerId) return sendError(res, "customerId invalid");
    const detail = await storage.getSahabatDetail(customerId);
    if (!detail) return sendError(res, "Sahabat tidak ditemukan", 404);
    sendSuccess(res, detail);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** GET /api/loyalty/admin/budget - tracker budget program bulan ini */
router.get("/api/loyalty/admin/budget", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak", 403);
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
    const data = await storage.getLoyaltyBudgetSummary(monthStart, monthEnd);
    // Read optional budget limits dari settings
    const limitMonthly = Number(await storage.getSetting("sahabat_budget_monthly_limit")) || 0;
    sendSuccess(res, { ...data, period: { from: monthStart, to: monthEnd }, limitMonthly });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** PUT /api/loyalty/admin/budget/config - set monthly budget limit */
router.put("/api/loyalty/admin/budget/config", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const limit = Number(req.body?.limitMonthly);
    if (isNaN(limit) || limit < 0) return sendError(res, "limitMonthly harus angka non-negatif");
    await storage.setSetting("sahabat_budget_monthly_limit", String(limit), "loyalty");
    sendSuccess(res, { limitMonthly: limit });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** GET /api/loyalty/admin/campaign - active seasonal campaign */
router.get("/api/loyalty/admin/campaign", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak", 403);
  try {
    const raw = await storage.getSetting("sahabat_seasonal_campaign");
    const parsed = raw ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : null;
    const now = Date.now();
    const isActive = parsed?.startDate && parsed?.endDate
      && new Date(parsed.startDate).getTime() <= now
      && new Date(parsed.endDate).getTime() + 86400_000 >= now
      && parsed?.active !== false;
    sendSuccess(res, { campaign: parsed, isActive });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** PUT /api/loyalty/admin/campaign - set / update active seasonal campaign */
router.put("/api/loyalty/admin/campaign", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const { name, startDate, endDate, multiplier, description, active } = req.body ?? {};
    if (!name || !startDate || !endDate) return sendError(res, "name, startDate, endDate wajib");
    const mul = Number(multiplier);
    if (!isFinite(mul) || mul < 1 || mul > 10) return sendError(res, "multiplier harus 1-10");
    const payload = {
      name: String(name).trim(),
      startDate,
      endDate,
      multiplier: mul,
      description: description ? String(description).trim() : null,
      active: active !== false,
      updatedAt: new Date().toISOString(),
      updatedBy: req.authUser.id,
    };
    await storage.setSetting("sahabat_seasonal_campaign", JSON.stringify(payload), "loyalty");
    await logAudit(req, "UPDATE", "sahabat_campaign", undefined, name, payload);
    sendSuccess(res, payload);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** DELETE /api/loyalty/admin/campaign - clear active campaign */
router.delete("/api/loyalty/admin/campaign", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    await storage.setSetting("sahabat_seasonal_campaign", "", "loyalty");
    await logAudit(req, "DELETE", "sahabat_campaign");
    sendSuccess(res, { cleared: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** GET /api/loyalty/admin/funnel - funnel + cohort analytics */
router.get("/api/loyalty/admin/funnel", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak", 403);
  try {
    const data = await storage.getLoyaltyFunnelAnalytics();
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** GET /api/loyalty/admin/fraud-checks - flag suspicious referral patterns */
router.get("/api/loyalty/admin/fraud-checks", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak", 403);
  try {
    const checks = await storage.getLoyaltyFraudChecks();
    sendSuccess(res, checks);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/loyalty/admin/sahabat/:customerId/statement - kirim statement bulanan WA ke 1 Sahabat */
router.post("/api/loyalty/admin/sahabat/:customerId/statement", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const customerId = Number(req.params.customerId);
    const result = await sendSahabatMonthlyStatement(customerId);
    await logAudit(req, "SEND", "sahabat_statement", customerId, undefined, result);
    sendSuccess(res, result);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/loyalty/admin/statement/broadcast - kirim statement ke SEMUA Sahabat aktif (tier rtrw/desa) */
router.post("/api/loyalty/admin/statement/broadcast", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const top = await storage.getLoyaltyLeaderboard(200, "referrals");
    const targets = top.filter((l: any) => (l.totalSuccessfulReferrals ?? 0) > 0);
    let sent = 0; let failed = 0;
    for (const t of targets) {
      const r = await sendSahabatMonthlyStatement(t.customerId).catch(() => ({ sent: false }));
      if ((r as any).sent) sent++; else failed++;
    }
    await logAudit(req, "BROADCAST", "sahabat_statement", undefined, `${sent}/${targets.length}`);
    sendSuccess(res, { attempted: targets.length, sent, failed });
  } catch (e: any) { sendError(res, e.message, 500); }
});

async function sendSahabatMonthlyStatement(customerId: number): Promise<{ sent: boolean; reason?: string }> {
  const customer = await storage.getCustomer(customerId);
  if (!customer?.phone) return { sent: false, reason: "no_phone" };
  const loyalty = await storage.getOrCreateCustomerLoyalty(customerId);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
  // Stats for this month
  const allRefs = await storage.getReferralsByCustomer(customerId);
  const thisMonthRefs = allRefs.filter(r => r.createdAt >= monthStart && r.createdAt <= monthEnd);
  const thisMonthRewarded = allRefs.filter(r => r.rewardCreditedAt && r.rewardCreditedAt >= monthStart && r.rewardCreditedAt <= monthEnd);
  const rank = await storage.getLoyaltyLeaderboard(500, "referrals").then((top: any[]) =>
    (top.findIndex(x => x.customerId === customerId) + 1) || null
  );
  const monthLabel = now.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  const { sendLoyaltyNotification } = await import("./mpwa.js");
  const totalSuccessful = (loyalty as any).totalSuccessfulReferrals ?? 0;
  const LEVEL_LABEL: Record<string, string> = {
    new: "Pelanggan", perunggu: "Perunggu ", perak: "Perak ",
    emas: "Emas ", platinum: "Platinum ", berlian: "Berlian ", ambassador: "Ambassador ",
  };
  const level = (loyalty as any).sahabatLevel ?? "new";
  const result = await sendLoyaltyNotification("sahabat_monthly_statement", customer.phone, {
    nama: customer.name,
    month: monthLabel,
    thisMonthInvited: String(thisMonthRefs.length),
    thisMonthRewarded: String(thisMonthRewarded.length),
    totalSuccessful: String(totalSuccessful),
    level: LEVEL_LABEL[level] ?? level,
    rank: rank ? `#${rank}` : "-",
    sahabatCode: (loyalty as any).sahabatCode ?? loyalty.referralCode ?? "-",
  });
  return { sent: result.sent, reason: result.error };
}

/** GET /api/loyalty/admin/expiry-config - read expiry + reminder days */
router.get("/api/loyalty/admin/expiry-config", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak", 403);
  try {
    sendSuccess(res, {
      referralInviteExpiryDays: Number(await storage.getSetting("sahabat_referral_expiry_days")) || 60,
      referralReminderDays: Number(await storage.getSetting("sahabat_referral_reminder_days")) || 7,
      rewardExpiryDays: Number(await storage.getSetting("sahabat_reward_expiry_days")) || 90,
    });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** PUT /api/loyalty/admin/expiry-config - update expiry + reminder days */
router.put("/api/loyalty/admin/expiry-config", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const { referralInviteExpiryDays, referralReminderDays, rewardExpiryDays } = req.body ?? {};
    if (referralInviteExpiryDays != null) await storage.setSetting("sahabat_referral_expiry_days", String(Math.max(1, Number(referralInviteExpiryDays))), "loyalty");
    if (referralReminderDays != null) await storage.setSetting("sahabat_referral_reminder_days", String(Math.max(1, Number(referralReminderDays))), "loyalty");
    if (rewardExpiryDays != null) await storage.setSetting("sahabat_reward_expiry_days", String(Math.max(1, Number(rewardExpiryDays))), "loyalty");
    sendSuccess(res, { saved: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/loyalty/admin/sahabat/:customerId/tier - upgrade tier (RT/RW / Desa setup) */
router.post("/api/loyalty/admin/sahabat/:customerId/tier", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const customerId = Number(req.params.customerId);
    const tier = String(req.body?.tier ?? "");
    const VALID = ["pelanggan", "rtrw", "desa"];
    if (!VALID.includes(tier)) return sendError(res, `tier harus: ${VALID.join(", ")}`);
    const customer = await storage.getCustomer(customerId);
    if (!customer) return sendError(res, "Customer tidak ditemukan", 404);
    // Optional desa metadata
    const metadata = req.body?.metadata ?? null;
    if (tier === "desa" && metadata) {
      await storage.setSetting(`sahabat_desa_${customerId}`, JSON.stringify(metadata), "loyalty");
    }
    await storage.updateSahabatTier(customerId, tier, req.authUser.id);
    await logAudit(req, "UPDATE", "sahabat_tier", customerId, customer.name, { tier, hasMetadata: !!metadata });
    sendSuccess(res, { customerId, tier, metadata });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/loyalty/admin/sahabat/:customerId/points-adjust - adjust points balance (delta + reason) */
router.post("/api/loyalty/admin/sahabat/:customerId/points-adjust", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  const customerId = Number(req.params.customerId);
  if (!Number.isFinite(customerId)) return sendError(res, "Customer ID invalid", 400);
  try {
    const delta = Number(req.body?.delta);
    const reason = String(req.body?.reason ?? "").trim();
    if (!Number.isFinite(delta) || delta === 0) return sendError(res, "Delta harus angka != 0", 400);
    if (reason.length < 3) return sendError(res, "Alasan wajib (min 3 karakter)", 400);
    const result = await storage.adjustSahabatPoints(customerId, delta, reason, req.authUser.id);
    await logAudit(req, "ADJUST", "sahabat_points", customerId, `#${customerId}`, {
      delta, reason, before: result.before, after: result.after,
    });
    sendSuccess(res, result);
  } catch (e: any) {
    const status = String(e?.message ?? "").includes("Balance tidak cukup") ? 409 : 400;
    sendError(res, e?.message ?? "Adjust gagal", status);
  }
});

/** POST /api/loyalty/admin/sahabat/:customerId/level - override sahabat level */
router.post("/api/loyalty/admin/sahabat/:customerId/level", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  const customerId = Number(req.params.customerId);
  if (!Number.isFinite(customerId)) return sendError(res, "Customer ID invalid", 400);
  try {
    const level = String(req.body?.level ?? "");
    const reason = String(req.body?.reason ?? "").trim();
    const result = await storage.setSahabatLevel(customerId, level as any, reason);
    await logAudit(req, "UPDATE", "sahabat_level", customerId, `#${customerId}`, {
      from: result.from, to: result.to, reason,
    });
    sendSuccess(res, result);
  } catch (e: any) {
    sendError(res, e?.message ?? "Set level gagal", 400);
  }
});

/** POST /api/loyalty/admin/sahabat/:customerId/code - rename sahabatCode */
router.post("/api/loyalty/admin/sahabat/:customerId/code", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  const customerId = Number(req.params.customerId);
  if (!Number.isFinite(customerId)) return sendError(res, "Customer ID invalid", 400);
  try {
    const sahabatCode = String(req.body?.sahabatCode ?? "");
    const result = await storage.setSahabatCode(customerId, sahabatCode);
    await logAudit(req, "UPDATE", "sahabat_code", customerId, `#${customerId}`, {
      from: result.from, to: result.to,
    });
    sendSuccess(res, result);
  } catch (e: any) {
    const status = String(e?.message ?? "").includes("sudah dipakai") ? 409 : 400;
    sendError(res, e?.message ?? "Set code gagal", status);
  }
});

/** POST /api/loyalty/admin/sahabat/:customerId/freeze - toggle freeze flag */
router.post("/api/loyalty/admin/sahabat/:customerId/freeze", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  const customerId = Number(req.params.customerId);
  if (!Number.isFinite(customerId)) return sendError(res, "Customer ID invalid", 400);
  try {
    const frozen = Boolean(req.body?.frozen);
    const reason = req.body?.reason ? String(req.body.reason).trim() : null;
    const result = await storage.setSahabatFrozen(customerId, frozen, reason, req.authUser.id);
    await logAudit(req, frozen ? "FREEZE" : "UNFREEZE", "sahabat_account", customerId, `#${customerId}`, { reason });
    sendSuccess(res, result);
  } catch (e: any) {
    sendError(res, e?.message ?? "Toggle freeze gagal", 400);
  }
});

// ============================================================
//  POINTS & SPEED-ON-DEMAND - ADMIN (v4.2.2)
// ============================================================

/** GET /api/loyalty/admin/points/stats - KPI redemption */
router.get("/api/loyalty/admin/points/stats", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak", 403);
  try {
    const stats = await storage.getRedemptionStats();
    sendSuccess(res, stats);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** GET /api/loyalty/admin/points/redemptions?status=pending|active|expired|rejected|cancelled&includeDeleted=true */
router.get("/api/loyalty/admin/points/redemptions", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak", 403);
  try {
    const status = req.query.status as string | undefined;
    const includeDeleted = req.query.includeDeleted === "true";
    const list = await storage.getRedemptions({ status: status === "all" ? undefined : status, limit: 200, includeDeleted });
    sendSuccess(res, list);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/loyalty/admin/points/redemptions/:id/verify - activate redemption + auto-apply MikroTik */
router.post("/api/loyalty/admin/points/redemptions/:id/verify", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const id = Number(req.params.id);
    const notes = req.body?.notes ? String(req.body.notes) : undefined;
    const skipMikrotik = req.body?.skipMikrotik === true;
    let originalPppProfile = req.body?.originalPppProfile ? String(req.body.originalPppProfile) : undefined;
    let boostedPppProfile = req.body?.boostedPppProfile ? String(req.body.boostedPppProfile) : undefined;

    // Try auto-apply MikroTik (kecuali admin explicitly skip)
    if (!skipMikrotik && (!originalPppProfile || !boostedPppProfile)) {
      const existing = await storage.getRedemption(id);
      if (existing) {
        const { applyBoost } = await import("./mikrotik-boost.js");
        const apply = await applyBoost(existing.customerId, existing.speedMultiplier);
        if (apply.success) {
          originalPppProfile = apply.originalProfile;
          boostedPppProfile = apply.boostedProfile;
        } else {
          console.warn(`[Boost] verify auto-apply failed: ${apply.error} (reason: ${apply.reason})`);
        }
      }
    }

    const r = await storage.verifyRedemption(id, req.authUser.id, { notes, originalPppProfile, boostedPppProfile });
    await logAudit(req, "VERIFY", "point_redemption", id, r.rewardLabel, { customerId: r.customerId, mikrotikApplied: !!boostedPppProfile });
    // Fire-and-forget WA notif ke customer
    notifyCustomerBoostActivated(r).catch((e: any) => console.warn("[Boost] WA activated notif:", e.message));
    sendSuccess(res, { ...r, mikrotikAutoApplied: !!boostedPppProfile });
  } catch (e: any) { sendError(res, e.message, 400); }
});

/** Helper: kirim WA "boost activated" ke customer. */
async function notifyCustomerBoostActivated(redemption: any): Promise<void> {
  try {
    const customer = await storage.getCustomer(redemption.customerId);
    if (!customer?.phone) return;
    const loyalty = await storage.getOrCreateCustomerLoyalty(redemption.customerId);
    const { sendLoyaltyNotification } = await import("./mpwa.js");
    const fmtTime = (iso: string) => new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    await sendLoyaltyNotification("sahabat_boost_activated", customer.phone, {
      nama: customer.name,
      rewardLabel: redemption.rewardLabel,
      speedMultiplier: String(redemption.speedMultiplier),
      durationHours: String(redemption.durationHours),
      startAt: redemption.startAt ? fmtTime(redemption.startAt) : "-",
      endAt: redemption.endAt ? fmtTime(redemption.endAt) : "-",
      balance: String((loyalty as any).pointsBalance ?? 0),
    });
  } catch (e: any) {
    console.warn("[Boost] notifyCustomerBoostActivated:", e.message);
  }
}

/** Helper: WA "boost rejected" + point refunded. */
async function notifyCustomerBoostRejected(redemption: any, reason: string): Promise<void> {
  try {
    const customer = await storage.getCustomer(redemption.customerId);
    if (!customer?.phone) return;
    const loyalty = await storage.getOrCreateCustomerLoyalty(redemption.customerId);
    const { sendLoyaltyNotification } = await import("./mpwa.js");
    await sendLoyaltyNotification("sahabat_boost_rejected", customer.phone, {
      nama: customer.name,
      rewardLabel: redemption.rewardLabel,
      reason,
      pointsCost: String(redemption.pointsCost),
      balance: String((loyalty as any).pointsBalance ?? 0),
    });
  } catch (e: any) {
    console.warn("[Boost] notifyCustomerBoostRejected:", e.message);
  }
}

/** POST /api/loyalty/admin/points/redemptions/:id/reject - reject pending + refund points */
router.post("/api/loyalty/admin/points/redemptions/:id/reject", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const id = Number(req.params.id);
    const reason = String(req.body?.reason ?? "rejected by admin").trim();
    const r = await storage.refundRedemption(id, reason, req.authUser.id, "rejected");
    await logAudit(req, "REJECT", "point_redemption", id, r.rewardLabel, { customerId: r.customerId, reason });
    notifyCustomerBoostRejected(r, reason).catch((e: any) => console.warn("[Boost] WA rejected notif:", e.message));
    sendSuccess(res, r);
  } catch (e: any) { sendError(res, e.message, 400); }
});

/** POST /api/loyalty/admin/points/redemptions/:id/cancel - cancel active early + revert MikroTik + refund */
router.post("/api/loyalty/admin/points/redemptions/:id/cancel", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const id = Number(req.params.id);
    const reason = String(req.body?.reason ?? "cancelled by admin").trim();
    // Get redemption sebelum cancel - kalau active dengan MikroTik data, revert dulu
    const before = await storage.getRedemption(id);
    if (before?.status === "active" && before.originalPppProfile) {
      try {
        const { revertBoost } = await import("./mikrotik-boost.js");
        const result = await revertBoost(before.customerId, before.originalPppProfile);
        if (!result.success) {
          console.warn(`[Boost] cancel revert failed: ${result.error}`);
        }
      } catch (e: any) { console.warn("[Boost] cancel revert exception:", e.message); }
    }
    const r = await storage.refundRedemption(id, reason, req.authUser.id, "cancelled");
    await logAudit(req, "CANCEL", "point_redemption", id, r.rewardLabel, { customerId: r.customerId, reason, wasActive: before?.status === "active" });
    sendSuccess(res, r);
  } catch (e: any) { sendError(res, e.message, 400); }
});

/** PUT /api/loyalty/admin/points/redemptions/:id - edit boost params (status='pending' only) */
router.put("/api/loyalty/admin/points/redemptions/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return sendError(res, "ID invalid", 400);
  try {
    const { rewardKey, rewardLabel, speedMultiplier, durationHours, pointsCost, notes } = req.body || {};
    const updated = await storage.updatePointRedemption(id, { rewardKey, rewardLabel, speedMultiplier, durationHours, pointsCost, notes });
    await logAudit(req, "UPDATE", "loyalty_redemption", id, updated.rewardLabel ?? `#${id}`, {
      rewardKey, rewardLabel, speedMultiplier, durationHours, pointsCost, notes,
    });
    sendSuccess(res, updated);
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    const status = msg.includes("tidak bisa di-edit") ? 409 :
                   msg.includes("tidak ditemukan") ? 404 : 400;
    sendError(res, e?.message ?? "Update gagal", status);
  }
});

/** DELETE /api/loyalty/admin/points/redemptions/:id - soft delete (block 'active', auto-refund pending) */
router.delete("/api/loyalty/admin/points/redemptions/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return sendError(res, "ID invalid", 400);
  try {
    const reason = String(req.body?.reason ?? "").trim() || null;
    const { statusAtDelete, refunded } = await storage.softDeletePointRedemption(id, req.authUser.id, reason ?? undefined);
    await logAudit(req, "DELETE", "loyalty_redemption", id, `#${id}`, { reason, statusAtDelete, refunded });
    sendSuccess(res, { success: true, refunded });
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    const status = (msg.includes("tidak bisa dihapus") || msg.includes("'active'")) ? 409 :
                   msg.includes("tidak ditemukan") ? 404 : 400;
    sendError(res, e?.message ?? "Hapus gagal", status);
  }
});

/** GET /api/loyalty/admin/mikrotik-boost/config - read MikroTik auto-activate settings */
router.get("/api/loyalty/admin/mikrotik-boost/config", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak", 403);
  try {
    const autoEnabled = (await storage.getSetting("mikrotik_boost_auto_activate")) !== "false";
    const pattern = (await storage.getSetting("mikrotik_boost_profile_pattern")) || "{base}-boost-{multiplier}x";
    const mapRaw = (await storage.getSetting("mikrotik_boost_profile_map")) || "";
    let mapParsed: any = null;
    if (mapRaw) { try { mapParsed = JSON.parse(mapRaw); } catch { /* ignore */ } }
    sendSuccess(res, { autoEnabled, pattern, profileMap: mapParsed });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** PUT /api/loyalty/admin/mikrotik-boost/config - update settings */
router.put("/api/loyalty/admin/mikrotik-boost/config", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const { autoEnabled, pattern, profileMap } = req.body ?? {};
    if (autoEnabled !== undefined) await storage.setSetting("mikrotik_boost_auto_activate", autoEnabled ? "true" : "false", "loyalty");
    if (pattern !== undefined) {
      const p = String(pattern).trim();
      if (p && (!p.includes("{base}") || !p.includes("{multiplier}"))) {
        return sendError(res, "Pattern harus include placeholder {base} dan {multiplier}");
      }
      await storage.setSetting("mikrotik_boost_profile_pattern", p, "loyalty");
    }
    if (profileMap !== undefined) {
      if (profileMap === null || profileMap === "") {
        await storage.setSetting("mikrotik_boost_profile_map", "", "loyalty");
      } else if (typeof profileMap === "object") {
        await storage.setSetting("mikrotik_boost_profile_map", JSON.stringify(profileMap), "loyalty");
      } else if (typeof profileMap === "string") {
        // Validate JSON
        try { JSON.parse(profileMap); } catch { return sendError(res, "profileMap harus JSON valid"); }
        await storage.setSetting("mikrotik_boost_profile_map", profileMap, "loyalty");
      }
    }
    await logAudit(req, "UPDATE", "mikrotik_boost_config", undefined, undefined, { autoEnabled, pattern, hasMap: !!profileMap });
    sendSuccess(res, { saved: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/loyalty/admin/mikrotik-boost/test - test apply boost untuk 1 customer (dry-run check) */
router.post("/api/loyalty/admin/mikrotik-boost/test", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const customerId = Number(req.body?.customerId);
    const multiplier = Number(req.body?.multiplier) || 2;
    if (!customerId) return sendError(res, "customerId wajib");
    const { applyBoost, revertBoost } = await import("./mikrotik-boost.js");
    const apply = await applyBoost(customerId, multiplier);
    if (!apply.success) {
      const { success: _ignored1, ...rest1 } = apply as any;
      return sendSuccess(res, { tested: true, success: false, ...rest1 });
    }
    // Auto-revert setelah test (setelah 5 detik untuk ngasih waktu liat di MikroTik)
    setTimeout(() => {
      revertBoost(customerId, apply.originalProfile!, apply.routerId).catch(() => {});
    }, 5000);
    const { success: _ignored2, ...rest2 } = apply as any;
    sendSuccess(res, {
      tested: true,
      success: true,
      message: `Test sukses - profile sementara di-set ke ${apply.boostedProfile} (di router ${apply.routerName}), auto-revert dalam 5 detik`,
      ...rest2,
    });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** GET /api/loyalty/admin/points/config - earn rules + catalog */
router.get("/api/loyalty/admin/points/config", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak", 403);
  try {
    const onTime = Number(await storage.getSetting("points_earn_on_time")) || 100;
    const earlyBonus = Number(await storage.getSetting("points_earn_early_bonus")) || 50;
    const earlyDays = Number(await storage.getSetting("points_earn_early_days_threshold")) || 3;
    const catalogRaw = await storage.getSetting("speed_boost_catalog");
    let catalog: any[] = [];
    if (catalogRaw) {
      try { catalog = JSON.parse(catalogRaw); } catch { /* ignore */ }
    }
    sendSuccess(res, {
      earnOnTimePts: onTime,
      earnEarlyBonusPts: earlyBonus,
      earnEarlyDaysThreshold: earlyDays,
      catalog,
    });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** PUT /api/loyalty/admin/points/config - update earn rules + catalog */
router.put("/api/loyalty/admin/points/config", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const { earnOnTimePts, earnEarlyBonusPts, earnEarlyDaysThreshold, catalog } = req.body ?? {};
    if (earnOnTimePts != null) await storage.setSetting("points_earn_on_time", String(Math.max(0, Number(earnOnTimePts))), "loyalty");
    if (earnEarlyBonusPts != null) await storage.setSetting("points_earn_early_bonus", String(Math.max(0, Number(earnEarlyBonusPts))), "loyalty");
    if (earnEarlyDaysThreshold != null) await storage.setSetting("points_earn_early_days_threshold", String(Math.max(0, Number(earnEarlyDaysThreshold))), "loyalty");
    if (catalog) {
      if (!Array.isArray(catalog)) return sendError(res, "catalog harus array");
      await storage.setSetting("speed_boost_catalog", JSON.stringify(catalog), "loyalty");
    }
    await logAudit(req, "UPDATE", "points_config", undefined, undefined, { earnOnTimePts, earnEarlyBonusPts, hasCatalog: !!catalog });
    sendSuccess(res, { saved: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** GET /api/loyalty/admin/points/backfill/preview - preview initial loyalty grant per tier */
router.get("/api/loyalty/admin/points/backfill/preview", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak", 403);
  try {
    const preview = await storage.previewInitialLoyaltyBackfill();
    sendSuccess(res, preview);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/loyalty/admin/points/backfill - execute backfill (idempotent, audit) */
router.post("/api/loyalty/admin/points/backfill", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const result = await storage.backfillInitialLoyaltyPoints();
    await logAudit(req, "BACKFILL", "loyalty_points", undefined,
      `${result.granted} customer · ${result.totalPointsGranted.toLocaleString("id-ID")} pts`,
      result);
    sendSuccess(res, result);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/loyalty/admin/points/redemptions/expire-overdue - manual trigger atomic expire+revert */
router.post("/api/loyalty/admin/points/redemptions/expire-overdue", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const overdue = await storage.getOverdueActiveRedemptions();
    let success = 0, failed = 0;
    const failures: Array<{ id: number; error: string }> = [];
    if (overdue.length > 0) {
      const { revertBoost } = await import("./mikrotik-boost.js");
      const { sendLoyaltyNotification } = await import("./mpwa.js");
      for (const r of overdue) {
        if ((r as any).originalPppProfile) {
          const result = await revertBoost(r.customerId, (r as any).originalPppProfile).catch((e: any) => ({ success: false, error: e.message }));
          if (!result.success) {
            await storage.recordRevertFailure(r.id, result.error ?? "unknown");
            failed++;
            failures.push({ id: r.id, error: result.error ?? "unknown" });
            continue;
          }
        }
        await storage.markRevertedAndExpired(r.id);
        success++;
        // WA notif
        try {
          const customer = await storage.getCustomer(r.customerId);
          if (customer?.phone) {
            const loyalty = await storage.getOrCreateCustomerLoyalty(r.customerId);
            await sendLoyaltyNotification("sahabat_boost_expired", customer.phone, {
              nama: customer.name,
              rewardLabel: r.rewardLabel,
              normalPackage: customer.package || "paket berlangganan",
              lifetimeEarned: String((loyalty as any).pointsLifetimeEarned ?? 0),
              balance: String((loyalty as any).pointsBalance ?? 0),
            });
          }
        } catch (e: any) { console.warn("[Boost] manual expire WA:", e.message); }
      }
    }
    await logAudit(req, "EXPIRE", "point_redemptions", undefined, `${success} expired, ${failed} failed revert`);
    sendSuccess(res, { processed: overdue.length, expired: success, revertFailed: failed, failures });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/loyalty/admin/points/redemptions/:id/force-expire - admin override force-mark expired tanpa revert MikroTik */
router.post("/api/loyalty/admin/points/redemptions/:id/force-expire", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const id = Number(req.params.id);
    const reason = String(req.body?.reason ?? "").trim();
    if (!reason) return sendError(res, "reason wajib (audit trail) - misal: 'Sudah set profile manual via WinBox'");
    const r = await storage.forceExpireRedemption(id, req.authUser.id, reason);
    if (!r) return sendError(res, "Redemption tidak ditemukan", 404);
    await logAudit(req, "FORCE_EXPIRE", "point_redemption", id, r.rewardLabel, { customerId: r.customerId, reason });
    sendSuccess(res, r);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** GET /api/loyalty/admin/points/redemptions/health - list redemption dengan revert issues (admin alert) */
router.get("/api/loyalty/admin/points/redemptions/health", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak", 403);
  try {
    const all = await storage.getRedemptions({ limit: 500 });
    const overdueWithFailure = all.filter((r: any) =>
      r.status === "active"
      && r.endAt
      && new Date(r.endAt).getTime() < Date.now()
      && (r.revertAttempts ?? 0) > 0
    );
    sendSuccess(res, {
      overdueCount: overdueWithFailure.length,
      criticalCount: overdueWithFailure.filter((r: any) => (r.revertAttempts ?? 0) >= 5).length,
      items: overdueWithFailure.map((r: any) => ({
        id: r.id,
        customerId: r.customerId,
        customerName: r.customerName,
        customerBillingId: r.customerBillingId,
        rewardLabel: r.rewardLabel,
        endAt: r.endAt,
        originalPppProfile: r.originalPppProfile,
        boostedPppProfile: r.boostedPppProfile,
        revertAttempts: r.revertAttempts,
        revertError: r.revertError,
      })),
    });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/loyalty/admin/points/award - manual award points to customer (admin) */
router.post("/api/loyalty/admin/points/award", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const customerId = Number(req.body?.customerId);
    const amount = Number(req.body?.amount);
    const reason = String(req.body?.reason ?? "").trim();
    if (!customerId || !amount || amount <= 0) return sendError(res, "customerId + amount > 0 wajib");
    if (!reason) return sendError(res, "reason wajib (audit trail)");
    const customer = await storage.getCustomer(customerId);
    if (!customer) return sendError(res, "Customer tidak ditemukan", 404);
    const tx = await storage.earnPoints({
      customerId, amount, source: "manual_adjust",
      notes: `Admin award: ${reason}`,
      createdBy: req.authUser.id,
    });
    await logAudit(req, "AWARD", "points", customerId, customer.name, { amount, reason });
    sendSuccess(res, tx, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/loyalty/admin/streak-adjust - manual adjust for dispute/correction */
router.post("/api/loyalty/admin/streak-adjust", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const customerId = Number(req.body?.customerId);
    const newStreak = Number(req.body?.newStreak);
    const reason = String(req.body?.reason ?? "manual adjustment");
    if (!customerId || isNaN(newStreak) || newStreak < 0) return sendError(res, "customerId + newStreak wajib");
    await storage.adjustLoyaltyStreak(customerId, newStreak, reason, req.authUser.id);
    sendSuccess(res, { customerId, newStreak, reason });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ========== PUBLIC API KEY MANAGEMENT (admin only) ==========

const VALID_API_SCOPES = ["marketing:read", "marketing:write", "reports:read", "leads:read", "collections:read", "sahabat:read", "tickets:read", "finance:read", "customers:read", "teamspace:read", "divisions:read", "*"];

/** GET /api/api-keys - list all keys (hash never exposed) */
router.get("/api/api-keys", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "api_keys")) return sendError(res, "Akses ditolak", 403);
  try {
    const keys = await storage.listApiKeys();
    sendSuccess(res, keys.map((k: any) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      scopes: (() => { try { return JSON.parse(k.scopes); } catch { return []; } })(),
      rateLimit: k.rateLimit,
      enabled: !!k.enabled,
      expiresAt: k.expiresAt,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
      lastUsedIp: k.lastUsedIp,
      totalRequests: k.totalRequests,
      revokedAt: k.revokedAt,
      revokedReason: k.revokedReason,
    })));
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/api-keys - create new key. Full key returned ONCE (never again). */
router.post("/api/api-keys", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "api_keys")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const name = String(req.body?.name ?? "").trim();
    const scopes: string[] = Array.isArray(req.body?.scopes) ? req.body.scopes : [];
    const rateLimit = Number(req.body?.rateLimit) || 60;
    const expiresAt = req.body?.expiresAt ? String(req.body.expiresAt) : null;

    if (!name) return sendError(res, "Nama API key wajib diisi");
    if (scopes.length === 0) return sendError(res, "Minimal pilih 1 scope");
    for (const s of scopes) {
      if (!VALID_API_SCOPES.includes(s)) return sendError(res, `Scope "${s}" tidak valid. Valid: ${VALID_API_SCOPES.join(", ")}`);
    }
    if (rateLimit < 1 || rateLimit > 6000) return sendError(res, "Rate limit harus 1-6000 req/min");

    const { generateApiKey, hashApiKey } = await import("./public-api-routes.js");
    const { key: plainKey, prefix } = generateApiKey();
    const keyHash = await hashApiKey(plainKey);

    const row = await storage.createApiKey({
      name, keyPrefix: prefix, keyHash, scopes, rateLimit, expiresAt,
      createdByUserId: req.authUser.id,
    });

    await logAudit(req, "CREATE", "api_key", row.id, name, { scopes, rateLimit });

    // Return plain key ONCE - user must store this
    sendSuccess(res, {
      id: row.id,
      name: row.name,
      keyPrefix: row.keyPrefix,
      fullKey: plainKey,  // ONE-TIME display
      scopes,
      rateLimit: row.rateLimit,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      warning: "Simpan 'fullKey' sekarang - key ini tidak akan ditampilkan lagi setelah dialog ditutup.",
    }, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** PATCH /api/api-keys/:id - update name/scopes/rateLimit/enabled/expiresAt */
router.patch("/api/api-keys/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "api_keys")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const id = Number(req.params.id);
    const updates: any = {};
    if (req.body?.name !== undefined) updates.name = String(req.body.name).trim();
    if (req.body?.scopes !== undefined) {
      if (!Array.isArray(req.body.scopes)) return sendError(res, "scopes harus array");
      for (const s of req.body.scopes) {
        if (!VALID_API_SCOPES.includes(s)) return sendError(res, `Scope "${s}" tidak valid`);
      }
      updates.scopes = req.body.scopes;
    }
    if (req.body?.rateLimit !== undefined) updates.rateLimit = Number(req.body.rateLimit);
    if (req.body?.enabled !== undefined) updates.enabled = Boolean(req.body.enabled);
    if (req.body?.expiresAt !== undefined) updates.expiresAt = req.body.expiresAt ? String(req.body.expiresAt) : null;

    const row = await storage.updateApiKey(id, updates);
    if (!row) return sendError(res, "API key tidak ditemukan", 404);
    await logAudit(req, "UPDATE", "api_key", id, row.name, updates);
    sendSuccess(res, row);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/api-keys/:id/revoke - revoke (disable + timestamp) */
router.post("/api/api-keys/:id/revoke", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "api_keys")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const id = Number(req.params.id);
    const reason = String(req.body?.reason ?? "revoked by admin");
    await storage.revokeApiKey(id, reason);
    await logAudit(req, "REVOKE", "api_key", id, reason);
    sendSuccess(res, { id, revoked: true, reason });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** DELETE /api/api-keys/:id - hapus permanen + usage logs */
router.delete("/api/api-keys/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "api_keys")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const id = Number(req.params.id);
    const key = await storage.getApiKey(id);
    if (!key) return sendError(res, "API key tidak ditemukan", 404);
    await storage.deleteApiKey(id);
    await logAudit(req, "DELETE", "api_key", id, key.name);
    sendSuccess(res, { id, deleted: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** GET /api/api-keys/:id/usage - recent usage logs */
router.get("/api/api-keys/:id/usage", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "api_keys")) return sendError(res, "Akses ditolak", 403);
  try {
    const id = Number(req.params.id);
    const limit = Math.min(500, Number(req.query.limit) || 50);
    const logs = await storage.getApiKeyRecentLogs(id, limit);
    sendSuccess(res, logs);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ==================================================================
// NOTIFICATIONS (bell icon) - semua authenticated user dapat akses own-notifications
// ==================================================================

/** GET /api/notifications - list own notifications */
router.get("/api/notifications", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const limit = Math.min(100, Number(req.query.limit) || 30);
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const unreadOnly = req.query.unreadOnly === "true";
    const list = await storage.getNotifications(req.authUser.id, limit, offset, unreadOnly);
    sendSuccess(res, list);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** GET /api/notifications/unread-count - badge count */
router.get("/api/notifications/unread-count", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const n = await storage.getUnreadNotificationCount(req.authUser.id);
    sendSuccess(res, { count: n });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/notifications/:id/read */
router.post("/api/notifications/:id/read", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    await storage.markNotificationRead(Number(req.params.id), req.authUser.id);
    sendSuccess(res, { ok: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/notifications/read-all */
router.post("/api/notifications/read-all", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const n = await storage.markAllNotificationsRead(req.authUser.id);
    sendSuccess(res, { markedRead: n });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** DELETE /api/notifications/:id */
router.delete("/api/notifications/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    await storage.deleteNotification(Number(req.params.id), req.authUser.id);
    sendSuccess(res, { ok: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ==================================================================
// ANNOUNCEMENTS (News Feed) - semua user bisa baca published; admin kelola
// ==================================================================

/** GET /api/announcements - list (default: published only) */
router.get("/api/announcements", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const isAdmin = hasPermission(req, "announcements_admin");
    const category = req.query.category as string | undefined;
    const list = await storage.listAnnouncements({
      publishedOnly: !isAdmin || req.query.publishedOnly === "true",
      category,
      limit: Math.min(200, Number(req.query.limit) || 100),
    });
    // Teamspace FR-601/603: pengumuman Rahasia hanya untuk penerima/penulis/admin;
    // status expired dianotasi (riwayat tetap terbaca penerima - FR-603).
    const confidentialIds = list.filter((a: any) => a.isConfidential === 1).map((a: any) => a.id);
    const recipientsMap = await storage.getRecipientsForOwners("announcement", confidentialIds);
    const uid = req.authUser.id;
    const nowIsoAnn = new Date().toISOString();
    const visible = list.filter((a: any) => a.isConfidential !== 1 || isAdmin
      || a.authorId === uid || (recipientsMap.get(a.id) ?? []).includes(uid));
    sendSuccess(res, visible.map((a: any) => ({
      ...a,
      recipientIds: a.isConfidential === 1 ? (recipientsMap.get(a.id) ?? []) : [],
      isExpired: Boolean(a.expiresAt && a.expiresAt < nowIsoAnn),
    })));
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** GET /api/announcements/:id */
router.get("/api/announcements/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const row = await storage.getAnnouncement(Number(req.params.id));
    if (!row) return sendError(res, "Pengumuman tidak ditemukan", 404);
    // If unpublished, only admin can see
    if (!row.publishedAt && !hasPermission(req, "announcements_admin")) {
      return sendError(res, "Akses ditolak", 403);
    }
    // Teamspace FR-601: Rahasia → hanya penerima/penulis/admin (404 sembunyikan keberadaan).
    if ((row as any).isConfidential === 1 && !hasPermission(req, "announcements_admin") && row.authorId !== req.authUser.id) {
      const rcpts = await storage.getContentRecipients("announcement", row.id);
      if (!rcpts.includes(req.authUser.id)) return sendError(res, "Pengumuman tidak ditemukan", 404);
    }
    sendSuccess(res, row);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/announcements - create (draft or direct publish) */
router.post("/api/announcements", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "announcements_admin")) return sendError(res, "Akses ditolak", 403);
  try {
    const { title, content, category, severity, version, publishedAt, pinnedUntil, isConfidential, expiresAt, recipientIds } = req.body;
    if (!title?.trim() || !content?.trim() || !category) return sendError(res, "title, content, category wajib");
    if (!["feature_update", "bug_fix", "announcement", "maintenance", "training"].includes(category)) {
      return sendError(res, "category tidak valid");
    }
    // Teamspace FR-601: penerima terpilih + Rahasia + expiry otomatis.
    const targetIds: number[] = Array.isArray(recipientIds) ? recipientIds.map(Number).filter((n: number) => Number.isFinite(n) && n > 0) : [];
    if (isConfidential && targetIds.length === 0) return sendError(res, "Pengumuman Rahasia butuh minimal satu penerima");
    const row = await storage.createAnnouncement({
      title: String(title).trim(),
      content: String(content).trim(),
      category, severity, version,
      authorId: req.authUser.id,
      publishedAt: publishedAt ? String(publishedAt) : null,
      pinnedUntil: pinnedUntil ? String(pinnedUntil) : null,
      isConfidential: Boolean(isConfidential),
      expiresAt: expiresAt ? String(expiresAt) : null,
    });
    if (targetIds.length > 0) await storage.setContentRecipients("announcement", row.id, targetIds);

    // Publish → notif: bertarget bila ada penerima terpilih, broadcast bila tidak.
    if (row.publishedAt && targetIds.length > 0) {
      const catLabel: any = { feature_update: " Fitur Baru", bug_fix: " Perbaikan Bug", announcement: " Pengumuman", maintenance: " Maintenance", training: " Training" };
      for (const uidTarget of targetIds) {
        if (uidTarget === req.authUser.id) continue;
        await storage.createNotification({
          userId: uidTarget, type: "announcement",
          title: `${catLabel[row.category] ?? ""}: ${row.title}`,
          message: row.content.length > 150 ? row.content.slice(0, 147) + "..." : row.content,
          link: `/announcements/${row.id}`, entityType: "announcement", entityId: row.id,
          fromUserId: req.authUser.id,
        }).catch(() => {});
      }
    } else if (row.publishedAt) {
      const categoryLabel: any = {
        feature_update: " Fitur Baru",
        bug_fix: " Perbaikan Bug",
        announcement: " Pengumuman",
        maintenance: " Maintenance",
        training: " Training",
      };
      try {
        await storage.broadcastNotification({
          type: "announcement",
          title: `${categoryLabel[row.category] ?? ""}: ${row.title}`,
          message: row.content.length > 150 ? row.content.slice(0, 147) + "..." : row.content,
          link: `/announcements/${row.id}`,
          entityType: "announcement", entityId: row.id,
          fromUserId: req.authUser.id,
          excludeUserId: req.authUser.id, // author sendiri tidak dapat notif
        });
      } catch (e: any) { console.warn("[notif] announcement broadcast failed:", e.message); }
    }

    await logAudit(req, "CREATE", "announcement", row.id, row.title);
    sendSuccess(res, row, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** PATCH /api/announcements/:id */
router.patch("/api/announcements/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "announcements_admin")) return sendError(res, "Akses ditolak", 403);
  try {
    const id = Number(req.params.id);
    const before = await storage.getAnnouncement(id);
    if (!before) return sendError(res, "Tidak ditemukan", 404);
    const row = await storage.updateAnnouncement(id, req.body);
    // Teamspace FR-601: update targeting (Rahasia/expiry/penerima) bila dikirim.
    if (req.body?.isConfidential !== undefined || req.body?.expiresAt !== undefined) {
      await storage.setAnnouncementTargeting(id, {
        isConfidential: req.body.isConfidential !== undefined ? Boolean(req.body.isConfidential) : undefined,
        expiresAt: req.body.expiresAt !== undefined ? (req.body.expiresAt ? String(req.body.expiresAt) : null) : undefined,
      });
    }
    if (Array.isArray(req.body?.recipientIds)) {
      await storage.setContentRecipients("announcement", id,
        req.body.recipientIds.map(Number).filter((n: number) => Number.isFinite(n) && n > 0));
    }
    // Kalau baru dipublish sekarang → broadcast notif
    if (!before.publishedAt && row?.publishedAt) {
      const categoryLabel: any = {
        feature_update: " Fitur Baru",
        bug_fix: " Perbaikan Bug",
        announcement: " Pengumuman",
        maintenance: " Maintenance",
        training: " Training",
      };
      try {
        await storage.broadcastNotification({
          type: "announcement",
          title: `${categoryLabel[row.category] ?? ""}: ${row.title}`,
          message: row.content.length > 150 ? row.content.slice(0, 147) + "..." : row.content,
          link: `/announcements/${row.id}`,
          entityType: "announcement", entityId: row.id,
          fromUserId: req.authUser.id,
          excludeUserId: req.authUser.id,
        });
      } catch (e: any) { console.warn("[notif] announcement broadcast failed:", e.message); }
    }
    await logAudit(req, "UPDATE", "announcement", id, row?.title);
    sendSuccess(res, row);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** DELETE /api/announcements/:id */
router.delete("/api/announcements/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "announcements_admin")) return sendError(res, "Akses ditolak", 403);
  try {
    const id = Number(req.params.id);
    const row = await storage.getAnnouncement(id);
    if (!row) return sendError(res, "Tidak ditemukan", 404);
    await storage.deleteAnnouncement(id);
    await logAudit(req, "DELETE", "announcement", id, row.title);
    sendSuccess(res, { ok: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ==================================================================
// BUG REPORTS - semua authenticated user bisa create & view list
// Admin / yang ada permission bug_reports (write) bisa triage
// ==================================================================

/** GET /api/bugs - list */
router.get("/api/bugs", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const status = req.query.status as string | undefined;
    const severity = req.query.severity as string | undefined;
    const mine = req.query.mine === "true";
    const filter: any = { status, severity, limit: Math.min(500, Number(req.query.limit) || 200) };
    if (mine) filter.reportedBy = req.authUser.id;
    const list = await storage.listBugReports(filter);
    sendSuccess(res, list);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** GET /api/bugs/stats */
router.get("/api/bugs/stats", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    sendSuccess(res, await storage.getBugStats());
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** GET /api/bugs/:id */
router.get("/api/bugs/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const row = await storage.getBugReport(Number(req.params.id));
    if (!row) return sendError(res, "Tidak ditemukan", 404);
    const comments = await storage.getBugComments(row.id);
    sendSuccess(res, { bug: row, comments });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** GET /api/bugs/:id/photo - stream screenshot (filesystem-aware + legacy fallback) */
router.get("/api/bugs/:id/photo", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const id = Number(req.params.id);
    const meta = await storage.getBugReportPhotoMeta(id);
    if (!meta) return sendError(res, "Tidak ditemukan", 404);
    // ACL: reporter sendiri ATAU admin
    const isAdmin = req.authUser.role === "admin" || req.authUser.isSystemAdmin;
    if (!isAdmin && meta.reportedByUserId !== req.authUser.id) {
      return sendError(res, "Akses ditolak", 403);
    }
    if (meta.photoPath) {
      await streamPhoto(meta.photoPath, res);
      return;
    }
    if (meta.photoData) {
      const m = /^data:(image\/[a-z0-9+.-]+);base64,(.+)$/i.exec(meta.photoData);
      if (m) {
        res.setHeader("Content-Type", m[1]);
        res.setHeader("Cache-Control", "private, max-age=300");
        res.send(Buffer.from(m[2], "base64"));
        return;
      }
    }
    return sendError(res, "Foto tidak tersedia", 404);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/bugs - create bug (any authenticated user) */
router.post("/api/bugs", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const { title, description, stepsToReproduce, severity, affectedFeature, photoData } = req.body;
    if (!title?.trim()) return sendError(res, "title wajib");
    if (severity && !["low", "medium", "high", "critical"].includes(severity)) return sendError(res, "severity tidak valid");

    const browserInfo = req.headers["user-agent"] ?? "";
    const row = await storage.createBugReport({
      title: String(title).trim(),
      description: description ? String(description).trim() : undefined,
      stepsToReproduce: stepsToReproduce ? String(stepsToReproduce).trim() : undefined,
      severity, affectedFeature, browserInfo: String(browserInfo),
      reportedByUserId: req.authUser.id,
      photoData,
    });

    // Notify all admins (yang punya bug_reports permission)
    try {
      const allUsers = await storage.getAllUsers();
      for (const u of allUsers) {
        if (u.id === req.authUser.id) continue;
        // naive admin filter: role admin
        if (u.role === "admin" && u.isActive) {
          await storage.createNotification({
            userId: u.id,
            type: "bug_report",
            title: ` Bug Baru (${severity ?? "medium"}): ${row.title}`,
            message: `Dilaporkan oleh ${req.authUser.name}`,
            link: `/bugs/${row.id}`,
            entityType: "bug", entityId: row.id,
            fromUserId: req.authUser.id,
          });
        }
      }
    } catch (e: any) { console.warn("[notif] bug create notify failed:", e.message); }

    await logAudit(req, "CREATE", "bug", row.id, row.title);
    sendSuccess(res, row, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** PATCH /api/bugs/:id - update status/assign/resolution (admin only) */
router.patch("/api/bugs/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "bug_reports")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const id = Number(req.params.id);
    const before = await storage.getBugReport(id);
    if (!before) return sendError(res, "Tidak ditemukan", 404);

    const row = await storage.updateBugReport(id, req.body);
    if (!row) return sendError(res, "Tidak ditemukan", 404);

    // Notify reporter kalau status berubah
    if (req.body?.status && req.body.status !== before.status && before.reportedByUserId !== req.authUser.id) {
      const statusLabel: any = {
        triaged: " Bug kamu di-triage", in_progress: " Bug kamu sedang diperbaiki",
        resolved: " Bug kamu sudah diperbaiki", closed: "✔ Bug kamu ditutup",
        duplicate: "⧉ Bug kamu ditandai duplikat", wontfix: "⊘ Bug kamu wontfix",
      };
      try {
        await storage.createNotification({
          userId: before.reportedByUserId,
          type: "bug_update",
          title: statusLabel[req.body.status] ?? "Status bug kamu update",
          message: `"${row.title}" → ${req.body.status}`,
          link: `/bugs/${id}`,
          entityType: "bug", entityId: id,
          fromUserId: req.authUser.id,
        });
      } catch (e: any) { console.warn("[notif] bug_update failed:", e.message); }
    }

    // Notify assignee kalau baru di-assign
    if (req.body?.assignedToUserId && req.body.assignedToUserId !== before.assignedToUserId
        && req.body.assignedToUserId !== req.authUser.id) {
      try {
        await storage.createNotification({
          userId: Number(req.body.assignedToUserId),
          type: "bug_assigned",
          title: ` Bug ditugaskan untuk Anda`,
          message: `${row.title} (${row.severity})`,
          link: `/bugs/${id}`,
          entityType: "bug", entityId: id,
          fromUserId: req.authUser.id,
        });
      } catch (e: any) { console.warn("[notif] bug_assigned failed:", e.message); }
    }

    await logAudit(req, "UPDATE", "bug", id, row.title, { changes: Object.keys(req.body) });
    sendSuccess(res, row);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** DELETE /api/bugs/:id - admin only */
router.delete("/api/bugs/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "bug_reports")) return sendError(res, "Akses ditolak", 403);
  try {
    const id = Number(req.params.id);
    const row = await storage.getBugReport(id);
    if (!row) return sendError(res, "Tidak ditemukan", 404);
    await storage.deleteBugReport(id);
    await logAudit(req, "DELETE", "bug", id, row.title);
    sendSuccess(res, { ok: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/bugs/:id/comments */
router.post("/api/bugs/:id/comments", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const bugId = Number(req.params.id);
    const content = String(req.body?.content ?? "").trim();
    if (!content) return sendError(res, "content wajib");
    const row = await storage.createBugComment(bugId, req.authUser.id, content);

    // Notify reporter + assignee (kalau bukan user yang komen)
    const bug = await storage.getBugReport(bugId);
    const toNotify = new Set<number>();
    if (bug.reportedByUserId && bug.reportedByUserId !== req.authUser.id) toNotify.add(bug.reportedByUserId);
    if (bug.assignedToUserId && bug.assignedToUserId !== req.authUser.id) toNotify.add(bug.assignedToUserId);
    for (const uid of toNotify) {
      try {
        await storage.createNotification({
          userId: uid,
          type: "bug_comment",
          title: ` Komentar baru di bug kamu`,
          message: `${req.authUser.name}: "${content.length > 80 ? content.slice(0, 77) + "..." : content}"`,
          link: `/bugs/${bugId}`,
          entityType: "bug", entityId: bugId,
          fromUserId: req.authUser.id,
        });
      } catch {}
    }

    sendSuccess(res, row, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/collections/run-thresholds - manual trigger Phase 2 (admin) */
router.post("/api/collections/run-thresholds", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "collections")) return sendError(res, "Akses ditolak", 403);
  try {
    const result = await billingSyncWorker.triggerThresholdCheck();
    await logAudit(req, "TRIGGER", "collection_thresholds", undefined, "manual", result);
    sendSuccess(res, result);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** GET /api/customers/:id/payment-history - timeline riwayat customer */
router.get("/api/customers/:id/payment-history", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "collections") && !hasPermission(req, "customers")) {
    return sendError(res, "Akses ditolak", 403);
  }
  try {
    const customerId = Number(req.params.id);
    const customer = await storage.getCustomer(customerId);
    if (!customer) return sendError(res, "Customer tidak ditemukan", 404);

    // Ambil semua collection (open+closed) untuk customer ini
    const collections = await storage.getCollections({ customerId, openOnly: false });

    // Untuk setiap collection, ambil activities-nya
    const events: any[] = [];
    for (const col of collections) {
      const activities = await storage.getCollectionActivities(col.id);
      for (const a of activities) {
        events.push({
          timestamp: a.createdAt,
          type: a.type,
          source: "collection_activity",
          collectionId: col.id,
          collectionStage: col.stage,
          billingPeriod: (col as any).billingPeriod ?? null,
          content: a.content,
          userId: a.userId,
        });
      }
      // Tambah event opened/closed
      events.push({
        timestamp: col.openedAt,
        type: "collection_opened",
        source: "collection",
        collectionId: col.id,
        amount: col.openedAmount,
        dueDate: col.openedDueDate,
        billingStatus: col.openedBillingStatus,
      });
      if (col.closedAt) {
        events.push({
          timestamp: col.closedAt,
          type: "collection_closed",
          source: "collection",
          collectionId: col.id,
          stage: col.stage,
          closeReason: col.closeReason,
          lastPaymentDate: col.closedLastPaymentDate,
        });
      }
    }

    // Juga include snapshot current customer state (latest payment, due, isolir dates)
    const current = {
      lastPaymentDate: (customer as any).lastPaymentDate,
      dueDate: (customer as any).dueDate,
      isolirDate: (customer as any).isolirDate,
      billingPrice: customer.billingPrice,
      billingStatus: customer.billingStatus,
      isIsolir: customer.isIsolir === 1,
    };

    // Sort events DESC by timestamp
    events.sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""));

    sendSuccess(res, {
      customer: {
        id: customer.id,
        customerId: customer.customerId,
        name: customer.name,
      },
      current,
      collectionCount: collections.length,
      events,
    });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- Akses collection ter-scope divisi (SOP delegasi churn→reaktivasi) ---------
// User penuh (izin 'collections') melihat semua. User divisi CS/Marketing melihat
// HANYA kartu di stage milik divisinya lewat ?division=. Izin fallback tanpa key baru:
// cs → 'customers', marketing → 'leads' (divisi tsb sudah memiliki izin itu).
const COLLECTION_DIVISION_PERM: Record<string, string> = { cs: "customers", marketing: "leads" };
function collectionScopedDivision(req: Request): string | undefined {
  const d = String(req.query.division ?? "").toLowerCase().trim();
  return COLLECTION_DIVISION_PERM[d] ? d : undefined;
}
function collectionAccessOK(req: Request, division: string | undefined, write: boolean): boolean {
  const full = write ? hasWritePermission(req, "collections") : hasPermission(req, "collections");
  if (full) return true;
  const p = division ? COLLECTION_DIVISION_PERM[division] : undefined;
  if (!p) return false;
  return write ? hasWritePermission(req, p) : hasPermission(req, p);
}
/** Untuk write ter-scope: user tanpa izin 'collections' penuh hanya boleh menyentuh kartu
 *  yang stage-nya milik divisinya. Return true kalau boleh lanjut. */
async function collectionScopedOwnershipOK(req: Request, res: Response, colId: number, division: string | undefined): Promise<boolean> {
  if (hasWritePermission(req, "collections")) return true; // akses penuh - tanpa batas divisi
  const col = await storage.getCollection(colId);
  if (!col) { sendError(res, "Collection tidak ditemukan", 404); return false; }
  const stages = await storage.getCollectionStages();
  const owner = String((stages.find((s) => s.key === col.stage) as any)?.ownerDivision ?? "").toLowerCase();
  if (!division || owner !== division) { sendError(res, "Kartu ini bukan delegasi divisi Anda", 403); return false; }
  return true;
}

router.get("/api/collections", async (req: Request, res: Response) => {
  const division = collectionScopedDivision(req);
  if (!collectionAccessOK(req, division, false)) return sendError(res, "Akses ditolak", 403);
  try {
    const stage = req.query.stage as string | undefined;
    const assignedToMe = req.query.assignedToMe === "true";
    const openOnly = req.query.openOnly !== "false"; // default true
    const customerId = req.query.customerId ? Number(req.query.customerId) : undefined;
    const list = await storage.getCollections({
      stage,
      openOnly,
      customerId,
      ownerDivision: division,
      assignedTo: assignedToMe ? req.authUser!.id : undefined,
    });
    // Batch-load assignees (anti N+1)
    const assigneesMap = await storage.getAssigneesByCollectionIds(list.map((c) => c.id));
    const enriched = list.map((c) => ({ ...c, assignees: assigneesMap.get(c.id) ?? [] }));
    // Filter additionally by assignedToMe: include kalau user ada di assignees (legacy assigned_to OR multi-assignee)
    const filtered = assignedToMe
      ? enriched.filter((c) => c.assignedTo === req.authUser!.id || c.assignees.some((a) => a.userId === req.authUser!.id))
      : enriched;
    sendSuccess(res, filtered);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/collections/stats", async (req: Request, res: Response) => {
  const division = collectionScopedDivision(req);
  if (!collectionAccessOK(req, division, false)) return sendError(res, "Akses ditolak", 403);
  try {
    sendSuccess(res, await storage.getCollectionStats());
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- Collection pipeline stages (custom per-mitra) -----------------------------
// NB: harus terdaftar SEBELUM "/api/collections/:id" supaya tidak ke-match sebagai :id.
router.get("/api/collections/stages", async (req: Request, res: Response) => {
  const division = collectionScopedDivision(req);
  if (!collectionAccessOK(req, division, false)) return sendError(res, "Akses ditolak", 403);
  try {
    sendSuccess(res, await storage.getCollectionStages());
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/collections/stages", async (req: Request, res: Response) => {
  if (!requireWritePermission(req, res, "collections")) return;
  try {
    const { label, color, role } = req.body ?? {};
    if (!label || typeof label !== "string" || !label.trim()) return sendError(res, "Judul stage wajib diisi");
    const row = await storage.createCollectionStage({ label: label.trim(), color, role });
    // Set SOP fields bila dikirim (opsional saat create).
    if (req.body?.ownerDivision !== undefined || req.body?.slaDays !== undefined || req.body?.nextStageKey !== undefined) {
      await storage.updateCollectionStage(row.id, {
        ownerDivision: req.body.ownerDivision, slaDays: req.body.slaDays, nextStageKey: req.body.nextStageKey,
      });
    }
    await logAudit(req, "CREATE", "collection_stage", row.id, row.label, { key: row.key, role: row.role });
    sendSuccess(res, row);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.patch("/api/collections/stages/reorder", async (req: Request, res: Response) => {
  if (!requireWritePermission(req, res, "collections")) return;
  try {
    const ids = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds.map((x: any) => Number(x)).filter((x: number) => Number.isFinite(x)) : [];
    if (ids.length === 0) return sendError(res, "orderedIds wajib");
    sendSuccess(res, await storage.reorderCollectionStages(ids));
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.patch("/api/collections/stages/:id", async (req: Request, res: Response) => {
  if (!requireWritePermission(req, res, "collections")) return;
  try {
    const { label, color, role, ownerDivision, slaDays, nextStageKey } = req.body ?? {};
    const row = await storage.updateCollectionStage(Number(req.params.id), { label, color, role, ownerDivision, slaDays, nextStageKey });
    await logAudit(req, "UPDATE", "collection_stage", row.id, row.label, { color: row.color, role: row.role, ownerDivision: row.ownerDivision, slaDays: row.slaDays, nextStageKey: row.nextStageKey });
    sendSuccess(res, row);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.delete("/api/collections/stages/:id", async (req: Request, res: Response) => {
  if (!requireWritePermission(req, res, "collections")) return;
  try {
    const mode = req.body?.mode === "purge" ? "purge" : "migrate";
    const targetKey = req.body?.targetKey;
    const result = await storage.deleteCollectionStage(Number(req.params.id), { mode, targetKey });
    await logAudit(req, "DELETE", "collection_stage", Number(req.params.id), `mode=${mode}`, result);
    sendSuccess(res, result);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/collections/:id", async (req: Request, res: Response) => {
  const division = collectionScopedDivision(req);
  if (!collectionAccessOK(req, division, false)) return sendError(res, "Akses ditolak", 403);
  try {
    const col = await storage.getCollection(Number(req.params.id));
    if (!col) return sendError(res, "Collection tidak ditemukan", 404);
    const [activities, assignees] = await Promise.all([
      storage.getCollectionActivities(col.id),
      storage.getCollectionAssignees(col.id),
    ]);
    sendSuccess(res, { ...col, activities, assignees });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.patch("/api/collections/:id/stage", async (req: Request, res: Response) => {
  const division = collectionScopedDivision(req);
  if (!collectionAccessOK(req, division, true)) return sendError(res, "Akses ditolak", 403);
  if (!(await collectionScopedOwnershipOK(req, res, Number(req.params.id), division))) return;
  try {
    const { stage, issueType, promiseDate, closeReason, notes } = req.body;
    // Validasi terhadap stage pipeline milik mitra (dinamis, custom per-mitra).
    const stages = await storage.getCollectionStages();
    const stageRow = stages.find((s) => s.key === stage);
    if (!stageRow) return sendError(res, "Stage tidak valid");
    const extra: any = {};
    if (promiseDate) extra.promiseDate = promiseDate;  // optional pada any stage (legacy compat)
    if (issueType) extra.issueType = issueType;        // opsional - tidak lagi diwajibkan
    if (stageRow.role === "paid" || stageRow.role === "writeoff") {
      extra.closeReason = closeReason ?? `manual_${stage}`;
    }
    if (notes) extra.notes = notes;
    const row = await storage.moveCollectionStage(
      Number(req.params.id),
      stage,
      req.authUser!.id,
      extra
    );
    await logAudit(req, "UPDATE", "collection", row.id, `customer#${row.customerId}`, { stage, ...extra });
    sendSuccess(res, row);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** PUT /api/collections/:id/assignees - replace assignee set (multi-user).
 *  Body: { userIds: number[] }. Empty array = clear all assignees. */
router.put("/api/collections/:id/assignees", async (req: Request, res: Response) => {
  const division = collectionScopedDivision(req);
  if (!collectionAccessOK(req, division, true)) return sendError(res, "Akses ditolak", 403);
  if (!(await collectionScopedOwnershipOK(req, res, Number(req.params.id), division))) return;
  try {
    const collectionId = Number(req.params.id);
    const userIds = Array.isArray(req.body?.userIds) ? req.body.userIds.map((x: any) => Number(x)).filter((x: number) => Number.isFinite(x) && x > 0) : [];
    const before = await storage.getCollectionAssignees(collectionId);
    const beforeSet = new Set(before.map((a) => a.userId));
    const assignees = await storage.setCollectionAssignees(collectionId, userIds, req.authUser!.id);
    // Notify users yang BARU di-assign (bukan yang sudah ada sebelumnya)
    const col = await storage.getCollection(collectionId);
    for (const a of assignees) {
      if (beforeSet.has(a.userId)) continue;
      if (a.userId === req.authUser!.id) continue;
      try {
        await storage.createNotification({
          userId: a.userId,
          type: "collection_assigned",
          title: "Collection case ditugaskan untuk Anda",
          message: `Case #${collectionId} - outstanding Rp ${(col?.openedAmount ?? 0).toLocaleString("id-ID")}`,
          link: `/collections`,
          entityType: "collection", entityId: collectionId,
          fromUserId: req.authUser!.id,
        });
      } catch (e: any) { console.warn("[notif] collection_assigned failed:", e.message); }
    }
    await logAudit(req, "UPDATE", "collection", collectionId, undefined, { assigneeIds: userIds });
    sendSuccess(res, { collectionId, assignees });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** PATCH /api/collections/:id/assign - legacy single-assignee endpoint (backwards compat).
 *  assignedTo=null clears all assignees; assignedTo=N replaces full set dengan [N]. */
router.patch("/api/collections/:id/assign", async (req: Request, res: Response) => {
  if (!requireWritePermission(req, res, "collections")) return;
  try {
    const collectionId = Number(req.params.id);
    const { assignedTo } = req.body;
    const userIds = assignedTo ? [Number(assignedTo)] : [];
    const before = await storage.getCollectionAssignees(collectionId);
    const beforeSet = new Set(before.map((a) => a.userId));
    const assignees = await storage.setCollectionAssignees(collectionId, userIds, req.authUser!.id);
    if (assignedTo && Number(assignedTo) !== req.authUser!.id && !beforeSet.has(Number(assignedTo))) {
      try {
        const col = await storage.getCollection(collectionId);
        await storage.createNotification({
          userId: Number(assignedTo),
          type: "collection_assigned",
          title: "Collection case ditugaskan untuk Anda",
          message: `Case #${collectionId} - outstanding Rp ${(col?.openedAmount ?? 0).toLocaleString("id-ID")}`,
          link: `/collections`,
          entityType: "collection", entityId: collectionId,
          fromUserId: req.authUser!.id,
        });
      } catch (e: any) { console.warn("[notif] collection_assigned failed:", e.message); }
    }
    await logAudit(req, "UPDATE", "collection", collectionId, undefined, { assignedTo });
    const row = await storage.getCollection(collectionId);
    sendSuccess(res, { ...row, assignees });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/collections/:id/activity", async (req: Request, res: Response) => {
  const division = collectionScopedDivision(req);
  if (!collectionAccessOK(req, division, true)) return sendError(res, "Akses ditolak", 403);
  if (!(await collectionScopedOwnershipOK(req, res, Number(req.params.id), division))) return;
  try {
    const { type, content, photoData } = req.body;
    if (!type) return sendError(res, "Type activity wajib diisi");
    const act = await storage.createCollectionActivity({
      collectionId: Number(req.params.id),
      userId: req.authUser!.id,
      type,
      content: content ?? null,
      photoData: photoData ?? null,
      createdAt: new Date().toISOString(),
    } as any);
    sendSuccess(res, act, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.delete("/api/collections/:id", async (req: Request, res: Response) => {
  if (!requireWritePermission(req, res, "collections")) return;
  if (!req.authUser!.isSystemAdmin) return sendError(res, "Hanya admin yang boleh hapus collection", 403);
  try {
    await storage.deleteCollection(Number(req.params.id));
    await logAudit(req, "DELETE", "collection", Number(req.params.id));
    sendSuccess(res, { deleted: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/billing/config", async (req: Request, res: Response) => {
  try {
    const allCustomers = await storage.getCustomers();
    const withSync = allCustomers.filter((c: any) => c.lastSyncAt).sort((a: any, b: any) => b.lastSyncAt.localeCompare(a.lastSyncAt));
    const lastSyncAt = withSync.length > 0 ? (withSync[0] as any).lastSyncAt : null;
    sendSuccess(res, { lastSyncAt });
  } catch (e: any) {
    sendError(res, e.message, 500);
  }
});

// ==================== PROSPECT FINDER ====================

// Google Maps API key resolved per-request from active mitra's mitra_integrations.
// Set via /integrations UI (key: google_maps_api_key). No source-code fallback.
const APP_URL = process.env.APP_URL || "https://workspace.jabnet.id";

const CATEGORY_TYPES: Record<string, string[]> = {
  korporat:   ["accounting", "insurance_agency", "lawyer", "real_estate_agency", "travel_agency"],
  pendidikan: ["school", "university", "primary_school", "secondary_school"],
  kesehatan:  ["hospital", "doctor", "pharmacy", "dentist", "physiotherapist"],
  komersial:  ["shopping_mall", "supermarket", "store", "lodging", "restaurant", "cafe"],
  pemerintah: ["local_government_office", "police", "post_office", "courthouse", "embassy"],
};

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function inferCategory(types: string[]): string {
  for (const [cat, catTypes] of Object.entries(CATEGORY_TYPES)) {
    if (catTypes.some(t => types.includes(t))) return cat;
  }
  return "lainnya";
}

router.post("/api/prospects/nearby", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const { lat, lng, radius = 500, categories = Object.keys(CATEGORY_TYPES) } = req.body;
    if (!lat || !lng) return sendError(res, "lat dan lng wajib diisi");

    const includedTypes = (categories as string[]).flatMap(c => CATEGORY_TYPES[c] ?? []);
    if (includedTypes.length === 0) return sendError(res, "Tidak ada kategori yang dipilih");

    const apiKey = (await storage.getMitraSetting("google_maps_api_key")) || "";
    if (!apiKey) return sendError(res, "Google Maps API key belum di-set untuk mitra ini. Atur di /integrations.", 503);

    const body = {
      includedTypes,
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: { latitude: Number(lat), longitude: Number(lng) },
          radius: Number(radius),
        },
      },
    };

    const response = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.types,places.location",
        "Referer": APP_URL,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      return sendError(res, `Google Places API error: ${errText}`, 502);
    }

    const data = await response.json() as any;
    const places = (data.places ?? []).map((p: any) => ({
      placeId: p.id,
      name: p.displayName?.text ?? "-",
      address: p.formattedAddress ?? "-",
      types: p.types ?? [],
      category: inferCategory(p.types ?? []),
      lat: p.location?.latitude,
      lng: p.location?.longitude,
      distance: Math.round(haversineDistance(Number(lat), Number(lng), p.location?.latitude, p.location?.longitude)),
    }));

    places.sort((a: any, b: any) => a.distance - b.distance);
    sendSuccess(res, { places, refLat: lat, refLng: lng, radius });
  } catch (e: any) {
    sendError(res, e.message, 500);
  }
});

router.get("/api/prospects/details/:placeId", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const { placeId } = req.params;
    const apiKey = (await storage.getMitraSetting("google_maps_api_key")) || "";
    if (!apiKey) return sendError(res, "Google Maps API key belum di-set untuk mitra ini. Atur di /integrations.", 503);
    const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "nationalPhoneNumber,internationalPhoneNumber,websiteUri",
        "Referer": APP_URL,
      },
    });
    if (!response.ok) {
      const errText = await response.text();
      return sendError(res, `Google Places API error: ${errText}`, 502);
    }
    const data = await response.json() as any;
    sendSuccess(res, {
      phone: data.nationalPhoneNumber ?? data.internationalPhoneNumber ?? null,
      website: data.websiteUri ?? null,
    });
  } catch (e: any) {
    sendError(res, e.message, 500);
  }
});

// Prospect Finder via metode PENCARIAN (text search) - scrape nomor sekaligus.
// Google Places "searchText" bisa balikin nomor telepon langsung di field mask,
// jadi 1 request langsung dapat daftar prospek + nomornya (tanpa N call detail).
// Body: { query, lat?, lng?, radius? } - lat/lng opsional untuk bias lokasi + hitung jarak.
router.post("/api/prospects/search", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const { query, lat, lng, radius = 5000 } = req.body ?? {};
    if (!query || typeof query !== "string" || !query.trim()) return sendError(res, "Kata kunci pencarian wajib diisi");

    const apiKey = (await storage.getMitraSetting("google_maps_api_key")) || "";
    if (!apiKey) return sendError(res, "Google Maps API key belum di-set untuk mitra ini. Atur di /integrations.", 503);

    const hasBias = lat != null && lng != null && !isNaN(Number(lat)) && !isNaN(Number(lng));
    const body: any = {
      textQuery: query.trim(),
      maxResultCount: 20,
      languageCode: "id",
      regionCode: "ID",
    };
    // Bias hasil ke sekitar titik referensi (kalau ada) supaya prospek relevan dengan area jaringan.
    if (hasBias) {
      body.locationBias = {
        circle: {
          center: { latitude: Number(lat), longitude: Number(lng) },
          radius: Math.min(Math.max(Number(radius) || 5000, 1), 50000),
        },
      };
    }

    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        // Field mask termasuk nomor telepon + website = scraping nomor sekaligus.
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.types,places.location,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri",
        "Referer": APP_URL,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      return sendError(res, `Google Places API error: ${errText}`, 502);
    }

    const data = await response.json() as any;
    const places = (data.places ?? []).map((p: any) => ({
      placeId: p.id,
      name: p.displayName?.text ?? "-",
      address: p.formattedAddress ?? "-",
      types: p.types ?? [],
      category: inferCategory(p.types ?? []),
      lat: p.location?.latitude,
      lng: p.location?.longitude,
      distance: hasBias && p.location
        ? Math.round(haversineDistance(Number(lat), Number(lng), p.location.latitude, p.location.longitude))
        : null,
      // Nomor + website sudah ter-scrape langsung dari hasil pencarian.
      phone: p.nationalPhoneNumber ?? p.internationalPhoneNumber ?? null,
      website: p.websiteUri ?? null,
    }));

    if (hasBias) places.sort((a: any, b: any) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    sendSuccess(res, { places, query: query.trim(), refLat: hasBias ? lat : null, refLng: hasBias ? lng : null });
  } catch (e: any) {
    sendError(res, e.message, 500);
  }
});

// ==================== MARKETING CRM ====================

const MARKETING_ROLES = ["admin", "marketing", "marketing_spv"];

function requireMarketing(req: Request, res: Response): boolean {
  if (!req.authUser) { sendError(res, "Unauthorized", 401); return false; }
  if (!MARKETING_ROLES.includes(req.authUser.role)) { sendError(res, "Akses ditolak", 403); return false; }
  return true;
}

// -- Marketing Dashboard --------------------------------------------------

router.get("/api/marketing/dashboard", async (req: Request, res: Response) => {
  if (!requireMarketing(req, res)) return;
  try {
    const role = req.authUser!.role;
    const userId = req.authUser!.id;
    let allLeads = await storage.getLeads({});
    // marketing: only own leads
    if (role === "marketing") {
      allLeads = allLeads.filter(l => l.createdBy === userId || l.assignedTo === userId);
    }
    const now = new Date();
    const thisMonth = now.toISOString().slice(0, 7); // "2026-04"
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(now.getDate() - now.getDay());
    const weekStr = thisWeekStart.toISOString().slice(0, 10);

    const totalLeads = allLeads.length;
    const byStage: Record<string, number> = {};
    for (const s of LEAD_STAGES) byStage[s] = allLeads.filter(l => l.stage === s).length;

    const thisMonthLeads = allLeads.filter(l => l.createdAt?.startsWith(thisMonth));
    const lastMonthLeads = allLeads.filter(l => l.createdAt?.startsWith(lastMonth));
    const thisWeekLeads = allLeads.filter(l => l.createdAt && l.createdAt >= weekStr);

    const wonLeads = allLeads.filter(l => l.stage === "won");
    const lostLeads = allLeads.filter(l => l.stage === "lost");
    const activeLeads = allLeads.filter(l => !["won", "lost"].includes(l.stage ?? ""));
    const conversionRate = totalLeads > 0 ? Math.round((wonLeads.length / totalLeads) * 100) : 0;

    // Pipeline by stage for funnel
    const pipeline = LEAD_STAGES.map(s => ({
      stage: s,
      label: LEAD_STAGE_LABELS[s as keyof typeof LEAD_STAGE_LABELS] ?? s,
      count: byStage[s] ?? 0,
    }));

    // Recent activities (last 20) - batched: 1 query for all 50 leads instead of 50 sequential queries
    const top50Leads = allLeads.slice(0, 50);
    const activitiesByLead = await storage.getLeadActivitiesForLeads(top50Leads.map(l => l.id));
    const recentActivities: any[] = [];
    for (const lead of top50Leads) {
      const acts = activitiesByLead.get(lead.id) ?? [];
      for (const a of acts.slice(0, 5)) {
        recentActivities.push({ ...a, leadName: lead.name, leadCategory: lead.category });
      }
    }
    recentActivities.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

    // Category breakdown
    const byCategory: Record<string, number> = {};
    for (const l of allLeads) {
      const cat = l.category ?? "lainnya";
      byCategory[cat] = (byCategory[cat] ?? 0) + 1;
    }

    // Source breakdown
    const bySource: Record<string, number> = {};
    for (const l of allLeads) {
      bySource[l.source] = (bySource[l.source] ?? 0) + 1;
    }

    // Canvassing sessions
    const sessions = role === "marketing"
      ? await storage.getCanvassingSessions(userId)
      : await storage.getCanvassingSessions();
    const activeSessions = sessions.filter(s => s.status === "active");
    const totalSessions = sessions.length;

    // Team performance (spv/admin only)
    let teamPerformance: any[] = [];
    if (role !== "marketing") {
      const allUsers = await storage.getAllUsers();
      // Tenant isolation: leaderboard hanya user anggota mitra aktif (jangan tampilkan user mitra lain/JABNET).
      const mitraUserIds = await storage.getUserIdsInMitra(req.authUser!.activeMitraId);
      const mktUsers = allUsers.filter(u => MARKETING_ROLES.includes(u.role ?? "") && mitraUserIds.has(u.id));
      const allLeadsAll = await storage.getLeads({});
      for (const u of mktUsers) {
        const userLeads = allLeadsAll.filter(l => l.createdBy === u.id || l.assignedTo === u.id);
        const userWon = userLeads.filter(l => l.stage === "won").length;
        teamPerformance.push({
          id: u.id, name: u.name, role: u.role,
          totalLeads: userLeads.length,
          wonLeads: userWon,
          activeLeads: userLeads.filter(l => !["won", "lost"].includes(l.stage ?? "")).length,
          conversionRate: userLeads.length > 0 ? Math.round((userWon / userLeads.length) * 100) : 0,
        });
      }
      teamPerformance.sort((a, b) => b.totalLeads - a.totalLeads);
    }

    // Field report summary
    const allLogs = role === "marketing"
      ? await storage.getCanvassingLogsByUser(userId)
      : await storage.getCanvassingLogs();
    const fieldReportCount = allLogs.length;
    const logsByType: Record<string, number> = {};
    const logsBySeverity: Record<string, number> = {};
    for (const log of allLogs) {
      logsByType[log.type] = (logsByType[log.type] ?? 0) + 1;
      logsBySeverity[log.severity ?? "info"] = (logsBySeverity[log.severity ?? "info"] ?? 0) + 1;
    }

    // Field logs enrichment - batched: 1 query for all ODP refs instead of N sequential
    const topLogs = allLogs.slice(0, 5);
    const logOdpIds = Array.from(new Set(topLogs.map(l => l.odpId).filter((id): id is number => id != null)));
    const odpsByIdMap = await storage.getOdpsByIds(logOdpIds);
    const recentFieldLogs = topLogs.map((l) => {
      let distanceMeters: number | null = null;
      let odpName: string | null = null;
      if (l.odpId) {
        const odp = odpsByIdMap.get(l.odpId);
        if (odp) {
          odpName = odp.name;
          if (l.lat != null && l.lng != null && odp.lat != null && odp.lng != null) {
            distanceMeters = Math.round(haversineDistance(l.lat, l.lng, odp.lat, odp.lng));
          }
        }
      }
      return { ...l, distanceMeters, odpName };
    });

    sendSuccess(res, {
      totalLeads, activeLeads: activeLeads.length, wonLeads: wonLeads.length, lostLeads: lostLeads.length,
      conversionRate,
      thisMonthLeads: thisMonthLeads.length, lastMonthLeads: lastMonthLeads.length, thisWeekLeads: thisWeekLeads.length,
      growth: lastMonthLeads.length > 0 ? Math.round(((thisMonthLeads.length - lastMonthLeads.length) / lastMonthLeads.length) * 100) : (thisMonthLeads.length > 0 ? 100 : 0),
      pipeline, byCategory, bySource,
      activeSessions: activeSessions.length, totalSessions,
      recentActivities: recentActivities.slice(0, 15),
      teamPerformance,
      fieldReportCount, logsByType, logsBySeverity,
      recentFieldLogs,
    });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- Marketing Contacts --------------------------------------------------

router.get("/api/marketing/contacts", async (req: Request, res: Response) => {
  if (!requireMarketing(req, res)) return;
  try {
    const role = req.authUser!.role;
    const userId = req.authUser!.id;
    let allLeads = await storage.getLeads({});
    if (role === "marketing") {
      allLeads = allLeads.filter(l => l.createdBy === userId || l.assignedTo === userId);
    }

    // Resolve ODP names for leads that have odpId
    const odpIds = [...new Set(allLeads.filter(l => l.odpId).map(l => l.odpId!))];
    const odpMap: Record<number, string> = {};
    for (const odpId of odpIds) {
      const odp = await storage.getOdp(odpId);
      if (odp) odpMap[odpId] = odp.name;
    }

    const contacts = allLeads.map(l => ({
      ...maskLead(l, role, userId),
      odpName: l.odpId ? (odpMap[l.odpId] ?? null) : null,
    }));
    sendSuccess(res, contacts);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- Canvassing Sessions --------------------------------------------------

router.get("/api/marketing/canvassing/sessions", async (req: Request, res: Response) => {
  if (!requireMarketing(req, res)) return;
  try {
    const role = req.authUser!.role;
    const userId = (role === "admin" || role === "marketing_spv") ? undefined : req.authUser!.id;
    sendSuccess(res, await storage.getCanvassingSessions(userId));
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/marketing/canvassing/active", async (req: Request, res: Response) => {
  if (!requireMarketing(req, res)) return;
  try {
    const session = await storage.getActiveCanvassingSession(req.authUser!.id);
    sendSuccess(res, session ?? null);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/marketing/canvassing/start", async (req: Request, res: Response) => {
  if (!requireMarketing(req, res)) return;
  try {
    const existing = await storage.getActiveCanvassingSession(req.authUser!.id);
    if (existing) return sendSuccess(res, existing); // already active
    const { name, areaDescription, centerLat, centerLng } = req.body;
    const session = await storage.createCanvassingSession({
      userId: req.authUser!.id,
      name: name || `Canvassing ${new Date().toLocaleDateString("id-ID")}`,
      areaDescription, centerLat, centerLng,
      startedAt: new Date().toISOString(),
      status: "active",
    });
    sendSuccess(res, session);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/marketing/canvassing/end/:id", async (req: Request, res: Response) => {
  if (!requireMarketing(req, res)) return;
  try {
    const id = Number(req.params.id);
    const role = req.authUser!.role;
    const userId = req.authUser!.id;
    // Verify session exists and user owns it (or is admin/spv)
    const allSessions = await storage.getCanvassingSessions();
    const target = allSessions.find(s => s.id === id);
    if (!target) return sendError(res, "Sesi tidak ditemukan", 404);
    if (role === "marketing" && target.userId !== userId) {
      return sendError(res, "Tidak bisa mengakhiri sesi user lain", 403);
    }
    const session = await storage.endCanvassingSession(id);
    sendSuccess(res, session);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// Semua sesi canvassing yang sedang aktif (untuk visualisasi peta tim)
router.get("/api/marketing/canvassing/active-all", async (req: Request, res: Response) => {
  if (!requireMarketing(req, res)) return;
  try {
    const allSessions = await storage.getCanvassingSessions();
    const active = allSessions.filter(s => s.status === "active");
    // Attach user names
    const allUsers = await storage.getAllUsers();
    const withUser = active.map(s => {
      const u = allUsers.find(u => u.id === s.userId);
      return { ...s, userName: u?.name ?? "Unknown", userInitial: (u?.name ?? "?").charAt(0).toUpperCase() };
    });
    sendSuccess(res, withUser);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- Canvassing Logs (Field Reports / BI) --

router.get("/api/marketing/canvassing/logs", async (req: Request, res: Response) => {
  if (!requireMarketing(req, res)) return;
  try {
    const { sessionId } = req.query as Record<string, string>;
    const role = req.authUser!.role;
    const userId = req.authUser!.id;
    let logs;
    if (sessionId) {
      logs = await storage.getCanvassingLogs(Number(sessionId));
    } else if (role === "marketing") {
      logs = await storage.getCanvassingLogsByUser(userId);
    } else {
      logs = await storage.getCanvassingLogs();
    }
    sendSuccess(res, logs);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/**
 * GET /api/marketing/canvassing/reports
 * Enriched list untuk dashboard Laporan Lapangan.
 * Filter: userId, type, severity, hasPhoto, sinceDays, search.
 * Non-admin/supervisor hanya lihat laporan sendiri (auto-filter by userId).
 */
router.get("/api/marketing/canvassing/reports", async (req: Request, res: Response) => {
  if (!requireMarketing(req, res)) return;
  try {
    const isSupervisor = req.authUser!.role === "admin" || req.authUser!.role === "marketing_spv";
    const q = req.query;
    const userIdFilter = isSupervisor
      ? (q.userId ? Number(q.userId) : undefined)
      : req.authUser!.id; // Non-supervisor dipaksa filter ke diri sendiri
    const sinceDays = q.sinceDays ? Number(q.sinceDays) : 30;
    const since = new Date(Date.now() - sinceDays * 86400_000).toISOString();
    const reports = await storage.getCanvassingReportsEnriched({
      limit: q.limit ? Number(q.limit) : 200,
      offset: q.offset ? Number(q.offset) : 0,
      userId: userIdFilter,
      type: q.type ? String(q.type) : undefined,
      severity: q.severity ? String(q.severity) : undefined,
      hasPhoto: q.hasPhoto === "true" ? true : q.hasPhoto === "false" ? false : undefined,
      since,
      search: q.search ? String(q.search).trim() : undefined,
    });
    sendSuccess(res, reports);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** GET /api/marketing/canvassing/reports/export - download CSV dengan filter yang sama */
router.get("/api/marketing/canvassing/reports/export", async (req: Request, res: Response) => {
  if (!requireMarketing(req, res)) return;
  try {
    const isSupervisor = req.authUser!.role === "admin" || req.authUser!.role === "marketing_spv";
    const q = req.query;
    const userIdFilter = isSupervisor
      ? (q.userId ? Number(q.userId) : undefined)
      : req.authUser!.id;
    const sinceDays = q.sinceDays ? Number(q.sinceDays) : 30;
    const since = new Date(Date.now() - sinceDays * 86400_000).toISOString();
    // Fetch all matching (limit tinggi supaya export lengkap)
    const reports = await storage.getCanvassingReportsEnriched({
      limit: 10_000,
      userId: userIdFilter,
      type: q.type ? String(q.type) : undefined,
      severity: q.severity ? String(q.severity) : undefined,
      hasPhoto: q.hasPhoto === "true" ? true : q.hasPhoto === "false" ? false : undefined,
      since,
      search: q.search ? String(q.search).trim() : undefined,
    });

    // Mapping label Indonesia untuk type & severity supaya CSV rapih
    const TYPE_LABELS: Record<string, string> = {
      area_sepi: "Area Sepi", area_ramai: "Area Ramai", kendala: "Kendala",
      prospek_besar: "Prospek Besar", kompetitor: "Kompetitor",
      laporan_umum: "Laporan Umum", infrastruktur: "Infrastruktur",
    };
    const SEV_LABELS: Record<string, string> = { info: "Info", warning: "Warning", critical: "Kritis" };

    const rows = reports.map((r: any) => ({
      id: r.id,
      tanggal: r.createdAt ? new Date(r.createdAt).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" }) : "",
      pelapor: r.userName,
      username: r.userUsername,
      jenis: TYPE_LABELS[r.type] ?? r.type,
      severity: SEV_LABELS[r.severity] ?? r.severity,
      judul: r.title,
      deskripsi: r.description ?? "",
      latitude: r.lat ?? "",
      longitude: r.lng ?? "",
      odp: r.odpName ?? "",
      odp_code: r.odpCode ?? "",
      has_photo: r.hasPhoto ? "Ya" : "Tidak",
      google_maps: r.lat && r.lng ? `https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}` : "",
    }));

    const csv = toCSV(rows, [
      { key: "id", label: "ID" },
      { key: "tanggal", label: "Tanggal" },
      { key: "pelapor", label: "Pelapor" },
      { key: "username", label: "Username" },
      { key: "jenis", label: "Jenis Laporan" },
      { key: "severity", label: "Severity" },
      { key: "judul", label: "Judul" },
      { key: "deskripsi", label: "Deskripsi" },
      { key: "latitude", label: "Latitude" },
      { key: "longitude", label: "Longitude" },
      { key: "odp", label: "ODP Terdekat" },
      { key: "odp_code", label: "Kode ODP" },
      { key: "has_photo", label: "Ada Foto" },
      { key: "google_maps", label: "Link Maps" },
    ]);

    await logAudit(req, "EXPORT", "canvassing_logs", undefined, `${reports.length} reports`, {
      sinceDays, filters: { type: q.type, severity: q.severity, hasPhoto: q.hasPhoto, userId: userIdFilter, search: q.search },
    });

    const ts = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=laporan-lapangan-${ts}.csv`);
    // UTF-8 BOM supaya Excel baca karakter Indonesia dengan benar
    res.send("\uFEFF" + csv);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** GET /api/marketing/canvassing/reports/stats - aggregate untuk cards di dashboard */
router.get("/api/marketing/canvassing/reports/stats", async (req: Request, res: Response) => {
  if (!requireMarketing(req, res)) return;
  try {
    const isSupervisor = req.authUser!.role === "admin" || req.authUser!.role === "marketing_spv";
    const sinceDays = req.query.sinceDays ? Number(req.query.sinceDays) : 30;
    const stats = await storage.getCanvassingReportStats(sinceDays, isSupervisor ? undefined : req.authUser!.id);
    sendSuccess(res, stats);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/**
 * GET /api/marketing/canvassing/reports/:id/photo
 * Stream foto langsung (binary). Pakai filesystem (photo_path) kalau ada; fallback ke
 * legacy base64 (photo_data) dengan decode inline supaya foto pre-migration tetap muncul.
 */
router.get("/api/marketing/canvassing/reports/:id/photo", async (req: Request, res: Response) => {
  if (!requireMarketing(req, res)) return;
  try {
    const id = Number(req.params.id);
    const row = await storage.getCanvassingReportPhoto(id);
    if (!row) return sendError(res, "Laporan tidak ditemukan", 404);
    // Non-supervisor cuma boleh lihat foto sendiri
    const isSupervisor = req.authUser!.role === "admin" || req.authUser!.role === "marketing_spv";
    if (!isSupervisor && row.userId !== req.authUser!.id) {
      return sendError(res, "Akses ditolak", 403);
    }
    if (row.photoPath) {
      await streamPhoto(row.photoPath, res);
      return;
    }
    if (row.photoData) {
      // Legacy base64 fallback (pre-backfill)
      const m = /^data:(image\/[a-z0-9+.-]+);base64,(.+)$/i.exec(row.photoData);
      if (m) {
        const buf = Buffer.from(m[2], "base64");
        res.setHeader("Content-Type", m[1]);
        res.setHeader("Cache-Control", "private, max-age=300");
        res.send(buf);
        return;
      }
    }
    return sendError(res, "Foto tidak tersedia", 404);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/marketing/canvassing/logs", async (req: Request, res: Response) => {
  if (!requireMarketing(req, res)) return;
  try {
    const { sessionId, type, title, description, lat, lng, odpId, severity, photoData } = req.body;
    if (!sessionId) return sendError(res, "sessionId wajib diisi");
    if (!type) return sendError(res, "type wajib diisi");
    if (!title) return sendError(res, "title wajib diisi");
    // Guard: photo data URL max ~7MB (5MB file + base64 overhead)
    if (photoData && typeof photoData === "string" && photoData.length > 7_500_000) {
      return sendError(res, "Foto terlalu besar - max 5MB", 413);
    }
    const log = await storage.createCanvassingLog({
      sessionId: Number(sessionId),
      userId: req.authUser!.id,
      type, title, description: description || null,
      lat: lat != null ? Number(lat) : null,
      lng: lng != null ? Number(lng) : null,
      odpId: odpId != null ? Number(odpId) : null,
      severity: severity || "info",
      ...(photoData ? { photoData } : {}),
      createdAt: new Date().toISOString(),
    } as any);
    // Telegram push ke marketing SPV/admin (broadcast by role) - async, non-blocking
    if (severity === "warning" || severity === "critical" || type === "lead") {
      try {
        const { notifyRolesTelegram } = await import("./telegram.js");
        const authorName = req.authUser!.name || req.authUser!.username;
        notifyRolesTelegram(["admin", "marketing_spv"], "canvassing_report",
          ` *Canvassing: ${title}*\n\n_Oleh ${authorName}_\n${description ? description.substring(0, 200) : ""}\n\nType: ${type} · Severity: ${severity || "info"}`);
      } catch { /* ignore */ }
    }
    sendSuccess(res, log, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- Canvassing History (enriched sessions + KPI) --
router.get("/api/marketing/canvassing/history", async (req: Request, res: Response) => {
  if (!requireMarketing(req, res)) return;
  try {
    const role = req.authUser!.role;
    const userId = req.authUser!.id;
    const isAdmin = role === "admin" || role === "marketing_spv";

    // Date range filter (YYYY-MM-DD). Default: last 30 days so KPI tiles tidak
    // langsung 0 di awal bulan (sebelumnya hardcoded "bulan ini").
    const nowD = new Date();
    const toDefault = nowD.toISOString().slice(0, 10);
    const fromDefault = new Date(nowD.getTime() - 29 * 86400000).toISOString().slice(0, 10);
    const fromParam = typeof req.query.from === "string" ? req.query.from : "";
    const toParam = typeof req.query.to === "string" ? req.query.to : "";
    const rangeFrom = /^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? fromParam : fromDefault;
    const rangeTo = /^\d{4}-\d{2}-\d{2}$/.test(toParam) ? toParam : toDefault;
    const inDateRange = (dateStr: string | null | undefined): boolean => {
      if (!dateStr) return false;
      const d = dateStr.slice(0, 10);
      return d >= rangeFrom && d <= rangeTo;
    };

    const allSessions = await storage.getCanvassingSessions();
    const sessions = isAdmin ? allSessions : allSessions.filter(s => s.userId === userId);
    const allLeads = await storage.getLeads({});
    const allLogs = isAdmin ? await storage.getCanvassingLogs() : await storage.getCanvassingLogsByUser(userId);
    const allUsers = await storage.getAllUsers();
    const userMap = new Map(allUsers.map(u => [u.id, u.name]));

    // Resolve ODP names for area info
    const allOdpsData = await storage.getOdps();
    const odpNameMap = new Map(allOdpsData.map(o => [o.id, { name: o.name, district: o.district }]));

    // Group sessions by user + date for cleaner reporting
    const completedSessions = sessions
      .filter(s => s.status === "completed" || s.endedAt)
      .sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""));

    // Build per-session enriched data first
    const enrichedSessions = completedSessions.map(s => {
      const sessionLeads = allLeads.filter(l => (l as any).canvassingSessionId === s.id);
      const sessionLogs = allLogs.filter(l => l.sessionId === s.id);
      const startMs = s.startedAt ? new Date(s.startedAt).getTime() : 0;
      const endMs = s.endedAt ? new Date(s.endedAt).getTime() : Date.now();
      const durationMinutes = Math.round((endMs - startMs) / 60000);
      const closingCount = sessionLeads.filter(l => l.stage === "won").length;
      const criticalLogs = sessionLogs.filter(l => l.severity === "critical" || l.severity === "warning").length;

      // Collect areas visited (ODP districts from leads + logs)
      const areas = new Set<string>();
      for (const l of sessionLeads) { if (l.district) areas.add(l.district); else if (l.odpId) { const o = odpNameMap.get(l.odpId); if (o?.district) areas.add(o.district); } }
      for (const l of sessionLogs) { if (l.odpId) { const o = odpNameMap.get(l.odpId); if (o?.district) areas.add(o.district); } }
      if (s.areaDescription) areas.add(s.areaDescription);

      return {
        ...s,
        userName: userMap.get(s.userId) || `User #${s.userId}`,
        durationMinutes,
        leadCount: sessionLeads.length,
        closingCount,
        logCount: sessionLogs.length,
        criticalLogCount: criticalLogs,
        areas: [...areas],
        leads: sessionLeads.map(l => ({ id: l.id, name: l.name, stage: l.stage, category: l.category, district: l.district })),
        logs: sessionLogs.map(l => ({ id: l.id, type: l.type, title: l.title, severity: l.severity, createdAt: l.createdAt })),
      };
    });

    // Group by user + date for summary view
    const dailyMap = new Map<string, any>();
    for (const s of enrichedSessions) {
      const dateKey = s.startedAt ? s.startedAt.slice(0, 10) : "unknown";
      const key = `${s.userId}-${dateKey}`;
      if (!dailyMap.has(key)) {
        dailyMap.set(key, {
          userId: s.userId, userName: s.userName, date: dateKey,
          sessionCount: 0, totalDurationMinutes: 0,
          totalLeads: 0, totalClosing: 0, totalLogs: 0, totalCritical: 0,
          areas: new Set<string>(), sessions: [],
        });
      }
      const d = dailyMap.get(key)!;
      d.sessionCount++;
      d.totalDurationMinutes += s.durationMinutes;
      d.totalLeads += s.leadCount;
      d.totalClosing += s.closingCount;
      d.totalLogs += s.logCount;
      d.totalCritical += s.criticalLogCount;
      s.areas.forEach((a: string) => d.areas.add(a));
      d.sessions.push(s);
    }

    const enrichedAll = [...dailyMap.values()]
      .map(d => ({ ...d, areas: [...d.areas] }))
      .sort((a, b) => b.date.localeCompare(a.date));

    // Filter daily summaries ke rentang tanggal terpilih - semua KPI, leaderboard
    // dan daftar sesi yang dikembalikan mengacu ke rentang ini.
    const enriched = enrichedAll.filter(s => s.date >= rangeFrom && s.date <= rangeTo);

    // KPI (dihitung atas rentang terpilih)
    const totalLeads = enriched.reduce((s, e) => s + e.totalLeads, 0);
    const totalClosing = enriched.reduce((s, e) => s + e.totalClosing, 0);
    const totalDuration = enriched.reduce((s, e) => s + e.totalDurationMinutes, 0);

    // ODP Coverage: geo-based - ODP yang punya aktivitas canvassing dalam radius
    const CANVASS_RADIUS_M = 200; // Radius coverage canvassing per ODP (meter)
    const allOdps = await storage.getOdps();
    const totalOdps = allOdps.length;

    // Collect GPS points from canvassing activities (leads + logs) dalam rentang
    const canvassPoints: { lat: number; lng: number }[] = [];
    for (const l of allLogs) { if (l.lat && l.lng && inDateRange((l as any).createdAt)) canvassPoints.push({ lat: l.lat, lng: l.lng }); }
    for (const l of allLeads) {
      if (l.lat && l.lng && (l.source === "canvassing" || (l as any).canvassingSessionId) && inDateRange((l as any).createdAt)) {
        canvassPoints.push({ lat: l.lat, lng: l.lng });
      }
    }
    // Also include session center points (sesi dalam rentang)
    for (const s of sessions) {
      if (s.centerLat && s.centerLng && inDateRange(s.startedAt)) canvassPoints.push({ lat: s.centerLat, lng: s.centerLng });
    }

    // For each ODP: check if any canvass point is within radius
    const { haversineDistance: haverDist } = await import("./audience.js");
    const coveredOdpIds = new Set<number>();
    const uncoveredOdps: { id: number; name: string; district: string | null }[] = [];
    for (const odp of allOdps) {
      if (!odp.lat || !odp.lng) continue;
      let isCovered = false;
      for (const pt of canvassPoints) {
        const dist = haverDist(odp.lat, odp.lng, pt.lat, pt.lng);
        if (dist <= CANVASS_RADIUS_M) { isCovered = true; break; }
      }
      if (isCovered) coveredOdpIds.add(odp.id);
      else uncoveredOdps.push({ id: odp.id, name: odp.name, district: odp.district ?? null });
    }
    const uniqueOdpsCovered = coveredOdpIds;

    // Leaderboard
    const leaderboard: { userId: number; name: string; sessions: number; leads: number; closing: number; rate: number }[] = [];
    const userSessions = new Map<number, typeof enriched>();
    for (const s of enriched) {
      if (!userSessions.has(s.userId)) userSessions.set(s.userId, []);
      userSessions.get(s.userId)!.push(s);
    }
    for (const [uid, ss] of userSessions) {
      const leads = ss.reduce((t, s) => t + s.totalLeads, 0);
      const closing = ss.reduce((t, s) => t + s.totalClosing, 0);
      leaderboard.push({
        userId: uid, name: userMap.get(uid) || `User #${uid}`,
        sessions: ss.length, leads, closing,
        rate: leads > 0 ? Math.round((closing / leads) * 100) : 0,
      });
    }
    leaderboard.sort((a, b) => b.leads - a.leads);

    sendSuccess(res, {
      range: { from: rangeFrom, to: rangeTo },
      sessions: enriched,
      kpi: {
        sessionsThisMonth: enriched.length,
        leadsPerSession: enriched.length > 0 ? parseFloat((totalLeads / enriched.length).toFixed(1)) : 0,
        conversionRate: totalLeads > 0 ? Math.round((totalClosing / totalLeads) * 100) : 0,
        odpCovered: uniqueOdpsCovered.size,
        odpTotal: totalOdps,
        odpCoveragePercent: totalOdps > 0 ? Math.round((uniqueOdpsCovered.size / totalOdps) * 100) : 0,
        canvassRadiusM: CANVASS_RADIUS_M,
        uncoveredOdps: uncoveredOdps.slice(0, 20), // Top 20 ODP belum tercanvass
        totalDurationMinutes: totalDuration,
        totalLeads, totalClosing,
      },
      leaderboard,
    });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/marketing/field-reports/analytics", async (req: Request, res: Response) => {
  if (!requireMarketing(req, res)) return;
  try {
    const role = req.authUser!.role;
    const userId = req.authUser!.id;

    const allLogs = role === "marketing"
      ? await storage.getCanvassingLogsByUser(userId)
      : await storage.getCanvassingLogs();

    // Aggregate by type and severity
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    for (const log of allLogs) {
      byType[log.type] = (byType[log.type] ?? 0) + 1;
      bySeverity[log.severity ?? "info"] = (bySeverity[log.severity ?? "info"] ?? 0) + 1;
    }

    // Area insights grouped by ODP
    const odpGroups = new Map<number | null, typeof allLogs>();
    for (const log of allLogs) {
      const key = log.odpId ?? null;
      if (!odpGroups.has(key)) odpGroups.set(key, []);
      odpGroups.get(key)!.push(log);
    }

    // Resolve ODP names & coordinates for distance calculation
    const odpIds = [...new Set(allLogs.filter(l => l.odpId).map(l => l.odpId!))];
    const odpMap: Record<number, string> = {};
    const odpCoords: Record<number, { lat: number; lng: number }> = {};
    for (const odpId of odpIds) {
      const odp = await storage.getOdp(odpId);
      if (odp) {
        odpMap[odpId] = odp.name;
        if (odp.lat != null && odp.lng != null) {
          odpCoords[odpId] = { lat: odp.lat, lng: odp.lng };
        }
      }
    }

    // Compute distance from each log to its ODP
    function computeLogDistance(log: { lat: number | null; lng: number | null; odpId: number | null }): number | null {
      if (!log.odpId || log.lat == null || log.lng == null) return null;
      const odp = odpCoords[log.odpId];
      if (!odp) return null;
      return Math.round(haversineDistance(log.lat, log.lng, odp.lat, odp.lng));
    }

    const areaInsights: any[] = [];
    for (const [odpId, logs] of odpGroups) {
      const types: Record<string, number> = {};
      const severityCounts: Record<string, number> = {};
      for (const l of logs) {
        types[l.type] = (types[l.type] ?? 0) + 1;
        severityCounts[l.severity ?? "info"] = (severityCounts[l.severity ?? "info"] ?? 0) + 1;
      }
      // Compute average distance and min/max for this ODP area
      const distances = logs.map(l => computeLogDistance(l)).filter((d): d is number => d !== null);
      const avgDistance = distances.length > 0 ? Math.round(distances.reduce((a, b) => a + b, 0) / distances.length) : null;
      const minDistance = distances.length > 0 ? Math.min(...distances) : null;
      const maxDistance = distances.length > 0 ? Math.max(...distances) : null;

      areaInsights.push({
        odpId,
        odpName: odpId ? (odpMap[odpId] ?? `ODP #${odpId}`) : "Tanpa ODP",
        totalReports: logs.length,
        types,
        severityCounts,
        latestReport: logs[0]?.createdAt ?? null,
        dominantType: Object.entries(types).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
        avgDistanceMeters: avgDistance,
        minDistanceMeters: minDistance,
        maxDistanceMeters: maxDistance,
      });
    }
    areaInsights.sort((a, b) => b.totalReports - a.totalReports);

    // Generate recommendations
    const recommendations: any[] = [];
    for (const area of areaInsights) {
      const sepiCount = area.types["area_sepi"] ?? 0;
      const kompCount = area.types["kompetitor"] ?? 0;
      const potensiCount = area.types["potensi_tinggi"] ?? 0;
      const aksesCount = area.types["akses_sulit"] ?? 0;
      const infraCount = area.types["infrastruktur"] ?? 0;
      const criticalCount = area.severityCounts["critical"] ?? 0;
      const warningCount = area.severityCounts["warning"] ?? 0;

      const distInfo = area.avgDistanceMeters != null
        ? ` (jarak ODP ~${area.avgDistanceMeters >= 1000 ? (area.avgDistanceMeters / 1000).toFixed(1) + " km" : area.avgDistanceMeters + " m"})`
        : "";

      if (potensiCount > 0 && (aksesCount > 0 || infraCount > 0)) {
        recommendations.push({
          type: "investigate",
          area: area.odpName,
          reason: `Potensi tinggi (${potensiCount}x) tapi ada kendala ${aksesCount > 0 ? "akses" : "infrastruktur"}${distInfo} - perlu evaluasi`,
        });
      } else if (potensiCount >= 1) {
        recommendations.push({
          type: "invest",
          area: area.odpName,
          reason: `${potensiCount} laporan potensi tinggi${distInfo} - prioritaskan area ini untuk canvassing`,
        });
      }
      if (sepiCount >= 2 || kompCount >= 2 || criticalCount >= 2) {
        recommendations.push({
          type: "avoid",
          area: area.odpName,
          reason: `${sepiCount > 0 ? `Area sepi (${sepiCount}x)` : ""}${kompCount > 0 ? ` Kompetitor kuat (${kompCount}x)` : ""}${criticalCount > 0 ? ` ${criticalCount} issue kritis` : ""}${distInfo} - hindari sementara`.trim(),
        });
      }
      // Distance-specific recommendation: if far from ODP
      if (area.avgDistanceMeters != null && area.avgDistanceMeters > 500 && infraCount === 0 && potensiCount > 0) {
        recommendations.push({
          type: "investigate",
          area: area.odpName,
          reason: `Jarak rata-rata ke ODP ${area.avgDistanceMeters >= 1000 ? (area.avgDistanceMeters / 1000).toFixed(1) + " km" : area.avgDistanceMeters + " m"} - evaluasi biaya kabel drop`,
        });
      }
    }

    // Get user names for recent logs
    const allUsers = await storage.getAllUsers();
    const userMap = Object.fromEntries(allUsers.map(u => [u.id, u.name]));

    const recentLogs = allLogs.slice(0, 30).map(l => ({
      ...l,
      userName: userMap[l.userId] ?? "Unknown",
      odpName: l.odpId ? (odpMap[l.odpId] ?? null) : null,
      distanceMeters: computeLogDistance(l),
    }));

    sendSuccess(res, {
      totalReports: allLogs.length,
      byType,
      bySeverity,
      areaInsights,
      recommendations,
      recentLogs,
    });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- Leads -----------------------------------------------------------------

function maskLead(lead: any, role: string, userId: number): any {
  // Supervisor & admin can see everything
  const isPrivileged = role === "admin" || role === "marketing_spv";
  const isAssigned = lead.assignedTo === userId || lead.createdBy === userId;
  const canSeeContact = isPrivileged || isAssigned;
  return {
    ...lead,
    phone: canSeeContact ? lead.phone : lead.phone ? "••••••••" : null,
    address: canSeeContact ? lead.address : lead.address ? "••• (belum di-assign)" : null,
  };
}

router.get("/api/marketing/leads", async (req: Request, res: Response) => {
  if (!requireMarketing(req, res)) return;
  try {
    const { stage, source } = req.query as Record<string, string>;
    const role = req.authUser!.role;
    const userId = req.authUser!.id;
    let allLeads = await storage.getLeads({ stage, source });
    // marketing hanya bisa lihat lead milik sendiri (dibuat atau ditugaskan ke mereka)
    if (role === "marketing") {
      allLeads = allLeads.filter(l => l.createdBy === userId || l.assignedTo === userId);
    }
    const masked = allLeads.map(l => maskLead(l, role, userId));
    sendSuccess(res, masked);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/marketing/leads", async (req: Request, res: Response) => {
  if (!requireMarketing(req, res)) return;
  try {
    const { name, phone, address, category, notes, lat, lng, odpId, distanceMeters,
            district, village, source, prospectId, canvassingSessionId } = req.body;
    if (!name) return sendError(res, "Nama wajib diisi");
    if (!source) return sendError(res, "Source wajib diisi");

    // DEFENSIVE: auto-compute nearest ODP kalau lat/lng ada tapi odpId kosong
    // Supaya setiap lead punya referensi ODP untuk coverage planning.
    let resolvedOdpId = odpId != null ? Number(odpId) : null;
    let resolvedDistance = distanceMeters != null ? Number(distanceMeters) : null;
    if (!resolvedOdpId && lat != null && lng != null) {
      const lat1 = Number(lat), lng1 = Number(lng);
      const allOdps = await storage.getOdps();
      const validOdps = allOdps.filter((o: any) => o.lat != null && o.lng != null);
      if (validOdps.length > 0) {
        const haversine = (a1: number, b1: number, a2: number, b2: number) => {
          const R = 6371000; const toRad = (x: number) => x * Math.PI / 180;
          const dLat = toRad(a2 - a1), dLng = toRad(b2 - b1);
          const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a1)) * Math.cos(toRad(a2)) * Math.sin(dLng / 2) ** 2;
          return 2 * R * Math.asin(Math.sqrt(h));
        };
        let nearest: any = null, minD = Infinity;
        for (const o of validOdps) {
          const d = haversine(lat1, lng1, (o as any).lat, (o as any).lng);
          if (d < minD) { minD = d; nearest = o; }
        }
        if (nearest) {
          resolvedOdpId = nearest.id;
          resolvedDistance = Math.round(minD);
          console.log(`[createLead] auto-resolved nearest ODP for "${name}" → ${nearest.name} (${resolvedDistance}m)`);
        }
      }
    }

    const lead = await storage.createLead({
      name, phone, address, category, notes,
      lat: lat != null ? Number(lat) : null,
      lng: lng != null ? Number(lng) : null,
      odpId: resolvedOdpId,
      distanceMeters: resolvedDistance,
      district, village, source,
      prospectId: prospectId != null ? Number(prospectId) : null,
      canvassingSessionId: canvassingSessionId != null ? Number(canvassingSessionId) : null,
      stage: "new", priority: "medium",
      assignedTo: req.authUser!.id, // Auto-assign ke pembuat lead
      assignedBy: req.authUser!.id,
      assignedAt: new Date().toISOString(),
      createdBy: req.authUser!.id,
      createdAt: new Date().toISOString(),
    });
    // Update session lead count if canvassing
    if (canvassingSessionId) {
      const allSessions = await storage.getCanvassingSessions();
      const s = allSessions.find(s => s.id === Number(canvassingSessionId));
      if (s) await storage.updateCanvassingSession(s.id, { leadCount: (s.leadCount ?? 0) + 1 });
    }
    await logAudit(req, "CREATE", "lead", lead.id, lead.name);
    await emitLeadEvent("created", lead as any, req.authUser!.id);
    sendSuccess(res, lead, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/marketing/leads/:id", async (req: Request, res: Response) => {
  if (!requireMarketing(req, res)) return;
  try {
    const lead = await storage.getLeadById(Number(req.params.id));
    if (!lead) return sendError(res, "Lead tidak ditemukan", 404);
    const activities = await storage.getLeadActivities(lead.id);
    sendSuccess(res, { ...maskLead(lead, req.authUser!.role, req.authUser!.id), activities });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// Edit lead - hanya pemilik (createdBy) atau admin
router.put("/api/marketing/leads/:id", async (req: Request, res: Response) => {
  if (!requireMarketing(req, res)) return;
  try {
    const id = Number(req.params.id);
    const lead = await storage.getLeadById(id);
    if (!lead) return sendError(res, "Lead tidak ditemukan", 404);
    // Only owner or admin can edit
    if (lead.createdBy !== req.authUser!.id && req.authUser!.role !== "admin") {
      return sendError(res, "Hanya pemilik lead atau admin yang bisa mengedit", 403);
    }
    const { name, phone, address, category, notes, priority, lat, lng, district, village } = req.body;
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;
    if (category !== undefined) updateData.category = category;
    if (notes !== undefined) updateData.notes = notes;
    if (priority !== undefined) updateData.priority = priority;
    if (lat !== undefined) updateData.lat = lat;
    if (lng !== undefined) updateData.lng = lng;
    if (district !== undefined) updateData.district = district;
    if (village !== undefined) updateData.village = village;
    const updated = await storage.updateLead(id, updateData);
    await logAudit(req, "UPDATE", "lead", id, updated.name);
    await emitLeadEvent("updated", updated as any, req.authUser!.id);
    sendSuccess(res, updated);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.patch("/api/marketing/leads/:id/stage", async (req: Request, res: Response) => {
  if (!requireMarketing(req, res)) return;
  try {
    const { stage, lossReason } = req.body;
    if (!LEAD_STAGES.includes(stage)) return sendError(res, "Stage tidak valid");
    const lead = await storage.moveLeadStage(Number(req.params.id), stage, req.authUser!.id);
    if (stage === "lost" && lossReason) await storage.updateLead(lead.id, { lossReason });
    await logAudit(req, "UPDATE", "lead", lead.id, lead.name, { stage });
    await emitLeadEvent("stage_changed", lead as any, req.authUser!.id);
    // Telegram push ke owner kalau stage naik ke hot / won
    if ((stage === "hot" || stage === "won") && lead.assignedTo && Number(lead.assignedTo) !== req.authUser!.id) {
      try {
        const { notifyUserTelegram } = await import("./telegram.js");
        const emoji = stage === "won" ? "" : "";
        notifyUserTelegram(Number(lead.assignedTo), "lead_hot",
          `${emoji} *Lead pindah stage: ${stage.toUpperCase()}*\n\n*${lead.name}*\n${lead.phone ?? ""} · ${lead.district ?? ""}\n\nBuka: /leads`);
      } catch { /* ignore */ }
    }
    sendSuccess(res, lead);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.patch("/api/marketing/leads/:id/assign", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!["admin", "marketing_spv"].includes(req.authUser.role)) return sendError(res, "Hanya admin/SPV yang bisa assign lead", 403);
  try {
    const { assignedTo } = req.body;
    const lead = await storage.assignLead(Number(req.params.id), Number(assignedTo), req.authUser.id);
    // Resolve assigned user name for activity log
    const allUsers = await storage.getAllUsers();
    const assignedUser = allUsers.find(u => u.id === Number(assignedTo));
    await storage.createLeadActivity({
      leadId: lead.id, userId: req.authUser.id, type: "assigned",
      content: JSON.stringify({ assignedTo, assignedToName: assignedUser?.name ?? `User #${assignedTo}` }),
      createdAt: new Date().toISOString(),
    });
    if (assignedTo && Number(assignedTo) !== req.authUser.id) {
      // Arahkan notif ke kartu di pipeline leads bila lead sudah punya kartu; fallback /leads.
      let leadLink = "/leads";
      try {
        const links = await storage.getLeadCardLinks(lead.id);
        const cardId = links[0] ? Number((links[0] as any).cardId) : null;
        if (cardId != null) {
          const card = await storage.getCard(cardId);
          if (card?.pipelineId) leadLink = `/pipelines/${card.pipelineId}?card=${cardId}`;
        }
      } catch { /* fallback /leads */ }
      try {
        await storage.createNotification({
          userId: Number(assignedTo),
          type: "lead_assigned",
          title: "Lead baru ditugaskan untuk Anda",
          message: `${lead.name} - ${lead.phone ?? "no phone"} · ${lead.district ?? ""}`.trim(),
          link: leadLink,
          entityType: "lead", entityId: lead.id,
          fromUserId: req.authUser.id,
        });
      } catch (e: any) { console.warn("[notif] lead_assigned failed:", e.message); }
      // Telegram push (fire-and-forget, respect per-user prefs)
      try {
        const { notifyUserTelegram } = await import("./telegram.js");
        const tail = [lead.phone, lead.district].filter(Boolean).join(" · ");
        notifyUserTelegram(Number(assignedTo), "lead_assigned",
          ` *Lead baru di-assign*\n\n*${lead.name}*\n${tail}\n\nBuka: /leads`);
      } catch { /* ignore */ }
    }
    await logAudit(req, "UPDATE", "lead", lead.id, lead.name, { assignedTo });
    await emitLeadEvent("assigned", lead as any, req.authUser!.id);
    sendSuccess(res, lead);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/marketing/leads/:id/activity", async (req: Request, res: Response) => {
  if (!requireMarketing(req, res)) return;
  try {
    const { type, content, photoData } = req.body;
    if (!type) return sendError(res, "Type wajib diisi");
    const activity = await storage.createLeadActivity({
      leadId: Number(req.params.id), userId: req.authUser!.id,
      type, content,
      ...(photoData ? { photoData } : {}),
      createdAt: new Date().toISOString(),
    } as any);
    sendSuccess(res, activity, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/**
 * GET /api/marketing/leads/activities/:id/photo - stream lead activity photo.
 * Filesystem (photo_path) → fallback ke legacy base64 (photo_data) untuk pre-migration data.
 */
router.get("/api/marketing/leads/activities/:id/photo", async (req: Request, res: Response) => {
  if (!requireMarketing(req, res)) return;
  try {
    const id = Number(req.params.id);
    const meta = await storage.getLeadActivityPhotoMeta(id);
    if (!meta) return sendError(res, "Activity tidak ditemukan", 404);
    // ACL: non-supervisor cuma boleh lihat activity sendiri
    const isSupervisor = req.authUser!.role === "admin" || req.authUser!.role === "marketing_spv";
    if (!isSupervisor && meta.userId !== req.authUser!.id) {
      return sendError(res, "Akses ditolak", 403);
    }
    if (meta.photoPath) {
      await streamPhoto(meta.photoPath, res);
      return;
    }
    if (meta.photoData) {
      const m = /^data:(image\/[a-z0-9+.-]+);base64,(.+)$/i.exec(meta.photoData);
      if (m) {
        res.setHeader("Content-Type", m[1]);
        res.setHeader("Cache-Control", "private, max-age=300");
        res.send(Buffer.from(m[2], "base64"));
        return;
      }
    }
    return sendError(res, "Foto tidak tersedia", 404);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- Lead → Customer Conversion --
router.post("/api/marketing/leads/:id/convert", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const leadId = Number(req.params.id);
    const lead = await storage.getLeadById(leadId);
    if (!lead) return sendError(res, "Lead tidak ditemukan", 404);

    // Check if already converted
    const allCustomers = await storage.getCustomers();
    const alreadyConverted = allCustomers.find(c => (c as any).leadId === leadId);
    if (alreadyConverted) {
      return sendError(res, `Lead sudah dikonversi menjadi pelanggan ${alreadyConverted.customerId}`, 400);
    }

    const { customerId, package: pkg, pppoeUsername, pppoePassword, pppoeProfile, pppoeRouterId, createWorkOrder } = req.body;
    if (!customerId) return sendError(res, "ID Pelanggan (billing) wajib diisi");
    if (!pkg) return sendError(res, "Paket layanan wajib diisi");

    // Map lead category to customer type
    const categoryMap: Record<string, string> = { rumahan: "rumahan", bisnis: "bisnis", sekolah: "bisnis", perkantoran: "bisnis", lainnya: "bisnis" };
    const customerType = categoryMap[lead.category || ""] || "rumahan";

    // Auto-assign port
    let portNumber: number | undefined;
    if (lead.odpId) {
      const usedPorts = new Set(
        allCustomers.filter(c => c.odpId === lead.odpId && c.portNumber).map(c => c.portNumber!)
      );
      const odp = await storage.getOdp(lead.odpId);
      const cap = odp?.capacity || 8;
      for (let p = 1; p <= cap; p++) {
        if (!usedPorts.has(p)) { portNumber = p; break; }
      }
    }

    // Create customer from lead data
    const customer = await storage.createCustomer({
      name: lead.name,
      customerId,
      phone: lead.phone || undefined,
      address: lead.address || undefined,
      lat: lead.lat ?? undefined,
      lng: lead.lng ?? undefined,
      district: lead.district || undefined,
      village: lead.village || undefined,
      odpId: lead.odpId ?? undefined,
      portNumber,
      package: pkg,
      status: "active",
      customerType,
      pppoeUsername: pppoeUsername || undefined,
      pppoePassword: pppoePassword || undefined,
      pppoeProfile: pppoeProfile || undefined,
      pppoeRouterId: pppoeRouterId || undefined,
      leadId: leadId,
    } as any);

    // Auto-sync PPPoE to MikroTik if credentials provided
    let pppoeSync: { success: boolean; mikrotikId?: string; error?: string } | undefined;
    if (customer.pppoeUsername && customer.pppoePassword && customer.pppoeRouterId) {
      pppoeSync = await syncPppoeToMikrotik(customer, "create");
      if (pppoeSync.success && pppoeSync.mikrotikId) {
        await storage.updateCustomer(customer.id, { pppoeMikrotikId: pppoeSync.mikrotikId } as any);
      }
    }

    // Move lead to "won" if not already
    if (lead.stage !== "won") {
      await storage.moveLeadStage(leadId, "won", req.authUser!.id);
    }

    // Log conversion in lead activities
    await storage.createLeadActivity({
      leadId, userId: req.authUser!.id, type: "converted",
      content: JSON.stringify({ customerId: customer.id, customerBillingId: customerId }),
      createdAt: new Date().toISOString(),
    });

    // Auto-create Work Order ticket if requested
    let workOrder: any;
    if (createWorkOrder !== false) {
      const ticketNumber = await storage.getNextTicketNumber();
      workOrder = await storage.createTicket({
        ticketNumber,
        title: `Pemasangan Baru - ${lead.name}`,
        categoryId: 1, // "Pemasangan Baru" (default seed category)
        customerId: customer.id,
        priority: "medium",
        status: "open",
        createdBy: req.authUser!.id,
        address: customer.address || undefined,
        lat: customer.lat ?? undefined,
        lng: customer.lng ?? undefined,
        odpId: lead.odpId ?? undefined,
        estimatedDuration: 120, // 2 jam default
      } as any);
      await storage.createTicketActivity({
        ticketId: workOrder.id, userId: req.authUser!.id, type: "created",
        content: `Auto-generated dari konversi lead ${lead.name}`,
        createdAt: new Date().toISOString(),
      });
    }

    await logAudit(req, "CREATE", "lead_conversion", customer.id, `Lead ${lead.name} → Customer ${customerId}`);
    await emitLeadEvent("converted", { ...lead, stage: "won" } as any, req.authUser!.id);

    // Fire Meta CAPI "Purchase" event (non-blocking)
    getMetaCapiConfig().then(cfg => {
      if (cfg) metaTrackPurchase(cfg, {
        name: customer.name, phone: customer.phone, email: customer.email,
        city: customer.district, customerId, packageName: pkg,
        value: customer.billingPrice || 0,
      }).catch(() => {});
    });

    sendSuccess(res, { customer, pppoeSync, workOrder }, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.delete("/api/marketing/leads/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (req.authUser.role !== "admin") return sendError(res, "Hanya admin yang bisa hapus lead", 403);
  try {
    const lead = await storage.getLeadById(Number(req.params.id));
    if (!lead) return sendError(res, "Lead tidak ditemukan", 404);
    await storage.deleteLead(Number(req.params.id));
    await logAudit(req, "DELETE", "lead", lead.id, lead.name);
    sendSuccess(res, { message: "Lead berhasil dihapus" });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- Delete Lead Activity --
router.delete("/api/marketing/leads/:leadId/activity/:activityId", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    await storage.deleteLeadActivity(Number(req.params.activityId));
    await logAudit(req, "DELETE", "lead_activity", Number(req.params.activityId));
    sendSuccess(res, { deleted: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- Delete Canvassing Session --
router.delete("/api/marketing/canvassing/sessions/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (req.authUser.role !== "admin" && req.authUser.role !== "marketing_spv") return sendError(res, "Hanya admin/SPV yang bisa hapus sesi", 403);
  try {
    await storage.deleteCanvassingSession(Number(req.params.id));
    await logAudit(req, "DELETE", "canvassing_session", Number(req.params.id));
    sendSuccess(res, { deleted: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- Delete Canvassing Log --
router.delete("/api/marketing/canvassing/logs/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    await storage.deleteCanvassingLog(Number(req.params.id));
    await logAudit(req, "DELETE", "canvassing_log", Number(req.params.id));
    sendSuccess(res, { deleted: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- Prospects (saved from Google Places) ---------------------------------

router.get("/api/marketing/prospects/odp/:odpId", async (req: Request, res: Response) => {
  if (!requireMarketing(req, res)) return;
  try {
    const data = await storage.getProspectsByOdp(Number(req.params.odpId));
    const cache = await storage.getScrapeCacheForOdp(Number(req.params.odpId));
    sendSuccess(res, { prospects: data, cache });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.delete("/api/marketing/prospects/odp/:odpId", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (req.authUser.role !== "admin") return sendError(res, "Hanya admin yang bisa hapus data prospek", 403);
  try {
    await storage.deleteProspectsByOdp(Number(req.params.odpId));
    await logAudit(req, "DELETE", "prospects", Number(req.params.odpId), `ODP #${req.params.odpId}`);
    sendSuccess(res, { message: "Data prospek ODP berhasil dihapus" });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ===========================================================
//  MARKETING ADS - Audience Export & Webhook
// ===========================================================
import {
  customerToAudienceRow, audienceToCSV, clusterOdps,
  type OdpForCluster,
} from "./audience.js";

// Audience: Exclude (pelanggan aktif → jangan tampilkan iklan)
router.get("/api/marketing/audience/exclude", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const customers = await storage.getCustomers();
    const active = customers.filter(c => c.status === "active" || c.status === "Active");
    const rows = active.map(c => customerToAudienceRow(c));
    const csv = audienceToCSV(rows);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=exclude_audience.csv");
    res.send(csv);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// Audience: Lookalike Seed (pelanggan terbaik)
router.get("/api/marketing/audience/lookalike", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const customers = await storage.getCustomers();
    const best = customers.filter(c =>
      c.status === "active" && c.billingPrice && c.billingPrice > 0 && c.isIsolir !== 1
    );
    const rows = best.map(c => customerToAudienceRow(c, true));
    const csv = audienceToCSV(rows, true);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=lookalike_seed.csv");
    res.send(csv);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// Audience: ODP Geo-Target Clusters
router.get("/api/marketing/audience/geo-targets", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const odps = await storage.getOdps();
    const customers = await storage.getCustomers();
    // Count used capacity per ODP
    const usedByOdp: Record<number, number> = {};
    for (const c of customers) {
      if (c.odpId) usedByOdp[c.odpId] = (usedByOdp[c.odpId] || 0) + 1;
    }
    const odpData: OdpForCluster[] = odps
      .filter(o => o.lat && o.lng)
      .map(o => ({
        id: o.id, name: o.name,
        lat: o.lat!, lng: o.lng!,
        capacity: o.capacity || 8,
        usedCapacity: usedByOdp[o.id] || o.usedCapacity || 0,
        district: o.district,
      }));
    const clusters = clusterOdps(odpData);
    sendSuccess(res, clusters);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// Ads Stats
router.get("/api/marketing/ads/stats", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const leads = await storage.getLeads({});
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const adSources = ["meta_ads", "tiktok_ads", "google_ads", "landing_page"];
    const fromAds = leads.filter(l => adSources.includes(l.source || ""));
    const thisMonth = fromAds.filter(l => l.createdAt && l.createdAt >= monthStart);
    const won = fromAds.filter(l => l.stage === "won");
    const customers = await storage.getCustomers();
    const converted = customers.filter(c => {
      const lid = (c as any).leadId;
      return lid && fromAds.some(l => l.id === lid);
    });
    sendSuccess(res, {
      totalLeadsFromAds: fromAds.length,
      thisMonthLeads: thisMonth.length,
      wonLeads: won.length,
      convertedCustomers: converted.length,
      conversionRate: fromAds.length > 0 ? Math.round((won.length / fromAds.length) * 100) : 0,
      bySource: {
        meta: fromAds.filter(l => l.source === "meta_ads").length,
        tiktok: fromAds.filter(l => l.source === "tiktok_ads").length,
        google: fromAds.filter(l => l.source === "google_ads").length,
        landing: fromAds.filter(l => l.source === "landing_page").length,
      },
    });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ----------- INTERNAL ADS CAMPAIGNS CRUD (for MarketingAdsPage) -----------
router.get("/api/marketing/ads/campaigns", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "marketing_ads")) return sendError(res, "Akses ditolak", 403);
  try {
    const platform = req.query.platform as string | undefined;
    const status = req.query.status as string | undefined;
    const rows = await storage.getAdCampaigns({
      ...(platform ? { platform } : {}),
      ...(status ? { status } : {}),
    });
    sendSuccess(res, rows.map(c => ({
      ...c,
      ctr: c.impressions && c.clicks ? Number(((c.clicks / c.impressions) * 100).toFixed(2)) : null,
      cpl: c.spendTotal && c.leadsFromAd ? Math.round(c.spendTotal / c.leadsFromAd) : null,
      conversionRate: c.leadsFromAd && c.conversions ? Number(((c.conversions / c.leadsFromAd) * 100).toFixed(2)) : null,
      roas: c.spendTotal && c.revenue ? Number((c.revenue / c.spendTotal).toFixed(2)) : null,
    })));
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/marketing/ads/campaigns", async (req: Request, res: Response) => {
  if (!requireWritePermission(req, res, "marketing_ads")) return;
  try {
    const b = req.body ?? {};
    if (!b.platform || !b.campaignName) return sendError(res, "platform + campaignName wajib");
    const nowIso = new Date().toISOString();
    const campaign = await storage.createAdCampaign({
      platform: String(b.platform),
      campaignName: String(b.campaignName).trim(),
      externalId: b.externalId || null,
      status: b.status || "active",
      objective: b.objective || null,
      audience: b.audience || null,
      dateStart: b.dateStart || null,
      dateEnd: b.dateEnd || null,
      budgetDaily: b.budgetDaily ? Number(b.budgetDaily) : null,
      budgetTotal: b.budgetTotal ? Number(b.budgetTotal) : null,
      spendTotal: Number(b.spendTotal) || 0,
      impressions: Number(b.impressions) || 0,
      clicks: Number(b.clicks) || 0,
      leadsFromAd: Number(b.leadsFromAd) || 0,
      conversions: Number(b.conversions) || 0,
      revenue: Number(b.revenue) || 0,
      utmSource: b.utmSource || null,
      utmCampaign: b.utmCampaign || null,
      linkUrl: b.linkUrl || null,
      thumbnailUrl: b.thumbnailUrl || null,
      notes: b.notes || null,
      createdAt: nowIso,
    } as any);
    await logAudit(req, "CREATE", "ad_campaign", campaign.id, campaign.campaignName);
    sendSuccess(res, campaign, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.patch("/api/marketing/ads/campaigns/:id", async (req: Request, res: Response) => {
  if (!requireWritePermission(req, res, "marketing_ads")) return;
  try {
    const id = Number(req.params.id);
    const existing = await storage.getAdCampaign(id);
    if (!existing) return sendError(res, "Campaign tidak ditemukan", 404);
    const updated = await storage.updateAdCampaign(id, req.body || {});
    await logAudit(req, "UPDATE", "ad_campaign", id, existing.campaignName);
    sendSuccess(res, updated);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.delete("/api/marketing/ads/campaigns/:id", async (req: Request, res: Response) => {
  if (!requireWritePermission(req, res, "marketing_ads")) return;
  try {
    const id = Number(req.params.id);
    const existing = await storage.getAdCampaign(id);
    if (!existing) return sendError(res, "Campaign tidak ditemukan", 404);
    const ok = await storage.deleteAdCampaign(id);
    await logAudit(req, "DELETE", "ad_campaign", id, existing.campaignName);
    sendSuccess(res, { deleted: ok });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// Webhook: Meta Lead Ads
router.post("/api/webhook/meta-leads", async (req: Request, res: Response) => {
  try {
    // Meta verification challenge
    if (req.query["hub.mode"] === "subscribe") {
      return res.send(req.query["hub.challenge"]);
    }
    const entries = req.body?.entry || [];
    let created = 0;
    for (const entry of entries) {
      for (const change of (entry.changes || [])) {
        if (change.field !== "leadgen") continue;
        const v = change.value;
        const fields: Record<string, string> = {};
        for (const fd of (v.field_data || [])) {
          fields[fd.name] = fd.values?.[0] || "";
        }
        const name = fields.full_name || fields.name || "Meta Lead";
        const phone = fields.phone_number || fields.phone || "";
        const email = fields.email || "";
        const address = fields.street_address || fields.address || "";
        const city = fields.city || "";

        // Find nearest ODP if address/city provided
        let odpId: number | undefined;
        if (city) {
          const odps = await storage.getOdps();
          const match = odps.find(o => o.district?.toLowerCase() === city.toLowerCase());
          if (match) odpId = match.id;
        }

        const ad = await withMitra(1, () => resolveAdFields("meta_ads", v));
        const createdLead = await storage.createLead({
          name, phone, address: address || city,
          source: "meta_ads", stage: "new", priority: "medium",
          category: "rumahan", odpId,
          campaign: ad.campaign, adSet: ad.adSet, adName: ad.adName,
          notes: `Meta Lead Ads | Form: ${v.form_id || "?"} | Ad: ${v.ad_id || "?"}`,
          createdBy: 1, createdAt: new Date().toISOString(),
        } as any);
        await emitLeadEvent("created", createdLead as any, 1);
        created++;
      }
    }
    res.json({ success: true, created });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Webhook: TikTok Lead Gen
router.post("/api/webhook/tiktok-leads", async (req: Request, res: Response) => {
  try {
    const leads = Array.isArray(req.body) ? req.body : [req.body];
    let created = 0;
    for (const lead of leads) {
      const name = lead.name || lead.full_name || "TikTok Lead";
      const phone = lead.phone || lead.phone_number || "";
      const email = lead.email || "";
      const address = lead.address || lead.city || "";

      const ad = await withMitra(1, () => resolveAdFields("tiktok_ads", lead));
      const createdLead = await storage.createLead({
        name, phone, address, email,
        source: "tiktok_ads", stage: "new", priority: "medium",
        category: "rumahan",
        campaign: ad.campaign, adSet: ad.adSet, adName: ad.adName,
        notes: `TikTok Lead Gen`,
        createdBy: 1, createdAt: new Date().toISOString(),
      } as any);
      await emitLeadEvent("created", createdLead as any, 1);
      created++;
    }
    res.json({ success: true, created });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ===========================================================
//  TICKETING / WORK ORDER
// ===========================================================

// -- Ticket Categories --
router.get("/api/ticket-categories", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const cats = await storage.getTicketCategories();
    sendSuccess(res, cats);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/ticket-categories", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { name, color, icon, sortOrder } = req.body;
    if (!name) return sendError(res, "Nama kategori wajib diisi");
    const cat = await storage.createTicketCategory({ name, color, icon, sortOrder, isActive: 1 });
    await logAudit(req, "CREATE", "ticket_category", cat.id, cat.name);
    sendSuccess(res, cat, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.put("/api/ticket-categories/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const cat = await storage.updateTicketCategory(Number(req.params.id), req.body);
    if (!cat) return sendError(res, "Kategori tidak ditemukan", 404);
    await logAudit(req, "UPDATE", "ticket_category", cat.id, cat.name);
    sendSuccess(res, cat);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.delete("/api/ticket-categories/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    await storage.deleteTicketCategory(Number(req.params.id));
    await logAudit(req, "DELETE", "ticket_category", Number(req.params.id));
    sendSuccess(res, { deleted: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- Tickets --
router.get("/api/tickets/stats", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const stats = await storage.getTicketStats();
    sendSuccess(res, stats);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// v4.2.18 (C.4): SLA dashboard stats - compliance %, MTTR, breach trend (last 14 hari)
router.get("/api/tickets/sla-stats", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const stats = await storage.getSlaDashboardStats();
    sendSuccess(res, stats);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// v4.2.16: laporan workload per-teknisi (Tiket per Teknisi)
router.get("/api/tickets/workload-by-technician", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const data = await storage.getTechnicianWorkload();
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// v4.2.17: CSAT aggregate per teknisi (untuk dashboard)
router.get("/api/tickets/csat-by-technician", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const fromIso = req.query.from ? String(req.query.from) : undefined;
    const data = await storage.getCsatPerTechnician(fromIso);
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// v4.2.17: ODP repeat-issue heatmap (≥3 tiket dalam 30 hari)
router.get("/api/tickets/odp-repeat-issues", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const threshold = Number(req.query.threshold) || 3;
    const days = Number(req.query.days) || 30;
    const data = await storage.getOdpRepeatIssues(threshold, days);
    sendSuccess(res, data);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// v4.2.17: Auto-create ticket dari network alarm (dipanggil internal worker / external monitor)
router.post("/api/tickets/auto-from-alarm", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const { source, alarmType, customerId, odpId, deviceId, pppoeUsername, detail } = req.body;
    if (!source || !alarmType) return sendError(res, "source + alarmType wajib");

    // Correlation key: kalau ≥3 ONT mati di ODP yang sama → 1 tiket "ODP down" (group by odpId+date)
    const today = new Date().toISOString().slice(0, 10);
    const correlationKey = odpId ? `odp-${odpId}-${alarmType}-${today}` : `single-${customerId ?? deviceId ?? "unknown"}-${alarmType}-${today}`;

    const alarm = await storage.insertNetworkAlarm({
      source, alarmType, customerId, odpId, deviceId, pppoeUsername,
      detail: detail ? JSON.stringify(detail) : null,
      detectedAt: new Date().toISOString(),
      correlationKey,
    });

    // Cek alarms ongoing dengan correlation_key sama
    const ongoing = await storage.findOngoingAlarmsByKey(correlationKey);
    const distinctCustomers = new Set(ongoing.map(a => a.customerId).filter(Boolean));

    // Kalau sudah ada alarm yg ke-link ke ticket di key ini → re-use ticket itu
    const existingWithTicket = ongoing.find(a => a.ticketId);
    if (existingWithTicket && existingWithTicket.ticketId) {
      await storage.linkAlarmToTicket(alarm.id, existingWithTicket.ticketId);
      sendSuccess(res, { ticketId: existingWithTicket.ticketId, alarmId: alarm.id, mode: "linked_to_existing" });
      return;
    }

    // Tentukan kategori - default ke "Gangguan" (id=2 dari seed)
    const cats = await storage.getTicketCategories();
    const gangguanCat = cats.find(c => /gangguan/i.test(c.name));
    const categoryId = gangguanCat?.id ?? null;

    // Title + priority logic
    let title: string;
    let priority = "medium";
    if (odpId && distinctCustomers.size >= 3) {
      // Multi-customer issue → ODP-level outage
      const odp = await storage.getOdp(odpId);
      title = `[AUTO] ${alarmType.toUpperCase()} di ${odp?.name ?? `ODP #${odpId}`} (${distinctCustomers.size} customer terdampak)`;
      priority = "urgent";
    } else if (customerId) {
      const cust = await storage.getCustomer(customerId);
      title = `[AUTO] ${alarmType.replace(/_/g, " ")} - ${cust?.name ?? "Customer"}`;
      priority = "high";
    } else {
      title = `[AUTO] ${alarmType.replace(/_/g, " ")} - ${pppoeUsername ?? deviceId ?? "unknown"}`;
    }

    const ticketNumber = await storage.getNextTicketNumber();
    const ticket = await storage.createTicket({
      ticketNumber, title, categoryId, customerId: customerId ?? null,
      description: `Auto-generated dari ${source} alarm.\nDetail: ${JSON.stringify(detail ?? {})}\nAlarm correlation: ${correlationKey}`,
      priority, status: "open",
      createdBy: req.authUser!.id,
      odpId: odpId ?? null,
    });
    await storage.linkAlarmToTicket(alarm.id, ticket.id);
    // Link semua alarm ongoing dengan key sama ke ticket ini juga
    for (const a of ongoing) {
      if (a.id !== alarm.id && !a.ticketId) await storage.linkAlarmToTicket(a.id, ticket.id);
    }
    await storage.createTicketActivity({
      ticketId: ticket.id, userId: req.authUser!.id, type: "auto_created",
      content: `Auto-create dari ${source} alarm (correlation=${correlationKey})`,
      createdAt: new Date().toISOString(),
    });
    await logAudit(req, "CREATE", "ticket", ticket.id, `auto-from-alarm ${alarmType}`);
    sendSuccess(res, { ticketId: ticket.id, ticketNumber, alarmId: alarm.id, correlationKey, mode: "created", linkedAlarms: ongoing.length + 1 });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/tickets", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const page = Number(req.query.page) || 1;
    const pageSize = Math.min(Number(req.query.pageSize) || 15, 1000);
    const search = req.query.search ? String(req.query.search) : undefined;
    const status = req.query.status && req.query.status !== "all" ? String(req.query.status) : undefined;
    const categoryId = req.query.category && req.query.category !== "all" ? Number(req.query.category) : undefined;
    const priority = req.query.priority && req.query.priority !== "all" ? String(req.query.priority) : undefined;
    const { items, total } = await storage.getTicketsPaginated({ page, pageSize, search, status, categoryId, priority });
    sendSuccess(res, { items, total, page, pageSize });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/tickets/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const ticket = await storage.getTicket(Number(req.params.id));
    if (!ticket) return sendError(res, "Tiket tidak ditemukan", 404);
    const activities = await storage.getTicketActivities(ticket.id);
    sendSuccess(res, { ...ticket, activities });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/tickets", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const { title, categoryId, customerId, description, priority, assignedTo, scheduledDate, scheduledTime, deadline, estimatedDuration, address, lat, lng, odpId } = req.body;
    if (!title) return sendError(res, "Judul tiket wajib diisi");
    const ticketNumber = await storage.getNextTicketNumber();
    const ticket = await storage.createTicket({
      ticketNumber, title, categoryId, customerId, description,
      priority: priority || "medium", status: assignedTo ? "assigned" : "open",
      assignedTo, createdBy: req.authUser!.id,
      scheduledDate, scheduledTime, deadline, estimatedDuration,
      address, lat, lng, odpId,
    });
    // v4.2.18 (A.3): structured activity log
    await logTicketActivity(req, ticket.id, "ticket.created", {
      ticketNumber, title, categoryId, priority: priority || "medium", customerId, odpId,
    }, `Tiket ${ticketNumber} dibuat`);
    if (assignedTo) {
      // v4.2.16: Auto-add ke ticketTeam sebagai LEAD supaya laporan per-teknisi konsisten
      try {
        await storage.addTicketTeamMember({ ticketId: ticket.id, userId: assignedTo, role: "lead" });
        await storage.updateTicket(ticket.id, { dispatchedAt: new Date().toISOString() } as any);
      } catch (e: any) { console.warn("[Ticket] auto-add team lead failed:", e.message); }
      await logTicketActivity(req, ticket.id, "ticket.assigned", {
        assignedTo, role: "lead",
      }, `Lead di-assign: user #${assignedTo}`);
    }
    await logAudit(req, "CREATE", "ticket", ticket.id, ticketNumber);
    sendSuccess(res, ticket, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.put("/api/tickets/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const id = Number(req.params.id);
    const ticket = await storage.updateTicket(id, req.body);
    if (!ticket) return sendError(res, "Tiket tidak ditemukan", 404);
    await logAudit(req, "UPDATE", "ticket", id, ticket.ticketNumber);
    sendSuccess(res, ticket);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// DRY: satu transisi status dipakai endpoint single + bulk. Mengembalikan tiket terbaru.
async function applyTicketStatusTransition(
  req: Request,
  existing: any,
  body: { status: string; resolution?: string; actualDuration?: number },
) {
  const id = existing.id;
  const { status, resolution, actualDuration } = body;
  const updates: any = { status };
  if (status === "resolved" || status === "closed") {
    updates.resolvedAt = new Date().toISOString();
    if (resolution) updates.resolution = resolution;
    if (actualDuration) updates.actualDuration = actualDuration;
    // v4.2.18 (A.1): manual close tanpa advance ke final stage → mark legacy_resolution
    try {
      const cat = existing.categoryId ? await storage.getTicketCategory(existing.categoryId) : null;
      const stages = storage.getCategoryWorkflowStages(cat as any);
      const finalStage = stages.find(s => s.isFinal);
      if (finalStage) {
        const transitions = await storage.getTicketStageTransitions(id);
        const finalEntered = transitions.some(t => t.toStage === finalStage.key);
        if (!finalEntered) updates.legacyResolution = 1;
      }
    } catch (e: any) { console.warn("[A.1] legacy_resolution check fail:", e.message); }
  }
  if (status === "closed") updates.closedAt = new Date().toISOString();
  const ticket = await storage.updateTicket(id, updates);
  // v4.2.17: Auto-schedule CSAT 24h setelah resolved/closed (idempotent)
  if (status === "resolved" || status === "closed") {
    try { await storage.scheduleCsatForTicket(id); } catch (e: any) { console.warn("[CSAT] schedule fail:", e.message); }
  }
  // v4.2.18 (A.3): structured activity log
  await logTicketActivity(req, id, "status.changed", {
    from: existing.status, to: status, resolution: resolution ?? null,
    legacyResolution: updates.legacyResolution === 1,
  }, `Status: ${existing.status} → ${status}`);
  await logAudit(req, "UPDATE", "ticket", id, `Status: ${existing.status} → ${status}`);
  return ticket;
}

router.post("/api/tickets/:id/status", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const id = Number(req.params.id);
    const existing = await storage.getTicket(id);
    if (!existing) return sendError(res, "Tiket tidak ditemukan", 404);
    const { status, resolution, actualDuration } = req.body;
    if (!status) return sendError(res, "Status wajib diisi");
    const ticket = await applyTicketStatusTransition(req, existing, { status, resolution, actualDuration });
    sendSuccess(res, ticket);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// Bulk status - ganti N+1 loop HTTP di client jadi 1 request. Per-tiket error tidak menggagalkan batch.
router.post("/api/tickets/bulk-status", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const { ids, status, resolution } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return sendError(res, "ids wajib (array)");
    if (!status) return sendError(res, "Status wajib diisi");
    if (ids.length > 200) return sendError(res, "Maksimal 200 tiket per batch");
    let updated = 0;
    const failed: Array<{ id: number; error: string }> = [];
    for (const rawId of ids) {
      const id = Number(rawId);
      try {
        const existing = await storage.getTicket(id);
        if (!existing) { failed.push({ id, error: "tidak ditemukan" }); continue; }
        await applyTicketStatusTransition(req, existing, { status, resolution });
        updated++;
      } catch (e: any) { failed.push({ id, error: e.message }); }
    }
    sendSuccess(res, { updated, failed });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/tickets/:id/assign", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const id = Number(req.params.id);
    const { assignedTo } = req.body;
    const ticket = await storage.updateTicket(id, { assignedTo, status: "assigned" });
    if (!ticket) return sendError(res, "Tiket tidak ditemukan", 404);
    // v4.2.16: Sync ke ticketTeam sebagai LEAD supaya laporan per-teknisi konsisten
    try {
      const existing = await storage.getTicketTeam(id);
      const alreadyLead = existing.find(m => m.userId === Number(assignedTo) && m.role === "lead");
      if (!alreadyLead) {
        // Demote existing lead jadi helper kalau ada (1 lead per ticket)
        for (const m of existing) {
          if (m.role === "lead") await storage.updateTicketTeamMember(m.id, { role: "helper" } as any);
        }
        // Cek user ini sudah jadi helper? upgrade ke lead. Else add new.
        const asHelper = existing.find(m => m.userId === Number(assignedTo));
        if (asHelper) {
          await storage.updateTicketTeamMember(asHelper.id, { role: "lead" } as any);
        } else {
          await storage.addTicketTeamMember({ ticketId: id, userId: Number(assignedTo), role: "lead" });
        }
      }
    } catch (e: any) { console.warn("[Ticket] sync team lead on /assign failed:", e.message); }
    // v4.2.18 (A.3): structured activity log
    await logTicketActivity(req, id, "ticket.assigned", {
      assignedTo, role: "lead",
    }, `Lead di-assign: user #${assignedTo}`);
    // Notify assignee
    if (assignedTo && assignedTo !== req.authUser.id) {
      try {
        await storage.createNotification({
          userId: assignedTo,
          type: "ticket_assigned",
          title: "Tiket ditugaskan untuk Anda",
          message: `${ticket.ticketNumber} - ${ticket.title}`,
          link: `/tickets/${id}`,
          entityType: "ticket", entityId: id,
          fromUserId: req.authUser.id,
        });
      } catch (e: any) { console.warn("[notif] ticket_assigned failed:", e.message); }
      try {
        const { notifyUserTelegram } = await import("./telegram.js");
        notifyUserTelegram(Number(assignedTo), "ticket_assigned",
          ` *Ticket di-assign*\n\n*${ticket.ticketNumber}* - ${ticket.title}\n\nBuka: /tickets/${id}`);
      } catch { /* ignore */ }
    }
    // Batch 2f: auto-routing - kalau tiket punya conversation Chatwoot terkait & assignee
    // punya pemetaan agent, assign conversation Chatwoot ke agent itu (best-effort).
    try {
      const link = await storage.getChatwootLinkByTicket(id);
      if (link?.conversationId && assignedTo) {
        const agentLink = await storage.getChatwootAgentLinkByUser(Number(assignedTo));
        if (agentLink?.chatwootAgentId) {
          const { assignConversation } = await import("./chatwoot.js");
          await assignConversation(link.conversationId, Number(agentLink.chatwootAgentId));
        }
      }
    } catch (e: any) { console.warn("[Chatwoot] auto-route conversation gagal (diabaikan):", e.message); }
    await logAudit(req, "UPDATE", "ticket", id, `Assigned to user ${assignedTo}`);
    sendSuccess(res, ticket);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/tickets/:id/activity", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const { content } = req.body;
    if (!content) return sendError(res, "Konten catatan wajib diisi");
    const activity = await storage.createTicketActivity({
      ticketId: Number(req.params.id), userId: req.authUser!.id,
      type: "note", content, createdAt: new Date().toISOString(),
    });
    sendSuccess(res, activity, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.delete("/api/tickets/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const id = Number(req.params.id);
    const existing = await storage.getTicket(id);
    if (!existing) return sendError(res, "Tiket tidak ditemukan", 404);
    await storage.deleteTicket(id);
    await logAudit(req, "DELETE", "ticket", id, existing.ticketNumber);
    sendSuccess(res, { deleted: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ===========================================================
//  WORK ORDER ENHANCEMENT (Team, Evidence, GPS, MTTR)
// ===========================================================

// -- Ticket Team --
// v4.2.18 (A.3): GET activities paginated + filterable by action type
router.get("/api/tickets/:id/activities", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const id = Number(req.params.id);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const types = req.query.types ? String(req.query.types).split(",").map(s => s.trim()).filter(Boolean) : undefined;
    const result = await storage.getTicketActivitiesPaginated(id, { limit, offset, types });
    sendSuccess(res, result);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/tickets/:id/team", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const enriched = await storage.getTicketTeamWithUsers(Number(req.params.id));
    sendSuccess(res, enriched);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/tickets/:id/team", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const { userId, role } = req.body;
    if (!userId) return sendError(res, "userId wajib diisi");
    const member = await storage.addTicketTeamMember({ ticketId: Number(req.params.id), userId, role: role || "helper" });
    // Update ticket status to dispatched if not already
    const ticket = await storage.getTicket(Number(req.params.id));
    if (ticket && (ticket.status === "open" || ticket.status === "assigned")) {
      await storage.updateTicket(ticket.id, { status: "assigned", dispatchedAt: new Date().toISOString() } as any);
    }
    // v4.2.18 (A.3): structured activity log
    await logTicketActivity(req, Number(req.params.id), "team.added", {
      userId, role: role || "helper", memberId: member.id,
    }, `Tim: user #${userId} ditambahkan sebagai ${role || "helper"}`);
    await logAudit(req, "CREATE", "ticket_team", member.id, `Team ${role} for ticket ${req.params.id}`);
    sendSuccess(res, member, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.delete("/api/tickets/:id/team/:memberId", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const ticketId = Number(req.params.id);
    const memberId = Number(req.params.memberId);
    // Capture sebelum delete untuk audit
    const team = await storage.getTicketTeam(ticketId);
    const member = team.find(m => m.id === memberId);
    await storage.removeTicketTeamMember(memberId);
    // v4.2.18 (A.3)
    if (member) {
      await logTicketActivity(req, ticketId, "team.removed", {
        userId: member.userId, role: member.role, memberId,
      }, `Tim: user #${member.userId} dikeluarkan`);
    }
    sendSuccess(res, { removed: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- Check-in / Check-out --
router.post("/api/tickets/:id/check-in", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const ticketId = Number(req.params.id);
    const { lat, lng } = req.body;
    // Find user's team assignment
    const team = await storage.getTicketTeam(ticketId);
    const myAssignment = team.find(m => m.userId === req.authUser!.id);
    if (!myAssignment) return sendError(res, "Anda tidak terdaftar di tim tiket ini", 403);
    if (myAssignment.checkInAt) return sendError(res, "Sudah check-in sebelumnya");
    // Update team member
    await storage.updateTicketTeamMember(myAssignment.id, { checkInAt: new Date().toISOString(), checkInLat: lat, checkInLng: lng });
    // Log GPS event
    await storage.addTicketGpsLog({ ticketId, userId: req.authUser!.id, event: "check_in", lat: lat || 0, lng: lng || 0, timestamp: new Date().toISOString() });
    // Update ticket status to in_progress
    await storage.updateTicket(ticketId, { status: "in_progress" } as any);
    await storage.createTicketActivity({ ticketId, userId: req.authUser!.id, type: "status_change",
      content: JSON.stringify({ from: "assigned", to: "in_progress", action: "check_in" }), createdAt: new Date().toISOString() });
    sendSuccess(res, { checkedIn: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/tickets/:id/check-out", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const ticketId = Number(req.params.id);
    const { lat, lng, resolution, actualDuration } = req.body;
    const team = await storage.getTicketTeam(ticketId);
    const myAssignment = team.find(m => m.userId === req.authUser!.id);
    if (!myAssignment) return sendError(res, "Anda tidak terdaftar di tim tiket ini", 403);
    if (!myAssignment.checkInAt) return sendError(res, "Belum check-in");
    // Update team member
    await storage.updateTicketTeamMember(myAssignment.id, { checkOutAt: new Date().toISOString(), checkOutLat: lat, checkOutLng: lng });
    // Log GPS event
    await storage.addTicketGpsLog({ ticketId, userId: req.authUser!.id, event: "check_out", lat: lat || 0, lng: lng || 0, timestamp: new Date().toISOString() });
    // If lead tech, mark ticket as resolved
    if (myAssignment.role === "lead") {
      const updates: any = { status: "resolved", resolvedAt: new Date().toISOString() };
      if (resolution) updates.resolution = resolution;
      if (actualDuration) updates.actualDuration = actualDuration;
      await storage.updateTicket(ticketId, updates);
      await storage.createTicketActivity({ ticketId, userId: req.authUser!.id, type: "status_change",
        content: JSON.stringify({ from: "in_progress", to: "resolved", action: "check_out" }), createdAt: new Date().toISOString() });
    }
    sendSuccess(res, { checkedOut: true, isLead: myAssignment.role === "lead" });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- Evidence --
router.get("/api/tickets/:id/evidence", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const evidence = await storage.getTicketEvidence(Number(req.params.id));
    sendSuccess(res, evidence);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/tickets/:id/evidence", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const { type, photoData, lat, lng, notes } = req.body;
    if (!type) return sendError(res, "Type wajib diisi");
    const evidence = await storage.addTicketEvidence({
      ticketId: Number(req.params.id), type, photoData: photoData || null,
      lat, lng, capturedAt: new Date().toISOString(), capturedBy: req.authUser!.id, notes,
    });
    sendSuccess(res, { id: evidence.id }, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- GPS Log --
router.post("/api/tickets/:id/gps", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const { event, lat, lng } = req.body;
    const log = await storage.addTicketGpsLog({
      ticketId: Number(req.params.id), userId: req.authUser!.id,
      event: event || "location_update", lat, lng, timestamp: new Date().toISOString(),
    });
    sendSuccess(res, log, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/tickets/:id/gps", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const logs = await storage.getTicketGpsLogs(Number(req.params.id));
    sendSuccess(res, logs);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- MTTR --
router.get("/api/tickets/:id/mttr", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const mttr = await storage.getTicketMTTR(Number(req.params.id));
    sendSuccess(res, mttr);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- Checklist Update --
router.put("/api/tickets/:id/checklist", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const { checklist } = req.body; // JSON array
    const ticket = await storage.updateTicket(Number(req.params.id), { checklist: JSON.stringify(checklist) } as any);
    sendSuccess(res, ticket);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ===========================================================
//  v4.2.4: WORKFLOW STAGES - Per-kategori flexible workflow
// ===========================================================

/** GET /api/tickets/:id/workflow - return workflow stages + current stage + per-stage durations
 * v4.2.18 (C.1): SLA countdown sekarang aware pause/hold:
 *   - totalPauseSec = sum of (endedAt - startedAt) untuk semua pauses (active dihitung sampai now)
 *   - effectiveDeadline = slaDeadline + totalPauseSec  (deadline geser sebanyak waktu pause)
 *   - kalau on-hold, slaRemainingSec di-freeze (pakai freeze state saat pause mulai)
 */
router.get("/api/tickets/:id/workflow", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const id = Number(req.params.id);
    const ticket = await storage.getTicket(id);
    if (!ticket) return sendError(res, "Tiket tidak ditemukan", 404);
    const category = ticket.categoryId ? await storage.getTicketCategory(ticket.categoryId) : null;
    const stages = storage.getCategoryWorkflowStages(category);
    const transitions = await storage.getTicketStageDurations(id);

    // v4.2.18 (C.1): SLA pause-aware calculation
    const totalPauseSec = await storage.getTotalPauseDuration(id);
    const activePause = await storage.getActivePause(id);
    const isOnHold = !!activePause;

    // v4.2.18 (C.3): Business hours awareness - out-of-hours time auto-pause SLA
    const bhCfg = await storage.getBusinessHoursConfig();
    const { getOutOfHoursMs } = await import("./business-hours.js");

    let slaRemainingSec: number | null = null;
    let slaOverdue = false;
    let effectiveDeadline: string | null = ticket.slaDeadline ?? null;
    let outOfHoursSec = 0;

    if (ticket.slaDeadline) {
      const originalDeadlineMs = new Date(ticket.slaDeadline).getTime();
      const ticketCreatedMs = ticket.createdAt ? new Date(ticket.createdAt).getTime() : Date.now();
      // Total elapsed pause (manual hold)
      const pauseShiftMs = totalPauseSec * 1000;
      // Out-of-hours antara created → original-deadline+pauseShift (rough proxy untuk skip OOH)
      // Simpler: OOH antara created → now (sampai sekarang).
      const oohMs = bhCfg.enabled ? getOutOfHoursMs(ticketCreatedMs, Date.now(), bhCfg) : 0;
      outOfHoursSec = Math.round(oohMs / 1000);
      // Effective deadline = original + manual pause + out-of-hours (skipped)
      const effectiveDeadlineMs = originalDeadlineMs + pauseShiftMs + oohMs;
      effectiveDeadline = new Date(effectiveDeadlineMs).toISOString();

      if (isOnHold) {
        // Freeze countdown saat hold
        const pauseStartedMs = new Date(activePause.startedAt).getTime();
        const closedPausesSec = totalPauseSec - Math.max(0, Math.round((Date.now() - pauseStartedMs) / 1000));
        const oohUntilHoldMs = bhCfg.enabled ? getOutOfHoursMs(ticketCreatedMs, pauseStartedMs, bhCfg) : 0;
        const frozenDeadlineMs = originalDeadlineMs + closedPausesSec * 1000 + oohUntilHoldMs;
        const remaining = (frozenDeadlineMs - pauseStartedMs) / 1000;
        slaRemainingSec = Math.round(remaining);
        slaOverdue = remaining < 0;
      } else {
        // v4.2.18 (C.3): kalau sekarang di luar jam kerja → freeze juga
        const isInBusinessHour = !bhCfg.enabled || (await import("./business-hours.js")).isBusinessHour(Date.now(), bhCfg);
        if (!isInBusinessHour) {
          // Hitung remaining sebagai kalau sekarang masih di business hour terakhir
          // Untuk simplicity, freeze ke effectiveDeadline - now (akumulasi OOH terus naik)
          const remaining = (effectiveDeadlineMs - Date.now()) / 1000;
          slaRemainingSec = Math.round(remaining);
          slaOverdue = remaining < 0;
        } else {
          const remaining = (effectiveDeadlineMs - Date.now()) / 1000;
          slaRemainingSec = Math.round(remaining);
          slaOverdue = remaining < 0;
        }
      }
    }

    sendSuccess(res, {
      currentStage: ticket.currentStage,
      stageEnteredAt: ticket.stageEnteredAt,
      stages,
      transitions,
      slaDeadline: ticket.slaDeadline,
      effectiveSlaDeadline: effectiveDeadline,
      slaRemainingSec,
      slaOverdue,
      isOnHold,
      activePause: activePause ? {
        id: activePause.id,
        reason: activePause.reason,
        note: activePause.note,
        startedAt: activePause.startedAt,
      } : null,
      totalPauseSec,
      outOfHoursSec,
      businessHoursEnabled: !!bhCfg.enabled,
    });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/**
 * v4.2.18 (D.4): GET /api/tickets/:id/bast - return HTML BAST untuk preview/print.
 * BAST = Berita Acara Serah Terima. Browser bisa "Print → Save as PDF" untuk simpan.
 */
router.get("/api/tickets/:id/bast", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const id = Number(req.params.id);
    const ticket = await storage.getTicket(id);
    if (!ticket) return sendError(res, "Ticket not found", 404);
    if (ticket.status !== "resolved" && ticket.status !== "closed") {
      return sendError(res, "BAST hanya bisa di-generate untuk tiket yang sudah resolved/closed");
    }
    const customer = ticket.customerId ? await storage.getCustomer(ticket.customerId) : null;
    const category = ticket.categoryId ? await storage.getTicketCategory(ticket.categoryId) : null;
    const team = await storage.getTicketTeam(id);
    const lead = team.find(m => m.role === "lead");
    const helpers = team.filter(m => m.role !== "lead");
    let materialList: any[] = [];
    try {
      if (ticket.materialUsed) materialList = JSON.parse(ticket.materialUsed);
    } catch {}

    const bastNumber = ticket.bastNumber ?? `BAST/${new Date().getFullYear()}/${id}`;
    const resolutionCodeLabel = (() => {
      const map: Record<string, string> = {
        FIBER_REPAIR: "Perbaikan Fiber Optik",
        ONT_REPLACE: "Ganti / Reset ONT",
        CONNECTOR_REPLACE: "Ganti Konektor / Pigtail",
        CABLE_REROUTE: "Re-route Kabel / Reposisi Drop",
        CONFIG_CHANGE: "Konfigurasi Ulang",
        CUSTOMER_SIDE: "Masalah Sisi Pelanggan",
        NO_ISSUE_FOUND: "Tidak Ditemukan Kerusakan",
        OTHER: "Lainnya",
      };
      return map[ticket.resolutionCode ?? ""] ?? ticket.resolutionCode ?? "-";
    })();

    const fmtDate = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

    const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>BAST ${bastNumber}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.55; color: #0f172a; }
  .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 14px; }
  .header h1 { margin: 0; font-size: 16pt; }
  .header .subtitle { color: #475569; font-size: 9pt; margin-top: 4px; }
  .meta { display: flex; justify-content: space-between; margin: 14px 0; font-size: 10pt; }
  .meta-row { display: grid; grid-template-columns: 130px 8px 1fr; gap: 4px; padding: 2px 0; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 10pt; }
  table th, table td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
  table th { background: #f1f5f9; }
  .signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 28px; }
  .signature-box { text-align: center; }
  .signature-box .label { font-size: 9pt; margin-bottom: 60px; }
  .signature-box .name { border-top: 1px solid #0f172a; padding-top: 4px; font-weight: bold; }
  .footer { margin-top: 24px; font-size: 8pt; color: #64748b; text-align: center; }
  @media print { .no-print { display: none; } }
  .no-print { background: #f59e0b; color: white; padding: 8px 12px; border-radius: 6px; margin-bottom: 14px; font-size: 10pt; }
  .no-print button { background: white; color: #f59e0b; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; margin-left: 10px; font-weight: bold; }
</style>
</head>
<body>
  <div class="no-print"> Tip: Tekan <strong>Ctrl/Cmd + P</strong> untuk print atau Save as PDF. <button onclick="window.print()">Print Sekarang</button></div>

  <div class="header">
    <h1>BERITA ACARA SERAH TERIMA</h1>
    <div class="subtitle">JABNET - Layanan Internet Fiber-to-the-Home</div>
    <div style="font-size: 10pt; margin-top: 6px;"><strong>${bastNumber}</strong></div>
  </div>

  <p>Pada hari ini, telah dilaksanakan pekerjaan teknis dengan rincian sebagai berikut:</p>

  <div style="margin: 12px 0;">
    <div class="meta-row"><span><strong>No. Tiket</strong></span><span>:</span><span>${ticket.ticketNumber}</span></div>
    <div class="meta-row"><span><strong>Kategori</strong></span><span>:</span><span>${category?.name ?? "-"}</span></div>
    <div class="meta-row"><span><strong>Tanggal Diterima</strong></span><span>:</span><span>${fmtDate(ticket.createdAt)}</span></div>
    <div class="meta-row"><span><strong>Tanggal Selesai</strong></span><span>:</span><span>${fmtDate(ticket.resolvedAt)}</span></div>
    <div class="meta-row"><span><strong>Pelanggan</strong></span><span>:</span><span>${customer?.name ?? "-"} ${customer?.customerId ? `(${customer.customerId})` : ""}</span></div>
    <div class="meta-row"><span><strong>Alamat</strong></span><span>:</span><span>${ticket.address ?? customer?.address ?? "-"}</span></div>
  </div>

  <div style="margin: 14px 0;">
    <div style="font-weight: bold; margin-bottom: 4px;">A. Deskripsi Pekerjaan</div>
    <div style="padding-left: 16px;">${ticket.title ?? ""}<br/>${(ticket.description ?? "").replace(/\n/g, "<br/>")}</div>
  </div>

  <div style="margin: 14px 0;">
    <div style="font-weight: bold; margin-bottom: 4px;">B. Tindakan & Solusi</div>
    <div class="meta-row"><span><strong>Kode Resolusi</strong></span><span>:</span><span>${resolutionCodeLabel}</span></div>
    <div style="padding-left: 16px; margin-top: 4px;">${(ticket.resolution ?? "-").replace(/\n/g, "<br/>")}</div>
  </div>

  ${materialList.length > 0 ? `
  <div style="margin: 14px 0;">
    <div style="font-weight: bold; margin-bottom: 4px;">C. Material yang Digunakan</div>
    <table>
      <thead>
        <tr><th style="width: 40px;">No</th><th>Material</th><th style="width: 80px;">Qty</th><th style="width: 60px;">Unit</th></tr>
      </thead>
      <tbody>
        ${materialList.map((m: any, i: number) => `
          <tr><td>${i + 1}</td><td>${m.name ?? ""}</td><td>${m.qty ?? 0}</td><td>${m.unit ?? ""}</td></tr>
        `).join("")}
      </tbody>
    </table>
  </div>
  ` : ""}

  <div style="margin: 14px 0;">
    <div style="font-weight: bold; margin-bottom: 4px;">D. Tim Pelaksana</div>
    <div class="meta-row"><span><strong>Lead Teknisi</strong></span><span>:</span><span>${(lead as any)?.userName ?? "-"}</span></div>
    ${helpers.length > 0 ? `<div class="meta-row"><span><strong>Helper</strong></span><span>:</span><span>${helpers.map(h => (h as any).userName ?? "-").join(", ")}</span></div>` : ""}
  </div>

  <p style="margin-top: 18px;">Demikian Berita Acara Serah Terima ini dibuat dengan sebenar-benarnya untuk dapat dipergunakan sebagaimana mestinya.</p>

  <div class="signature-grid">
    <div class="signature-box">
      <div class="label">Pelanggan,</div>
      <div class="name">${customer?.name ?? "________________________"}</div>
    </div>
    <div class="signature-box">
      <div class="label">Teknisi JABNET,</div>
      <div class="name">${(lead as any)?.userName ?? "________________________"}</div>
    </div>
  </div>

  <div class="footer">
    Dokumen di-generate otomatis dari sistem JABNET Workspace · ${new Date().toLocaleDateString("id-ID")}
  </div>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/tickets/:id/advance-stage - teknisi advance ke stage berikutnya */
router.post("/api/tickets/:id/advance-stage", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const id = Number(req.params.id);
    const { toStage, note, evidenceId, lat, lng, metadata, forceAdvance,
      resolutionCode, resolution, materialUsed,
    } = req.body || {};
    // Authorization: hanya team member atau admin yang bisa advance
    const team = await storage.getTicketTeam(id);
    const isMember = team.some(m => m.userId === req.authUser!.id);
    const isAdmin = req.authUser.role === "System-Admin"
                 || req.authUser.role === "Admin"
                 || req.authUser.role === "Administrator" // legacy
                 || req.authUser.role === "admin"
                 || req.authUser.isSystemAdmin;
    if (!isMember && !isAdmin) {
      return sendError(res, "Hanya teknisi yang assigned atau admin bisa advance stage", 403);
    }
    const updated = await storage.advanceTicketStage(id, req.authUser.id, {
      toStage: toStage ?? null,
      note,
      evidenceId: evidenceId ?? null,
      lat: lat ?? null,
      lng: lng ?? null,
      metadata: metadata ?? null,
      forceAdvance: !!forceAdvance && isAdmin, // hanya admin bisa force
    });
    // v4.2.18 (D): Persist resolution code + material used kalau stage final
    if (resolutionCode || resolution || materialUsed) {
      const updates: any = { updatedAt: new Date().toISOString() };
      if (resolutionCode) updates.resolutionCode = resolutionCode;
      if (resolution) updates.resolution = resolution;
      if (Array.isArray(materialUsed) && materialUsed.length > 0) {
        updates.materialUsed = JSON.stringify(materialUsed);
      }
      // Auto-generate BAST number kalau resolved
      if (updated.status === "resolved" || updated.status === "closed") {
        const ts = new Date();
        const bastNumber = `BAST/${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, "0")}/${id}`;
        updates.bastNumber = bastNumber;
      }
      await storage.updateTicket(id, updates);
    }
    // GPS log kalau ada
    if (lat != null && lng != null) {
      await storage.addTicketGpsLog({
        ticketId: id, userId: req.authUser.id, event: "stage_advance",
        lat, lng, timestamp: new Date().toISOString(),
      });
    }
    // v4.2.18 (A.3): structured activity log
    await logTicketActivity(req, id, "stage.completed", {
      toStage: updated.currentStage, fromStage: toStage, evidenceId, hasNote: !!note?.trim(),
      metadata: metadata ?? null, status: updated.status,
      resolutionCode: resolutionCode ?? null,
      materialCount: Array.isArray(materialUsed) ? materialUsed.length : 0,
    }, `Stage advance → ${updated.currentStage}${note ? `: ${note.slice(0, 50)}` : ""}`);
    await logAudit(req, "UPDATE", "ticket", id, `stage → ${updated.currentStage}`);
    sendSuccess(res, updated);
  } catch (e: any) {
    // v4.2.18 (P1.3): structured 422 untuk validation error
    if (e.code === "VALIDATION_FAILED") {
      return res.status(422).json({
        success: false,
        error: e.message,
        code: "VALIDATION_FAILED",
        stage: e.stage,
        stageLabel: e.stageLabel,
        missingFields: e.missingFields,
      });
    }
    sendError(res, e.message, 400);
  }
});

/**
 * v4.2.7: PUT /api/tickets/:id/stages/:stageKey/transition - edit existing closed stage transition.
 * Buat teknisi koreksi data setelah submit (mis: ketik numeric salah, foto salah).
 * Tidak ubah durasi atau stage flow - cuma update note + evidence + lat/lng + metadata.
 */
router.put("/api/tickets/:id/stages/:stageKey/transition", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const id = Number(req.params.id);
    const stageKey = String(req.params.stageKey);
    const { note, evidenceId, lat, lng, metadata } = req.body || {};
    // Authorization same as advance: team member atau admin
    const team = await storage.getTicketTeam(id);
    const isMember = team.some(m => m.userId === req.authUser!.id);
    const isAdmin = req.authUser.role === "System-Admin"
                 || req.authUser.role === "Admin"
                 || req.authUser.role === "Administrator" // legacy
                 || req.authUser.role === "admin"
                 || req.authUser.isSystemAdmin;
    if (!isMember && !isAdmin) {
      return sendError(res, "Hanya teknisi yang assigned atau admin bisa edit stage", 403);
    }
    const result = await storage.updateStageTransition(id, stageKey, {
      note: note ?? undefined,
      evidenceId: evidenceId ?? undefined,
      lat: lat ?? undefined,
      lng: lng ?? undefined,
      metadata: metadata ?? undefined,
    }, req.authUser.id);
    if (!result.success) {
      return sendError(res, "Stage transition tidak ditemukan atau belum closed", 404);
    }
    await logAudit(req, "UPDATE", "ticket", id, `stage edit: ${stageKey}`);
    sendSuccess(res, result.transition);
  } catch (e: any) { sendError(res, e.message, 400); }
});

/** GET /api/tickets/:id/stage-transitions - full history per stage */
router.get("/api/tickets/:id/stage-transitions", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const id = Number(req.params.id);
    const transitions = await storage.getTicketStageDurations(id);
    sendSuccess(res, transitions);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** v4.2.18 (P1.4): GET /api/tickets/:id/stage-edit-history - edit log per field per stage */
router.get("/api/tickets/:id/stage-edit-history", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const id = Number(req.params.id);
    const stageKey = req.query.stage ? String(req.query.stage) : undefined;
    const logs = await storage.getStageEditHistory(id, stageKey);
    sendSuccess(res, logs);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ===========================================================
//  v4.2.18 (B.6): TICKET COMMENTS - internal chat
// ===========================================================

router.get("/api/tickets/:id/comments", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const comments = await storage.getTicketComments(Number(req.params.id));
    sendSuccess(res, comments);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/tickets/:id/comments", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const id = Number(req.params.id);
    const { content, mentions, isInternal, attachmentUrl } = req.body || {};
    if (!content?.trim()) return sendError(res, "Konten komentar wajib diisi");
    const comment = await storage.createTicketComment({
      ticketId: id,
      authorId: req.authUser.id,
      content: content.trim(),
      mentions: Array.isArray(mentions) ? mentions : undefined,
      isInternal: isInternal !== false,
      attachmentUrl: attachmentUrl ?? null,
    });
    // Activity log
    await logTicketActivity(req, id, "comment.added", {
      commentId: comment.id, length: content.length, mentions: mentions ?? [], isInternal: isInternal !== false,
    }, content.slice(0, 100));
    // Notify mentioned users
    if (Array.isArray(mentions)) {
      for (const userId of mentions) {
        if (userId !== req.authUser.id) {
          try {
            await storage.createNotification({
              userId, type: "ticket_mention",
              title: `Anda di-mention di tiket`,
              message: content.slice(0, 100),
              link: `/work/${id}`,
              entityType: "ticket", entityId: id,
              fromUserId: req.authUser.id,
            });
          } catch {}
        }
      }
    }
    sendSuccess(res, comment, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.delete("/api/tickets/:id/comments/:commentId", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const ticketId = Number(req.params.id);
    const commentId = Number(req.params.commentId);
    await storage.deleteTicketComment(commentId);
    await logTicketActivity(req, ticketId, "comment.deleted", { commentId });
    sendSuccess(res, { deleted: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ===========================================================
//  v4.2.18 (B.7 + C.1): HOLD / RESUME / ESCALATE / CANCEL
// ===========================================================

router.post("/api/tickets/:id/hold", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const id = Number(req.params.id);
    const { reason, note } = req.body || {};
    const validReasons = ["WAIT_CUSTOMER", "WAIT_MATERIAL", "WAIT_3RD_PARTY", "OUT_OF_HOURS", "OTHER"];
    if (!reason || !validReasons.includes(reason)) {
      return sendError(res, `reason wajib diisi (${validReasons.join("|")})`);
    }
    const ticket = await storage.getTicket(id);
    if (!ticket) return sendError(res, "Tiket tidak ditemukan", 404);
    // Start pause
    const pause = await storage.startTicketPause({ ticketId: id, reason, note, userId: req.authUser.id });
    // Set status ke pending (semantically "on hold")
    await storage.updateTicket(id, { status: "pending" } as any);
    await logTicketActivity(req, id, "ticket.held", {
      pauseId: pause.id, reason, note, previousStatus: ticket.status,
    }, `Hold: ${reason}${note ? ` - ${note}` : ""}`);
    sendSuccess(res, pause);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/tickets/:id/resume", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const id = Number(req.params.id);
    const pause = await storage.endTicketPause(id, req.authUser.id);
    if (!pause) return sendError(res, "Tiket tidak sedang hold", 400);
    // Resume status - kembali ke in_progress kalau ada team, kalau tidak assigned
    const team = await storage.getTicketTeam(id);
    const newStatus = team.length > 0 ? "in_progress" : "assigned";
    await storage.updateTicket(id, { status: newStatus } as any);
    const durationSec = pause.endedAt && pause.startedAt
      ? Math.round((new Date(pause.endedAt).getTime() - new Date(pause.startedAt).getTime()) / 1000) : 0;
    await logTicketActivity(req, id, "ticket.resumed", {
      pauseId: pause.id, durationSec, reason: pause.reason,
    }, `Resume setelah hold ${Math.round(durationSec / 60)} menit`);
    sendSuccess(res, { resumed: true, pause });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/tickets/:id/pauses", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const id = Number(req.params.id);
    const pauses = await storage.getTicketPauses(id);
    const active = await storage.getActivePause(id);
    const totalSec = await storage.getTotalPauseDuration(id);
    sendSuccess(res, { pauses, activePause: active, totalPauseSec: totalSec });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/tickets/:id/escalate", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const id = Number(req.params.id);
    const { note, raisePriority } = req.body || {};
    const ticket = await storage.getTicket(id);
    if (!ticket) return sendError(res, "Tiket tidak ditemukan", 404);
    const updates: any = {};
    let newPriority = ticket.priority;
    if (raisePriority) {
      const priorityRank: any = { low: 1, medium: 2, high: 3, urgent: 4 };
      const current = priorityRank[ticket.priority || "medium"] ?? 2;
      const next = Math.min(current + 1, 4);
      newPriority = ["", "low", "medium", "high", "urgent"][next];
      updates.priority = newPriority;
    }
    if (Object.keys(updates).length > 0) await storage.updateTicket(id, updates);
    // Notify supervisors via Telegram
    try {
      const { notifyRolesTelegram } = await import("./telegram.js");
      await notifyRolesTelegram(["System-Admin", "Admin", "Administrator", "admin", "Supervisor"], "ticket_escalation",
        ` *ESCALATION: ${ticket.ticketNumber}*\n\n${ticket.title}\n\nDari: ${req.authUser.name}\nCatatan: ${note || "(tanpa catatan)"}`);
    } catch (e: any) { console.warn("[Escalate] telegram fail:", e.message); }
    await logTicketActivity(req, id, "ticket.escalated", {
      note, raisedPriority: raisePriority ? newPriority : null,
    }, `Escalate ke supervisor${raisePriority ? ` (priority → ${newPriority})` : ""}`);
    sendSuccess(res, { escalated: true, newPriority });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/tickets/:id/cancel", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const id = Number(req.params.id);
    const { reason } = req.body || {};
    if (!reason?.trim()) return sendError(res, "Alasan cancel wajib diisi");
    const ticket = await storage.getTicket(id);
    if (!ticket) return sendError(res, "Tiket tidak ditemukan", 404);
    if (ticket.status === "resolved" || ticket.status === "closed") {
      return sendError(res, "Tiket sudah selesai/closed, tidak bisa cancel");
    }
    await storage.updateTicket(id, {
      status: "cancelled",
      resolvedAt: new Date().toISOString(),
      closedAt: new Date().toISOString(),
      resolution: `[CANCELLED] ${reason}`,
    } as any);
    await logTicketActivity(req, id, "ticket.cancelled", {
      reason, previousStatus: ticket.status,
    }, `Cancel: ${reason}`);
    sendSuccess(res, { cancelled: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** GET /api/odps/:id/active-tickets - duplicate detection saat create tiket di ODP */
router.get("/api/odps/:id/active-tickets", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const odpId = Number(req.params.id);
    const tickets = await storage.getActiveTicketsAtOdp(odpId);
    const patterns = await storage.getOdpResolutionPatterns(odpId, 5);
    sendSuccess(res, { activeTickets: tickets, resolutionPatterns: patterns });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ===========================================================
//  v4.2.5: TICKET CHECKPOINTS - Action-based simplified workflow
// ===========================================================

/** POST /api/tickets/:id/checkpoint - teknisi log action checkpoint */
router.post("/api/tickets/:id/checkpoint", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const ticketId = Number(req.params.id);
    const { action, note, evidenceId, lat, lng, metadata } = req.body || {};
    if (!action) return sendError(res, "action wajib (depart|arrive|start_work|progress|pause|resume|escalate|complete|note)");

    // Authorization: hanya team member atau admin
    const team = await storage.getTicketTeam(ticketId);
    const isMember = team.some(m => m.userId === req.authUser!.id);
    const isAdmin = req.authUser.role === "System-Admin"
                 || req.authUser.role === "Admin"
                 || req.authUser.role === "Administrator" // legacy
                 || req.authUser.role === "admin"
                 || req.authUser.isSystemAdmin;
    if (!isMember && !isAdmin) {
      return sendError(res, "Hanya teknisi assigned atau admin yang boleh log checkpoint", 403);
    }

    const checkpoint = await storage.addTicketCheckpoint({
      ticketId, action, byUserId: req.authUser.id, note, evidenceId, lat, lng, metadata,
    });

    // GPS log
    if (lat != null && lng != null) {
      await storage.addTicketGpsLog({
        ticketId, userId: req.authUser.id, event: action,
        lat, lng, timestamp: new Date().toISOString(),
      });
    }

    // Side effects: notify Chatwoot for important actions, resolve flow
    try {
      const { notifyChatwootCheckpoint, notifyChatwootTicketResolved } = await import("./chatwoot.js");
      if (action === "complete") {
        await notifyChatwootTicketResolved(ticketId);
      } else {
        await notifyChatwootCheckpoint(ticketId, action, req.authUser.username);
      }
    } catch (e: any) { console.warn("[Checkpoint] chatwoot notify:", e.message); }

    await logAudit(req, "UPDATE", "ticket", ticketId, `checkpoint: ${action}`);
    sendSuccess(res, checkpoint);
  } catch (e: any) { sendError(res, e.message, 400); }
});

/** GET /api/tickets/:id/timeline - chronological feed: checkpoints + activities + time metrics */
router.get("/api/tickets/:id/timeline", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const ticketId = Number(req.params.id);
    const checkpoints = await storage.getTicketCheckpoints(ticketId);
    const metrics = await storage.getTicketTimeMetrics(ticketId);
    sendSuccess(res, { checkpoints, metrics });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ===========================================================
//  v4.2.5: CHATWOOT INTEGRATION
// ===========================================================

/** GET /api/integrations/chatwoot/config - admin only */
router.get("/api/integrations/chatwoot/config", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "chatwoot_settings")) return sendError(res, "Akses ditolak", 403);
  try {
    const config = await storage.getChatwootConfig();
    // Mask api_access_token + webhook_secret di response (cuma show last 4 chars)
    const masked = config ? {
      ...config,
      apiAccessToken: config.apiAccessToken ? `••••${config.apiAccessToken.slice(-4)}` : null,
      webhookSecret: config.webhookSecret ? `••••${config.webhookSecret.slice(-4)}` : null,
    } : null;
    const rules = await storage.listChatwootKeywordRules();
    sendSuccess(res, { config: masked, rules, hasToken: !!config?.apiAccessToken, hasSecret: !!config?.webhookSecret });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** GET /api/integrations/chatwoot/status - status ringan untuk badge + tombol "Buka di Chatwoot".
 *  Tidak pernah mengembalikan token. Gated by `chatwoot` (read) supaya non-admin pun bisa pakai tombol. */
router.get("/api/integrations/chatwoot/status", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "chatwoot")) return sendError(res, "Akses ditolak", 403);
  try {
    const config = await storage.getChatwootConfig();
    const enabled = !!config?.enabled;
    const accountId = config?.accountId ? Number(config.accountId) : null;
    const configured = enabled && !!config?.baseUrl && accountId != null && !!config?.apiAccessToken;
    sendSuccess(res, { enabled, configured, baseUrl: config?.baseUrl ?? null, accountId });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** Communications (read) - Batch 2a. All gated by `chatwoot` (read), tenant-scoped via account token. */
router.get("/api/integrations/chatwoot/inboxes", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "chatwoot")) return sendError(res, "Akses ditolak", 403);
  try {
    const { listInboxes } = await import("./chatwoot.js");
    const { mapInbox } = await import("../shared/chatwootMappers.js");
    const inboxes = (await listInboxes()).map(mapInbox);
    sendSuccess(res, { inboxes });
  } catch (e: any) {
    if (String(e.message).includes("belum terkonfigurasi")) return sendSuccess(res, { inboxes: [] });
    sendError(res, e.message, 500);
  }
});

router.get("/api/integrations/chatwoot/canned-responses", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "chatwoot")) return sendError(res, "Akses ditolak", 403);
  try {
    const { listCannedResponses } = await import("./chatwoot.js");
    const { mapCannedResponse } = await import("../shared/chatwootMappers.js");
    const cannedResponses = (await listCannedResponses()).map(mapCannedResponse);
    sendSuccess(res, { cannedResponses });
  } catch (e: any) {
    if (String(e.message).includes("belum terkonfigurasi")) return sendSuccess(res, { cannedResponses: [] });
    sendError(res, e.message, 500);
  }
});

router.get("/api/integrations/chatwoot/conversations", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "chatwoot")) return sendError(res, "Akses ditolak", 403);
  try {
    const { listConversations } = await import("./chatwoot.js");
    const { mapConversationsPage } = await import("../shared/chatwootMappers.js");
    const inboxId = req.query.inboxId ? Number(req.query.inboxId) : undefined;
    const status = req.query.status ? String(req.query.status) : undefined;
    const page = req.query.page ? Number(req.query.page) : 1;
    const raw = await listConversations({ inboxId, status, page });
    sendSuccess(res, mapConversationsPage(raw));
  } catch (e: any) {
    if (String(e.message).includes("belum terkonfigurasi")) return sendSuccess(res, { conversations: [], meta: { count: 0, currentPage: 1 } });
    sendError(res, e.message, 500);
  }
});

router.get("/api/integrations/chatwoot/conversations/:id/messages", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "chatwoot")) return sendError(res, "Akses ditolak", 403);
  try {
    const { listConversationMessages } = await import("./chatwoot.js");
    const { mapMessage } = await import("../shared/chatwootMappers.js");
    const before = req.query.before ? Number(req.query.before) : undefined;
    const raw = await listConversationMessages(String(req.params.id), before);
    const messages = raw.map(mapMessage).sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
    sendSuccess(res, { messages, hasMore: raw.length >= 20 });
  } catch (e: any) {
    if (String(e.message).includes("belum terkonfigurasi")) return sendSuccess(res, { messages: [], hasMore: false });
    sendError(res, e.message, 500);
  }
});

router.get("/api/integrations/chatwoot/customers/:id/conversations", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "chatwoot")) return sendError(res, "Akses ditolak", 403);
  try {
    const customer = await storage.getCustomer(Number(req.params.id)); // tenant-scoped
    if (!customer) return sendError(res, "Pelanggan tidak ditemukan", 404);
    if (!customer.phone) return sendSuccess(res, { contactId: null, contactName: null, conversations: [] });
    const { searchContactByPhone, listContactConversations } = await import("./chatwoot.js");
    const { toWhatsappNumber } = await import("../shared/phone.js");
    const { mapConversation } = await import("../shared/chatwootMappers.js");
    const contact = await searchContactByPhone(customer.phone, toWhatsappNumber);
    if (!contact) return sendSuccess(res, { contactId: null, contactName: null, conversations: [] });
    const convs = (await listContactConversations(contact.id)).map(mapConversation);
    sendSuccess(res, { contactId: Number(contact.id), contactName: contact.name ?? null, conversations: convs });
  } catch (e: any) {
    if (String(e.message).includes("belum terkonfigurasi")) return sendSuccess(res, { contactId: null, contactName: null, conversations: [] });
    sendError(res, e.message, 500);
  }
});

/** Contact sync (Batch 2b) - manual. Gated `chatwoot` write. Workspace → Chatwoot upsert. */
router.post("/api/integrations/chatwoot/customers/:id/sync", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "chatwoot")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const customer = await storage.getCustomer(Number(req.params.id)); // tenant-scoped
    if (!customer) return sendError(res, "Pelanggan tidak ditemukan", 404);
    const { upsertChatwootContact } = await import("./chatwoot.js");
    const { toWhatsappNumber } = await import("../shared/phone.js");
    const { buildChatwootContactPayload, buildChatwootContactLabels } = await import("../shared/chatwootContact.js");
    const tenant = String(req.authUser.activeMitraId ?? 1);
    const result = await upsertChatwootContact(customer as any, {
      tenant, normalize: toWhatsappNumber, buildPayload: buildChatwootContactPayload, buildLabels: buildChatwootContactLabels,
    });
    await storage.updateCustomerChatwootLink(customer.id, String(result.contactId), new Date().toISOString());
    await storage.createAuditLog({
      userId: req.authUser.id, username: req.authUser.username, userName: req.authUser.name,
      action: "UPDATE", entityType: "chatwoot_contact_sync", entityId: customer.id, entityName: customer.name,
      details: JSON.stringify({ contactId: result.contactId, action: result.action }), createdAt: new Date().toISOString(),
    } as any);
    sendSuccess(res, result);
  } catch (e: any) {
    if (String(e.message).includes("belum terkonfigurasi")) return sendError(res, "Chatwoot belum dikonfigurasi", 400);
    sendError(res, e.message, 500);
  }
});

router.post("/api/integrations/chatwoot/contacts/sync-bulk", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "chatwoot")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const ids: number[] = Array.isArray(req.body?.customerIds) ? req.body.customerIds.slice(0, 200).map(Number) : [];
    if (!ids.length) return sendError(res, "customerIds kosong", 400);
    // Pre-check: kalau Chatwoot belum dikonfigurasi, gagalkan cepat (400) - jangan loop 200x error.
    const cwConfig = await storage.getChatwootConfig();
    if (!cwConfig?.enabled || !cwConfig.accountId || !cwConfig.apiAccessToken) return sendError(res, "Chatwoot belum dikonfigurasi", 400);
    const { upsertChatwootContact } = await import("./chatwoot.js");
    const { toWhatsappNumber } = await import("../shared/phone.js");
    const { buildChatwootContactPayload, buildChatwootContactLabels } = await import("../shared/chatwootContact.js");
    const tenant = String(req.authUser.activeMitraId ?? 1);
    const results: any[] = [];
    let synced = 0, failed = 0;
    for (const id of ids) {
      try {
        const customer = await storage.getCustomer(id);
        if (!customer) { results.push({ customerId: id, ok: false, error: "not found" }); failed++; continue; }
        const r = await upsertChatwootContact(customer as any, { tenant, normalize: toWhatsappNumber, buildPayload: buildChatwootContactPayload, buildLabels: buildChatwootContactLabels });
        await storage.updateCustomerChatwootLink(customer.id, String(r.contactId), new Date().toISOString());
        results.push({ customerId: id, ok: true, contactId: r.contactId, action: r.action }); synced++;
      } catch (e: any) { results.push({ customerId: id, ok: false, error: e.message }); failed++; }
    }
    await storage.createAuditLog({
      userId: req.authUser.id, username: req.authUser.username, userName: req.authUser.name,
      action: "UPDATE", entityType: "chatwoot_contact_sync_bulk", entityId: null, entityName: `${synced}/${ids.length}`,
      details: JSON.stringify({ synced, failed }), createdAt: new Date().toISOString(),
    } as any);
    sendSuccess(res, { results, synced, failed });
  } catch (e: any) {
    if (String(e.message).includes("belum terkonfigurasi")) return sendError(res, "Chatwoot belum dikonfigurasi", 400);
    sendError(res, e.message, 500);
  }
});

/** Agent mapping (Batch 2c). List = chatwoot read; set/clear = chatwoot_settings write. */
router.get("/api/integrations/chatwoot/agents", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "chatwoot")) return sendError(res, "Akses ditolak", 403);
  try {
    const { listAgents } = await import("./chatwoot.js");
    const { mapAgent, suggestAgentMatchesByEmail } = await import("../shared/chatwootAgent.js");
    const agents = (await listAgents()).map(mapAgent);
    const links = await storage.listChatwootAgentLinks();
    const memberIds = await storage.getUserIdsInMitra(req.authUser.activeMitraId ?? 1);
    const allUsers = await storage.getAllUsers();
    const users = allUsers.filter((u: any) => memberIds.has(u.id)).map((u: any) => ({ id: u.id, email: u.email ?? null }));
    const suggestions = suggestAgentMatchesByEmail(agents, users);
    sendSuccess(res, {
      agents,
      links: links.map((l) => ({ userId: l.userId, chatwootAgentId: l.chatwootAgentId, agentName: l.agentName })),
      suggestions,
    });
  } catch (e: any) {
    if (String(e.message).includes("belum terkonfigurasi")) return sendSuccess(res, { agents: [], links: [], suggestions: [] });
    sendError(res, e.message, 500);
  }
});

router.put("/api/integrations/chatwoot/users/:userId/agent", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "chatwoot_settings")) return sendError(res, "Akses ditolak (write)", 403);
  const userId = Number(req.params.userId);
  if (!(await requireUserInScope(req, res, userId))) return;
  try {
    const agentId = String(req.body?.agentId ?? "").trim();
    if (!agentId) return sendError(res, "agentId wajib", 400);
    const { listAgents } = await import("./chatwoot.js");
    const { mapAgent } = await import("../shared/chatwootAgent.js");
    const agent = (await listAgents()).map(mapAgent).find((a) => String(a.id) === agentId);
    if (!agent) return sendError(res, "Agent Chatwoot tidak ditemukan", 404);
    await storage.setChatwootAgentLink(userId, agentId, agent.name, agent.email);
    await storage.createAuditLog({
      userId: req.authUser.id, username: req.authUser.username, userName: req.authUser.name,
      action: "UPDATE", entityType: "chatwoot_agent_link", entityId: userId, entityName: agent.name,
      details: JSON.stringify({ chatwootAgentId: agentId }), createdAt: new Date().toISOString(),
    } as any);
    sendSuccess(res, { ok: true });
  } catch (e: any) {
    if (String(e.message).includes("belum terkonfigurasi")) return sendError(res, "Chatwoot belum dikonfigurasi", 400);
    sendError(res, e.message, 500);
  }
});

router.delete("/api/integrations/chatwoot/users/:userId/agent", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "chatwoot_settings")) return sendError(res, "Akses ditolak (write)", 403);
  const userId = Number(req.params.userId);
  if (!(await requireUserInScope(req, res, userId))) return;
  try {
    const removed = await storage.deleteChatwootAgentLink(userId);
    if (removed > 0) {
      await storage.createAuditLog({
        userId: req.authUser.id, username: req.authUser.username, userName: req.authUser.name,
        action: "DELETE", entityType: "chatwoot_agent_link", entityId: userId, entityName: null,
        details: null, createdAt: new Date().toISOString(),
      } as any);
    }
    sendSuccess(res, { ok: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** Reply ke conversation (Batch 2d) - outgoing atau private note. Gated `chatwoot` write. */
router.post("/api/integrations/chatwoot/conversations/:id/messages", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "chatwoot")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const content = String(req.body?.content ?? "").trim();
    if (!content) return sendError(res, "Pesan kosong", 400);
    const isPrivate = !!req.body?.private;
    const { sendChatwootMessage } = await import("./chatwoot.js");
    await sendChatwootMessage(String(req.params.id), content, "outgoing", isPrivate);
    const convId = Number(req.params.id);
    await storage.createAuditLog({
      userId: req.authUser.id, username: req.authUser.username, userName: req.authUser.name,
      action: "CREATE", entityType: "chatwoot_reply", entityId: Number.isFinite(convId) ? convId : null, entityName: null,
      details: JSON.stringify({ private: isPrivate }), createdAt: new Date().toISOString(),
    } as any);
    sendSuccess(res, { ok: true });
  } catch (e: any) {
    if (String(e.message).includes("belum terkonfigurasi")) return sendError(res, "Chatwoot belum dikonfigurasi", 400);
    sendError(res, e.message, 500);
  }
});

/** Kirim balasan + lampiran (Batch 2f). Gated `chatwoot` write. Klien kirim dataURL base64. */
router.post("/api/integrations/chatwoot/conversations/:id/messages-attachment", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "chatwoot")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const content = String(req.body?.content ?? "").trim();
    const isPrivate = !!req.body?.private;
    const attsRaw: any[] = Array.isArray(req.body?.attachments) ? req.body.attachments.slice(0, 5) : [];
    const files = attsRaw.map((a) => {
      const m = /^data:([^;]+);base64,(.+)$/.exec(String(a?.dataUrl ?? ""));
      if (!m) return null;
      return { buffer: Buffer.from(m[2], "base64"), filename: String(a?.filename ?? "lampiran"), contentType: m[1] };
    }).filter(Boolean) as { buffer: Buffer; filename: string; contentType: string }[];
    if (!files.length && !content) return sendError(res, "Pesan/lampiran kosong", 400);
    const { sendChatwootMessageMultipart } = await import("./chatwoot.js");
    await sendChatwootMessageMultipart(String(req.params.id), content, isPrivate, files);
    const convId = Number(req.params.id);
    await storage.createAuditLog({
      userId: req.authUser.id, username: req.authUser.username, userName: req.authUser.name,
      action: "CREATE", entityType: "chatwoot_reply", entityId: Number.isFinite(convId) ? convId : null, entityName: null,
      details: JSON.stringify({ private: isPrivate, attachments: files.length }), createdAt: new Date().toISOString(),
    } as any);
    sendSuccess(res, { ok: true });
  } catch (e: any) {
    if (String(e.message).includes("belum terkonfigurasi")) return sendError(res, "Chatwoot belum dikonfigurasi", 400);
    sendError(res, e.message, 500);
  }
});

/** Ubah status conversation (Batch 2e). Gated `chatwoot` write. */
router.post("/api/integrations/chatwoot/conversations/:id/status", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "chatwoot")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const status = String(req.body?.status ?? "");
    if (!["open", "pending", "resolved"].includes(status)) return sendError(res, "Status tidak valid", 400);
    const { setConversationStatus } = await import("./chatwoot.js");
    await setConversationStatus(String(req.params.id), status as any);
    const convId = Number(req.params.id);
    await storage.createAuditLog({
      userId: req.authUser.id, username: req.authUser.username, userName: req.authUser.name,
      action: "UPDATE", entityType: "chatwoot_conv_status", entityId: Number.isFinite(convId) ? convId : null, entityName: null,
      details: JSON.stringify({ status }), createdAt: new Date().toISOString(),
    } as any);
    sendSuccess(res, { ok: true });
  } catch (e: any) {
    if (String(e.message).includes("belum terkonfigurasi")) return sendError(res, "Chatwoot belum dikonfigurasi", 400);
    sendError(res, e.message, 500);
  }
});

/** Assign/unassign agent ke conversation (Batch 2e). Gated `chatwoot` write. */
router.post("/api/integrations/chatwoot/conversations/:id/assign", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "chatwoot")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const raw = req.body?.assigneeId;
    const assigneeId = raw == null || raw === "" ? null : Number(raw);
    const { assignConversation } = await import("./chatwoot.js");
    await assignConversation(String(req.params.id), assigneeId);
    const convId = Number(req.params.id);
    await storage.createAuditLog({
      userId: req.authUser.id, username: req.authUser.username, userName: req.authUser.name,
      action: "UPDATE", entityType: "chatwoot_conv_assign", entityId: Number.isFinite(convId) ? convId : null, entityName: null,
      details: JSON.stringify({ assigneeId }), createdAt: new Date().toISOString(),
    } as any);
    sendSuccess(res, { ok: true });
  } catch (e: any) {
    if (String(e.message).includes("belum terkonfigurasi")) return sendError(res, "Chatwoot belum dikonfigurasi", 400);
    sendError(res, e.message, 500);
  }
});

/** PUT /api/integrations/chatwoot/config */
router.put("/api/integrations/chatwoot/config", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "chatwoot_settings")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const { enabled, baseUrl, accountId, apiAccessToken, webhookSecret, autoCreateOnKeyword, autoNotifyOnResolve, defaultCategoryId, autoSyncContacts } = req.body || {};
    const data: any = {};
    if (enabled != null) data.enabled = enabled ? 1 : 0;
    if (autoSyncContacts != null) data.autoSyncContacts = autoSyncContacts ? 1 : 0;
    if (baseUrl != null) data.baseUrl = String(baseUrl).trim().replace(/\/$/, "");
    if (accountId != null) data.accountId = String(accountId).trim();
    // Hanya update token/secret kalau ngga masked (bukan placeholder bullet)
    if (apiAccessToken && !apiAccessToken.startsWith("••••")) data.apiAccessToken = apiAccessToken;
    if (webhookSecret && !webhookSecret.startsWith("••••")) data.webhookSecret = webhookSecret;
    if (autoCreateOnKeyword != null) data.autoCreateOnKeyword = autoCreateOnKeyword ? 1 : 0;
    if (autoNotifyOnResolve != null) data.autoNotifyOnResolve = autoNotifyOnResolve ? 1 : 0;
    if (defaultCategoryId !== undefined) data.defaultCategoryId = defaultCategoryId;
    const config = await storage.updateChatwootConfig(data);
    await logAudit(req, "UPDATE", "chatwoot_config", config.id, "configured");
    sendSuccess(res, { config: { ...config, apiAccessToken: undefined, webhookSecret: undefined } });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/integrations/chatwoot/test - test koneksi ke Chatwoot */
router.post("/api/integrations/chatwoot/test", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "chatwoot_settings")) return sendError(res, "Akses ditolak", 403);
  try {
    const { testChatwootConnection } = await import("./chatwoot.js");
    const result = await testChatwootConnection();
    sendSuccess(res, result);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** Keyword rules CRUD */
router.post("/api/integrations/chatwoot/keyword-rules", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "chatwoot_settings")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const { keyword, categoryId, priority, sortOrder } = req.body || {};
    if (!keyword || !categoryId) return sendError(res, "keyword + categoryId wajib");
    const rule = await storage.createChatwootKeywordRule({ keyword, categoryId, priority, sortOrder });
    sendSuccess(res, rule, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.put("/api/integrations/chatwoot/keyword-rules/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "chatwoot_settings")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const id = Number(req.params.id);
    const rule = await storage.updateChatwootKeywordRule(id, req.body);
    if (!rule) return sendError(res, "Rule tidak ditemukan", 404);
    sendSuccess(res, rule);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.delete("/api/integrations/chatwoot/keyword-rules/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "chatwoot_settings")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    await storage.deleteChatwootKeywordRule(Number(req.params.id));
    sendSuccess(res, { ok: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/**
 * POST /api/integrations/chatwoot/webhook - incoming webhook receiver
 * NO AUTH (Chatwoot tidak punya bearer; pakai HMAC signature verify)
 */
router.post("/api/integrations/chatwoot/webhook", async (req: Request, res: Response) => {
  try {
    const config = await storage.getChatwootConfig();
    if (!config?.enabled) {
      return res.status(200).json({ success: true, ignored: "integration disabled" });
    }

    // Verify HMAC signature kalau secret di-set
    const signature = req.headers["x-chatwoot-signature"] as string | undefined ?? req.headers["x-chatwoot-webhook-signature"] as string | undefined;
    const rawBody = JSON.stringify(req.body); // best-effort - Express sudah parse
    const { verifyWebhookSignature, handleConversationCreated, handleMessageCreated } = await import("./chatwoot.js");
    if (config.webhookSecret && !verifyWebhookSignature(rawBody, signature, config.webhookSecret)) {
      console.warn("[Chatwoot] webhook signature invalid");
      return res.status(401).json({ success: false, error: "Invalid signature" });
    }

    const event = req.body?.event;
    let result: any = { reason: "no handler for event" };
    if (event === "conversation_created") {
      result = await handleConversationCreated(req.body);
    } else if (event === "message_created") {
      result = await handleMessageCreated(req.body);
    }

    res.status(200).json({ success: true, event, result });
  } catch (e: any) {
    console.error("[Chatwoot webhook]", e?.stack ?? e);
    res.status(200).json({ success: false, error: e.message });  // 200 supaya Chatwoot ga retry-storm
  }
});

// ===========================================================
//  GENIEACS TR-069 DEVICE MANAGEMENT
// ===========================================================
import {
  testConnection as genieTest,
  getDevices as genieGetDevices,
  getDevicesByIdentifiers as genieGetDevicesByIdentifiers,
  getDevice as genieGetDevice,
  getDeviceStats as genieGetStats,
  summonDevice as genieSummon,
  refreshDevice as genieRefresh,
  rebootDevice as genieReboot,
  addTag as genieAddTag,
  removeTag as genieRemoveTag,
  deleteDevice as genieDeleteDevice,
  setWifiParams as genieSetWifi,
  addWanConnection as genieAddWan,
  editWanConnection as genieEditWan,
  type GenieAcsConfig,
} from "./genieacs.js";

async function getGenieConfig(): Promise<GenieAcsConfig> {
  // Tenant isolation: tiap mitra punya GenieACS server sendiri (mitra_integrations).
  // JABNET (mitra 1) boleh fallback ke app_settings global (config asli single-tenant).
  // Mitra lain WAJIB punya config sendiri - TIDAK fallback (cegah akses ACS JABNET / mitra lain).
  const mitraId = tenantContext.getStore()?.mitraId ?? 1;
  const pick = async (key: string): Promise<string | null> => {
    const own = await storage.getMitraSetting(key, { fallbackToGlobal: false });
    if (own && own.trim() !== "") return own;
    if (mitraId === 1) {
      const g = await storage.getSetting(key);
      if (g && g.trim() !== "") return g;
    }
    return null;
  };
  const host = await pick("genieacs_host");
  if (!host) throw new Error("GenieACS belum dikonfigurasi untuk mitra ini - atur di Integrasi API");
  const port = await pick("genieacs_port");
  const username = await pick("genieacs_username");
  const password = await pick("genieacs_password");
  return { host, port: Number(port) || 7557, username: username || "", password: password || "" };
}

/** Threshold optical power configurable per ISP (app_settings, mitra-aware seperti
 *  getGenieConfig) - default -25/-28 dBm (sama dengan nilai legacy yang dulu hardcoded). */
async function getOpticalThresholds(): Promise<OpticalThresholds> {
  const mitraId = tenantContext.getStore()?.mitraId ?? 1;
  const pick = async (key: string): Promise<string | null> => {
    const own = await storage.getMitraSetting(key, { fallbackToGlobal: false });
    if (own && own.trim() !== "") return own;
    if (mitraId === 1) {
      const g = await storage.getSetting(key);
      if (g && g.trim() !== "") return g;
    }
    return null;
  };
  const warn = Number(await pick("optical_rx_warn"));
  const crit = Number(await pick("optical_rx_crit"));
  return {
    warn: Number.isFinite(warn) && warn !== 0 ? warn : DEFAULT_OPTICAL_THRESHOLDS.warn,
    crit: Number.isFinite(crit) && crit !== 0 ? crit : DEFAULT_OPTICAL_THRESHOLDS.crit,
  };
}

router.post("/api/genieacs/test", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { host, port, username, password } = req.body;
    if (!host) return sendError(res, "Host wajib diisi");
    const result = await genieTest({ host, port: Number(port) || 7557, username: username || "", password: password || "" });
    sendSuccess(res, result);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/genieacs/stats", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const config = await getGenieConfig();
    const stats = await genieGetStats(config);
    sendSuccess(res, stats);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/**
 * Smart flexible search untuk ONT devices.
 * - Multi-token: split by whitespace, tiap token wajib match salah satu field (AND across tokens, OR within fields)
 * - Match di: serial, manufacturer, product class, pppoe username, IP address (beberapa varian path), MAC, SSID, ID device
 * - Cross-table: resolve full search string → customer name → pppoe → tambah $in clause
 * - Escape regex special chars agar user bebas ketik "10.0.18.84" tanpa masalah
 */
async function buildDeviceSearchQuery(search: string): Promise<any> {
  if (!search || !search.trim()) return {};
  const q = search.trim();
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tokens = q.split(/\s+/).filter(t => t.length > 0);

  // Field paths yang di-search per token (GenieACS TR-069 params umum)
  const FIELDS = [
    "_id",
    "_deviceId._SerialNumber",
    "_deviceId._Manufacturer",
    "_deviceId._ProductClass",
    "_deviceId._OUI",
    // PPPoE username (berbagai varian path)
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username._value",
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Username._value",
    "Device.PPP.Interface.1.Username._value",
    "VirtualParameters.pppoeUsername._value",
    // IP Address - parser ambil dari ConnectionRequestURL (http://10.0.x.x:7547/)
    "InternetGatewayDevice.ManagementServer.ConnectionRequestURL._value",
    "Device.ManagementServer.ConnectionRequestURL._value",
    // IP Address - varian WAN (juga di-cari untuk coverage maksimal)
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress._value",
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress._value",
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.ExternalIPAddress._value",
    "VirtualParameters.ipAddress._value",
    // MAC Address (WAN + LAN WLAN)
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.MACAddress._value",
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.MACAddress._value",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.MACAddress._value",
    "VirtualParameters.macAddress._value",
    // SSID / WiFi name
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID._value",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID._value",
  ];

  // Per-token clause: $or across all fields - tiap token minimal match di 1 field
  const tokenClauses = tokens.map(t => {
    const re = { $regex: escapeRe(t), $options: "i" };
    return { $or: FIELDS.map(f => ({ [f]: re })) };
  });

  // Cross-resolve: kalau full search string match nama pelanggan, ambil pppoe-nya
  let pppoeFromCustomer: string[] = [];
  try {
    if (q.length >= 2) {
      const matched = await storage.searchCustomersByName(q);
      pppoeFromCustomer = matched
        .map(c => c.pppoeUsername)
        .filter((u): u is string => !!u && u.length > 0);
    }
  } catch { /* storage error - skip cross-resolve */ }

  // Base query: 1 token → langsung; multi-token → $and (semua token harus match)
  const baseQuery = tokens.length === 1 ? tokenClauses[0] : { $and: tokenClauses };

  // Union dengan customer-name match (device yang pppoe-nya match customer yang namanya mengandung search)
  if (pppoeFromCustomer.length > 0) {
    return {
      $or: [
        baseQuery,
        { "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username._value": { $in: pppoeFromCustomer } },
        { "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Username._value": { $in: pppoeFromCustomer } },
        { "Device.PPP.Interface.1.Username._value": { $in: pppoeFromCustomer } },
        { "VirtualParameters.pppoeUsername._value": { $in: pppoeFromCustomer } },
      ]
    };
  }
  return baseQuery;
}

router.get("/api/genieacs/devices", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const config = await getGenieConfig();
    const limit = Number(req.query.limit) || 50;
    const skip = Number(req.query.skip) || 0;
    const search = (req.query.search as string) || "";
    const query = await buildDeviceSearchQuery(search);
    const devices = await genieGetDevices(config, query, limit, skip);
    sendSuccess(res, devices);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/genieacs/devices/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const config = await getGenieConfig();
    const device = await genieGetDevice(config, String(req.params.id));
    if (!device) return sendError(res, "Device tidak ditemukan", 404);
    sendSuccess(res, device);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/genieacs/devices/:id/summon", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const config = await getGenieConfig();
    const result = await genieSummon(config, String(req.params.id));
    await logAudit(req, "UPDATE", "genieacs_device", 0, `Summon ${req.params.id}`);
    sendSuccess(res, result);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/genieacs/devices/:id/refresh", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const config = await getGenieConfig();
    const result = await genieRefresh(config, String(req.params.id));
    sendSuccess(res, result);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/genieacs/devices/:id/reboot", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const config = await getGenieConfig();
    const result = await genieReboot(config, String(req.params.id));
    await logAudit(req, "UPDATE", "genieacs_device", 0, `Reboot ${req.params.id}`);
    sendSuccess(res, result);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/genieacs/devices/:id/tags", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { tag } = req.body;
    if (!tag) return sendError(res, "Tag wajib diisi");
    const config = await getGenieConfig();
    const result = await genieAddTag(config, String(req.params.id), tag);
    sendSuccess(res, result);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.delete("/api/genieacs/devices/:id/tags/:tag", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const config = await getGenieConfig();
    const result = await genieRemoveTag(config, String(req.params.id), String(req.params.tag));
    sendSuccess(res, result);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// WAN Connection management
router.post("/api/genieacs/devices/:id/wan", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { wanIndex, name, username, password, enabled, serviceList } = req.body;
    if (!wanIndex) return sendError(res, "wanIndex wajib diisi");
    const config = await getGenieConfig();
    const result = await genieAddWan(config, String(req.params.id), Number(wanIndex), { name, username, password, enabled, serviceList });
    await logAudit(req, "CREATE", "genieacs_wan", 0, `WAN ${wanIndex} on ${req.params.id}`);
    sendSuccess(res, result);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.put("/api/genieacs/devices/:id/wan/:wanIndex", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { name, username, password, enabled, connectionType } = req.body;
    const config = await getGenieConfig();
    const result = await genieEditWan(config, String(req.params.id), Number(req.params.wanIndex), connectionType || "ppp", { name, username, password, enabled });
    await logAudit(req, "UPDATE", "genieacs_wan", 0, `WAN ${req.params.wanIndex} on ${req.params.id}`);
    sendSuccess(res, result);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/genieacs/devices/:id/wifi", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { wlanIndex, ssid, password } = req.body;
    if (!wlanIndex) return sendError(res, "wlanIndex wajib diisi");
    const config = await getGenieConfig();
    const result = await genieSetWifi(config, String(req.params.id), Number(wlanIndex), ssid || "", password || "");
    await logAudit(req, "UPDATE", "genieacs_device", 0, `WiFi ${req.params.id} WLAN${wlanIndex}`);
    sendSuccess(res, result);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.delete("/api/genieacs/devices/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const config = await getGenieConfig();
    const result = await genieDeleteDevice(config, String(req.params.id));
    await logAudit(req, "DELETE", "genieacs_device", 0, String(req.params.id));
    sendSuccess(res, result);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ===========================================================
//  v4.2.18 (C.3): Business hours / SLA calendar settings
// ===========================================================

// v4.2.23: Upload image untuk WA template (base64 → save disk → return public URL)
router.post("/api/whatsapp/upload-image", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "whatsapp")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const { filename, base64 } = req.body ?? {};
    if (!base64 || typeof base64 !== "string") return sendError(res, "base64 wajib");

    // Parse data URL: "data:image/jpeg;base64,xxxx"
    const m = base64.match(/^data:(image\/[a-z0-9+]+);base64,(.+)$/i);
    let mime = "image/jpeg";
    let b64data = base64;
    if (m) { mime = m[1].toLowerCase(); b64data = m[2]; }

    // Allow common image types only
    const allowedMimes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedMimes.includes(mime)) return sendError(res, `Mime ${mime} tidak diizinkan (hanya jpeg/png/gif/webp)`);

    const ext = mime.split("/")[1].replace("jpeg", "jpg");
    const buffer = Buffer.from(b64data, "base64");

    // Size limit 5MB (raw)
    if (buffer.length > 5 * 1024 * 1024) return sendError(res, `File terlalu besar (${(buffer.length / 1024 / 1024).toFixed(2)} MB, max 5 MB)`);

    // Save ke /public/uploads/wa-images/
    const path = await import("node:path");
    const fs = await import("node:fs/promises");
    const crypto = await import("node:crypto");

    const hash = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 16);
    const safeName = (filename || "img").replace(/[^a-z0-9_.-]/gi, "_").slice(0, 40);
    const finalName = `${hash}-${safeName}.${ext}`;

    // Detect public path (sama logic dengan server/index.ts)
    const __dirname = path.dirname(new URL(import.meta.url).pathname);
    const { existsSync } = await import("node:fs");
    const publicPath = existsSync(path.join(__dirname, "public"))
      ? path.join(__dirname, "public")
      : path.join(__dirname, "..", "dist", "public");
    const uploadDir = path.join(publicPath, "uploads", "wa-images");
    await fs.mkdir(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, finalName);
    await fs.writeFile(filePath, buffer);

    // Build public URL (host-aware) - relative URL works untuk dev + prod
    const publicUrl = `/uploads/wa-images/${finalName}`;
    // Full URL kalau request punya host (untuk send ke MPWA yang butuh absolute URL)
    const host = req.get("host");
    const proto = (req.get("x-forwarded-proto") ?? req.protocol ?? "http").split(",")[0].trim();
    const fullUrl = `${proto}://${host}${publicUrl}`;

    sendSuccess(res, {
      url: publicUrl,
      fullUrl,
      sizeKb: Math.round(buffer.length / 1024),
      mime,
    });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// v4.2.23: WA default button image setting (untuk template tanpa image)
router.get("/api/settings/wa-default-button-image", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const url = (await storage.getSetting("wa_default_button_image")) || "";
    sendSuccess(res, { url });
  } catch (e: any) { sendError(res, e.message, 500); }
});
router.put("/api/settings/wa-default-button-image", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { url } = req.body ?? {};
    await storage.setSetting("wa_default_button_image", String(url ?? "").trim(), "whatsapp");
    sendSuccess(res, { saved: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/settings/business-hours", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const cfg = await storage.getBusinessHoursConfig();
    sendSuccess(res, cfg);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.put("/api/settings/business-hours", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { validateBusinessHoursConfig } = await import("./business-hours.js");
    const cfg = req.body;
    if (!validateBusinessHoursConfig(cfg)) {
      return sendError(res, "Config tidak valid (cek schedule, holidays, tzOffsetHours)", 400);
    }
    await storage.setBusinessHoursConfig(cfg);
    sendSuccess(res, { saved: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ===========================================================
//  APP SETTINGS (Integration Configuration)
// ===========================================================

router.get("/api/settings", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const category = req.query.category as string | undefined;
    const mitraId = req.authUser!.activeMitraId ?? 1;
    // Multi-tenant: untuk key di INTEGRATION_KEY_SPECS, override dengan value mitra_integrations.
    // Untuk JABNET (mitra=1), kalau row mitra_integrations tidak ada → fallback ke app_settings.
    // Untuk mitra non-JABNET, kalau row tidak ada → return null/empty (TIDAK fallback ke JABNET).
    const settings = await storage.getSettings(category);
    // Load mitra overrides 1x
    let mitraOverrides = new Map<string, string | null>();
    try {
      await new Promise<void>((resolve, reject) => {
        tenantContext.run({ mitraId, userId: req.authUser!.id, isSuperAdmin: true }, async () => {
          try {
            const rows = await storage.listMitraSettings({ unmask: true });
            for (const r of rows) mitraOverrides.set(r.key, r.value);
            resolve();
          } catch (e) { reject(e); }
        });
      });
    } catch (e: any) { console.warn(`[/api/settings] load mitra overrides failed: ${e.message}`); }

    const integrationKeys = new Set(INTEGRATION_KEY_SPECS.map(s => s.key));
    const merged = settings.map(s => {
      let value: string | null = s.value;
      if (integrationKeys.has(s.key) && mitraOverrides.has(s.key)) {
        // Mitra explicit override (termasuk empty string) → pakai itu
        value = mitraOverrides.get(s.key) ?? null;
      } else if (integrationKeys.has(s.key) && mitraId !== 1) {
        // Non-JABNET tanpa override → KOSONGKAN (jangan bocorkan JABNET credentials)
        value = "";
      }
      return {
        ...s,
        value: s.key.toLowerCase().includes("password") || s.key.toLowerCase().includes("secret") || s.key.toLowerCase().includes("token")
          ? (value ? "••••••••" : value)
          : value,
      };
    });
    // Plus add INTEGRATION_KEY_SPECS keys yang belum ada di app_settings (e.g. mpwa_url untuk mitra baru)
    const seenKeys = new Set(merged.map(m => m.key));
    for (const spec of INTEGRATION_KEY_SPECS) {
      if (seenKeys.has(spec.key)) continue;
      const mitraVal = mitraOverrides.get(spec.key) ?? (mitraId !== 1 ? "" : null);
      merged.push({
        id: 0,
        key: spec.key,
        value: spec.isSecret && mitraVal ? "••••••••" : (mitraVal ?? null),
        category: spec.group?.toLowerCase() ?? "general",
        label: spec.label,
        updatedAt: null,
      } as any);
    }
    sendSuccess(res, merged);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/settings/:key", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const value = await storage.getSetting(String(req.params.key));
    sendSuccess(res, { key: req.params.key, value });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** A1: GET /api/settings mengembalikan "••••••••" untuk key secret (password/token/secret).
 *  Kalau form mengirim balik nilai mask itu apa adanya (admin tidak mengetik ulang), artinya
 *  "biarkan" - JANGAN timpa kredensial asli dengan placeholder. Berlaku universal untuk semua
 *  field secret di /integrations (genieacs/mpwa/meta/billing/maps), juga form baru ke depan. */
function isSecretMaskEcho(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0 && /^•+$/.test(value.trim());
}

// Helper: simpan setting key/value. Untuk INTEGRATION_KEY_SPECS keys → mitra_integrations
// (per-tenant). Untuk JABNET (mitra=1), juga write ke app_settings supaya legacy
// storage.getSetting() direct callers tetap dapat value (backward compat).
async function saveSettingMitraAware(req: Request, key: string, value: string, category: string, label?: string) {
  // Lindungi kredensial: jangan tulis kalau value masih placeholder mask (lihat isSecretMaskEcho).
  if (isSecretMaskEcho(value)) return;
  const mitraId = req.authUser!.activeMitraId ?? 1;
  const isIntegrationKey = INTEGRATION_KEY_SPECS.some(s => s.key === key);
  if (isIntegrationKey) {
    await new Promise<void>((resolve, reject) => {
      tenantContext.run({ mitraId, userId: req.authUser!.id, isSuperAdmin: true }, async () => {
        try {
          await storage.setMitraSetting(key, value, { isSecret: isSecretIntegrationKey(key) });
          resolve();
        } catch (e) { reject(e); }
      });
    });
    // Backward compat: write ke app_settings juga untuk JABNET (legacy getSetting direct callers)
    if (mitraId === 1) {
      await storage.setSetting(key, value, category, label);
    }
  } else {
    // Non-integration key → tetap global app_settings
    await storage.setSetting(key, value, category, label);
  }
}

router.put("/api/settings", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { key, value, category, label } = req.body;
    if (!key) return sendError(res, "Key wajib diisi");
    await saveSettingMitraAware(req, key, value ?? "", category ?? "general", label);
    if (key === "google_maps_api_key") publicConfigCache.clear();
    await logAudit(req, "UPDATE", "app_setting", 0, key);
    sendSuccess(res, { key, saved: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.put("/api/settings/bulk", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { settings } = req.body;
    if (!Array.isArray(settings)) return sendError(res, "settings harus berupa array");
    for (const s of settings) {
      if (s.key && s.value !== undefined) {
        await saveSettingMitraAware(req, s.key, s.value, s.category ?? "general", s.label);
        if (s.key === "google_maps_api_key") publicConfigCache.clear();
      }
    }
    await logAudit(req, "UPDATE", "app_setting", 0, `Bulk update ${settings.length} settings`);
    sendSuccess(res, { saved: settings.length });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.delete("/api/settings/:key", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    await storage.deleteSetting(String(req.params.key));
    await logAudit(req, "DELETE", "app_setting", 0, String(req.params.key));
    sendSuccess(res, { deleted: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ===========================================================
//  MPWA WHATSAPP GATEWAY (admin-only test + status)
// ===========================================================
import { testMpwaConnection, getMpwaDeviceStatus, loadMpwaConfig } from "./mpwa.js";

/** GET /api/mpwa/status - live status device MPWA (connected/disconnect) */
router.get("/api/mpwa/status", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const config = await loadMpwaConfig();
    const configured = config !== null;
    const lastSuccess = await storage.getSetting("mpwa_last_success_at");
    const lastError = await storage.getSetting("mpwa_last_error");
    const lastErrorAt = await storage.getSetting("mpwa_last_error_at");
    let deviceStatus: any = null;
    if (configured) {
      deviceStatus = await getMpwaDeviceStatus();
    }
    sendSuccess(res, {
      configured,
      url: config?.url ?? null,
      senderNumber: config?.senderNumber ?? null,
      lastSuccess,
      lastError,
      lastErrorAt,
      deviceStatus,
    });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/mpwa/test - kirim pesan test ke nomor admin */
router.post("/api/mpwa/test", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const testPhone = String(req.body?.phone ?? "").trim();
    const customMessage = req.body?.message ? String(req.body.message).trim() : undefined;
    if (!testPhone) return sendError(res, "Phone tujuan wajib diisi");
    let result;
    if (customMessage) {
      // Custom test message (pakai config saat ini)
      const { loadMpwaConfig, sendMpwaMessage } = await import("./mpwa.js");
      const config = await loadMpwaConfig();
      if (!config) return sendError(res, "MPWA belum dikonfigurasi - isi URL + API key dulu");
      result = await sendMpwaMessage(config, testPhone, customMessage);
    } else {
      result = await testMpwaConnection(testPhone);
    }
    await logAudit(req, "SEND", "mpwa_test", undefined, testPhone, { sent: result.sent, error: result.error });
    if (result.sent) {
      sendSuccess(res, { sent: true, message: `Test pesan terkirim ke ${testPhone}`, response: result.response });
    } else {
      sendError(res, `Test gagal: ${result.error}`, 500);
    }
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** GET /api/mpwa/config - ambil config (untuk form MPWA page) */
router.get("/api/mpwa/config", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    sendSuccess(res, {
      enabled: (await storage.getSetting("mpwa_enabled")) === "true",
      url: (await storage.getSetting("mpwa_url")) || "https://mpwa.jabnet.id",
      token: (await storage.getSetting("mpwa_token")) || "",
      senderNumber: (await storage.getSetting("mpwa_sender_number")) || "",
      // v4.2.19: optional native button endpoint (kalau MPWA gateway support)
      buttonEndpoint: (await storage.getSetting("mpwa_button_endpoint")) || "",
    });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** PUT /api/mpwa/config - simpan config */
router.put("/api/mpwa/config", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { enabled, url, token, senderNumber, buttonEndpoint } = req.body ?? {};
    if (enabled !== undefined) await storage.setSetting("mpwa_enabled", enabled ? "true" : "false", "portal");
    if (url !== undefined) await storage.setSetting("mpwa_url", String(url).trim(), "portal");
    if (token !== undefined && !isSecretMaskEcho(token)) await storage.setSetting("mpwa_token", String(token).trim(), "portal");
    if (senderNumber !== undefined) await storage.setSetting("mpwa_sender_number", String(senderNumber).trim(), "portal");
    if (buttonEndpoint !== undefined) await storage.setSetting("mpwa_button_endpoint", String(buttonEndpoint).trim(), "portal");
    await logAudit(req, "UPDATE", "mpwa_config", undefined, undefined, { enabled, hasToken: !!token, senderNumber });
    sendSuccess(res, { saved: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ===========================================================
//  TELEGRAM BOT - admin config + per-user pairing & prefs
// ===========================================================

import {
  sendTelegramMessage,
  getBotInfo,
  generatePairingCode,
  resolvePairingCode,
  loadTelegramConfig,
  TELEGRAM_EVENT_DEFAULTS,
  type TelegramEventKey,
} from "./telegram.js";

/** GET /api/telegram/config - admin ambil config bot */
router.get("/api/telegram/config", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const token = (await storage.getSetting("telegram_bot_token")) || "";
    sendSuccess(res, {
      enabled: (await storage.getSetting("telegram_enabled")) === "true",
      botToken: token,
      botUsername: (await storage.getSetting("telegram_bot_username")) || "",
      lastSuccessAt: await storage.getSetting("telegram_last_success_at"),
      lastError: await storage.getSetting("telegram_last_error"),
      lastErrorAt: await storage.getSetting("telegram_last_error_at"),
    });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** PUT /api/telegram/config - admin simpan config (verify via getMe) */
router.put("/api/telegram/config", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { enabled, botToken } = req.body ?? {};
    if (enabled !== undefined) {
      await storage.setSetting("telegram_enabled", enabled ? "true" : "false", "telegram");
    }
    if (botToken !== undefined) {
      const tok = String(botToken).trim();
      if (tok) {
        const info = await getBotInfo(tok);
        if (!info.ok) return sendError(res, `Token invalid: ${info.error}`);
        await storage.setSetting("telegram_bot_token", tok, "telegram");
        if (info.username) await storage.setSetting("telegram_bot_username", info.username, "telegram");
      } else {
        await storage.setSetting("telegram_bot_token", "", "telegram");
        await storage.setSetting("telegram_bot_username", "", "telegram");
      }
    }
    await logAudit(req, "UPDATE", "telegram_config", undefined, undefined, { enabled, hasToken: !!botToken });
    sendSuccess(res, { saved: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/telegram/test - admin test kirim pesan ke chat_id tertentu */
router.post("/api/telegram/test", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const chatId = String(req.body?.chatId ?? "").trim();
    if (!chatId) return sendError(res, "chatId wajib (ambil dari user atau @userinfobot)");
    const cfg = await loadTelegramConfig();
    if (!cfg) return sendError(res, "Telegram belum dikonfigurasi");
    const message = ` *Test dari JABNET Workspace*\n\nKalau kamu lihat pesan ini, integrasi Telegram sudah jalan \n\n_${new Date().toLocaleString("id-ID")}_`;
    const result = await sendTelegramMessage(cfg.botToken, chatId, message, { parseMode: "Markdown" });
    await logAudit(req, "SEND", "telegram_test", undefined, chatId, { sent: result.sent, error: result.error });
    if (result.sent) sendSuccess(res, { sent: true, message: `Test pesan terkirim ke ${chatId}` });
    else sendError(res, `Test gagal: ${result.error}`, 500);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/auth/me/telegram/pair/request - generate pairing code 6-digit */
router.post("/api/auth/me/telegram/pair/request", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const cfg = await loadTelegramConfig();
    if (!cfg) return sendError(res, "Telegram belum dikonfigurasi admin", 503);
    const botUsername = (await storage.getSetting("telegram_bot_username")) || "";
    const code = generatePairingCode(req.authUser.id);
    sendSuccess(res, {
      code,
      botUsername,
      deepLink: botUsername ? `https://t.me/${botUsername}?start=${code}` : null,
      expiresInSec: 300,
    });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/**
 * POST /api/telegram/webhook - Telegram ngirim update ke sini
 * Cuma handle message yg start dengan /start <code> untuk pairing.
 * Webhook ini harus diset di @BotFather → Bot Settings → Set Webhook,
 * atau via setWebhook API dengan URL publik (ngrok saat dev).
 *
 * Security: request body dari Telegram tidak signed, tapi semua yg dibutuhkan
 * (chat_id) ada di body. Pairing code 5-min TTL cukup.
 */
router.post("/api/telegram/webhook", async (req: Request, res: Response) => {
  try {
    const update = req.body ?? {};
    const msg = update.message;
    if (!msg?.text || !msg?.chat?.id) return sendSuccess(res, { ignored: true });

    const text = String(msg.text).trim();
    const startMatch = text.match(/^\/start(?:\s+(\d{6}))?/);
    if (!startMatch) return sendSuccess(res, { ignored: true });

    const cfg = await loadTelegramConfig();
    if (!cfg) return sendSuccess(res, { ignored: true, reason: "disabled" });

    const chatId = String(msg.chat.id);
    const tgUsername = msg.from?.username ? "@" + msg.from.username : null;
    const code = startMatch[1];

    if (!code) {
      await sendTelegramMessage(cfg.botToken, chatId,
        ` Halo! Untuk pairing akun JABNET Workspace, generate kode di Profile → Integrasi Telegram → Connect, lalu kirim:\n\n/start <kode-6-digit>`);
      return sendSuccess(res, { ok: true });
    }

    const userId = resolvePairingCode(code);
    if (!userId) {
      await sendTelegramMessage(cfg.botToken, chatId,
        ` Kode *${code}* tidak valid atau sudah kedaluwarsa.\nGenerate kode baru di JABNET Workspace → Profile.`,
        { parseMode: "Markdown" });
      return sendSuccess(res, { ok: false, reason: "invalid_code" });
    }

    const user = await storage.getUser(userId);
    if (!user) return sendSuccess(res, { ok: false, reason: "user_not_found" });

    await storage.updateUser(userId, {
      telegramChatId: chatId,
      telegramUsername: tgUsername,
      telegramLinkedAt: new Date().toISOString(),
    } as any);

    await sendTelegramMessage(cfg.botToken, chatId,
      ` *Berhasil terhubung!*\n\nAkun JABNET Workspace *${user.name}* (${user.username}) sudah tersambung ke Telegram ini.\n\nKamu akan terima notifikasi untuk event marketing & operasional sesuai preferensi di Profile.`,
      { parseMode: "Markdown" });

    sendSuccess(res, { ok: true, linked: userId });
  } catch (e: any) {
    // Selalu return 200 ke Telegram supaya tidak spam retry
    console.error("[telegram/webhook] error:", e.message);
    sendSuccess(res, { ok: false, reason: e.message });
  }
});

/** DELETE /api/auth/me/telegram - unlink Telegram */
router.delete("/api/auth/me/telegram", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    await storage.updateUser(req.authUser.id, {
      telegramChatId: null,
      telegramUsername: null,
      telegramLinkedAt: null,
    } as any);
    await logAudit(req, "UPDATE", "profile", req.authUser.id, req.authUser.username, { telegram: "unlinked" });
    sendSuccess(res, { unlinked: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** PUT /api/auth/me/telegram/prefs - per-user notif toggle */
router.put("/api/auth/me/telegram/prefs", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const incoming = req.body?.prefs ?? {};
    if (typeof incoming !== "object" || incoming === null) return sendError(res, "prefs harus object");
    // Whitelist keys & boolean values
    const clean: Record<string, boolean> = {};
    for (const key of Object.keys(TELEGRAM_EVENT_DEFAULTS) as TelegramEventKey[]) {
      clean[key] = incoming[key] !== false; // default true kalau tidak di-set
    }
    await storage.updateUser(req.authUser.id, { telegramPrefs: JSON.stringify(clean) } as any);
    sendSuccess(res, { prefs: clean });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ===========================================================
//  MPWA TEMPLATE MESSAGES (admin only)
// ===========================================================

router.get("/api/mpwa/templates", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "mpwa")) return sendError(res, "Akses ditolak", 403);
  try {
    const category = req.query.category as string | undefined;
    const templates = await storage.getMpwaTemplates(category ? { category } : undefined);
    sendSuccess(res, templates);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/mpwa/templates/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "mpwa")) return sendError(res, "Akses ditolak", 403);
  try {
    const t = await storage.getMpwaTemplate(Number(req.params.id));
    if (!t) return sendError(res, "Template tidak ditemukan", 404);
    sendSuccess(res, t);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/mpwa/templates", async (req: Request, res: Response) => {
  // Accept mpwa (legacy) atau whatsapp (v2) perm
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "whatsapp") && !hasWritePermission(req, "mpwa")) {
    return sendError(res, "Akses ditolak (write)", 403);
  }
  try {
    const { key, name, description, content, placeholders, category, footer, buttons, mediaUrl, mediaType,
      templateType, templateChannel, customerFilter, shareToReseller, compatMode } = req.body;
    if (!key || !/^[a-z0-9_]{2,40}$/.test(key)) return sendError(res, "Key harus lowercase alphanumeric + underscore, 2-40 char");
    if (!name || !content) return sendError(res, "Name + content wajib");
    const existing = await storage.getMpwaTemplateByKey(key);
    if (existing) return sendError(res, `Key '${key}' sudah digunakan`);
    const t = await storage.createMpwaTemplate({
      key,
      name: String(name).trim(),
      description: description ? String(description).trim() : null,
      content: String(content),
      placeholders: placeholders ? (typeof placeholders === "string" ? placeholders : JSON.stringify(placeholders)) : null,
      category: category || "general",
      isSystem: 0,
      footer: footer ? String(footer).trim() : null,
      buttons: buttons ? (typeof buttons === "string" ? buttons : JSON.stringify(buttons)) : null,
      mediaUrl: mediaUrl ? String(mediaUrl).trim() : null,
      mediaType: mediaType || null,
      // v4.2.20 + v4.2.23
      templateType: templateType ?? "pelanggan",
      templateChannel: templateChannel ?? "unofficial",
      customerFilter: customerFilter ?? "all",
      shareToReseller: shareToReseller ? 1 : 0,
      compatMode: compatMode === "text-link" ? "text-link" : "native",
      createdAt: new Date().toISOString(),
    } as any);
    await logAudit(req, "CREATE", "mpwa_template", t.id, t.key);
    sendSuccess(res, t, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.put("/api/mpwa/templates/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "whatsapp") && !hasWritePermission(req, "mpwa")) {
    return sendError(res, "Akses ditolak (write)", 403);
  }
  try {
    const id = Number(req.params.id);
    const existing = await storage.getMpwaTemplate(id);
    if (!existing) return sendError(res, "Template tidak ditemukan", 404);
    const { name, description, content, placeholders, category, footer, buttons, mediaUrl, mediaType,
      templateType, templateChannel, customerFilter, shareToReseller, compatMode } = req.body;
    const update: any = {};
    if (name !== undefined) update.name = String(name).trim();
    if (description !== undefined) update.description = description ? String(description).trim() : null;
    if (content !== undefined) update.content = String(content);
    if (placeholders !== undefined) update.placeholders = typeof placeholders === "string" ? placeholders : JSON.stringify(placeholders);
    if (category !== undefined && existing.isSystem !== 1) update.category = category;
    if (footer !== undefined) update.footer = footer ? String(footer).trim() : null;
    if (buttons !== undefined) update.buttons = buttons ? (typeof buttons === "string" ? buttons : JSON.stringify(buttons)) : null;
    if (mediaUrl !== undefined) update.mediaUrl = mediaUrl ? String(mediaUrl).trim() : null;
    if (mediaType !== undefined) update.mediaType = mediaType || null;
    if (templateType !== undefined) update.templateType = templateType;
    if (templateChannel !== undefined) update.templateChannel = templateChannel;
    if (customerFilter !== undefined) update.customerFilter = customerFilter;
    if (shareToReseller !== undefined) update.shareToReseller = shareToReseller ? 1 : 0;
    if (compatMode !== undefined) update.compatMode = compatMode === "text-link" ? "text-link" : "native";
    const updated = await storage.updateMpwaTemplate(id, update);
    await logAudit(req, "UPDATE", "mpwa_template", id, existing.key, { fields: Object.keys(update) });
    sendSuccess(res, updated);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.delete("/api/mpwa/templates/:id", async (req: Request, res: Response) => {
  if (!requireWritePermission(req, res, "mpwa")) return;
  try {
    const id = Number(req.params.id);
    const t = await storage.getMpwaTemplate(id);
    if (!t) return sendError(res, "Template tidak ditemukan", 404);
    if (t.isSystem === 1) return sendError(res, "Template sistem tidak bisa dihapus", 403);
    const ok = await storage.deleteMpwaTemplate(id);
    if (!ok) return sendError(res, "Gagal hapus", 500);
    await logAudit(req, "DELETE", "mpwa_template", id, t.key);
    sendSuccess(res, { deleted: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ===========================================================
//  v4.2.19: BROADCAST - campaigns + segments + send worker
// ===========================================================

/** GET /api/broadcast/audience-fields - list field & operator yang valid (untuk UI builder) */
router.get("/api/broadcast/audience-fields", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "broadcast") && !hasPermission(req, "whatsapp")) return sendError(res, "Akses ditolak", 403);
  try {
    const { AUDIENCE_FIELD_OPTIONS } = await import("./broadcast-audience.js");
    sendSuccess(res, {
      fields: AUDIENCE_FIELD_OPTIONS,
      operators: [
        { op: "eq", label: "=" }, { op: "ne", label: "≠" },
        { op: "gt", label: ">" }, { op: "gte", label: "≥" },
        { op: "lt", label: "<" }, { op: "lte", label: "≤" },
        { op: "in", label: "salah satu dari" }, { op: "not_in", label: "bukan salah satu" },
        { op: "contains", label: "berisi" }, { op: "starts_with", label: "diawali" },
        { op: "is_empty", label: "kosong" }, { op: "not_empty", label: "terisi" },
        { op: "lte_days", label: "dalam ≤ N hari" }, { op: "gte_days", label: "dalam ≥ N hari" },
        { op: "lte_days_ago", label: "≥ N hari lalu" }, { op: "gte_days_ago", label: "≤ N hari lalu" },
      ],
    });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/broadcast/audience-preview - evaluate filter, return count + sample */
router.post("/api/broadcast/audience-preview", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "broadcast") && !hasPermission(req, "whatsapp")) return sendError(res, "Akses ditolak", 403);
  try {
    const filter = req.body?.filter;
    if (!filter) return sendError(res, "Filter wajib");
    const result = await storage.evaluateBroadcastAudience(filter);
    sendSuccess(res, result);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- Segments --
router.get("/api/broadcast/segments", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "broadcast") && !hasPermission(req, "whatsapp")) return sendError(res, "Akses ditolak", 403);
  try {
    const segs = await storage.listBroadcastSegments();
    sendSuccess(res, segs);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/broadcast/segments", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401); if (!hasWritePermission(req, "whatsapp") && !hasWritePermission(req, "broadcast")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const { name, description, filter } = req.body;
    if (!name || !filter) return sendError(res, "name + filter wajib");
    const { validateAudienceFilter } = await import("./broadcast-audience.js");
    if (!validateAudienceFilter(filter)) return sendError(res, "Filter tidak valid");
    const seg = await storage.createBroadcastSegment({
      name, description: description ?? null,
      filter: JSON.stringify(filter),
      createdBy: req.authUser!.id,
      createdAt: new Date().toISOString(),
    } as any);
    sendSuccess(res, seg, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.put("/api/broadcast/segments/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401); if (!hasWritePermission(req, "whatsapp") && !hasWritePermission(req, "broadcast")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const id = Number(req.params.id);
    const existing = await storage.getBroadcastSegment(id);
    if (!existing) return sendError(res, "Segment tidak ditemukan", 404);
    if (existing.isSystem === 1) return sendError(res, "Segment system tidak bisa di-edit", 403);
    const { name, description, filter } = req.body;
    const update: any = {};
    if (name !== undefined) update.name = name;
    if (description !== undefined) update.description = description ?? null;
    if (filter !== undefined) {
      const { validateAudienceFilter } = await import("./broadcast-audience.js");
      if (!validateAudienceFilter(filter)) return sendError(res, "Filter tidak valid");
      update.filter = JSON.stringify(filter);
    }
    const updated = await storage.updateBroadcastSegment(id, update);
    sendSuccess(res, updated);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.delete("/api/broadcast/segments/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401); if (!hasWritePermission(req, "whatsapp") && !hasWritePermission(req, "broadcast")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const id = Number(req.params.id);
    await storage.deleteBroadcastSegment(id);
    sendSuccess(res, { deleted: true });
  } catch (e: any) { sendError(res, e.message, 400); }
});

// -- Campaigns --
router.get("/api/broadcast/campaigns", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "broadcast") && !hasPermission(req, "whatsapp")) return sendError(res, "Akses ditolak", 403);
  try {
    const status = req.query.status as string | undefined;
    const limit = Number(req.query.limit) || 200;
    const list = await storage.listBroadcastCampaigns({ status, limit });
    // v4.2.26: Enrich dengan creator + device + template info
    const userIds = Array.from(new Set(list.map(c => c.createdBy).filter(Boolean)));
    const deviceIds = Array.from(new Set(list.map(c => (c as any).deviceId).filter(Boolean) as number[]));
    const templateIds = Array.from(new Set(list.map(c => c.templateId).filter(Boolean)));

    const userMap: Record<number, { id: number; name: string; username: string }> = {};
    for (const uid of userIds) {
      const u = await storage.getUser(uid).catch(() => null);
      if (u) userMap[uid] = { id: u.id, name: u.name, username: u.username };
    }
    const deviceMap: Record<number, { id: number; name: string; phone: string }> = {};
    for (const did of deviceIds) {
      const d = await storage.getWaDevice(did).catch(() => null);
      if (d) deviceMap[did] = { id: d.id, name: d.name, phone: d.phone };
    }
    const templateMap: Record<number, { id: number; name: string }> = {};
    for (const tid of templateIds) {
      const t = await storage.getMpwaTemplate(tid).catch(() => null);
      if (t) templateMap[tid] = { id: t.id, name: t.name };
    }
    const enriched = list.map(c => ({
      ...c,
      createdByUser: c.createdBy ? userMap[c.createdBy] ?? null : null,
      device: (c as any).deviceId ? deviceMap[(c as any).deviceId] ?? null : null,
      template: templateMap[c.templateId] ?? null,
    }));
    sendSuccess(res, enriched);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/broadcast/campaigns/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "broadcast") && !hasPermission(req, "whatsapp")) return sendError(res, "Akses ditolak", 403);
  try {
    const id = Number(req.params.id);
    const c = await storage.getBroadcastCampaign(id);
    if (!c) return sendError(res, "Campaign not found", 404);
    const counts = await storage.countBroadcastRecipients(id);
    // v4.2.26: enrich with creator + device + template
    const creator = c.createdBy ? await storage.getUser(c.createdBy).catch(() => null) : null;
    const device = (c as any).deviceId ? await storage.getWaDevice((c as any).deviceId).catch(() => null) : null;
    const template = await storage.getMpwaTemplate(c.templateId).catch(() => null);
    sendSuccess(res, {
      ...c, counts,
      createdByUser: creator ? { id: creator.id, name: creator.name, username: creator.username, role: creator.role } : null,
      device: device ? { id: device.id, name: device.name, phone: device.phone, provider: device.provider } : null,
      template: template ? { id: template.id, name: template.name, key: template.key } : null,
    });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/broadcast/campaigns", async (req: Request, res: Response) => {
  // Accept either legacy "broadcast" perm atau new "whatsapp" perm
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  const hasPerm = (req as any).authUser?.role === "admin" ||
    hasWritePermission(req, "whatsapp") || hasWritePermission(req, "broadcast");
  if (!hasPerm) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const {
      name, description, templateId, audienceFilter, savedSegmentId,
      contentOverride, footerOverride, buttonsOverride,
      scheduledAt, rateLimitMs,
      // v4.2.20: PRD WA Feature v2
      deviceId, targetType,
      // v4.2.20 fix: direct recipients (bypass filter) + manual input
      directRecipients, manualText, manualDate,
    } = req.body;
    if (!name || !templateId) return sendError(res, "name + templateId wajib");
    // v4.2.20: salah satu dari directRecipients / audienceFilter / savedSegmentId
    const hasDirect = Array.isArray(directRecipients) && directRecipients.length > 0;
    if (!hasDirect && !audienceFilter && !savedSegmentId) {
      // Debug log untuk traceability
      console.warn("[broadcast] reject create - no audience source. Body keys:", Object.keys(req.body));
      console.warn("[broadcast] directRecipients type:", typeof directRecipients, Array.isArray(directRecipients) ? `array(${directRecipients.length})` : directRecipients);
      return sendError(res, `Audience kosong. Pastikan kirim salah satu: directRecipients (array, min 1), audienceFilter, atau savedSegmentId. Yang diterima: ${Object.keys(req.body).join(", ") || "(empty body)"}`);
    }
    const template = await storage.getMpwaTemplate(Number(templateId));
    if (!template) return sendError(res, "Template tidak ditemukan", 404);

    // Pre-count audience untuk save snapshot
    let count = 0;
    if (hasDirect) {
      count = directRecipients.length;
    } else if (savedSegmentId) {
      const seg = await storage.getBroadcastSegment(Number(savedSegmentId));
      if (!seg) return sendError(res, "Segment tidak ditemukan", 404);
      try {
        const f = JSON.parse(seg.filter);
        const ev = await storage.evaluateBroadcastAudience(f);
        count = ev.count;
      } catch {}
    } else if (audienceFilter) {
      const ev = await storage.evaluateBroadcastAudience(audienceFilter);
      count = ev.count;
    }

    const c = await storage.createBroadcastCampaign({
      name, description: description ?? null,
      templateId: Number(templateId),
      audienceFilter: audienceFilter ? JSON.stringify(audienceFilter) : null,
      savedSegmentId: savedSegmentId ? Number(savedSegmentId) : null,
      audienceCount: count,
      contentOverride: contentOverride ?? null,
      footerOverride: footerOverride ?? null,
      buttonsOverride: buttonsOverride ? (typeof buttonsOverride === "string" ? buttonsOverride : JSON.stringify(buttonsOverride)) : null,
      status: scheduledAt ? "scheduled" : "draft",
      scheduledAt: scheduledAt ?? null,
      rateLimitMs: rateLimitMs ?? 2000,
      // v4.2.20
      deviceId: deviceId ? Number(deviceId) : null,
      targetType: targetType ?? "pelanggan",
      // v4.2.20 fix: direct recipients + manual input
      directRecipients: hasDirect ? JSON.stringify(directRecipients) : null,
      manualText: manualText ?? null,
      manualDate: manualDate ?? null,
      createdBy: req.authUser!.id,
      createdAt: new Date().toISOString(),
    } as any);
    await logAudit(req, "CREATE", "broadcast_campaign", c.id, c.name);
    sendSuccess(res, c, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.put("/api/broadcast/campaigns/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401); if (!hasWritePermission(req, "whatsapp") && !hasWritePermission(req, "broadcast")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const id = Number(req.params.id);
    const existing = await storage.getBroadcastCampaign(id);
    if (!existing) return sendError(res, "Campaign not found", 404);
    if (existing.status === "running" || existing.status === "completed") {
      return sendError(res, `Campaign status "${existing.status}" tidak bisa di-edit`);
    }
    const allowed = ["name", "description", "templateId", "audienceFilter", "savedSegmentId", "contentOverride", "footerOverride", "buttonsOverride", "scheduledAt", "rateLimitMs"];
    const update: any = {};
    for (const k of allowed) {
      if (k in req.body) {
        if (k === "audienceFilter" || k === "buttonsOverride") {
          update[k] = req.body[k] ? (typeof req.body[k] === "string" ? req.body[k] : JSON.stringify(req.body[k])) : null;
        } else {
          update[k] = req.body[k];
        }
      }
    }
    const updated = await storage.updateBroadcastCampaign(id, update);
    sendSuccess(res, updated);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.delete("/api/broadcast/campaigns/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401); if (!hasWritePermission(req, "whatsapp") && !hasWritePermission(req, "broadcast")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const id = Number(req.params.id);
    const c = await storage.getBroadcastCampaign(id);
    if (!c) return sendError(res, "Campaign not found", 404);
    if (c.status === "running") return sendError(res, "Cancel campaign dulu sebelum hapus");
    await storage.deleteBroadcastCampaign(id);
    await logAudit(req, "DELETE", "broadcast_campaign", id, c.name);
    sendSuccess(res, { deleted: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/broadcast/campaigns/:id/start - launch (enrol + spawn worker) */
router.post("/api/broadcast/campaigns/:id/start", async (req: Request, res: Response) => {
  // Accept both broadcast (legacy) + whatsapp (v2) permissions
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "whatsapp") && !hasWritePermission(req, "broadcast")) {
    return sendError(res, "Akses ditolak (write)", 403);
  }
  try {
    const id = Number(req.params.id);
    const { startBroadcastCampaign } = await import("./broadcast-worker.js");
    await startBroadcastCampaign(id);
    await logAudit(req, "ACTION", "broadcast_campaign", id, "start");
    sendSuccess(res, { started: true });
  } catch (e: any) { sendError(res, e.message, 400); }
});

/** POST /api/broadcast/campaigns/:id/cancel */
router.post("/api/broadcast/campaigns/:id/cancel", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "whatsapp") && !hasWritePermission(req, "broadcast")) {
    return sendError(res, "Akses ditolak (write)", 403);
  }
  try {
    const id = Number(req.params.id);
    const { cancelBroadcastCampaign } = await import("./broadcast-worker.js");
    await cancelBroadcastCampaign(id);
    await logAudit(req, "ACTION", "broadcast_campaign", id, "cancel");
    sendSuccess(res, { cancelled: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/broadcast/campaigns/:id/retry - reset failed recipients ke pending + relaunch */
router.post("/api/broadcast/campaigns/:id/retry", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "whatsapp") && !hasWritePermission(req, "broadcast")) {
    return sendError(res, "Akses ditolak (write)", 403);
  }
  try {
    const id = Number(req.params.id);
    const { retryFailedRecipients, startBroadcastCampaign } = await import("./broadcast-worker.js");
    const reset = await retryFailedRecipients(id);
    if (reset > 0) {
      await storage.updateBroadcastCampaign(id, { status: "running", completedAt: null } as any);
      await startBroadcastCampaign(id);
    }
    sendSuccess(res, { retried: reset });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** GET /api/broadcast/campaigns/:id/recipients - list recipients (paginated) */
router.get("/api/broadcast/campaigns/:id/recipients", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "broadcast") && !hasPermission(req, "whatsapp")) return sendError(res, "Akses ditolak", 403);
  try {
    const id = Number(req.params.id);
    const status = req.query.status as string | undefined;
    const limit = Math.min(500, Number(req.query.limit) || 100);
    const offset = Number(req.query.offset) || 0;
    const items = await storage.listBroadcastRecipients(id, { status, limit, offset });
    const counts = await storage.countBroadcastRecipients(id);
    sendSuccess(res, { items, counts });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/broadcast/test - kirim ke satu nomor (preview live tanpa enrol audience) */
router.post("/api/broadcast/test", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401); if (!hasWritePermission(req, "whatsapp") && !hasWritePermission(req, "broadcast")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const { phone, templateId, contentOverride, footerOverride, buttonsOverride, sampleVars } = req.body;
    if (!phone) return sendError(res, "phone wajib");
    if (!templateId) return sendError(res, "templateId wajib");
    const template = await storage.getMpwaTemplate(Number(templateId));
    if (!template) return sendError(res, "Template tidak ditemukan", 404);

    const { loadMpwaConfig, sendMpwaRichMessage } = await import("./mpwa.js");
    const config = await loadMpwaConfig();
    if (!config) return sendError(res, "MPWA belum dikonfigurasi", 400);

    let content = contentOverride ?? template.content;
    // Substitute placeholder dari sample vars
    if (sampleVars && typeof sampleVars === "object") {
      content = content.replace(/\{(\w+)\}/g, (_: string, k: string) => sampleVars[k] ?? `{${k}}`);
    }
    const footer = footerOverride ?? template.footer ?? undefined;
    const buttons = (() => {
      const raw = buttonsOverride ?? template.buttons;
      if (!raw) return undefined;
      try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (!Array.isArray(parsed)) return undefined;
        // v4.2.22: normalize ke MpwaButton {type, label, payload} dari MPWA spec {type, displayText, ...}
        const out: any[] = [];
        for (const b of parsed) {
          if (!b?.type) continue;
          const label = b.label ?? b.displayText ?? "";
          if (!label) continue;
          let payload: string | undefined;
          if (b.type === "url") payload = b.url ?? b.payload;
          else if (b.type === "call" || b.type === "phone") payload = b.phoneNumber ?? b.payload;
          else if (b.type === "copy") payload = b.copyText ?? b.payload;
          else if (b.type === "reply") payload = b.id ?? b.payload;
          const type = b.type === "phone" ? "call" : b.type;
          out.push({ type, label, payload });
          if (out.length === 5) break;
        }
        return out;
      } catch { return undefined; }
    })();

    const result = await sendMpwaRichMessage(config, phone, {
      message: content,
      footer,
      buttons,
      mediaUrl: template.mediaUrl ?? undefined,
      mediaType: (template.mediaType ?? undefined) as any,
    });
    sendSuccess(res, result);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ===========================================================
//  v4.2.20: WhatsApp v2 - Multi-device + Resellers + Template v2
// ===========================================================

/** GET /api/whatsapp/providers - list 12 providers + dynamic field requirements */
router.get("/api/whatsapp/providers", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const { WA_PROVIDERS } = await import("../shared/schema.js");
    sendSuccess(res, Object.entries(WA_PROVIDERS).map(([key, info]) => ({
      key, label: info.label, channel: info.channel, fields: info.fields,
    })));
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** GET /api/whatsapp/template-params - list 28+ parameter dinamis (untuk modal Petunjuk) */
router.get("/api/whatsapp/template-params", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const { TEMPLATE_PARAMS, TEMPLATE_PARAMS_RESELLER } = await import("./wa-providers.js");
    const type = req.query.type === "reseller" ? "reseller" : "pelanggan";
    sendSuccess(res, type === "reseller" ? TEMPLATE_PARAMS_RESELLER : TEMPLATE_PARAMS);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- WA DEVICES --
router.get("/api/whatsapp/devices", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "whatsapp")) return sendError(res, "Akses ditolak", 403);
  try {
    const active = req.query.active === "true";
    const list = await storage.listWaDevices(active ? { active: true } : undefined);
    // Mask sensitive config fields
    const safe = list.map(d => ({
      ...d,
      config: d.config ? maskWaConfig(d.config) : null,
    }));
    sendSuccess(res, safe);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/whatsapp/devices/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return; // admin only - config sensitive
  try {
    const d = await storage.getWaDevice(Number(req.params.id));
    if (!d) return sendError(res, "Device not found", 404);
    sendSuccess(res, d);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/whatsapp/devices", async (req: Request, res: Response) => {
  if (!requireWritePermission(req, res, "whatsapp")) return;
  try {
    const { name, phone, provider, config, delaySeconds, isActive } = req.body;
    if (!name || !phone || !provider) return sendError(res, "name + phone + provider wajib");
    const { WA_PROVIDERS } = await import("../shared/schema.js");
    if (!(provider in WA_PROVIDERS)) return sendError(res, `Provider "${provider}" tidak valid`);
    const channel = (WA_PROVIDERS as any)[provider].channel;
    const d = await storage.createWaDevice({
      name, phone, provider,
      providerChannel: channel,
      config: config ? JSON.stringify(config) : null,
      delaySeconds: Number(delaySeconds) || 2,
      isActive: isActive === false ? 0 : 1,
      createdBy: req.authUser!.id,
      createdAt: new Date().toISOString(),
    } as any);
    await logAudit(req, "CREATE", "wa_device", d.id, name);
    sendSuccess(res, d, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.put("/api/whatsapp/devices/:id", async (req: Request, res: Response) => {
  if (!requireWritePermission(req, res, "whatsapp")) return;
  try {
    const id = Number(req.params.id);
    const existing = await storage.getWaDevice(id);
    if (!existing) return sendError(res, "Device not found", 404);
    const update: any = {};
    if (req.body.name !== undefined) update.name = req.body.name;
    if (req.body.phone !== undefined) update.phone = req.body.phone;
    if (req.body.provider !== undefined) {
      const { WA_PROVIDERS } = await import("../shared/schema.js");
      if (!(req.body.provider in WA_PROVIDERS)) return sendError(res, "Provider tidak valid");
      update.provider = req.body.provider;
      update.providerChannel = (WA_PROVIDERS as any)[req.body.provider].channel;
    }
    if (req.body.config !== undefined) {
      // Merge dengan existing config (jangan overwrite kalau partial)
      let existingCfg: any = {};
      try { existingCfg = existing.config ? JSON.parse(existing.config) : {}; } catch {}
      update.config = JSON.stringify({ ...existingCfg, ...req.body.config });
    }
    if (req.body.delaySeconds !== undefined) update.delaySeconds = Number(req.body.delaySeconds);
    if (req.body.isActive !== undefined) update.isActive = req.body.isActive ? 1 : 0;
    const updated = await storage.updateWaDevice(id, update);
    await logAudit(req, "UPDATE", "wa_device", id, existing.name);
    sendSuccess(res, updated);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.delete("/api/whatsapp/devices/:id", async (req: Request, res: Response) => {
  if (!requireWritePermission(req, res, "whatsapp")) return;
  try {
    const id = Number(req.params.id);
    const d = await storage.getWaDevice(id);
    if (!d) return sendError(res, "Device not found", 404);
    await storage.deleteWaDevice(id);
    await logAudit(req, "DELETE", "wa_device", id, d.name);
    sendSuccess(res, { deleted: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/whatsapp/devices/:id/test - kirim test text ke nomor admin */
router.post("/api/whatsapp/devices/:id/test", async (req: Request, res: Response) => {
  if (!requireWritePermission(req, res, "whatsapp")) return;
  try {
    const id = Number(req.params.id);
    const { phone } = req.body;
    if (!phone) return sendError(res, "phone wajib");
    const device = await storage.getWaDevice(id);
    if (!device) return sendError(res, "Device not found", 404);
    const { sendViaDevice } = await import("./wa-providers.js");
    const result = await sendViaDevice(device, phone, {
      message: `*Test Koneksi JABNET WhatsApp*\nDevice: ${device.name}\nProvider: ${device.provider}\nWaktu: ${new Date().toLocaleString("id-ID")}`,
    });
    if (result.sent) await storage.markWaDeviceSuccess(id);
    else await storage.markWaDeviceError(id, result.error ?? "Unknown");
    sendSuccess(res, result);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ================================================================
//  v4.2.21: MPWA Full Integration - Device Management
// ================================================================

/** Helper: build MPWAClient from device (admin only - config in plain) */
async function getMpwaClientForDevice(deviceId: number) {
  const device = await storage.getWaDevice(deviceId);
  if (!device) throw new Error("Device not found");
  if (device.provider !== "mpwa") throw new Error("Endpoint ini hanya untuk provider MPWA");
  let cfg: any = {};
  try { cfg = device.config ? JSON.parse(device.config) : {}; } catch {}
  if (!cfg.apiKey) throw new Error("Device belum punya api_key");
  const { MPWAClient } = await import("./mpwa-client.js");
  return {
    device,
    client: new MPWAClient({
      apiKey: cfg.apiKey,
      sender: device.phone,
      baseUrl: cfg.url || "https://mpwa.jabnet.id",
    }),
  };
}

/** POST /api/whatsapp/devices/:id/qr - generate QR Code */
router.post("/api/whatsapp/devices/:id/qr", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const id = Number(req.params.id);
    const { client, device } = await getMpwaClientForDevice(id);
    const force = !!req.body?.force;
    const result = await client.generateQR(device.phone, force);

    // Update device state
    if (result.qrcode) {
      await storage.patchWaDeviceState(id, {
        connectionStatus: "qr_pending",
        lastQrAt: new Date().toISOString(),
        lastQrData: result.qrcode,
      });
    } else if (result.msg === "Device already connected!") {
      await storage.patchWaDeviceState(id, {
        connectionStatus: "connected",
        lastQrData: null,
      });
    }
    sendSuccess(res, result);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/whatsapp/devices/:id/logout - disconnect device dari MPWA */
router.post("/api/whatsapp/devices/:id/logout", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const id = Number(req.params.id);
    const { client } = await getMpwaClientForDevice(id);
    const result = await client.logoutDevice();
    if (result.status) {
      await storage.patchWaDeviceState(id, {
        connectionStatus: "disconnect",
        lastQrData: null,
      });
    }
    sendSuccess(res, result);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/whatsapp/devices/:id/delete-remote - delete device di MPWA (tidak hapus row lokal) */
router.post("/api/whatsapp/devices/:id/delete-remote", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const id = Number(req.params.id);
    const { client } = await getMpwaClientForDevice(id);
    const result = await client.deleteDevice();
    if (result.status) {
      await storage.patchWaDeviceState(id, {
        connectionStatus: "unknown",
        lastQrData: null,
      });
    }
    sendSuccess(res, result);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** GET /api/whatsapp/devices/:id/info - fetch live status dari MPWA */
router.get("/api/whatsapp/devices/:id/info", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "whatsapp")) return sendError(res, "Akses ditolak", 403);
  try {
    const id = Number(req.params.id);
    const { client, device } = await getMpwaClientForDevice(id);

    // v4.2.21 fix: coba beberapa endpoint path varian MPWA
    // Spec asli pakai /info-devices, tapi instance lain mungkin /public/info-devices
    let result = await client.infoDevice();
    let endpointTried = "/info-devices";

    // Kalau MPWA balikin status:false dengan msg yang seperti "not found"/"invalid" → coba varian /public/
    if (result.status === false && typeof result.msg === "string") {
      const msg = result.msg.toLowerCase();
      if (msg.includes("not found") || msg.includes("invalid endpoint") || msg.includes("404")) {
        console.log(`[wa-info] /info-devices gagal (${result.msg}), coba /public/info-devices...`);
        // Manual call ke /public/ variant
        try {
          const cfg = JSON.parse(device.config ?? "{}");
          const fetchRes = await fetch(`${(cfg.url ?? "https://mpwa.jabnet.id").replace(/\/$/, "")}/public/info-devices`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ api_key: cfg.apiKey, number: device.phone }),
            signal: AbortSignal.timeout(20_000),
          });
          const alt: any = await fetchRes.json().catch(() => null);
          if (alt) { result = alt; endpointTried = "/public/info-devices"; }
        } catch (e: any) {
          console.warn(`[wa-info] /public variant juga gagal: ${e.message}`);
        }
      }
    }

    console.log(`[wa-info] device=${id} (${device.phone}) endpoint=${endpointTried} MPWA response:`, JSON.stringify(result).slice(0, 500));

    // Cache info + update connection status
    if (result.info && Array.isArray(result.info) && result.info.length > 0) {
      const info = result.info[0];
      const isConnected = String(info?.status ?? "").toLowerCase() === "connected";
      await storage.patchWaDeviceState(id, {
        connectionStatus: isConnected ? "connected" : "disconnect",
        deviceInfo: JSON.stringify(info),
        webhookUrl: info?.webhook ?? device.webhookUrl ?? null,
      });
    } else if (result.status === false) {
      // MPWA returned error - simpan ke lastError supaya keliatan di UI
      const msgStr = typeof result.msg === "string" ? result.msg : JSON.stringify(result.msg ?? result);
      await storage.markWaDeviceError(id, msgStr);
      await storage.patchWaDeviceState(id, {
        connectionStatus: "disconnect",
        deviceInfo: JSON.stringify(result),
      });
    }

    // Return full response termasuk MPWA status (true/false) supaya UI bisa display
    const cfgParsed = JSON.parse(device.config ?? "{}");
    sendSuccess(res, {
      ...result,
      _meta: {
        deviceId: id,
        devicePhone: device.phone,
        baseUrl: cfgParsed.url || "https://mpwa.jabnet.id",
        endpointTried,
      },
    });
  } catch (e: any) {
    console.error(`[wa-info] error:`, e.message);
    sendError(res, e.message, 500);
  }
});

/** POST /api/whatsapp/devices/:id/check-number - verifikasi nomor exists di WA */
router.post("/api/whatsapp/devices/:id/check-number", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "whatsapp")) return sendError(res, "Akses ditolak", 403);
  try {
    const id = Number(req.params.id);
    const { phone } = req.body;
    if (!phone) return sendError(res, "phone wajib");
    const { client } = await getMpwaClientForDevice(id);
    const result = await client.checkNumber(phone);
    sendSuccess(res, result);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/whatsapp/devices/:id/webhook-token - generate/refresh webhook token */
router.post("/api/whatsapp/devices/:id/webhook-token", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const id = Number(req.params.id);
    const device = await storage.getWaDevice(id);
    if (!device) return sendError(res, "Device not found", 404);
    // Generate random token (32 hex)
    const token = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, "0")).join("");
    await storage.patchWaDeviceState(id, { webhookToken: token });

    // Build webhook URL (host detection from request)
    const host = req.get("host");
    const proto = req.get("x-forwarded-proto") ?? req.protocol ?? "https";
    const webhookUrl = `${proto}://${host}/api/whatsapp/webhook/mpwa/${token}`;
    sendSuccess(res, { token, webhookUrl });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ================================================================
//  Extended Send Endpoints (poll, list, location, vcard, sticker)
// ================================================================

/** POST /api/whatsapp/devices/:id/send - universal send (kirim via device) */
router.post("/api/whatsapp/devices/:id/send", async (req: Request, res: Response) => {
  if (!requireWritePermission(req, res, "whatsapp")) return;
  try {
    const id = Number(req.params.id);
    const { phone, payload } = req.body;
    if (!phone) return sendError(res, "phone wajib");
    if (!payload || typeof payload !== "object") return sendError(res, "payload wajib");
    const device = await storage.getWaDevice(id);
    if (!device) return sendError(res, "Device not found", 404);
    const { sendViaDevice } = await import("./wa-providers.js");
    const result = await sendViaDevice(device, phone, payload);
    if (result.sent) await storage.markWaDeviceSuccess(id);
    else await storage.markWaDeviceError(id, result.error ?? "Unknown");
    sendSuccess(res, result);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ================================================================
//  Webhook Receiver - MPWA incoming messages
// ================================================================

/** POST /api/whatsapp/webhook/mpwa/:token - receive incoming WhatsApp messages */
router.post("/api/whatsapp/webhook/mpwa/:token", async (req: Request, res: Response) => {
  // PUBLIC endpoint - auth via webhook_token di URL path
  try {
    const token = String(req.params.token);
    if (!token || token.length < 8) return res.status(400).json({ status: false, msg: "Invalid token" });

    const device = await storage.getWaDeviceByWebhookToken(token);
    if (!device) {
      console.warn(`[webhook-mpwa] unknown token: ${token.slice(0, 8)}…`);
      return res.status(404).json({ status: false, msg: "Device not found" });
    }

    const { isMPWAWebhookPayload } = await import("./mpwa-client.js");
    const body = req.body;
    if (!isMPWAWebhookPayload(body)) {
      // Tetap accept untuk debug, tapi log warning
      console.warn(`[webhook-mpwa-${device.id}] non-standard payload shape:`, JSON.stringify(body).slice(0, 200));
    }

    const fromNumber = String(body.from ?? body.participant ?? "").replace(/@.*$/, "").trim();
    const isGroup = !!body.participant && body.from?.endsWith?.("@g.us");

    await storage.insertWaInboxMessage({
      deviceId: device.id,
      fromNumber,
      fromName: body.name ?? null,
      message: body.message ?? body.media?.caption ?? null,
      mediaType: body.mimetype?.split("/")?.[0] ?? null,
      mediaUrl: null, // TODO: save buffer ke disk kalau perlu
      isGroup: isGroup ? 1 : 0,
      participant: isGroup ? body.participant ?? null : null,
      rawPayload: JSON.stringify(body),
      status: "new",
      receivedAt: new Date().toISOString(),
    } as any);

    // Quick ack ke MPWA
    res.json({ status: true, msg: "Received" });
  } catch (e: any) {
    console.error("[webhook-mpwa] error:", e.message);
    res.status(500).json({ status: false, msg: e.message });
  }
});

/** GET /api/whatsapp/devices/:id/inbox - list incoming messages */
router.get("/api/whatsapp/devices/:id/inbox", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "whatsapp")) return sendError(res, "Akses ditolak", 403);
  try {
    const id = Number(req.params.id);
    const status = req.query.status as string | undefined;
    const limit = Math.min(500, Number(req.query.limit) || 100);
    const offset = Number(req.query.offset) || 0;
    const items = await storage.listWaInbox({ deviceId: id, status, limit, offset });
    const newCount = await storage.countWaInboxNew(id);
    sendSuccess(res, { items, newCount });
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** PATCH /api/whatsapp/inbox/:id - mark as read/replied/archived */
router.patch("/api/whatsapp/inbox/:id", async (req: Request, res: Response) => {
  if (!requireWritePermission(req, res, "whatsapp")) return;
  try {
    const id = Number(req.params.id);
    const status = String(req.body?.status ?? "");
    if (!["new", "read", "replied", "archived"].includes(status)) return sendError(res, "Status invalid");
    const patch: any = { status };
    if (status === "replied") patch.repliedAt = new Date().toISOString();
    await storage.updateWaInboxMessage(id, patch);
    sendSuccess(res, { updated: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- RESELLERS --
router.get("/api/resellers", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "resellers")) return sendError(res, "Akses ditolak", 403);
  try {
    const search = req.query.search as string | undefined;
    const active = req.query.active === "true";
    const list = await storage.listResellers({ search, active: active || undefined });
    sendSuccess(res, list);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/resellers/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "resellers")) return sendError(res, "Akses ditolak", 403);
  try {
    const r = await storage.getReseller(Number(req.params.id));
    if (!r) return sendError(res, "Reseller not found", 404);
    sendSuccess(res, r);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/resellers", async (req: Request, res: Response) => {
  if (!requireWritePermission(req, res, "resellers")) return;
  try {
    const { name, phone, email, address, district, saldo, commissionRate, joinedAt, notes } = req.body;
    if (!name || !phone) return sendError(res, "name + phone wajib");
    const r = await storage.createReseller({
      name, phone,
      email: email ?? null,
      address: address ?? null,
      district: district ?? null,
      saldo: Number(saldo) || 0,
      commissionRate: Number(commissionRate) || 0,
      joinedAt: joinedAt ?? new Date().toISOString(),
      notes: notes ?? null,
      isActive: 1,
      createdAt: new Date().toISOString(),
    } as any);
    await logAudit(req, "CREATE", "reseller", r.id, r.name);
    sendSuccess(res, r, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.put("/api/resellers/:id", async (req: Request, res: Response) => {
  if (!requireWritePermission(req, res, "resellers")) return;
  try {
    const id = Number(req.params.id);
    const existing = await storage.getReseller(id);
    if (!existing) return sendError(res, "Reseller not found", 404);
    const update: any = {};
    for (const k of ["name", "phone", "email", "address", "district", "saldo", "commissionRate", "joinedAt", "notes", "isActive"]) {
      if (k in req.body) update[k] = req.body[k];
    }
    const r = await storage.updateReseller(id, update);
    sendSuccess(res, r);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.delete("/api/resellers/:id", async (req: Request, res: Response) => {
  if (!requireWritePermission(req, res, "resellers")) return;
  try {
    const id = Number(req.params.id);
    await storage.deleteReseller(id);
    sendSuccess(res, { deleted: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ===========================================================
//  v4.2.24: PHONEBOOKS - custom contact lists untuk broadcast
// ===========================================================

router.get("/api/phonebooks", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "phonebooks") && !hasPermission(req, "whatsapp")) {
    return sendError(res, "Akses ditolak", 403);
  }
  try {
    const list = await storage.listPhonebooks();
    sendSuccess(res, list);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/phonebooks/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "phonebooks") && !hasPermission(req, "whatsapp")) {
    return sendError(res, "Akses ditolak", 403);
  }
  try {
    const pb = await storage.getPhonebook(Number(req.params.id));
    if (!pb) return sendError(res, "Phonebook not found", 404);
    sendSuccess(res, pb);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/phonebooks", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "phonebooks") && !hasWritePermission(req, "whatsapp")) {
    return sendError(res, "Akses ditolak (write)", 403);
  }
  try {
    const { name, description, color, icon } = req.body;
    if (!name) return sendError(res, "name wajib");
    const pb = await storage.createPhonebook({
      name, description: description ?? null,
      color: color ?? "#7367f0", icon: icon ?? null,
      contactCount: 0, createdBy: req.authUser!.id,
      createdAt: new Date().toISOString(),
    } as any);
    sendSuccess(res, pb, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.put("/api/phonebooks/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "phonebooks") && !hasWritePermission(req, "whatsapp")) {
    return sendError(res, "Akses ditolak (write)", 403);
  }
  try {
    const id = Number(req.params.id);
    const existing = await storage.getPhonebook(id);
    if (!existing) return sendError(res, "Phonebook not found", 404);
    const update: any = {};
    for (const k of ["name", "description", "color", "icon"]) {
      if (k in req.body) update[k] = req.body[k];
    }
    const pb = await storage.updatePhonebook(id, update);
    sendSuccess(res, pb);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.delete("/api/phonebooks/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "phonebooks") && !hasWritePermission(req, "whatsapp")) {
    return sendError(res, "Akses ditolak (write)", 403);
  }
  try {
    await storage.deletePhonebook(Number(req.params.id));
    sendSuccess(res, { deleted: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- Contacts per phonebook --
router.get("/api/phonebooks/:id/contacts", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "phonebooks") && !hasPermission(req, "whatsapp")) {
    return sendError(res, "Akses ditolak", 403);
  }
  try {
    const phonebookId = Number(req.params.id);
    const search = req.query.search as string | undefined;
    const limit = Math.min(2000, Number(req.query.limit) || 500);
    const offset = Number(req.query.offset) || 0;
    const items = await storage.listPhonebookContacts(phonebookId, { search, limit, offset });
    sendSuccess(res, items);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/phonebooks/:id/contacts", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "phonebooks") && !hasWritePermission(req, "whatsapp")) {
    return sendError(res, "Akses ditolak (write)", 403);
  }
  try {
    const phonebookId = Number(req.params.id);
    const { name, phone, email, address, notes, customFields, customerId } = req.body;
    if (!name || !phone) return sendError(res, "name + phone wajib");
    const c = await storage.createPhonebookContact({
      phonebookId,
      name, phone,
      email: email ?? null,
      address: address ?? null,
      notes: notes ?? null,
      customFields: customFields ? (typeof customFields === "string" ? customFields : JSON.stringify(customFields)) : null,
      customerId: customerId ?? null,
      createdAt: new Date().toISOString(),
    } as any);
    sendSuccess(res, c, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

/** POST /api/phonebooks/:id/contacts/bulk - bulk add (import dari customers, CSV, dll) */
router.post("/api/phonebooks/:id/contacts/bulk", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "phonebooks") && !hasWritePermission(req, "whatsapp")) {
    return sendError(res, "Akses ditolak (write)", 403);
  }
  try {
    const phonebookId = Number(req.params.id);
    const { contacts } = req.body;
    if (!Array.isArray(contacts)) return sendError(res, "contacts harus array");
    // Validate + normalize
    const items = contacts
      .filter((c: any) => c && c.name && c.phone)
      .map((c: any) => ({
        name: String(c.name).trim(),
        phone: String(c.phone).replace(/[\s\-()+ ]/g, "").replace(/^\+/, "").replace(/^0/, "62"),
        email: c.email ? String(c.email).trim() : null,
        address: c.address ? String(c.address).trim() : null,
        notes: c.notes ? String(c.notes).trim() : null,
        customFields: c.customFields ?? null,
        customerId: c.customerId ?? null,
        // v4.2.27: tags untuk kategorisasi
        tags: Array.isArray(c.tags) ? c.tags.filter((t: any) => typeof t === "string" && t.trim()) : null,
      }));
    const result = await storage.bulkCreatePhonebookContacts(phonebookId, items);
    sendSuccess(res, result);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.put("/api/phonebooks/contacts/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "phonebooks") && !hasWritePermission(req, "whatsapp")) {
    return sendError(res, "Akses ditolak (write)", 403);
  }
  try {
    const id = Number(req.params.id);
    const update: any = {};
    for (const k of ["name", "phone", "email", "address", "notes", "customFields"]) {
      if (k in req.body) update[k] = req.body[k];
    }
    // v4.2.27: tags update (sanitize array of strings)
    if ("tags" in req.body) {
      const t = req.body.tags;
      update.tags = Array.isArray(t)
        ? JSON.stringify(t.filter((x: any) => typeof x === "string" && x.trim()))
        : null;
    }
    const c = await storage.updatePhonebookContact(id, update);
    sendSuccess(res, c);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// v4.2.27: list distinct tags untuk filter chip
router.get("/api/phonebooks/:id/tags", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "phonebooks") && !hasPermission(req, "whatsapp")) {
    return sendError(res, "Akses ditolak", 403);
  }
  try {
    const phonebookId = Number(req.params.id);
    const tags = await storage.listPhonebookTags(phonebookId);
    sendSuccess(res, tags);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// v4.2.27: bulk add tag ke multiple kontak
router.post("/api/phonebooks/contacts/bulk-add-tags", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "phonebooks") && !hasWritePermission(req, "whatsapp")) {
    return sendError(res, "Akses ditolak (write)", 403);
  }
  try {
    const { contactIds, tags } = req.body;
    if (!Array.isArray(contactIds) || !Array.isArray(tags)) {
      return sendError(res, "contactIds dan tags harus array");
    }
    const cleanTags = tags.filter((t: any) => typeof t === "string" && t.trim()).map((t: string) => t.trim());
    if (cleanTags.length === 0) return sendError(res, "tags kosong");
    const updated = await storage.bulkAddTagsToContacts(contactIds.map(Number), cleanTags);
    sendSuccess(res, { updated, tagsAdded: cleanTags });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// v4.2.27: bulk remove tag dari multiple kontak
router.post("/api/phonebooks/contacts/bulk-remove-tag", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "phonebooks") && !hasWritePermission(req, "whatsapp")) {
    return sendError(res, "Akses ditolak (write)", 403);
  }
  try {
    const { contactIds, tag } = req.body;
    if (!Array.isArray(contactIds) || typeof tag !== "string") {
      return sendError(res, "contactIds harus array + tag harus string");
    }
    const updated = await storage.bulkRemoveTagFromContacts(contactIds.map(Number), tag);
    sendSuccess(res, { updated, tagRemoved: tag });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// v4.2.27: import dari phonebook lain (cross-phonebook copy / merge)
router.post("/api/phonebooks/:id/import-from-phonebook", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "phonebooks") && !hasWritePermission(req, "whatsapp")) {
    return sendError(res, "Akses ditolak (write)", 403);
  }
  try {
    const targetId = Number(req.params.id);
    const { sourcePhonebookId, contactIds, addTags } = req.body;
    if (!sourcePhonebookId) return sendError(res, "sourcePhonebookId wajib");
    if (sourcePhonebookId === targetId) return sendError(res, "Source dan target phonebook tidak boleh sama");

    // Fetch contacts dari source phonebook
    const allSourceContacts = await storage.listPhonebookContacts(Number(sourcePhonebookId), {});
    const ids = Array.isArray(contactIds) && contactIds.length ? new Set(contactIds.map(Number)) : null;
    const selected = ids ? allSourceContacts.filter(c => ids.has(c.id)) : allSourceContacts;

    if (selected.length === 0) return sendError(res, "Tidak ada kontak yang dipilih");

    // Merge tags kalau addTags ada
    const extraTags: string[] = Array.isArray(addTags)
      ? addTags.filter((t: any) => typeof t === "string" && t.trim()).map((t: string) => t.trim())
      : [];

    const items = selected.map(c => {
      let existingTags: string[] = [];
      try { existingTags = (c as any).tags ? JSON.parse((c as any).tags) : []; } catch {}
      const mergedTags = Array.from(new Set([...existingTags, ...extraTags]));
      return {
        name: c.name,
        phone: c.phone,
        email: c.email,
        address: c.address,
        notes: c.notes,
        customFields: c.customFields,
        customerId: c.customerId,
        tags: mergedTags.length ? mergedTags : null,
      };
    });

    const result = await storage.bulkCreatePhonebookContacts(targetId, items as any);
    sendSuccess(res, { ...result, source: sourcePhonebookId, total: selected.length });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// v4.2.27: smart filter customers untuk import - return customer list pakai filter (paket, kecamatan, status, etc)
// Pakai prefix /api/phonebook-import/ untuk avoid clash dengan /api/phonebooks/:id
router.get("/api/phonebook-import/customers", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "phonebooks") && !hasPermission(req, "whatsapp")) {
    return sendError(res, "Akses ditolak", 403);
  }
  try {
    const { paket, kecamatan, status, search } = req.query as any;
    const all: any[] = await storage.getCustomers();
    let filtered = all.filter(c => c.phone && c.phone.trim());

    if (paket && paket !== "all") {
      filtered = filtered.filter(c => (c as any).package === paket || (c as any).packageName === paket);
    }
    if (kecamatan && kecamatan !== "all") {
      filtered = filtered.filter(c => (c as any).district === kecamatan || (c as any).kecamatan === kecamatan);
    }
    if (status && status !== "all") {
      if (status === "active") filtered = filtered.filter(c => !(c as any).isIsolir);
      else if (status === "isolir") filtered = filtered.filter(c => (c as any).isIsolir);
      else if (status === "overdue") filtered = filtered.filter(c => (c as any).billingStatus === "overdue");
    }
    if (search) {
      const q = String(search).toLowerCase();
      filtered = filtered.filter(c =>
        c.name?.toLowerCase().includes(q) ||
        c.customerId?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q)
      );
    }

    sendSuccess(res, {
      items: filtered.map(c => ({
        id: c.id,
        customerId: c.customerId,
        name: c.name,
        phone: c.phone,
        district: (c as any).district ?? null,
        package: (c as any).package ?? null,
        isIsolir: (c as any).isIsolir ?? false,
        billingStatus: (c as any).billingStatus ?? null,
      })),
      total: filtered.length,
      filters: { paket, kecamatan, status, search },
    });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// v4.2.27: list filter options (paket, kecamatan) untuk dropdown smart filter
router.get("/api/phonebook-import/customer-filters", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "phonebooks") && !hasPermission(req, "whatsapp")) {
    return sendError(res, "Akses ditolak", 403);
  }
  try {
    const all: any[] = await storage.getCustomers();
    const paketSet = new Set<string>();
    const kecamatanSet = new Set<string>();
    for (const c of all) {
      const p = (c as any).package ?? (c as any).packageName;
      const k = (c as any).district ?? (c as any).kecamatan;
      if (p && typeof p === "string" && p.trim()) paketSet.add(p);
      if (k && typeof k === "string" && k.trim()) kecamatanSet.add(k);
    }
    sendSuccess(res, {
      paket: Array.from(paketSet).sort(),
      kecamatan: Array.from(kecamatanSet).sort(),
      status: ["all", "active", "isolir", "overdue"],
    });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.delete("/api/phonebooks/contacts/:id", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "phonebooks") && !hasWritePermission(req, "whatsapp")) {
    return sendError(res, "Akses ditolak (write)", 403);
  }
  try {
    await storage.deletePhonebookContact(Number(req.params.id));
    sendSuccess(res, { deleted: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/phonebooks/contacts/bulk-delete", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "phonebooks") && !hasWritePermission(req, "whatsapp")) {
    return sendError(res, "Akses ditolak (write)", 403);
  }
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return sendError(res, "ids harus array");
    const deleted = await storage.deletePhonebookContactsBulk(ids.map(Number));
    sendSuccess(res, { deleted });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// Helper: mask sensitive fields di config JSON (api_key, token, secret)
function maskWaConfig(jsonStr: string): string {
  try {
    const obj = JSON.parse(jsonStr);
    const masked: any = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v !== "string") { masked[k] = v; continue; }
      if (/key|token|secret|password/i.test(k)) {
        masked[k] = v.length > 8 ? v.slice(0, 4) + "****" + v.slice(-4) : "****";
      } else {
        masked[k] = v;
      }
    }
    return JSON.stringify(masked);
  } catch { return jsonStr; }
}

// ===========================================================
//  MIKROTIK ROUTER MANAGEMENT
// ===========================================================
import {
  testConnection as mikrotikTest,
  getSystemResource,
  getPppSecrets,
  getPppActive,
  disconnectPppSession,
  getPppProfiles,
  getInterfaces,
  getIpPools,
  getLog as getMikrotikLog,
  // CRUD methods
  createPppProfile, updatePppProfile, deletePppProfile,
  createPppSecret, updatePppSecret, deletePppSecret, enableDisablePppSecret,
  getSimpleQueues, createSimpleQueue, updateSimpleQueue, deleteSimpleQueue,
  // Utility read-only
  getDhcpLeases, getArpTable, getNeighbors, getFirewallAddressList,
  type MikrotikCredentials,
} from "./mikrotik.js";

/** Convert camelCase keys to dash-case for RouterOS API */
function camelToDash(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const dashKey = key.replace(/([A-Z])/g, (_, c) => `-${c.toLowerCase()}`);
    result[dashKey] = value;
  }
  return result;
}

function routerToCreds(r: { host: string; port: number | null; username: string; password: string; useSsl: number | null }): MikrotikCredentials {
  return {
    host: r.host,
    port: r.port ?? 443,
    username: r.username,
    password: r.password,
    useSsl: r.useSsl !== 0,
  };
}

// -- CRUD Routers --
router.get("/api/mikrotik/routers", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const all = await storage.getMikrotikRouters();
    // Strip password from response
    const safe = all.map(({ password, ...r }) => r);
    sendSuccess(res, safe);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/mikrotik/routers/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const r = await storage.getMikrotikRouter(Number(req.params.id));
    if (!r) return sendError(res, "Router tidak ditemukan", 404);
    const { password, ...safe } = r;
    sendSuccess(res, safe);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/mikrotik/routers", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { name, host, port, username, password, useSsl, notes } = req.body;
    if (!name || !host || !username || !password) {
      return sendError(res, "Nama, host, username, dan password wajib diisi");
    }
    const r = await storage.createMikrotikRouter({
      name, host, port: port || 443, username, password,
      useSsl: useSsl !== undefined ? (useSsl ? 1 : 0) : 1,
      isActive: 1, notes: notes || null,
      createdAt: new Date().toISOString(),
    });
    await logAudit(req, "CREATE", "mikrotik_router", r.id, r.name);
    const { password: _p, ...safe } = r;
    sendSuccess(res, safe, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.put("/api/mikrotik/routers/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const id = Number(req.params.id);
    const { name, host, port, username, password, useSsl, notes, isActive } = req.body;
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (host !== undefined) updateData.host = host;
    if (port !== undefined) updateData.port = port;
    if (username !== undefined) updateData.username = username;
    if (password !== undefined && password !== "") updateData.password = password;
    if (useSsl !== undefined) updateData.useSsl = useSsl ? 1 : 0;
    if (notes !== undefined) updateData.notes = notes;
    if (isActive !== undefined) updateData.isActive = isActive ? 1 : 0;

    const updated = await storage.updateMikrotikRouter(id, updateData);
    if (!updated) return sendError(res, "Router tidak ditemukan", 404);
    await logAudit(req, "UPDATE", "mikrotik_router", id, updated.name);
    const { password: _p, ...safe } = updated;
    sendSuccess(res, safe);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.delete("/api/mikrotik/routers/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const id = Number(req.params.id);
    const r = await storage.getMikrotikRouter(id);
    if (!r) return sendError(res, "Router tidak ditemukan", 404);
    await storage.deleteMikrotikRouter(id);
    await logAudit(req, "DELETE", "mikrotik_router", id, r.name);
    sendSuccess(res, { deleted: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- Test Connection --
router.post("/api/mikrotik/routers/:id/test", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const r = await storage.getMikrotikRouter(Number(req.params.id));
    if (!r) return sendError(res, "Router tidak ditemukan", 404);
    const result = await mikrotikTest(routerToCreds(r));
    // Update router info on successful test
    await storage.updateMikrotikRouter(r.id, {
      routerOsVersion: result.version,
      boardName: result.boardName,
      identity: result.identity,
      lastSeen: new Date().toISOString(),
    });
    sendSuccess(res, result);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// Also support testing with ad-hoc credentials (for testing before saving)
router.post("/api/mikrotik/test-connection", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { host, port, username, password, useSsl } = req.body;
    if (!host || !username || !password) return sendError(res, "Host, username, dan password wajib");
    const result = await mikrotikTest({
      host, port: port || 8728, username, password, useSsl: !!useSsl,
    });
    sendSuccess(res, result);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- System Resource --
router.get("/api/mikrotik/routers/:id/resource", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const r = await storage.getMikrotikRouter(Number(req.params.id));
    if (!r) return sendError(res, "Router tidak ditemukan", 404);
    const resource = await getSystemResource(routerToCreds(r));
    // Also update lastSeen
    await storage.updateMikrotikRouter(r.id, { lastSeen: new Date().toISOString() });
    sendSuccess(res, resource);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- PPPoE Active Sessions --
router.get("/api/mikrotik/routers/:id/ppp/active", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const r = await storage.getMikrotikRouter(Number(req.params.id));
    if (!r) return sendError(res, "Router tidak ditemukan", 404);
    const sessions = await getPppActive(routerToCreds(r));
    sendSuccess(res, sessions);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- PPPoE Secrets --
router.get("/api/mikrotik/routers/:id/ppp/secret", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const r = await storage.getMikrotikRouter(Number(req.params.id));
    if (!r) return sendError(res, "Router tidak ditemukan", 404);
    const secrets = await getPppSecrets(routerToCreds(r));
    sendSuccess(res, secrets);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- PPP Profiles --
router.get("/api/mikrotik/routers/:id/ppp/profile", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const r = await storage.getMikrotikRouter(Number(req.params.id));
    if (!r) return sendError(res, "Router tidak ditemukan", 404);
    const profiles = await getPppProfiles(routerToCreds(r));
    sendSuccess(res, profiles);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- Disconnect PPPoE Session --
router.post("/api/mikrotik/routers/:id/ppp/disconnect", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const r = await storage.getMikrotikRouter(Number(req.params.id));
    if (!r) return sendError(res, "Router tidak ditemukan", 404);
    const { sessionId } = req.body;
    if (!sessionId) return sendError(res, "sessionId wajib diisi");
    await disconnectPppSession(routerToCreds(r), sessionId);
    await logAudit(req, "UPDATE", "ppp_session", 0, `Disconnect ${sessionId} on ${r.name}`);
    sendSuccess(res, { disconnected: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- Interfaces --
router.get("/api/mikrotik/routers/:id/interfaces", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const r = await storage.getMikrotikRouter(Number(req.params.id));
    if (!r) return sendError(res, "Router tidak ditemukan", 404);
    const ifaces = await getInterfaces(routerToCreds(r));
    sendSuccess(res, ifaces);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- IP Pools --
router.get("/api/mikrotik/routers/:id/ip/pool", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const r = await storage.getMikrotikRouter(Number(req.params.id));
    if (!r) return sendError(res, "Router tidak ditemukan", 404);
    const pools = await getIpPools(routerToCreds(r));
    sendSuccess(res, pools);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- Logs --
router.get("/api/mikrotik/routers/:id/log", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const r = await storage.getMikrotikRouter(Number(req.params.id));
    if (!r) return sendError(res, "Router tidak ditemukan", 404);
    const limit = parseInt(req.query.limit as string) || 50;
    const logs = await getMikrotikLog(routerToCreds(r), limit);
    sendSuccess(res, logs);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// -- Aggregated Active Sessions (all routers) --
router.get("/api/mikrotik/sessions/active", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const allRouters = await storage.getMikrotikRouters();
    const activeRouters = allRouters.filter(r => r.isActive !== 0);
    const results: Array<{
      routerId: number;
      routerName: string;
      sessions: Record<string, string>[];
      error?: string;
    }> = [];
    await Promise.allSettled(
      activeRouters.map(async (r) => {
        try {
          const sessions = await getPppActive(routerToCreds(r));
          results.push({ routerId: r.id, routerName: r.name, sessions });
        } catch (e: any) {
          results.push({ routerId: r.id, routerName: r.name, sessions: [], error: e.message });
        }
      })
    );
    sendSuccess(res, results);
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ===========================================================
//  PPP PROFILE CRUD
// ===========================================================

router.post("/api/mikrotik/routers/:id/ppp/profile", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const r = await storage.getMikrotikRouter(Number(req.params.id));
    if (!r) return sendError(res, "Router tidak ditemukan", 404);
    const data = camelToDash(req.body);
    const result = await createPppProfile(routerToCreds(r), data);
    await logAudit(req, "CREATE", "ppp_profile", 0, `Profile ${req.body.name} on ${r.name}`);
    sendSuccess(res, result, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.put("/api/mikrotik/routers/:id/ppp/profile/:profileId", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const r = await storage.getMikrotikRouter(Number(req.params.id));
    if (!r) return sendError(res, "Router tidak ditemukan", 404);
    const data = camelToDash(req.body);
    await updatePppProfile(routerToCreds(r), String(req.params.profileId), data);
    await logAudit(req, "UPDATE", "ppp_profile", 0, `Profile ${req.body.name || String(req.params.profileId)} on ${r.name}`);
    sendSuccess(res, { updated: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.delete("/api/mikrotik/routers/:id/ppp/profile/:profileId", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const r = await storage.getMikrotikRouter(Number(req.params.id));
    if (!r) return sendError(res, "Router tidak ditemukan", 404);
    await deletePppProfile(routerToCreds(r), String(req.params.profileId));
    await logAudit(req, "DELETE", "ppp_profile", 0, `Profile ${String(req.params.profileId)} on ${r.name}`);
    sendSuccess(res, { deleted: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ===========================================================
//  PPP SECRET CRUD
// ===========================================================

router.post("/api/mikrotik/routers/:id/ppp/secret", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const r = await storage.getMikrotikRouter(Number(req.params.id));
    if (!r) return sendError(res, "Router tidak ditemukan", 404);
    const { name, password: pw, service, profile, comment, localAddress, remoteAddress } = req.body;
    if (!name || !pw) return sendError(res, "Username dan password wajib diisi");
    const data: Record<string, any> = { name, password: pw };
    if (service) data.service = service;
    if (profile) data.profile = profile;
    if (comment) data.comment = comment;
    if (localAddress) data["local-address"] = localAddress;
    if (remoteAddress) data["remote-address"] = remoteAddress;
    const result = await createPppSecret(routerToCreds(r), data);
    await logAudit(req, "CREATE", "ppp_secret", 0, `Secret ${name} on ${r.name}`);
    sendSuccess(res, result, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.put("/api/mikrotik/routers/:id/ppp/secret/:secretId", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const r = await storage.getMikrotikRouter(Number(req.params.id));
    if (!r) return sendError(res, "Router tidak ditemukan", 404);
    const { name, password: pw, service, profile, comment, localAddress, remoteAddress } = req.body;
    const data: Record<string, any> = {};
    if (name !== undefined) data.name = name;
    if (pw !== undefined && pw !== "") data.password = pw;
    if (service !== undefined) data.service = service;
    if (profile !== undefined) data.profile = profile;
    if (comment !== undefined) data.comment = comment;
    if (localAddress !== undefined) data["local-address"] = localAddress;
    if (remoteAddress !== undefined) data["remote-address"] = remoteAddress;
    await updatePppSecret(routerToCreds(r), String(req.params.secretId), data);
    await logAudit(req, "UPDATE", "ppp_secret", 0, `Secret ${name || String(req.params.secretId)} on ${r.name}`);
    sendSuccess(res, { updated: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.delete("/api/mikrotik/routers/:id/ppp/secret/:secretId", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const r = await storage.getMikrotikRouter(Number(req.params.id));
    if (!r) return sendError(res, "Router tidak ditemukan", 404);
    await deletePppSecret(routerToCreds(r), String(req.params.secretId));
    await logAudit(req, "DELETE", "ppp_secret", 0, `Secret ${String(req.params.secretId)} on ${r.name}`);
    sendSuccess(res, { deleted: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/mikrotik/routers/:id/ppp/secret/:secretId/toggle", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const r = await storage.getMikrotikRouter(Number(req.params.id));
    if (!r) return sendError(res, "Router tidak ditemukan", 404);
    const { enable } = req.body;
    await enableDisablePppSecret(routerToCreds(r), String(req.params.secretId), !!enable);
    const action = enable ? "Reactivate" : "Isolir";
    await logAudit(req, "UPDATE", "ppp_secret", 0, `${action} ${String(req.params.secretId)} on ${r.name}`);
    sendSuccess(res, { toggled: true, enabled: !!enable });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ===========================================================
//  SIMPLE QUEUE CRUD
// ===========================================================

router.get("/api/mikrotik/routers/:id/queue/simple", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const r = await storage.getMikrotikRouter(Number(req.params.id));
    if (!r) return sendError(res, "Router tidak ditemukan", 404);
    const queues = await getSimpleQueues(routerToCreds(r));
    sendSuccess(res, queues);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.post("/api/mikrotik/routers/:id/queue/simple", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const r = await storage.getMikrotikRouter(Number(req.params.id));
    if (!r) return sendError(res, "Router tidak ditemukan", 404);
    const data = camelToDash(req.body);
    const result = await createSimpleQueue(routerToCreds(r), data);
    await logAudit(req, "CREATE", "simple_queue", 0, `Queue ${req.body.name} on ${r.name}`);
    sendSuccess(res, result, 201);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.put("/api/mikrotik/routers/:id/queue/simple/:queueId", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const r = await storage.getMikrotikRouter(Number(req.params.id));
    if (!r) return sendError(res, "Router tidak ditemukan", 404);
    const data = camelToDash(req.body);
    await updateSimpleQueue(routerToCreds(r), String(req.params.queueId), data);
    await logAudit(req, "UPDATE", "simple_queue", 0, `Queue ${req.body.name || String(req.params.queueId)} on ${r.name}`);
    sendSuccess(res, { updated: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.delete("/api/mikrotik/routers/:id/queue/simple/:queueId", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const r = await storage.getMikrotikRouter(Number(req.params.id));
    if (!r) return sendError(res, "Router tidak ditemukan", 404);
    await deleteSimpleQueue(routerToCreds(r), String(req.params.queueId));
    await logAudit(req, "DELETE", "simple_queue", 0, `Queue ${String(req.params.queueId)} on ${r.name}`);
    sendSuccess(res, { deleted: true });
  } catch (e: any) { sendError(res, e.message, 500); }
});

// ===========================================================
//  UTILITY READ-ONLY ROUTES
// ===========================================================

router.get("/api/mikrotik/routers/:id/dhcp/leases", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const r = await storage.getMikrotikRouter(Number(req.params.id));
    if (!r) return sendError(res, "Router tidak ditemukan", 404);
    const leases = await getDhcpLeases(routerToCreds(r));
    sendSuccess(res, leases);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/mikrotik/routers/:id/arp", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const r = await storage.getMikrotikRouter(Number(req.params.id));
    if (!r) return sendError(res, "Router tidak ditemukan", 404);
    const arp = await getArpTable(routerToCreds(r));
    sendSuccess(res, arp);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/mikrotik/routers/:id/neighbors", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const r = await storage.getMikrotikRouter(Number(req.params.id));
    if (!r) return sendError(res, "Router tidak ditemukan", 404);
    const neighbors = await getNeighbors(routerToCreds(r));
    sendSuccess(res, neighbors);
  } catch (e: any) { sendError(res, e.message, 500); }
});

router.get("/api/mikrotik/routers/:id/firewall/address-list", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  try {
    const r = await storage.getMikrotikRouter(Number(req.params.id));
    if (!r) return sendError(res, "Router tidak ditemukan", 404);
    const list = await getFirewallAddressList(routerToCreds(r));
    sendSuccess(res, list);
  } catch (e: any) { sendError(res, e.message, 500); }
});
