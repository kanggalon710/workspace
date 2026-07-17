import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregate, formatMetricValue, METRIC_SOURCES, METRIC_AGGREGATIONS, METRIC_TYPES } from "./pipelineMetrics.js";

test("registries", () => {
  assert.deepEqual(METRIC_SOURCES.map((s) => s.source), ["card_count", "stage_count", "field_agg", "formula"]);
  assert.deepEqual(METRIC_AGGREGATIONS.map((a) => a.aggregation), ["count", "sum", "avg", "min", "max", "distinct"]);
  assert.deepEqual(METRIC_TYPES.map((t) => t.type), ["number", "currency", "percentage"]);
});

test("aggregate", () => {
  assert.equal(aggregate(["10", "20", "x", null], "sum"), 30);
  assert.equal(aggregate(["10", "20", "30"], "avg"), 20);
  assert.equal(aggregate(["10", "5", "30"], "min"), 5);
  assert.equal(aggregate(["10", "5", "30"], "max"), 30);
  assert.equal(aggregate([], "sum"), 0);
  assert.equal(aggregate([], "avg"), 0);
  assert.equal(aggregate(["a", "b", "", null, "c"], "count"), 3);
  assert.equal(aggregate(["a", "a", "b", ""], "distinct"), 2);
});

test("formatMetricValue", () => {
  assert.equal(formatMetricValue(120000000, { type: "currency" }), "Rp 120.000.000");
  assert.equal(formatMetricValue(35, { type: "number" }), "35");
  assert.equal(formatMetricValue(90, { type: "percentage" }), "90%");
  assert.equal(formatMetricValue(1234.5, { type: "number", decimals: 1 }), "1.234,5");
  assert.equal(formatMetricValue(5, { type: "number", prefix: "≈ ", suffix: " kartu" }), "≈ 5 kartu");
});
