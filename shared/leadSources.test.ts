import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalLeadSource, LEAD_SOURCE_LABELS, LEAD_SOURCE_OPTIONS } from "./leadSources.js";

test("normalizes known aliases to canonical", () => {
  assert.equal(canonicalLeadSource("landing_page"), "coverage_check");
  assert.equal(canonicalLeadSource("meta_ads"), "meta_leads");
  assert.equal(canonicalLeadSource("tiktok_ads"), "tiktok_leads");
  assert.equal(canonicalLeadSource("canvassing"), "canvassing");
  assert.equal(canonicalLeadSource("prospect_finder"), "prospect_finder");
  assert.equal(canonicalLeadSource("pipeline"), "pipeline");
});

test("is case/space insensitive and falls back to 'other'", () => {
  assert.equal(canonicalLeadSource("  Meta_Ads "), "meta_leads");
  assert.equal(canonicalLeadSource("unknown_xyz"), "other");
  assert.equal(canonicalLeadSource(null), "other");
  assert.equal(canonicalLeadSource(undefined), "other");
});

test("every canonical source has a label and appears in options", () => {
  for (const opt of LEAD_SOURCE_OPTIONS) {
    assert.equal(typeof LEAD_SOURCE_LABELS[opt.value], "string");
    assert.ok(LEAD_SOURCE_LABELS[opt.value].length > 0);
  }
});

test("pipeline source has label", () => {
  assert.equal(LEAD_SOURCE_LABELS["pipeline"], "Dari Pipeline");
});
