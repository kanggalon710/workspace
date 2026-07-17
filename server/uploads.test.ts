import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAttachmentPath } from "./uploads.js";

test("buildAttachmentPath: per-mitra dir, real ext, non-guessable suffix", () => {
  const p = buildAttachmentPath("JABNET", 142, "pdf");
  assert.match(p, /^jabnet\/pipeline\/\d{4}\/\d{2}\/142-[0-9a-f]{8}\.pdf$/);
});

test("buildAttachmentPath: sanitizes id + ext, no path escape", () => {
  const p = buildAttachmentPath("jabnet", "../etc/passwd", "png");
  assert.ok(!p.includes(".."));
  assert.match(p, /\.png$/);
});
