import { withMitra } from "./tenant-context.js";
import { runLeadIntake } from "./lead-intake.js";
import type { IntakeLead } from "../shared/leadIntake.js";

export type LeadEventType = "created" | "updated" | "assigned" | "stage_changed" | "converted";

/** Emit lead event → jalankan intake di tenant lead. Sinkron best-effort, NEVER throws.
 *  Tenant diambil dari lead.mitraId (webhook publik tak punya req context). */
export async function emitLeadEvent(eventType: LeadEventType, lead: IntakeLead, actorId: number): Promise<void> {
  try {
    const mitraId = Number(lead.mitraId ?? 1) || 1;
    await withMitra(mitraId, () => runLeadIntake(eventType, lead, actorId));
  } catch (e: any) {
    console.warn(`[lead-events] emit ${eventType} (lead ${lead?.id}) failed: ${e?.message}`);
  }
}
