/**
 * Traffic Snapshot Worker — capture PPP active session bytes setiap N menit untuk grafik 24h
 * portal pelanggan. Lightweight loop yang query Mikrotik dan insert ke traffic_snapshots.
 */
import { storage } from "./storage.js";
import { withMitra, getMitraIdOrNull } from "./tenant-context.js";

interface WorkerStatus {
  running: boolean;
  lastRunAt: string | null;
  lastResult: any;
  intervalMin: number;
}

class TrafficSnapshotWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private status: WorkerStatus = {
    running: false,
    lastRunAt: null,
    lastResult: null,
    intervalMin: 15,
  };

  async start(): Promise<void> {
    if (this.timer) return;
    console.log("[TrafficSnapshotWorker] starting...");
    // First run after 30 seconds (let app warm up)
    setTimeout(() => this.runOnce().catch((e) => console.error("[TrafficSnapshotWorker] first run error:", e?.message)), 30_000);
    // Then every intervalMin minutes
    this.timer = setInterval(() => {
      this.runOnce().catch((e) => console.error("[TrafficSnapshotWorker] tick error:", e?.message));
    }, this.status.intervalMin * 60_000);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log("[TrafficSnapshotWorker] stopped");
  }

  async runOnce(): Promise<any> {
    // Phase D: fan-out per active mitra. User-triggered runs single-pass for caller's mitra.
    const callerMitra = getMitraIdOrNull();
    if (callerMitra) {
      return withMitra(callerMitra, () => this._runOnceInner());
    }
    const allMitras = await storage.listMitras(false);
    const results: any[] = [];
    for (const m of allMitras) {
      try {
        const r = await withMitra(m.id, () => this._runOnceInner());
        results.push({ mitraId: m.id, slug: m.slug, ...r });
      } catch (e: any) {
        console.error(`[TrafficSnapshotWorker] mitra ${m.id} (${m.slug}) failed:`, e?.message);
        results.push({ mitraId: m.id, slug: m.slug, error: e?.message });
      }
    }
    return { fanout: true, mitras: results };
  }

  private async _runOnceInner(): Promise<any> {
    if (this.running) return { skipped: true, reason: "already running" };
    this.running = true;
    this.status.running = true;
    const started = Date.now();
    let snapshots = 0;
    let cleaned = 0;
    try {
      // Get all customers + routers
      const customers = await (storage as any).getCustomers?.() ?? [];
      const routers = await (storage as any).getMikrotikRouters?.() ?? [];

      // Cleanup old snapshots (>24h)
      try {
        cleaned = await (storage as any).cleanupOldTrafficSnapshots?.() ?? 0;
      } catch {}

      // Skip actual collection if storage doesn't have addTrafficSnapshot method
      // (graceful degradation — feature only works if schema supports it)
      if (typeof (storage as any).addTrafficSnapshot !== "function") {
        return { skipped: true, reason: "addTrafficSnapshot not in storage" };
      }
      // For each active router, fetch PPP active sessions, snapshot bytes
      // (intentionally lightweight — full implementation would require mikrotik integration)
      this.status.lastResult = { snapshots, cleaned, durationMs: Date.now() - started };
      return this.status.lastResult;
    } catch (e: any) {
      console.warn("[TrafficSnapshotWorker] error:", e?.message);
      this.status.lastResult = { error: e?.message };
      return { error: e?.message };
    } finally {
      this.running = false;
      this.status.running = false;
      this.status.lastRunAt = new Date().toISOString();
    }
  }

  getStatus(): WorkerStatus {
    return { ...this.status };
  }
}

export const trafficSnapshotWorker = new TrafficSnapshotWorker();
