/**
 * v4.2.20: WhatsApp Provider Abstraction Layer
 *
 * Sesuai PRD: support 12 provider (6 unofficial + 6 official) dengan dynamic config.
 * Setiap provider punya field config sendiri (api_key, url, token, secret, dst.).
 *
 * Interface seragam: sendText, sendImage, sendButton untuk semua provider.
 * Implementasi spesifik per provider di-handle di switch dispatch.
 *
 * Untuk Phase 1 (PRD v2 awal), implementasi LENGKAP baru ada untuk:
 *   - mpwa (full: text/image/button/copy)
 *   - fonnte (full: text/image)
 *   - wablas (full: text/image)
 * Provider lain pakai stub yang return "Belum diimplementasi" supaya admin tetap
 * bisa register device tapi tahu mana yang siap kirim.
 */

import type { WaDevice } from "../shared/schema.js";

export interface WaProviderConfig {
  apiKey?: string;
  url?: string;
  token?: string;
  secret?: string;
  deviceId?: string;
  numberKey?: string;
  channelId?: string;
  pageId?: string;
  subdomain?: string;
}

/**
 * v4.2.22: WaButton - sesuai MPWA spec format (single source of truth).
 * Untuk JABNET MPWA Jabnet (https://mpwa.jabnet.id/send-button):
 *   { type, displayText, [phoneNumber|url|copyText|id] }
 *
 * Field "label" + "payload" deprecated (legacy, masih disupport via parseButtons normalize).
 */
export interface WaButton {
  type: "reply" | "call" | "url" | "copy";
  displayText: string;
  // Per-type fields (sesuai MPWA spec)
  phoneNumber?: string;     // type=call
  url?: string;              // type=url
  copyText?: string;         // type=copy
  id?: string;               // type=reply (optional payload-id)
  // Legacy aliases (auto-normalize)
  label?: string;
  payload?: string;
}

export interface SendPayload {
  message: string;
  footer?: string;
  imageUrl?: string;            // media attachment (image only untuk button native)
  buttons?: WaButton[];         // max 5 untuk mpwa, vary per provider
  // v4.2.21: extended sends (MPWA full spec)
  mediaType?: "image" | "video" | "audio" | "document";
  mediaCaption?: string;
  poll?: { name: string; options: string[]; countable?: "0" | "1" };
  list?: {
    name: string; title: string; buttontext: string;
    sections: Array<{ title: string; description?: string; rows: Array<{ title: string; rowId: string; description?: string }> }>;
  };
  location?: { latitude: number | string; longitude: number | string };
  vcard?: { name: string; phone: string };
  sticker?: { url: string };
}

export interface SendResult {
  sent: boolean;
  error?: string;
  response?: any;
  mode?: "text" | "image" | "button";
}

function normalizePhone(phone: string): string {
  let p = phone.trim().replace(/[\s\-()+ ]/g, "");
  if (p.startsWith("+")) p = p.slice(1);
  if (p.startsWith("0")) p = "62" + p.slice(1);
  if (/^8\d+/.test(p)) p = "62" + p;
  return p;
}

function parseConfig(device: WaDevice): WaProviderConfig {
  try { return device.config ? JSON.parse(device.config) : {}; }
  catch { return {}; }
}

async function post(url: string, body: any, headers: Record<string, string> = {}): Promise<{ ok: boolean; status: number; json: any; error?: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    let json: any = null;
    try { json = await res.json(); } catch {}
    return { ok: res.ok, status: res.status, json };
  } catch (err: any) {
    return { ok: false, status: 0, json: null, error: err.message ?? "Network error" };
  }
}

/** Main entry: kirim pesan via device-specific provider */
export async function sendViaDevice(device: WaDevice, toNumber: string, payload: SendPayload): Promise<SendResult> {
  const config = parseConfig(device);
  const phone = normalizePhone(toNumber);
  const sender = normalizePhone(device.phone);

  switch (device.provider) {
    case "mpwa":           return sendMpwa(config, sender, phone, payload);
    case "fonnte":         return sendFonnte(config, phone, payload);
    case "wablas":         return sendWablas(config, phone, payload);
    case "starsender":     return sendStarsender(config, phone, payload);
    case "watzap":         return sendWatzap(config, phone, payload);
    case "wachayo":        return sendWachayo(config, sender, phone, payload);
    case "mekari_qontak":  return sendStub("Mekari Qontak");
    case "mobichat":       return sendStub("Mobichat");
    case "halo_ai":        return sendStub("Halo AI");
    case "pancake":        return sendStub("Pancake");
    case "kommo":          return sendStub("Kommo");
    case "bales_otomatis": return sendStub("Bales Otomatis");
    default:
      return { sent: false, error: `Provider "${device.provider}" tidak dikenal` };
  }
}

// -- MPWA -- (v4.2.21: pakai MPWAClient class untuk full spec support)
async function sendMpwa(cfg: WaProviderConfig, sender: string, to: string, p: SendPayload): Promise<SendResult> {
  if (!cfg.apiKey) return { sent: false, error: "MPWA: api_key kosong" };
  const { MPWAClient } = await import("./mpwa-client.js");
  const client = new MPWAClient({
    apiKey: cfg.apiKey,
    sender,
    baseUrl: cfg.url || "https://mpwa.jabnet.id",
  });

  try {
    // -- Priority routing berdasarkan payload type --
    // 1. Poll
    if (p.poll) {
      const r = await client.sendPoll(to, p.poll.name, p.poll.options, p.poll.countable ?? "1");
      if (r.status) return { sent: true, response: r, mode: "text" };
      return { sent: false, error: typeof r.msg === "string" ? r.msg : "Poll send failed", response: r };
    }

    // 2. List
    if (p.list) {
      if (!p.imageUrl) return { sent: false, error: "List message butuh imageUrl (image header)" };
      const r = await client.sendList(to, {
        name: p.list.name,
        title: p.list.title,
        buttontext: p.list.buttontext,
        message: p.message,
        image: p.imageUrl,
        sections: p.list.sections,
        footer: p.footer,
      });
      if (r.status) return { sent: true, response: r, mode: "button" };
      return { sent: false, error: typeof r.msg === "string" ? r.msg : "List send failed", response: r };
    }

    // 3. Location
    if (p.location) {
      const r = await client.sendLocation(to, p.location.latitude, p.location.longitude);
      if (r.status) return { sent: true, response: r, mode: "text" };
      return { sent: false, error: typeof r.msg === "string" ? r.msg : "Location send failed", response: r };
    }

    // 4. VCard
    if (p.vcard) {
      const r = await client.sendVCard(to, p.vcard.name, p.vcard.phone);
      if (r.status) return { sent: true, response: r, mode: "text" };
      return { sent: false, error: typeof r.msg === "string" ? r.msg : "VCard send failed", response: r };
    }

    // 5. Sticker
    if (p.sticker) {
      const r = await client.sendSticker(to, p.sticker.url);
      if (r.status) return { sent: true, response: r, mode: "image" };
      return { sent: false, error: typeof r.msg === "string" ? r.msg : "Sticker send failed", response: r };
    }

    const hasButtons = (p.buttons?.length ?? 0) > 0;
    // v4.2.23: Kalau ada button tapi gak ada image, inject default image
    // (MPWA /send-button WAJIB image - kalau kosong, button gak akan muncul native).
    // Default image bisa di-override via setting `wa_default_button_image`.
    let effectiveImageUrl = p.imageUrl;
    if (hasButtons && !effectiveImageUrl) {
      const { storage } = await import("./storage.js");
      const defaultImage = await storage.getSetting("wa_default_button_image");
      // Fallback hardcoded - imgur reliable, MPWA bisa fetch
      effectiveImageUrl = defaultImage || "https://i.imgur.com/9xbmtMm.jpeg";
    }
    const hasImage = !!effectiveImageUrl;

    // 6. Native button (image wajib) - pakai MPWA spec format langsung
    if (hasButtons && hasImage) {
      const r = await client.sendButton(to, {
        message: p.message,
        image: effectiveImageUrl!,
        button: p.buttons!.slice(0, 5).map(b => {
          // Single source of truth = MPWA spec format
          // Auto-fallback dari legacy field (label, payload) kalau ada
          const displayText = b.displayText ?? b.label ?? "";
          const item: any = { type: b.type, displayText };
          if (b.type === "url") item.url = b.url ?? b.payload ?? "";
          else if (b.type === "call") item.phoneNumber = b.phoneNumber ?? b.payload ?? "";
          else if (b.type === "copy") item.copyText = b.copyText ?? b.payload ?? "";
          else if (b.type === "reply") {
            const id = b.id ?? b.payload;
            if (id) item.id = id;
          }
          return item;
        }),
        footer: p.footer,
      });
      if (r.status) return { sent: true, response: r, mode: "button" };
      return { sent: false, error: typeof r.msg === "string" ? r.msg : "Button send failed", response: r };
    }

    // 7. Media (image/video/audio/document) tanpa button - pakai original imageUrl (bukan default)
    if (p.imageUrl || p.mediaType) {
      const mediaType = (p.mediaType ?? "image") as "image" | "video" | "audio" | "document";
      const r = await client.sendMedia(to, mediaType, p.imageUrl!, {
        caption: p.mediaCaption ?? p.message,
        footer: p.footer,
      });
      if (r.status) return { sent: true, response: r, mode: "image" };
      return { sent: false, error: typeof r.msg === "string" ? r.msg : "Media send failed", response: r };
    }

    // 8. Text + text-button fallback (kalau ada button tapi tidak ada image)
    let message = p.message;
    if (hasButtons) {
      message += "\n\n---------------";
      for (const b of p.buttons!.slice(0, 5)) {
        const icon = b.type === "url" ? "" : b.type === "call" ? "" : b.type === "copy" ? "" : "▶";
        const label = b.displayText ?? b.label ?? "";
        let action = "";
        if (b.type === "url") {
          const u = b.url ?? b.payload;
          if (u) action = `\n   ${u}`;
        } else if (b.type === "call") {
          const ph = b.phoneNumber ?? b.payload;
          if (ph) action = `\n   https://wa.me/${normalizePhone(ph)}`;
        } else if (b.type === "copy") {
          const c = b.copyText ?? b.payload;
          if (c) action = `\n   Kode: *${c}*`;
        }
        message += `\n${icon} *${label}*${action}`;
      }
      message += "\n---------------";
    }
    const r = await client.sendText(to, message, { footer: p.footer });
    if (r.status) return { sent: true, response: r, mode: "text" };
    return { sent: false, error: typeof r.msg === "string" ? r.msg : "Text send failed", response: r };
  } catch (err: any) {
    return { sent: false, error: err?.message ?? "MPWA error" };
  }
}

// -- Fonnte --
async function sendFonnte(cfg: WaProviderConfig, to: string, p: SendPayload): Promise<SendResult> {
  if (!cfg.token) return { sent: false, error: "Fonnte: token kosong" };
  const body: any = { target: to, message: p.message };
  if (p.imageUrl) { body.url = p.imageUrl; }
  const r = await post("https://api.fonnte.com/send", body, { "Authorization": cfg.token });
  // Fonnte response: { status: true|false, reason, id, target, ... }
  if (r.json?.status === true) return { sent: true, response: r.json, mode: p.imageUrl ? "image" : "text" };
  return { sent: false, error: r.json?.reason ?? r.error ?? `HTTP ${r.status}`, response: r.json };
}

// -- Wablas --
async function sendWablas(cfg: WaProviderConfig, to: string, p: SendPayload): Promise<SendResult> {
  if (!cfg.token) return { sent: false, error: "Wablas: token kosong" };
  const baseUrl = (cfg.url || "https://console.wablas.com").replace(/\/$/, "");
  const auth = cfg.secret ? `${cfg.token}.${cfg.secret}` : cfg.token;
  const endpoint = p.imageUrl ? "/api/send-image" : "/api/send-message";
  const body: any = { phone: to, message: p.message };
  if (p.imageUrl) { body.image = p.imageUrl; body.caption = p.message; }
  const r = await post(`${baseUrl}${endpoint}`, body, { "Authorization": auth });
  // Wablas response: { status: true, message: "...", data: {...} }
  if (r.json?.status === true || r.json?.data?.status === "sent") {
    return { sent: true, response: r.json, mode: p.imageUrl ? "image" : "text" };
  }
  return { sent: false, error: r.json?.message ?? r.error ?? `HTTP ${r.status}`, response: r.json };
}

// -- Starsender --
async function sendStarsender(cfg: WaProviderConfig, to: string, p: SendPayload): Promise<SendResult> {
  if (!cfg.apiKey) return { sent: false, error: "Starsender: api_key kosong" };
  const body: any = {
    api_key: cfg.apiKey,
    sender: cfg.deviceId,
    number: to,
    message: p.message,
  };
  if (p.imageUrl) body.url = p.imageUrl;
  const r = await post("https://api.starsender.online/api/send", body);
  if (r.json?.status === true || r.json?.success === true) return { sent: true, response: r.json, mode: p.imageUrl ? "image" : "text" };
  return { sent: false, error: r.json?.msg ?? r.json?.message ?? r.error ?? `HTTP ${r.status}`, response: r.json };
}

// -- Watzap --
async function sendWatzap(cfg: WaProviderConfig, to: string, p: SendPayload): Promise<SendResult> {
  if (!cfg.apiKey || !cfg.numberKey) return { sent: false, error: "Watzap: api_key + number_key wajib" };
  const body: any = {
    api_key: cfg.apiKey,
    number_key: cfg.numberKey,
    phone_no: to,
    message: p.message,
  };
  if (p.imageUrl) body.url = p.imageUrl;
  const r = await post("https://api.watzap.id/v1/send_message", body);
  if (r.json?.status === "1" || r.json?.status === 1 || r.json?.success === true) {
    return { sent: true, response: r.json, mode: p.imageUrl ? "image" : "text" };
  }
  return { sent: false, error: r.json?.message ?? r.error ?? `HTTP ${r.status}`, response: r.json };
}

// -- WACHAYO -- (mirip MPWA pattern)
async function sendWachayo(cfg: WaProviderConfig, sender: string, to: string, p: SendPayload): Promise<SendResult> {
  if (!cfg.apiKey || !cfg.url) return { sent: false, error: "WACHAYO: api_key + url wajib" };
  const baseUrl = cfg.url.replace(/\/$/, "");
  const body: any = { api_key: cfg.apiKey, sender, number: to, message: p.message };
  if (p.imageUrl) { body.file = p.imageUrl; body.media_type = "image"; body.caption = p.message; }
  const ep = p.imageUrl ? "/send-media" : "/send-message";
  const r = await post(`${baseUrl}${ep}`, body);
  if (r.json?.status === true) return { sent: true, response: r.json, mode: p.imageUrl ? "image" : "text" };
  return { sent: false, error: r.json?.msg ?? r.error ?? `HTTP ${r.status}`, response: r.json };
}

function sendStub(name: string): SendResult {
  return { sent: false, error: `Provider "${name}" belum diimplementasi (provider official di-roadmap)` };
}

/** Daftar parameter dinamis untuk template (PRD 28 params) */
export const TEMPLATE_PARAMS = [
  // Manual input
  { param: "{{input_manual_text}}",         desc: "Kolom input teks custom saat broadcast" },
  { param: "{{input_manual_tanggal}}",      desc: "Kolom input tanggal custom saat broadcast" },
  // Pelanggan data
  { param: "{{nama_pelanggan}}",            desc: "Nama pelanggan yang dipilih" },
  { param: "{{alamat_pelanggan}}",          desc: "Alamat pemasangan pelanggan" },
  { param: "{{telepon_pelanggan}}",         desc: "Nomor telepon pelanggan" },
  { param: "{{nama_isp}}",                  desc: "Nama ISP dari pelanggan" },
  { param: "{{paket_layanan}}",             desc: "Nama paket layanan pelanggan" },
  { param: "{{harga_paket_layanan}}",       desc: "Harga paket (Rp. 250.000)" },
  { param: "{{tgl_aktivasi}}",              desc: "Tanggal aktivasi (23/08/2023)" },
  { param: "{{customer_id}}",               desc: "Customer ID pelanggan" },
  // Invoice / billing
  { param: "{{tgl_jatuh_tempo_invoice}}",   desc: "Tanggal jatuh tempo invoice" },
  { param: "{{hari_tgl_jatuh_tempo_invoice}}", desc: "Hari jatuh tempo (Senin, Selasa, ...)" },
  { param: "{{periode_tagihan}}",           desc: "Periode tagihan invoice belum dibayar" },
  { param: "{{total_tagihan}}",             desc: "Total tagihan invoice belum dibayar" },
  // Pembayaran
  { param: "{{tanggal_pembayaran_diterima}}", desc: "Tanggal pembayaran diterima/lunas" },
  { param: "{{jam_pembayaran_diterima}}",   desc: "Jam pembayaran diterima/lunas" },
  { param: "{{tanggal_pembayaran}}",        desc: "Tanggal pembayaran dilakukan" },
  { param: "{{jam_pembayaran}}",            desc: "Jam pembayaran dilakukan" },
  { param: "{{metode_pembayaran}}",         desc: "Metode pembayaran" },
  { param: "{{link_pembayaran}}",           desc: "Link pembayaran invoice" },
  // Link
  { param: "{{link_survey_feedback}}",      desc: "Link survey feedback" },
  { param: "{{url_wa_finance}}",            desc: "URL WhatsApp Finance perusahaan" },
  { param: "{{url_wa_cs}}",                 desc: "URL WhatsApp CS perusahaan" },
  { param: "{{link_pelanggan_baru}}",       desc: "Link welcome page pelanggan baru" },
  { param: "{{periode_invoice_dibayarkan}}", desc: "Periode invoice yang dibayarkan" },
  { param: "{{total_invoice_dibayarkan}}",  desc: "Total invoice yang dibayarkan" },
  { param: "{{link_data_pelanggan_readonly}}", desc: "Link data pelanggan (read-only)" },
  { param: "{{link_data_pelanggan_editable}}", desc: "Link data pelanggan (editable)" },
];

/** Reseller-specific params (sub-set untuk template reseller) */
export const TEMPLATE_PARAMS_RESELLER = [
  { param: "{{input_manual_text}}",         desc: "Kolom input teks custom saat broadcast" },
  { param: "{{input_manual_tanggal}}",      desc: "Kolom input tanggal custom saat broadcast" },
  { param: "{{nama_reseller}}",             desc: "Nama reseller" },
  { param: "{{telepon_reseller}}",          desc: "Nomor telepon reseller" },
  { param: "{{alamat_reseller}}",           desc: "Alamat reseller" },
  { param: "{{saldo_reseller}}",            desc: "Saldo reseller (Rp)" },
  { param: "{{commission_rate}}",           desc: "Persentase komisi reseller (%)" },
  { param: "{{tgl_bergabung}}",             desc: "Tanggal bergabung jadi reseller" },
  { param: "{{nama_isp}}",                  desc: "Nama ISP" },
  { param: "{{url_wa_finance}}",            desc: "URL WhatsApp Finance perusahaan" },
  { param: "{{url_wa_cs}}",                 desc: "URL WhatsApp CS perusahaan" },
];

/** Substitusi param sederhana - replace {{key}} dengan value dari context */
export function renderTemplate(content: string, vars: Record<string, any>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = vars[key];
    return v == null ? "" : String(v);
  });
}
