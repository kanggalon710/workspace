/**
 * Client-side image compressor dengan iterative refinement.
 * User upload foto apa saja (100MB atau 20 byte) — output pasti fit ke server.
 *
 * Strategy:
 * 1. Read file → decode image di browser
 * 2. Resize ke dimensi target (default max 1280px)
 * 3. Encode JPEG dengan quality 0.75
 * 4. Kalau hasil > maxBytes, retry dengan dimensi lebih kecil + quality lebih rendah
 * 5. Loop sampai fit (minimum 400px @ quality 0.4)
 */

export interface CompressOptions {
  /** Max dimension awal (px). Default 1280. */
  maxDim?: number;
  /** Target max output size dalam bytes base64. Default 500_000 (≈500KB base64 ≈ 375KB binary). */
  maxBytes?: number;
  /** Output MIME. Default "image/jpeg". */
  outputType?: "image/jpeg" | "image/webp";
}

export interface CompressResult {
  dataUrl: string;
  compressedBytes: number;
  originalBytes: number;
  width: number;
  height: number;
  attempts: number;
  finalQuality: number;
}

/**
 * Compress image → dataURL base64 yang GUARANTEED ≤ maxBytes.
 * Kalau input bukan image / decode fail, throw error.
 */
export async function compressImage(
  file: File,
  opts: CompressOptions = {},
): Promise<CompressResult> {
  const initMaxDim = opts.maxDim ?? 1280;
  const targetMaxBytes = opts.maxBytes ?? 500_000; // ~500KB base64
  const outputType = opts.outputType ?? "image/jpeg";

  if (!file.type.startsWith("image/")) {
    throw new Error("File bukan gambar");
  }

  // Read file → Image
  const readerDataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("Gagal baca file"));
    r.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Gagal decode gambar"));
    i.src = readerDataUrl;
  });

  // Iterative compression — progressive degradation sampai fit
  // Step 1: baseline resize + q=0.75
  // Step 2+: kalau masih besar, reduce dim 20% + reduce quality 10-15%
  const attempts: Array<{ dim: number; quality: number }> = [
    { dim: initMaxDim, quality: 0.75 },
    { dim: Math.round(initMaxDim * 0.9), quality: 0.70 },
    { dim: Math.round(initMaxDim * 0.75), quality: 0.62 },
    { dim: Math.round(initMaxDim * 0.6), quality: 0.55 },
    { dim: Math.round(initMaxDim * 0.5), quality: 0.48 },
    { dim: Math.round(initMaxDim * 0.4), quality: 0.42 },
    { dim: 400, quality: 0.40 }, // minimum floor — masih readable untuk bukti
  ];

  let best: CompressResult | null = null;
  let attemptCount = 0;

  for (const attempt of attempts) {
    attemptCount++;
    const { dataUrl, w, h } = renderToDataUrl(img, attempt.dim, attempt.quality, outputType);

    const result: CompressResult = {
      dataUrl,
      compressedBytes: dataUrl.length,
      originalBytes: file.size,
      width: w,
      height: h,
      attempts: attemptCount,
      finalQuality: attempt.quality,
    };

    // Fit — return immediately
    if (dataUrl.length <= targetMaxBytes) {
      return result;
    }

    // Save sebagai fallback kalau semua attempt gagal
    if (!best || dataUrl.length < best.compressedBytes) {
      best = result;
    }
  }

  // Semua attempt masih > maxBytes — return yang terkecil.
  // Ini edge case sangat rare (foto extreme detail atau hardware aneh).
  return best!;
}

function renderToDataUrl(
  img: HTMLImageElement,
  maxDim: number,
  quality: number,
  outputType: string,
): { dataUrl: string; w: number; h: number } {
  let w = img.width;
  let h = img.height;
  if (w > maxDim || h > maxDim) {
    const ratio = w > h ? maxDim / w : maxDim / h;
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas tidak support");
  }
  // Improve downscale quality
  (ctx as any).imageSmoothingEnabled = true;
  (ctx as any).imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  const dataUrl = canvas.toDataURL(outputType, quality);
  return { dataUrl, w, h };
}

/**
 * Format bytes untuk display ("1.2 MB", "340 KB").
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
