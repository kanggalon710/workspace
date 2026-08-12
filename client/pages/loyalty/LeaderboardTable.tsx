import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trophy, Loader2, Search, Printer } from "lucide-react";
import { LEVEL_CFG, BADGE_CFG, fmtRp } from "./shared";

export function LeaderboardTable({ leaderboard, loading, onKit, onOpenDetail }: any) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if (!search.trim() || !leaderboard) return leaderboard ?? [];
    const q = search.toLowerCase();
    return leaderboard.filter((l: any) =>
      l.customerName?.toLowerCase().includes(q)
      || l.sahabatCode?.toLowerCase().includes(q)
      || l.customerBillingId?.toLowerCase().includes(q)
    );
  }, [leaderboard, search]);
  const data = filtered;
  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!leaderboard?.length) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <Trophy className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
          <div className="font-semibold text-sm">Belum ada data Sahabat</div>
          <div className="text-xs text-muted-foreground mt-1">Data akan tampil setelah ada referral sukses pertama</div>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Cari nama / kode Sahabat / ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9 text-sm"
        />
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-left text-muted-foreground border-b">
            <tr>
              <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px] w-12">Rank</th>
              <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Pelanggan</th>
              <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Kode</th>
              <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px] text-right">Ref Sukses</th>
              <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Level</th>
              <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px] text-right">Streak</th>
              <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px] text-right">On-time/Telat</th>
              <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Tenure</th>
              <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px] text-right">Tagihan</th>
              <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {data.map((l: any, i: number) => {
              const lvl = LEVEL_CFG[l.sahabatLevel ?? "new"] ?? LEVEL_CFG.new;
              const tn = BADGE_CFG[l.tenureBadge] ?? BADGE_CFG.tetangga;
              return (
                <tr key={l.customerId} className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => onOpenDetail?.(l.customerId)}>
                  <td className="py-3 px-4">
                    {i < 3 ? (
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-sm"
                        style={{ background: i === 0 ? "#f59e0b" : i === 1 ? "#94a3b8" : "#b45309" }}
                      >
                        {i + 1}
                      </div>
                    ) : (
                      <span className="text-muted-foreground font-mono pl-2">#{i + 1}</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-sm">{l.customerName}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">#{l.customerBillingId}</div>
                  </td>
                  <td className="py-3 px-4">
                    {l.sahabatCode ? (
                      <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold">
                        {l.sahabatCode}
                      </span>
                    ) : <span className="text-muted-foreground">-</span>}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-base font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">{l.totalSuccessfulReferrals}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${lvl.bg} ${lvl.color}`}>
                      {lvl.label}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-orange-600 tabular-nums">{l.currentStreak}</td>
                  <td className="py-3 px-4 text-right text-[11px] tabular-nums">
                    <span className="text-emerald-600">{l.totalOnTime}</span>
                    <span className="text-muted-foreground mx-0.5">/</span>
                    <span className="text-rose-500">{l.totalLate}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                      <span className="font-mono">{l.tenureMonths}m</span>
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums text-[11px] font-medium">{fmtRp(l.billingPrice)}</td>
                  <td className="py-3 px-4">
                    <Button size="sm" variant="ghost" className="h-7 text-[10px] gap-1" onClick={(e) => { e.stopPropagation(); onKit?.(l); }}>
                      <Printer className="h-3 w-3" /> Kit
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
    </div>
  );
}

