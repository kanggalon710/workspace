/**
 * Meta Conversions API (CAPI) Client
 * Sends offline conversion events back to Meta for ad optimization.
 *
 * Events sent:
 *   - "Lead" — when lead is created from ads (landing page / webhook)
 *   - "Schedule" — when lead is contacted / surveyed
 *   - "Purchase" — when lead converts to active customer (installation done)
 *
 * Meta uses these events to find more people like those who actually became customers.
 * https://developers.facebook.com/docs/marketing-api/conversions-api
 */
import crypto from "crypto";

export interface MetaCapiConfig {
  pixelId: string;
  accessToken: string;
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

function formatPhoneE164(phone: string): string {
  let clean = phone.replace(/[\s\-\(\)\.]/g, "");
  if (clean.startsWith("08")) clean = "+62" + clean.slice(1);
  else if (clean.startsWith("62")) clean = "+" + clean;
  else if (!clean.startsWith("+")) clean = "+62" + clean;
  return clean;
}

interface EventUserData {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  externalId?: string | number;
  fbc?: string | null;  // Facebook click ID (from URL param fbclid)
  fbp?: string | null;  // Facebook browser ID (from _fbp cookie)
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
}

interface ConversionEvent {
  eventName: "Lead" | "Schedule" | "Purchase" | "CompleteRegistration";
  eventTime?: number;
  actionSource?: "website" | "phone_call" | "other";
  eventSourceUrl?: string;
  userData: EventUserData;
  customData?: Record<string, any>;
}

/**
 * Send a conversion event to Meta Conversions API
 */
export async function sendConversionEvent(
  config: MetaCapiConfig,
  event: ConversionEvent,
): Promise<{ success: boolean; eventsReceived?: number; error?: string }> {
  if (!config.pixelId || !config.accessToken) {
    return { success: false, error: "Meta Pixel ID atau Access Token belum dikonfigurasi" };
  }

  const url = `https://graph.facebook.com/v19.0/${config.pixelId}/events?access_token=${config.accessToken}`;

  // Build user_data with hashed PII
  const userData: Record<string, any> = {};
  const u = event.userData;

  if (u.phone) userData.ph = [sha256(formatPhoneE164(u.phone))];
  if (u.email) userData.em = [sha256(u.email)];
  if (u.name) {
    const parts = u.name.trim().split(/\s+/);
    userData.fn = [sha256(parts[0] || "")];
    if (parts.length > 1) userData.ln = [sha256(parts.slice(1).join(" "))];
  }
  if (u.city) userData.ct = [sha256(u.city)];
  userData.country = [sha256("id")]; // Indonesia
  if (u.externalId) userData.external_id = [String(u.externalId)];
  if (u.fbc) userData.fbc = u.fbc;
  if (u.fbp) userData.fbp = u.fbp;
  if (u.clientIpAddress) userData.client_ip_address = u.clientIpAddress;
  if (u.clientUserAgent) userData.client_user_agent = u.clientUserAgent;

  const payload = {
    data: [{
      event_name: event.eventName,
      event_time: event.eventTime || Math.floor(Date.now() / 1000),
      action_source: event.actionSource || "website",
      event_source_url: event.eventSourceUrl || undefined,
      user_data: userData,
      custom_data: event.customData || undefined,
    }],
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json();

    if (res.ok) {
      return { success: true, eventsReceived: body.events_received };
    }
    return { success: false, error: body.error?.message || `HTTP ${res.status}` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Send "Lead" event — when a new lead comes from ads/landing page
 */
export async function trackLead(config: MetaCapiConfig, data: {
  name: string; phone?: string | null; email?: string | null;
  city?: string | null; leadId: number; source?: string;
}) {
  return sendConversionEvent(config, {
    eventName: "Lead",
    actionSource: "website",
    userData: {
      name: data.name, phone: data.phone, email: data.email,
      city: data.city, externalId: data.leadId,
    },
    customData: { content_name: data.source || "landing_page" },
  });
}

/**
 * Send "Purchase" event — when lead becomes active paying customer
 */
export async function trackPurchase(config: MetaCapiConfig, data: {
  name: string; phone?: string | null; email?: string | null;
  city?: string | null; customerId: string; packageName?: string;
  value?: number; // billing price in IDR
}) {
  return sendConversionEvent(config, {
    eventName: "Purchase",
    actionSource: "other", // offline conversion
    userData: {
      name: data.name, phone: data.phone, email: data.email,
      city: data.city, externalId: data.customerId,
    },
    customData: {
      currency: "IDR",
      value: data.value || 0,
      content_name: data.packageName || "FTTH Subscription",
    },
  });
}
