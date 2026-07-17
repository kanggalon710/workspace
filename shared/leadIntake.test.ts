import { test } from "node:test";
import assert from "node:assert/strict";
import {
  leadTitle, leadToFieldValues, parseLeadTriggerConfig,
  resolveDuplicateAction, leadRuleMatchesSource, type IntakeLead,
} from "./leadIntake.js";

const lead: IntakeLead = {
  id: 7, mitraId: 1, name: "Budi", phone: "08123", address: "Jl. A", category: "rumahan",
  notes: "n", source: "meta_ads", lat: -7.1, lng: 107.9, distanceMeters: 120,
  district: "Cilawu", village: "Desa X", stage: "new", priority: "medium", assignedTo: 4, odpId: 9,
};

test("leadTitle uses titleSource, falls back to name then #id", () => {
  assert.equal(leadTitle(lead, "name"), "Budi");
  assert.equal(leadTitle({ ...lead, name: "" }, "name"), "Lead #7");
  assert.equal(leadTitle(lead, "phone"), "08123");
});

test("leadToFieldValues maps attrs, skips empty, handles coordinate + odp name", () => {
  const out = leadToFieldValues(
    lead,
    [
      { attr: "phone", targetFieldId: 30 },
      { attr: "coordinate", targetFieldId: 31 },
      { attr: "odpId", targetFieldId: 32 },
      { attr: "notes", targetFieldId: 33 },
    ],
    { 31: "coordinate" },
    { 9: "ODP-CLW-001" },
  );
  assert.deepEqual(out, [
    { fieldId: 30, value: "08123" },
    { fieldId: 31, value: JSON.stringify({ lat: -7.1, lng: 107.9 }) },
    { fieldId: 32, value: "ODP-CLW-001" },
    { fieldId: 33, value: "n" },
  ]);
});

test("resolveDuplicateAction maps mode + existence", () => {
  assert.equal(resolveDuplicateAction("create", true), "create");
  assert.equal(resolveDuplicateAction("ignore", true), "skip");
  assert.equal(resolveDuplicateAction("ignore", false), "create");
  assert.equal(resolveDuplicateAction("update", true), "update");
  assert.equal(resolveDuplicateAction("update", false), "create");
  assert.equal(resolveDuplicateAction("reopen", true), "reopen");
  assert.equal(resolveDuplicateAction("reopen", false), "create");
});

test("leadRuleMatchesSource: empty list = match all; else canonical match", () => {
  assert.equal(leadRuleMatchesSource([], "meta_ads"), true);
  assert.equal(leadRuleMatchesSource(["meta_leads"], "meta_ads"), true);
  assert.equal(leadRuleMatchesSource(["coverage_check"], "meta_ads"), false);
});

test("parseLeadTriggerConfig defaults + validation", () => {
  assert.equal(parseLeadTriggerConfig(null), null);
  const c = parseLeadTriggerConfig(JSON.stringify({ entryStageId: 5 }));
  assert.deepEqual(c, { sources: [], entryStageId: 5, titleSource: "name", fieldMap: [], onDuplicate: "ignore", dedupBy: "lead_id", reopenStageId: null });
});

test("leadToFieldValues: source attr is canonicalized (meta_ads → meta_leads)", () => {
  // lead.source = "meta_ads"; canonical form is "meta_leads"
  const out = leadToFieldValues(
    lead,
    [{ attr: "source", targetFieldId: 50 }],
    { 50: "text" },
  );
  assert.deepEqual(out, [{ fieldId: 50, value: "meta_leads" }]);
});

test("leadToFieldValues: date-type field runs value through normalizeDateValue", () => {
  const dateLead: IntakeLead = {
    id: 8, mitraId: 1,
    notes: "2026-06-09T00:00:00",
  };
  const out = leadToFieldValues(
    dateLead,
    [{ attr: "notes", targetFieldId: 60 }],
    { 60: "date" },
  );
  assert.deepEqual(out, [{ fieldId: 60, value: "2026-06-09" }]);
});

test("leadRuleMatchesSource: null source with non-empty list is false; empty list is true", () => {
  assert.equal(leadRuleMatchesSource(["canvassing"], null), false);
  assert.equal(leadRuleMatchesSource([], null), true);
});

test("leadToFieldValues maps campaign attr (LP2b)", () => {
  const out = leadToFieldValues(
    { id: 1, mitraId: 1, campaign: "Promo Fiber" } as any,
    [{ attr: "campaign", targetFieldId: 40 }],
    {},
  );
  assert.deepEqual(out, [{ fieldId: 40, value: "Promo Fiber" }]);
});

test("parseLeadTriggerConfig reads notify (LP3)", () => {
  const c = parseLeadTriggerConfig(JSON.stringify({ entryStageId: 5, notify: { channels: ["bell"], bellTarget: "creator" } }));
  assert.deepEqual(c?.notify, { channels: ["bell"], bellTarget: "creator" });
  const c2 = parseLeadTriggerConfig(JSON.stringify({ entryStageId: 5 }));
  assert.equal(c2?.notify, undefined);
});
