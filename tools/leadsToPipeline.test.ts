import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LEAD_PIPELINE_STAGES,
  LEAD_PIPELINE_FIELDS,
  leadToCard,
  leadToFieldValues,
  classifyActivity,
  activityToComment,
  activityToActivity,
  resolveAssignee,
} from "./leadsToPipeline.js";

const sampleLead = {
  id: 42, name: "Budi", phone: "08123", address: "Jl. Mawar", category: "rumahan",
  source: "canvassing", notes: "tertarik 50Mbps", district: "Cilawu", village: "Sukamaju",
  loss_reason: null, odp_id: 7, distance_meters: 120, lat: -7.2, lng: 107.9,
  stage: "interested", priority: "high", assigned_to: 5, created_by: 3,
  created_at: "2026-05-01T00:00:00.000Z", updated_at: "2026-05-10T00:00:00.000Z",
};

test("LEAD_PIPELINE_STAGES: 6 stages, ordered, with labels+colors", () => {
  const s = LEAD_PIPELINE_STAGES();
  assert.equal(s.length, 6);
  assert.deepEqual(s.map((x) => x.key), ["new", "contacted", "interested", "negotiation", "won", "lost"]);
  assert.deepEqual(s.map((x) => x.position), [0, 1, 2, 3, 4, 5]);
  assert.equal(s[4].label, "Closing ✅");
  assert.equal(s[0].color, "#6B7280");
});

test("LEAD_PIPELINE_FIELDS: expected keys + types", () => {
  const byKey = Object.fromEntries(LEAD_PIPELINE_FIELDS.map((f) => [f.key, f]));
  assert.equal(byKey.phone.type, "phone");
  assert.equal(byKey.address.type, "textarea");
  assert.equal(byKey.category.type, "dropdown");
  assert.deepEqual(byKey.category.options, ["rumahan", "bisnis", "perkantoran", "sekolah", "lainnya"]);
  assert.equal(byKey.source.type, "dropdown");
  assert.equal(byKey.odp_id.type, "number");
  assert.equal(byKey.coordinate.type, "coordinate");
  assert.equal(byKey.source_lead_id.type, "number");
});

test("leadToCard: maps title/stage/assignee/priority/dates", () => {
  const stageIdByKey = { new: 10, contacted: 11, interested: 12, negotiation: 13, won: 14, lost: 15 };
  const c = leadToCard(sampleLead, stageIdByKey, 5);
  assert.equal(c.title, "Budi");
  assert.equal(c.stageId, 12);
  assert.equal(c.assigneeId, 5);
  assert.equal(c.priority, "high");
  assert.equal(c.createdBy, 3);
  assert.equal(c.createdAt, "2026-05-01T00:00:00.000Z");
  assert.equal(c.stageEnteredAt, "2026-05-10T00:00:00.000Z");
});

test("leadToCard: unknown stage falls back to first stage", () => {
  const stageIdByKey = { new: 10, contacted: 11, interested: 12, negotiation: 13, won: 14, lost: 15 };
  const c = leadToCard({ ...sampleLead, stage: "weird" }, stageIdByKey, null);
  assert.equal(c.stageId, 10); // LEAD_STAGES[0] === "new"
  assert.equal(c.assigneeId, null);
});

test("leadToFieldValues: stringifies numbers, omits null/empty, sets source_lead_id", () => {
  const vals = Object.fromEntries(leadToFieldValues(sampleLead).map((v) => [v.fieldKey, v.value]));
  assert.equal(vals.phone, "08123");
  assert.equal(vals.odp_id, "7");
  assert.equal(vals.distance_m, "120");
  assert.equal(vals.lat, undefined);
  assert.equal(vals.lng, undefined);
  assert.equal(vals.coordinate, JSON.stringify({ lat: sampleLead.lat, lng: sampleLead.lng }));
  assert.equal(vals.source_lead_id, "42");
  assert.equal("loss_reason" in vals, false);
});

test("classifyActivity: comment vs activity buckets", () => {
  for (const t of ["note", "call", "whatsapp", "visit", "photo"]) assert.equal(classifyActivity(t), "comment");
  for (const t of ["stage_change", "assigned", "converted"]) assert.equal(classifyActivity(t), "activity");
});

test("activityToComment: labels body + carries author/date", () => {
  const cm = activityToComment({ id: 1, lead_id: 42, user_id: 5, type: "call", content: "tidak diangkat", created_at: "2026-05-02T00:00:00.000Z" });
  assert.equal(cm.body, "[Telepon] tidak diangkat");
  assert.equal(cm.authorId, 5);
  assert.equal(cm.createdAt, "2026-05-02T00:00:00.000Z");
  const photo = activityToComment({ id: 2, lead_id: 42, user_id: 5, type: "photo", content: null, created_at: "x" });
  assert.equal(photo.body, "[Foto]");
});

test("activityToActivity: passes type/detail/actor/date", () => {
  const av = activityToActivity({ id: 3, lead_id: 42, user_id: 5, type: "stage_change", content: '{"from":"new","to":"contacted"}', created_at: "2026-05-03T00:00:00.000Z" });
  assert.equal(av.type, "stage_change");
  assert.equal(av.detail, '{"from":"new","to":"contacted"}');
  assert.equal(av.actorId, 5);
  assert.equal(av.createdAt, "2026-05-03T00:00:00.000Z");
});

test("LEAD_PIPELINE_FIELDS has a coordinate field and no lat/lng", () => {
  const keys = LEAD_PIPELINE_FIELDS.map((f) => f.key);
  assert.ok(keys.includes("coordinate"));
  assert.equal(keys.includes("lat"), false);
  assert.equal(keys.includes("lng"), false);
  assert.equal(LEAD_PIPELINE_FIELDS.find((f) => f.key === "coordinate")?.type, "coordinate");
});

test("leadToFieldValues: coordinate only when both lat & lng are finite", () => {
  const v1 = Object.fromEntries(leadToFieldValues({ ...sampleLead, lat: -7.2, lng: 107.9 }).map((v) => [v.fieldKey, v.value]));
  assert.equal(v1.coordinate, JSON.stringify({ lat: -7.2, lng: 107.9 }));
  const v2 = Object.fromEntries(leadToFieldValues({ ...sampleLead, lat: -7.2, lng: null }).map((v) => [v.fieldKey, v.value]));
  assert.equal(v2.coordinate, undefined);
  const v3 = Object.fromEntries(leadToFieldValues({ ...sampleLead, lat: null, lng: null }).map((v) => [v.fieldKey, v.value]));
  assert.equal(v3.coordinate, undefined);
});

test("resolveAssignee: in-tenant kept, else default, else null", () => {
  const valid = new Set([1, 2, 3]);
  assert.equal(resolveAssignee(2, valid, null), 2);
  assert.equal(resolveAssignee(9, valid, 1), 1);
  assert.equal(resolveAssignee(9, valid, null), null);
  assert.equal(resolveAssignee(null, valid, 1), 1);
  assert.equal(resolveAssignee(null, valid, null), null);
});
