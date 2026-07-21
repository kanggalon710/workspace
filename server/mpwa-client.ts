/**
 * v4.2.21: MPWAClient - Full typed client untuk MPWA Jabnet Gateway
 *
 * Base URL: https://mpwa.jabnet.id
 * Spec: 17 endpoint + webhook receiver
 *
 * Pemakaian:
 *   const client = new MPWAClient({ apiKey, sender, baseUrl });
 *   await client.sendText("628111", "Halo!");
 *   await client.sendButton("628111", { message, image, button: [...] });
 *   const qr = await client.generateQR("628999");
 */

// --- Types ---

export interface MPWAClientConfig {
  apiKey: string;
  sender?: string;          // optional - bisa di-override per-call
  baseUrl?: string;         // default https://mpwa.jabnet.id
  timeoutMs?: number;       // default 30000
}

export interface MPWAResponse<T = any> {
  status: boolean;
  msg?: string | any;
  errors?: any;
  qrcode?: string;          // generate-qr response
  info?: any[];             // info-devices/info-user response
  data?: T;
  // mode full=1 (response detail dari WhatsApp)
  key?: { id: string; remoteJid: string; fromMe: boolean };
  message?: any;
  messageTimestamp?: number;
}

export type MediaType = "image" | "video" | "audio" | "document";

export interface MPWAButton {
  type: "reply" | "call" | "url" | "copy";
  displayText: string;
  phoneNumber?: string;     // type=call
  url?: string;             // type=url
  copyText?: string;        // type=copy
  id?: string;              // type=reply (optional id)
}

export interface MPWAListRow {
  title: string;
  rowId: string;
  description?: string;
}

export interface MPWAListSection {
  title: string;
  description?: string;
  rows: MPWAListRow[];
}

export interface MPWASendOpts {
  msgid?: string;           // reply ke msgid
  full?: 0 | 1;             // 1 = response detail
  footer?: string;
}

export interface MPWAInfoDevice {
  body: string;             // nomor device
  status: "Connected" | "Disconnect";
  webhook?: string;
  chatgpt?: string;
  gemini_api?: string;
  claude_api?: string;
  reject_call?: number;
  reply_when?: string;
  [k: string]: any;
}

export interface MPWAInfoUser {
  id: number;
  username: string;
  email: string;
  api_key: string;
  level: string;
  status: string;
  limit_device?: number;
  active_subscription?: boolean;
  subscription_expired?: string;
  [k: string]: any;
}

export interface MPWACheckNumberResult {
  exists: boolean;
  jid: string;
}

// --- Helpers ---

export function normalizePhone(phone: string): string {
  if (!phone) return "";
  let p = String(phone).trim().replace(/[\s\-()+ ]/g, "");
  if (p.startsWith("+")) p = p.slice(1);
  if (p.startsWith("0")) p = "62" + p.slice(1);
  if (/^8\d+/.test(p)) p = "62" + p;
  return p;
}

export function maskApiKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "****" + key.slice(-4);
}

// --- Client ---

const DEFAULT_BASE_URL = "https://mpwa.jabnet.id";

export class MPWAClient {
  private apiKey: string;
  private sender?: string;
  private baseUrl: string;
  private timeoutMs: number;

  constructor(config: MPWAClientConfig) {
    if (!config.apiKey) throw new Error("MPWAClient: apiKey wajib");
    this.apiKey = config.apiKey;
    this.sender = config.sender ? normalizePhone(config.sender) : undefined;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeoutMs = config.timeoutMs ?? 30000;
  }

  /** Build payload dengan api_key + sender (default) + extra. */
  private payload(extra: Record<string, any> = {}, requireSender = true): Record<string, any> {
    const body: Record<string, any> = { api_key: this.apiKey, ...extra };
    if (requireSender) {
      if (!this.sender && !extra.sender) {
        throw new Error("MPWAClient: sender wajib (set di constructor atau passing langsung)");
      }
      body.sender = extra.sender ?? this.sender;
    }
    return body;
  }

  /** Generic POST. Return parsed JSON. */
  private async post<T = any>(endpoint: string, body: Record<string, any>): Promise<MPWAResponse<T>> {
    const url = this.baseUrl + (endpoint.startsWith("/") ? endpoint : "/" + endpoint);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      let json: any = null;
      try { json = await res.json(); } catch {}
      if (!json) return { status: false, msg: `HTTP ${res.status} (non-JSON response)` };
      return json as MPWAResponse<T>;
    } catch (err: any) {
      return { status: false, msg: err?.message ?? "Network error" };
    }
  }

  // ================================================================
  //  Section 3.1 - Send Text Message
  // ================================================================
  async sendText(number: string, message: string, opts: MPWASendOpts = {}): Promise<MPWAResponse> {
    return this.post("/send-message", this.payload({
      number: normalizePhone(number),
      message,
      ...(opts.footer ? { footer: opts.footer } : {}),
      ...(opts.msgid ? { msgid: opts.msgid } : {}),
      ...(opts.full ? { full: opts.full } : {}),
    }));
  }

  // ================================================================
  //  Section 3.2 - Send Product
  //  url: https://wa.me/p/{productId}/{ownerNumber}
  // ================================================================
  async sendProduct(number: string, productUrl: string, message: string = "", opts: MPWASendOpts = {}): Promise<MPWAResponse> {
    return this.post("/send-product", this.payload({
      number: normalizePhone(number),
      url: productUrl,
      message,
      ...(opts.footer ? { footer: opts.footer } : {}),
    }));
  }

  // ================================================================
  //  Section 3.3 - Send Text to Channel
  //  channelUrl: https://whatsapp.com/channel/XXXX
  // ================================================================
  async sendChannel(channelUrl: string, message: string, footer?: string): Promise<MPWAResponse> {
    return this.post("/send-text-channel", this.payload({
      url: channelUrl,
      message,
      ...(footer ? { footer } : {}),
    }, false /* number tidak perlu */));
  }

  // ================================================================
  //  Section 3.4 - Send Media (image/video/audio/document)
  //  url: DIRECT URL (bukan Google Drive share link)
  // ================================================================
  async sendMedia(number: string, mediaType: MediaType, mediaUrl: string, opts: MPWASendOpts & { caption?: string } = {}): Promise<MPWAResponse> {
    return this.post("/send-media", this.payload({
      number: normalizePhone(number),
      media_type: mediaType,
      url: mediaUrl,
      ...(opts.caption ? { caption: opts.caption } : {}),
      ...(opts.footer ? { footer: opts.footer } : {}),
    }));
  }

  // ================================================================
  //  Section 3.5 - Send Sticker
  //  url: image/gif (auto-konversi ke webp)
  // ================================================================
  async sendSticker(number: string, stickerUrl: string): Promise<MPWAResponse> {
    return this.post("/send-sticker", this.payload({
      number: normalizePhone(number),
      url: stickerUrl,
    }));
  }

  // ================================================================
  //  Section 3.6 - Send Poll
  // ================================================================
  async sendPoll(
    number: string,
    name: string,
    option: string[],
    countable: "0" | "1" = "1",
  ): Promise<MPWAResponse> {
    if (!Array.isArray(option) || option.length < 2) {
      throw new Error("sendPoll: minimal 2 opsi");
    }
    return this.post("/send-poll", this.payload({
      number: normalizePhone(number),
      name,
      option,
      countable,
    }));
  }

  // ================================================================
  //  Section 3.7 - Send Button (max 5)
  //  image WAJIB.
  // ================================================================
  async sendButton(
    number: string,
    payload: { message: string; image: string; button: MPWAButton[]; footer?: string },
  ): Promise<MPWAResponse> {
    if (!payload.image) throw new Error("sendButton: image wajib (header)");
    if (!Array.isArray(payload.button) || payload.button.length === 0) {
      throw new Error("sendButton: minimal 1 button");
    }
    if (payload.button.length > 5) throw new Error("sendButton: max 5 button");

    // Sanitize buttons sesuai type
    const sanitized = payload.button.map(b => {
      const item: any = { type: b.type, displayText: b.displayText };
      if (b.type === "call" && b.phoneNumber) item.phoneNumber = normalizePhone(b.phoneNumber);
      if (b.type === "url" && b.url) item.url = b.url;
      if (b.type === "copy" && b.copyText) item.copyText = b.copyText;
      if (b.type === "reply" && b.id) item.id = b.id;
      return item;
    });

    return this.post("/send-button", this.payload({
      number: normalizePhone(number),
      message: payload.message,
      image: payload.image,
      button: sanitized,
      ...(payload.footer ? { footer: payload.footer } : {}),
    }));
  }

  // ================================================================
  //  Section 3.8 - Send List Message
  //  sections: 1-5 sections berisi rows
  // ================================================================
  async sendList(
    number: string,
    payload: {
      name: string;
      title: string;
      buttontext: string;
      message: string;
      image: string;
      sections: MPWAListSection[];
      footer?: string;
    },
  ): Promise<MPWAResponse> {
    if (!payload.sections || payload.sections.length === 0) {
      throw new Error("sendList: minimal 1 section");
    }
    if (payload.sections.length > 5) throw new Error("sendList: max 5 section");
    return this.post("/send-list", this.payload({
      number: normalizePhone(number),
      name: payload.name,
      title: payload.title,
      buttontext: payload.buttontext,
      message: payload.message,
      image: payload.image,
      sections: payload.sections,
      ...(payload.footer ? { footer: payload.footer } : {}),
    }));
  }

  // ================================================================
  //  Section 3.9 - Send Location
  // ================================================================
  async sendLocation(number: string, latitude: number | string, longitude: number | string): Promise<MPWAResponse> {
    return this.post("/send-location", this.payload({
      number: normalizePhone(number),
      latitude: String(latitude),
      longitude: String(longitude),
    }));
  }

  // ================================================================
  //  Section 3.10 - Send VCard
  // ================================================================
  async sendVCard(number: string, name: string, phone: string): Promise<MPWAResponse> {
    return this.post("/send-vcard", this.payload({
      number: normalizePhone(number),
      name,
      phone: normalizePhone(phone),
    }));
  }

  // ================================================================
  //  Section 3.11 - Generate QR Code
  //  Flow: hit → user scan → hit ulang → cek status/msg
  // ================================================================
  async generateQR(device: string, force = false): Promise<MPWAResponse> {
    return this.post("/generate-qr", {
      api_key: this.apiKey,
      device: normalizePhone(device),
      ...(force ? { force: true } : {}),
    });
  }

  // ================================================================
  //  Section 3.12 - Create User (admin only)
  // ================================================================
  async createUser(payload: {
    username: string;
    password: string;
    email: string;
    expire: number;         // hari
    limit_device?: number;
  }): Promise<MPWAResponse> {
    return this.post("/create-user", { api_key: this.apiKey, ...payload });
  }

  // ================================================================
  //  Section 3.13 - Disconnect / Logout Device
  // ================================================================
  async logoutDevice(): Promise<MPWAResponse> {
    if (!this.sender) throw new Error("logoutDevice: sender wajib di constructor");
    return this.post("/logout-device", { api_key: this.apiKey, sender: this.sender });
  }

  // ================================================================
  //  Section 3.14 - Delete Device
  // ================================================================
  async deleteDevice(): Promise<MPWAResponse> {
    if (!this.sender) throw new Error("deleteDevice: sender wajib di constructor");
    return this.post("/delete-device", { api_key: this.apiKey, sender: this.sender });
  }

  // ================================================================
  //  Section 3.15 - User Info
  // ================================================================
  async infoUser(username: string): Promise<MPWAResponse<MPWAInfoUser>> {
    return this.post("/info-user", { api_key: this.apiKey, username });
  }

  // ================================================================
  //  Section 3.16 - Device Info
  // ================================================================
  async infoDevice(number?: string): Promise<MPWAResponse<MPWAInfoDevice>> {
    const num = number ? normalizePhone(number) : this.sender;
    if (!num) throw new Error("infoDevice: number wajib (atau set sender di constructor)");
    return this.post("/info-devices", { api_key: this.apiKey, number: num });
  }

  // ================================================================
  //  Section 3.17 - Check Number
  // ================================================================
  async checkNumber(number: string): Promise<MPWAResponse<MPWACheckNumberResult>> {
    return this.post("/check-number", this.payload({
      number: normalizePhone(number),
    }));
  }
}

/**
 * Helper: parse incoming MPWA webhook body sesuai spec section 3.18
 */
export interface MPWAWebhookPayload {
  device: string;
  message: string;
  from: string;
  name: string;
  participant?: string;        // sender number kalau dari group
  ppUrl?: string;
  media?: {
    caption?: string;
    fileName?: string;
    stream?: { type: string; data: any };
  };
  mimetype?: string;
}

export function isMPWAWebhookPayload(body: any): body is MPWAWebhookPayload {
  return !!body && typeof body === "object"
    && typeof body.device === "string"
    && typeof body.from === "string";
}
