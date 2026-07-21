import { test } from "node:test";
import assert from "node:assert/strict";
import { extractAdRefs } from "./adCampaignFields.js";

test("extracts campaign/adset/ad from snake_case keys", () => {
  assert.deepEqual(extractAdRefs({
    campaign_id: "120", campaign_name: "Promo Fiber",
    adset_id: "55", adset_name: "Cilawu Set",
    ad_id: "9", ad_name: "Video A",
  }), {
    campaign: { externalId: "120", name: "Promo Fiber" },
    adSet: { externalId: "55", name: "Cilawu Set" },
    adName: { externalId: "9", name: "Video A" },
  });
});

test("supports camelCase + adgroup alias; trims; omits empty refs", () => {
  assert.deepEqual(extractAdRefs({ campaignName: "X", adgroup_id: " 7 ", adName: "" }), {
    campaign: { name: "X" },
    adSet: { externalId: "7" },
  });
});

test("no ad keys → empty object", () => {
  assert.deepEqual(extractAdRefs({ foo: "bar" }), {});
  assert.deepEqual(extractAdRefs(null), {});
  assert.deepEqual(extractAdRefs(undefined), {});
});
