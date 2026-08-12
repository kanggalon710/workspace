import { formatRupiah } from "@shared/currency";

export type Tab = "summary" | "discounts" | "leaderboard" | "referrals" | "points";

// Sahabat level config - sesuai program JABNET Sahabat
export const LEVEL_CFG: Record<string, { label: string; color: string; bg: string; threshold: number; hex: string }> = {
  new:       { label: "Pelanggan",  color: "text-slate-700 dark:text-slate-300",  bg: "bg-slate-100 dark:bg-slate-900",     threshold: 0,   hex: "#64748b" },
  perunggu:  { label: "Perunggu",   color: "text-amber-800 dark:text-amber-200",  bg: "bg-amber-100 dark:bg-amber-950/40",  threshold: 5,   hex: "#b45309" },
  perak:     { label: "Perak",      color: "text-slate-700 dark:text-slate-200",  bg: "bg-slate-200 dark:bg-slate-800/40",  threshold: 10,  hex: "#94a3b8" },
  emas:      { label: "Emas",       color: "text-yellow-700 dark:text-yellow-200",bg: "bg-yellow-100 dark:bg-yellow-950/40",threshold: 20,  hex: "#f59e0b" },
  platinum:  { label: "Platinum",   color: "text-blue-700 dark:text-blue-200",    bg: "bg-blue-100 dark:bg-blue-950/40",    threshold: 30,  hex: "#3b82f6" },
  berlian:   { label: "Berlian",    color: "text-purple-700 dark:text-purple-200",bg: "bg-purple-100 dark:bg-purple-950/40",threshold: 50,  hex: "#a855f7" },
  ambassador:{ label: "Ambassador", color: "text-pink-700 dark:text-pink-200",    bg: "bg-pink-100 dark:bg-pink-950/40",    threshold: 100, hex: "#ec4899" },
};

// Legacy tenure badge - display sekunder
export const BADGE_CFG: Record<string, { label: string; color: string; bg: string }> = {
  tetangga: { label: "<1 thn", color: "text-slate-700 dark:text-slate-300", bg: "bg-slate-100 dark:bg-slate-900" },
  keluarga: { label: "1-3 thn", color: "text-sky-700 dark:text-sky-300", bg: "bg-sky-50 dark:bg-sky-950/40" },
  sahabat:  { label: "3-5 thn", color: "text-amber-700 dark:text-amber-300", bg: "bg-amber-50 dark:bg-amber-950/40" },
  abadi:    { label: "5+ thn",  color: "text-yellow-700 dark:text-yellow-300", bg: "bg-yellow-100 dark:bg-yellow-950/40" },
};

export const SOURCE_LABELS: Record<string, string> = {
  ref_voucher_50k:           "Voucher Indomaret 50K (ref sukses)",
  ref_bill_75k:              "Potongan Tagihan 75K (ref)",
  ref_speed_boost_5mbps:     "Upgrade +5 Mbps (3 ref)",
  referral_referee_welcome:  "Welcome 7 hari (referee baru)",
  sahabat_perunggu:          " Milestone Perunggu (5 ref)",
  sahabat_perak:             " Milestone Perak (10 ref)",
  sahabat_emas:              " Milestone Emas (20 ref)",
  sahabat_platinum:          " Milestone Platinum (30 ref)",
  sahabat_berlian:           " Milestone Berlian (50 ref)",
  // Legacy (tidak di-generate lagi)
  streak_3: "Streak 3 Bulan (legacy)",
  streak_6: "Streak 6 Bulan (legacy)",
  streak_12: " Anniversary (legacy)",
  streak_24: " Pelanggan Setia (legacy)",
  referral_referrer: "Referral Pengundang (legacy)",
  referral_referee: "Referral Referee (legacy)",
  seasonal: "Bonus Musiman",
};

export function fmtRewardValue(d: any): string {
  if (d.discountType === "percent") return `${d.discountValue}%`;
  if (d.discountType === "free_days") {
    const v = Number(d.discountValue);
    if (v >= 365) return `${Math.round(v / 365)} thn gratis`;
    if (v >= 30) return `${Math.round(v / 30)} bln gratis`;
    return `${v} hari gratis`;
  }
  if (d.discountType === "voucher_indomaret") return `Rp ${Number(d.discountValue).toLocaleString("id-ID")}`;
  if (d.discountType === "cash_bonus") return `Rp ${Number(d.discountValue).toLocaleString("id-ID")}`;
  if (d.discountType === "speed_upgrade") return `+${d.discountValue} Mbps`;
  return String(d.discountValue);
}

export const REFERRAL_STATUS_LABELS: Record<string, string> = {
  invited: "Diundang",
  registered: "Terdaftar",
  rewarded: "Reward Diberikan",
  expired: "Expired",
};

export function fmtRp(n: number | null | undefined) {
  return formatRupiah(n, "-");
}
export function fmtDate(iso: string | null | undefined) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}
export function fmtRelative(iso: string | null | undefined) {
  if (!iso) return "-";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "baru saja";
  if (mins < 60) return `${mins}m lalu`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}j lalu`;
  return `${Math.floor(h / 24)}h lalu`;
}
