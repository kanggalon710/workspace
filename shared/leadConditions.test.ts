import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyConditionOp, compareLeadAttr, evaluateLeadConditionGroups,
  LEAD_CONDITION_ATTRS, leadConditionAttrValid, opValidForAttr,
} from "./leadConditions.js";

test("applyConditionOp: string ops are case-insensitive + trimmed", () => {
  assert.equal(applyConditionOp(" Cilawu ", "eq", "cilawu"), true);
  assert.equal(applyConditionOp("Cilawu", "neq", "Garut"), true);
  assert.equal(applyConditionOp("Jl Mawar", "contains", "mawar"), true);
  assert.equal(applyConditionOp("", "empty", ""), true);
  assert.equal(applyConditionOp("x", "not_empty", ""), true);
});

test("applyConditionOp: gt/lt numeric, non-numeric → false", () => {
  assert.equal(applyConditionOp("150", "lt", "200"), true);
  assert.equal(applyConditionOp("250", "lt", "200"), false);
  assert.equal(applyConditionOp("250", "gt", "200"), true);
  assert.equal(applyConditionOp("abc", "gt", "200"), false);
});

test("compareLeadAttr: source canonicalized; odpId exists; distance numeric", () => {
  const lead = { id: 1, mitraId: 1, source: "meta_ads", odpId: 9, distanceMeters: 150, district: "Cilawu" };
  assert.equal(compareLeadAttr(lead, "source", "eq", "meta_leads"), true);
  assert.equal(compareLeadAttr(lead, "odpId", "not_empty", ""), true);
  assert.equal(compareLeadAttr({ ...lead, odpId: null }, "odpId", "empty", ""), true);
  assert.equal(compareLeadAttr(lead, "distanceMeters", "lt", "200"), true);
  assert.equal(compareLeadAttr(lead, "district", "eq", "cilawu"), true);
});

test("evaluateLeadConditionGroups: OR-of-AND, empty groups = true", () => {
  const lead = { id: 1, mitraId: 1, source: "meta_ads", odpId: 9, distanceMeters: 150 };
  assert.equal(evaluateLeadConditionGroups([], lead), true);
  assert.equal(evaluateLeadConditionGroups([[
    { source: "lead", attr: "source", op: "eq", value: "meta_leads" },
    { source: "lead", attr: "odpId", op: "not_empty" },
  ]], lead), true);
  assert.equal(evaluateLeadConditionGroups([
    [{ source: "lead", attr: "distanceMeters", op: "gt", value: "200" }],
    [{ source: "lead", attr: "source", op: "eq", value: "meta_leads" }],
  ], lead), true);
  assert.equal(evaluateLeadConditionGroups([
    [{ source: "lead", attr: "distanceMeters", op: "gt", value: "200" }],
  ], lead), false);
});

test("catalog validators", () => {
  assert.equal(leadConditionAttrValid("source"), true);
  assert.equal(leadConditionAttrValid("nope"), false);
  assert.equal(opValidForAttr("distanceMeters", "gt"), true);
  assert.equal(opValidForAttr("distanceMeters", "contains"), false);
  assert.equal(opValidForAttr("odpId", "not_empty"), true);
  assert.ok(LEAD_CONDITION_ATTRS.length >= 7);
});

test("campaign condition attr (LP2b)", () => {
  assert.equal(leadConditionAttrValid("campaign"), true);
  assert.equal(opValidForAttr("campaign", "contains"), true);
  assert.equal(compareLeadAttr({ id: 1, mitraId: 1, campaign: "Promo Fiber" } as any, "campaign", "contains", "promo"), true);
});
