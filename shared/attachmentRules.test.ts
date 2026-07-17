import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ATTACHMENT_MAX_BYTES,
  fileExt,
  validateAttachment,
  mimeForExt,
} from "./attachmentRules.js";

test("fileExt: lowercased last segment, '' when none", () => {
  assert.equal(fileExt("Foto.JPG"), "jpg");
  assert.equal(fileExt("a.b.PDF"), "pdf");
  assert.equal(fileExt("noext"), "");
  assert.equal(fileExt(".hidden"), "");
  assert.equal(fileExt("archive.tar.gz"), "gz");
});

test("validateAttachment: accepts allowed image + doc", () => {
  const img = validateAttachment("photo.jpg", 1_000_000);
  assert.equal(img.ok, true);
  if (img.ok) { assert.equal(img.kind, "image"); assert.equal(img.mime, "image/jpeg"); }
  const xlsx = validateAttachment("Tagihan.xlsx", 2_000_000);
  assert.equal(xlsx.ok, true);
  if (xlsx.ok) { assert.equal(xlsx.kind, "file"); assert.equal(xlsx.ext, "xlsx"); }
});

test("validateAttachment: rejects disallowed ext, empty, over-cap", () => {
  assert.equal(validateAttachment("evil.exe", 10).ok, false);
  assert.equal(validateAttachment("empty.pdf", 0).ok, false);
  assert.equal(validateAttachment("big.zip", ATTACHMENT_MAX_BYTES + 1).ok, false);
});

test("mimeForExt: known + octet-stream fallback", () => {
  assert.equal(mimeForExt("png"), "image/png");
  assert.equal(mimeForExt("pdf"), "application/pdf");
  assert.equal(mimeForExt("unknownext"), "application/octet-stream");
});
