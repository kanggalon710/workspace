/**
 * Filesystem photo storage helper (multi-tenant).
 *
 * Foto disimpan di luar webroot di $JABNET_UPLOAD_ROOT (default: $JABNET_PRIVATE_ROOT/uploads
 * atau ./uploads sebagai fallback dev). DB hanya simpan relative path
 * (mis. "jabnet/canvassing/2026/05/142-7a3b1c9d.jpg") - bukan absolute path.
 *
 * Per-mitra isolation: <root>/<mitra-slug>/<feature>/YYYY/MM/<idHint>-<8hex>.<ext>
 */
import { promises as fs, existsSync } from "fs";
import path from "path";
import crypto from "crypto";
import type { Response } from "express";
import { mimeForExt } from "../shared/attachmentRules.js";

const FEATURES = ["canvassing", "odps", "odcs", "poles", "leads", "bugs", "collections", "tickets", "avatars"] as const;
export type PhotoFeature = (typeof FEATURES)[number];

let cachedRoot: string | null = null;

/**
 * Resolve absolute upload root. Order:
 * 1. process.env.JABNET_UPLOAD_ROOT (explicit)
 * 2. process.env.JABNET_PRIVATE_ROOT + "/uploads" (cPanel convention)
 * 3. "./uploads" (dev fallback, relative to cwd)
 */
export function getUploadRoot(): string {
  if (cachedRoot) return cachedRoot;
  const explicit = process.env.JABNET_UPLOAD_ROOT;
  if (explicit && explicit.trim()) {
    cachedRoot = path.resolve(explicit.trim());
  } else if (process.env.JABNET_PRIVATE_ROOT) {
    cachedRoot = path.resolve(process.env.JABNET_PRIVATE_ROOT, "uploads");
  } else {
    cachedRoot = path.resolve(process.cwd(), "uploads");
  }
  return cachedRoot;
}

function sanitizeSlug(slug: string): string {
  // Slug normal: lowercase a-z 0-9 dash. Guard against null/empty/path traversal.
  const s = String(slug || "").toLowerCase().trim();
  if (!s || !/^[a-z0-9][a-z0-9-]*$/.test(s)) {
    throw new Error(`Invalid mitra slug: ${JSON.stringify(slug)}`);
  }
  return s;
}

function sanitizeFeature(feature: string): PhotoFeature {
  if (!(FEATURES as readonly string[]).includes(feature)) {
    throw new Error(`Invalid feature: ${feature}`);
  }
  return feature as PhotoFeature;
}

export function getMitraDir(slug: string): string {
  return path.join(getUploadRoot(), sanitizeSlug(slug));
}

export function getFeatureDir(slug: string, feature: string): string {
  return path.join(getMitraDir(slug), sanitizeFeature(feature));
}

export function buildRelativePath(slug: string, feature: string, idHint: number | string): string {
  const s = sanitizeSlug(slug);
  const f = sanitizeFeature(feature);
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const suffix = crypto.randomBytes(4).toString("hex");
  const safeId = String(idHint).replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.posix.join(s, f, yyyy, mm, `${safeId}-${suffix}.jpg`);
}

/**
 * Decode data URL base64 → Buffer. Tolerate "data:image/jpeg;base64,..." atau raw base64.
 */
function decodeBase64DataUrl(dataUrl: string): Buffer {
  if (!dataUrl || typeof dataUrl !== "string") {
    throw new Error("photoData kosong / bukan string");
  }
  let base64 = dataUrl;
  const match = /^data:image\/[a-z0-9+.-]+;base64,(.+)$/i.exec(dataUrl);
  if (match) base64 = match[1];
  // Strip whitespace
  base64 = base64.replace(/\s+/g, "");
  if (!base64) throw new Error("photoData base64 kosong setelah strip");
  return Buffer.from(base64, "base64");
}

/**
 * Tulis base64 dataURL ke file. Return relative path (untuk simpan ke DB).
 */
export async function saveBase64Photo(
  slug: string,
  feature: string,
  idHint: number | string,
  dataUrl: string,
): Promise<string> {
  // Dev env safety: kalau uploads root di-symlink ke prod, writes bakal pollute prod folder.
  // UPLOADS_READ_ONLY=true cegah ini. Code error eksplisit biar caller tahu.
  if (process.env.UPLOADS_READ_ONLY === "true") {
    throw new Error("Uploads disabled di environment ini (UPLOADS_READ_ONLY=true). Foto tidak disimpan.");
  }
  const relativePath = buildRelativePath(slug, feature, idHint);
  const absolutePath = path.join(getUploadRoot(), relativePath);
  const buffer = decodeBase64DataUrl(dataUrl);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);
  return relativePath;
}

/**
 * Resolve relative path → absolute path inside upload root.
 * Guard against path traversal (../, absolute paths, null bytes).
 */
function resolveSafe(relativePath: string): string {
  if (!relativePath || typeof relativePath !== "string") {
    throw new Error("Empty relative path");
  }
  if (relativePath.includes("\0")) throw new Error("Null byte in path");
  // Reject absolute paths (POSIX or Windows-style)
  if (path.isAbsolute(relativePath) || /^[a-zA-Z]:[\\/]/.test(relativePath)) {
    throw new Error("Absolute path not allowed");
  }
  const root = getUploadRoot();
  const resolved = path.resolve(root, relativePath);
  // Final guard: resolved path must stay under root
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    throw new Error("Path traversal blocked");
  }
  return resolved;
}

/**
 * Hapus file. Best-effort - kalau file tidak ada, no-op (idempotent).
 */
export async function deletePhoto(relativePath: string | null | undefined): Promise<void> {
  if (!relativePath) return;
  // Dev env safety: kalau symlink ke prod, jangan delete file prod.
  if (process.env.UPLOADS_READ_ONLY === "true") {
    console.warn(`[uploads] skip delete (UPLOADS_READ_ONLY): ${relativePath}`);
    return;
  }
  try {
    const absolutePath = resolveSafe(relativePath);
    await fs.unlink(absolutePath);
  } catch (e: any) {
    if (e?.code === "ENOENT") return; // already gone, OK
    if (e?.message?.includes("traversal") || e?.message?.includes("Absolute")) {
      // Refuse to delete unsafe path silently - log but don't throw
      console.warn(`[uploads] refuse deletePhoto: ${relativePath} - ${e.message}`);
      return;
    }
    throw e;
  }
}

/**
 * Stream foto ke response. Set content-type berdasarkan extension.
 */
export async function streamPhoto(relativePath: string, res: Response): Promise<void> {
  const absolutePath = resolveSafe(relativePath);
  if (!existsSync(absolutePath)) {
    res.status(404).json({ success: false, error: "Foto tidak ditemukan" });
    return;
  }
  const ext = path.extname(absolutePath).toLowerCase();
  const mime =
    ext === ".png" ? "image/png" :
    ext === ".webp" ? "image/webp" :
    ext === ".gif" ? "image/gif" :
    "image/jpeg";
  res.setHeader("Content-Type", mime);
  res.setHeader("Cache-Control", "private, max-age=3600"); // browser cache 1 jam
  // Express sendFile butuh absolute path
  await new Promise<void>((resolve, reject) => {
    res.sendFile(absolutePath, (err) => (err ? reject(err) : resolve()));
  });
}

/**
 * Ensure direktori per-mitra ada. Dipanggil saat mitra dibuat ATAU di startup
 * untuk mitra existing (auto-provision idempotent).
 */
export async function ensureMitraDirs(slug: string): Promise<void> {
  const s = sanitizeSlug(slug);
  for (const f of FEATURES) {
    const dir = path.join(getUploadRoot(), s, f);
    await fs.mkdir(dir, { recursive: true });
  }
}

/**
 * Rename mitra dir saat slug berubah. No-op kalau old dir belum exist.
 */
export async function renameMitraDir(oldSlug: string, newSlug: string): Promise<void> {
  if (oldSlug === newSlug) return;
  const oldS = sanitizeSlug(oldSlug);
  const newS = sanitizeSlug(newSlug);
  const oldDir = path.join(getUploadRoot(), oldS);
  const newDir = path.join(getUploadRoot(), newS);
  if (!existsSync(oldDir)) {
    // Tidak ada dir lama, cukup buat dir baru
    await ensureMitraDirs(newS);
    return;
  }
  if (existsSync(newDir)) {
    throw new Error(`Target dir already exists: ${newDir}`);
  }
  await fs.rename(oldDir, newDir);
}

/**
 * Pindahkan dir mitra ke _trash/ saat hard-delete. Tidak menghapus permanen
 * (admin bisa restore via SSH kalau salah delete).
 */
export async function trashMitraDir(slug: string): Promise<void> {
  const s = sanitizeSlug(slug);
  const src = path.join(getUploadRoot(), s);
  if (!existsSync(src)) return; // nothing to trash
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const trashRoot = path.join(getUploadRoot(), "_trash");
  await fs.mkdir(trashRoot, { recursive: true });
  const dest = path.join(trashRoot, `${s}-${ts}`);
  await fs.rename(src, dest);
}

/** Relative path for a card attachment, preserving the real (sanitized) extension. */
export function buildAttachmentPath(slug: string, idHint: number | string, ext: string): string {
  const s = sanitizeSlug(slug);
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const suffix = crypto.randomBytes(4).toString("hex");
  const safeId = String(idHint).replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeExt = String(ext).toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  return path.posix.join(s, "pipeline", yyyy, mm, `${safeId}-${suffix}.${safeExt}`);
}

/** Persist an already-buffered upload under the per-mitra pipeline dir.
 *  Returns the relative path. Honors UPLOADS_READ_ONLY like saveBase64Photo. */
export async function saveUploadedFile(
  slug: string, idHint: number | string, buf: Buffer, ext: string,
): Promise<string> {
  if (process.env.UPLOADS_READ_ONLY === "true") {
    throw new Error("Uploads disabled di environment ini (UPLOADS_READ_ONLY=true).");
  }
  const relativePath = buildAttachmentPath(slug, idHint, ext);
  const absolutePath = resolveSafe(relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buf);
  return relativePath;
}

/** Stream any stored file; content-type from the extension. `download` forces a save dialog. */
export async function streamFile(
  relativePath: string, res: Response, opts?: { download?: boolean; fileName?: string },
): Promise<void> {
  const absolutePath = resolveSafe(relativePath);
  if (!existsSync(absolutePath)) {
    res.status(404).json({ success: false, error: "File tidak ditemukan" });
    return;
  }
  const ext = path.extname(absolutePath).slice(1).toLowerCase();
  res.setHeader("Content-Type", mimeForExt(ext));
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, max-age=3600");
  if (opts?.download) {
    const safeName = (opts.fileName ?? `file.${ext}`).replace(/[\r\n"]/g, "");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
  }
  await new Promise<void>((resolve, reject) => {
    res.sendFile(absolutePath, (err) => (err ? reject(err) : resolve()));
  });
}
