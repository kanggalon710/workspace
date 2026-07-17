export type Period = "daily" | "weekly" | "monthly" | "quarterly";

/** A time bucket. `start`/`end` are ISO strings; range is [start, end). */
export interface Bucket {
  key: string;
  start: string;
  end: string;
}

const DEFAULT_COUNT: Record<Period, number> = { daily: 30, weekly: 12, monthly: 12, quarterly: 8 };

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Build contiguous buckets ending at `to` (or `now`), going back either
 * DEFAULT_COUNT[period] buckets, or enough to cover `from` when given.
 */
export function computePeriodBuckets(period: Period, from?: string, to?: string, now: Date = new Date()): Bucket[] {
  const anchor = to ? new Date(to) : now;
  const buckets: Bucket[] = [];

  const bucketOf = (d: Date): Bucket => {
    if (period === "daily") {
      const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const e = new Date(s); e.setDate(e.getDate() + 1);
      return { key: dayKey(s), start: s.toISOString(), end: e.toISOString() };
    }
    if (period === "weekly") {
      const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const e = new Date(s); e.setDate(e.getDate() + 7);
      return { key: dayKey(s), start: s.toISOString(), end: e.toISOString() };
    }
    if (period === "monthly") {
      const s = new Date(d.getFullYear(), d.getMonth(), 1);
      const e = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      return { key: `${s.getFullYear()}-${pad(s.getMonth() + 1)}`, start: s.toISOString(), end: e.toISOString() };
    }
    const q = Math.floor(d.getMonth() / 3);
    const s = new Date(d.getFullYear(), q * 3, 1);
    const e = new Date(d.getFullYear(), q * 3 + 3, 1);
    return { key: `${s.getFullYear()}-Q${q + 1}`, start: s.toISOString(), end: e.toISOString() };
  };

  const step = (d: Date): Date => {
    const x = new Date(d);
    if (period === "daily") x.setDate(x.getDate() - 1);
    else if (period === "weekly") x.setDate(x.getDate() - 7);
    else if (period === "monthly") x.setMonth(x.getMonth() - 1);
    else x.setMonth(x.getMonth() - 3);
    return x;
  };

  const fromTime = from ? new Date(from).getTime() : null;
  const maxCount = fromTime === null ? DEFAULT_COUNT[period] : 240;
  let cursor = anchor;
  for (let i = 0; i < maxCount; i++) {
    const b = bucketOf(cursor);
    buckets.unshift(b);
    if (fromTime !== null && new Date(b.start).getTime() <= fromTime) break;
    cursor = step(new Date(new Date(b.start).getTime()));
  }
  return fromTime === null ? buckets : buckets.filter((b) => new Date(b.end).getTime() > fromTime);
}

export interface BucketValue { key: string; value: number; }

/** Count items whose timestamp falls in each bucket. */
export function assignCountToBuckets<T>(items: T[], getTime: (i: T) => string | null | undefined, buckets: Bucket[]): BucketValue[] {
  const out = buckets.map((b) => ({ key: b.key, value: 0, _s: new Date(b.start).getTime(), _e: new Date(b.end).getTime() }));
  for (const it of items) {
    const raw = getTime(it);
    if (!raw) continue;
    const t = new Date(raw).getTime();
    if (Number.isNaN(t)) continue;
    for (const b of out) if (t >= b._s && t < b._e) { b.value++; break; }
  }
  return out.map(({ key, value }) => ({ key, value }));
}

/** For point-in-time series: latest sample value within each bucket, carried
 * forward over empty buckets. `priorValue` seeds the value before the window. */
export function lastValueInBuckets<T>(samples: T[], getTime: (s: T) => string, getValue: (s: T) => number, buckets: Bucket[], priorValue = 0): BucketValue[] {
  const sorted = [...samples].sort((a, b) => new Date(getTime(a)).getTime() - new Date(getTime(b)).getTime());
  let lastKnown = priorValue;
  return buckets.map((b) => {
    const s = new Date(b.start).getTime(), e = new Date(b.end).getTime();
    for (const smp of sorted) {
      const t = new Date(getTime(smp)).getTime();
      if (t >= s && t < e) lastKnown = getValue(smp);
    }
    return { key: b.key, value: lastKnown };
  });
}

/** Percentage change vs baseline. Returns null when baseline is null/0. */
export function deltaPct(value: number, prev: number | null | undefined): number | null {
  if (prev === null || prev === undefined || prev === 0) return null;
  return Math.round(((value - prev) / prev) * 1000) / 10;
}

export interface ExecFlagInput {
  mrr: number;
  revenueAtRisk: number;
  isolirCount: number;
  newActivationsDeltaPct: number | null;
  recoveryPct: number | null;
}

function rupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

export function buildExecutiveFlags(i: ExecFlagInput): { redFlags: string[]; greenLights: string[] } {
  const redFlags: string[] = [];
  const greenLights: string[] = [];

  const riskPct = i.mrr > 0 ? (i.revenueAtRisk / i.mrr) * 100 : 0;
  if (riskPct > 10) {
    redFlags.push(`Revenue at risk ${rupiah(i.revenueAtRisk)} (${riskPct.toFixed(1)}% MRR) dari ${i.isolirCount} pelanggan isolir`);
  }
  if (i.recoveryPct !== null && i.recoveryPct < 60) {
    redFlags.push(`Collection recovery rate rendah: ${i.recoveryPct.toFixed(0)}%`);
  }
  if (i.newActivationsDeltaPct !== null && i.newActivationsDeltaPct <= -10) {
    redFlags.push(`Aktivasi baru turun ${Math.abs(i.newActivationsDeltaPct).toFixed(0)}% vs periode lalu`);
  }
  if (i.newActivationsDeltaPct !== null && i.newActivationsDeltaPct >= 10) {
    greenLights.push(`Aktivasi baru +${i.newActivationsDeltaPct.toFixed(0)}% vs periode lalu`);
  }
  if (i.recoveryPct !== null && i.recoveryPct >= 85) {
    greenLights.push(`Collection recovery sehat: ${i.recoveryPct.toFixed(0)}%`);
  }
  return { redFlags, greenLights };
}
