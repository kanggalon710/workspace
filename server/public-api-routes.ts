/**
 * PUBLIC API - Open API untuk integrasi eksternal (OpenClaude, BI tool, dll)
 * Base URL: /api/public/v1/*
 * Auth: Authorization: Bearer jbk_live_<32chars>
 * Read-only. Scoped access.
 *
 * Scopes:
 *   - reports:read       → /api/public/v1/reports/*
 *   - leads:read         → /api/public/v1/leads/*
 *   - collections:read   → /api/public/v1/collections/*
 *   - sahabat:read       → /api/public/v1/sahabat/*
 *   - tickets:read       → /api/public/v1/tickets/*
 */

import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { storage } from "./storage.js";
import { tenantContext } from "./tenant-context.js";
import type { ApiKey, InsertAdCampaign } from "../shared/schema.js";

export const publicApiRouter = Router();

// ==================== KEY GENERATION HELPERS ====================

/** Generate new API key: "jbk_live_" + 32 hex chars.
 *  Prefix stored plain: "jbk_live_" + first 6 chars (for lookup + UI display).
 *  Full key hashed with bcrypt. */
export function generateApiKey(): { key: string; prefix: string } {
  const random = randomBytes(16).toString("hex"); // 32 chars
  const key = `jbk_live_${random}`;
  const prefix = key.slice(0, 15); // "jbk_live_" + 6 chars
  return { key, prefix };
}

export async function hashApiKey(key: string): Promise<string> {
  return bcrypt.hash(key, 10);
}

// ==================== MIDDLEWARE ====================

interface AuthedRequest extends Request {
  apiKey?: ApiKey;
  apiStartMs?: number;
}

/** Middleware: verify Bearer API key + scope. Also enforces rate limit. */
function requireScope(scope: string) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    req.apiStartMs = Date.now();
    try {
      const auth = req.headers.authorization ?? "";
      const match = auth.match(/^Bearer\s+(jbk_live_[a-f0-9]+)$/i);
      if (!match) {
        return res.status(401).json({ error: "unauthorized", message: "Missing or invalid Authorization header. Use: Authorization: Bearer jbk_live_..." });
      }
      const presentedKey = match[1];
      const prefix = presentedKey.slice(0, 15);

      const candidates = await storage.findApiKeyCandidatesByPrefix(prefix);
      let matched: ApiKey | null = null;
      for (const cand of candidates) {
        if (await bcrypt.compare(presentedKey, cand.keyHash)) {
          matched = cand;
          break;
        }
      }
      if (!matched) {
        return res.status(401).json({ error: "unauthorized", message: "Invalid API key" });
      }

      // Check expired
      if (matched.expiresAt && new Date(matched.expiresAt).getTime() < Date.now()) {
        return res.status(401).json({ error: "expired", message: "API key expired" });
      }
      if (matched.revokedAt) {
        return res.status(401).json({ error: "revoked", message: "API key revoked" });
      }

      // Scope check
      let scopes: string[] = [];
      try { scopes = JSON.parse(matched.scopes); } catch {}
      if (!scopes.includes(scope) && !scopes.includes("*")) {
        return res.status(403).json({ error: "forbidden", message: `Scope "${scope}" required. Key scopes: [${scopes.join(", ")}]` });
      }

      req.apiKey = matched;
      // Phase C: wrap downstream handlers in tenant context derived from key's mitra_id.
      const keyMitraId = (matched as any).mitraId ?? 1;
      tenantContext.run({ mitraId: keyMitraId, userId: 0, isSuperAdmin: false }, async () => {
        try {
          // Rate limit (now scoped per-mitra)
          const reqLastMin = await storage.countApiKeyRequestsLastMin(matched!.id);
          if (reqLastMin >= (matched!.rateLimit ?? 60)) {
            res.setHeader("Retry-After", "60");
            return res.status(429).json({ error: "rate_limited", message: `Rate limit ${matched!.rateLimit}/min exceeded`, retryAfterSec: 60 });
          }

          // Touch usage (fire-and-forget) - context already set
          const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || null;
          const ua = (req.headers["user-agent"] as string) ?? null;
          storage.touchApiKey(matched!.id, ip, ua).catch(() => {});

          next();
        } catch (e: any) {
          console.error("[PublicAPI] handler error inside tenant scope:", e.message);
          return res.status(500).json({ error: "server_error", message: e.message });
        }
      });
      return;
    } catch (e: any) {
      console.error("[PublicAPI] auth error:", e.message);
      return res.status(500).json({ error: "auth_error", message: "Internal auth error" });
    }
  };
}

/** Log usage after response sent (best effort). */
publicApiRouter.use((req: AuthedRequest, res: Response, next: NextFunction) => {
  res.on("finish", () => {
    if (!req.apiKey) return;
    const ms = req.apiStartMs ? Date.now() - req.apiStartMs : 0;
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || null;
    const ua = (req.headers["user-agent"] as string) ?? null;
    storage.logApiKeyUsage({
      apiKeyId: req.apiKey.id,
      endpoint: req.originalUrl.split("?")[0],
      method: req.method,
      statusCode: res.statusCode,
      responseMs: ms,
      ipAddress: ip,
      userAgent: ua,
    }).catch(() => {});
  });
  next();
});

// ==================== HELPERS ====================

function parseRange(req: Request, defaultDays = 1): { from: string; to: string } {
  const fromParam = req.query.from as string | undefined;
  const toParam = req.query.to as string | undefined;
  // Default: today 00:00 → now
  const now = new Date();
  const to = toParam ? new Date(toParam) : now;
  const from = fromParam ? new Date(fromParam) : new Date(now.getTime() - defaultDays * 86400_000);
  // Clamp: pastikan nggak > 180 hari range
  const maxRangeMs = 180 * 86400_000;
  if (to.getTime() - from.getTime() > maxRangeMs) {
    from.setTime(to.getTime() - maxRangeMs);
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

function parsePagination(req: Request, defaultLimit = 50, maxLimit = 500): { limit: number; offset: number } {
  const limit = Math.min(maxLimit, Math.max(1, parseInt(req.query.limit as string) || defaultLimit));
  const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
  return { limit, offset };
}

function parsePeriod(req: any): { period: "daily"|"weekly"|"monthly"|"quarterly"; from?: string; to?: string } {
  const allowed = ["daily", "weekly", "monthly", "quarterly"] as const;
  const p = (req.query.period as string) || "monthly";
  const period = (allowed as readonly string[]).includes(p) ? p : "monthly";
  const iso = (v: any) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v : undefined);
  return { period: period as any, from: iso(req.query.from), to: iso(req.query.to) };
}

/** Batch lookup user info - return map { userId: { id, name, username, role } }.
 *  Dipakai untuk enrich response API dengan assignee names tanpa N+1 query. */
async function _lookupUsers(userIds: number[]): Promise<Record<number, { id: number; name: string; username: string; role: string }>> {
  if (userIds.length === 0) return {};
  const users = await storage.getAllUsers();
  const map: Record<number, any> = {};
  for (const u of users) {
    if (userIds.includes(u.id)) {
      map[u.id] = { id: u.id, name: u.name, username: u.username, role: u.role };
    }
  }
  return map;
}

// ==================== META ENDPOINTS (no auth) ====================

/** GET /api/public/v1/health - ping endpoint, no auth */
publicApiRouter.get("/api/public/v1/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "JABNET Open API",
    version: "1.0.0",
    time: new Date().toISOString(),
  });
});

/** GET /api/public/v1/schema - self-documenting endpoint list + JSON shape */
publicApiRouter.get("/api/public/v1/schema", (_req, res) => {
  res.json({
    service: "JABNET Open API",
    version: "1.0.0",
    baseUrl: "/api/public/v1",
    auth: {
      type: "bearer",
      header: "Authorization: Bearer jbk_live_...",
      description: "Generate API key from admin UI: /integrations → Public API",
    },
    rateLimit: "Default 60 req/min per key. Configurable per key.",
    scopes: [
      { key: "marketing:read", desc: "Marketing bundle: canvassing, prospects, leads funnel, coverage, sahabat referral funnel, campaign attribution" },
      { key: "reports:read", desc: "Read daily ops reports (cross-domain summary)" },
      { key: "leads:read", desc: "Read lead pipeline (basic)" },
      { key: "collections:read", desc: "Read collection pipeline" },
      { key: "sahabat:read", desc: "Read JABNET Sahabat program data" },
      { key: "tickets:read", desc: "Read ticket data" },
      { key: "marketing:write", desc: "Push ad campaign data (POST/PATCH /marketing/campaigns). Untuk bot ads manager sync (Meta/TikTok/Google Ads)." },
      { key: "finance:read", desc: "Revenue & billing (aggregate): MRR, ARPU, revenue-at-risk, billing status, collections recovery/aging. No PII." },
      { key: "customers:read", desc: "Subscriber base (aggregate): counts by status/package/type/district/village + activations. No PII." },
      { key: "teamspace:read", desc: "Teamspace (kolaborasi tim internal): ringkasan tugas per tim + kinerja per anggota. Aggregate, no isi chat/dokumen." },
      { key: "divisions:read", desc: "Analisa pekerjaan tim PER DIVISI (Marketing/Teknik/NOC/Layanan/Keuangan/HRD): output tim daily->weekly->monthly + snapshot KPI domain. Untuk AI agent laporan divisi." },
      { key: "*", desc: "All scopes (admin keys)" },
    ],
    endpoints: [
      // Meta
      { method: "GET", path: "/health",  scope: null, desc: "Health check (no auth)" },
      { method: "GET", path: "/schema",  scope: null, desc: "This schema (no auth)" },

      // ====== MARKETING BUNDLE (priority untuk AI daily analysis) ======
      { method: "GET", path: "/marketing/daily-report",      scope: "marketing:read", desc: "Daily report tim marketing: KPI hari ini, per-canvasser & per-sales, hourly heatmap, pipeline snapshot, source breakdown. Default: hari ini. Query: ?date=YYYY-MM-DD" },
      { method: "GET", path: "/marketing/overview",          scope: "marketing:read", desc: "ONE-SHOT dense JSON untuk AI: today vs yesterday vs week, momentum, top performer, hot spots, red flags, actionable insights. Query: ?from=&to=" },
      { method: "GET", path: "/marketing/canvassing/sessions", scope: "marketing:read", desc: "Canvassing sessions - active, today, week. Per-canvasser stats: duration, checkIns, prospects, reports" },
      { method: "GET", path: "/marketing/canvassing/reports",  scope: "marketing:read", desc: "Field reports (BI). Query: ?type=&severity=&userId=&from=&to=&limit=" },
      { method: "GET", path: "/marketing/canvassing/performance", scope: "marketing:read", desc: "Per-canvasser performance matrix: sessions, duration, leads, conversion. Query: ?from=&to=" },
      { method: "GET", path: "/marketing/prospects",           scope: "marketing:read", desc: "Prospect database. Query: ?category=&hasOdp=true&district=&limit=&offset=" },
      { method: "GET", path: "/marketing/prospects/stats",     scope: "marketing:read", desc: "Prospect stats: by category, by district, by distance from ODP" },
      { method: "GET", path: "/marketing/leads/funnel",        scope: "marketing:read", desc: "Lead conversion funnel: per-stage velocity (avgDays), drop-off rates, top loss reasons" },
      { method: "GET", path: "/marketing/leads/attribution",   scope: "marketing:read", desc: "Source attribution: leads by source (prospect_finder/canvassing/referral/inbound) + conversion per source" },
      { method: "GET", path: "/marketing/leads/performance",   scope: "marketing:read", desc: "Per-staff marketing scorecard: leads assigned, stage progression, conversion rate, avg response time" },
      { method: "GET", path: "/marketing/coverage",            scope: "marketing:read", desc: "Coverage per district/kecamatan: canvassing activity, prospects, leads, active customers, penetration rate" },
      { method: "GET", path: "/marketing/heatmap",             scope: "marketing:read", desc: "GIS data: lat/lng prospects + leads untuk visualisasi peta eksternal. Query: ?types=prospects,leads,canvassing" },
      { method: "GET", path: "/marketing/sahabat/funnel",      scope: "marketing:read", desc: "Sahabat referral funnel: invited → registered → rewarded. Conversion per stage. Per-tier breakdown" },
      { method: "GET", path: "/marketing/campaigns",           scope: "marketing:read", desc: "List ad campaigns (Meta/TikTok/Google Ads). Gabungan data stored (push dari bot) + aggregated leads per source. Query: ?platform=meta_ads&status=active" },
      { method: "GET", path: "/marketing/campaigns/:id",       scope: "marketing:read", desc: "Detail campaign by id" },
      { method: "POST", path: "/marketing/campaigns",          scope: "marketing:write", desc: "Create campaign (atau upsert by platform+externalId). Body: { platform, campaignName, externalId?, status?, budgetDaily?, spendTotal?, impressions?, clicks?, leadsFromAd?, conversions?, revenue?, dateStart?, dateEnd?, linkUrl?, utmSource?, utmCampaign?, objective?, notes? }" },
      { method: "PATCH", path: "/marketing/campaigns/:id",     scope: "marketing:write", desc: "Partial update 1 campaign. Dipakai bot untuk push metric harian (spend, impressions, dll)." },
      { method: "DELETE", path: "/marketing/campaigns/:id",    scope: "marketing:write", desc: "Hapus campaign (hard delete)" },
      { method: "GET", path: "/marketing/campaigns/summary",   scope: "marketing:read", desc: "Aggregated summary per platform: spend, clicks, impressions, leads, conversions, CPL, CTR, ROAS" },

      // Reports (cross-domain)
      { method: "GET", path: "/reports/daily",     scope: "reports:read", desc: "Summary hari ini (default). Query: ?from=ISO&to=ISO" },
      { method: "GET", path: "/reports/weekly",    scope: "reports:read", desc: "Summary 7 hari terakhir" },
      { method: "GET", path: "/reports/range",     scope: "reports:read", desc: "Summary per range custom. Query: ?from=ISO&to=ISO (max 180 hari)" },
      { method: "GET", path: "/reports/executive", scope: "reports:read", desc: "ONE-SHOT untuk AI: revenue + subscriber + collections + ops-ringkas, semua + deltaPct + redFlags/greenLights + trend. Query: ?period=&from=&to=" },
      // Finance
      { method: "GET", path: "/finance/overview",     scope: "finance:read",   desc: "Point-in-time: MRR (+delta), ARPU, revenue-at-risk, billingStatus dist, breakdown by package/type/district" },
      { method: "GET", path: "/finance/timeseries",   scope: "finance:read",   desc: "Trend dari snapshot. Query: ?metric=mrr|active|isolir|revenue_at_risk&period=daily|weekly|monthly|quarterly&from=&to=" },
      { method: "GET", path: "/finance/collections",  scope: "finance:read",   desc: "Recovery rate, aging buckets, avg days-to-pay, outstanding. Query: ?period=&from=&to= recoveryPct dapat >100% bila kasus lama lunas di periode berjalan." },
      // Customers
      { method: "GET", path: "/customers/overview",   scope: "customers:read", desc: "Subscriber counts by status/package/type/district/village + new activations" },
      { method: "GET", path: "/customers/timeseries", scope: "customers:read", desc: "Query: ?metric=new_activations|active|net_adds&period=&from=&to=" },
      // Leads (basic - untuk marketing deep-dive pakai /marketing/leads/*)
      { method: "GET", path: "/leads",        scope: "leads:read", desc: "List leads. Query: ?stage=&assignedTo=&from=&to=&limit=&offset=" },
      { method: "GET", path: "/leads/stats",  scope: "leads:read", desc: "Pipeline stats: by stage, by wilayah, conversion rate" },
      { method: "GET", path: "/leads/:id",    scope: "leads:read", desc: "Lead detail + activities timeline" },
      // Collections
      { method: "GET", path: "/collections",        scope: "collections:read", desc: "List. Query: ?stage=&assignedTo=&openOnly=true&limit=&offset=" },
      { method: "GET", path: "/collections/stats",  scope: "collections:read", desc: "Stats: by stage, amount outstanding, avg age" },
      { method: "GET", path: "/collections/:id",    scope: "collections:read", desc: "Case detail + activities" },
      // Sahabat (basic)
      { method: "GET", path: "/sahabat/stats",          scope: "sahabat:read", desc: "Program stats: by level, tier, pending rewards" },
      { method: "GET", path: "/sahabat/leaderboard",    scope: "sahabat:read", desc: "Top Sahabat. Query: ?limit=&sortBy=referrals|streak" },
      { method: "GET", path: "/sahabat/referrals",      scope: "sahabat:read", desc: "Referral list. Query: ?status=&limit=&offset=" },
      // Tickets
      { method: "GET", path: "/tickets",       scope: "tickets:read", desc: "Active tickets. Query: ?status=&limit=&offset=" },
      { method: "GET", path: "/tickets/stats", scope: "tickets:read", desc: "Ticket stats: open count, SLA compliance" },

      // ====== TEAMSPACE (v5.0 - kolaborasi tim internal) ======
      { method: "GET", path: "/teamspace/tasks", scope: "teamspace:read", desc: "Ringkasan tugas per tim (total/selesai/terlambat) + daftar kartu ringkas. Query: ?detail=1 untuk daftar kartu" },
      { method: "GET", path: "/teamspace/performance", scope: "teamspace:read", desc: "Kinerja per anggota: tugas selesai/dikerjakan/terlambat + output ops (tiket/lead/collection/canvassing). Query: ?from=&to= (default 30 hari)" },

      // ====== DIVISIONS - analisa pekerjaan tim per divisi (daily->weekly) ======
      { method: "GET", path: "/divisions", scope: "divisions:read", desc: "ONE-SHOT semua divisi: output tim (tiket/lead/collection/canvassing) + snapshot KPI domain per divisi. Query: ?period=daily|weekly|monthly|quarterly ATAU ?from=&to=" },
      { method: "GET", path: "/divisions/:key", scope: "divisions:read", desc: "Detail 1 divisi (marketing|teknik|noc|cs|keuangan|hrd): per-anggota output diurut kontribusi + totals + snapshot KPI. Query: ?period= atau ?from=&to=" },
    ],
    examples: {
      dailyReport: "curl -H 'Authorization: Bearer jbk_live_xxx' https://fiber-tools.arkanova.id/api/public/v1/reports/daily",
      leadsThisWeek: "curl -H 'Authorization: Bearer jbk_live_xxx' 'https://fiber-tools.arkanova.id/api/public/v1/leads?from=2026-04-14T00:00:00Z'",
    },
  });
});

// ==================================================================
// MARKETING BUNDLE - deep-dive endpoints (scope: marketing:read)
// ==================================================================

/**
 *  GET /marketing/daily-report - laporan harian tim marketing terstruktur
 * Default: hari ini (00:00 - now). Pakai ?date=YYYY-MM-DD untuk hari spesifik.
 *
 * Return: summary KPI + perCanvasser + perSales + hourly heatmap + pipeline + source + coverage
 */
publicApiRouter.get("/api/public/v1/marketing/daily-report", requireScope("marketing:read"), async (req, res) => {
  try {
    let from: string, to: string;
    const dateParam = req.query.date as string | undefined;
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      // Specific day: 00:00 - 23:59:59 of that date
      const d = new Date(dateParam + "T00:00:00.000Z");
      // Adjust ke local Indonesia (server timezone) - pakai full day range
      from = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).toISOString();
      to = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString();
    } else {
      // Default: today
      const now = new Date();
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
      to = now.toISOString();
    }
    res.json(await storage.getMarketingDailyReport(from, to));
  } catch (e: any) { res.status(500).json({ error: "internal", message: e.message }); }
});

/**  GET /marketing/overview - ONE-SHOT dense JSON untuk AI daily analysis */
publicApiRouter.get("/api/public/v1/marketing/overview", requireScope("marketing:read"), async (req, res) => {
  try {
    const { from, to } = parseRange(req, 1);
    res.json(await storage.getMarketingOverview(from, to));
  } catch (e: any) { res.status(500).json({ error: "internal", message: e.message }); }
});

/** GET /marketing/canvassing/sessions - active sessions + range history + per-canvasser */
publicApiRouter.get("/api/public/v1/marketing/canvassing/sessions", requireScope("marketing:read"), async (req, res) => {
  try {
    const { from, to } = parseRange(req, 7);
    res.json(await storage.getCanvassingSessionsStats(from, to));
  } catch (e: any) { res.status(500).json({ error: "internal", message: e.message }); }
});

/** GET /marketing/canvassing/reports - field reports */
publicApiRouter.get("/api/public/v1/marketing/canvassing/reports", requireScope("marketing:read"), async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req);
    const { from, to } = parseRange(req, 30);
    const type = req.query.type as string | undefined;
    const severity = req.query.severity as string | undefined;
    const userId = req.query.userId ? Number(req.query.userId) : undefined;

    const all: any[] = await storage.getCanvassingLogs();
    let filtered = all.filter((l: any) => l.createdAt >= from && l.createdAt <= to);
    if (type) filtered = filtered.filter((l: any) => l.type === type);
    if (severity) filtered = filtered.filter((l: any) => l.severity === severity);
    if (userId) filtered = filtered.filter((l: any) => l.userId === userId);

    const total = filtered.length;
    const page = filtered.slice(offset, offset + limit);
    const uids = Array.from(new Set(page.map((l: any) => l.userId).filter(Boolean) as number[]));
    const userMap = await _lookupUsers(uids);
    res.json({
      range: { from, to },
      filters: { type, severity, userId },
      pagination: { limit, offset, total },
      data: page.map((l: any) => ({
        id: l.id, sessionId: l.sessionId,
        userId: l.userId,
        userName: l.userId ? (userMap[l.userId]?.name ?? null) : null,
        userUsername: l.userId ? (userMap[l.userId]?.username ?? null) : null,
        type: l.type, title: l.title, description: l.description,
        lat: l.lat, lng: l.lng, odpId: l.odpId,
        severity: l.severity, hasPhoto: !!l.photoData,
        createdAt: l.createdAt,
      })),
    });
  } catch (e: any) { res.status(500).json({ error: "internal", message: e.message }); }
});

/** GET /marketing/canvassing/performance - per-canvasser matrix */
publicApiRouter.get("/api/public/v1/marketing/canvassing/performance", requireScope("marketing:read"), async (req, res) => {
  try {
    const { from, to } = parseRange(req, 30);
    const stats = await storage.getCanvassingSessionsStats(from, to);
    // Strip the verbose session list, return only perCanvasser + high-level totals
    res.json({
      range: stats.range,
      totals: {
        sessions: stats.sessionsInRange.length,
        totalDurationMinutes: stats.sessionsInRange.reduce((sum: number, s: any) => sum + s.durationMinutes, 0),
        totalReports: stats.sessionsInRange.reduce((sum: number, s: any) => sum + s.reports, 0),
        totalProspectsLogged: stats.sessionsInRange.reduce((sum: number, s: any) => sum + s.prospects, 0),
      },
      perCanvasser: stats.perCanvasser,
    });
  } catch (e: any) { res.status(500).json({ error: "internal", message: e.message }); }
});

/** GET /marketing/prospects - prospect database */
publicApiRouter.get("/api/public/v1/marketing/prospects", requireScope("marketing:read"), async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req, 50, 500);
    const category = req.query.category as string | undefined;
    const district = req.query.district as string | undefined;
    const hasOdp = req.query.hasOdp === "true" ? true
      : req.query.hasOdp === "false" ? false
      : undefined;
    res.json(await storage.getProspectsList({ category, district, hasOdp, limit, offset }));
  } catch (e: any) { res.status(500).json({ error: "internal", message: e.message }); }
});

/** GET /marketing/prospects/stats */
publicApiRouter.get("/api/public/v1/marketing/prospects/stats", requireScope("marketing:read"), async (_req, res) => {
  try {
    res.json(await storage.getProspectsStats());
  } catch (e: any) { res.status(500).json({ error: "internal", message: e.message }); }
});

/** GET /marketing/leads/funnel */
publicApiRouter.get("/api/public/v1/marketing/leads/funnel", requireScope("marketing:read"), async (req, res) => {
  try {
    const { from, to } = parseRange(req, 30);
    res.json(await storage.getLeadsFunnel(from, to));
  } catch (e: any) { res.status(500).json({ error: "internal", message: e.message }); }
});

/** GET /marketing/leads/attribution */
publicApiRouter.get("/api/public/v1/marketing/leads/attribution", requireScope("marketing:read"), async (req, res) => {
  try {
    const { from, to } = parseRange(req, 30);
    res.json(await storage.getLeadsAttribution(from, to));
  } catch (e: any) { res.status(500).json({ error: "internal", message: e.message }); }
});

/** GET /marketing/leads/performance - per-staff scorecard */
publicApiRouter.get("/api/public/v1/marketing/leads/performance", requireScope("marketing:read"), async (req, res) => {
  try {
    const { from, to } = parseRange(req, 30);
    res.json(await storage.getLeadsPerformance(from, to));
  } catch (e: any) { res.status(500).json({ error: "internal", message: e.message }); }
});

/** GET /marketing/coverage - per-district penetration */
publicApiRouter.get("/api/public/v1/marketing/coverage", requireScope("marketing:read"), async (req, res) => {
  try {
    const { from, to } = parseRange(req, 30);
    res.json(await storage.getMarketingCoverage(from, to));
  } catch (e: any) { res.status(500).json({ error: "internal", message: e.message }); }
});

/** GET /marketing/heatmap - GIS points */
publicApiRouter.get("/api/public/v1/marketing/heatmap", requireScope("marketing:read"), async (req, res) => {
  try {
    const typesParam = (req.query.types as string) ?? "prospects,leads,canvassing";
    const types = typesParam.split(",").map((t) => t.trim()).filter(Boolean);
    res.json(await storage.getMarketingHeatmap(types));
  } catch (e: any) { res.status(500).json({ error: "internal", message: e.message }); }
});

/** GET /marketing/sahabat/funnel - referral conversion funnel */
publicApiRouter.get("/api/public/v1/marketing/sahabat/funnel", requireScope("marketing:read"), async (req, res) => {
  try {
    const { from, to } = parseRange(req, 30);
    res.json(await storage.getSahabatFunnel(from, to));
  } catch (e: any) { res.status(500).json({ error: "internal", message: e.message }); }
});

/** GET /marketing/campaigns - list campaigns + leads aggregation per source */
publicApiRouter.get("/api/public/v1/marketing/campaigns", requireScope("marketing:read"), async (req, res) => {
  try {
    const platform = req.query.platform as string | undefined;
    const status = req.query.status as string | undefined;
    const campaigns = await storage.getAdCampaigns({
      ...(platform ? { platform } : {}),
      ...(status ? { status } : {}),
    });
    const leadsBySource = await storage.getAdsLeadsSummary();
    res.json({
      campaigns: campaigns.map(c => ({
        ...c,
        // Derived metrics
        ctr: c.impressions && c.clicks ? Number(((c.clicks / c.impressions) * 100).toFixed(2)) : null,
        cpl: c.spendTotal && c.leadsFromAd ? Math.round(c.spendTotal / c.leadsFromAd) : null,
        cpm: c.spendTotal && c.impressions ? Number(((c.spendTotal / c.impressions) * 1000).toFixed(0)) : null,
        conversionRate: c.leadsFromAd && c.conversions ? Number(((c.conversions / c.leadsFromAd) * 100).toFixed(2)) : null,
        roas: c.spendTotal && c.revenue ? Number((c.revenue / c.spendTotal).toFixed(2)) : null,
      })),
      leadsBySource,
      totals: {
        count: campaigns.length,
        active: campaigns.filter(c => c.status === "active").length,
        spendTotal: campaigns.reduce((s, c) => s + (c.spendTotal ?? 0), 0),
        impressions: campaigns.reduce((s, c) => s + (c.impressions ?? 0), 0),
        clicks: campaigns.reduce((s, c) => s + (c.clicks ?? 0), 0),
        leadsFromAd: campaigns.reduce((s, c) => s + (c.leadsFromAd ?? 0), 0),
        conversions: campaigns.reduce((s, c) => s + (c.conversions ?? 0), 0),
        revenue: campaigns.reduce((s, c) => s + (c.revenue ?? 0), 0),
      },
    });
  } catch (e: any) { res.status(500).json({ error: "internal", message: e.message }); }
});

/** GET /marketing/campaigns/summary - aggregated per platform */
publicApiRouter.get("/api/public/v1/marketing/campaigns/summary", requireScope("marketing:read"), async (_req, res) => {
  try {
    const all = await storage.getAdCampaigns();
    const platforms = ["meta_ads", "tiktok_ads", "google_ads", "landing_page", "other"];
    const byPlatform: Record<string, any> = {};
    for (const p of platforms) {
      const rows = all.filter(c => c.platform === p);
      const spend = rows.reduce((s, c) => s + (c.spendTotal ?? 0), 0);
      const imps = rows.reduce((s, c) => s + (c.impressions ?? 0), 0);
      const clicks = rows.reduce((s, c) => s + (c.clicks ?? 0), 0);
      const leads = rows.reduce((s, c) => s + (c.leadsFromAd ?? 0), 0);
      const conv = rows.reduce((s, c) => s + (c.conversions ?? 0), 0);
      const rev = rows.reduce((s, c) => s + (c.revenue ?? 0), 0);
      byPlatform[p] = {
        campaigns: rows.length,
        active: rows.filter(c => c.status === "active").length,
        spendTotal: spend,
        impressions: imps,
        clicks,
        ctr: imps ? Number(((clicks / imps) * 100).toFixed(2)) : null,
        cpc: clicks ? Math.round(spend / clicks) : null,
        cpm: imps ? Number(((spend / imps) * 1000).toFixed(0)) : null,
        leadsFromAd: leads,
        cpl: leads ? Math.round(spend / leads) : null,
        conversions: conv,
        conversionRate: leads ? Number(((conv / leads) * 100).toFixed(2)) : null,
        revenue: rev,
        roas: spend ? Number((rev / spend).toFixed(2)) : null,
      };
    }
    const leadsBySource = await storage.getAdsLeadsSummary();
    res.json({ byPlatform, leadsBySource });
  } catch (e: any) { res.status(500).json({ error: "internal", message: e.message }); }
});

/** GET /marketing/campaigns/:id - detail */
publicApiRouter.get("/api/public/v1/marketing/campaigns/:id", requireScope("marketing:read"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
    const c = await storage.getAdCampaign(id);
    if (!c) return res.status(404).json({ error: "not_found" });
    res.json(c);
  } catch (e: any) { res.status(500).json({ error: "internal", message: e.message }); }
});

// -- WRITE (marketing:write scope) --
const VALID_PLATFORMS = new Set(["meta_ads", "tiktok_ads", "google_ads", "landing_page", "other"]);
const VALID_STATUS = new Set(["active", "paused", "ended"]);

function sanitizeCampaignInput(body: any): { clean: Partial<InsertAdCampaign>; error?: string } {
  const clean: Partial<InsertAdCampaign> = {};
  if (body.platform !== undefined) {
    if (!VALID_PLATFORMS.has(body.platform)) return { clean, error: `platform harus salah satu: ${[...VALID_PLATFORMS].join(", ")}` };
    clean.platform = body.platform;
  }
  if (body.campaignName !== undefined) {
    const n = String(body.campaignName).trim();
    if (!n) return { clean, error: "campaignName tidak boleh kosong" };
    if (n.length > 200) return { clean, error: "campaignName max 200 karakter" };
    clean.campaignName = n;
  }
  if (body.externalId !== undefined) clean.externalId = body.externalId ? String(body.externalId).trim() : null;
  if (body.status !== undefined) {
    if (!VALID_STATUS.has(body.status)) return { clean, error: `status harus: ${[...VALID_STATUS].join(", ")}` };
    clean.status = body.status;
  }
  if (body.objective !== undefined) clean.objective = body.objective ? String(body.objective).trim().slice(0, 50) : null;
  if (body.audience !== undefined) clean.audience = body.audience ? String(body.audience).slice(0, 500) : null;
  if (body.dateStart !== undefined) clean.dateStart = body.dateStart ?? null;
  if (body.dateEnd !== undefined) clean.dateEnd = body.dateEnd ?? null;
  const intFields: (keyof InsertAdCampaign)[] = ["budgetDaily", "budgetTotal", "spendTotal", "impressions", "clicks", "leadsFromAd", "conversions", "revenue"];
  for (const f of intFields) {
    if ((body as any)[f] === undefined) continue;
    const v = Number((body as any)[f]);
    if (!Number.isFinite(v) || v < 0) return { clean, error: `${f} harus angka non-negatif` };
    (clean as any)[f] = Math.round(v);
  }
  if (body.utmSource !== undefined) clean.utmSource = body.utmSource ? String(body.utmSource).slice(0, 100) : null;
  if (body.utmCampaign !== undefined) clean.utmCampaign = body.utmCampaign ? String(body.utmCampaign).slice(0, 200) : null;
  if (body.linkUrl !== undefined) clean.linkUrl = body.linkUrl ? String(body.linkUrl).slice(0, 500) : null;
  if (body.thumbnailUrl !== undefined) clean.thumbnailUrl = body.thumbnailUrl ? String(body.thumbnailUrl).slice(0, 500) : null;
  if (body.notes !== undefined) clean.notes = body.notes ? String(body.notes).slice(0, 2000) : null;
  return { clean };
}

/**
 * POST /marketing/campaigns - create OR upsert (kalau externalId disediakan).
 * Upsert semantic: kalau (platform, externalId) sudah ada → update row itu.
 * Dipakai bot openclaw untuk sync harian dari Ads Manager.
 */
publicApiRouter.post("/api/public/v1/marketing/campaigns", requireScope("marketing:write"), async (req: AuthedRequest, res) => {
  try {
    const { clean, error } = sanitizeCampaignInput(req.body);
    if (error) return res.status(400).json({ error: "invalid_input", message: error });
    if (!clean.platform) return res.status(400).json({ error: "invalid_input", message: "platform wajib" });
    if (!clean.campaignName) return res.status(400).json({ error: "invalid_input", message: "campaignName wajib" });

    const nowIso = new Date().toISOString();
    // Kalau externalId dikirim → upsert
    if (clean.externalId) {
      const { campaign, created } = await storage.upsertAdCampaignByExternalId(
        clean.platform,
        clean.externalId,
        { ...clean, createdByApiKeyId: req.apiKey?.id ?? null } as any,
      );
      return res.status(created ? 201 : 200).json({ campaign, created, upserted: !created });
    }
    // Pure create
    const campaign = await storage.createAdCampaign({
      ...clean,
      createdByApiKeyId: req.apiKey?.id ?? null,
      lastSyncedAt: nowIso,
      createdAt: nowIso,
    } as InsertAdCampaign);
    res.status(201).json({ campaign, created: true });
  } catch (e: any) { res.status(500).json({ error: "internal", message: e.message }); }
});

/** PATCH /marketing/campaigns/:id - partial update (push metric harian) */
publicApiRouter.patch("/api/public/v1/marketing/campaigns/:id", requireScope("marketing:write"), async (req: AuthedRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
    const existing = await storage.getAdCampaign(id);
    if (!existing) return res.status(404).json({ error: "not_found" });
    const { clean, error } = sanitizeCampaignInput(req.body);
    if (error) return res.status(400).json({ error: "invalid_input", message: error });
    const updated = await storage.updateAdCampaign(id, {
      ...clean,
      lastSyncedAt: new Date().toISOString(),
    });
    res.json({ campaign: updated });
  } catch (e: any) { res.status(500).json({ error: "internal", message: e.message }); }
});

/** DELETE /marketing/campaigns/:id */
publicApiRouter.delete("/api/public/v1/marketing/campaigns/:id", requireScope("marketing:write"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
    const ok = await storage.deleteAdCampaign(id);
    if (!ok) return res.status(404).json({ error: "not_found" });
    res.json({ deleted: true, id });
  } catch (e: any) { res.status(500).json({ error: "internal", message: e.message }); }
});

// ==================== REPORTS ====================

/** GET /api/public/v1/reports/daily - summary hari ini */
publicApiRouter.get("/api/public/v1/reports/daily", requireScope("reports:read"), async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const from = (req.query.from as string) ?? startOfDay.toISOString();
    const to = (req.query.to as string) ?? now.toISOString();
    const report = await storage.getDailyOpsReport(from, to);
    res.json(report);
  } catch (e: any) {
    res.status(500).json({ error: "internal", message: e.message });
  }
});

/** GET /api/public/v1/reports/weekly - rolling 7 hari */
publicApiRouter.get("/api/public/v1/reports/weekly", requireScope("reports:read"), async (_req, res) => {
  try {
    const to = new Date();
    const from = new Date(to.getTime() - 7 * 86400_000);
    const report = await storage.getDailyOpsReport(from.toISOString(), to.toISOString());
    res.json(report);
  } catch (e: any) {
    res.status(500).json({ error: "internal", message: e.message });
  }
});

/** GET /api/public/v1/reports/range?from=&to= */
publicApiRouter.get("/api/public/v1/reports/range", requireScope("reports:read"), async (req, res) => {
  try {
    const { from, to } = parseRange(req, 7);
    const report = await storage.getDailyOpsReport(from, to);
    res.json(report);
  } catch (e: any) {
    res.status(500).json({ error: "internal", message: e.message });
  }
});

// ==================== LEADS ====================

publicApiRouter.get("/api/public/v1/leads", requireScope("leads:read"), async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req);
    const stage = req.query.stage as string | undefined;
    const assignedTo = req.query.assignedTo ? Number(req.query.assignedTo) : undefined;
    const source = req.query.source as string | undefined;
    const { from, to } = parseRange(req, 30);

    const all = await storage.getLeads({
      stage: stage as any,
      assignedTo,
      source,
    });
    // Apply date range filter manually
    const filtered = all.filter((l: any) => {
      const created = l.createdAt;
      return created >= from && created <= to;
    });
    const total = filtered.length;
    const page = filtered.slice(offset, offset + limit);

    // Resolve assignee names (batch lookup - 1 query untuk semua user yang relevan)
    const userIds = Array.from(new Set(page.map((l: any) => l.assignedTo).filter(Boolean) as number[]));
    const userMap = await _lookupUsers(userIds);

    res.json({
      range: { from, to },
      filters: { stage, assignedTo, source },
      pagination: { limit, offset, total },
      data: page.map((l: any) => ({
        id: l.id,
        name: l.name,
        phone: l.phone,
        source: l.source,
        stage: l.stage,
        priority: l.priority,
        district: l.district,
        village: l.village,
        assignedTo: l.assignedTo,
        assignedToName: l.assignedTo ? (userMap[l.assignedTo]?.name ?? null) : null,
        assignedToUsername: l.assignedTo ? (userMap[l.assignedTo]?.username ?? null) : null,
        assignedToRole: l.assignedTo ? (userMap[l.assignedTo]?.role ?? null) : null,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
        closedAt: l.closedAt,
        lossReason: l.lossReason,
        odpId: l.odpId,
        distanceMeters: l.distanceMeters,
      })),
    });
  } catch (e: any) {
    res.status(500).json({ error: "internal", message: e.message });
  }
});

publicApiRouter.get("/api/public/v1/leads/stats", requireScope("leads:read"), async (req, res) => {
  try {
    const { from, to } = parseRange(req, 30);
    const all = await storage.getLeads();
    const inRange = all.filter((l: any) => l.createdAt >= from && l.createdAt <= to);

    const byStage: Record<string, number> = {};
    const byWilayah: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    let won = 0, lost = 0, open = 0;

    for (const l of inRange) {
      byStage[l.stage ?? "new"] = (byStage[l.stage ?? "new"] ?? 0) + 1;
      const w = l.district || "Unknown";
      byWilayah[w] = (byWilayah[w] ?? 0) + 1;
      bySource[l.source ?? "unknown"] = (bySource[l.source ?? "unknown"] ?? 0) + 1;
      if (l.stage === "won") won++;
      else if (l.stage === "lost") lost++;
      else open++;
    }

    res.json({
      range: { from, to },
      total: inRange.length,
      byStage, byWilayah, bySource,
      funnel: {
        open, won, lost,
        conversionRate: (won + lost) > 0 ? +(won / (won + lost) * 100).toFixed(2) : 0,
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: "internal", message: e.message });
  }
});

publicApiRouter.get("/api/public/v1/leads/:id", requireScope("leads:read"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const lead = await storage.getLeadById(id);
    if (!lead) return res.status(404).json({ error: "not_found" });
    const activities = await storage.getLeadActivities(id);
    // Resolve all unique user IDs across lead + activities
    const uids = Array.from(new Set([
      ...(lead.assignedTo ? [lead.assignedTo] : []),
      ...(lead.createdBy ? [lead.createdBy] : []),
      ...activities.map((a: any) => a.userId).filter(Boolean),
    ] as number[]));
    const userMap = await _lookupUsers(uids);
    res.json({
      lead: {
        ...lead,
        assignedToName: lead.assignedTo ? (userMap[lead.assignedTo]?.name ?? null) : null,
        assignedToRole: lead.assignedTo ? (userMap[lead.assignedTo]?.role ?? null) : null,
        createdByName: lead.createdBy ? (userMap[lead.createdBy]?.name ?? null) : null,
      },
      activities: activities.map((a: any) => ({
        id: a.id, type: a.type, content: a.content,
        userId: a.userId,
        userName: a.userId ? (userMap[a.userId]?.name ?? null) : null,
        createdAt: a.createdAt,
        hasPhoto: !!a.photoData,
      })),
    });
  } catch (e: any) {
    res.status(500).json({ error: "internal", message: e.message });
  }
});

// ==================== COLLECTIONS ====================

publicApiRouter.get("/api/public/v1/collections", requireScope("collections:read"), async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req);
    const stage = req.query.stage as string | undefined;
    const openOnly = req.query.openOnly === "true";
    const assignedTo = req.query.assignedTo ? Number(req.query.assignedTo) : undefined;

    const all: any[] = await storage.getCollections({ stage: stage as any, openOnly, assignedTo });
    const total = all.length;
    const page = all.slice(offset, offset + limit);

    // Resolve assignee names
    const userIds = Array.from(new Set(page.map((c: any) => c.assignedTo).filter(Boolean) as number[]));
    const userMap = await _lookupUsers(userIds);

    res.json({
      filters: { stage, openOnly, assignedTo },
      pagination: { limit, offset, total },
      data: page.map((c: any) => ({
        id: c.id,
        customerId: c.customerId,
        customerName: c.customerName,
        customerBillingId: c.customerBillingId,
        customerPhone: c.customerPhone,
        stage: c.stage,
        issueType: c.issueType,
        priority: c.priority,
        openedAt: c.openedAt,
        openedAmount: c.openedAmount,
        openedDueDate: c.openedDueDate,
        openedIsolirDate: c.openedIsolirDate,
        promiseDate: c.promiseDate,
        closedAt: c.closedAt,
        closeReason: c.closeReason,
        assignedTo: c.assignedTo,
        assignedToName: c.assignedTo ? (userMap[c.assignedTo]?.name ?? null) : null,
        assignedToUsername: c.assignedTo ? (userMap[c.assignedTo]?.username ?? null) : null,
        assignedToRole: c.assignedTo ? (userMap[c.assignedTo]?.role ?? null) : null,
        ageDays: c.openedAt ? Math.floor((Date.now() - new Date(c.openedAt).getTime()) / 86400_000) : null,
      })),
    });
  } catch (e: any) {
    res.status(500).json({ error: "internal", message: e.message });
  }
});

publicApiRouter.get("/api/public/v1/collections/stats", requireScope("collections:read"), async (_req, res) => {
  try {
    const stats = await storage.getCollectionStats();
    const open: any[] = await storage.getCollections({ openOnly: true });
    const totalOutstanding = open.reduce((sum: number, c: any) => sum + (c.openedAmount ?? 0), 0);
    res.json({
      ...stats,
      totalOutstandingAmount: totalOutstanding,
      openCount: open.length,
    });
  } catch (e: any) {
    res.status(500).json({ error: "internal", message: e.message });
  }
});

publicApiRouter.get("/api/public/v1/collections/:id", requireScope("collections:read"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const col = await storage.getCollection(id);
    if (!col) return res.status(404).json({ error: "not_found" });
    const activities = await storage.getCollectionActivities(id);
    const uids = Array.from(new Set([
      ...((col as any).assignedTo ? [(col as any).assignedTo] : []),
      ...((col as any).assignedBy ? [(col as any).assignedBy] : []),
      ...activities.map((a: any) => a.userId).filter(Boolean),
    ] as number[]));
    const userMap = await _lookupUsers(uids);
    res.json({
      collection: {
        ...col,
        assignedToName: (col as any).assignedTo ? (userMap[(col as any).assignedTo]?.name ?? null) : null,
        assignedToRole: (col as any).assignedTo ? (userMap[(col as any).assignedTo]?.role ?? null) : null,
      },
      activities: activities.map((a: any) => ({
        id: a.id, type: a.type, content: a.content,
        userId: a.userId,
        userName: a.userId ? (userMap[a.userId]?.name ?? null) : null,
        createdAt: a.createdAt,
        hasPhoto: !!a.photoData,
      })),
    });
  } catch (e: any) {
    res.status(500).json({ error: "internal", message: e.message });
  }
});

// ==================== SAHABAT ====================

publicApiRouter.get("/api/public/v1/sahabat/stats", requireScope("sahabat:read"), async (_req, res) => {
  try {
    res.json(await storage.getLoyaltyAdminSummary());
  } catch (e: any) {
    res.status(500).json({ error: "internal", message: e.message });
  }
});

publicApiRouter.get("/api/public/v1/sahabat/leaderboard", requireScope("sahabat:read"), async (req, res) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const sortBy = req.query.sortBy === "streak" ? "streak" : "referrals";
    res.json(await storage.getLoyaltyLeaderboard(limit, sortBy as any));
  } catch (e: any) {
    res.status(500).json({ error: "internal", message: e.message });
  }
});

publicApiRouter.get("/api/public/v1/sahabat/referrals", requireScope("sahabat:read"), async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const limit = Math.min(500, parseInt(req.query.limit as string) || 100);
    res.json(await storage.listAllReferralsAdmin({ status, limit }));
  } catch (e: any) {
    res.status(500).json({ error: "internal", message: e.message });
  }
});

// ==================== TICKETS ====================

publicApiRouter.get("/api/public/v1/tickets", requireScope("tickets:read"), async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req);
    const status = req.query.status as string | undefined;
    const { from, to } = parseRange(req, 30);

    const all: any[] = await storage.getTickets();
    let filtered = all;
    if (status) filtered = filtered.filter((t: any) => t.status === status);
    filtered = filtered.filter((t: any) => t.createdAt >= from && t.createdAt <= to);
    const total = filtered.length;
    const page = filtered.slice(offset, offset + limit);

    res.json({
      range: { from, to },
      filters: { status },
      pagination: { limit, offset, total },
      data: page.map((t: any) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        title: t.title,
        status: t.status,
        priority: t.priority,
        categoryId: t.categoryId,
        categoryName: t.categoryName,
        customerId: t.customerId,
        customerName: t.customerName,
        assignedTo: t.assignedTo,
        assignedToName: t.assignedToName,
        createdAt: t.createdAt,
        resolvedAt: t.resolvedAt,
        closedAt: t.closedAt,
        slaHours: t.slaHours,
      })),
    });
  } catch (e: any) {
    res.status(500).json({ error: "internal", message: e.message });
  }
});

publicApiRouter.get("/api/public/v1/tickets/stats", requireScope("tickets:read"), async (_req, res) => {
  try {
    const all: any[] = await storage.getTickets();
    const byStatus: Record<string, number> = {};
    for (const t of all) {
      byStatus[t.status ?? "unknown"] = (byStatus[t.status ?? "unknown"] ?? 0) + 1;
    }
    const openNow = all.filter((t: any) => ["open", "assigned", "in_progress"].includes(t.status)).length;
    res.json({
      total: all.length,
      openNow,
      byStatus,
    });
  } catch (e: any) {
    res.status(500).json({ error: "internal", message: e.message });
  }
});

// ==================== FINANCE ====================

publicApiRouter.get("/api/public/v1/finance/overview", requireScope("finance:read"), async (_req, res) => {
  try { await storage.ensureKpiSnapshotForToday(); res.json(await storage.getFinanceOverview()); }
  catch (e: any) { res.status(500).json({ error: "internal", message: e.message }); }
});

publicApiRouter.get("/api/public/v1/finance/timeseries", requireScope("finance:read"), async (req, res) => {
  try {
    const { period, from, to } = parsePeriod(req);
    const allowed = ["mrr", "active", "isolir", "revenue_at_risk"];
    const metric = allowed.includes(req.query.metric as string) ? (req.query.metric as any) : "mrr";
    await storage.ensureKpiSnapshotForToday();
    res.json(await storage.getFinanceTimeseries(metric, period, from, to));
  } catch (e: any) { res.status(500).json({ error: "internal", message: e.message }); }
});

publicApiRouter.get("/api/public/v1/finance/collections", requireScope("finance:read"), async (req, res) => {
  try { const { period, from, to } = parsePeriod(req); res.json(await storage.getCollectionsFinance(period, from, to)); }
  catch (e: any) { res.status(500).json({ error: "internal", message: e.message }); }
});

// ==================== CUSTOMERS ====================

publicApiRouter.get("/api/public/v1/customers/overview", requireScope("customers:read"), async (_req, res) => {
  try { await storage.ensureKpiSnapshotForToday(); res.json(await storage.getCustomersOverview()); }
  catch (e: any) { res.status(500).json({ error: "internal", message: e.message }); }
});

publicApiRouter.get("/api/public/v1/customers/timeseries", requireScope("customers:read"), async (req, res) => {
  try {
    const { period, from, to } = parsePeriod(req);
    const allowed = ["new_activations", "active", "net_adds"];
    const metric = allowed.includes(req.query.metric as string) ? (req.query.metric as any) : "new_activations";
    await storage.ensureKpiSnapshotForToday();
    res.json(await storage.getCustomersTimeseries(metric, period, from, to));
  } catch (e: any) { res.status(500).json({ error: "internal", message: e.message }); }
});

// ==================== EXECUTIVE REPORT ====================

publicApiRouter.get("/api/public/v1/reports/executive", requireScope("reports:read"), async (req, res) => {
  try { const { period, from, to } = parsePeriod(req); await storage.ensureKpiSnapshotForToday(); res.json(await storage.getExecutiveReport(period, from, to)); }
  catch (e: any) { res.status(500).json({ error: "internal", message: e.message }); }
});

// ==================== TEAMSPACE (v5.0 Fase 3 - FR-16xx) ====================
// Aggregate untuk n8n / BI / AI agent - tanpa isi chat/dokumen (privacy by design).

publicApiRouter.get("/api/public/v1/teamspace/tasks", requireScope("teamspace:read"), async (req, res) => {
  try {
    const detail = req.query.detail === "1";
    const teamsList = await storage.listTeams(false);
    const pipelineIds = teamsList.map((t) => t.taskPipelineId).filter((x): x is number => x != null);
    const summaries = await storage.getTeamTaskSummaries(pipelineIds);
    const out: any = {
      teams: teamsList.map((t) => ({
        id: t.id, name: t.name, type: t.type,
        taskSummary: (t.taskPipelineId != null ? summaries.get(t.taskPipelineId) : null) ?? { total: 0, done: 0, overdue: 0 },
      })),
    };
    if (detail) {
      const stagesMap = await storage.listStagesForPipelines(pipelineIds);
      const cards = await storage.listCardsForPipelines(pipelineIds);
      const teamByPipeline = new Map(teamsList.filter((t) => t.taskPipelineId != null).map((t) => [t.taskPipelineId as number, t]));
      const nowIso = new Date().toISOString();
      out.cards = cards.filter((c) => (c as any).isPrivate !== 1).map((c) => {
        const st = (stagesMap.get(c.pipelineId) ?? []).find((s) => s.id === c.stageId);
        const semantic = (st as any)?.semanticType ?? null;
        const done = (c as any).isCompleted === 1 || semantic === "done";
        return {
          id: c.id, title: c.title,
          teamId: teamByPipeline.get(c.pipelineId)?.id ?? null,
          teamName: teamByPipeline.get(c.pipelineId)?.name ?? null,
          stage: st?.label ?? null, semanticType: semantic,
          status: semantic === "cancelled" ? "batal" : done ? "selesai" : (c.dueDate && c.dueDate < nowIso) ? "terlambat" : semantic === "in_progress" ? "dikerjakan" : "belum",
          assigneeId: c.assigneeId, priority: c.priority,
          dueDate: c.dueDate, createdAt: c.createdAt, completedAt: (c as any).completedAt ?? null,
        };
      });
    }
    res.json(out);
  } catch (e: any) { res.status(500).json({ error: "internal", message: e.message }); }
});

// ==================== DIVISIONS (v5.4) - analisa pekerjaan tim per divisi ====================
// ONE-SHOT untuk AI agent: output tim (tiket/lead/collection/canvassing) per DIVISI,
// windowed daily→weekly→monthly + snapshot KPI domain. Anggota dipetakan dari role.

const DIVISION_DEFS: { key: string; label: string; roles: string[] }[] = [
  { key: "marketing", label: "Marketing", roles: ["marketing", "marketing_spv"] },
  { key: "teknik", label: "Operasional & Technical Support", roles: ["operator", "teknisi", "teknik"] },
  { key: "noc", label: "NOC", roles: ["noc"] },
  { key: "cs", label: "Layanan Pelanggan", roles: ["cs", "customer_service"] },
  { key: "keuangan", label: "Keuangan", roles: ["finance", "keuangan"] },
  { key: "hrd", label: "HRD", roles: ["hrd", "hr"] },
];
const ROLE_TO_DIVISION: Record<string, string> = {};
for (const d of DIVISION_DEFS) for (const r of d.roles) ROLE_TO_DIVISION[r] = d.key;

/** Hitung jendela waktu ISO dari period (daily/weekly/monthly/quarterly) atau from/to eksplisit. */
function periodWindow(p: { period: string; from?: string; to?: string }): { fromIso: string; toIso: string; label: string } {
  const now = new Date();
  if (p.from || p.to) {
    const f = p.from ?? p.to!;
    const t = p.to ?? p.from!;
    return { fromIso: new Date(`${f}T00:00:00`).toISOString(), toIso: new Date(`${t}T23:59:59`).toISOString(), label: `${f}..${t}` };
  }
  const days = p.period === "daily" ? 1 : p.period === "weekly" ? 7 : p.period === "quarterly" ? 90 : 30;
  const from = p.period === "daily"
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
    : new Date(now.getTime() - days * 86400_000);
  return { fromIso: from.toISOString(), toIso: now.toISOString(), label: p.period };
}

type OpsRow = { ticketsResolved: number; leadsWon: number; collectionsClosed: number; canvassingReports: number };
const EMPTY_OPS: OpsRow = { ticketsResolved: 0, leadsWon: 0, collectionsClosed: 0, canvassingReports: 0 };
const sumOps = (a: OpsRow, b: OpsRow): OpsRow => ({
  ticketsResolved: a.ticketsResolved + b.ticketsResolved,
  leadsWon: a.leadsWon + b.leadsWon,
  collectionsClosed: a.collectionsClosed + b.collectionsClosed,
  canvassingReports: a.canvassingReports + b.canvassingReports,
});

/** Agregasi output tim per divisi untuk window tertentu (dipakai kedua endpoint). */
async function buildDivisionAggregates(fromIso: string, toIso: string) {
  const [users, opsMap] = await Promise.all([
    storage.getAllUsers(),
    storage.getOpsStatsForUsers(fromIso, toIso),
  ]);
  const byDivision = new Map<string, { members: any[]; totals: OpsRow }>();
  for (const d of DIVISION_DEFS) byDivision.set(d.key, { members: [], totals: { ...EMPTY_OPS } });
  for (const u of users) {
    const divKey = ROLE_TO_DIVISION[String((u as any).role ?? "").toLowerCase()];
    if (!divKey) continue; // admin/role lintas-divisi tidak dihitung ke satu divisi
    const ops = opsMap.get(u.id) ?? { ...EMPTY_OPS };
    const bucket = byDivision.get(divKey)!;
    bucket.members.push({
      userId: u.id, name: (u as any).name ?? (u as any).username, username: (u as any).username,
      role: (u as any).role, active: (u as any).isActive === 1, ops,
    });
    bucket.totals = sumOps(bucket.totals, ops);
  }
  return byDivision;
}

publicApiRouter.get("/api/public/v1/divisions", requireScope("divisions:read"), async (req, res) => {
  try {
    const win = periodWindow(parsePeriod(req));
    const [byDivision, dash, colStats] = await Promise.all([
      buildDivisionAggregates(win.fromIso, win.toIso),
      storage.getDashboardStats().catch(() => null as any),
      storage.getCollectionStats().catch(() => null as any),
    ]);
    const divisions = DIVISION_DEFS.map((d) => {
      const agg = byDivision.get(d.key)!;
      const snapshot: Record<string, number> = {};
      if (dash) {
        if (d.key === "marketing") { snapshot.newCustomerPerDay = dash.rataPertumbuhanHarian; snapshot.activeCustomers = dash.activeCustomers; }
        if (d.key === "noc" || d.key === "cs") { snapshot.activeCustomers = dash.activeCustomers; snapshot.isolirCustomers = dash.isolirCustomers; }
        if (d.key === "teknik") { snapshot.odpKritis = dash.odpKritisCount; snapshot.coreFeederSisa = dash.coreFeederSisa; }
      }
      if (colStats && (d.key === "keuangan" || d.key === "cs")) { snapshot.openCollections = colStats.total; snapshot.outstandingRp = colStats.totalOverdue; }
      return {
        key: d.key, label: d.label, memberCount: agg.members.length,
        teamOutput: agg.totals, snapshot,
      };
    });
    res.json({ period: win.label, window: { from: win.fromIso, to: win.toIso }, generatedAt: new Date().toISOString(), divisions });
  } catch (e: any) { res.status(500).json({ error: "internal", message: e.message }); }
});

publicApiRouter.get("/api/public/v1/divisions/:key", requireScope("divisions:read"), async (req, res) => {
  try {
    const key = String(req.params.key).toLowerCase();
    const def = DIVISION_DEFS.find((d) => d.key === key);
    if (!def) return res.status(404).json({ error: "not_found", message: `Divisi "${key}" tidak dikenal. Pilihan: ${DIVISION_DEFS.map((d) => d.key).join(", ")}` });
    const win = periodWindow(parsePeriod(req));
    const byDivision = await buildDivisionAggregates(win.fromIso, win.toIso);
    const agg = byDivision.get(key)!;
    // Member diurut dari kontribusi terbanyak (untuk analisa top/bottom performer).
    const members = [...agg.members].sort((a, b) => {
      const sa = a.ops.ticketsResolved + a.ops.leadsWon + a.ops.collectionsClosed + a.ops.canvassingReports;
      const sb = b.ops.ticketsResolved + b.ops.leadsWon + b.ops.collectionsClosed + b.ops.canvassingReports;
      return sb - sa;
    });
    const snapshot: Record<string, number> = {};
    if (key === "keuangan" || key === "cs") {
      const cs = await storage.getCollectionStats().catch(() => null as any);
      if (cs) { snapshot.openCollections = cs.total; snapshot.outstandingRp = cs.totalOverdue; snapshot.avgAgeDays = cs.avgAgeDays; }
    }
    if (["teknik", "noc", "cs", "marketing"].includes(key)) {
      const dash = await storage.getDashboardStats().catch(() => null as any);
      if (dash) {
        if (key === "teknik") { snapshot.odpKritis = dash.odpKritisCount; snapshot.coreFeederSisa = dash.coreFeederSisa; snapshot.totalOdp = dash.totalOdps; }
        if (key === "noc" || key === "cs") { snapshot.activeCustomers = dash.activeCustomers; snapshot.isolirCustomers = dash.isolirCustomers; snapshot.totalCustomers = dash.totalCustomers; }
        if (key === "marketing") { snapshot.newCustomerPerDay = dash.rataPertumbuhanHarian; snapshot.activeCustomers = dash.activeCustomers; }
      }
    }
    res.json({
      key, label: def.label, period: win.label, window: { from: win.fromIso, to: win.toIso },
      generatedAt: new Date().toISOString(),
      memberCount: members.length, teamOutput: agg.totals, snapshot, members,
    });
  } catch (e: any) { res.status(500).json({ error: "internal", message: e.message }); }
});

publicApiRouter.get("/api/public/v1/teamspace/performance", requireScope("teamspace:read"), async (req, res) => {
  try {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const from = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from ?? "")) ? String(req.query.from) : fmt(new Date(now.getTime() - 29 * 86400_000));
    const to = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to ?? "")) ? String(req.query.to) : fmt(now);
    const fromIso = new Date(`${from}T00:00:00`).toISOString();
    const toIso = new Date(`${to}T23:59:59`).toISOString();
    const nowIso = new Date().toISOString();

    const teamsList = await storage.listTeams(false);
    const pipelineIds = teamsList.map((t) => t.taskPipelineId).filter((x): x is number => x != null);
    const [stagesMap, cards, opsMap] = await Promise.all([
      storage.listStagesForPipelines(pipelineIds),
      storage.listCardsForPipelines(pipelineIds),
      storage.getOpsStatsForUsers(fromIso, toIso),
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
    const isDone = (c: any) => c.isCompleted === 1 || doneStages.has(c.stageId);
    const completedDateOf = (c: any): string | null => c.completedAt ?? (doneStages.has(c.stageId) ? (c.stageEnteredAt ?? null) : null);
    const periodCards = cards.filter((c) => !cancelledStages.has(c.stageId)
      && c.createdAt <= toIso && (!isDone(c) || (completedDateOf(c) ?? nowIso) >= fromIso));

    const perUser = new Map<number, { selesai: number; dikerjakan: number; belum: number; terlambat: number }>();
    const agg = (id: number) => {
      const cur = perUser.get(id) ?? { selesai: 0, dikerjakan: 0, belum: 0, terlambat: 0 };
      perUser.set(id, cur);
      return cur;
    };
    for (const c of periodCards) {
      const targets = new Set<number>([c.assigneeId ?? -1, ...(secondaryByCard.get(c.id) ?? [])]);
      targets.delete(-1);
      const st = (stagesMap.get(c.pipelineId) ?? []).find((s) => s.id === c.stageId);
      const status = isDone(c) ? "selesai"
        : (c.dueDate && c.dueDate < nowIso) ? "terlambat"
        : (st as any)?.semanticType === "in_progress" ? "dikerjakan" : "belum";
      for (const t of targets) (agg(t) as any)[status]++;
    }
    for (const [uid] of opsMap) agg(uid);

    res.json({
      period: { from, to },
      users: [...perUser.entries()].map(([userId, tasks]) => {
        const ops = opsMap.get(userId) ?? { ticketsResolved: 0, leadsWon: 0, collectionsClosed: 0, canvassingReports: 0 };
        return { userId, tasks: { ...tasks, total: tasks.selesai + tasks.dikerjakan + tasks.belum + tasks.terlambat }, ops };
      }),
    });
  } catch (e: any) { res.status(500).json({ error: "internal", message: e.message }); }
});
