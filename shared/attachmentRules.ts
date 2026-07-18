/** Pure rules for pipeline card attachments — no I/O, fully unit-testable. */

export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024; // 25 MB/file

export interface AttachmentType { ext: string; mime: string; kind: "image" | "file" | "audio" }

export const ATTACHMENT_TYPES: AttachmentType[] = [
  { ext: "jpg",  mime: "image/jpeg", kind: "image" },
  { ext: "jpeg", mime: "image/jpeg", kind: "image" },
  { ext: "png",  mime: "image/png",  kind: "image" },
  { ext: "webp", mime: "image/webp", kind: "image" },
  { ext: "pdf",  mime: "application/pdf", kind: "file" },
  { ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "file" },
  { ext: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", kind: "file" },
  { ext: "zip",  mime: "application/zip", kind: "file" },
  // Teamspace BUG-011 (FR-502): voice note chat — hasil MediaRecorder browser
  { ext: "webm", mime: "audio/webm", kind: "audio" },
  { ext: "ogg",  mime: "audio/ogg",  kind: "audio" },
  { ext: "m4a",  mime: "audio/mp4",  kind: "audio" },
  { ext: "mp3",  mime: "audio/mpeg", kind: "audio" },
];

/** Lowercased extension after the final dot; "" when none or leading-dot only. */
export function fileExt(name: string): string {
  const base = String(name ?? "").trim();
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

export type AttachmentValidation =
  | { ok: true; ext: string; mime: string; kind: "image" | "file" | "audio" }
  | { ok: false; error: string };

/** Validate by EXTENSION (browser mime is unreliable for zip/docx/xlsx). */
export function validateAttachment(name: string, sizeBytes: number): AttachmentValidation {
  const ext = fileExt(name);
  const t = ATTACHMENT_TYPES.find((x) => x.ext === ext);
  if (!t) return { ok: false, error: "Tipe file tidak didukung" };
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return { ok: false, error: "File kosong" };
  if (sizeBytes > ATTACHMENT_MAX_BYTES) return { ok: false, error: "File melebihi 25 MB" };
  return { ok: true, ext: t.ext, mime: t.mime, kind: t.kind };
}

/** Content-Type for streaming a stored extension; octet-stream fallback. */
export function mimeForExt(ext: string): string {
  return ATTACHMENT_TYPES.find((x) => x.ext === String(ext).toLowerCase())?.mime
    ?? "application/octet-stream";
}
