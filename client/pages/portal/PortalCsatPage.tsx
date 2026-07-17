/**
 * v4.2.17: Public CSAT response page — customer kasih rating + feedback
 *
 * Akses via link `/csat/:token` di SMS/WhatsApp setelah ticket close.
 * Public — tanpa login. Token unique per ticket.
 */

import { useState } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Star, CheckCircle2, AlertTriangle, Radio, MessageSquare } from "lucide-react";

interface CsatPreview {
  ticketNumber: string;
  ticketTitle: string;
  resolvedAt: string | null;
  teknisi: string;
  customerName: string | null;
  alreadyResponded: boolean;
  rating: number | null;
}

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const r = await fetch(url, init);
  const j = await r.json();
  if (!j.success) throw new Error(j.error || "Gagal");
  return j.data;
}

export default function PortalCsatPage() {
  const [, params] = useRoute("/csat/:token");
  const [, paramsAlt] = useRoute("/portal/csat/:token");
  const token = params?.token || paramsAlt?.token;
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [feedback, setFeedback] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const { data: preview, isLoading, error } = useQuery<CsatPreview>({
    queryKey: ["csat-preview", token],
    queryFn: () => fetchJson(`/api/portal/csat/${token}`),
    enabled: !!token,
    retry: false,
  });

  const submitMut = useMutation({
    mutationFn: (data: { rating: number; feedback: string }) =>
      fetchJson(`/api/portal/csat/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => setSubmitted(true),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-blue-50 grid place-items-center p-6">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-orange-50 grid place-items-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="py-10 text-center">
            <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
            <h2 className="text-lg font-bold">Link tidak valid</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Survey tidak ditemukan atau link sudah kadaluarsa. Hubungi CS JABNET di WhatsApp.
            </p>
            <Button className="mt-5" asChild>
              <a href="https://wa.me/6282180009030">
                <MessageSquare className="w-4 h-4 mr-2" /> Hubungi CS
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (preview.alreadyResponded || submitted) {
    const finalRating = submitted ? rating : (preview.rating ?? rating);
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-sky-50 grid place-items-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="py-10 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 grid place-items-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-lg font-bold">Terima kasih! 🙏</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Feedback Anda sudah kami terima. Rating: <strong>{finalRating}/5 ⭐</strong>
            </p>
            <p className="text-xs text-muted-foreground mt-3">
              Masukan Anda akan kami pakai untuk meningkatkan kualitas layanan.
            </p>
            <Button variant="outline" className="mt-5" asChild>
              <a href="https://portal.jabnet.id">Buka Portal Pelanggan</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-blue-50">
      {/* Header brand */}
      <header className="px-6 pt-8 pb-4 max-w-md mx-auto">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 grid place-items-center shadow-elev-sm">
            <Radio className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <div className="font-black text-base tracking-tight leading-none">JABNET</div>
            <div className="text-[9px] text-muted-foreground uppercase tracking-[0.15em] font-semibold mt-0.5">Survey Kepuasan</div>
          </div>
        </div>
      </header>

      <main className="px-6 max-w-md mx-auto pb-12">
        <Card>
          <CardContent className="p-6">
            <h1 className="text-xl font-bold tracking-tight">Bagaimana pengalaman Anda?</h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              Tiket <strong className="font-mono text-foreground">{preview.ticketNumber}</strong> sudah diselesaikan oleh <strong className="text-foreground">{preview.teknisi}</strong>. Mohon kasih rating supaya kami bisa terus tingkatkan layanan.
            </p>

            {/* 5-star rating */}
            <div className="mt-6">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Rating Layanan
              </div>
              <div className="flex items-center gap-1.5 justify-center">
                {[1, 2, 3, 4, 5].map((n) => {
                  const active = (hoverRating || rating) >= n;
                  return (
                    <button
                      key={n}
                      onClick={() => setRating(n)}
                      onMouseEnter={() => setHoverRating(n)}
                      onMouseLeave={() => setHoverRating(0)}
                      className="p-2 transition-transform active:scale-90"
                      aria-label={`${n} bintang`}
                    >
                      <Star
                        className={`w-10 h-10 ${active ? "fill-amber-400 text-amber-500" : "text-zinc-300"}`}
                        strokeWidth={1.5}
                      />
                    </button>
                  );
                })}
              </div>
              {rating > 0 && (
                <div className="text-center text-xs font-semibold mt-2">
                  {rating === 5 && <span className="text-emerald-700">😍 Sangat Puas</span>}
                  {rating === 4 && <span className="text-emerald-600">😊 Puas</span>}
                  {rating === 3 && <span className="text-amber-600">😐 Cukup</span>}
                  {rating === 2 && <span className="text-orange-600">😞 Kurang Puas</span>}
                  {rating === 1 && <span className="text-rose-600">😡 Sangat Tidak Puas</span>}
                </div>
              )}
            </div>

            {/* Feedback */}
            <div className="mt-6">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">
                Saran / Kritik (opsional)
              </label>
              <Textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder={rating <= 2 ? "Apa yang bisa kami perbaiki?" : "Apa yang membuat Anda puas?"}
                rows={3}
                className="text-sm"
              />
            </div>

            {/* Submit */}
            <Button
              className="w-full mt-5 h-11 text-sm font-bold"
              disabled={rating === 0 || submitMut.isPending}
              onClick={() => submitMut.mutate({ rating, feedback })}
            >
              {submitMut.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Mengirim...</>
              ) : rating === 0 ? (
                "Pilih rating dulu"
              ) : (
                "Kirim Feedback"
              )}
            </Button>
            {submitMut.isError && (
              <p className="text-xs text-rose-600 text-center mt-2">
                {(submitMut.error as any)?.message ?? "Gagal kirim. Coba lagi."}
              </p>
            )}
          </CardContent>
        </Card>

        <p className="text-[10px] text-center text-muted-foreground mt-4 px-4">
          Data Anda aman & hanya dipakai untuk evaluasi internal JABNET.
        </p>
      </main>
    </div>
  );
}
