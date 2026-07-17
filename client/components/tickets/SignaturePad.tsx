/**
 * v4.2.18 (B.5): Signature Pad — canvas-based, no external lib needed
 *
 * Customer e-signature untuk stage Konfirmasi Pelanggan (BAST).
 * Save sebagai PNG attachment dengan metadata signature_type='customer'.
 */

import { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eraser, Check, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export function SignaturePad({
  width = 380,
  height = 180,
  onSave,
  hint = "Tanda tangan pelanggan",
  required = false,
  initialDataUrl,
}: {
  width?: number;
  height?: number;
  onSave?: (dataUrl: string) => void;
  hint?: string;
  required?: boolean;
  initialDataUrl?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSig, setHasSig] = useState(!!initialDataUrl);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (initialDataUrl) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = initialDataUrl;
    }
  }, [initialDataUrl]);

  function getPos(e: any): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = ((e.clientX ?? e.touches?.[0]?.clientX) - rect.left) * scaleX;
    const y = ((e.clientY ?? e.touches?.[0]?.clientY) - rect.top) * scaleY;
    return { x, y };
  }

  function start(e: any) {
    e.preventDefault();
    setIsDrawing(true);
    const pos = getPos(e);
    if (pos) lastPos.current = pos;
  }
  function move(e: any) {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    if (!pos || !lastPos.current) return;
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
    if (!hasSig) setHasSig(true);
  }
  function end() {
    if (!isDrawing) return;
    setIsDrawing(false);
    lastPos.current = null;
    // Auto-save on stroke end
    const canvas = canvasRef.current;
    if (canvas && onSave && hasSig) {
      onSave(canvas.toDataURL("image/png"));
    }
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasSig(false);
    if (onSave) onSave("");
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground/80">
          {hint}{required && <span className="text-rose-500"> *</span>}
        </span>
        <Button type="button" size="sm" variant="ghost" onClick={clear} className="h-6 text-[10px]">
          <Eraser className="w-3 h-3 mr-1" /> Reset
        </Button>
      </div>
      <div className={cn(
        "relative rounded-md border-2 bg-white overflow-hidden touch-none",
        hasSig ? "border-emerald-300" : required ? "border-rose-200" : "border-zinc-200",
      )}>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="block w-full"
          style={{ aspectRatio: `${width}/${height}`, cursor: "crosshair", touchAction: "none" }}
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
        {!hasSig && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none text-zinc-300 text-xs italic">
            Tanda tangan di sini
          </div>
        )}
        {hasSig && (
          <div className="absolute top-1 right-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500 text-white text-[9px] font-bold">
            <Check className="w-2.5 h-2.5" /> SIGNED
          </div>
        )}
      </div>
      {required && !hasSig && (
        <div className="flex items-center gap-1.5 text-[11px] text-rose-600">
          <AlertTriangle className="w-3 h-3" />
          Tanda tangan wajib untuk lanjut
        </div>
      )}
    </div>
  );
}
