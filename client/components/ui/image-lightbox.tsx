// Lightbox foto full-page ala Telegram: overlay gelap (bukan hitam penuh), gambar di tengah,
// panah kiri/kanan untuk ganti foto, keyboard (Esc/←/→) + swipe sentuh. Di-portal ke document.body
// agar TIDAK terjebak di dalam Dialog/modal ber-transform (fixed inset-0 baru bisa menutup 1 layar).
// Satu sumber kebenaran untuk semua galeri foto (aset/koleksi/canvassing/pipeline).
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, ImageOff, X } from "lucide-react";

export interface LightboxImage {
  src: string;
  alt?: string;
  caption?: string;
}

export function ImageLightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: LightboxImage[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const count = images.length;
  const [errored, setErrored] = useState(false);
  const touchX = useRef<number | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // Reset status error tiap kali foto yang tampil berganti.
  useEffect(() => { setErrored(false); }, [index]);

  const go = useCallback(
    (delta: number) => {
      if (count < 2) return;
      onIndexChange((index + delta + count) % count);
    },
    [index, count, onIndexChange],
  );

  // Keyboard nav + kunci scroll body selama terbuka.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [go, onClose]);

  // Lightbox di-portal ke document.body (di LUAR Dialog Radix). Tanpa ini, native pointerdown
  // di overlay dianggap "klik di luar" oleh DismissableLayer Radix -> modal ODP ikut tertutup saat
  // klik panah. Stop native pointerdown di root overlay agar listener document Radix tidak terpicu.
  // (React stopPropagation TIDAK cukup: Radix pakai listener native di document, bukan React.)
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    el.addEventListener("pointerdown", stop);
    el.addEventListener("mousedown", stop);
    return () => {
      el.removeEventListener("pointerdown", stop);
      el.removeEventListener("mousedown", stop);
    };
  }, []);

  if (count === 0 || index < 0 || index >= count) return null;
  const cur = images[index];

  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0]?.clientX ?? null; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX.current;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
    touchX.current = null;
  };

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[120] flex flex-col bg-black/85 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label="Penampil foto"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Bar atas: penghitung + tombol tutup */}
      <div className="flex shrink-0 items-center justify-between px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <span className="text-sm tabular-nums text-white/70">{count > 1 ? `${index + 1} / ${count}` : ""}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup"
          className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* Area gambar */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-4" onClick={onClose}>
        {count > 1 && (
          <button
            type="button"
            aria-label="Foto sebelumnya"
            onClick={(e) => { e.stopPropagation(); go(-1); }}
            className="absolute left-2 z-10 flex size-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:left-4"
          >
            <ChevronLeft className="size-6" />
          </button>
        )}

        {errored ? (
          <div className="flex flex-col items-center gap-2 text-white/60" onClick={(e) => e.stopPropagation()}>
            <ImageOff className="size-12" />
            <span className="text-sm">Foto tidak tersedia</span>
          </div>
        ) : (
          <img
            src={cur.src}
            alt={cur.alt ?? "Foto"}
            onError={() => setErrored(true)}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full select-none rounded-lg object-contain shadow-2xl"
            draggable={false}
          />
        )}

        {count > 1 && (
          <button
            type="button"
            aria-label="Foto berikutnya"
            onClick={(e) => { e.stopPropagation(); go(1); }}
            className="absolute right-2 z-10 flex size-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:right-4"
          >
            <ChevronRight className="size-6" />
          </button>
        )}
      </div>

      {/* Keterangan */}
      {cur.caption && (
        <div className="shrink-0 px-4 py-3 text-center text-sm text-white/80" onClick={(e) => e.stopPropagation()}>
          {cur.caption}
        </div>
      )}
    </div>,
    document.body,
  );
}
