/**
 * v4.2.17: ODP Heatmap & Repeat Issue Detector
 *
 * Tampilkan ODP dengan ≥3 tiket dalam N hari terakhir - kemungkinan masalah upstream/fisik.
 * Bukan customer-side issue. Action: dispatch senior tech untuk investigate ODP.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, MapPin, RefreshCw, Loader2, ArrowRight } from "lucide-react";

interface OdpRepeatIssue {
  odpId: number;
  odpName: string;
  ticketCount: number;
  activeCount: number;
  lastTicketAt: string;
  sampleTitles: string[];
}

export default function TicketHeatmapPage() {
  const [days, setDays] = useState("30");
  const [threshold, setThreshold] = useState("3");

  const { data: items = [], isLoading, refetch } = useQuery<OdpRepeatIssue[]>({
    queryKey: ["ticket-odp-repeat-issues", days, threshold],
    queryFn: () => api.get(`/tickets/odp-repeat-issues?days=${days}&threshold=${threshold}`),
    refetchInterval: 60_000,
  });

  const totalAffected = items.reduce((sum, i) => sum + i.ticketCount, 0);
  const totalActive = items.reduce((sum, i) => sum + i.activeCount, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">ODP Repeat Issues</h1>
          <p className="text-sm text-muted-foreground mt-1">
            ODP dengan tiket berulang - kemungkinan masalah fisik (splitter, kabel, ODP itu sendiri) bukan masalah customer-side.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {/* Filter row */}
      <Card>
        <CardContent className="py-3 px-4 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Periode:</span>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 hari</SelectItem>
                <SelectItem value="14">14 hari</SelectItem>
                <SelectItem value="30">30 hari</SelectItem>
                <SelectItem value="90">90 hari</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Threshold:</span>
            <Select value={threshold} onValueChange={setThreshold}>
              <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="2">≥ 2 tiket</SelectItem>
                <SelectItem value="3">≥ 3 tiket</SelectItem>
                <SelectItem value="5">≥ 5 tiket</SelectItem>
                <SelectItem value="10">≥ 10 tiket</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-3 text-xs">
            <span><strong className="text-rose-700 tabular-nums">{items.length}</strong> ODP flagged</span>
            <span className="text-muted-foreground/40">·</span>
            <span><strong className="text-foreground tabular-nums">{totalAffected}</strong> total tiket</span>
            <span className="text-muted-foreground/40">·</span>
            <span><strong className="text-orange-700 tabular-nums">{totalActive}</strong> masih aktif</span>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      {isLoading ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
            <span className="text-xs">Memuat heatmap...</span>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/40 grid place-items-center mx-auto mb-3">
              <MapPin className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="font-semibold text-sm">Tidak ada ODP yang flagged</div>
            <div className="text-xs text-muted-foreground mt-1">
              Tidak ada ODP dengan ≥{threshold} tiket dalam {days} hari terakhir. Jaringan stabil.
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const lastDate = new Date(item.lastTicketAt);
            const daysAgo = Math.floor((Date.now() - lastDate.getTime()) / 86400_000);
            const severity = item.activeCount >= 3 ? "critical" : item.ticketCount >= 5 ? "warning" : "moderate";
            return (
              <Card key={item.odpId}>
                <CardContent className="p-0">
                  <div className="flex items-stretch">
                    {/* Severity indicator strip */}
                    <div className={`w-1 ${severity === "critical" ? "bg-rose-500" : severity === "warning" ? "bg-amber-500" : "bg-yellow-400"}`} />
                    <div className="flex-1 px-4 py-3">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <AlertTriangle className={`w-4 h-4 ${severity === "critical" ? "text-rose-600" : severity === "warning" ? "text-amber-600" : "text-yellow-600"}`} />
                            <h3 className="font-bold text-base text-foreground">{item.odpName}</h3>
                            <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0 rounded bg-zinc-100 text-zinc-700">
                              ID #{item.odpId}
                            </span>
                            {severity === "critical" && (
                              <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0 rounded bg-rose-100 text-rose-700">
                                Critical
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
                            <span><strong className="text-foreground">{item.ticketCount}</strong> tiket</span>
                            {item.activeCount > 0 && <span className="text-rose-700"><strong>{item.activeCount}</strong> aktif sekarang</span>}
                            <span>·</span>
                            <span>terakhir {daysAgo === 0 ? "hari ini" : `${daysAgo}h lalu`}</span>
                          </div>
                          {item.sampleTitles.length > 0 && (
                            <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                              {item.sampleTitles.map((t, i) => (
                                <li key={i} className="flex items-start gap-1.5 truncate">
                                  <span className="text-muted-foreground/50">·</span>
                                  <span className="truncate">{t}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/assets/odp/${item.odpId}`}>
                            Lihat ODP <ArrowRight className="w-3 h-3 ml-1" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Tips */}
      <Card className="bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
        <CardContent className="py-3 px-4 text-xs text-amber-900 dark:text-amber-200">
           <strong>Tips:</strong> ODP dengan banyak tiket berulang biasanya bermasalah di splitter, kabel feeder, atau ODP-nya sendiri (overheat, korosi konektor).
          Dispatch senior teknisi untuk inspeksi fisik - jangan setiap kali assign teknisi berbeda yang akhirnya cuma reset modem.
        </CardContent>
      </Card>
    </div>
  );
}
