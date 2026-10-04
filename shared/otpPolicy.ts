// Kebijakan OTP portal pelanggan - logika murni, unit-tested (audit 2026-10-04).
//
// Prinsip anti-enumeration: respons publik request-otp SELALU sama (pesan seragam),
// apa pun kondisinya (ID tak dikenal / tanpa HP / kuota habis) - bedanya hanya efek
// internal (kirim atau tidak). Verifikasi memakai SATU pesan gagal generik supaya
// penyerang tidak bisa membedakan "ID tidak terdaftar" dari "kode salah".

export const OTP_UNIFORM_MESSAGE =
  "Jika Customer ID terdaftar, kode OTP dikirim ke nomor WhatsApp yang terdaftar. Cek WhatsApp Anda.";

export const OTP_GENERIC_FAIL =
  "Kode OTP salah, kedaluwarsa, atau sesi tidak valid. Minta kode baru bila perlu.";

export const OTP_THROTTLE_MESSAGE =
  "Terlalu banyak permintaan. Tunggu beberapa menit lalu coba lagi.";

export interface OtpRequestInput {
  customerExists: boolean;
  hasPhone: boolean;
  /** Jumlah request OTP customer ini dalam window (0 bila customer tidak ada). */
  recentCustomerRequests: number;
  maxPerWindow: number;
}

export type OtpRequestDecision =
  | { action: "send" }
  | { action: "silent_drop"; reason: "unknown_customer" | "no_phone" | "customer_quota" };

export function decideOtpRequest(i: OtpRequestInput): OtpRequestDecision {
  if (!i.customerExists) return { action: "silent_drop", reason: "unknown_customer" };
  if (!i.hasPhone) return { action: "silent_drop", reason: "no_phone" };
  if (i.recentCustomerRequests >= i.maxPerWindow) {
    // Kuota DB per-customer = backstop diam-diam; throttle publik yang kelihatan
    // (429) terjadi lebih awal di limiter per-ID/per-IP yang berlaku seragam.
    return { action: "silent_drop", reason: "customer_quota" };
  }
  return { action: "send" };
}

export interface OtpVerifyInput {
  otpFound: boolean;
  status?: string; // pending | verified | locked | expired
  expiresAtMs?: number;
  nowMs: number;
  attempts?: number;
  maxAttempts: number;
  codeMatches?: boolean;
}

export type OtpVerifyDecision =
  | { outcome: "success" }
  | { outcome: "reject"; markExpired: boolean; incrementAttempts: boolean; lock: boolean };

const REJECT = { outcome: "reject" as const, markExpired: false, incrementAttempts: false, lock: false };

export function decideOtpVerify(i: OtpVerifyInput): OtpVerifyDecision {
  if (!i.otpFound) return { ...REJECT };
  if (i.status === "verified" || i.status === "locked") return { ...REJECT };
  const expired = i.status === "expired" || (i.expiresAtMs !== undefined && i.expiresAtMs < i.nowMs);
  if (expired) return { ...REJECT, markExpired: i.status === "pending" };
  if (!i.codeMatches) {
    const nextAttempts = (i.attempts ?? 0) + 1;
    return { ...REJECT, incrementAttempts: true, lock: nextAttempts >= i.maxAttempts };
  }
  return { outcome: "success" };
}
