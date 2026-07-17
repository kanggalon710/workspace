/** Canonical lead-source registry. Single source of truth for normalisasi + label.
 *  Tidak mengubah nilai `source` yang tersimpan — hanya dipakai saat matching rule + label UI. */

export type CanonicalLeadSource =
  | "canvassing" | "prospect_finder" | "coverage_check"
  | "meta_leads" | "tiktok_leads" | "referral" | "inbound" | "pipeline" | "other";

/** Alias mentah (lowercased) → kanonik. Mencakup nilai yang BENAR-BENAR ditulis kode hari ini
 *  (landing_page, meta_ads, tiktok_ads) plus variasi wajar. */
const ALIASES: Record<string, CanonicalLeadSource> = {
  canvassing: "canvassing",
  prospect_finder: "prospect_finder", finder: "prospect_finder",
  coverage_check: "coverage_check", landing_page: "coverage_check", landing: "coverage_check",
  meta_leads: "meta_leads", meta_ads: "meta_leads", meta: "meta_leads", facebook: "meta_leads",
  tiktok_leads: "tiktok_leads", tiktok_ads: "tiktok_leads", tiktok: "tiktok_leads",
  referral: "referral",
  inbound: "inbound",
  pipeline: "pipeline",
};

export function canonicalLeadSource(raw: string | null | undefined): CanonicalLeadSource {
  return ALIASES[String(raw ?? "").trim().toLowerCase()] ?? "other";
}

export const LEAD_SOURCE_LABELS: Record<CanonicalLeadSource, string> = {
  canvassing: "Canvassing",
  prospect_finder: "Prospect Finder",
  coverage_check: "Coverage Check",
  meta_leads: "Meta Lead Ads",
  tiktok_leads: "TikTok Lead Ads",
  referral: "Referral",
  inbound: "Inbound",
  pipeline: "Dari Pipeline",
  other: "Lainnya",
};

/** Opsi untuk filter source di sub-form rule. */
export const LEAD_SOURCE_OPTIONS: { value: CanonicalLeadSource; label: string }[] =
  (Object.keys(LEAD_SOURCE_LABELS) as CanonicalLeadSource[]).map((value) => ({ value, label: LEAD_SOURCE_LABELS[value] }));
