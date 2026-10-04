import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isKnownSpaPath,
  isIndexablePath,
  buildRobotsTxt,
  buildSitemapXml,
  INDEXABLE_PAGES,
} from "./routesManifest.js";

test("isKnownSpaPath: static routes, root, and trailing slash", () => {
  assert.equal(isKnownSpaPath("/"), true);
  assert.equal(isKnownSpaPath("/coverage-check"), true);
  assert.equal(isKnownSpaPath("/coverage-check/"), true);
  assert.equal(isKnownSpaPath("/login"), true);
  assert.equal(isKnownSpaPath("/tickets/dashboard"), true);
});

test("isKnownSpaPath: dynamic-param routes match by prefix", () => {
  assert.equal(isKnownSpaPath("/bugs/42"), true);
  assert.equal(isKnownSpaPath("/pipelines/7"), true);
  assert.equal(isKnownSpaPath("/portal/track/123"), true);
  assert.equal(isKnownSpaPath("/t/mitra-abc/portal/login"), true);
  assert.equal(isKnownSpaPath("/csat/sometoken"), true);
  assert.equal(isKnownSpaPath("/work/9"), true);
});

test("isKnownSpaPath: unknown paths are rejected (real 404)", () => {
  assert.equal(isKnownSpaPath("/definitely-not-a-page"), false);
  assert.equal(isKnownSpaPath("/admin.php"), false);
  assert.equal(isKnownSpaPath("/wp-login.php"), false);
  assert.equal(isKnownSpaPath("/coverage-check/extra/deep"), false);
});

test("isIndexablePath: only genuine public pages are indexable", () => {
  assert.equal(isIndexablePath("/coverage-check"), true);
  assert.equal(isIndexablePath("/login"), false);
  assert.equal(isIndexablePath("/portal/login"), false);
  assert.equal(isIndexablePath("/customers"), false);
  assert.equal(isIndexablePath("/"), false);
});

test("INDEXABLE_PAGES entries carry unique titles and descriptions", () => {
  const titles = new Set(INDEXABLE_PAGES.map((p) => p.title));
  assert.equal(titles.size, INDEXABLE_PAGES.length);
  for (const p of INDEXABLE_PAGES) {
    assert.ok(p.title.length > 0);
    assert.ok(p.description.length > 0);
  }
});

test("buildRobotsTxt: blocks /api/, references sitemap on main host", () => {
  const txt = buildRobotsTxt("https://workspace.jabnet.id");
  assert.match(txt, /User-agent: \*/);
  assert.match(txt, /Disallow: \/api\//);
  assert.match(txt, /Sitemap: https:\/\/workspace\.jabnet\.id\/sitemap\.xml/);
});

test("buildRobotsTxt: portal host gets no sitemap (nothing indexable there)", () => {
  const txt = buildRobotsTxt("https://portal.jabnet.id", { portalHost: true });
  assert.ok(!txt.includes("Sitemap:"));
});

test("buildSitemapXml: lists exactly the indexable pages with absolute urls", () => {
  const xml = buildSitemapXml("https://workspace.jabnet.id");
  assert.match(xml, /<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<loc>https:\/\/workspace\.jabnet\.id\/coverage-check<\/loc>/);
  const locCount = (xml.match(/<loc>/g) ?? []).length;
  assert.equal(locCount, INDEXABLE_PAGES.length);
  assert.ok(!xml.includes("/login"));
});

// Drift guard: setiap route di client/App.tsx HARUS dikenali manifest - kalau test ini
// merah, rute baru belum didaftarkan di routesManifest.ts dan akan di-serve dgn status 404.
test("every App.tsx route is recognized by isKnownSpaPath (no manifest drift)", () => {
  const appSrc = readFileSync(new URL("../client/App.tsx", import.meta.url), "utf8");
  const paths = Array.from(new Set(Array.from(appSrc.matchAll(/path="([^"]+)"/g), (m) => m[1])));
  assert.ok(paths.length > 50, `sanity: hanya menemukan ${paths.length} route di App.tsx`);
  const missing: string[] = [];
  for (const p of paths) {
    const concrete = p
      .replace(/:rest\*/g, "x/y")
      .replace(/:[A-Za-z]+\*/g, "x/y")
      .replace(/:[A-Za-z]+/g, "x");
    if (!isKnownSpaPath(concrete)) missing.push(`${p} -> ${concrete}`);
  }
  assert.deepEqual(missing, []);
});
