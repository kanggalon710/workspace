import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Download, Copy, Share2, Loader2, Palette } from "lucide-react";

interface SahabatKitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sahabat?: {
    customerName: string;
    sahabatCode: string;
    customerPhone?: string | null;
    portalUrl?: string;
  } | null;
}

type Theme = "classic" | "bold" | "minimal";

const THEMES: Record<Theme, { name: string; bg: string; accent: string; text: string; preview: string }> = {
  classic: { name: "Classic (Sky Blue)",  bg: "#0ea5e9", accent: "#fbbf24", text: "#ffffff", preview: "bg-sky-500" },
  bold:    { name: "Bold (Rose)",          bg: "#e11d48", accent: "#fde047", text: "#ffffff", preview: "bg-rose-600" },
  minimal: { name: "Minimal (Dark)",       bg: "#0f172a", accent: "#22d3ee", text: "#ffffff", preview: "bg-slate-900" },
};

/**
 * Render flyer JABNET Sahabat ke canvas 1080x1350 (Instagram story/portrait).
 * Return dataURL PNG.
 */
async function renderFlyerToCanvas(
  ctx: CanvasRenderingContext2D,
  opts: {
    sahabatCode: string;
    customerName: string;
    customerPhone: string;
    theme: Theme;
    portalUrl: string;
  }
): Promise<void> {
  const W = 1080;
  const H = 1350;
  const theme = THEMES[opts.theme];

  // Bg
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle pattern top
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.beginPath();
  ctx.arc(W - 100, 100, 220, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(120, H - 200, 160, 0, Math.PI * 2);
  ctx.fill();

  // Accent band top
  ctx.fillStyle = theme.accent;
  ctx.fillRect(0, 0, W, 12);

  // Logo badge
  ctx.fillStyle = theme.text;
  ctx.font = "bold 36px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("JABNET", 60, 100);

  ctx.font = "600 18px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText("FIBER OPERATIONS", 60, 128);

  // Title
  ctx.fillStyle = theme.text;
  ctx.font = "bold 64px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("PROGRAM", 60, 250);
  ctx.fillText("SAHABAT", 60, 330);

  // Subtitle (accent)
  ctx.fillStyle = theme.accent;
  ctx.font = "bold 36px system-ui, sans-serif";
  ctx.fillText("Ajak Tetangga, Dapat Voucher!", 60, 395);

  // Headline offer
  ctx.fillStyle = theme.text;
  ctx.font = "600 28px system-ui, sans-serif";
  ctx.fillText("Rekomendasikan JABNET ke tetangga,", 60, 470);
  ctx.fillText("dapatkan reward menarik!", 60, 510);

  // Reward boxes (3 item)
  const rewards = [
    ["", "Voucher Indomaret", "Rp 50.000"],
    ["", "Milestone Bonus", "Rp 200K-5jt"],
    ["", "Internet GRATIS", "12-60 bulan"],
  ];
  const boxY = 580;
  const boxW = (W - 120 - 40) / 3;
  rewards.forEach(([emoji, label, val], i) => {
    const x = 60 + i * (boxW + 20);
    // Box
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 2;
    roundRect(ctx, x, boxY, boxW, 180, 14);
    ctx.fill();
    ctx.stroke();
    // Emoji
    ctx.font = "56px system-ui";
    ctx.fillStyle = theme.text;
    ctx.textAlign = "center";
    ctx.fillText(emoji, x + boxW / 2, boxY + 70);
    // Label
    ctx.font = "600 16px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(label, x + boxW / 2, boxY + 110);
    // Value
    ctx.font = "bold 24px system-ui, sans-serif";
    ctx.fillStyle = theme.accent;
    ctx.fillText(val, x + boxW / 2, boxY + 145);
  });

  // Sahabat code card
  const codeY = 830;
  ctx.fillStyle = theme.accent;
  roundRect(ctx, 60, codeY, W - 120, 280, 24);
  ctx.fill();

  // "KODE SAHABAT" label
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.font = "700 22px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("KODE SAHABAT", 100, codeY + 48);

  // Name
  ctx.fillStyle = "#000";
  ctx.font = "600 20px system-ui, sans-serif";
  ctx.fillText(opts.customerName.toUpperCase(), 100, codeY + 78);

  // Kode big
  ctx.font = "bold 74px ui-monospace, 'SF Mono', Monaco, monospace";
  ctx.fillStyle = "#000";
  ctx.fillText(opts.sahabatCode, 100, codeY + 175);

  // QR code (right side) - qrcode lib loaded on-demand to keep main bundle slim
  try {
    const { default: QRCode } = await import("qrcode");
    const qrDataUrl = await QRCode.toDataURL(opts.portalUrl, {
      width: 180,
      margin: 0,
      color: { dark: "#000000", light: "#00000000" },
    });
    const qrImg = await loadImage(qrDataUrl);
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, W - 60 - 200, codeY + 50, 200, 200, 12);
    ctx.fill();
    ctx.drawImage(qrImg, W - 60 - 190, codeY + 60, 180, 180);
  } catch {
    // ignore QR error
  }

  // Phone line
  if (opts.customerPhone) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.font = "500 18px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Hubungi: ${opts.customerPhone}`, 100, codeY + 230);
  }

  // Footer CTA
  ctx.fillStyle = theme.text;
  ctx.font = "bold 24px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Scan QR atau tulis kode saat daftar", W / 2, 1180);

  ctx.font = "600 20px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.80)";
  ctx.fillText("di billing.jabnet.id", W / 2, 1215);

  // Footer band
  ctx.fillStyle = theme.accent;
  ctx.fillRect(0, H - 40, W, 40);
  ctx.fillStyle = "#000";
  ctx.font = "bold 16px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("PT ARKANOVA CIPTA INOVASI · GARUT · FIBER-TOOLS.ARKANOVA.ID", W / 2, H - 14);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function SahabatKitDialog({ open, onOpenChange, sahabat }: SahabatKitDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [theme, setTheme] = useState<Theme>("classic");
  const [rendering, setRendering] = useState(false);
  const [waMessage, setWaMessage] = useState("");

  // v4.2.13: default ke domain customer portal khusus (portal.jabnet.id) supaya QR/link clean,
  // bukan link ke fiber-tools (staff workspace). Kalau diakses dari portal.jabnet.id sendiri pakai origin.
  const portalUrl = sahabat?.portalUrl || (() => {
    if (typeof window === "undefined") return "https://portal.jabnet.id";
    const h = window.location.hostname;
    if (h === "portal.jabnet.id") return window.location.origin;
    return "https://portal.jabnet.id";
  })();

  useEffect(() => {
    if (!open || !sahabat || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setRendering(true);
    renderFlyerToCanvas(ctx, {
      sahabatCode: sahabat.sahabatCode,
      customerName: sahabat.customerName,
      customerPhone: sahabat.customerPhone ?? "",
      theme,
      portalUrl,
    }).finally(() => setRendering(false));
    // Build default WA message
    setWaMessage(
      `Halo! Saya ${sahabat.customerName} pengguna internet JABNET

Ikutan yuk pakai internet fiber optic di rumah. Pakai kode Sahabat saya saat daftar biar kita sama-sama dapat voucher:

 KODE SAHABAT: *${sahabat.sahabatCode}*

Daftar di: ${portalUrl}

Nanti kalau udah aktif, kamu dapat welcome bonus 7 hari gratis, dan saya dapat voucher Indomaret 50K `
    );
  }, [open, sahabat, theme, portalUrl]);

  const handleDownload = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !sahabat) return;
    const link = document.createElement("a");
    link.download = `JABNET-Sahabat-${sahabat.sahabatCode}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    toast.success("Flyer diunduh");
  };

  const handleCopyWA = () => {
    navigator.clipboard.writeText(waMessage);
    toast.success("Pesan WA disalin");
  };

  const handleShareWA = () => {
    if (!sahabat?.customerPhone) {
      toast.error("Nomor HP pelanggan belum ada");
      return;
    }
    const phone = sahabat.customerPhone.replace(/[\s\-+]/g, "").replace(/^0/, "62");
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(waMessage)}`;
    window.open(url, "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl dialog-w max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>Kit Marketing Sahabat</DialogTitle>
          <DialogDescription>
            Download flyer siap cetak / share. Scan QR → portal pelanggan dengan kode Sahabat otomatis terisi.
          </DialogDescription>
        </DialogHeader>

        {sahabat && (
          <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm truncate">{sahabat.customerName}</div>
                <div className="text-xs text-muted-foreground font-mono">{sahabat.sahabatCode}</div>
              </div>
              {sahabat.customerPhone && (
                <div className="text-xs text-muted-foreground font-mono">{sahabat.customerPhone}</div>
              )}
            </div>

            <div>
              <Label className="text-xs font-semibold flex items-center gap-1.5 mb-2">
                <Palette className="h-3.5 w-3.5" /> Tema Flyer
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(THEMES) as Theme[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setTheme(k)}
                    className={`p-2 rounded-md border text-xs font-semibold transition-all ${
                      theme === k ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className={`h-10 rounded ${THEMES[k].preview} mb-1.5`} />
                    {THEMES[k].name}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Preview */}
              <div>
                <Label className="text-xs font-semibold mb-2 block">Preview Flyer (1080×1350)</Label>
                <div className="relative border rounded-lg overflow-hidden bg-muted/30 aspect-[4/5]">
                  <canvas
                    ref={canvasRef}
                    className="w-full h-full object-contain"
                    style={{ background: "#f1f5f9" }}
                  />
                  {rendering && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  )}
                </div>
                <Button onClick={handleDownload} className="w-full mt-2 gap-1.5" disabled={rendering}>
                  <Download className="h-4 w-4" /> Download PNG
                </Button>
              </div>

              {/* WA share */}
              <div>
                <Label className="text-xs font-semibold mb-2 block">Pesan WA Siap Share</Label>
                <textarea
                  value={waMessage}
                  onChange={(e) => setWaMessage(e.target.value)}
                  className="w-full h-64 p-3 text-xs font-mono border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                  spellCheck={false}
                />
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Button variant="outline" onClick={handleCopyWA} className="gap-1.5">
                    <Copy className="h-4 w-4" /> Salin Pesan
                  </Button>
                  <Button onClick={handleShareWA} disabled={!sahabat.customerPhone} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                    <Share2 className="h-4 w-4" /> Kirim WA
                  </Button>
                </div>
                <div className="mt-3 space-y-1.5">
                  <Label className="text-xs font-semibold">Portal URL (dengan kode auto-fill)</Label>
                  <div className="flex gap-1.5">
                    <Input
                      readOnly
                      value={portalUrl}
                      className="text-xs font-mono"
                    />
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(portalUrl); toast.success("URL disalin"); }} className="shrink-0">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
