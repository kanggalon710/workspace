import { useState, useEffect, useMemo, useRef } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { WifiOff, Activity, TrendingUp, Signal, Globe } from "lucide-react";
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import { LoadingState, BigStat } from "./shared";

export function fmtBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "0 MB";
  const KB = 1024, MB = KB * 1024, GB = MB * 1024, TB = GB * 1024;
  if (bytes >= TB) return `${(bytes / TB).toFixed(2)} TB`;
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(2)} MB`;
  return `${(bytes / KB).toFixed(0)} KB`;
}

/** Format MB → "XXX MB" / "X.XX GB" / "X.XX TB" */
export function fmtMB(mb: number): string {
  if (!mb || mb < 0) return "0 MB";
  if (mb >= 1_000_000) return `${(mb / 1_000_000).toFixed(2)} TB`;
  if (mb >= 1000) return `${(mb / 1000).toFixed(2)} GB`;
  return `${Math.round(mb)} MB`;
}

/** Format bytes/sec → "XX.X Mbps" atau "X.XX Gbps" (network rate) */
export function fmtSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec < 0) return "0 bps";
  const bitsPerSec = bytesPerSec * 8;
  if (bitsPerSec >= 1_000_000_000) return `${(bitsPerSec / 1_000_000_000).toFixed(2)} Gbps`;
  if (bitsPerSec >= 1_000_000) return `${(bitsPerSec / 1_000_000).toFixed(2)} Mbps`;
  if (bitsPerSec >= 1000) return `${(bitsPerSec / 1000).toFixed(0)} Kbps`;
  return `${Math.round(bitsPerSec)} bps`;
}

export function TrafficTab({ traffic, pppoeOnline, apiFetch }: any) {
  // - Live realtime polling -
  const [livePrev, setLivePrev] = useState<{ ts: number; bytesIn: number; bytesOut: number } | null>(null);
  const [liveNow, setLiveNow] = useState<{ ts: number; bytesIn: number; bytesOut: number } | null>(null);
  // Ref menyimpan nilai terbaru supaya closure di interval tidak stale
  const liveNowRef = useRef<{ ts: number; bytesIn: number; bytesOut: number } | null>(null);

  useEffect(() => {
    if (!pppoeOnline || !apiFetch) return;
    let mounted = true;
    let interval: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      try {
        const r = await apiFetch("/api/portal/traffic/live");
        if (!mounted || !r?.online) return;
        const next = { ts: r.ts as number, bytesIn: r.bytesIn as number, bytesOut: r.bytesOut as number };
        if (liveNowRef.current) setLivePrev(liveNowRef.current);
        liveNowRef.current = next;
        setLiveNow(next);
      } catch {}
    };

    const start = () => {
      if (interval) return;
      tick();
      interval = setInterval(tick, 3000);
    };
    const stop = () => {
      if (interval) { clearInterval(interval); interval = null; }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      mounted = false;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pppoeOnline]);

  // Compute realtime speed dari delta bytes / delta seconds
  const liveSpeed = useMemo(() => {
    if (!livePrev || !liveNow) return null;
    const dt = (liveNow.ts - livePrev.ts) / 1000;
    if (dt <= 0) return null;
    const dlBytesPerSec = Math.max(0, (liveNow.bytesIn - livePrev.bytesIn) / dt);
    const ulBytesPerSec = Math.max(0, (liveNow.bytesOut - livePrev.bytesOut) / dt);
    return { dl: dlBytesPerSec, ul: ulBytesPerSec, age: Date.now() - liveNow.ts };
  }, [livePrev, liveNow]);

  // NOTE: Semua useMemo WAJIB di-call sebelum early return (Rules of Hooks).
  const snapshots: any[] = traffic?.snapshots ?? [];
  const chartData = useMemo(() => snapshots.map((s) => ({
    time: new Date(s.timestamp).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
    download: Math.round((s.bytesIn ?? 0) / 1024 / 1024),
    upload: Math.round((s.bytesOut ?? 0) / 1024 / 1024),
  })), [snapshots]);

  // Early return - SETELAH semua hooks dipanggil
  if (!traffic) return <LoadingState />;
  const live = traffic.live ?? {};

  const totalDownMB = chartData.reduce((a, b) => a + b.download, 0);
  const totalUpMB = chartData.reduce((a, b) => a + b.upload, 0);
  // Decide chart Y-axis unit: kalau max > 1000 MB pakai GB
  const maxValueMB = chartData.reduce((m, d) => Math.max(m, d.download, d.upload), 0);
  const useGbAxis = maxValueMB >= 1000;

  return (
    <div className="space-y-4 md:space-y-5">
      {/* LIVE SPEED - realtime current bandwidth */}
      {pppoeOnline && (
        <Card className="overflow-hidden">
          <CardContent className="p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Live Speed
                </span>
                <span className="text-[10px] text-muted-foreground">· update tiap 3 detik</span>
              </div>
              {liveSpeed && liveSpeed.age < 10_000 ? (
                <span className="text-[10px] text-success font-semibold uppercase tracking-wider">● Live</span>
              ) : (
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">menunggu data...</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 md:gap-4">
              <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-success/30">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-success font-semibold">
                  <TrendingUp className="h-3 w-3" /> Download
                </div>
                <div className="text-2xl md:text-3xl font-bold text-success tabular-nums mt-1">
                  {liveSpeed ? fmtSpeed(liveSpeed.dl) : "-"}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-gradient-to-br from-amber-50 to-amber-100/50 border border-warning/30">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-warning font-semibold">
                  <TrendingUp className="h-3 w-3 rotate-180" /> Upload
                </div>
                <div className="text-2xl md:text-3xl font-bold text-warning tabular-nums mt-1">
                  {liveSpeed ? fmtSpeed(liveSpeed.ul) : "-"}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sesi info */}
      <Card>
        <CardContent className="p-5 md:p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-2 h-2 rounded-full ${pppoeOnline ? "bg-success animate-pulse" : "bg-muted"}`} />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Sesi Saat Ini
                </span>
              </div>
              <div className={`text-xl font-bold ${pppoeOnline ? "text-success" : "text-muted-foreground"}`}>
                {pppoeOnline ? "Tersambung" : "Tidak Online"}
              </div>
            </div>
            {pppoeOnline && live.uptime && (
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Uptime</div>
                <div className="text-sm font-semibold font-mono">{live.uptime}</div>
              </div>
            )}
          </div>

          {pppoeOnline ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <BigStat icon={<Globe className="h-4 w-4" />} label="IP Address" value={live.ipAddress || "-"} mono tone="sky" />
              <BigStat icon={<Signal className="h-4 w-4" />} label="Router" value={live.routerName || "-"} tone="sky" />
              <BigStat icon={<TrendingUp className="h-4 w-4" />} label="Download Sesi" value={fmtBytes(live.bytesIn ?? 0)} tone="emerald" />
              <BigStat icon={<TrendingUp className="h-4 w-4 rotate-180" />} label="Upload Sesi" value={fmtBytes(live.bytesOut ?? 0)} tone="amber" />
            </div>
          ) : (
            <EmptyState icon={WifiOff} title="Tidak ada sesi aktif" description="Koneksi PPPoE belum terdaftar. Cek modem atau hubungi support." />
          )}
        </CardContent>
      </Card>

      {/* Chart 24h */}
      <Card>
        <CardContent className="p-5 md:p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Traffic 24 Jam</div>
              <div className="text-sm text-muted-foreground mt-0.5">
                Pemakaian tercatat setiap 15 menit
              </div>
            </div>
            <div className="flex gap-4 text-right">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-success">Download</div>
                <div className="text-sm font-bold font-mono">{fmtMB(totalDownMB)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-warning">Upload</div>
                <div className="text-sm font-bold font-mono">{fmtMB(totalUpMB)}</div>
              </div>
            </div>
          </div>

          {chartData.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="Belum ada data traffic"
              description="Data akan tersedia setelah beberapa snapshot tercatat (setiap 15 menit)."
            />
          ) : (
            <div className="h-64 -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dl" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="ul" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="time" fontSize={10} stroke="hsl(var(--muted-foreground))" tickLine={false} />
                  <YAxis
                    fontSize={10}
                    stroke="hsl(var(--muted-foreground))"
                    tickFormatter={(v) => useGbAxis ? `${(v / 1000).toFixed(1)}G` : `${v}M`}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: any) => fmtMB(Number(v))}
                  />
                  <Area type="monotone" dataKey="download" stroke="#10b981" strokeWidth={2} fill="url(#dl)" name="Download" />
                  <Area type="monotone" dataKey="upload" stroke="#f59e0b" strokeWidth={2} fill="url(#ul)" name="Upload" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =====================================================================
// BILLING TAB
// =====================================================================
