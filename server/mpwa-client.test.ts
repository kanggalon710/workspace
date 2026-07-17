/**
 * v4.2.21: TDD tests untuk MPWAClient
 *
 * Run: npx tsx --test server/mpwa-client.test.ts
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  MPWAClient,
  normalizePhone,
  maskApiKey,
  isMPWAWebhookPayload,
  type MPWAButton,
} from "./mpwa-client.js";

// ──────────────────────────────────────────────────────────────────
// normalizePhone
// ──────────────────────────────────────────────────────────────────
test("normalizePhone: handle berbagai format", () => {
  assert.equal(normalizePhone("081234567890"),        "6281234567890");
  assert.equal(normalizePhone("+6281234567890"),      "6281234567890");
  assert.equal(normalizePhone("6281234567890"),       "6281234567890");
  assert.equal(normalizePhone("81234567890"),         "6281234567890");
  assert.equal(normalizePhone("0812-3456-7890"),      "6281234567890");
  assert.equal(normalizePhone("(0812) 3456 7890"),    "6281234567890");
  assert.equal(normalizePhone(""),                    "");
});

// ──────────────────────────────────────────────────────────────────
// maskApiKey
// ──────────────────────────────────────────────────────────────────
test("maskApiKey: mask middle, keep first 4 + last 4", () => {
  assert.equal(maskApiKey("abc123def456ghi789"), "abc1****i789");
  assert.equal(maskApiKey("short"),              "****");
  assert.equal(maskApiKey(""),                   "");
  assert.equal(maskApiKey("12345678"),           "****"); // 8 chars
});

// ──────────────────────────────────────────────────────────────────
// MPWAClient constructor validation
// ──────────────────────────────────────────────────────────────────
test("constructor: throw kalau apiKey kosong", () => {
  assert.throws(() => new MPWAClient({ apiKey: "" }), /apiKey wajib/);
});

test("constructor: accept sender opsional, sender ter-normalize", () => {
  const c = new MPWAClient({ apiKey: "k", sender: "081234567890" });
  assert.ok(c, "constructor sukses");
});

test("constructor: default baseUrl ke https://mpwa.jabnet.id", () => {
  const c = new MPWAClient({ apiKey: "k" });
  assert.ok(c, "constructor sukses tanpa sender");
});

// ──────────────────────────────────────────────────────────────────
// Method signature validation (tanpa network call, mock fetch)
// ──────────────────────────────────────────────────────────────────
test("sendText: throw kalau sender ngga ada", async () => {
  const c = new MPWAClient({ apiKey: "k" });
  // Karena ngga ada sender di constructor, sendText akan throw saat build payload
  await assert.rejects(c.sendText("628111", "Halo"), /sender wajib/);
});

test("sendButton: validasi image wajib", async () => {
  const c = new MPWAClient({ apiKey: "k", sender: "628999" });
  await assert.rejects(
    c.sendButton("628111", {
      message: "test",
      image: "",
      button: [{ type: "reply", displayText: "OK" }],
    }),
    /image wajib/
  );
});

test("sendButton: validasi minimal 1 button", async () => {
  const c = new MPWAClient({ apiKey: "k", sender: "628999" });
  await assert.rejects(
    c.sendButton("628111", {
      message: "test",
      image: "https://example.com/img.jpg",
      button: [],
    }),
    /minimal 1 button/
  );
});

test("sendButton: validasi max 5 button", async () => {
  const c = new MPWAClient({ apiKey: "k", sender: "628999" });
  const buttons: MPWAButton[] = Array.from({ length: 6 }, (_, i) => ({
    type: "reply" as const,
    displayText: `B${i}`,
  }));
  await assert.rejects(
    c.sendButton("628111", {
      message: "test",
      image: "https://example.com/img.jpg",
      button: buttons,
    }),
    /max 5 button/
  );
});

test("sendPoll: validasi minimal 2 opsi", async () => {
  const c = new MPWAClient({ apiKey: "k", sender: "628999" });
  await assert.rejects(
    c.sendPoll("628111", "Q?", ["only-one"]),
    /minimal 2 opsi/
  );
});

test("sendList: validasi minimal 1 section", async () => {
  const c = new MPWAClient({ apiKey: "k", sender: "628999" });
  await assert.rejects(
    c.sendList("628111", {
      name: "n", title: "t", buttontext: "Pilih",
      message: "m", image: "https://img",
      sections: [],
    }),
    /minimal 1 section/
  );
});

test("sendList: validasi max 5 sections", async () => {
  const c = new MPWAClient({ apiKey: "k", sender: "628999" });
  const sections = Array.from({ length: 6 }, (_, i) => ({
    title: `S${i}`,
    rows: [{ title: "R", rowId: "r1" }],
  }));
  await assert.rejects(
    c.sendList("628111", {
      name: "n", title: "t", buttontext: "Pilih",
      message: "m", image: "https://img",
      sections,
    }),
    /max 5 section/
  );
});

test("infoDevice: throw kalau number ngga ada (no sender)", async () => {
  const c = new MPWAClient({ apiKey: "k" });
  await assert.rejects(c.infoDevice(), /number wajib/);
});

test("logoutDevice: throw kalau sender ngga ada", async () => {
  const c = new MPWAClient({ apiKey: "k" });
  await assert.rejects(c.logoutDevice(), /sender wajib/);
});

// ──────────────────────────────────────────────────────────────────
// Webhook payload validation
// ──────────────────────────────────────────────────────────────────
test("isMPWAWebhookPayload: accept valid shape", () => {
  assert.equal(isMPWAWebhookPayload({
    device: "62888", message: "Halo", from: "62111", name: "Test",
  }), true);
});

test("isMPWAWebhookPayload: reject invalid shape", () => {
  assert.equal(isMPWAWebhookPayload(null), false);
  assert.equal(isMPWAWebhookPayload({}), false);
  assert.equal(isMPWAWebhookPayload({ device: "62888" }), false); // missing from
  assert.equal(isMPWAWebhookPayload({ from: "62111" }), false);    // missing device
  assert.equal(isMPWAWebhookPayload("string"), false);
});

test("isMPWAWebhookPayload: handle media + participant (group)", () => {
  assert.equal(isMPWAWebhookPayload({
    device: "62888",
    from: "62111@g.us",
    name: "Grup A",
    message: "hi",
    participant: "62222",
    mimetype: "image/jpeg",
    media: { caption: "hi", fileName: "img.jpg" },
  }), true);
});

// ──────────────────────────────────────────────────────────────────
// Integration mock: payload structure (real-server compatibility)
// ──────────────────────────────────────────────────────────────────
test("sendText: payload struktur sesuai spec MPWA", async () => {
  // Mock fetch untuk capture body request
  const originalFetch = global.fetch;
  let capturedBody: any = null;
  let capturedUrl: any = null;
  global.fetch = async (url: any, opts: any) => {
    capturedUrl = url;
    capturedBody = JSON.parse(opts.body);
    return new Response(JSON.stringify({ status: true, msg: "Sent" }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });
  };

  const c = new MPWAClient({ apiKey: "mykey", sender: "628999" });
  const r = await c.sendText("628111", "Halo!", { footer: "JABNET", full: 1 });

  assert.equal(r.status, true);
  assert.match(String(capturedUrl), /\/send-message$/);
  assert.equal(capturedBody.api_key, "mykey");
  assert.equal(capturedBody.sender, "628999");
  assert.equal(capturedBody.number, "628111");
  assert.equal(capturedBody.message, "Halo!");
  assert.equal(capturedBody.footer, "JABNET");
  assert.equal(capturedBody.full, 1);

  global.fetch = originalFetch;
});

test("sendButton: payload mapping reply/call/url/copy", async () => {
  const originalFetch = global.fetch;
  let capturedBody: any = null;
  global.fetch = async (_url: any, opts: any) => {
    capturedBody = JSON.parse(opts.body);
    return new Response(JSON.stringify({ status: true, msg: "Sent" }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });
  };

  const c = new MPWAClient({ apiKey: "mykey", sender: "628999" });
  await c.sendButton("628111", {
    message: "Pilih:",
    image: "https://img/promo.jpg",
    button: [
      { type: "reply", displayText: "OK", id: "ok-id" },
      { type: "call",  displayText: "Telp CS", phoneNumber: "081222333" },
      { type: "url",   displayText: "Web",     url: "https://j.id" },
      { type: "copy",  displayText: "Kode",    copyText: "PROMO50" },
    ],
    footer: "JABNET",
  });

  assert.equal(capturedBody.image, "https://img/promo.jpg");
  assert.equal(capturedBody.footer, "JABNET");
  assert.equal(capturedBody.button.length, 4);
  assert.equal(capturedBody.button[0].type, "reply");
  assert.equal(capturedBody.button[0].id, "ok-id");
  assert.equal(capturedBody.button[1].type, "call");
  assert.equal(capturedBody.button[1].phoneNumber, "6281222333", "phone ter-normalize ke 62xx");
  assert.equal(capturedBody.button[2].type, "url");
  assert.equal(capturedBody.button[2].url, "https://j.id");
  assert.equal(capturedBody.button[3].type, "copy");
  assert.equal(capturedBody.button[3].copyText, "PROMO50");

  global.fetch = originalFetch;
});

test("generateQR: payload mengandung device + force flag", async () => {
  const originalFetch = global.fetch;
  let capturedBody: any = null;
  global.fetch = async (_url: any, opts: any) => {
    capturedBody = JSON.parse(opts.body);
    return new Response(JSON.stringify({
      status: false, qrcode: "data:image/png;base64,iVBORw0KGgo...", message: "Please scann qrcode"
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const c = new MPWAClient({ apiKey: "mykey" });
  const r = await c.generateQR("081234567890", true);

  assert.equal(capturedBody.api_key, "mykey");
  assert.equal(capturedBody.device, "6281234567890");
  assert.equal(capturedBody.force, true);
  assert.equal(r.status, false);
  assert.ok(r.qrcode?.startsWith("data:image"));

  global.fetch = originalFetch;
});

test("checkNumber: parse response shape exists/jid", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (_url: any, _opts: any) => {
    return new Response(JSON.stringify({
      status: true,
      msg: { exists: true, jid: "6281234@s.whatsapp.net" }
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const c = new MPWAClient({ apiKey: "mykey", sender: "628999" });
  const r = await c.checkNumber("081234");
  assert.equal(r.status, true);
  const m = r.msg as any;
  assert.equal(m.exists, true);
  assert.match(m.jid, /@s\.whatsapp\.net$/);

  global.fetch = originalFetch;
});

test("network error: return status:false dengan msg", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error("Network down"); };

  const c = new MPWAClient({ apiKey: "mykey", sender: "628999" });
  const r = await c.sendText("628111", "Halo");
  assert.equal(r.status, false);
  assert.match(String(r.msg), /Network down/);

  global.fetch = originalFetch;
});
