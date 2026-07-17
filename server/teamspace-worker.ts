/** Teamspace worker (v5.0 Fase 2) — scheduler check-in rutin (FR-802/804).
 *  Tick tiap 60 detik: pertanyaan aktif yang jatuh tempo hari+jam-nya dikirim SEKALI
 *  per hari (dedup via last_sent_date; shouldSendNow pakai ">=" jadi tahan downtime).
 *  Pengiriman: notifikasi in-app + WhatsApp via MPWA (best-effort, hormati mpwa_enabled).
 *  Berjalan lintas-mitra: query mentah tanpa tenant ctx → proses per pertanyaan
 *  di dalam tenantContext mitra-nya (pola public-config). */
import { storage } from "./storage.js";
import { tenantContext } from "./tenant-context.js";
import { shouldSendNow, localDateStr } from "../shared/checkinSchedule.js";
import { loadMpwaConfig, sendMpwaMessage } from "./mpwa.js";

const TICK_MS = 60_000;

/** Base URL untuk link di pesan WA (configurable via env untuk staging). */
function appBaseUrl(): string {
  return (process.env.APP_PUBLIC_URL || "https://workspace.jabnet.id").replace(/\/$/, "");
}

class TeamspaceWorker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  private tickCount = 0;

  async start(): Promise<void> {
    if (this.timer) return;
    console.log("[TeamspaceWorker] started (tick 60s — check-in scheduler + KPI snapshot 30m)");
    this.timer = setInterval(() => { void this.tick(); }, TICK_MS);
  }

  async stop(): Promise<void> {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  private async tick(): Promise<void> {
    if (this.ticking) return;                 // reentrancy guard bila tick sebelumnya lambat
    this.ticking = true;
    try {
      const now = new Date();
      const all = await storage.listActiveCheckinQuestionsAllMitra();
      const due = all.filter((q) => shouldSendNow(q, now));
      for (const q of due) {
        // Tandai terkirim DULUAN — bila error di tengah, tidak spam ulang tiap menit;
        // instance berikutnya tetap jalan di hari jadwal berikutnya.
        await storage.markCheckinSent(q.id, localDateStr(now));
        await this.dispatchQuestion(q);
      }
      // §14.4: snapshot KPI Teamspace tiap ~30 menit (upsert per hari — tulisan
      // terakhir = keadaan end-of-day, dasar grafik tren periode-ke-periode).
      if (this.tickCount % 30 === 0) {
        await storage.writeTeamspaceKpiSnapshots().catch((e: any) =>
          console.warn("[TeamspaceWorker] kpi snapshot failed:", e?.message));
      }
      this.tickCount++;
    } catch (e: any) {
      console.warn("[TeamspaceWorker] tick failed:", e?.message);
    } finally {
      this.ticking = false;
    }
  }

  private async dispatchQuestion(q: { id: number; mitraId: number; teamId: number; questionText: string; createdBy: number }): Promise<void> {
    await new Promise<void>((resolve) => {
      tenantContext.run({ mitraId: q.mitraId, userId: 0, isSuperAdmin: true }, async () => {
        try {
          const [recipients, team] = await Promise.all([
            storage.getRecipientsForQuestions([q.id]).then((m) => m.get(q.id) ?? []),
            storage.getTeam(q.teamId),
          ]);
          const teamName = team?.name ?? "Tim";
          const link = `/teamspace/teams/${q.teamId}`;

          // 1) Notifikasi in-app untuk semua penerima.
          for (const uid of recipients) {
            await storage.createNotification({
              userId: uid, type: "checkin_due",
              title: `Check-in ${teamName}`,
              message: q.questionText.slice(0, 120),
              link, entityType: "checkin_question", entityId: q.id,
              fromUserId: q.createdBy,
            });
          }

          // 2) WhatsApp via MPWA — best-effort; null config = disabled (dev mode log saja).
          const cfg = await loadMpwaConfig();
          if (!cfg) {
            console.log(`[TeamspaceWorker] MPWA off — check-in #${q.id} "${q.questionText.slice(0, 40)}" → ${recipients.length} penerima (in-app only)`);
            return resolve();
          }
          for (const uid of recipients) {
            try {
              const u = await storage.getUser(uid);
              const phone = (u as any)?.phone as string | null;
              if (!phone || (u as any)?.isActive === 0) continue;
              const msg = [
                `📋 *Check-in ${teamName}*`,
                "",
                q.questionText,
                "",
                `Jawab di: ${appBaseUrl()}/teamspace/teams/${q.teamId}`,
              ].join("\n");
              const r = await sendMpwaMessage(cfg, phone, msg, "JABNET Workspace");
              if (!r.sent) console.warn(`[TeamspaceWorker] WA ke user ${uid} gagal: ${r.error}`);
            } catch (e: any) {
              console.warn(`[TeamspaceWorker] WA dispatch user ${uid} error:`, e?.message);
            }
          }
        } catch (e: any) {
          console.warn(`[TeamspaceWorker] dispatch question ${q.id} failed:`, e?.message);
        }
        resolve();
      });
    });
  }
}

export const teamspaceWorker = new TeamspaceWorker();
