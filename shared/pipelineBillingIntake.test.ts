import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BILLING_ATTRS,
  FILTER_KEYS,
  attrCompatibleWithFieldType,
  preferredFieldTypeForAttr,
  normalizeDateValue,
  customerMatchesFilter,
  customerToFieldValues,
  customerTitle,
  daysOverdue,
  type IntakeCustomer,
  type BillingFilter,
} from "./pipelineBillingIntake.js";

const cust = (over: Partial<IntakeCustomer> = {}): IntakeCustomer => ({
  id: 42,
  name: "Budi",
  customerId: "052500015",
  phone: "0812",
  email: "b@x.id",
  package: "20Mbps",
  billingPrice: 150000,
  billingStatus: "belum_lunas",
  dueDate: "2026-05-01",
  isolirDate: null,
  address: "Jl. Mawar",
  district: "Cilawu",
  village: "Sukamaju",
  customerType: "rumahan",
  status: "active",
  installDate: "2023-01-01",
  pppoeUsername: "budi",
  ontSerialNumber: "SN1",
  isIsolir: 0,
  lat: -7.2,
  lng: 107.9,
  ...over,
});

test("matches when all set filter keys satisfied; unset keys ignored", () => {
  const f: BillingFilter = { isIsolir: 1, billingStatus: "belum_lunas" };
  assert.equal(customerMatchesFilter(cust({ isIsolir: 1 }), f), true);
  assert.equal(customerMatchesFilter(cust({ isIsolir: 0 }), f), false);
  assert.equal(customerMatchesFilter(cust({ isIsolir: 1, billingStatus: "lunas" }), f), false);
  assert.equal(customerMatchesFilter(cust({ isIsolir: 1 }), {}), true);
});

test("string filters are case-insensitive and trimmed", () => {
  assert.equal(customerMatchesFilter(cust({ customerType: "Rumahan" }), { customerType: "rumahan" }), true);
  assert.equal(customerMatchesFilter(cust({ status: "active" }), { status: "ACTIVE " }), true);
});

test("field values: omit empty, stringify numbers, coordinate from lat/lng", () => {
  const vals = customerToFieldValues(cust(), [
    { attr: "billingPrice", targetFieldId: 1 },
    { attr: "phone", targetFieldId: 2 },
    { attr: "coordinate", targetFieldId: 3 },
    { attr: "isolirDate", targetFieldId: 4 },
  ]);
  const map = Object.fromEntries(vals.map((v) => [v.fieldId, v.value]));
  assert.equal(map[1], "150000");
  assert.equal(map[2], "0812");
  assert.equal(map[3], JSON.stringify({ lat: -7.2, lng: 107.9 }));
  assert.equal(map[4], undefined);
});

test("coordinate omitted when lat/lng missing", () => {
  const vals = customerToFieldValues(cust({ lat: null, lng: null }), [{ attr: "coordinate", targetFieldId: 3 }]);
  assert.equal(vals.length, 0);
});

test("title falls back name -> customer_id -> placeholder", () => {
  assert.equal(customerTitle(cust(), "name"), "Budi");
  assert.equal(customerTitle(cust({ name: "" }), "name"), "052500015");
  assert.equal(customerTitle(cust({ name: "", customerId: "" }), "name"), "Pelanggan #42");
  assert.equal(customerTitle(cust(), "package"), "20Mbps");
});

test("attr/field-type compatibility", () => {
  assert.equal(attrCompatibleWithFieldType("billingPrice", "number"), true);
  assert.equal(attrCompatibleWithFieldType("billingPrice", "text"), false);
  assert.equal(attrCompatibleWithFieldType("coordinate", "coordinate"), true);
  assert.equal(attrCompatibleWithFieldType("phone", "phone"), true);
  assert.equal(attrCompatibleWithFieldType("name", "text"), true);
});

test("date-ish billing attrs accept the date field type", () => {
  for (const attr of ["dueDate", "isolirDate", "installDate"]) {
    assert.equal(attrCompatibleWithFieldType(attr, "date"), true, `${attr} should accept date`);
    // still backward-compatible with text fields already mapped before this change
    assert.equal(attrCompatibleWithFieldType(attr, "text"), true, `${attr} should still accept text`);
  }
});

test("preferredFieldTypeForAttr: date for date-ish, native for typed, text fallback", () => {
  assert.equal(preferredFieldTypeForAttr("isolirDate"), "date");
  assert.equal(preferredFieldTypeForAttr("dueDate"), "date");
  assert.equal(preferredFieldTypeForAttr("installDate"), "date");
  assert.equal(preferredFieldTypeForAttr("billingPrice"), "number");
  assert.equal(preferredFieldTypeForAttr("phone"), "phone");
  assert.equal(preferredFieldTypeForAttr("coordinate"), "coordinate");
  assert.equal(preferredFieldTypeForAttr("name"), "text");
  assert.equal(preferredFieldTypeForAttr("unknown_attr"), "text");
});

test("normalizeDateValue: extracts YYYY-MM-DD without timezone shift", () => {
  assert.equal(normalizeDateValue("2026-06-09"), "2026-06-09");
  assert.equal(normalizeDateValue("2026-06-09 00:00:00"), "2026-06-09"); // tz-safe: no off-by-one
  assert.equal(normalizeDateValue("2026-06-09T17:30:00Z"), "2026-06-09");
  assert.equal(normalizeDateValue(" 2026-06-09 "), "2026-06-09");
  assert.equal(normalizeDateValue(""), "");
  assert.equal(normalizeDateValue("not-a-date"), "");
});

test("customerToFieldValues normalizes date-typed targets, leaves others raw", () => {
  const vals = customerToFieldValues(
    cust({ isolirDate: "2026-06-09 00:00:00", dueDate: "2026-05-01" }),
    [
      { attr: "isolirDate", targetFieldId: 4 },
      { attr: "dueDate", targetFieldId: 5 },
      { attr: "name", targetFieldId: 6 },
    ],
    { 4: "date", 5: "text", 6: "text" },
  );
  const map = Object.fromEntries(vals.map((v) => [v.fieldId, v.value]));
  assert.equal(map[4], "2026-06-09");          // date-typed → normalized
  assert.equal(map[5], "2026-05-01");          // text-typed → raw (already clean here)
  assert.equal(map[6], "Budi");
});

test("customerToFieldValues drops unparseable date for a date-typed target", () => {
  const vals = customerToFieldValues(
    cust({ isolirDate: "belum" }),
    [{ attr: "isolirDate", targetFieldId: 4 }],
    { 4: "date" },
  );
  assert.equal(vals.length, 0); // garbage date not written (would blank the date input anyway)
});

test("daysOverdue: floors days since dueDate, null when missing/unparseable", () => {
  const now = new Date("2026-05-11T00:00:00Z").getTime();
  assert.equal(daysOverdue("2026-05-01", now), 10);
  assert.equal(daysOverdue("2026-05-11", now), 0);
  assert.equal(daysOverdue("2026-05-15", now), -4); // belum jatuh tempo
  assert.equal(daysOverdue(null, now), null);
  assert.equal(daysOverdue("", now), null);
  assert.equal(daysOverdue("belum", now), null);
});

test("minDaysOverdue: butuh dueDate minimal N hari overdue", () => {
  const now = new Date("2026-05-11T00:00:00Z").getTime();
  // dueDate 2026-05-01 → 10 hari overdue
  assert.equal(customerMatchesFilter(cust({ dueDate: "2026-05-01" }), { minDaysOverdue: 7 }, now), true);
  assert.equal(customerMatchesFilter(cust({ dueDate: "2026-05-01" }), { minDaysOverdue: 10 }, now), true);
  assert.equal(customerMatchesFilter(cust({ dueDate: "2026-05-01" }), { minDaysOverdue: 11 }, now), false);
  // tanpa dueDate → tak bisa overdue
  assert.equal(customerMatchesFilter(cust({ dueDate: null }), { minDaysOverdue: 1 }, now), false);
  // 0 / unset → diabaikan
  assert.equal(customerMatchesFilter(cust({ dueDate: null }), { minDaysOverdue: 0 }, now), true);
  assert.equal(customerMatchesFilter(cust({ dueDate: null }), {}, now), true);
});

test("minDaysOverdue pakai overdueFromAttr (default dueDate)", () => {
  const now = new Date("2026-05-11T00:00:00Z").getTime();
  // dueDate 1 hari lalu, isolirDate 10 hari lalu
  const c = cust({ dueDate: "2026-05-10", isolirDate: "2026-05-01" });
  assert.equal(customerMatchesFilter(c, { minDaysOverdue: 7 }, now), false);                              // default dueDate → 1 hari
  assert.equal(customerMatchesFilter(c, { minDaysOverdue: 7, overdueFromAttr: "dueDate" }, now), false);
  assert.equal(customerMatchesFilter(c, { minDaysOverdue: 7, overdueFromAttr: "isolirDate" }, now), true); // isolir → 10 hari
  // attr referensi kosong di customer → tak bisa overdue
  assert.equal(customerMatchesFilter(cust({ isolirDate: null }), { minDaysOverdue: 1, overdueFromAttr: "isolirDate" }, now), false);
});

test("minDaysOverdue digabung filter lain (AND)", () => {
  const now = new Date("2026-05-11T00:00:00Z").getTime();
  const f: BillingFilter = { isIsolir: 1, minDaysOverdue: 7 };
  assert.equal(customerMatchesFilter(cust({ isIsolir: 1, dueDate: "2026-05-01" }), f, now), true);
  assert.equal(customerMatchesFilter(cust({ isIsolir: 0, dueDate: "2026-05-01" }), f, now), false); // bukan isolir
  assert.equal(customerMatchesFilter(cust({ isIsolir: 1, dueDate: "2026-05-09" }), f, now), false); // baru 2 hari
});

test("catalogs are exported and sane", () => {
  assert.ok(BILLING_ATTRS.some((a) => a.key === "coordinate"));
  assert.deepEqual([...FILTER_KEYS].sort(), ["billingStatus", "customerType", "isIsolir", "status"]);
});
