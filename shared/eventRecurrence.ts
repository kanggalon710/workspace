/** Pure helpers recurrence event jadwal tim (FR-701) + builder iCal (FR-703).
 *  Recurrence disimpan sebagai JSON sederhana — RRULE penuh tidak dibutuhkan Fase 2. */

export type EventFreq = "none" | "daily" | "weekly" | "monthly";

export interface EventRecurrence {
  freq: EventFreq;
  /** setiap n hari/minggu/bulan (default 1) */
  interval: number;
  /** ISO date terakhir pengulangan (inklusif), null = tanpa akhir */
  until: string | null;
}

export const RECURRENCE_LABELS: Record<EventFreq, string> = {
  none: "Tidak diulang",
  daily: "Harian",
  weekly: "Mingguan",
  monthly: "Bulanan",
};

const FREQS = new Set<EventFreq>(["none", "daily", "weekly", "monthly"]);

/** Parse JSON recurrence dari DB → bentuk normal. NULL/invalid → none. */
export function parseEventRecurrence(raw: string | null | undefined): EventRecurrence {
  const none: EventRecurrence = { freq: "none", interval: 1, until: null };
  if (!raw) return none;
  try {
    const o = JSON.parse(raw);
    const freq: EventFreq = FREQS.has(o?.freq) ? o.freq : "none";
    if (freq === "none") return none;
    const interval = Number.isInteger(o?.interval) && o.interval >= 1 && o.interval <= 365 ? o.interval : 1;
    const until = typeof o?.until === "string" && o.until.trim() ? o.until : null;
    return { freq, interval, until };
  } catch {
    return none;
  }
}

/** Ekspansi occurrence sebuah event dalam rentang [rangeStart, rangeEnd] (untuk grid kalender).
 *  Cap melindungi dari loop tak berujung. Durasi tiap occurrence = durasi event asal. */
export function expandOccurrences(
  ev: { startAt: string; endAt: string; recurrence: string | null },
  rangeStart: Date,
  rangeEnd: Date,
  cap = 200,
): Array<{ start: Date; end: Date }> {
  const start = new Date(ev.startAt);
  const end = new Date(ev.endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  const durMs = Math.max(0, end.getTime() - start.getTime());
  const rec = parseEventRecurrence(ev.recurrence);
  const out: Array<{ start: Date; end: Date }> = [];
  const untilMs = rec.until ? new Date(`${rec.until}T23:59:59`).getTime() : Infinity;

  const pushIfInRange = (s: Date) => {
    const e = new Date(s.getTime() + durMs);
    if (e.getTime() >= rangeStart.getTime() && s.getTime() <= rangeEnd.getTime()) {
      out.push({ start: s, end: e });
    }
  };

  if (rec.freq === "none") {
    pushIfInRange(start);
    return out;
  }

  let cursor = new Date(start);
  for (let i = 0; i < cap; i++) {
    if (cursor.getTime() > rangeEnd.getTime() || cursor.getTime() > untilMs) break;
    pushIfInRange(cursor);
    if (rec.freq === "daily") {
      cursor = new Date(cursor.getTime() + rec.interval * 86400_000);
    } else if (rec.freq === "weekly") {
      cursor = new Date(cursor.getTime() + rec.interval * 7 * 86400_000);
    } else {
      // monthly: tanggal-yang-sama tiap n bulan; bulan tanpa tanggal tsb dilewati
      // (mis. 31 Jan → 31 Mar; Feb dilewati) — semantik "same day-of-month".
      // Index bulan di-anchor eksplisit supaya rollover Date (31 Feb → 3 Mar) tidak
      // menggeser bulan basis dan melompati bulan yang valid.
      const dom = start.getDate();
      let monthIndex = cursor.getFullYear() * 12 + cursor.getMonth();
      let found = false;
      for (let j = 0; j < cap; j++) {
        monthIndex += rec.interval;
        const cand = new Date(Math.floor(monthIndex / 12), monthIndex % 12, dom,
          start.getHours(), start.getMinutes(), 0, 0);
        if (cand.getTime() > rangeEnd.getTime() || cand.getTime() > untilMs) { found = false; break; }
        if (cand.getDate() !== dom) continue;   // bulan tanpa tanggal tsb → skip
        cursor = cand; found = true; break;
      }
      if (!found) break;
    }
  }
  return out;
}

// ── iCal builder (FR-703) ──────────────────────────────────────────────────

/** Escape teks sesuai RFC 5545. */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function icsDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** RRULE dari recurrence sederhana (kalender eksternal meng-handle pengulangan sendiri). */
export function toIcsRRule(rec: EventRecurrence): string | null {
  if (rec.freq === "none") return null;
  const freq = rec.freq === "daily" ? "DAILY" : rec.freq === "weekly" ? "WEEKLY" : "MONTHLY";
  const parts = [`FREQ=${freq}`];
  if (rec.interval > 1) parts.push(`INTERVAL=${rec.interval}`);
  if (rec.until) parts.push(`UNTIL=${rec.until.replace(/-/g, "")}T235959Z`);
  return parts.join(";");
}

export interface IcsEventInput {
  id: number;
  title: string;
  startAt: string;
  endAt: string;
  recurrence: string | null;
  notes?: string | null;
  teamName?: string | null;
}

/** Bangun dokumen iCalendar (VCALENDAR) untuk feed webcal per tim (FR-703). */
export function buildTeamCalendarIcs(calName: string, events: IcsEventInput[], now: Date): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//JABNET Workspace//Teamspace//ID",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(calName)}`,
  ];
  const stamp = icsDate(now);
  for (const ev of events) {
    const start = new Date(ev.startAt);
    const end = new Date(ev.endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:teamspace-event-${ev.id}@workspace.jabnet.id`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART:${icsDate(start)}`);
    lines.push(`DTEND:${icsDate(end)}`);
    lines.push(`SUMMARY:${icsEscape(ev.title)}`);
    if (ev.notes) lines.push(`DESCRIPTION:${icsEscape(ev.notes)}`);
    const rrule = toIcsRRule(parseEventRecurrence(ev.recurrence));
    if (rrule) lines.push(`RRULE:${rrule}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  // RFC 5545: CRLF line endings
  return lines.join("\r\n") + "\r\n";
}
