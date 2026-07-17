/** Pure helpers jadwal check-in rutin (FR-8xx) — no I/O, unit-testable.
 *  Konvensi hari: ISO 1=Senin … 7=Minggu (sesuai urutan UI Senin–Minggu). */

/** JS Date.getDay() (0=Minggu..6=Sabtu) → ISO DOW (1=Senin..7=Minggu). */
export function isoDow(d: Date): number {
  return ((d.getDay() + 6) % 7) + 1;
}

/** Tanggal lokal YYYY-MM-DD (jam server = WIB di produksi). */
export function localDateStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "HH:mm" lokal dari Date. */
export function localTimeStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parse sendDays JSON → array ISO DOW valid [1..7], dedupe + sort. Invalid → []. */
export function parseSendDays(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const a = JSON.parse(raw);
    if (!Array.isArray(a)) return [];
    const out = [...new Set(a.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7))];
    return out.sort((x, y) => x - y);
  } catch {
    return [];
  }
}

/** Validasi "HH:mm" 24 jam. */
export function isValidSendTime(t: unknown): t is string {
  return typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

/** Apakah pertanyaan harus dikirim SEKARANG oleh worker tick?
 *  Aturan: aktif · hari ini termasuk sendDays · waktu sekarang >= sendTime
 *  · belum terkirim hari ini (lastSentDate != hari ini).
 *  Pakai ">=" (bukan "==") supaya tahan worker restart/downtime — instance hari itu
 *  tetap terkirim saat worker bangun lagi, dan dedup harian mencegah kirim dobel. */
export function shouldSendNow(
  q: { isActive: number | boolean; sendDays: string | null; sendTime: string | null; lastSentDate: string | null },
  now: Date,
): boolean {
  const active = typeof q.isActive === "boolean" ? q.isActive : q.isActive === 1;
  if (!active) return false;
  if (!isValidSendTime(q.sendTime)) return false;
  const days = parseSendDays(q.sendDays);
  if (!days.includes(isoDow(now))) return false;
  if (localTimeStr(now) < q.sendTime) return false;
  return q.lastSentDate !== localDateStr(now);
}

/** Rekap tingkat pengisian satu instance: jawaban masuk ÷ penerima. */
export function completionRate(recipientCount: number, responseCount: number): number {
  if (recipientCount <= 0) return 0;
  return Math.min(100, Math.round((responseCount / recipientCount) * 100));
}

export const DOW_LABELS: Record<number, string> = {
  1: "Senin", 2: "Selasa", 3: "Rabu", 4: "Kamis", 5: "Jumat", 6: "Sabtu", 7: "Minggu",
};
