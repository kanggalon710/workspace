import { storage } from "./storage.js";
import { extractAdRefs } from "../shared/adCampaignFields.js";

export interface ResolvedAdFields { campaign: string | null; adSet: string | null; adName: string | null }

/** Resolve campaign/adSet/adName dari payload webhook. campaign di-resolve ke nama ramah via
 *  registry ad_campaigns (externalId match); fallback nama payload → id → null. adSet/adName:
 *  nama payload → id → null (registry hanya level-campaign). Best-effort: NEVER throws.
 *  MUST dipanggil di dalam withMitra(...) agar getAdCampaignByExternalId ter-scope tenant. */
export async function resolveAdFields(platform: string, payload: any): Promise<ResolvedAdFields> {
  const refs = extractAdRefs(payload);
  let campaign: string | null = null;
  if (refs.campaign) {
    let resolvedName: string | undefined;
    if (refs.campaign.externalId) {
      try {
        const row = await storage.getAdCampaignByExternalId(platform, refs.campaign.externalId);
        resolvedName = row?.campaignName;
      } catch { /* best-effort */ }
    }
    campaign = resolvedName ?? refs.campaign.name ?? refs.campaign.externalId ?? null;
  }
  const adSet = refs.adSet ? (refs.adSet.name ?? refs.adSet.externalId ?? null) : null;
  const adName = refs.adName ? (refs.adName.name ?? refs.adName.externalId ?? null) : null;
  return { campaign, adSet, adName };
}
