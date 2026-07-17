/**
 * MPWA Jabnet Gateway Adapter (v4.1.3)
 * ────────────────────────────────────
 * Adapter untuk MPWA Multi Device di https://mpwa.jabnet.id.
 *
 * Format payload JABNET MPWA (LINK: lihat /MPWA_API.md di root proyek):
 *   POST https://mpwa.jabnet.id/send-message
 *   Content-Type: application/json
 *   Body: {
 *     "api_key": "<MPWA_API_KEY>",
 *     "sender": "6281XXXXXXXXXX",    // nomor device WA yang connected di MPWA
 *     "number": "6281YYYYYYYYYY",    // nomor penerima (tanpa + atau 0 leading)
 *     "message": "...",
 *     "footer": "..." (opsional)
 *   }
 *
 * Response sukses: { "status": true, "msg": "Message sent successfully!" }
 * Response gagal:  { "status": false, "msg": "Invalid data!", "errors": {} }
 *
 * Config disimpan di app_settings:
 *   - mpwa_enabled ("true"|"false")
 *   - mpwa_url (default: "https://mpwa.jabnet.id")
 *   - mpwa_token (api_key dari MPWA user profile)
 *   - mpwa_sender_number (nomor device WA JABNET, format 62xxx)
 *   - mpwa_message_template (template pesan OTP, placeholder {otp} {ttlMin})
 *   - mpwa_last_success_at, mpwa_last_error (status observability)
 */

import { storage } from "./storage.js";

export interface MpwaConfig {
  url: string;           // base URL, e.g. https://mpwa.jabnet.id
  apiKey: string;        // MPWA api_key dari /info-user
  senderNumber: string;  // nomor device WA yang connected (62xxx)
  messageTemplate?: string;
}

const DEFAULT_URL = "https://mpwa.jabnet.id";
const DEFAULT_TEMPLATE = `*JABNET FTTH*
Kode OTP login: *{otp}*
Berlaku {ttlMin} menit.
Jangan share kode ini ke siapapun.`;

/** Load config — Phase F: per-tenant via mitra_integrations, falls back to app_settings.
 *  Caller must be inside tenant context (workers wrap with withMitra). */
export async function loadMpwaConfig(): Promise<MpwaConfig | null> {
  // Dev/staging hard-disable: env flag overrides DB setting. Cegah real customer kena pesan.
  if (process.env.MPWA_FORCE_DISABLED === "true") return null;
  const enabled = (await storage.getMitraSetting("mpwa_enabled")) === "true";
  if (!enabled) return null;
  const url = (await storage.getMitraSetting("mpwa_url")) || DEFAULT_URL;
  const apiKey = await storage.getMitraSetting("mpwa_token");
  const senderNumber = await storage.getMitraSetting("mpwa_sender_number");
  if (!apiKey || !senderNumber) return null;
  const messageTemplate = (await storage.getMitraSetting("mpwa_message_template")) || DEFAULT_TEMPLATE;
  return { url, apiKey, senderNumber, messageTemplate };
}

/** Normalize phone ke format 62xxx (tanpa + atau 0 leading) sesuai spec MPWA */
export function normalizePhone(phone: string): string {
  let p = phone.trim().replace(/[\s\-()+ ]/g, "");
  // Hapus leading +
  if (p.startsWith("+")) p = p.slice(1);
  // Indonesian: 0 → 62
  if (p.startsWith("0")) p = "62" + p.slice(1);
  // Kalau langsung 8xx tanpa 62, tambahkan
  if (/^8\d+/.test(p)) p = "62" + p;
  return p;
}

/** Mask phone untuk display aman: 08xx-xxxx-5678 → 081x******5678 */
export function maskPhone(phone: string): string {
  const p = phone.trim();
  if (p.length < 6) return p.replace(/./g, "*");
  const tail = p.slice(-4);
  const head = p.slice(0, 4);
  return `${head}${"*".repeat(Math.max(0, p.length - 8))}${tail}`;
}

/** Format pesan OTP dari template */
export function formatOtpMessage(template: string, otp: string, ttlMinutes: number): string {
  return template
    .replace(/\{otp\}/g, otp)
    .replace(/\{ttlMin\}/g, String(ttlMinutes))
    .replace(/\{ttlMinutes\}/g, String(ttlMinutes));
}

/**
 * Kirim pesan via MPWA /send-message. Return {sent, error?}.
 * Timeout 15 detik. Write observability ke app_settings.
 */
export async function sendMpwaMessage(
  config: MpwaConfig,
  toNumber: string,
  message: string,
  footer?: string,
): Promise<{ sent: boolean; error?: string; response?: any; status?: number }> {
  try {
    const normalizedTo = normalizePhone(toNumber);
    const normalizedSender = normalizePhone(config.senderNumber);

    const payload: any = {
      api_key: config.apiKey,
      sender: normalizedSender,
      number: normalizedTo,
      message,
    };
    if (footer) payload.footer = footer;

    const endpoint = config.url.replace(/\/$/, "") + "/send-message";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });

    let bodyJson: any = null;
    try { bodyJson = await res.json(); } catch { /* non-JSON */ }

    // MPWA pakai "status": true/false di body sebagai success indicator
    // (bukan cuma HTTP status code)
    const success = res.ok && bodyJson?.status === true;

    if (!success) {
      const errMsg = bodyJson?.msg
        || (bodyJson?.errors ? JSON.stringify(bodyJson.errors) : null)
        || `HTTP ${res.status}`;
      await storage.setSetting("mpwa_last_error", errMsg, "portal");
      await storage.setSetting("mpwa_last_error_at", new Date().toISOString(), "portal");
      return { sent: false, error: errMsg, response: bodyJson, status: res.status };
    }

    // Success
    await storage.setSetting("mpwa_last_success_at", new Date().toISOString(), "portal");
    await storage.setSetting("mpwa_last_error", "", "portal");
    return { sent: true, response: bodyJson, status: res.status };
  } catch (err: any) {
    const msg = err.message || "Unknown MPWA error";
    await storage.setSetting("mpwa_last_error", msg, "portal");
    await storage.setSetting("mpwa_last_error_at", new Date().toISOString(), "portal");
    return { sent: false, error: msg };
  }
}

/** Kirim OTP WhatsApp. Dev mode fallback kalau config belum di-set. */
export async function sendOtpWhatsApp(
  phone: string,
  otpCode: string,
  ttlMinutes: number,
): Promise<{ sent: boolean; error?: string; devMode?: boolean; debugOtp?: string }> {
  const config = await loadMpwaConfig();
  if (!config) {
    // Dev mode: MPWA belum configured → log OTP untuk debug
    console.log(`[MPWA-DEV] OTP ${otpCode} untuk ${phone} (MPWA belum configured/disabled)`);
    return { sent: true, devMode: true, debugOtp: otpCode };
  }
  const message = formatOtpMessage(config.messageTemplate || DEFAULT_TEMPLATE, otpCode, ttlMinutes);
  const result = await sendMpwaMessage(config, phone, message);
  return result;
}

/**
 * Kirim notifikasi loyalty (streak milestone, tenure upgrade, referral reward) ke customer.
 * Render template dari mpwa_templates → substitusi placeholder → kirim.
 * Fire-and-forget — tidak throw kalau MPWA belum configured.
 */
export async function sendLoyaltyNotification(
  templateKey: string,
  phone: string,
  placeholders: Record<string, string>,
): Promise<{ sent: boolean; devMode?: boolean; error?: string }> {
  const { storage } = await import("./storage.js");
  const template = await storage.getMpwaTemplateByKey(templateKey);
  if (!template) {
    console.warn(`[mpwa-loyalty] template "${templateKey}" not found, skip send`);
    return { sent: false, error: "template not found" };
  }

  // Render template dengan placeholder substitution
  let message = template.content;
  for (const [key, val] of Object.entries(placeholders)) {
    message = message.replace(new RegExp(`\\{${key}\\}`, "g"), String(val ?? ""));
  }

  const config = await loadMpwaConfig();
  if (!config) {
    console.log(`[mpwa-loyalty-DEV] to=${phone} template=${templateKey}\n${message}`);
    return { sent: true, devMode: true };
  }

  const result = await sendMpwaMessage(config, phone, message, "JABNET Loyalty");
  if (result.sent) {
    console.log(`[mpwa-loyalty] ✓ sent ${templateKey} to ${maskPhone(phone)}`);
  } else {
    console.warn(`[mpwa-loyalty] ✗ failed ${templateKey} to ${maskPhone(phone)}: ${result.error}`);
  }
  return result;
}

/** Test MPWA connection — kirim pesan test ke nomor admin */
export async function testMpwaConnection(testPhone: string): Promise<{ sent: boolean; error?: string; response?: any }> {
  const config = await loadMpwaConfig();
  if (!config) {
    return { sent: false, error: "MPWA belum dikonfigurasi — isi api_key + sender_number di app_settings" };
  }
  const message = `*JABNET FTTH - Test Integration*\nKoneksi MPWA berhasil.\nWaktu: ${new Date().toLocaleString("id-ID")}\nSender: ${config.senderNumber}`;
  return sendMpwaMessage(config, testPhone, message, "Sent via FTTH Tools v4.1.3");
}

/** Check apakah nomor tujuan terdaftar di WhatsApp (optional pre-send validation) */
export async function checkWhatsAppNumber(phone: string): Promise<{ valid: boolean; error?: string }> {
  const config = await loadMpwaConfig();
  if (!config) return { valid: true }; // skip check kalau MPWA belum configured

  try {
    const normalized = normalizePhone(phone);
    const sender = normalizePhone(config.senderNumber);
    const endpoint = config.url.replace(/\/$/, "") + "/check-number";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: config.apiKey,
        sender,
        number: normalized,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const json: any = await res.json().catch(() => null);
    if (json?.status === true) {
      return { valid: json?.msg?.exists === true };
    }
    return { valid: false, error: json?.msg || `HTTP ${res.status}` };
  } catch (err: any) {
    return { valid: false, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════════════
//  v4.2.19: MPWA Broadcast — button + media message support
//
//  Spec MPWA Jabnet send-button (POST https://mpwa.jabnet.id/public/send-button):
//    Required: api_key, sender, number, message, button (array max 5), image (URL)
//    Optional: footer
//    Button types:
//      - reply  → { type:"reply",  displayText:"Label" }
//      - call   → { type:"call",   displayText:"Label", phoneNumber:"62xxx" }
//      - url    → { type:"url",    displayText:"Label", url:"https://..." }
//      - copy   → { type:"copy",   displayText:"Label", copyText:"TEXT123" }
//
//  Strategi pengiriman:
//    1. **Kalau ada buttons + image** → kirim native via /public/send-button
//       (full interactive button + image header).
//    2. **Kalau ada buttons TANPA image** → karena MPWA mewajibkan image untuk
//       send-button, kita render button sebagai formatted text di body pesan
//       + kirim via /send-message biasa.
//    3. **Kalau ada image tanpa buttons** → /send-media (existing path).
//    4. **Text-only** → /send-message biasa.
//
//  Default endpoint: /public/send-button — bisa di-override via setting
//  mpwa_button_endpoint kalau gateway pakai path lain.
// ════════════════════════════════════════════════════════════════════

/**
 * v4.2.22: MpwaButton — sesuai spec MPWA /send-button.
 * Field utama: type + displayText + (url|phoneNumber|copyText|id).
 * Legacy alias (label, payload) tetap disupport untuk backward compat.
 */
export interface MpwaButton {
  type: "reply" | "url" | "call" | "copy";
  displayText: string;
  // Per-type fields (sesuai MPWA spec)
  url?: string;
  phoneNumber?: string;
  copyText?: string;
  id?: string;
  // Legacy aliases (auto-resolve)
  label?: string;
  payload?: string;
}

const DEFAULT_BUTTON_ENDPOINT = "/public/send-button";

/** Format buttons sebagai text yang dirender di body pesan — fallback untuk no-image button send */
export function renderButtonsAsText(buttons: MpwaButton[]): string {
  if (!buttons || buttons.length === 0) return "";
  const lines: string[] = ["", "━━━━━━━━━━━━━━━"];
  for (const b of buttons) {
    const label = b.displayText ?? b.label ?? "";
    let icon = "▫️";
    let actionLine = "";
    if (b.type === "url") {
      icon = "🔗";
      const u = b.url ?? b.payload;
      actionLine = u ? `\n   ${u}` : "";
    } else if (b.type === "call") {
      icon = "📞";
      const ph = b.phoneNumber ?? b.payload;
      const phone = ph ? normalizePhone(ph) : "";
      actionLine = phone ? `\n   https://wa.me/${phone}` : "";
    } else if (b.type === "copy") {
      icon = "📋";
      const c = b.copyText ?? b.payload;
      actionLine = c ? `\n   Kode: *${c}* _(copy manual)_` : "";
    } else {
      icon = "▶️";
      const id = b.id ?? b.payload;
      actionLine = id ? `\n   _Balas: ${id}_` : "";
    }
    lines.push(`${icon} *${label}*${actionLine}`);
  }
  lines.push("━━━━━━━━━━━━━━━");
  return lines.join("\n");
}

/**
 * Kirim pesan ke MPWA dengan optional buttons / media.
 *
 * Flow:
 *   - Buttons + image → POST /public/send-button (native interactive button)
 *   - Buttons tanpa image → fallback ke text-button via /send-message
 *   - Image saja → /send-media
 *   - Text saja → /send-message
 */
export async function sendMpwaRichMessage(
  config: MpwaConfig,
  toNumber: string,
  payload: {
    message: string;
    footer?: string;
    buttons?: MpwaButton[];
    mediaUrl?: string;
    mediaType?: "image" | "video" | "document";
  },
): Promise<{ sent: boolean; error?: string; response?: any; status?: number; mode?: "button" | "media" | "text" }> {
  const normalizedTo = normalizePhone(toNumber);
  const normalizedSender = normalizePhone(config.senderNumber);
  const baseUrl = config.url.replace(/\/$/, "");
  const buttons = Array.isArray(payload.buttons) ? payload.buttons.slice(0, 5) : [];
  const hasButtons = buttons.length > 0;
  const hasMedia = !!payload.mediaUrl && !!payload.mediaType;
  const isImage = hasMedia && payload.mediaType === "image";

  // ── 1. NATIVE BUTTON (buttons + image) ──
  // MPWA /public/send-button mewajibkan image. Kalau template kasih image, kirim native button.
  if (hasButtons && isImage) {
    const endpointSetting = (await storage.getSetting("mpwa_button_endpoint")) ?? "";
    const endpoint = endpointSetting && endpointSetting.trim() !== ""
      ? (endpointSetting.startsWith("/") ? endpointSetting : "/" + endpointSetting)
      : DEFAULT_BUTTON_ENDPOINT;

    const body: any = {
      api_key: config.apiKey,
      sender: normalizedSender,
      number: normalizedTo,
      message: payload.message,
      image: payload.mediaUrl,
      button: buttons.map(b => {
        const item: any = { type: b.type, displayText: b.label };
        if (b.type === "url") item.url = b.payload ?? "";
        else if (b.type === "call") item.phoneNumber = b.payload ? normalizePhone(b.payload) : "";
        else if (b.type === "copy") item.copyText = b.payload ?? "";
        // type=reply → cukup displayText, no extra field needed per spec
        return item;
      }),
    };
    if (payload.footer) body.footer = payload.footer;

    const result = await postMpwa(baseUrl + endpoint, body);
    if (result.sent) return { ...result, mode: "button" };
    console.warn(`[MPWA] native button send failed (${result.error}), fallback to text-button`);
    // Fallthrough → text mode dengan text-buttons appended
  }

  // ── 2. MEDIA mode (image/video/document tanpa button) ──
  if (hasMedia && !hasButtons) {
    const body: any = {
      api_key: config.apiKey,
      sender: normalizedSender,
      number: normalizedTo,
      file: payload.mediaUrl,
      media_type: payload.mediaType,
      caption: payload.message,
    };
    if (payload.footer) body.footer = payload.footer;
    const result = await postMpwa(baseUrl + "/send-media", body);
    if (result.sent) return { ...result, mode: "media" };
    console.warn(`[MPWA] media send failed, fallback to text: ${result.error}`);
  }

  // ── 3. TEXT mode (default, juga fallback dari button kalau gagal) ──
  //   - Append text-button kalau ada button (universal fallback)
  //   - Kalau ada image tapi button gagal, image-nya hilang tapi pesan tetap sampai
  const buttonText = hasButtons ? renderButtonsAsText(buttons) : "";
  const fullMessage = payload.message + buttonText;
  const result = await sendMpwaMessage(config, toNumber, fullMessage, payload.footer);
  return { ...result, mode: "text" };
}

/** Internal helper: POST ke MPWA + parse response. */
async function postMpwa(url: string, body: any): Promise<{ sent: boolean; error?: string; response?: any; status?: number }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    let bodyJson: any = null;
    try { bodyJson = await res.json(); } catch {}
    const success = res.ok && bodyJson?.status === true;
    if (success) {
      await storage.setSetting("mpwa_last_success_at", new Date().toISOString(), "portal");
      return { sent: true, response: bodyJson, status: res.status };
    }
    const errMsg = bodyJson?.msg
      || (bodyJson?.errors ? JSON.stringify(bodyJson.errors) : null)
      || `HTTP ${res.status}`;
    return { sent: false, error: errMsg, response: bodyJson, status: res.status };
  } catch (err: any) {
    return { sent: false, error: err.message || "Network error" };
  }
}

/** Get device status dari MPWA (Connected / Disconnect) */
export async function getMpwaDeviceStatus(): Promise<{ connected: boolean; info?: any; error?: string }> {
  const config = await loadMpwaConfig();
  if (!config) return { connected: false, error: "MPWA belum dikonfigurasi" };

  try {
    const endpoint = config.url.replace(/\/$/, "") + "/info-devices";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: config.apiKey,
        number: normalizePhone(config.senderNumber),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const json: any = await res.json().catch(() => null);
    if (json?.status === true && Array.isArray(json.info) && json.info.length > 0) {
      const device = json.info[0];
      return {
        connected: String(device.status).toLowerCase() === "connected",
        info: device,
      };
    }
    return { connected: false, error: json?.msg || `HTTP ${res.status}` };
  } catch (err: any) {
    return { connected: false, error: err.message };
  }
}
