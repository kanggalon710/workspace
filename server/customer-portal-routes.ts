/**
 * Customer Portal Routes (v4.1.3)
 * ------------------------------
 * Self-service API untuk pelanggan. Terpisah dari staff routes.
 * Login: customerId + OTP ke WhatsApp (via MPWA).
 *
 * Fitur:
 * - Auth: request-otp, verify-otp, resend-otp, logout
 * - Profile: me (info + status PPPoE + ONT)
 * - Traffic: live session + grafik 24h
 * - Billing: status tagihan
 * - WiFi: ganti password & SSID via GenieACS
 * - ONT: restart (rate-limit 1x/jam)
 * - Tickets: list + lapor kendala baru
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { randomBytes, createHash } from "crypto";
import bcrypt from "bcryptjs";
import { storage } from "./storage.js";
import { tenantContext } from "./tenant-context.js";
import { sendOtpWhatsApp, maskPhone } from "./mpwa.js";
import {
  getDevices as genieGetDevices,
  getDevice as genieGetDevice,
  setWifiParams, rebootDevice,
  type GenieAcsConfig,
} from "./genieacs.js";
import { getPppActive, getInterfaces } from "./mikrotik.js";

/** Ambil config GenieACS per-mitra (ACS pelanggan diisolasi per mitra).
 *  Portal jalan di tenantContext mitra pelanggan. JABNET (mitra 1) fallback ke app_settings global;
 *  mitra lain WAJIB config sendiri (tidak fallback → cegah akses ACS JABNET). */
async function getGenieConfig(): Promise<GenieAcsConfig | null> {
  try {
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
    if (!host) return null;
    const port = await pick("genieacs_port");
    const username = await pick("genieacs_username");
    const password = await pick("genieacs_password");
    return { host, port: Number(port) || 7557, username: username || "", password: password || "" };
  } catch { return null; }
}

/**
 * Cari device GenieACS by pppoe username atau serial number.
 * Targeted query - tidak fetch all devices (jauh lebih cepat + reliable).
 * Search di multiple TR-069 paths karena PPPoE bisa di WANConnectionDevice.1 atau .2.
 */
async function findDeviceForCustomer(
  config: GenieAcsConfig,
  pppoeUsername: string | null,
  serialNumber?: string | null,
): Promise<any | null> {
  if (!pppoeUsername && !serialNumber) return null;
  const ors: any[] = [];
  if (pppoeUsername) {
    ors.push(
      { "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username._value": pppoeUsername },
      { "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Username._value": pppoeUsername },
      { "VirtualParameters.pppoeUsername._value": pppoeUsername },
    );
  }
  if (serialNumber) {
    ors.push(
      { "_deviceId._SerialNumber": serialNumber },
      { "DeviceID.SerialNumber": serialNumber },
    );
  }
  const query = ors.length === 1 ? ors[0] : { $or: ors };
  const devices = await genieGetDevices(config, query, 5, 0);
  return devices[0] ?? null;
}

export const customerPortalRouter = Router();

// Phase G: resolve mitra from X-Mitra-Slug header (sent by frontend MitraSlugProvider)
//   or ?mitra=slug query param. Falls back to mitra 1 (JABNET) for legacy /portal/* paths.
//   All downstream storage calls (pre-auth + authed) inherit this tenant context.
customerPortalRouter.use("/api/portal", async (req, res, next) => {
  const slug = String(
    req.headers["x-mitra-slug"] ??
    (req.query.mitra ?? "")
  ).toLowerCase().trim();
  let mitraId = 1;
  if (slug && slug !== "jabnet") {
    try {
      const m = await storage.getMitraBySlug(slug);
      if (m && (m as any).isActive !== 0) mitraId = m.id;
    } catch (e: any) {
      console.warn("[portal] mitra slug resolve failed:", e?.message);
    }
  }
  tenantContext.run({ mitraId, userId: 0, isSuperAdmin: false }, () => next());
});

// ==================== TYPES & HELPERS ====================

declare module "express-serve-static-core" {
  interface Request {
    portalCustomer?: {
      id: number;
      customerId: string;
      name: string;
      pppoeUsername: string | null;
      phone: string | null;
      sessionId: number;
    };
  }
}

const OTP_TTL_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RATE_LIMIT_WINDOW_MIN = 15;
const OTP_RATE_LIMIT_MAX = 3;
const SESSION_TTL_HOURS = 2;
const ONT_RESTART_MAX_PER_HOUR = 1;

function sendOk(res: Response, data: unknown, status = 200) {
  res.status(status).json({ success: true, data });
}
function sendErr(res: Response, message: string, status = 400) {
  res.status(status).json({ success: false, error: message });
}

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateSessionToken(): string {
  return randomBytes(48).toString("hex");
}

function getClientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
}

/** Customer auth middleware - validasi token dari header Authorization Bearer */
async function customerAuth(req: Request, res: Response, next: NextFunction) {
  try {
    // v4.2.17: Public endpoints - accessible tanpa session token (akses via WhatsApp link)
    //   - /api/portal/csat/:token (rating + feedback pasca-resolusi)
    //   - /api/portal/track/:ticketId (live tracker tiket)
    // Saat router mounted di /api/portal, req.originalUrl masih full path tapi req.path relative
    const fullPath = req.originalUrl.split("?")[0];
    if (fullPath.startsWith("/api/portal/csat/") || fullPath.startsWith("/api/portal/track/")) {
      return next();
    }
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return sendErr(res, "Unauthorized - login dulu", 401);
    }
    const token = authHeader.replace("Bearer ", "").trim();
    const session = await storage.getCustomerPortalSessionByToken(token);
    if (!session) return sendErr(res, "Session invalid - silakan login ulang", 401);
    if (session.revokedAt) return sendErr(res, "Session sudah di-logout", 401);
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      await storage.revokeCustomerPortalSession(token);
      return sendErr(res, "Session expired - login ulang", 401);
    }

    const customer = await storage.getCustomer(session.customerId);
    if (!customer) return sendErr(res, "Pelanggan tidak ditemukan", 404);
    if ((customer as any).isActive === 0) return sendErr(res, "Akun pelanggan non-aktif", 403);

    await storage.touchCustomerPortalSession(token);
    req.portalCustomer = {
      id: customer.id,
      customerId: customer.customerId,
      name: customer.name,
      pppoeUsername: customer.pppoeUsername ?? null,
      phone: customer.phone ?? null,
      sessionId: session.id,
    };
    next();
  } catch (e: any) {
    sendErr(res, e.message ?? "Auth error", 500);
  }
}

// ==================== PUBLIC AUTH ENDPOINTS ====================

/**
 * POST /api/portal/auth/request-otp
 * Body: { customerId }
 * Return: { otpSessionId, phoneMasked, ttlSec, devMode? (kalau MPWA belum configured) }
 */
customerPortalRouter.post("/api/portal/auth/request-otp", async (req: Request, res: Response) => {
  try {
    const customerIdRaw = String(req.body?.customerId ?? "").trim();
    if (!customerIdRaw) return sendErr(res, "Customer ID wajib diisi");
    if (customerIdRaw.length < 3 || customerIdRaw.length > 30) {
      return sendErr(res, "Customer ID tidak valid");
    }

    // Phase G: use resolved mitra from middleware context (slug → mitra_id)
    const ctxMitra = tenantContext.getStore()?.mitraId ?? 1;
    const customer = await storage.getCustomerByBillingCustomerId(customerIdRaw, ctxMitra);
    if (!customer) return sendErr(res, "Customer ID tidak terdaftar");
    if (!customer.phone) return sendErr(res, "Nomor HP tidak terdaftar. Hubungi CS untuk update kontak.");

    // Rate limit: max 3 OTP per 15 menit per customer
    const recentCount = await storage.countRecentOtpRequests(customer.id, OTP_RATE_LIMIT_WINDOW_MIN);
    if (recentCount >= OTP_RATE_LIMIT_MAX) {
      console.warn(`[PORTAL-OTP] rate-limit hit untuk customer ${customer.customerId} (${recentCount} req / ${OTP_RATE_LIMIT_WINDOW_MIN}min)`);
      return sendErr(res, `Terlalu banyak permintaan OTP untuk ${maskPhone(customer.phone)}. Tunggu ${OTP_RATE_LIMIT_WINDOW_MIN} menit lalu coba lagi, atau hubungi CS.`, 429);
    }

    // Generate OTP + hash
    const otpCode = generateOtp();
    const otpHash = await bcrypt.hash(otpCode, 10);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60_000);

    const otp = await storage.createCustomerOtp({
      customerId: customer.id,
      otpCodeHash: otpHash,
      phone: customer.phone,
      expiresAt: expiresAt.toISOString(),
      attempts: 0,
      status: "pending",
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"]?.slice(0, 255) ?? null,
      createdAt: now.toISOString(),
    } as any);

    // Send OTP via MPWA (fire-and-forget)
    const sendResult = await sendOtpWhatsApp(customer.phone, otpCode, OTP_TTL_MINUTES);

    // Log OTP request untuk ops debugging (tanpa plaintext kode OTP)
    console.log(`[PORTAL-OTP] customer=${customer.customerId} phone=${maskPhone(customer.phone)} sent=${sendResult.sent} devMode=${sendResult.devMode ?? false}${sendResult.error ? ' error=' + sendResult.error : ''}`);

    // Audit log (tidak simpan OTP plain ke log)
    await storage.createAuditLog({
      userId: null, username: "(portal)", userName: customer.name,
      action: "OTP_REQUEST", entityType: "customer_otp", entityId: otp.id,
      entityName: customer.customerId,
      details: JSON.stringify({ sent: sendResult.sent, error: sendResult.error, devMode: sendResult.devMode }),
      createdAt: now.toISOString(),
    } as any);

    // Kalau MPWA kirim gagal (bukan dev mode), return error lebih informatif
    if (!sendResult.sent && !sendResult.devMode) {
      // Detect common errors dari MPWA
      const errMsg = sendResult.error ?? "Unknown error";
      let userFriendly = `Gagal kirim OTP via WhatsApp: ${errMsg}`;
      if (errMsg.toLowerCase().includes("not sent") || errMsg.toLowerCase().includes("göndəri")) {
        userFriendly = `OTP gagal terkirim. Kemungkinan nomor HP ${maskPhone(customer.phone)} belum terdaftar di WhatsApp. Hubungi CS untuk update nomor.`;
      }
      return sendErr(res, userFriendly, 502);
    }

    const response: any = {
      otpSessionId: otp.id,
      phoneMasked: maskPhone(customer.phone),
      ttlSec: OTP_TTL_MINUTES * 60,
      sent: sendResult.sent,
    };
    // Dev mode: expose OTP ke response untuk testing (NEVER di production)
    if (sendResult.devMode) {
      response.devMode = true;
      response.debugOtp = sendResult.debugOtp;
    }
    sendOk(res, response);
  } catch (e: any) { sendErr(res, e.message, 500); }
});

/**
 * POST /api/portal/auth/verify-otp
 * Body: { otpSessionId, code }
 * Return: { token, customer, expiresAt }
 */
customerPortalRouter.post("/api/portal/auth/verify-otp", async (req: Request, res: Response) => {
  try {
    const otpSessionId = Number(req.body?.otpSessionId);
    const code = String(req.body?.code ?? "").trim();
    if (!otpSessionId || !code) return sendErr(res, "OTP session ID dan code wajib diisi");
    if (!/^\d{6}$/.test(code)) return sendErr(res, "OTP harus 6 digit angka");

    const otp = await storage.getCustomerOtp(otpSessionId);
    if (!otp) return sendErr(res, "OTP session tidak ditemukan", 404);
    if (otp.status === "verified") return sendErr(res, "OTP sudah pernah diverifikasi");
    if (otp.status === "locked") return sendErr(res, "OTP sudah di-lock karena terlalu banyak percobaan salah");
    if (otp.status === "expired" || new Date(otp.expiresAt).getTime() < Date.now()) {
      await storage.updateCustomerOtp(otpSessionId, { status: "expired" } as any);
      return sendErr(res, "OTP sudah expired. Minta OTP baru.", 410);
    }

    // Verify via bcrypt
    const match = await bcrypt.compare(code, otp.otpCodeHash);
    if (!match) {
      const attempts = (otp.attempts ?? 0) + 1;
      const patch: any = { attempts };
      if (attempts >= OTP_MAX_ATTEMPTS) patch.status = "locked";
      await storage.updateCustomerOtp(otpSessionId, patch);
      const remaining = OTP_MAX_ATTEMPTS - attempts;
      if (remaining <= 0) return sendErr(res, "OTP terkunci karena salah 5x. Minta OTP baru.", 429);
      return sendErr(res, `OTP salah. Sisa ${remaining} percobaan.`);
    }

    // OTP correct → create session
    const customer = await storage.getCustomer(otp.customerId);
    if (!customer) return sendErr(res, "Pelanggan tidak ditemukan", 404);
    const token = generateSessionToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_HOURS * 3600_000);

    const session = await storage.createCustomerPortalSession({
      customerId: customer.id,
      token,
      phoneMasked: maskPhone(customer.phone ?? ""),
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"]?.slice(0, 255) ?? null,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      lastActivityAt: now.toISOString(),
    } as any);

    await storage.updateCustomerOtp(otpSessionId, { status: "verified", verifiedAt: now.toISOString() } as any);

    await storage.createAuditLog({
      userId: null, username: "(portal)", userName: customer.name,
      action: "LOGIN", entityType: "customer_portal_session", entityId: session.id,
      entityName: customer.customerId,
      details: JSON.stringify({ ipAddress: getClientIp(req) }),
      createdAt: now.toISOString(),
    } as any);

    sendOk(res, {
      token,
      expiresAt: session.expiresAt,
      customer: {
        id: customer.id,
        customerId: customer.customerId,
        name: customer.name,
        package: customer.package,
        phone: customer.phone,
      },
    });
  } catch (e: any) { sendErr(res, e.message, 500); }
});

/**
 * POST /api/portal/auth/logout - revoke session
 */
customerPortalRouter.post("/api/portal/auth/logout", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "").trim();
    await storage.revokeCustomerPortalSession(token).catch(() => {});
  }
  sendOk(res, { message: "Logout berhasil" });
});

// ==================== AUTHENTICATED ENDPOINTS ====================

customerPortalRouter.use("/api/portal", customerAuth);

/** GET /api/portal/me - info pelanggan + status PPPoE + ONT */
customerPortalRouter.get("/api/portal/me", async (req: Request, res: Response) => {
  try {
    const pc = req.portalCustomer!;
    const customer = await storage.getCustomer(pc.id);
    if (!customer) return sendErr(res, "Customer tidak ditemukan", 404);

    // Live status PPPoE - parallel router queries (was sequential)
    let sessionInfo: any = null;
    try {
      if (customer.pppoeUsername) {
        const routers = (await storage.getMikrotikRouters()).filter(r => r.isActive === 1);
        const settled = await Promise.allSettled(
          routers.map(router =>
            getPppActive({
              host: router.host, port: router.port ?? undefined,
              username: router.username, password: router.password,
              useSsl: router.useSsl === 1,
            } as any).then((sessions: any[]) => ({ router, sessions }))
          )
        );
        const target = customer.pppoeUsername!.toLowerCase();
        for (const result of settled) {
          if (result.status !== "fulfilled") continue;
          const { router, sessions } = result.value;
          const found = sessions.find((s: any) => String(s.name).toLowerCase() === target);
          if (found) {
            sessionInfo = {
              online: true,
              routerName: router.name,
              ipAddress: found.address,
              macAddress: found.callerId ?? found["caller-id"],
              uptime: found.uptime,
              sessionId: found.sessionId ?? found.id,
            };
            break;
          }
        }
      }
    } catch { /* skip session info */ }
    if (!sessionInfo) sessionInfo = { online: false };

    // Live status ONT - targeted query ke GenieACS (jauh lebih cepat dari fetch all)
    let ontInfo: any = null;
    try {
      const geCfg = await getGenieConfig();
      if (geCfg && customer.pppoeUsername) {
        const device = await findDeviceForCustomer(geCfg, customer.pppoeUsername, (customer as any).ontSerialNumber);
        if (device) {
          ontInfo = {
            matched: true,
            deviceId: device.deviceId,
            status: device.status,
            serialNumber: device.serialNumber,
            manufacturer: device.manufacturer,
            model: device.productClass,
            rxPower: device.rxPower,
            ipAddress: device.ipAddress,
            lastInform: device.lastInform,
            uptime: device.uptime,
          };
        }
      }
    } catch (e: any) {
      console.warn("[portal/me] ONT lookup error:", e.message);
    }
    if (!ontInfo) ontInfo = { matched: false };

    sendOk(res, {
      customer: {
        id: customer.id,
        customerId: customer.customerId,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
        package: customer.package,
        pppoeUsername: customer.pppoeUsername,
        status: customer.status,
        isIsolir: customer.isIsolir,
      },
      pppoe: sessionInfo,
      ont: ontInfo,
    });
  } catch (e: any) { sendErr(res, e.message, 500); }
});

/** GET /api/portal/traffic - live + grafik 24h
 * Live traffic diambil dari /interface MikroTik (rxByte/txByte) bukan dari PPP active session
 * (session hanya expose limit-bytes bukan actual counter).
 * Interface name di MikroTik: "<pppoe-in-NAME>" format.
 */
customerPortalRouter.get("/api/portal/traffic", async (req: Request, res: Response) => {
  try {
    const pc = req.portalCustomer!;
    const snapshots = await storage.getTrafficLast24h(pc.id);

    const chartData = snapshots.map(s => ({
      timestamp: s.timestamp,
      bytesIn: s.bytesIn,
      bytesOut: s.bytesOut,
      uptime: s.uptimeSeconds,
    }));

    // Live session + traffic counter - parallel PPP query across routers, then targeted interface query on match
    let live: any = null;
    const customer = await storage.getCustomer(pc.id);
    if (customer?.pppoeUsername) {
      const routers = (await storage.getMikrotikRouters()).filter(r => r.isActive === 1);
      const credsFor = (router: typeof routers[number]) => ({
        host: router.host, port: router.port ?? undefined,
        username: router.username, password: router.password,
        useSsl: router.useSsl === 1,
      } as any);
      const target = customer.pppoeUsername!.toLowerCase();

      // Phase 1: parallel getPppActive across all routers
      const settled = await Promise.allSettled(
        routers.map(router =>
          getPppActive(credsFor(router)).then((sessions: any[]) => ({ router, sessions }))
        )
      );

      // Phase 2: find first router-in-list-order with match, query its interfaces only
      for (const result of settled) {
        if (result.status !== "fulfilled") continue;
        const { router, sessions } = result.value;
        const foundSess = sessions.find((s: any) => String(s.name).toLowerCase() === target);
        if (!foundSess) continue;

        let bytesIn = 0, bytesOut = 0;
        try {
          const interfaces: any[] = await getInterfaces(credsFor(router));
          const iface = interfaces.find((i: any) => {
            const name = String(i.name ?? "").toLowerCase();
            return name.includes(target) || name === `<pppoe-${target}>` || name === `pppoe-${target}`;
          });
          if (iface) {
            bytesIn = Number(iface.rxByte ?? iface["rx-byte"] ?? 0);
            bytesOut = Number(iface.txByte ?? iface["tx-byte"] ?? 0);
          }
        } catch { /* interface query fail - skip traffic counter */ }

        live = {
          online: true,
          routerName: router.name,
          ipAddress: foundSess.address,
          macAddress: foundSess.callerId ?? foundSess["caller-id"] ?? null,
          uptime: foundSess.uptime,
          sessionId: foundSess.sessionId ?? foundSess.id,
          bytesIn,
          bytesOut,
        };
        break;
      }
    }

    sendOk(res, { live: live ?? { online: false }, snapshots: chartData });
  } catch (e: any) { sendErr(res, e.message, 500); }
});

/** GET /api/portal/traffic/live - lightweight realtime byte counter
 *  Frontend polls tiap 3 detik untuk hitung delta = Mbps/Gbps live speed.
 *  Cuma return { bytesIn, bytesOut, ts, online } - tidak query snapshots.
 */
customerPortalRouter.get("/api/portal/traffic/live", async (req: Request, res: Response) => {
  try {
    const pc = req.portalCustomer!;
    const customer = await storage.getCustomer(pc.id);
    if (!customer?.pppoeUsername) {
      return sendOk(res, { online: false, ts: Date.now(), bytesIn: 0, bytesOut: 0 });
    }
    const routers = (await storage.getMikrotikRouters()).filter((r: any) => r.isActive === 1);
    const credsFor = (router: typeof routers[number]) => ({
      host: router.host, port: router.port ?? undefined,
      username: router.username, password: router.password,
      useSsl: router.useSsl === 1,
    } as any);
    const target = customer.pppoeUsername!.toLowerCase();

    // Phase 1: parallel getPppActive across all routers
    const settled = await Promise.allSettled(
      routers.map(router =>
        getPppActive(credsFor(router)).then((sessions: any[]) => ({ router, sessions }))
      )
    );

    // Phase 2: find first router with match, query its interface only
    for (const result of settled) {
      if (result.status !== "fulfilled") continue;
      const { router, sessions } = result.value;
      const sess = sessions.find((s: any) => String(s.name).toLowerCase() === target);
      if (!sess) continue;

      let bytesIn = 0, bytesOut = 0;
      try {
        const interfaces: any[] = await getInterfaces(credsFor(router));
        const iface = interfaces.find((i: any) => {
          const name = String(i.name ?? "").toLowerCase();
          return name.includes(target) || name === `<pppoe-${target}>` || name === `pppoe-${target}`;
        });
        if (iface) {
          bytesIn = Number(iface.rxByte ?? iface["rx-byte"] ?? 0);
          bytesOut = Number(iface.txByte ?? iface["tx-byte"] ?? 0);
        }
      } catch { /* skip */ }

      return sendOk(res, {
        online: true,
        ts: Date.now(),
        bytesIn, bytesOut,
        ipAddress: sess.address,
        uptime: sess.uptime,
      });
    }
    sendOk(res, { online: false, ts: Date.now(), bytesIn: 0, bytesOut: 0 });
  } catch (e: any) { sendErr(res, e.message, 500); }
});

/** GET /api/portal/billing - status tagihan */
customerPortalRouter.get("/api/portal/billing", async (req: Request, res: Response) => {
  try {
    const pc = req.portalCustomer!;
    const customer = await storage.getCustomer(pc.id);
    if (!customer) return sendErr(res, "Customer tidak ditemukan", 404);
    sendOk(res, {
      billingStatus: customer.billingStatus,
      billingPrice: customer.billingPrice,
      dueDate: (customer as any).dueDate ?? null,
      lastPaymentDate: (customer as any).lastPaymentDate ?? null,
      isolirDate: (customer as any).isolirDate ?? null,
      isIsolir: customer.isIsolir === 1,
      package: customer.package,
      installDate: customer.installDate,
    });
  } catch (e: any) { sendErr(res, e.message, 500); }
});

/** GET /api/portal/wifi/info - return current SSID + password untuk form edit */
customerPortalRouter.get("/api/portal/wifi/info", async (req: Request, res: Response) => {
  try {
    const pc = req.portalCustomer!;
    const customer = await storage.getCustomer(pc.id);
    if (!customer?.pppoeUsername) return sendErr(res, "PPPoE tidak terdaftar", 400);

    const geCfg = await getGenieConfig();
    if (!geCfg) return sendErr(res, "GenieACS belum dikonfigurasi", 503);

    // Find device
    const lightDevice = await findDeviceForCustomer(geCfg, customer.pppoeUsername, (customer as any).ontSerialNumber);
    if (!lightDevice) return sendErr(res, "Perangkat ONT tidak ditemukan. Hubungi CS.", 404);

    // Fetch full detail - punya wifiInterfaces lengkap (SSID, password, enabled, securityMode)
    const fullDevice: any = await genieGetDevice(geCfg, lightDevice.deviceId);
    if (!fullDevice) return sendErr(res, "Detail ONT tidak tersedia", 404);

    // Ambil SEMUA WiFi interfaces, klasifikasi band:
    //  - index 1-4 biasanya 2.4GHz
    //  - index 5-8 biasanya 5GHz (device dualband)
    // Filter out interface yang ssid default placeholder (fh_ssid2, fh_ssid3, dll) yang disabled
    const allInterfaces = (fullDevice.wifiInterfaces ?? []).map((w: any) => ({
      index: w.index,
      ssid: w.ssid,
      password: w.password,
      enabled: w.enabled,
      securityMode: w.securityMode,
      band: w.index >= 5 ? "5GHz" : "2.4GHz",
    }));

    // Primary interface per band: index 1 untuk 2.4GHz, index 5 untuk 5GHz
    const primary24 = allInterfaces.find((w: any) => w.index === 1) ?? null;
    const primary5 = allInterfaces.find((w: any) => w.index === 5) ?? null;
    // Usable: enabled=true AND ssid tidak kosong AND bukan default placeholder
    const isDefault = (ssid: string) => /^fh_(ssid[234]|5G_ssid[234])$/i.test(ssid ?? "");
    const usable = allInterfaces.filter((w: any) => w.enabled && w.ssid && !isDefault(w.ssid));

    sendOk(res, {
      deviceId: fullDevice.deviceId,
      serialNumber: fullDevice.serialNumber,
      status: fullDevice.status,
      interfaces: allInterfaces,  // all raw untuk debug
      usable,                     // filtered: yang aktif + bukan placeholder
      primary24,                  // primary 2.4GHz (index 1)
      primary5,                   // primary 5GHz (index 5, kalau dualband)
      primary: primary24 ?? usable[0] ?? null, // backward compat
    });
  } catch (e: any) { sendErr(res, e.message, 500); }
});

/** POST /api/portal/wifi/password - ganti password WiFi via GenieACS
 * Body: { newPassword, wlanIndex? (default: semua interface usable = 2.4 + 5 GHz) }
 */
customerPortalRouter.post("/api/portal/wifi/password", async (req: Request, res: Response) => {
  try {
    const pc = req.portalCustomer!;
    const newPassword = String(req.body?.newPassword ?? "").trim();
    const requestedIdx = req.body?.wlanIndex !== undefined ? Number(req.body.wlanIndex) : null;
    if (!newPassword) return sendErr(res, "Password baru wajib diisi");
    if (newPassword.length < 8) return sendErr(res, "Password WiFi minimal 8 karakter");
    if (newPassword.length > 63) return sendErr(res, "Password WiFi maksimal 63 karakter");
    if (!/^[ -~]+$/.test(newPassword)) return sendErr(res, "Password hanya boleh karakter ASCII");

    const customer = await storage.getCustomer(pc.id);
    if (!customer?.pppoeUsername) return sendErr(res, "PPPoE tidak terdaftar");

    const geCfg = await getGenieConfig();
    if (!geCfg) return sendErr(res, "GenieACS belum dikonfigurasi. Hubungi CS.", 503);

    const lightDevice = await findDeviceForCustomer(geCfg, customer.pppoeUsername, (customer as any).ontSerialNumber);
    if (!lightDevice) return sendErr(res, "Perangkat ONT tidak ditemukan. Hubungi CS.", 404);

    // Tentukan interface yang akan di-update:
    //  - Kalau wlanIndex explicit → ubah hanya itu
    //  - Kalau tidak → ubah SEMUA interface yang enabled + non-default (2.4 + 5 GHz)
    const fullDevice: any = await genieGetDevice(geCfg, lightDevice.deviceId);
    const isDefault = (ssid: string) => /^fh_(ssid[234]|5G_ssid[234])$/i.test(ssid ?? "");
    let targets: number[];
    if (requestedIdx) {
      targets = [requestedIdx];
    } else {
      targets = (fullDevice?.wifiInterfaces ?? [])
        .filter((w: any) => w.enabled && w.ssid && !isDefault(w.ssid))
        .map((w: any) => w.index);
      if (targets.length === 0) targets = [1]; // fallback ke index 1
    }

    let allApplied = true;
    for (const idx of targets) {
      const r: any = await setWifiParams(geCfg, lightDevice.deviceId, idx, "", newPassword);
      if (!r?.applied) allApplied = false;
    }

    await storage.createAuditLog({
      userId: null, username: "(portal)", userName: customer.name,
      action: "UPDATE", entityType: "portal_wifi_password", entityId: customer.id,
      entityName: customer.customerId,
      details: JSON.stringify({ deviceId: lightDevice.deviceId, wlanIndexes: targets, applied: allApplied }),
      createdAt: new Date().toISOString(),
    } as any);

    const bandLabels = targets.map(idx => idx >= 5 ? "5GHz" : "2.4GHz").join(" + ");
    const msg = allApplied
      ? `Password WiFi (${bandLabels}) berhasil diterapkan ke perangkat.`
      : `Password WiFi (${bandLabels}) terkirim tapi perangkat offline / tidak responsif. Akan apply otomatis saat ONT check-in berikutnya (max 30 menit). Kalau buru-buru, restart ONT.`;
    sendOk(res, {
      updated: true,
      applied: allApplied,
      wlanIndexes: targets,
      message: msg,
    });
  } catch (e: any) { sendErr(res, e.message, 500); }
});

/** POST /api/portal/wifi/ssid - ganti nama WiFi
 * Body: { newSsid, wlanIndex? (default: semua usable = 2.4+5 GHz) }
 */
customerPortalRouter.post("/api/portal/wifi/ssid", async (req: Request, res: Response) => {
  try {
    const pc = req.portalCustomer!;
    const newSsid = String(req.body?.newSsid ?? "").trim();
    const requestedIdx = req.body?.wlanIndex !== undefined ? Number(req.body.wlanIndex) : null;
    if (!newSsid) return sendErr(res, "SSID wajib diisi");
    if (newSsid.length < 3 || newSsid.length > 32) return sendErr(res, "SSID harus 3-32 karakter");
    if (!/^[\x20-\x7E]+$/.test(newSsid)) return sendErr(res, "SSID hanya boleh ASCII printable");

    const customer = await storage.getCustomer(pc.id);
    if (!customer?.pppoeUsername) return sendErr(res, "PPPoE tidak terdaftar");

    const geCfg = await getGenieConfig();
    if (!geCfg) return sendErr(res, "GenieACS belum dikonfigurasi", 503);

    const lightDevice = await findDeviceForCustomer(geCfg, customer.pppoeUsername, (customer as any).ontSerialNumber);
    if (!lightDevice) return sendErr(res, "Perangkat ONT tidak ditemukan", 404);

    const fullDevice: any = await genieGetDevice(geCfg, lightDevice.deviceId);
    const isDefault = (ssid: string) => /^fh_(ssid[234]|5G_ssid[234])$/i.test(ssid ?? "");
    let targets: number[];
    if (requestedIdx) {
      targets = [requestedIdx];
    } else {
      // SSID default: set ke SEMUA interface usable biar 2.4 + 5 GHz sama nama
      targets = (fullDevice?.wifiInterfaces ?? [])
        .filter((w: any) => w.enabled && w.ssid && !isDefault(w.ssid))
        .map((w: any) => w.index);
      if (targets.length === 0) targets = [1];
    }

    let allApplied = true;
    for (const idx of targets) {
      const r: any = await setWifiParams(geCfg, lightDevice.deviceId, idx, newSsid, "");
      if (!r?.applied) allApplied = false;
    }

    await storage.createAuditLog({
      userId: null, username: "(portal)", userName: customer.name,
      action: "UPDATE", entityType: "portal_wifi_ssid", entityId: customer.id,
      entityName: customer.customerId,
      details: JSON.stringify({ deviceId: lightDevice.deviceId, newSsid, wlanIndexes: targets, applied: allApplied }),
      createdAt: new Date().toISOString(),
    } as any);

    const bandLabels = targets.map(idx => idx >= 5 ? "5GHz" : "2.4GHz").join(" + ");
    const msg = allApplied
      ? `SSID "${newSsid}" (${bandLabels}) berhasil diterapkan ke perangkat.`
      : `SSID "${newSsid}" (${bandLabels}) terkirim tapi perangkat belum responsif. Akan apply otomatis saat ONT check-in berikutnya (max 30 menit). Kalau buru-buru, restart ONT.`;
    sendOk(res, {
      updated: true,
      applied: allApplied,
      wlanIndexes: targets,
      message: msg,
    });
  } catch (e: any) { sendErr(res, e.message, 500); }
});

/** POST /api/portal/ont/restart - reboot ONT (rate-limit 1x/jam) */
customerPortalRouter.post("/api/portal/ont/restart", async (req: Request, res: Response) => {
  try {
    const pc = req.portalCustomer!;
    const recent = await storage.countOntRestartsLastHour(pc.id);
    if (recent >= ONT_RESTART_MAX_PER_HOUR) {
      return sendErr(res, "Restart ONT dibatasi 1x per jam. Coba lagi dalam 1 jam.", 429);
    }

    const customer = await storage.getCustomer(pc.id);
    if (!customer?.pppoeUsername) return sendErr(res, "PPPoE tidak terdaftar");

    const geCfg = await getGenieConfig();
    if (!geCfg) return sendErr(res, "GenieACS belum dikonfigurasi", 503);

    const device = await findDeviceForCustomer(geCfg, customer.pppoeUsername, (customer as any).ontSerialNumber);
    if (!device) return sendErr(res, "Perangkat ONT tidak ditemukan", 404);

    await rebootDevice(geCfg, device.deviceId);

    await storage.createAuditLog({
      userId: null, username: "(portal)", userName: customer.name,
      action: "REBOOT", entityType: "portal_ont_restart", entityId: customer.id,
      entityName: customer.customerId,
      details: JSON.stringify({ deviceId: device.deviceId }),
      createdAt: new Date().toISOString(),
    } as any);

    sendOk(res, { restarted: true, message: "Perintah restart ONT dikirim. Koneksi akan putus 1-2 menit lalu kembali." });
  } catch (e: any) { sendErr(res, e.message, 500); }
});

/** GET /api/portal/tickets - list tiket by customerId */
customerPortalRouter.get("/api/portal/tickets", async (req: Request, res: Response) => {
  try {
    const pc = req.portalCustomer!;
    const tickets = await storage.getTicketsByCustomerId(pc.id);
    sendOk(res, tickets);
  } catch (e: any) { sendErr(res, e.message, 500); }
});

/** GET /api/portal/tickets/:id/track - full tracking data untuk Customer Tracker page */
customerPortalRouter.get("/api/portal/tickets/:id/track", async (req: Request, res: Response) => {
  try {
    const pc = req.portalCustomer!;
    const ticketId = Number(req.params.id);
    const ticket = await storage.getTicket(ticketId);
    if (!ticket) return sendErr(res, "Tiket tidak ditemukan", 404);
    // Security: tiket harus milik customer ini
    if (ticket.customerId !== pc.id) return sendErr(res, "Akses ditolak", 403);

    const category = ticket.categoryId ? await storage.getTicketCategory(ticket.categoryId) : null;
    const stages = storage.getCategoryWorkflowStages(category);
    const transitions = await storage.getTicketStageDurations(ticket.id);
    const evidence = await storage.getTicketEvidence(ticket.id);
    const team = await storage.getTicketTeam(ticket.id);

    // Lead technician info (kalau ada)
    let lead: any = null;
    const leadMember = team.find(m => m.role === "lead") ?? team[0];
    if (leadMember) {
      const u = await storage.getUser(leadMember.userId);
      if (u) {
        lead = {
          name: u.name,
          username: u.username,
          phone: (u as any).phone ?? null,
          rating: 4.8, // placeholder - bisa di-track per teknisi nanti
        };
      }
    }

    sendOk(res, {
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        title: ticket.title,
        description: ticket.description,
        status: ticket.status,
        currentStage: ticket.currentStage,
        slaDeadline: ticket.slaDeadline,
        scheduledDate: ticket.scheduledDate,
        scheduledTime: ticket.scheduledTime,
        resolvedAt: ticket.resolvedAt,
        createdAt: ticket.createdAt,
      },
      category: category ? { id: category.id, name: category.name, color: category.color } : null,
      stages,
      transitions,
      evidence: evidence.map(e => ({
        id: e.id,
        type: e.type,
        photoData: e.photoData,
        capturedAt: e.capturedAt,
      })),
      lead,
    });
  } catch (e: any) { sendErr(res, e.message, 500); }
});

/** POST /api/portal/tickets - lapor kendala baru */
customerPortalRouter.post("/api/portal/tickets", async (req: Request, res: Response) => {
  try {
    const pc = req.portalCustomer!;
    const title = String(req.body?.title ?? "").trim();
    const description = String(req.body?.description ?? "").trim();
    const categoryId = req.body?.categoryId ? Number(req.body.categoryId) : null;
    if (!title) return sendErr(res, "Judul keluhan wajib diisi");
    if (title.length > 100) return sendErr(res, "Judul maksimal 100 karakter");
    if (description.length > 1000) return sendErr(res, "Deskripsi maksimal 1000 karakter");

    const customer = await storage.getCustomer(pc.id);
    if (!customer) return sendErr(res, "Customer tidak ditemukan", 404);

    // Auto-ambil alamat/koordinat dari customer
    const ticketNumber = await storage.getNextTicketNumber();
    const now = new Date().toISOString();
    // Fallback createdBy: admin user id = 1 (sistem marker untuk tiket dari portal)
    // Bisa di-identify via activity log yang mencatat "dibuat oleh pelanggan via portal"
    const ticket = await storage.createTicket({
      ticketNumber,
      categoryId,
      customerId: customer.id,
      title,
      description: description || null,
      priority: "medium",
      status: "open",
      createdBy: 1, // system / admin (portal customer bukan staff)
      address: customer.address ?? null,
      lat: customer.lat ?? null,
      lng: customer.lng ?? null,
      odpId: customer.odpId ?? null,
      createdAt: now,
      updatedAt: now,
    } as any);

    // Activity log (userId=1 sebagai system marker; content explicit dari portal)
    await storage.createTicketActivity({
      ticketId: ticket.id,
      userId: 1,
      type: "created",
      content: `[PORTAL PELANGGAN] Tiket dibuat oleh ${customer.name} (${customer.customerId}): ${title}`,
      createdAt: now,
    } as any);

    sendOk(res, ticket, 201);
  } catch (e: any) { sendErr(res, e.message, 500); }
});

// ====================================================================
// JABNET SAHABAT (v4.1.9) - referral-based tier + 5 level reward program
// ====================================================================

/** GET /api/portal/loyalty
 *  Return: Sahabat level, code, referral count, progress to next level, pending rewards
 */
customerPortalRouter.get("/api/portal/loyalty", async (req: Request, res: Response) => {
  try {
    const pc = req.portalCustomer!;
    await storage.getOrCreateCustomerLoyalty(pc.id);
    await storage.refreshTenureBadge(pc.id);
    const fresh = await storage.getOrCreateCustomerLoyalty(pc.id) as any;

    const discounts = await storage.getCustomerDiscounts(pc.id, { limit: 20 });
    const referrals = await storage.getReferralsByCustomer(pc.id);

    const currentStreak = fresh.onTimeStreak ?? 0;
    const totalRefs = fresh.totalSuccessfulReferrals ?? 0;
    const level = fresh.sahabatLevel ?? "new";
    const tier = fresh.sahabatTier ?? "pelanggan";
    const sahabatCode = fresh.sahabatCode ?? fresh.referralCode;

    // Level ladder - sesuai program Sahabat Panduan
    const LADDER = [
      {
        level: "new", label: "Pelanggan Biasa", threshold: 0,
        color: "#64748b", reward: "Voucher Rp 50K per referral sukses",
      },
      {
        level: "perunggu", label: "Sahabat Perunggu", threshold: 5,
        color: "#b45309", reward: "Voucher Rp 200K + Speed Boost 2x/minggu",
      },
      {
        level: "perak", label: "Sahabat Perak", threshold: 10,
        color: "#94a3b8", reward: "Internet GRATIS 12 bulan + Sertifikat Mitra",
      },
      {
        level: "emas", label: "Sahabat Emas", threshold: 20,
        color: "#f59e0b", reward: "Internet GRATIS 24 bulan + Upgrade speed permanen",
      },
      {
        level: "platinum", label: "Sahabat Platinum", threshold: 30,
        color: "#3b82f6", reward: "Internet GRATIS 36 bulan + Cash Rp 2jt + Ambassador",
      },
      {
        level: "berlian", label: "Sahabat Berlian", threshold: 50,
        color: "#a855f7", reward: "Internet GRATIS 60 bulan + Cash Rp 5jt + Trainer",
      },
    ];
    const currentLevelInfo = LADDER.find((l) => l.level === level) ?? LADDER[0];
    const nextLevelInfo = LADDER.find((l) => l.threshold > totalRefs) ?? null;
    const progressToNext = nextLevelInfo
      ? {
          toLevel: nextLevelInfo.level,
          toLabel: nextLevelInfo.label,
          threshold: nextLevelInfo.threshold,
          current: totalRefs,
          remaining: nextLevelInfo.threshold - totalRefs,
          reward: nextLevelInfo.reward,
        }
      : null;

    // Tenure info (secondary display)
    const TENURE_CFG: Record<string, any> = {
      tetangga: { label: "< 1 tahun" },
      keluarga: { label: "1-3 tahun" },
      sahabat:  { label: "3-5 tahun" },
      abadi:    { label: "5+ tahun" },
    };

    sendOk(res, {
      sahabat: {
        code: sahabatCode,
        tier,                               // pelanggan | rtrw | desa
        level,                              // new | perunggu | perak | emas | platinum | berlian | ambassador
        levelLabel: currentLevelInfo.label,
        levelColor: currentLevelInfo.color,
        currentReward: currentLevelInfo.reward,
        totalSuccessfulReferrals: totalRefs,
        totalInvited: referrals.length,
        invitedPending: referrals.filter((r) => r.status === "invited").length,
      },
      progressToNext,
      ladder: LADDER,
      // Streak tetap ditampilkan sbg "bayar disiplin" indicator (bukan reward utama)
      streak: {
        current: currentStreak,
        longest: fresh.longestStreak ?? 0,
        totalOnTime: fresh.totalOnTimePayments ?? 0,
        totalLate: fresh.totalLatePayments ?? 0,
      },
      tenure: {
        badge: fresh.tenureBadge ?? "tetangga",
        months: fresh.tenureMonths ?? 0,
        ...(TENURE_CFG[fresh.tenureBadge ?? "tetangga"] ?? TENURE_CFG.tetangga),
      },
      // Referral code legacy field - untuk backward compat frontend lama
      referral: {
        code: sahabatCode,
        totalInvited: referrals.length,
        successfullyConverted: referrals.filter((r) => r.status === "rewarded" || r.status === "registered").length,
      },
      discounts: discounts.map((d) => ({
        id: d.id,
        source: d.source,
        type: d.discountType,
        value: d.discountValue,
        description: d.description,
        eligibleForPeriod: d.eligibleForPeriod,
        status: d.status,
        expiresAt: d.expiresAt,
        appliedAt: d.appliedAt,
        createdAt: d.createdAt,
      })),
    });
  } catch (e: any) { sendErr(res, e.message, 500); }
});

/** GET /api/portal/loyalty/referrals - list referrals user sudah invite */
customerPortalRouter.get("/api/portal/loyalty/referrals", async (req: Request, res: Response) => {
  try {
    const pc = req.portalCustomer!;
    const referrals = await storage.getReferralsByCustomer(pc.id);
    sendOk(res, referrals);
  } catch (e: any) { sendErr(res, e.message, 500); }
});

// ============================================================
//  POINTS & SPEED-ON-DEMAND (v4.2.2)
// ============================================================

/**
 * Helper: load redemption catalog dari settings (JSON), fallback ke default.
 */
async function loadSpeedBoostCatalog(): Promise<Array<{ key: string; label: string; description: string; pointsCost: number; speedMultiplier: number; durationHours: number }>> {
  const raw = await storage.getSetting("speed_boost_catalog");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch { /* fall through to default */ }
  }
  return [
    { key: "boost_2x_6h",  label: "Speed 2× - 6 jam",   description: "Pakai untuk meeting, download kerjaan, atau streaming sebentar.", pointsCost: 50,  speedMultiplier: 2, durationHours: 6 },
    { key: "boost_2x_24h", label: "Speed 2× - 24 jam",  description: "Cocok untuk weekend gaming atau movie marathon.",                pointsCost: 150, speedMultiplier: 2, durationHours: 24 },
    { key: "boost_3x_6h",  label: "Speed 3× - 6 jam",   description: "Boost maksimal singkat, untuk download besar urgent.",            pointsCost: 250, speedMultiplier: 3, durationHours: 6 },
    { key: "boost_3x_24h", label: "Speed 3× - 24 jam",  description: "Boost maksimal seharian.",                                         pointsCost: 600, speedMultiplier: 3, durationHours: 24 },
  ];
}

/** GET /api/portal/points - saldo, lifetime, history (50 last), catalog, active redemption */
customerPortalRouter.get("/api/portal/points", async (req: Request, res: Response) => {
  try {
    const pc = req.portalCustomer!;
    const loyalty = await storage.getOrCreateCustomerLoyalty(pc.id);
    const history = await storage.getPointHistory(pc.id, 30);
    const catalog = await loadSpeedBoostCatalog();
    const allRedemptions = await storage.getRedemptions({ customerId: pc.id, limit: 30 });
    const active = allRedemptions.find(r => r.status === "active");
    sendOk(res, {
      balance: (loyalty as any).pointsBalance ?? 0,
      lifetimeEarned: (loyalty as any).pointsLifetimeEarned ?? 0,
      lifetimeRedeemed: (loyalty as any).pointsLifetimeRedeemed ?? 0,
      catalog,
      history: history.map(h => ({
        id: h.id,
        type: h.type,
        amount: h.amount,
        source: h.source,
        balanceAfter: h.balanceAfter,
        notes: h.notes,
        createdAt: h.createdAt,
      })),
      activeRedemption: active ? {
        id: active.id,
        rewardLabel: active.rewardLabel,
        speedMultiplier: active.speedMultiplier,
        startAt: active.startAt,
        endAt: active.endAt,
      } : null,
      redemptions: allRedemptions.slice(0, 10).map(r => ({
        id: r.id, rewardLabel: r.rewardLabel, status: r.status,
        pointsCost: r.pointsCost, createdAt: r.createdAt, endAt: r.endAt,
      })),
    });
  } catch (e: any) { sendErr(res, e.message, 500); }
});

/** POST /api/portal/points/redeem - { rewardKey } → create pending redemption */
customerPortalRouter.post("/api/portal/points/redeem", async (req: Request, res: Response) => {
  try {
    const pc = req.portalCustomer!;
    const rewardKey = String(req.body?.rewardKey ?? "").trim();
    if (!rewardKey) return sendErr(res, "rewardKey wajib");
    const catalog = await loadSpeedBoostCatalog();
    const reward = catalog.find(c => c.key === rewardKey);
    if (!reward) return sendErr(res, "Reward tidak ditemukan di catalog", 404);
    // Block kalau ada active redemption yang belum expired
    const existing = await storage.getRedemptions({ customerId: pc.id, status: "active" });
    if (existing.length > 0) return sendErr(res, "Kamu sudah punya boost aktif. Tunggu selesai dulu sebelum redeem lagi.");
    const pending = await storage.getRedemptions({ customerId: pc.id, status: "pending" });
    if (pending.length > 0) return sendErr(res, "Ada redemption pending menunggu verifikasi admin. Tunggu dulu ya.");
    try {
      const r = await storage.redeemPoints({
        customerId: pc.id,
        rewardKey: reward.key,
        rewardLabel: reward.label,
        pointsCost: reward.pointsCost,
        speedMultiplier: reward.speedMultiplier,
        durationHours: reward.durationHours,
      });

      // -- Auto-activate via MikroTik kalau toggle ON --
      const { isBoostAutoActivateEnabled, applyBoost } = await import("./mikrotik-boost.js");
      const autoOn = await isBoostAutoActivateEnabled();
      let autoResult: any = null;
      if (autoOn) {
        try {
          autoResult = await applyBoost(pc.id, reward.speedMultiplier);
          if (autoResult.success) {
            // Promote ke active
            await storage.verifyRedemption(r.id, 0 /* system */, {
              notes: `Auto-activated via MikroTik (router: ${autoResult.routerName})`,
              originalPppProfile: autoResult.originalProfile,
              boostedPppProfile: autoResult.boostedProfile,
            }).catch((e: any) => console.warn("[Boost auto-verify]:", e.message));
            // Send WA notif activated
            (async () => {
              try {
                const customer = await storage.getCustomer(pc.id);
                const loyalty = await storage.getOrCreateCustomerLoyalty(pc.id);
                if (!customer?.phone) return;
                const { sendLoyaltyNotification } = await import("./mpwa.js");
                const fmtTime = (iso: string) => new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
                const updated = await storage.getRedemption(r.id);
                await sendLoyaltyNotification("sahabat_boost_activated", customer.phone, {
                  nama: customer.name,
                  rewardLabel: reward.label,
                  speedMultiplier: String(reward.speedMultiplier),
                  durationHours: String(reward.durationHours),
                  startAt: updated?.startAt ? fmtTime(updated.startAt) : "-",
                  endAt: updated?.endAt ? fmtTime(updated.endAt) : "-",
                  balance: String((loyalty as any).pointsBalance ?? 0),
                });
              } catch (e: any) { console.warn("[Boost] WA after auto-activate:", e.message); }
            })();
          } else {
            console.warn(`[Boost] auto-activate failed for customer ${pc.id}: ${autoResult.error} (reason: ${autoResult.reason})`);
          }
        } catch (e: any) {
          console.warn("[Boost] auto-activate exception:", e.message);
        }
      }

      // Return redemption (mungkin sudah active kalau auto-activate sukses)
      const finalRedemption = await storage.getRedemption(r.id) ?? r;
      sendOk(res, {
        ...finalRedemption,
        autoActivated: !!autoResult?.success,
        autoActivateError: autoResult?.success ? null : (autoResult?.error ?? null),
      }, 201);
    } catch (e: any) {
      return sendErr(res, e.message);
    }
  } catch (e: any) { sendErr(res, e.message, 500); }
});

/** GET /api/portal/loyalty/leaderboard - top 10 Sahabat anonymized untuk portal */
customerPortalRouter.get("/api/portal/loyalty/leaderboard", async (_req: Request, res: Response) => {
  try {
    const top = await storage.getLoyaltyLeaderboard(10, "referrals");
    // Anonymize: only first name + last 3 chars
    const anon = top.map((l: any, i: number) => {
      const name = l.customerName || "Sahabat";
      const parts = name.split(" ");
      const first = parts[0];
      const initials = parts.slice(1).map((p: string) => p.charAt(0).toUpperCase() + ".").join("");
      return {
        rank: i + 1,
        displayName: `${first} ${initials}`.trim() || "Sahabat",
        level: l.sahabatLevel ?? "new",
        totalRefs: l.totalSuccessfulReferrals ?? 0,
        sahabatCode: l.sahabatCode,
      };
    });
    sendOk(res, anon);
  } catch (e: any) { sendErr(res, e.message, 500); }
});

/** GET /api/portal/loyalty/campaign - active seasonal campaign (for portal banner) */
customerPortalRouter.get("/api/portal/loyalty/campaign", async (_req: Request, res: Response) => {
  try {
    const raw = await storage.getSetting("sahabat_seasonal_campaign");
    const parsed = raw ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : null;
    const now = Date.now();
    const isActive = parsed?.startDate && parsed?.endDate
      && new Date(parsed.startDate).getTime() <= now
      && new Date(parsed.endDate).getTime() + 86400_000 >= now
      && parsed?.active !== false;
    sendOk(res, { campaign: isActive ? parsed : null, isActive });
  } catch (e: any) { sendErr(res, e.message, 500); }
});

/** POST /api/portal/loyalty/referrals - invite tetangga baru */
customerPortalRouter.post("/api/portal/loyalty/referrals", async (req: Request, res: Response) => {
  try {
    const pc = req.portalCustomer!;
    const refereePhone = String(req.body?.phone ?? "").trim();
    const refereeName = String(req.body?.name ?? "").trim();
    const notes = String(req.body?.notes ?? "").trim();

    if (!refereePhone && !refereeName) {
      return sendErr(res, "Minimal isi nama atau nomor HP tetangga");
    }
    if (refereePhone && !/^(08|\+62|62)/.test(refereePhone)) {
      return sendErr(res, "Format nomor HP tidak valid (contoh: 081234567890)");
    }

    // Check duplicate - sama phone + referrer yang sama + masih invited
    const existing = await storage.getReferralsByCustomer(pc.id);
    if (refereePhone && existing.some(r => r.refereePhone === refereePhone && r.status === "invited")) {
      return sendErr(res, "Nomor ini sudah kamu invite sebelumnya");
    }

    const referral = await storage.createReferralInvitation({
      referrerCustomerId: pc.id,
      refereePhone: refereePhone || undefined,
      refereeName: refereeName || undefined,
      notes: notes || undefined,
    });

    // Fire-and-forget WA konfirmasi ke referrer (pelanggan sendiri)
    (async () => {
      try {
        const customer = await storage.getCustomer(pc.id);
        if (!customer?.phone) return;
        const { sendLoyaltyNotification } = await import("./mpwa.js");
        const loyalty = await storage.getOrCreateCustomerLoyalty(pc.id);
        const allRefs = await storage.getReferralsByCustomer(pc.id);
        await sendLoyaltyNotification("sahabat_invite_recorded", customer.phone, {
          nama: customer.name,
          refereeName: refereeName || "tetangga",
          refereePhoneLine: refereePhone ? `\n ${refereePhone}` : "",
          sahabatCode: (loyalty as any).sahabatCode ?? loyalty.referralCode ?? "-",
          totalInvited: String(allRefs.length),
        });
      } catch (e: any) { console.warn("[Sahabat portal] invite_recorded notif:", e.message); }
    })();

    sendOk(res, referral, 201);
  } catch (e: any) { sendErr(res, e.message, 500); }
});

// ===========================================================
//  v4.2.17: PUBLIC CSAT - customer respond tanpa login (pakai token)
// ===========================================================

/** GET /api/portal/csat/:token - preview survey (siapa teknisi, ticket info) */
customerPortalRouter.get("/api/portal/csat/:token", async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token);
    const csat = await storage.getCsatByToken(token);
    if (!csat) return sendErr(res, "Survey tidak ditemukan / link kadaluarsa", 404);
    const ticket = await storage.getTicket(csat.ticketId);
    if (!ticket) return sendErr(res, "Ticket terkait tidak ditemukan", 404);
    let teknisiName = "tim teknisi";
    if (csat.resolvedByUserId) {
      const u = await storage.getUser(csat.resolvedByUserId).catch(() => null);
      if (u) teknisiName = u.name;
    }
    const customer = csat.customerId ? await storage.getCustomer(csat.customerId).catch(() => null) : null;
    sendOk(res, {
      ticketNumber: ticket.ticketNumber,
      ticketTitle: ticket.title,
      resolvedAt: ticket.resolvedAt,
      teknisi: teknisiName,
      customerName: customer?.name ?? null,
      alreadyResponded: csat.status === "responded",
      rating: csat.rating ?? null,
    });
  } catch (e: any) { sendErr(res, e.message, 500); }
});

/** POST /api/portal/csat/:token - submit rating + feedback */
customerPortalRouter.post("/api/portal/csat/:token", async (req: Request, res: Response) => {
  try {
    const { rating, feedback } = req.body || {};
    if (!rating || rating < 1 || rating > 5) return sendErr(res, "Rating harus 1-5");
    const csat = await storage.submitCsatResponse(String(req.params.token), Number(rating), feedback);
    if (!csat) return sendErr(res, "Survey tidak ditemukan", 404);
    sendOk(res, { rating: csat.rating, message: "Terima kasih atas feedback Anda" });
  } catch (e: any) { sendErr(res, e.message, 500); }
});

// ===========================================================
//  v4.2.17: PUBLIC TICKET TRACKER - customer cek progress tiket
// ===========================================================

/** GET /api/portal/track/:ticketId - public progress info (filter sensitive data) */
customerPortalRouter.get("/api/portal/track/:ticketId", async (req: Request, res: Response) => {
  try {
    const ticketId = Number(req.params.ticketId);
    if (!ticketId) return sendErr(res, "Invalid ticket ID");
    const ticket = await storage.getTicket(ticketId);
    if (!ticket) return sendErr(res, "Tiket tidak ditemukan", 404);

    // Get team (basic info - exclude phone/email)
    const team = await storage.getTicketTeam(ticketId);
    const teamPublic = team.map(m => ({
      userName: (m as any).userName ?? null,
      role: m.role,
      checkInAt: m.checkInAt,
      checkOutAt: m.checkOutAt,
    }));

    // Get latest GPS (untuk "teknisi sedang menuju lokasi")
    const gpsLogs = await storage.getTicketGpsLogs(ticketId);
    const latestGps = gpsLogs.length > 0 ? gpsLogs[gpsLogs.length - 1] : null;

    // Get workflow current
    const category = ticket.categoryId ? await storage.getTicketCategory(ticket.categoryId).catch(() => null) : null;
    const stages = storage.getCategoryWorkflowStages(category as any);
    const transitions = await storage.getTicketStageDurations(ticketId);

    sendOk(res, {
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      status: ticket.status,
      currentStage: ticket.currentStage,
      stageEnteredAt: ticket.stageEnteredAt,
      slaDeadline: ticket.slaDeadline,
      createdAt: ticket.createdAt,
      resolvedAt: ticket.resolvedAt,
      stages: stages.map(s => ({ key: s.key, label: s.label, sortOrder: s.sortOrder, isFinal: s.isFinal ?? false })),
      transitions: transitions.map(t => ({ stage: t.stage, label: t.label, enteredAt: t.enteredAt, exitedAt: t.exitedAt, durationSec: t.durationSec })),
      team: teamPublic,
      latestLocation: latestGps ? { lat: latestGps.lat, lng: latestGps.lng, event: latestGps.event, timestamp: latestGps.timestamp } : null,
      destination: ticket.lat && ticket.lng ? { lat: ticket.lat, lng: ticket.lng, address: ticket.address } : null,
    });
  } catch (e: any) { sendErr(res, e.message, 500); }
});
