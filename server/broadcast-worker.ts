/**
 * v4.2.19: Broadcast Sender Worker
 *
 * Process campaign yang status "running":
 *   - Loop fetch pending recipient
 *   - Substitusi placeholder per-recipient
 *   - Kirim via sendMpwaRichMessage (button/media support)
 *   - Update status + retry on transient errors
 *   - Honor rateLimitMs per campaign
 *   - Stop kalau status berubah ke "cancelled"
 *
 * Lifecycle:
 *   - startBroadcastCampaign(id): set status running + spawn loop async
 *   - cancelBroadcastCampaign(id): set status cancelled (worker will exit on next tick)
 */

import { storage } from "./storage.js";
import { loadMpwaConfig, sendMpwaRichMessage, normalizePhone, type MpwaButton } from "./mpwa.js";
import { withMitra, getMitraIdOrNull } from "./tenant-context.js";

// In-memory running set untuk prevent double-start
const RUNNING_CAMPAIGNS = new Set<number>();

/**
 * v4.2.20 fix: Substitusi placeholder support both single `{key}` (legacy)
 * dan double `{{key}}` (PRD WA v2 template).
 */
function substitute(template: string, vars: Record<string, any>): string {
  return template
    // Double brace dulu (lebih spesifik) — pakai \w yang juga match underscore
    .replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const v = vars[key];
      return v == null ? "" : String(v);
    })
    // Lalu single brace (legacy)
    .replace(/\{(\w+)\}/g, (_, key) => {
      const v = vars[key];
      return v == null ? `{${key}}` : String(v);
    });
}

/**
 * v4.2.20: Build var map untuk template — 28 params sesuai PRD untuk pelanggan
 * + variant lebih kecil untuk reseller.
 * fallback `cs` / `nama_isp` ambil dari app_settings kalau ada.
 */
async function buildVarsPelanggan(c: {
  name: string;
  customerId?: string | null;
  phone?: string | null;
  address?: string | null;
  package?: string | null;
  billingPrice?: number | null;
  dueDate?: string | null;
  lastPaymentDate?: string | null;
  installDate?: string | null;
}, extras: { manualText?: string; manualDate?: string } = {}): Promise<Record<string, string>> {
  const ispName = (await storage.getSetting("company_name")) ?? "JABNET";
  const waCs = (await storage.getSetting("company_wa_cs")) ?? "https://wa.me/6281234567890";
  const waFinance = (await storage.getSetting("company_wa_finance")) ?? waCs;
  const portalUrl = (await storage.getSetting("customer_portal_url")) ?? "https://portal.jabnet.id";

  const fmtRp = (n: number | null | undefined) => n == null ? "—" : `Rp. ${Number(n).toLocaleString("id-ID")}`;
  const fmtDate = (iso: string | null | undefined) => {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" }); }
    catch { return iso; }
  };
  const fmtDay = (iso: string | null | undefined) => {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleDateString("id-ID", { weekday: "long" }); }
    catch { return ""; }
  };
  const fmtTime = (iso: string | null | undefined) => {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }); }
    catch { return ""; }
  };

  return {
    // Manual input
    input_manual_text:                extras.manualText ?? "",
    input_manual_tanggal:             extras.manualDate ? fmtDate(extras.manualDate) : "",
    // Pelanggan data
    nama_pelanggan:                   c.name ?? "",
    name:                             c.name ?? "", // legacy alias
    nama:                             c.name ?? "", // legacy alias
    alamat_pelanggan:                 c.address ?? "",
    telepon_pelanggan:                c.phone ?? "",
    nama_isp:                         ispName,
    paket_layanan:                    c.package ?? "—",
    package:                          c.package ?? "—", // legacy alias
    harga_paket_layanan:              fmtRp(c.billingPrice ?? null),
    tgl_aktivasi:                     fmtDate(c.installDate),
    customer_id:                      c.customerId ?? "",
    customerId:                       c.customerId ?? "", // legacy alias
    // Invoice / billing
    tgl_jatuh_tempo_invoice:          fmtDate(c.dueDate),
    hari_tgl_jatuh_tempo_invoice:     fmtDay(c.dueDate),
    periode_tagihan:                  c.dueDate ? new Date(c.dueDate).toLocaleDateString("id-ID", { month: "long", year: "numeric" }) : "—",
    total_tagihan:                    fmtRp(c.billingPrice ?? null),
    // Pembayaran
    tanggal_pembayaran_diterima:      fmtDate(c.lastPaymentDate),
    jam_pembayaran_diterima:          fmtTime(c.lastPaymentDate),
    tanggal_pembayaran:               fmtDate(c.lastPaymentDate),
    jam_pembayaran:                   fmtTime(c.lastPaymentDate),
    metode_pembayaran:                "—",
    link_pembayaran:                  `${portalUrl}/billing`,
    // Link / URL
    link_survey_feedback:             `${portalUrl}/survey`,
    url_wa_finance:                   waFinance,
    url_wa_cs:                        waCs,
    link_pelanggan_baru:              `${portalUrl}/welcome`,
    periode_invoice_dibayarkan:       "—",
    total_invoice_dibayarkan:         "—",
    link_data_pelanggan_readonly:     `${portalUrl}/profile`,
    link_data_pelanggan_editable:     `${portalUrl}/profile/edit`,
    // Legacy generic
    cs:                               "JABNET CS",
  };
}

async function buildVarsReseller(r: {
  name: string;
  phone?: string | null;
  address?: string | null;
  saldo?: number | null;
  commissionRate?: number | null;
  joinedAt?: string | null;
}, extras: { manualText?: string; manualDate?: string } = {}): Promise<Record<string, string>> {
  const ispName = (await storage.getSetting("company_name")) ?? "JABNET";
  const waCs = (await storage.getSetting("company_wa_cs")) ?? "https://wa.me/6281234567890";
  const waFinance = (await storage.getSetting("company_wa_finance")) ?? waCs;
  const fmtRp = (n: number | null | undefined) => n == null ? "—" : `Rp. ${Number(n).toLocaleString("id-ID")}`;
  const fmtDate = (iso: string | null | undefined) => {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" }); }
    catch { return iso; }
  };

  return {
    input_manual_text:    extras.manualText ?? "",
    input_manual_tanggal: extras.manualDate ? fmtDate(extras.manualDate) : "",
    nama_reseller:        r.name ?? "",
    nama:                 r.name ?? "",
    telepon_reseller:     r.phone ?? "",
    alamat_reseller:      r.address ?? "",
    saldo_reseller:       fmtRp(r.saldo ?? 0),
    commission_rate:      r.commissionRate != null ? `${(r.commissionRate / 100).toFixed(1)}%` : "0%",
    tgl_bergabung:        fmtDate(r.joinedAt),
    nama_isp:             ispName,
    url_wa_finance:       waFinance,
    url_wa_cs:            waCs,
  };
}

/**
 * v4.2.22: parseButtons — output MPWA spec format langsung (single source of truth).
 * Support BOTH legacy {label, payload} dan new {displayText, phoneNumber/url/copyText/id}
 * tapi output selalu pakai spec format yang dikirim ke MPWA /send-button.
 */
function parseButtons(json: string | null | undefined): MpwaButton[] | undefined {
  if (!json) return undefined;
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return undefined;
    const out: MpwaButton[] = [];
    for (const b of arr) {
      if (!b || !b.type) continue;
      const displayText = b.displayText ?? b.label ?? "";
      if (!displayText) continue;
      // Normalize legacy type
      const type = b.type === "phone" ? "call" : b.type;
      // Build dalam MPWA spec format (sambil tetep keep legacy field untuk backward compat)
      const item: any = { type, displayText, label: displayText };
      if (type === "url") {
        const u = b.url ?? b.payload;
        if (u) { item.url = u; item.payload = u; }
      } else if (type === "call") {
        const ph = b.phoneNumber ?? b.payload;
        if (ph) { item.phoneNumber = ph; item.payload = ph; }
      } else if (type === "copy") {
        const c = b.copyText ?? b.payload;
        if (c) { item.copyText = c; item.payload = c; }
      } else if (type === "reply") {
        const id = b.id ?? b.payload;
        if (id) { item.id = id; item.payload = id; }
      }
      out.push(item);
      if (out.length === 5) break;
    }
    return out;
  } catch {
    return undefined;
  }
}

/**
 * Enrol audience customers ke campaign (insert recipients).
 * Dipanggil saat campaign di-launch / move to "running".
 *
 * v4.2.20: Support 3 sumber audience (priority order):
 *   1. directRecipients (JSON array) — user manual-select via checkbox di form
 *   2. savedSegmentId — saved audience segment
 *   3. audienceFilter — inline filter JSON
 *
 * Return jumlah recipient yang berhasil di-enrol.
 */
export async function enrolCampaignAudience(campaignId: number): Promise<{ enrolled: number; skipped: number }> {
  const campaign = await storage.getBroadcastCampaign(campaignId);
  if (!campaign) throw new Error("Campaign not found");

  // Load template (untuk render message saat enrol)
  const template = await storage.getMpwaTemplate(campaign.templateId);
  if (!template) throw new Error("Template tidak ditemukan");
  const content = campaign.contentOverride ?? template.content;

  // v4.2.20: extras dari campaign untuk manual input substitution
  const extras = {
    manualText: (campaign as any).manualText ?? undefined,
    manualDate: (campaign as any).manualDate ?? undefined,
  };
  const targetType = (campaign as any).targetType ?? "pelanggan";

  // ── Priority 1: directRecipients ──
  const directRaw = (campaign as any).directRecipients as string | null;
  if (directRaw) {
    let directList: Array<{ phone: string; name?: string; customerId?: string; resellerId?: number; id?: number }> = [];
    try { directList = JSON.parse(directRaw); } catch {}
    if (!Array.isArray(directList) || directList.length === 0) {
      throw new Error("directRecipients format tidak valid");
    }

    const items: any[] = [];
    for (const r of directList) {
      if (!r.phone) continue;
      let vars: Record<string, string>;
      if (targetType === "reseller") {
        // Lookup full reseller dari DB kalau id ada, kalau enggak pakai snapshot
        let resellerData: any = { name: r.name, phone: r.phone };
        if (r.resellerId || r.id) {
          const full = await storage.getReseller(Number(r.resellerId ?? r.id));
          if (full) resellerData = full;
        }
        vars = await buildVarsReseller(resellerData, extras);
      } else {
        // Pelanggan: lookup full customer dari DB untuk dapat 28 params
        let customerData: any = { name: r.name, customerId: r.customerId, phone: r.phone };
        if (r.id) {
          const full = await storage.getCustomer(Number(r.id));
          if (full) customerData = full;
        }
        vars = await buildVarsPelanggan(customerData, extras);
      }
      const rendered = substitute(content, vars);
      items.push({
        campaignId,
        customerId: targetType === "pelanggan" ? (r.id ?? null) : null,
        phone: r.phone,
        customerName: r.name ?? vars.nama_pelanggan ?? vars.nama_reseller ?? "",
        renderedMessage: rendered,
      });
    }

    const inserted = await storage.bulkInsertRecipients(items);
    await storage.updateBroadcastCampaign(campaignId, { audienceCount: items.length } as any);
    return { enrolled: inserted, skipped: directList.length - items.length };
  }

  // ── Priority 2/3: filter-based (savedSegmentId atau audienceFilter) ──
  let filter: any = null;
  if (campaign.savedSegmentId) {
    const seg = await storage.getBroadcastSegment(campaign.savedSegmentId);
    if (seg) {
      try { filter = JSON.parse(seg.filter); } catch {}
    }
  }
  if (!filter && campaign.audienceFilter) {
    try { filter = JSON.parse(campaign.audienceFilter); } catch {}
  }
  if (!filter) throw new Error("Audience tidak valid (directRecipients/filter/savedSegment harus diset)");

  const audience = await storage.loadBroadcastAudience(filter, 5000);

  const items: any[] = [];
  for (const a of audience) {
    let customerData: any = a;
    const full = await storage.getCustomer(a.id);
    if (full) customerData = full;
    const vars = await buildVarsPelanggan(customerData, extras);
    const rendered = substitute(content, vars);
    items.push({
      campaignId,
      customerId: a.id,
      phone: a.phone,
      customerName: a.name,
      renderedMessage: rendered,
    });
  }

  const inserted = await storage.bulkInsertRecipients(items);
  await storage.updateBroadcastCampaign(campaignId, { audienceCount: audience.length } as any);
  return { enrolled: inserted, skipped: 0 };
}

/**
 * Spawn async loop untuk send recipients. Non-blocking.
 * Worker akan jalan terus sampai semua recipient diproses atau status diubah ke cancelled.
 */
export async function startBroadcastCampaign(campaignId: number): Promise<void> {
  if (RUNNING_CAMPAIGNS.has(campaignId)) return;

  const campaign = await storage.getBroadcastCampaign(campaignId);
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.status !== "draft" && campaign.status !== "scheduled") {
    throw new Error(`Campaign status "${campaign.status}" — tidak bisa start`);
  }

  // Enrol audience kalau belum (recipients masih 0)
  const counts = await storage.countBroadcastRecipients(campaignId);
  if (counts.total === 0) {
    await enrolCampaignAudience(campaignId);
  }

  // Mark running
  await storage.updateBroadcastCampaign(campaignId, {
    status: "running",
    startedAt: new Date().toISOString(),
  } as any);

  RUNNING_CAMPAIGNS.add(campaignId);

  // Spawn loop (NO await)
  runCampaignLoop(campaignId).catch(err => {
    console.error(`[broadcast-worker] campaign ${campaignId} fatal:`, err.message);
  }).finally(() => {
    RUNNING_CAMPAIGNS.delete(campaignId);
  });
}

async function runCampaignLoop(campaignId: number): Promise<void> {
  const campaign = await storage.getBroadcastCampaign(campaignId);
  if (!campaign) return;
  const template = await storage.getMpwaTemplate(campaign.templateId);

  // v4.2.20: kalau campaign punya deviceId, pakai per-device routing via wa-providers
  const deviceId = (campaign as any).deviceId as number | null;
  let device: any = null;
  let rateLimitMs = Math.max(500, campaign.rateLimitMs ?? 2000);
  if (deviceId) {
    device = await storage.getWaDevice(deviceId);
    if (device) {
      // Override rate limit dengan delay per-device
      rateLimitMs = Math.max(500, (device.delaySeconds ?? 2) * 1000);
    }
  }

  // Footer + buttons (dari override atau dari template)
  const footer = campaign.footerOverride ?? template?.footer ?? undefined;
  const allButtons = parseButtons(campaign.buttonsOverride ?? template?.buttons);
  let mediaUrl = template?.mediaUrl ?? undefined;
  const mediaType = (template?.mediaType ?? undefined) as "image" | "video" | "document" | undefined;
  // v4.2.23: Compat mode — kalau text-link, skip native button (jangan pass buttons ke sendMpwa)
  const compatMode = (template as any)?.compatMode === "text-link" ? "text-link" : "native";
  const buttons = compatMode === "text-link" ? undefined : allButtons;

  // v4.2.23: Detect localhost URL — MPWA server tidak bisa fetch dari local dev.
  // Skip image kalau localhost (untuk text-link mode, image opsional). Untuk native mode, ini akan fallback.
  let imageWarning = "";
  if (mediaUrl && /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/i.test(mediaUrl)) {
    imageWarning = `Image URL adalah localhost/private (${mediaUrl}) — MPWA tidak bisa fetch dari internet. Image di-skip.`;
    console.warn(`[broadcast-${campaignId}] ${imageWarning}`);
    mediaUrl = undefined;
  }

  console.log(`[broadcast] start campaign ${campaignId} "${campaign.name}" — device=${device?.name ?? "legacy-MPWA"}, rate=${rateLimitMs}ms, buttons=${allButtons?.length ?? 0}, media=${mediaType && mediaUrl ? mediaType : "-"}, compat=${compatMode}${imageWarning ? " [⚠️ image localhost skip]" : ""}`);

  // Fallback ke legacy MPWA config kalau no device set
  const mpwaConfig = device ? null : await loadMpwaConfig();

  let sent = 0, failed = 0;
  while (true) {
    // Re-check status sebelum next send
    const fresh = await storage.getBroadcastCampaign(campaignId);
    if (!fresh || fresh.status === "cancelled") {
      console.log(`[broadcast] campaign ${campaignId} cancelled — stopping`);
      break;
    }

    // Get next pending recipient
    const recipient = await storage.getNextPendingRecipient(campaignId);
    if (!recipient) break; // no more pending → done

    // Mark sending
    await storage.updateRecipientStatus(recipient.id, { status: "sending" } as any);

    // Skip kalau no phone
    if (!recipient.phone || recipient.phone.length < 7) {
      await storage.updateRecipientStatus(recipient.id, { status: "skipped", errorMessage: "Phone kosong/invalid" } as any);
      continue;
    }

    // v4.2.20: device-based routing (provider abstraction)
    if (device) {
      try {
        const { sendViaDevice } = await import("./wa-providers.js");
        // v4.2.23: untuk text-link mode, append buttons sebagai formatted text ke body pesan
        let finalMessage = recipient.renderedMessage ?? "";
        if (compatMode === "text-link" && allButtons && allButtons.length > 0) {
          const { renderButtonsAsText } = await import("./mpwa.js");
          finalMessage += renderButtonsAsText(allButtons);
        }
        const result = await sendViaDevice(device, recipient.phone, {
          message: finalMessage,
          footer,
          imageUrl: mediaUrl,
          buttons: buttons as any,   // undefined kalau text-link mode
        });
        if (result.sent) {
          await storage.updateRecipientStatus(recipient.id, {
            status: "sent",
            sentAt: new Date().toISOString(),
            mpwaResponse: JSON.stringify({ mode: result.mode, deviceId }),
          } as any);
          await storage.markWaDeviceSuccess(device.id);
          sent++;
        } else {
          await storage.updateRecipientStatus(recipient.id, {
            status: "failed",
            errorMessage: result.error ?? "Unknown",
          } as any);
          await storage.markWaDeviceError(device.id, result.error ?? "Unknown");
          failed++;
        }
      } catch (e: any) {
        await storage.updateRecipientStatus(recipient.id, {
          status: "failed",
          errorMessage: e.message ?? String(e),
        } as any);
        failed++;
      }
      if ((sent + failed) % 5 === 0) {
        const counts = await storage.countBroadcastRecipients(campaignId);
        await storage.updateBroadcastCampaign(campaignId, {
          sentCount: counts.sent, failedCount: counts.failed, skippedCount: counts.skipped,
        } as any);
      }
      await sleep(rateLimitMs);
      continue;
    }

    // Dev mode (legacy MPWA disabled, no device set) — mark sent tapi log only
    if (!mpwaConfig) {
      console.log(`[broadcast-DEV] ${recipient.phone} ← ${recipient.renderedMessage?.slice(0, 80)}…`);
      await storage.updateRecipientStatus(recipient.id, {
        status: "sent",
        sentAt: new Date().toISOString(),
        mpwaResponse: JSON.stringify({ devMode: true }),
      } as any);
      sent++;
      await sleep(50);
      continue;
    }

    // Legacy: send via global MPWA config (untuk backward compat)
    try {
      const result = await sendMpwaRichMessage(mpwaConfig, recipient.phone, {
        message: recipient.renderedMessage ?? "",
        footer,
        buttons,
        mediaUrl,
        mediaType,
      });

      if (result.sent) {
        await storage.updateRecipientStatus(recipient.id, {
          status: "sent",
          sentAt: new Date().toISOString(),
          mpwaResponse: JSON.stringify({ mode: result.mode, status: result.status }),
        } as any);
        sent++;
      } else {
        await storage.updateRecipientStatus(recipient.id, {
          status: "failed",
          errorMessage: result.error ?? "Unknown MPWA error",
          mpwaResponse: JSON.stringify(result.response ?? {}),
        } as any);
        failed++;
      }
    } catch (e: any) {
      await storage.updateRecipientStatus(recipient.id, {
        status: "failed",
        errorMessage: e.message ?? String(e),
      } as any);
      failed++;
    }

    // Update campaign stats every 5 sends
    if ((sent + failed) % 5 === 0) {
      const counts = await storage.countBroadcastRecipients(campaignId);
      await storage.updateBroadcastCampaign(campaignId, {
        sentCount: counts.sent,
        failedCount: counts.failed,
        skippedCount: counts.skipped,
      } as any);
    }

    // Rate limit
    await sleep(rateLimitMs);
  }

  // Final stats + status
  const finalCounts = await storage.countBroadcastRecipients(campaignId);
  const fresh2 = await storage.getBroadcastCampaign(campaignId);
  const finalStatus = fresh2?.status === "cancelled" ? "cancelled" : "completed";
  await storage.updateBroadcastCampaign(campaignId, {
    status: finalStatus,
    completedAt: new Date().toISOString(),
    sentCount: finalCounts.sent,
    failedCount: finalCounts.failed,
    skippedCount: finalCounts.skipped,
  } as any);

  console.log(`[broadcast] campaign ${campaignId} done — sent=${finalCounts.sent}, failed=${finalCounts.failed}, status=${finalStatus}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/** Cancel a running campaign — worker akan exit di next tick */
export async function cancelBroadcastCampaign(campaignId: number): Promise<void> {
  await storage.updateBroadcastCampaign(campaignId, {
    status: "cancelled",
    completedAt: new Date().toISOString(),
  } as any);
}

/** Resume failed recipients dengan reset status ke pending (untuk retry) */
export async function retryFailedRecipients(campaignId: number): Promise<number> {
  // MySQL port: pakai db.execute langsung dgn typed result
  const db = (storage as any).db;
  const pool = (storage as any).pool;
  if (!pool) return 0;
  const [result]: any = await pool.execute(
    `UPDATE broadcast_recipients SET status='pending', error_message=NULL, retry_count=retry_count+1
     WHERE campaign_id=? AND status='failed'`,
    [campaignId],
  );
  return result?.affectedRows ?? 0;
}

/** Re-launch campaign yang stuck (saat server restart) */
export async function resumeStuckCampaigns(): Promise<void> {
  // Phase D: iterate per active mitra. Each mitra's running campaigns are resumed inside that mitra's context.
  const allMitras = await storage.listMitras(false);
  for (const m of allMitras) {
    await withMitra(m.id, async () => {
      const running = await storage.listBroadcastCampaigns({ status: "running" });
      for (const c of running) {
        if (RUNNING_CAMPAIGNS.has(c.id)) continue;
        console.log(`[broadcast] resume stuck campaign ${c.id} "${c.name}" (mitra=${m.slug ?? m.id})`);
        RUNNING_CAMPAIGNS.add(c.id);
        // Loop inherits mitra context via AsyncLocalStorage propagation through await chain.
        runCampaignLoop(c.id).catch(err => {
          console.error(`[broadcast-resume] ${c.id} fatal:`, err.message);
        }).finally(() => {
          RUNNING_CAMPAIGNS.delete(c.id);
        });
      }
    });
  }
}
