/**
 * BillingSyncWorker (v4.1.2)
 * --------------------------
 * Background worker yang fetch pelanggan dari billing.jabnet.id dan:
 * 1. Update field whitelist (8 field) - TIDAK overwrite alamat/GPS/ODP lokal
 * 2. Detect state transitions → emit Collection Pipeline events
 *    - active → isolir: auto-create collection (stage=new)
 *    - isolir → active: auto-close collection (stage=paid)
 *    - payment detected: auto-close collection
 *
 * Scheduling: smart adaptive interval
 *   - Peak hour (08-17 WIB server time): 60 detik default
 *   - Off-peak (17-08): 600 detik default
 *   - Semua configurable via app_settings
 *
 * Error handling: exponential backoff 30s → 1m → 2m → 4m → max 10m
 * Concurrency: runLock mencegah run paralel (manual vs auto)
 * Graceful shutdown: stop() menghentikan scheduler tanpa abort in-flight run
 */

import { storage } from "./storage.js";
import type { BillingCustomerRecord } from "./storage.js";
import { sendLoyaltyNotification } from "./mpwa.js";
import { withMitra, getMitraIdOrNull } from "./tenant-context.js";
import { mapBillingSample } from "./billing-admin-helpers.js";
import { runBillingIntakeRules } from "./pipeline-billing-intake.js";
import { parseCollectionsMode, legacyCollectionsActive } from "../shared/collectionsMode.js";

type WorkerState = "idle" | "running" | "backing_off" | "stopped";

const SETTING_KEYS = {
  enabled: "billing_sync_enabled",
  intervalPeak: "billing_sync_interval_peak",       // detik, default 60
  intervalOff: "billing_sync_interval_off",         // detik, default 600
  peakStart: "billing_sync_peak_start",             // jam, default 8
  peakEnd: "billing_sync_peak_end",                 // jam, default 17
  failThresholdMin: "billing_sync_fail_threshold_min", // menit, default 5
  lastRunAt: "billing_sync_last_run_at",
  lastSuccessAt: "billing_sync_last_success_at",
  lastStatus: "billing_sync_last_status",           // success | error
  lastError: "billing_sync_last_error",
  lastStats: "billing_sync_last_stats",             // JSON
};

export class BillingSyncWorker {
  private state: WorkerState = "stopped";
  private timer: NodeJS.Timeout | null = null;
  private runLock = false;
  private backoffMs = 0;
  private readonly BASE_BACKOFF = 30_000;    // 30 detik
  private readonly MAX_BACKOFF = 600_000;    // 10 menit

  async start(): Promise<void> {
    if (this.state !== "stopped") {
      console.warn("[BillingSyncWorker] already started (state:", this.state, ")");
      return;
    }
    this.state = "idle";
    console.log("[BillingSyncWorker] starting...");
    // Run pertama non-blocking (jangan delay app listen())
    setImmediate(() => {
      this.runOnce().catch(e => console.error("[BillingSyncWorker] boot run error:", e.message));
    });
    this.scheduleNext();
  }

  async stop(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.state = "stopped";
    console.log("[BillingSyncWorker] stopped");
    // Note: in-flight run akan selesai natural (runLock cegah re-enter)
  }

  /**
   * Manual "Sync Now" trigger dari UI. Tidak pengaruh scheduler.
   * Return stats langsung untuk API response.
   */
  async triggerManual(userId?: number): Promise<{ total: number; created: number; updated: number; errors: number; transitions: any }> {
    return this.runOnce(userId);
  }

  /**
   * Manual trigger HANYA untuk Phase 2 collection thresholds
   * (tidak fetch billing - ambil langsung dari DB customers).
   * Berguna untuk testing/operasional setelah admin ubah settings.
   */
  async triggerThresholdCheck(): Promise<{ opened: number; writtenOff: number; advanced: number; overdueMoved: number; closed: number }> {
    const enabled = (await storage.getSetting("collection_enabled")) !== "false";
    if (!enabled) return { opened: 0, writtenOff: 0, advanced: 0, overdueMoved: 0, closed: 0 };
    const triggerDays = Number(await storage.getSetting("collection_trigger_days") ?? "3");
    const writeoffDays = Number(await storage.getSetting("collection_writeoff_days") ?? "90");
    const result = await this.runCollectionThresholds(triggerDays, writeoffDays);
    const mid = getMitraIdOrNull() ?? 1;
    // Reconcile: samakan board dengan status isolir (buka kartu isolir-tanpa-kartu, tutup non-isolir → Lunas).
    const recon = await withMitra(mid, () => storage.reconcileCollectionState());
    // SOP churn→reaktivasi: auto-delegasi kartu yang lewat SLA stage-nya ke divisi berikutnya.
    const sop = await withMitra(mid, () => storage.runCollectionSopAdvance());
    // Overdue: auto-pindah kartu lewat tenggat ke stage Overdue (untuk stage overdueAction="move").
    // Setelah SOP advance supaya kartu yang baru maju tak langsung di-overdue-kan.
    const overdue = await withMitra(mid, () => storage.runCollectionOverdueSweep());
    await storage.setSetting("collection_trigger_last_run_at", new Date().toISOString(), "collection");
    await storage.setSetting("collection_trigger_last_opened", String(result.opened + recon.opened), "collection");
    return { opened: result.opened + recon.opened, writtenOff: result.writtenOff, advanced: sop.advanced, overdueMoved: overdue.moved, closed: recon.closed };
  }

  /**
   * Force resync 1 customer dari billing API - admin trigger saat data terlihat drift.
   * Skip whitelist preserve, langsung overwrite dari upstream.
   * Return: status + transition + before/after.
   */
  async forceResyncOne(billingCustomerId: string): Promise<any> {
    try {
      const rows = await this.fetchAllFromBilling();
      const target = rows.find((r) => r.customer_id === billingCustomerId);
      if (!target) {
        return { found: false, message: `Customer ${billingCustomerId} tidak ada di billing API saat ini` };
      }
      const result = await storage.upsertCustomerFromBillingWhitelist(target);

      // Trigger collection state event sesuai transition
      if (result.customerId) {
        if (result.transition === "became_suspended") {
          await this.openCollectionIfMissing(result.customerId, target);
        } else if (result.transition === "became_active_after_suspended" || result.transition === "payment_received") {
          await this.closeCollectionIfOpen(result.customerId, target);
        }
      }

      return {
        found: true,
        action: result.action,
        transition: result.transition,
        customerId: result.customerId,
        before: result.before ? {
          isIsolir: result.before.isIsolir,
          billingStatus: (result.before as any).billingStatus,
          dueDate: (result.before as any).dueDate,
          lastPaymentDate: (result.before as any).lastPaymentDate,
        } : null,
        after: result.after ? {
          isIsolir: result.after.isIsolir,
          billingStatus: (result.after as any).billingStatus,
          dueDate: (result.after as any).dueDate,
          lastPaymentDate: (result.after as any).lastPaymentDate,
        } : null,
      };
    } catch (e: any) {
      return { found: false, error: e.message };
    }
  }

  async getStatus(): Promise<{
    state: WorkerState;
    lastRunAt: string | null;
    lastSuccessAt: string | null;
    lastStatus: string | null;
    lastError: string | null;
    lastStats: any;
    stale: boolean;
    staleMinutes: number;
    currentIntervalSec: number;
  }> {
    const lastRunAt = await storage.getSetting(SETTING_KEYS.lastRunAt);
    const lastSuccessAt = await storage.getSetting(SETTING_KEYS.lastSuccessAt);
    const lastStatus = await storage.getSetting(SETTING_KEYS.lastStatus);
    const lastError = await storage.getSetting(SETTING_KEYS.lastError);
    const lastStatsRaw = await storage.getSetting(SETTING_KEYS.lastStats);
    const thresholdMin = parseInt(await storage.getSetting(SETTING_KEYS.failThresholdMin) ?? "5");
    const intervalSec = await this.currentInterval() / 1000;
    const staleMinutes = lastSuccessAt
      ? Math.floor((Date.now() - new Date(lastSuccessAt).getTime()) / 60_000)
      : 999;
    return {
      state: this.state,
      lastRunAt,
      lastSuccessAt,
      lastStatus,
      lastError,
      lastStats: lastStatsRaw ? (() => { try { return JSON.parse(lastStatsRaw); } catch { return null; } })() : null,
      stale: staleMinutes > thresholdMin,
      staleMinutes,
      currentIntervalSec: intervalSec,
    };
  }

  // --- PRIVATE -------------------------------------------------------------

  private async currentInterval(): Promise<number> {
    const peakStart = parseInt(await storage.getSetting(SETTING_KEYS.peakStart) ?? "8");
    const peakEnd = parseInt(await storage.getSetting(SETTING_KEYS.peakEnd) ?? "17");
    const peak = parseInt(await storage.getSetting(SETTING_KEYS.intervalPeak) ?? "60");
    const off = parseInt(await storage.getSetting(SETTING_KEYS.intervalOff) ?? "600");
    const hour = new Date().getHours();
    const isPeak = hour >= peakStart && hour < peakEnd;
    return (isPeak ? peak : off) * 1000;
  }

  private async scheduleNext(): Promise<void> {
    if (this.state === "stopped") return;
    const enabled = (await storage.getSetting(SETTING_KEYS.enabled) ?? "true") === "true";
    if (!enabled) {
      // Worker disabled: cek ulang tiap 60 detik (in case user enable)
      this.timer = setTimeout(() => this.scheduleNext(), 60_000);
      return;
    }
    const base = await this.currentInterval();
    const delay = base + this.backoffMs;
    this.timer = setTimeout(() => {
      this.runOnce()
        .catch(e => console.error("[BillingSyncWorker] run error:", e.message))
        .finally(() => this.scheduleNext());
    }, delay);
  }

  private async runOnce(triggeredByUserId?: number): Promise<{ total: number; created: number; updated: number; errors: number; transitions: any }> {
    // Phase D: fan-out per active mitra. User-triggered runs single-pass for caller's mitra.
    const callerMitra = getMitraIdOrNull();
    if (callerMitra) {
      return withMitra(callerMitra, () => this._runOnceInner(triggeredByUserId)) as Promise<any>;
    }
    // Scheduler path: iterate all active mitras and accumulate stats
    const allMitras = await storage.listMitras(false);
    const agg = { total: 0, created: 0, updated: 0, errors: 0, transitions: { became_suspended: 0, became_active_after_suspended: 0, payment_received: 0 } as any };
    for (const m of allMitras) {
      try {
        const r = await withMitra(m.id, () => this._runOnceInner(triggeredByUserId));
        agg.total += r.total; agg.created += r.created; agg.updated += r.updated; agg.errors += r.errors;
        for (const k of Object.keys(r.transitions ?? {})) {
          agg.transitions[k] = (agg.transitions[k] ?? 0) + (r.transitions[k] ?? 0);
        }
      } catch (e: any) {
        console.error(`[BillingSyncWorker] mitra ${m.id} (${m.slug}) failed:`, e?.message);
        agg.errors += 1;
      }
    }
    return agg;
  }

  private async _runOnceInner(triggeredByUserId?: number): Promise<{ total: number; created: number; updated: number; errors: number; transitions: any }> {
    if (this.runLock) {
      console.warn("[BillingSyncWorker] run already in progress, skipping");
      return { total: 0, created: 0, updated: 0, errors: 0, transitions: {} };
    }
    this.runLock = true;
    this.state = "running";
    const startIso = new Date().toISOString();
    await storage.setSetting(SETTING_KEYS.lastRunAt, startIso, "billing");

    const stats = {
      total: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      transitions: { became_suspended: 0, became_active: 0, payment_received: 0 },
    };

    try {
      const rows = await this.fetchAllFromBilling();
      stats.total = rows.length;
      for (const row of rows) {
        try {
          const r = await storage.upsertCustomerFromBillingWhitelist(row);
          if (r.action === "created") stats.created++;
          else if (r.action === "updated") stats.updated++;
          else if (r.action === "skipped") stats.skipped++;

          // Auto-link referral kalau customer baru saja dibuat (by phone match)
          if (r.action === "created" && r.customerId) {
            const linked = await storage.autoLinkPendingReferralsByPhone(r.customerId, row.no_telepon ?? null).catch((e: any) => {
              console.warn(`[Loyalty] auto-link error for customer ${r.customerId}:`, e.message);
              return [];
            });
            if (linked.length > 0) {
              console.log(`[BillingSync] customer ${r.customerId} auto-linked as referee dari ${linked.length} pending referral(s)`);
              // Notif WA ke setiap referrer
              for (const ref of linked) {
                this.notifyReferrerAutoLinked(ref).catch((e: any) => console.warn("[Sahabat auto-link notif]:", e.message));
              }
            }
          }

          // Emit collection events berdasarkan transition
          if (r.customerId) {
            if (r.transition === "became_suspended") {
              await this.openCollectionIfMissing(r.customerId, row);
              stats.transitions.became_suspended++;
            } else if (r.transition === "became_active_after_suspended" || r.transition === "payment_received") {
              await this.closeCollectionIfOpen(r.customerId, row);
              if (r.transition === "became_active_after_suspended") stats.transitions.became_active++;
              else stats.transitions.payment_received++;
              // Evaluate payment + kirim notifikasi milestone + reward referral
              if (row.last_payment_date) {
                await this.handleLoyaltyOnPayment(r.customerId, row);
              }
            }
          }
        } catch (rowErr: any) {
          stats.errors++;
          console.error(`[BillingSyncWorker] row error (customer_id=${row.customer_id}):`, rowErr.message);
        }
      }

      // Collections cutover: in pipeline-mode the billing_sync rule handles auto-open; skip legacy.
      const collectionsMode = parseCollectionsMode(await storage.getMitraSetting("collections_engine_mode"));
      if (legacyCollectionsActive(collectionsMode)) {
        // -- Phase 2: Collection threshold triggers (overdue days + auto-writeoff) --
        const collectionEnabled = (await storage.getSetting("collection_enabled")) !== "false";
        if (collectionEnabled) {
          const triggerDays = Number(await storage.getSetting("collection_trigger_days") ?? "3");
          const writeoffDays = Number(await storage.getSetting("collection_writeoff_days") ?? "90");
          const collectionResults = await this.runCollectionThresholds(triggerDays, writeoffDays);
          (stats.transitions as any).auto_opened_overdue = collectionResults.opened;
          (stats.transitions as any).auto_writeoff = collectionResults.writtenOff;
          // SOP churn→reaktivasi: auto-delegasi antar-stage/divisi berdasarkan SLA.
          try {
            const sop = await storage.runCollectionSopAdvance();
            (stats.transitions as any).sop_auto_delegated = sop.advanced;
          } catch (e: any) { console.warn(`[BillingSyncWorker] SOP advance error: ${e.message}`); }
          await storage.setSetting("collection_trigger_last_run_at", new Date().toISOString(), "collection");
          await storage.setSetting("collection_trigger_last_opened", String(collectionResults.opened), "collection");
        }

        // -- Phase 3: Reconciliation pass - auto-fix customer<->collection drift --
        // Catch cases yang lewat dari transition detection (mis. sync gagal sebelumnya, manual close,
        // atau collection yang stuck open meskipun customer sudah lunas)
        try {
          const reconcile = await storage.reconcileCollectionState();
          if (reconcile.fixesApplied > 0) {
            (stats.transitions as any).reconciled_fixes = reconcile.fixesApplied;
            console.log(`[BillingSync] Reconciliation: ${reconcile.fixesApplied} drift fixed (${reconcile.mismatchesFound} mismatches detected)`);
          }
          if (reconcile.errors > 0) {
            console.warn(`[BillingSync] Reconciliation errors: ${reconcile.errors}`);
          }
        } catch (e: any) {
          console.warn("[BillingSync] Reconciliation skipped:", e?.message);
        }
      } else {
        console.log(`[BillingSyncWorker] collections pipeline-mode: legacy auto-open/reconcile dilewati`);
      }

      // -- Phase 4: Pipeline billing-intake - create/auto-resolve cards per billing_sync rules --
      try {
        const intake = await runBillingIntakeRules();
        (stats.transitions as any).pipeline_intake_created = intake.created;
        (stats.transitions as any).pipeline_intake_resolved = intake.resolved;
        if (intake.created || intake.resolved) {
          console.log(`[BillingSyncWorker] → pipeline billing-intake: ${intake.created} created, ${intake.resolved} resolved`);
        }
      } catch (e: any) {
        console.error(`[BillingSyncWorker] billing-intake error:`, e.message);
      }

      // -- Phase 4b (collection config-engine) DIHAPUS - digantikan rule billing_sync (Phase 4). --

      // -- Phase 5 dihapus dari sini (v4.2.3+) --
      // Speed-on-Demand expire+revert sekarang ditangani oleh dedicated 60s worker di server/index.ts
      // dengan atomic guarantee: revert dulu, baru mark expired. Kalau revert gagal, retry next loop.
      // Pattern lama (legacy expireOverdueRedemptions) masih ada di storage tapi tidak dipakai.

      // Success - clear backoff, record observability
      this.backoffMs = 0;
      const successIso = new Date().toISOString();
      await storage.setSetting(SETTING_KEYS.lastSuccessAt, successIso, "billing");
      await storage.setSetting(SETTING_KEYS.lastStatus, "success", "billing");
      await storage.setSetting(SETTING_KEYS.lastError, "", "billing");
      await storage.setSetting(SETTING_KEYS.lastStats, JSON.stringify(stats), "billing");

      // NOTE: billing sync success TIDAK di-audit-log (biar tidak banjiri activity log).
      // Stats sudah disimpan di app_settings.billing_sync_last_stats → dashboard banner.
      // Hanya manual trigger dari UI yang di-log via logAudit di routes.ts.

      console.log(`[BillingSyncWorker] ✓ synced ${stats.total} customers (created=${stats.created}, updated=${stats.updated}, skipped=${stats.skipped}, errors=${stats.errors}, isolir=${stats.transitions.became_suspended}, paid=${stats.transitions.payment_received + stats.transitions.became_active})`);
    } catch (err: any) {
      // Backoff exponential
      this.backoffMs = Math.min(
        this.backoffMs === 0 ? this.BASE_BACKOFF : this.backoffMs * 2,
        this.MAX_BACKOFF
      );
      this.state = "backing_off";
      await storage.setSetting(SETTING_KEYS.lastStatus, "error", "billing");
      await storage.setSetting(SETTING_KEYS.lastError, err.message, "billing");
      console.error(`[BillingSyncWorker] ✗ sync failed, backing off ${this.backoffMs / 1000}s:`, err.message);
      // Jangan throw ke luar - let scheduler continue
    } finally {
      this.runLock = false;
      // Reset ke idle kecuali sedang backing_off (error path) atau stopped (shutdown)
      const s = this.state as WorkerState;
      if (s === "running") this.state = "idle";
    }
    return stats;
  }

  /** Resolve reseller_id: explicit override wins, else per-mitra setting (JABNET=12 fallback). */
  private async resolveResellerId(override?: number): Promise<number> {
    if (override !== undefined && Number.isFinite(override) && override > 0) return override;
    const currentMitra = getMitraIdOrNull() ?? 1;
    const isJabnet = currentMitra === 1;
    const resellerFromSettings = await storage.getMitraSetting("billing_reseller_id");
    let resellerId: number;
    if (isJabnet) {
      resellerId = resellerFromSettings ? parseInt(resellerFromSettings) : 12;
    } else {
      if (!resellerFromSettings) {
        throw new Error(`Mitra ${currentMitra}: billing_reseller_id belum di-set. Atur via /integrations (JABNET).`);
      }
      resellerId = parseInt(resellerFromSettings);
    }
    if (!Number.isFinite(resellerId) || resellerId <= 0) {
      throw new Error(`Invalid reseller_id config for mitra ${currentMitra} (got "${resellerFromSettings}").`);
    }
    return resellerId;
  }

  /** Fetch all active customers (rumahan+bisnis+vip) for a reseller_id. Deduped. NO throw on empty. */
  private async fetchResellerRows(resellerId: number): Promise<BillingCustomerRecord[]> {
    const API_TOKEN = process.env.BILLING_API_TOKEN ?? "";
    if (!API_TOKEN) {
      throw new Error("BILLING_API_TOKEN belum di-set di .env server. Hubungi admin server.");
    }
    const BASE_URL = process.env.BILLING_API_URL || "https://billing.jabnet.id/api/pelanggan/list_pelanggan";

    const fetchOne = async (params: Record<string, string>): Promise<BillingCustomerRecord[]> => {
      const qs = new URLSearchParams({ ...params, reseller_id: String(resellerId), api_token: API_TOKEN });
      const r = await fetch(`${BASE_URL}?${qs}`, { signal: AbortSignal.timeout(30_000) });
      if (!r.ok) throw new Error(`Billing API HTTP ${r.status} (reseller_id=${resellerId})`);
      const json: any = await r.json();
      return json?.data?.data_pelanggan ?? json?.data ?? [];
    };

    const [rumahan, bisnis, vip] = await Promise.all([
      fetchOne({ jenis_pelanggan: "rumahan", status_pelanggan: "aktif" }).catch(e => {
        console.warn(`[BillingSyncWorker] rumahan fetch warn (reseller=${resellerId}):`, e.message); return [];
      }),
      fetchOne({ jenis_pelanggan: "bisnis", status_pelanggan: "aktif" }).catch(e => {
        console.warn(`[BillingSyncWorker] bisnis fetch warn (reseller=${resellerId}):`, e.message); return [];
      }),
      fetchOne({ jenis_pelanggan: "vip", status_pelanggan: "aktif" }).catch(e => {
        console.warn(`[BillingSyncWorker] vip fetch warn (reseller=${resellerId}):`, e.message); return [];
      }),
    ]);
    const seen = new Set<string>();
    const combined: BillingCustomerRecord[] = [];
    for (const row of [...rumahan, ...bisnis, ...vip]) {
      const key = String((row as any).customer_id ?? "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      combined.push(row);
    }
    return combined;
  }

  /** Sync path: resolve reseller + fetch. Throws on empty (treated as connectivity/cred error). */
  private async fetchAllFromBilling(resellerIdOverride?: number): Promise<BillingCustomerRecord[]> {
    const resellerId = await this.resolveResellerId(resellerIdOverride);
    const combined = await this.fetchResellerRows(resellerId);
    if (combined.length === 0) {
      throw new Error(`Billing API returned empty (reseller_id=${resellerId}) - check connectivity/credentials`);
    }
    return combined;
  }

  /** Admin "Test": does this reseller_id pull customers? Returns count + sample. NO throw on empty. */
  async testResellerData(resellerId: number): Promise<{ totalFound: number; sample: any[] }> {
    const rows = await this.fetchResellerRows(resellerId);
    return { totalFound: rows.length, sample: mapBillingSample(rows) };
  }

  /**
   * Phase 2 collection triggers - berjalan setelah main billing sync.
   * 1. Overdue trigger: customer dengan dueDate < (today - triggerDays) AND belum ada collection open → auto-open
   *    Preventive: tim collection bisa follow-up SEBELUM customer diisolir billing
   * 2. Writeoff trigger: collection open > writeoffDays → auto-move ke stage "written_off"
   *    Cleanup: pelanggan yang sudah lama tidak bayar (e.g. 90 hari) diwrite-off otomatis
   */
  private async runCollectionThresholds(triggerDays: number, writeoffDays: number): Promise<{ opened: number; writtenOff: number }> {
    // Always called as a sub-step of runOnce - caller already established withMitra context.
    // If no context (e.g. direct test call), default to mitra 1.
    const mid = getMitraIdOrNull() ?? 1;
    return withMitra(mid, () => this._runCollectionThresholdsInner(triggerDays, writeoffDays)) as Promise<any>;
  }

  private async _runCollectionThresholdsInner(triggerDays: number, writeoffDays: number): Promise<{ opened: number; writtenOff: number }> {
    const result = { opened: 0, writtenOff: 0 };
    const now = Date.now();

    // 1. Auto-open HANYA untuk customer isolir (is_isolir=1) yang belum ada open collection.
    //    Model: kartu collection ada ⟺ customer isolir. Customer overdue-tapi-belum-isolir TIDAK
    //    dibuatkan kartu (dulu bug ini bikin ratusan kartu). triggerDays tak lagi dipakai untuk open.
    const allCustomers = await storage.getCustomers();
    const isolirByCustomer = new Map<number, boolean>(allCustomers.map((c) => [c.id, c.isIsolir === 1]));

    for (const c of allCustomers) {
      if (c.isIsolir !== 1) continue; // hanya isolir
      // Skip kalau billing status sudah lunas (paid) - defensif; isolir seharusnya belum lunas.
      if (c.billingStatus === "lunas" || c.billingStatus === "paid") continue;
      // Cek open collection - kalau sudah ada, skip (idempotent, sinkron dgn reconcile CASE 1).
      const existing = await storage.getOpenCollectionByCustomer(c.id);
      if (existing) continue;

      // Auto-open collection
      try {
        const nowIso = new Date().toISOString();
        const dueDate = (c as any).dueDate;
        const dueMs = dueDate ? new Date(dueDate).getTime() : NaN;
        const overdueDays = isNaN(dueMs) ? 0 : Math.floor((now - dueMs) / 86400_000);
        const entryStage = (await storage.getCollectionStageKeyByRole("entry")) ?? "new";
        const col = await storage.createCollection({
          customerId: c.id,
          openedAt: nowIso,
          openedBillingStatus: c.billingStatus ?? null,
          openedDueDate: dueDate ?? null,
          openedAmount: c.billingPrice ?? null,
          openedIsolirDate: (c as any).isolirDate ?? null,
          stage: entryStage,
          priority: overdueDays > 30 ? "high" : overdueDays > 7 ? "medium" : "low",
          createdBy: null,
          createdAt: nowIso,
        } as any);
        await storage.createCollectionActivity({
          collectionId: col.id,
          userId: null,
          type: "auto_opened",
          content: JSON.stringify({
            reason: "isolir",
            overdueDays,
            dueDate: dueDate ?? null,
            billingStatus: c.billingStatus,
          }),
          createdAt: nowIso,
        } as any);
        result.opened++;
        console.log(`[BillingSyncWorker] → auto_opened collection #${col.id} for isolir customer #${c.id}`);
      } catch (e: any) {
        if (!e.message?.includes("UNIQUE")) {
          console.error(`[BillingSyncWorker] auto-open error customer #${c.id}:`, e.message);
        }
      }
    }

    // 2. Auto-writeoff untuk collection yang sudah sangat lama (kalau enabled via writeoffDays > 0).
    //    Butuh stage role 'writeoff'; kalau mitra tak punya → auto write-off di-skip (disabled).
    const writeoffKey = writeoffDays > 0 ? await storage.getCollectionStageKeyByRole("writeoff", { fallback: false }) : null;
    if (writeoffDays > 0 && writeoffKey) {
      const writeoffCutoff = now - writeoffDays * 86400_000;
      const paidKey = (await storage.getCollectionStageKeyByRole("paid")) ?? "paid";
      const openCollections = await storage.getCollections({ openOnly: true });
      for (const col of openCollections) {
        // Hanya kartu yang MASIH open + customer MASIH isolir (yang sudah reaktivasi keburu di-Lunas-kan).
        if (col.closedAt || !isolirByCustomer.get(col.customerId)) continue;
        const openedMs = new Date(col.openedAt).getTime();
        if (isNaN(openedMs) || openedMs > writeoffCutoff) continue;
        if (col.stage === paidKey || col.stage === writeoffKey) continue;
        try {
          const ageDays = Math.floor((now - openedMs) / 86400_000);
          await storage.moveCollectionStage(col.id, writeoffKey, null, {
            closeReason: `auto_writeoff_${ageDays}_days`,
          } as any);
          result.writtenOff++;
          console.log(`[BillingSyncWorker] → auto_writeoff collection #${col.id} (age ${ageDays}d)`);
        } catch (e: any) {
          console.error(`[BillingSyncWorker] auto-writeoff error #${col.id}:`, e.message);
        }
      }
    }

    return result;
  }

  /** Revert MikroTik PPP profile + WA notif ke customer saat boost expired. */
  private async revertMikrotikAndNotify(redemption: any): Promise<void> {
    // 1. Revert PPP profile ke original (kalau redemption punya data MikroTik)
    if (redemption.originalPppProfile) {
      try {
        const { revertBoost } = await import("./mikrotik-boost.js");
        const result = await revertBoost(redemption.customerId, redemption.originalPppProfile);
        if (result.success) {
          console.log(`[Boost] Reverted PPP profile for redemption #${redemption.id} → ${redemption.originalPppProfile}`);
        } else {
          console.warn(`[Boost] Revert FAILED for redemption #${redemption.id}: ${result.error}`);
        }
      } catch (e: any) {
        console.warn(`[Boost] Revert exception #${redemption.id}:`, e.message);
      }
    }
    // 2. WA notif ke customer
    return this.notifyCustomerBoostExpired(redemption);
  }

  /** WA notif ke customer saat boost expired (durasi habis). */
  private async notifyCustomerBoostExpired(redemption: any): Promise<void> {
    const customer = await storage.getCustomer(redemption.customerId);
    if (!customer?.phone) return;
    const loyalty = await storage.getOrCreateCustomerLoyalty(redemption.customerId);
    const { sendLoyaltyNotification } = await import("./mpwa.js");
    await sendLoyaltyNotification("sahabat_boost_expired", customer.phone, {
      nama: customer.name,
      rewardLabel: redemption.rewardLabel,
      normalPackage: customer.package || "paket berlangganan",
      lifetimeEarned: String((loyalty as any).pointsLifetimeEarned ?? 0),
      balance: String((loyalty as any).pointsBalance ?? 0),
    });
  }

  /** WA notif ke referrer saat referral-nya auto-linked (tetangga daftar). */
  private async notifyReferrerAutoLinked(referral: any): Promise<void> {
    const referrer = await storage.getCustomer(referral.referrerCustomerId);
    if (!referrer?.phone) return;
    const loyalty = await storage.getOrCreateCustomerLoyalty(referral.referrerCustomerId);
    const level = (loyalty as any).sahabatLevel ?? "new";
    const totalSuccessful = (loyalty as any).totalSuccessfulReferrals ?? 0;
    const LEVEL_LABEL: Record<string, string> = {
      new: "Pelanggan", perunggu: "Perunggu ", perak: "Perak ",
      emas: "Emas ", platinum: "Platinum ", berlian: "Berlian ", ambassador: "Ambassador ",
    };
    const NEXT: Record<string, string> = {
      new: "5 lagi ke Perunggu (Bonus Rp 200K)",
      perunggu: "5 lagi ke Perak (GRATIS 12 bulan)",
      perak: "10 lagi ke Emas (GRATIS 24 bulan)",
      emas: "10 lagi ke Platinum (Cash Rp 2jt)",
      platinum: "20 lagi ke Berlian (Cash Rp 5jt)",
      berlian: "Level maksimal ", ambassador: "Rev share 15% aktif",
    };
    const { sendLoyaltyNotification } = await import("./mpwa.js");
    await sendLoyaltyNotification("sahabat_invite_registered", referrer.phone, {
      nama: referrer.name,
      refereeName: referral.refereeName || "Tetangga",
      totalSuccessful: String(totalSuccessful),
      level: LEVEL_LABEL[level] ?? level,
      nextInfo: NEXT[level] ?? "",
      sahabatCode: (loyalty as any).sahabatCode ?? loyalty.referralCode ?? "-",
    });
  }

  private async openCollectionIfMissing(customerId: number, billing: BillingCustomerRecord): Promise<void> {
    const existing = await storage.getOpenCollectionByCustomer(customerId);
    if (existing) return; // partial unique index juga block - belt & suspenders
    const now = new Date().toISOString();
    try {
      const entryStage = (await storage.getCollectionStageKeyByRole("entry")) ?? "new";
      const col = await storage.createCollection({
        customerId,
        openedAt: now,
        openedBillingStatus: billing.status_invoice,
        openedDueDate: billing.due_date ?? null,
        openedAmount: billing.harga_layanan ?? null,
        openedIsolirDate: billing.isolir_date ?? null,
        stage: entryStage,
        priority: "medium",
        createdBy: null,
        createdAt: now,
      } as any);
      await storage.createCollectionActivity({
        collectionId: col.id,
        userId: null,
        type: "auto_opened",
        content: JSON.stringify({ reason: "isolir_detected", billingStatus: billing.status_invoice }),
        createdAt: now,
      } as any);
      console.log(`[BillingSyncWorker] → auto_opened collection #${col.id} for customer #${customerId}`);
    } catch (e: any) {
      // Partial unique index mungkin trigger race - safe to ignore
      if (!e.message.includes("UNIQUE")) throw e;
    }
  }

  private async closeCollectionIfOpen(customerId: number, billing: BillingCustomerRecord): Promise<void> {
    const open = await storage.getOpenCollectionByCustomer(customerId);
    if (!open) return;
    const now = new Date().toISOString();
    const paidStage = (await storage.getCollectionStageKeyByRole("paid")) ?? "paid";
    await storage.updateCollection(open.id, {
      stage: paidStage,
      closedAt: now,
      closeReason: "auto_paid",
      closedLastPaymentDate: billing.last_payment_date ?? null,
    } as any);
    await storage.createCollectionActivity({
      collectionId: open.id,
      userId: null,
      type: "auto_closed",
      content: JSON.stringify({
        reason: "payment_detected",
        lastPaymentDate: billing.last_payment_date,
      }),
      createdAt: now,
    } as any);
    console.log(`[BillingSyncWorker] → auto_closed collection #${open.id} for customer #${customerId} (paid)`);
  }

  /**
   * Handler loyalty saat payment terdeteksi (JABNET Sahabat v4.1.9).
   * 1. Evaluate streak (internal tracking - tidak kirim notif lagi, streak bukan reward utama)
   * 2. Refresh tenure months (legacy display saja)
   * 3. Reward referral kalau ini first payment referee → Voucher Indomaret Rp 50K + level up check
   * 4. Kirim MPWA Sahabat: referral_rewarded (per referral) + perunggu/perak/emas/platinum/berlian (per level-up)
   */
  private async handleLoyaltyOnPayment(customerId: number, billing: BillingCustomerRecord): Promise<void> {
    try {
      const customer = await storage.getCustomer(customerId);
      if (!customer?.phone) return;

      // 1. Streak - tetap di-evaluate (untuk leaderboard insight), tidak notif
      await storage.evaluatePaymentForLoyalty(
        customerId,
        billing.last_payment_date!,
        billing.due_date,
      );

      // 2. Refresh tenure (legacy display)
      await storage.refreshTenureBadgeWithUpgradeCheck(customerId);

      // 2b. Award points kalau bayar tepat waktu / early - Speed-on-Demand earning rules
      try {
        if (billing.last_payment_date && billing.due_date) {
          const paid = new Date(billing.last_payment_date).getTime();
          const due = new Date(billing.due_date).getTime();
          // Tepat waktu: bayar SEBELUM atau PAS due_date
          if (paid <= due + 24 * 3600_000) {
            const onTimePts = Number(await storage.getSetting("points_earn_on_time")) || 100;
            const earlyBonusPts = Number(await storage.getSetting("points_earn_early_bonus")) || 50;
            const earlyDays = Number(await storage.getSetting("points_earn_early_days_threshold")) || 3;
            // refId pakai timestamp epoch payment date untuk idempotency per pembayaran
            const refId = Math.floor(paid / 1000);
            await storage.earnPoints({
              customerId,
              amount: onTimePts,
              source: "on_time_payment",
              refId,
              notes: `Bayar tepat waktu untuk tagihan jatuh tempo ${billing.due_date}`,
            }).catch((e: any) => console.warn(`[Points] earn on-time error for ${customerId}:`, e.message));
            // Bonus early
            const daysEarly = Math.floor((due - paid) / (24 * 3600_000));
            if (daysEarly >= earlyDays) {
              await storage.earnPoints({
                customerId,
                amount: earlyBonusPts,
                source: "early_payment",
                refId,
                notes: `Bonus bayar ${daysEarly} hari sebelum jatuh tempo`,
              }).catch((e: any) => console.warn(`[Points] earn early error for ${customerId}:`, e.message));
            }
          }
        }
      } catch (e: any) {
        console.warn(`[Points] earn flow error for ${customerId}:`, e.message);
      }

      // 3. Reward referral kalau customer ini referee & ini first payment
      const { referrals: rewarded, levelUpgrades } = await storage.rewardReferralsOnFirstPayment(
        customerId,
        billing.last_payment_date!,
      );

      // 3a. Notif per referral sukses ke REFERRER (Voucher Indomaret Rp 50K)
      const LEVEL_LABEL: Record<string, string> = {
        new: "Pelanggan", perunggu: "Perunggu ", perak: "Perak ",
        emas: "Emas ", platinum: "Platinum ", berlian: "Berlian ",
        ambassador: "Ambassador ",
      };
      const NEXT_THRESHOLD: Record<string, string> = {
        new: "5 lagi ke Perunggu (Voucher Rp 200K + Speed Boost)",
        perunggu: "5 lagi ke Perak (Internet GRATIS 12 bulan)",
        perak: "10 lagi ke Emas (Internet GRATIS 24 bulan)",
        emas: "10 lagi ke Platinum (Cash Rp 2jt + Ambassador)",
        platinum: "20 lagi ke Berlian (Cash Rp 5jt + Trainer)",
        berlian: "Kamu sudah maksimal - selamat, Legend!",
        ambassador: "Status Ambassador aktif - 15% rev share semua referral selanjutnya",
      };
      for (const ref of rewarded) {
        const referrer = await storage.getCustomer(ref.referrerCustomerId);
        if (!referrer?.phone) continue;
        const referrerLoyalty = await storage.getOrCreateCustomerLoyalty(ref.referrerCustomerId);
        const level = (referrerLoyalty as any).sahabatLevel ?? "new";
        const totalRefs = (referrerLoyalty as any).totalSuccessfulReferrals ?? 0;
        const sahabatCode = (referrerLoyalty as any).sahabatCode ?? (referrerLoyalty as any).referralCode ?? "-";
        sendLoyaltyNotification("sahabat_referral_rewarded", referrer.phone, {
          nama: referrer.name,
          refereeName: ref.refereeName || customer.name,
          totalRefs: String(totalRefs),
          level: LEVEL_LABEL[level] ?? level,
          nextInfo: NEXT_THRESHOLD[level] ?? "",
          sahabatCode,
        }).catch((e: any) => console.warn("[Sahabat] MPWA referral notif error:", e.message));
        // Broadcast Telegram ke admin/marketing_spv untuk visibility
        import("./telegram.js").then(({ notifyRolesTelegram }) => {
          notifyRolesTelegram(["admin", "marketing_spv"], "sahabat_referral",
            ` *Referral Sahabat baru*\n\n${referrer.name} (${sahabatCode}) berhasil refer *${ref.refereeName || customer.name}*\n\nTotal refs: ${totalRefs} · Level: ${LEVEL_LABEL[level] ?? level}`);
        }).catch(() => {});
      }

      // 3b. Notif level up - kirim ke referrer sesuai level baru
      for (const upgrade of levelUpgrades) {
        const referrer = await storage.getCustomer(upgrade.referrerCustomerId);
        if (!referrer?.phone) continue;
        const referrerLoyalty = await storage.getOrCreateCustomerLoyalty(upgrade.referrerCustomerId);
        const sahabatCode = (referrerLoyalty as any).sahabatCode ?? (referrerLoyalty as any).referralCode ?? "-";
        const templateKey = `sahabat_${upgrade.toLevel}`; // sahabat_perunggu / sahabat_perak / ...
        sendLoyaltyNotification(templateKey, referrer.phone, {
          nama: referrer.name,
          sahabatCode,
        }).catch((e: any) => console.warn("[Sahabat] MPWA level-up notif error:", e.message));
      }
    } catch (e: any) {
      console.warn(`[Sahabat] handleLoyaltyOnPayment error for customer ${customerId}:`, e.message);
    }
  }
}

export const billingSyncWorker = new BillingSyncWorker();
