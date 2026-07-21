/**
 * Chatwoot Contact Sync Worker (Batch 2f) - opsional, otomatis.
 *
 * Untuk tiap mitra aktif yang meng-enable `chatwoot_autosync_contacts` (mitra_integrations)
 * DAN Chatwoot terkonfigurasi: sync pelanggan yang belum/perlu sync ke Chatwoot contact,
 * dibatasi per cycle supaya tidak hantam rate-limit. Reuse upsertChatwootContact (batch 2b).
 *
 * Catatan: di prod WORKERS_ENABLED=false → worker ini dorman (sync manual tetap utama).
 * Tenant isolation: tiap mitra dijalankan di dalam withMitra() (AsyncLocalStorage).
 */
import { storage } from "./storage.js";
import { withMitra } from "./tenant-context.js";
import { upsertChatwootContact } from "./chatwoot.js";
import { buildChatwootContactPayload, buildChatwootContactLabels } from "../shared/chatwootContact.js";
import { toWhatsappNumber } from "../shared/phone.js";

type WorkerState = "stopped" | "idle" | "running";

const INTERVAL_MS = 30 * 60_000;   // tiap 30 menit
const PER_MITRA_CAP = 50;          // maksimum pelanggan disync per mitra per cycle

export class ChatwootContactSyncWorker {
  private state: WorkerState = "stopped";
  private timer: NodeJS.Timeout | null = null;
  private runLock = false;

  async start(): Promise<void> {
    if (this.state !== "stopped") return;
    this.state = "idle";
    console.log("[ChatwootContactSyncWorker] starting (interval 30m)...");
    this.timer = setInterval(() => {
      this.runOnce().catch((e) => console.error("[ChatwootContactSyncWorker] run error:", e?.message));
    }, INTERVAL_MS);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.state = "stopped";
    console.log("[ChatwootContactSyncWorker] stopped");
  }

  async runOnce(): Promise<{ mitras: number; synced: number; failed: number }> {
    if (this.runLock) return { mitras: 0, synced: 0, failed: 0 };
    this.runLock = true;
    this.state = "running";
    const agg = { mitras: 0, synced: 0, failed: 0 };
    try {
      const mitras = await storage.listMitras(false);
      for (const m of mitras) {
        try {
          const r = await withMitra(m.id, () => this.syncMitra(m.id));
          if (r.processed > 0) agg.mitras += 1;
          agg.synced += r.synced;
          agg.failed += r.failed;
        } catch (e: any) {
          console.error(`[ChatwootContactSyncWorker] mitra ${m.id} failed:`, e?.message);
        }
      }
    } finally {
      this.runLock = false;
      this.state = "idle";
    }
    return agg;
  }

  /** Sync satu mitra (dipanggil di dalam withMitra). */
  private async syncMitra(mitraId: number): Promise<{ processed: number; synced: number; failed: number }> {
    const config = await storage.getChatwootConfig();
    if (!config?.enabled || !config.accountId || !config.apiAccessToken) return { processed: 0, synced: 0, failed: 0 };
    if ((config as any).autoSyncContacts !== 1) return { processed: 0, synced: 0, failed: 0 };

    const customers = await storage.getCustomers();
    // Kandidat: belum pernah sync, atau data customer berubah setelah sync terakhir.
    const candidates = customers
      .filter((c: any) => !c.chatwootSyncedAt || (c.lastSyncAt && c.chatwootSyncedAt < c.lastSyncAt))
      .slice(0, PER_MITRA_CAP);

    const tenant = String(mitraId);
    let synced = 0, failed = 0;
    for (const c of candidates) {
      try {
        const r = await upsertChatwootContact(c as any, {
          tenant, normalize: toWhatsappNumber,
          buildPayload: buildChatwootContactPayload, buildLabels: buildChatwootContactLabels,
        });
        await storage.updateCustomerChatwootLink(c.id, String(r.contactId), new Date().toISOString());
        synced++;
      } catch (e: any) {
        failed++;
        console.warn(`[ChatwootContactSyncWorker] mitra ${mitraId} customer ${c.id}:`, e?.message);
      }
    }
    if (candidates.length) console.log(`[ChatwootContactSyncWorker] mitra ${mitraId}: ${synced} synced, ${failed} failed`);
    return { processed: candidates.length, synced, failed };
  }
}

export const chatwootContactSyncWorker = new ChatwootContactSyncWorker();
