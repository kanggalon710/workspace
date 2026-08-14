/**
 * Telegram Bot Adapter (v4.2.1)
 * -----------------------------
 * Integrasi dengan Telegram Bot API untuk kirim notifikasi per-user (staff).
 * Pairing flow: user generate 6-digit kode → kirim `/start <kode>` ke bot →
 * server resolve kode → simpan chat_id ke users.telegram_chat_id.
 *
 * Config di app_settings:
 *   - telegram_enabled ("true"|"false")
 *   - telegram_bot_token (dari @BotFather)
 *   - telegram_bot_username (cached display, diset saat test sukses)
 *   - telegram_last_success_at / telegram_last_error / telegram_last_error_at
 *
 * Per-user di users table:
 *   - telegram_chat_id  (string numeric)
 *   - telegram_username (@handle display)
 *   - telegram_linked_at
 *   - telegram_prefs    (JSON: notif toggle per event)
 */

import { storage } from "./storage.js";

export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
}

export interface TelegramPairing {
  code: string;
  userId: number;
  expiresAt: number;
}

export type TelegramEventKey =
  | "lead_assigned"
  | "lead_hot"
  | "canvassing_report"
  | "sahabat_referral"
  | "collection_promise"
  | "ticket_assigned"
  | "ticket_escalation"
  | "sla_escalation";

export const TELEGRAM_EVENT_DEFAULTS: Record<TelegramEventKey, boolean> = {
  lead_assigned: true,
  lead_hot: true,
  canvassing_report: true,
  sahabat_referral: true,
  collection_promise: true,
  ticket_assigned: true,
  ticket_escalation: true,
  sla_escalation: true,
};

export const TELEGRAM_EVENT_LABELS: Record<TelegramEventKey, string> = {
  lead_assigned: "Lead baru di-assign ke saya",
  lead_hot: "Lead pindah ke stage Hot / Won",
  canvassing_report: "Canvassing report baru di area saya",
  sahabat_referral: "Referral Sahabat baru",
  collection_promise: "Janji bayar jatuh tempo",
  ticket_assigned: "Ticket baru di-assign ke saya",
  ticket_escalation: "Ticket di-escalate (priority naik)",
  sla_escalation: "SLA breach / mendekati expiry",
};

// -- In-memory pairing code store (TTL 5 menit) --
// Tidak di-persist ke DB: codes cuma hidup sebentar + regen gampang.
const pairingCodes = new Map<string, TelegramPairing>();
const PAIRING_TTL_MS = 5 * 60 * 1000;

function purgeExpiredPairings(): void {
  const now = Date.now();
  for (const [code, p] of pairingCodes.entries()) {
    if (p.expiresAt < now) pairingCodes.delete(code);
  }
}

/** Generate 6-digit pairing code untuk user tertentu. TTL 5 menit. */
export function generatePairingCode(userId: number): string {
  purgeExpiredPairings();
  // Hapus code lama user ini (kalau re-request)
  for (const [code, p] of pairingCodes.entries()) {
    if (p.userId === userId) pairingCodes.delete(code);
  }
  // 6-digit numeric, leading zero OK
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  pairingCodes.set(code, {
    code,
    userId,
    expiresAt: Date.now() + PAIRING_TTL_MS,
  });
  return code;
}

/** Resolve pairing code → userId (kalau valid & belum expired). */
export function resolvePairingCode(code: string): number | null {
  purgeExpiredPairings();
  const p = pairingCodes.get(code);
  if (!p) return null;
  pairingCodes.delete(code); // one-time use
  return p.userId;
}

export async function loadTelegramConfig(): Promise<TelegramConfig | null> {
  const enabled = (await storage.getMitraSetting("telegram_enabled")) === "true";
  const botToken = await storage.getMitraSetting("telegram_bot_token");
  if (!botToken) return null;
  return { enabled, botToken };
}

/** Escape user-supplied text untuk Markdown Telegram (v1, bukan MarkdownV2). */
export function escapeTgMarkdown(text: string): string {
  return String(text)
    .replace(/_/g, "\\_")
    .replace(/\*/g, "\\*")
    .replace(/`/g, "\\`")
    .replace(/\[/g, "\\[");
}

/**
 * Kirim pesan ke chat Telegram tertentu.
 * Return { sent, error?, response?, status? }.
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string | number,
  text: string,
  opts?: { parseMode?: "Markdown" | "HTML"; disablePreview?: boolean },
): Promise<{ sent: boolean; error?: string; response?: any; status?: number }> {
  try {
    const endpoint = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const payload: any = {
      chat_id: chatId,
      text,
      disable_web_page_preview: opts?.disablePreview ?? true,
    };
    if (opts?.parseMode) payload.parse_mode = opts.parseMode;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    let bodyJson: any = null;
    try { bodyJson = await res.json(); } catch { /* non-JSON */ }

    const success = res.ok && bodyJson?.ok === true;
    if (!success) {
      const errMsg = bodyJson?.description || `HTTP ${res.status}`;
      await storage.setMitraSetting("telegram_last_error", errMsg);
      await storage.setMitraSetting("telegram_last_error_at", new Date().toISOString());
      return { sent: false, error: errMsg, response: bodyJson, status: res.status };
    }
    await storage.setMitraSetting("telegram_last_success_at", new Date().toISOString());
    await storage.setMitraSetting("telegram_last_error", "");
    return { sent: true, response: bodyJson, status: res.status };
  } catch (err: any) {
    const msg = err.message || "Unknown Telegram error";
    await storage.setMitraSetting("telegram_last_error", msg);
    await storage.setMitraSetting("telegram_last_error_at", new Date().toISOString());
    return { sent: false, error: msg };
  }
}

/**
 * Kirim notifikasi event ke user tertentu (staff).
 * Respect user's telegram_prefs - kalau opt-out, skip.
 * Fire-and-forget: tidak throw kalau Telegram belum configured.
 */
export async function notifyUserTelegram(
  userId: number,
  event: TelegramEventKey,
  text: string,
): Promise<{ sent: boolean; reason?: string }> {
  try {
    const cfg = await loadTelegramConfig();
    if (!cfg || !cfg.enabled) return { sent: false, reason: "telegram_disabled" };

    const user: any = await storage.getUser(userId);
    if (!user?.telegramChatId) return { sent: false, reason: "user_not_paired" };

    // Check prefs - default semua true kalau null
    let prefs: Record<string, boolean> = { ...TELEGRAM_EVENT_DEFAULTS };
    if (user.telegramPrefs) {
      try { prefs = { ...prefs, ...JSON.parse(user.telegramPrefs) }; } catch { /* ignore */ }
    }
    if (prefs[event] === false) return { sent: false, reason: "opted_out" };

    const result = await sendTelegramMessage(cfg.botToken, user.telegramChatId, text, {
      parseMode: "Markdown",
    });
    return { sent: result.sent, reason: result.error };
  } catch (e: any) {
    console.warn("[telegram] notifyUser error:", e.message);
    return { sent: false, reason: e.message };
  }
}

/**
 * Broadcast notifikasi ke SEMUA user yang meet the filter.
 * Dipakai utk event yang relevan ke multiple staff (misal: canvassing report
 * di area yang bukan assigned ke 1 user saja).
 */
export async function notifyRolesTelegram(
  roleNames: string[],
  event: TelegramEventKey,
  text: string,
): Promise<{ attempted: number; sent: number }> {
  const cfg = await loadTelegramConfig();
  if (!cfg || !cfg.enabled) return { attempted: 0, sent: 0 };

  // Load all active users with telegram linked
  const users = await storage.getAllUsers();
  const targets = users.filter((u: any) =>
    u.isActive === 1
    && u.telegramChatId
    && (roleNames.length === 0 || roleNames.includes(u.role))
  );

  let sent = 0;
  for (const u of targets) {
    const r = await notifyUserTelegram((u as any).id, event, text);
    if (r.sent) sent++;
  }
  return { attempted: targets.length, sent };
}

/**
 * Verify bot token & get bot info (@username, id, name).
 */
export async function getBotInfo(botToken: string): Promise<{ ok: boolean; username?: string; id?: number; firstName?: string; error?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
      signal: AbortSignal.timeout(10_000),
    });
    const body: any = await res.json();
    if (!res.ok || !body?.ok) return { ok: false, error: body?.description || `HTTP ${res.status}` };
    return {
      ok: true,
      username: body.result?.username,
      id: body.result?.id,
      firstName: body.result?.first_name,
    };
  } catch (e: any) {
    return { ok: false, error: e.message || "Unknown error" };
  }
}
