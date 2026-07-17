/** Pure: ekstrak referensi campaign/ad set/ad dari payload webhook lead iklan. No I/O.
 *  Best-effort: ambil dari key umum (snake_case + camelCase + alias adgroup). */

export interface AdRef { externalId?: string; name?: string }
export interface AdRefs { campaign?: AdRef; adSet?: AdRef; adName?: AdRef }

function str(v: any): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
}

/** Pilih nilai pertama yang non-empty dari beberapa key kandidat. */
function pick(obj: any, keys: string[]): string | undefined {
  for (const k of keys) {
    const s = str(obj?.[k]);
    if (s) return s;
  }
  return undefined;
}

function ref(externalId?: string, name?: string): AdRef | undefined {
  if (!externalId && !name) return undefined;
  const r: AdRef = {};
  if (externalId) r.externalId = externalId;
  if (name) r.name = name;
  return r;
}

export function extractAdRefs(payload: any): AdRefs {
  if (!payload || typeof payload !== "object") return {};
  const out: AdRefs = {};
  const campaign = ref(pick(payload, ["campaign_id", "campaignId"]), pick(payload, ["campaign_name", "campaignName"]));
  const adSet = ref(pick(payload, ["adset_id", "adSetId", "adgroup_id", "adGroupId"]), pick(payload, ["adset_name", "adSetName", "adgroup_name", "adGroupName"]));
  const adName = ref(pick(payload, ["ad_id", "adId"]), pick(payload, ["ad_name", "adName"]));
  if (campaign) out.campaign = campaign;
  if (adSet) out.adSet = adSet;
  if (adName) out.adName = adName;
  return out;
}
