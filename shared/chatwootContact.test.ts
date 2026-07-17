import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChatwootContactPayload, buildChatwootContactLabels } from "./chatwootContact.js";

test("payload: maps fields, normalizes phone to +62, sets identifier + custom_attributes", () => {
  const p = buildChatwootContactPayload(
    { name: "Budi", customerId: "052500015", phone: "08123456789", email: "b@x.id", status: "active", customerType: "rumahan" },
    { tenant: "jabnet" },
  );
  assert.equal(p.name, "Budi");
  assert.equal(p.phone_number, "+628123456789");
  assert.equal(p.email, "b@x.id");
  assert.equal(p.identifier, "052500015");
  assert.deepEqual(p.custom_attributes, { jabnet_customer_id: "052500015", tenant: "jabnet", status: "active", customer_type: "rumahan" });
});

test("payload: omits empty phone/email and empty custom_attributes", () => {
  const p = buildChatwootContactPayload({ name: "X", customerId: "1", phone: "", email: null, status: null, customerType: null }, { tenant: "jabnet" });
  assert.equal("phone_number" in p, false);
  assert.equal("email" in p, false);
  assert.deepEqual(p.custom_attributes, { jabnet_customer_id: "1", tenant: "jabnet" });
});

test("labels: slugified, deduped, empties dropped", () => {
  assert.deepEqual(
    buildChatwootContactLabels({ status: "Active", customerType: "Rumahan", customerId: "1", name: "x", phone: "", email: "" }, { tenant: "JABNET" }),
    ["jabnet", "active", "rumahan"],
  );
  assert.deepEqual(
    buildChatwootContactLabels({ status: null, customerType: null, customerId: "1", name: "x", phone: "", email: "" }, { tenant: "jabnet" }),
    ["jabnet"],
  );
});
