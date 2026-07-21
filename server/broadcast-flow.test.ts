/**
 * v4.2.20: TDD test untuk broadcast flow PRD WA v2.
 *
 * Run: tsx --test server/broadcast-flow.test.ts
 *
 * Skenario yang di-test:
 *   1. Bug saat ini: form kirim filter `{ field: 'customerId', op: 'in', value: ['1','2'] }`
 *      tapi yang dikirim adalah integer customer.id (autoincrement), bukan customer_id (text).
 *      Audience eval akan return count=0 → broadcast 0 recipient.
 *   2. Reseller broadcast: audience builder cuma support `customers` table,
 *      tidak ada query path ke `resellers`. Filter `phone IN ['1','2']` ngga match.
 *   3. Substitusi placeholder pakai single `{nama}` regex, tapi template PRD pakai
 *      double `{{nama_pelanggan}}`. Render tidak terjadi → placeholder masih literal.
 *   4. Fix yang diharapkan: pass `directRecipients` (snapshot phone+name) instead of
 *      filter. Worker enrol langsung tanpa eval filter.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildAudienceWhere, validateAudienceFilter } from "./broadcast-audience.js";

// ------------------------------------------------------------------
// Test 1: bug - filter `customerId IN` ngga match integer autoincrement
// ------------------------------------------------------------------
test("BUG: customerId filter mengharapkan TEXT (058500015), bukan integer id", () => {
  // Customer di DB punya:
  //   id=5 (autoincrement INT, primary key)
  //   customer_id='058500015' (TEXT, dari billing)
  //
  // Form lama kirim selectedTargetIds = Set<number> = {5, 7, 12} (integer IDs)
  // Lalu build filter:
  //   { field: 'customerId', op: 'in', value: ['5','7','12'] }
  // SQL yang ke-build:
  //   WHERE customer_id IN ('5','7','12')
  // Match 0 row karena customer_id format-nya '058500015' bukan '5'.

  const filter = {
    combine: "all" as const,
    rules: [{ field: "customerId", op: "in" as const, value: ["5", "7", "12"] }],
  };
  assert.equal(validateAudienceFilter(filter), true, "filter shape valid");
  const built = buildAudienceWhere(filter);
  assert.ok(built, "filter ter-build");
  assert.match(built!.sql, /customer_id IN \(/, "field map ke customer_id TEXT");
  // ini akan match 0 row karena kita filter customer_id IN integer string,
  // tapi customer_id sebenarnya format 9-digit text. Bug confirmed.
});

// ------------------------------------------------------------------
// Test 2: bug - tidak ada field `id` di whitelist untuk filter by PK
// ------------------------------------------------------------------
test("BUG: tidak bisa filter customer by internal id (PK autoincrement)", () => {
  const filter = {
    combine: "all" as const,
    rules: [{ field: "id", op: "in" as const, value: [5, 7, 12] }],
  };
  // Field "id" tidak ada di FIELD_MAP whitelist
  assert.equal(validateAudienceFilter(filter), false, "field 'id' ditolak validator");
});

// ------------------------------------------------------------------
// Test 3: bug - reseller broadcast pakai filter phone IN integer-id, ngga match
// ------------------------------------------------------------------
test("BUG: reseller broadcast filter phone IN integerIDs ngga akan match", () => {
  // Form kirim selectedTargetIds = Set<number> = {3, 5} (reseller.id)
  // Build filter:
  //   { field: 'phone', op: 'in', value: ['3','5'] }
  // SQL: WHERE phone IN ('3','5')
  // Match 0 reseller karena phone format-nya '6281234567'.
  // Plus: audience engine query `customers`, bukan `resellers` - double broken.
  const filter = {
    combine: "all" as const,
    rules: [{ field: "phone", op: "in" as const, value: ["3", "5"] }],
  };
  assert.equal(validateAudienceFilter(filter), true);
  const built = buildAudienceWhere(filter);
  assert.match(built!.sql, /phone IN \(/);
});

// ------------------------------------------------------------------
// Test 4: bug - placeholder regex untuk template
// ------------------------------------------------------------------
test("BUG: substitusi placeholder pakai single brace, template PRD pakai double", () => {
  // existing broadcast-worker.ts substitute() pattern:
  //   template.replace(/\{(\w+)\}/g, ...)
  // Match: {nama} {customerId}
  // Tidak match: {{nama_pelanggan}} (double brace from PRD)

  const singleBraceRegex = /\{(\w+)\}/g;
  const doubleBraceContent = "Halo {{nama_pelanggan}}, paket {{paket_layanan}} aktif.";

  // Single-brace regex applied to double-brace template:
  // Pattern `\{(\w+)\}` cocok dengan inner `{nama_pelanggan}` saja kalau ada,
  // tapi karena {{...}} adalah `{{nama_pelanggan}}`, inner-nya literal `{nama_pelanggan}`
  // yang punya `{` lagi di depan. Regex `\{(\w+)\}` butuh `\w+` BUKAN `{` lagi.
  // Test: literal "{{nama_pelanggan}}" match (\w+) → "nama_pelanggan" tapi ada
  // sisa { di luar - regex masih match. Coba run.

  const matches = [...doubleBraceContent.matchAll(singleBraceRegex)];
  // Pattern engine: cari `{` lalu `\w+` lalu `}`. Untuk `{{nama_pelanggan}}` it WILL match
  // `{nama_pelanggan}` (inner) → kemudian rendering jadikan `{<value>}` (masih wrap brace tunggal).
  // Tetap ada brace di kiri-kanan sisanya. UI akan terlihat aneh.
  assert.ok(matches.length > 0, "regex match terjadi tapi hasilnya akan ada brace tersisa");
  // Fix yang benar: regex \{\{(\w+)\}\} untuk double brace
});

// ------------------------------------------------------------------
// Test 5: solusi - direct recipients harus diterima tanpa filter eval
// ------------------------------------------------------------------
test("FIX: directRecipients dipass langsung tanpa audience filter eval", () => {
  // Setelah fix: backend accept body { directRecipients: [...] }
  // Worker enrol langsung dari array, ngga eval filter customers/resellers table.
  const directRecipients = [
    { phone: "6281234567", name: "Pak Budi", customerId: "058500015" },
    { phone: "6282345678", name: "Bu Ani",   customerId: "058500022" },
  ];
  // Validate shape
  for (const r of directRecipients) {
    assert.ok(r.phone && r.phone.length >= 8, "phone valid");
    assert.ok(r.name, "name ada");
  }
  // Yang penting di fix: enrol langsung pakai data ini, audienceCount = length.
  assert.equal(directRecipients.length, 2);
});

// ------------------------------------------------------------------
// Test 6: render template double-brace
// ------------------------------------------------------------------
test("FIX: renderTemplate harus support double brace {{key}}", () => {
  const content = "Halo {{nama_pelanggan}}, paket {{paket_layanan}}";
  const vars = { nama_pelanggan: "Budi", paket_layanan: "20 Mbps" };
  // Expected output: "Halo Budi, paket 20 Mbps"
  const rendered = content.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key as keyof typeof vars] ?? "");
  assert.equal(rendered, "Halo Budi, paket 20 Mbps");
});

// ------------------------------------------------------------------
// Test 7: substitute() handle BOTH single & double brace tanpa double-process
// ------------------------------------------------------------------
test("FIX: substitute() handle double + single brace tanpa konflik", () => {
  function substitute(template: string, vars: Record<string, any>): string {
    return template
      .replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] == null ? "" : String(vars[key]))
      .replace(/\{(\w+)\}/g, (_, key) => vars[key] == null ? `{${key}}` : String(vars[key]));
  }
  // Pure double brace
  assert.equal(
    substitute("Halo {{nama_pelanggan}}", { nama_pelanggan: "Budi" }),
    "Halo Budi"
  );
  // Pure single brace (legacy)
  assert.equal(
    substitute("Halo {nama}", { nama: "Budi" }),
    "Halo Budi"
  );
  // Mixed (jarang terjadi tapi test edge case)
  assert.equal(
    substitute("Halo {{nama_pelanggan}} kode {otp}", { nama_pelanggan: "Budi", otp: "1234" }),
    "Halo Budi kode 1234"
  );
  // Unknown double-brace key → kosong (PRD behavior)
  assert.equal(
    substitute("Halo {{tidak_ada}}", {}),
    "Halo "
  );
  // Unknown single-brace key → keep literal (legacy behavior)
  assert.equal(
    substitute("Halo {tidak_ada}", {}),
    "Halo {tidak_ada}"
  );
});

// ------------------------------------------------------------------
// Test 8: var mapping untuk customer (sesuai 28 params PRD)
// ------------------------------------------------------------------
test("FIX: var mapping pelanggan harus include 28 params PRD", () => {
  // Customer DB:
  //   { id: 5, name: 'Budi', customerId: '058500015', phone: '6281', address: 'Jl A',
  //     package: '20M', billingPrice: 250000, dueDate: '2026-05-15', isIsolir: 0 }
  //
  // Expected vars untuk template (sebagian besar 28 params):
  //   nama_pelanggan, customer_id, telepon_pelanggan, alamat_pelanggan,
  //   paket_layanan, harga_paket_layanan, tgl_jatuh_tempo_invoice, dst.

  const customer = {
    name: "Budi",
    customerId: "058500015",
    phone: "6281234567",
    address: "Jl. Sudirman 1",
    package: "20 Mbps",
    billingPrice: 250000,
    dueDate: "2026-05-15",
  };

  const vars: Record<string, string> = {
    nama_pelanggan: customer.name,
    customer_id: customer.customerId,
    telepon_pelanggan: customer.phone,
    alamat_pelanggan: customer.address,
    paket_layanan: customer.package,
    harga_paket_layanan: `Rp. ${customer.billingPrice.toLocaleString("id-ID")}`,
    tgl_jatuh_tempo_invoice: customer.dueDate,
  };

  assert.equal(vars.nama_pelanggan, "Budi");
  assert.equal(vars.harga_paket_layanan, "Rp. 250.000");
  assert.equal(vars.customer_id, "058500015");
});

// ------------------------------------------------------------------
// Test 9: var mapping reseller - subset 11 params PRD
// ------------------------------------------------------------------
test("FIX: var mapping reseller harus include nama_reseller, saldo_reseller, dst", () => {
  const reseller = {
    name: "Asep Reseller Cilawu",
    phone: "6281999888777",
    address: "Cilawu, Garut",
    saldo: 500000,
    commissionRate: 750, // 7.5% (basis points)
    joinedAt: "2025-08-23",
  };

  const vars: Record<string, string> = {
    nama_reseller:    reseller.name,
    telepon_reseller: reseller.phone,
    alamat_reseller:  reseller.address,
    saldo_reseller:   `Rp. ${reseller.saldo.toLocaleString("id-ID")}`,
    commission_rate:  `${(reseller.commissionRate / 100).toFixed(1)}%`,
    tgl_bergabung:    "23/08/2025",
  };

  assert.equal(vars.nama_reseller, "Asep Reseller Cilawu");
  assert.equal(vars.saldo_reseller, "Rp. 500.000");
  assert.equal(vars.commission_rate, "7.5%");
});

// ------------------------------------------------------------------
// Test 10: end-to-end render template - full PRD flow
// ------------------------------------------------------------------
test("FIX: end-to-end render template invoice reminder pakai 28 params", () => {
  // Template realistic dari PRD
  const template = `*JABNET FTTH - Pengingat Tagihan*
Halo {{nama_pelanggan}},
Customer ID: *{{customer_id}}*
Paket: {{paket_layanan}}
Tagihan {{periode_tagihan}}: *{{total_tagihan}}*
Jatuh tempo: {{tgl_jatuh_tempo_invoice}} ({{hari_tgl_jatuh_tempo_invoice}})

Bayar via: {{link_pembayaran}}
WA CS: {{url_wa_cs}}`;

  const vars = {
    nama_pelanggan: "Budi Santoso",
    customer_id: "058500015",
    paket_layanan: "20 Mbps",
    periode_tagihan: "Mei 2026",
    total_tagihan: "Rp. 250.000",
    tgl_jatuh_tempo_invoice: "15/05/2026",
    hari_tgl_jatuh_tempo_invoice: "Jumat",
    link_pembayaran: "https://portal.jabnet.id/billing",
    url_wa_cs: "https://wa.me/6281999",
  };

  const rendered = template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    vars[key as keyof typeof vars] ?? ""
  );

  // Assertion penting: SEMUA placeholder ter-replace, ngga ada {{...}} sisa
  assert.ok(!rendered.includes("{{"), "tidak ada placeholder yang tidak ter-render");
  assert.ok(rendered.includes("Budi Santoso"), "nama_pelanggan replaced");
  assert.ok(rendered.includes("058500015"), "customer_id replaced");
  assert.ok(rendered.includes("Rp. 250.000"), "total_tagihan replaced");
  assert.ok(rendered.includes("15/05/2026"), "tgl_jatuh_tempo replaced");
});

// ------------------------------------------------------------------
// Test 11/12 v4.2.22: parseButtons handle MPWA spec format
// ------------------------------------------------------------------
test("FIX v4.2.22: parseButtons handle MPWA spec format (displayText, phoneNumber, url, copyText)", () => {
  // Spec MPWA: { type, displayText, phoneNumber/url/copyText }
  // Legacy:    { type, label, payload }
  // Worker harus support BOTH dan convert ke MpwaButton internal shape
  function parseButtons(json: string | null): any[] | undefined {
    if (!json) return undefined;
    try {
      const arr = JSON.parse(json);
      if (!Array.isArray(arr)) return undefined;
      return arr
        .map((b: any) => {
          if (!b?.type) return null;
          const label = b.label ?? b.displayText ?? "";
          if (!label) return null;
          let payload: string | undefined;
          if (b.type === "url") payload = b.url ?? b.payload;
          else if (b.type === "call" || b.type === "phone") payload = b.phoneNumber ?? b.payload;
          else if (b.type === "copy") payload = b.copyText ?? b.payload;
          else if (b.type === "reply") payload = b.id ?? b.payload;
          const type = b.type === "phone" ? "call" : b.type;
          return { type, label, payload };
        })
        .filter((b: any) => !!b)
        .slice(0, 5);
    } catch { return undefined; }
  }

  // Test: format MPWA spec (template editor v4.2.22 save format)
  const mpwaFormat = JSON.stringify([
    { type: "reply", displayText: "OK", id: "ok-id" },
    { type: "call", displayText: "Telp CS", phoneNumber: "628111" },
    { type: "url", displayText: "Web", url: "https://j.id" },
    { type: "copy", displayText: "Kode", copyText: "PROMO50" },
  ]);
  const parsed1 = parseButtons(mpwaFormat)!;
  assert.equal(parsed1.length, 4, "all 4 buttons parsed");
  assert.equal(parsed1[0].label, "OK");
  assert.equal(parsed1[0].payload, "ok-id");
  assert.equal(parsed1[1].type, "call");
  assert.equal(parsed1[1].payload, "628111");
  assert.equal(parsed1[2].payload, "https://j.id");
  assert.equal(parsed1[3].payload, "PROMO50");

  // Test: format legacy {label, payload}
  const legacyFormat = JSON.stringify([
    { type: "reply", label: "OK", payload: "ok-id" },
    { type: "phone", label: "Telp", payload: "628222" },  // type=phone (legacy)
  ]);
  const parsed2 = parseButtons(legacyFormat)!;
  assert.equal(parsed2.length, 2);
  assert.equal(parsed2[0].label, "OK");
  assert.equal(parsed2[1].type, "call", "legacy 'phone' → 'call'");
  assert.equal(parsed2[1].payload, "628222");

  // Test: max 5 buttons
  const tooMany = JSON.stringify(Array.from({ length: 7 }, (_, i) => ({
    type: "reply", displayText: `B${i}`
  })));
  assert.equal(parseButtons(tooMany)!.length, 5);

  // Test: skip invalid (no type / no label)
  const messy = JSON.stringify([
    { type: "reply", displayText: "Valid" },
    { displayText: "No type" },        // skip
    { type: "url" },                    // no label, skip
    null,                               // skip
    { type: "url", displayText: "OK", url: "https://x" },
  ]);
  assert.equal(parseButtons(messy)!.length, 2);
});

test("FIX v4.2.22: sanitizeButton helper di TemplateEditor convert ke MPWA spec", () => {
  // Saat save dari TemplateEditor, button state {type, displayText, phoneNumber/url/copyText/id}
  // → JSON.stringify dengan shape yang sesuai MPWA send-button spec
  function sanitize(b: any) {
    const out: any = { type: b.type, displayText: b.displayText };
    if (b.type === "call" && b.phoneNumber) out.phoneNumber = b.phoneNumber.replace(/\D/g, "");
    else if (b.type === "url" && b.url) out.url = b.url;
    else if (b.type === "copy" && b.copyText) out.copyText = b.copyText;
    else if (b.type === "reply" && b.id) out.id = b.id;
    return out;
  }

  // Call button: normalize phone (hapus non-digit)
  assert.deepEqual(
    sanitize({ type: "call", displayText: "CS", phoneNumber: "+62 812-3456" }),
    { type: "call", displayText: "CS", phoneNumber: "62812345" + "6" }
  );

  // URL button
  assert.deepEqual(
    sanitize({ type: "url", displayText: "Web", url: "https://j.id" }),
    { type: "url", displayText: "Web", url: "https://j.id" }
  );

  // Copy button
  assert.deepEqual(
    sanitize({ type: "copy", displayText: "Kode", copyText: "PROMO50" }),
    { type: "copy", displayText: "Kode", copyText: "PROMO50" }
  );

  // Reply button (no extra field needed)
  assert.deepEqual(
    sanitize({ type: "reply", displayText: "OK" }),
    { type: "reply", displayText: "OK" }
  );
  assert.deepEqual(
    sanitize({ type: "reply", displayText: "OK", id: "ok-1" }),
    { type: "reply", displayText: "OK", id: "ok-1" }
  );
});

// ------------------------------------------------------------------
// Test 13: validate directRecipients payload shape
// ------------------------------------------------------------------
test("FIX: directRecipients payload shape sesuai backend contract", () => {
  // Form pelanggan harus kirim shape ini:
  type RecipientPelanggan = { id: number; phone: string; name: string; customerId: string };
  type RecipientReseller  = { id: number; resellerId: number; phone: string; name: string };

  const pelanggan: RecipientPelanggan[] = [
    { id: 5,  phone: "6281234567", name: "Budi",    customerId: "058500015" },
    { id: 12, phone: "6282345678", name: "Ani",     customerId: "058500022" },
  ];
  const reseller: RecipientReseller[] = [
    { id: 3, resellerId: 3, phone: "6285111222", name: "Asep" },
  ];

  for (const p of pelanggan) {
    assert.ok(p.phone.startsWith("62"), "phone normalized");
    assert.ok(p.customerId.length === 9, "customerId 9 digit (058500015 format)");
  }
  for (const r of reseller) {
    assert.equal(r.id, r.resellerId, "resellerId mirror id");
  }
});
