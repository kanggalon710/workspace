// Registry rute SPA + metadata SEO - satu sumber kebenaran untuk:
//   - server: robots.txt, sitemap.xml, header X-Robots-Tag, dan keputusan 404 jujur
//     (path tak dikenal -> status 404, bukan soft-404 index.html 200)
//   - client: useDocumentMeta (title/description/canonical per halaman publik)
//
// PERAWATAN: daftar di bawah HARUS mengikuti rute di client/App.tsx. Kalau menambah
// route baru di App.tsx, tambahkan juga di sini - kalau tidak, halaman barunya akan
// di-serve dengan status 404 oleh catch-all server (SPA tetap render, tapi crawler
// dan curl melihat 404).

/** Host kanonis untuk halaman publik (canonical link + sitemap default). */
export const CANONICAL_BASE_URL = "https://workspace.jabnet.id";

export interface IndexablePage {
  path: string;
  title: string;
  description: string;
}

/** Halaman yang BOLEH diindeks mesin pencari. Semua path lain dapat X-Robots-Tag: noindex. */
export const INDEXABLE_PAGES: IndexablePage[] = [
  {
    path: "/coverage-check",
    title: "Cek Coverage JABNET - Internet Fiber Garut",
    description:
      "Cek apakah lokasi Anda sudah terjangkau jaringan internet fiber optik JABNET di Garut. Masukkan alamat atau koordinat, lihat ODP terdekat, dan daftar langsung.",
  },
];

// Rute statis persis (tanpa parameter) dari client/App.tsx.
const EXACT_PATHS = new Set<string>([
  "/", "/announcements", "/api-keys", "/audit-logs", "/bestray-manager",
  "/billing/monitoring", "/billing/packages", "/billing/routers", "/billing/sessions",
  "/broadcast", "/bugs", "/cable-cores", "/cables", "/canvassing", "/canvassing/history",
  "/canvassing/reports", "/collections", "/collections/cs", "/collections/marketing",
  "/communications", "/contacts", "/core-connections", "/coverage-check", "/customers",
  "/dashboard-jaringan", "/devices", "/export-import", "/hr/absen", "/hrd/sdm",
  "/integrations", "/integrations/chatwoot/agents", "/leads", "/login", "/loyalty",
  "/map", "/marketing", "/marketing/ads", "/marketing/bisnis", "/mitra", "/mpwa",
  "/odcs", "/odps", "/otb-manager", "/pengaturan", "/pipelines", "/poles", "/pops",
  "/portal", "/portal/dashboard", "/portal/login", "/portal/verify", "/power-budget",
  "/profile", "/prospects", "/roles", "/settings/sla-calendar", "/showcase",
  "/splitter-chain", "/splitters", "/teamspace/cheers", "/teamspace/performance",
  "/teamspace/tasks", "/teamspace/teams", "/tickets", "/tickets/categories",
  "/tickets/dashboard", "/tickets/heatmap", "/users", "/whatsapp/broadcast/pelanggan",
  "/whatsapp/broadcast/reseller", "/whatsapp/devices", "/whatsapp/phonebook",
  "/whatsapp/templates",
]);

// Rute berparameter, direduksi ke prefix statisnya. Satu segmen dinamis = satu "*".
// "/t/:slug/portal/:rest*" dan "/portal/:rest*" dicakup oleh prefix bebas-kedalaman.
const ONE_SEGMENT_PREFIXES = [
  "/bugs/", "/csat/", "/divisi/", "/integrations/", "/pipelines/", "/pipelines/divisi/",
  "/portal/csat/", "/portal/track/", "/teamspace/boards/", "/teamspace/teams/", "/work/",
];
// Prefix yang valid untuk kedalaman berapa pun (catch-all portal + tenant-slug portal).
const DEEP_PREFIXES = ["/portal/", "/t/"];

function normalize(pathname: string): string {
  const p = pathname.split("?")[0].split("#")[0];
  if (p.length > 1 && p.endsWith("/")) return p.slice(0, -1);
  return p;
}

export function isKnownSpaPath(pathname: string): boolean {
  const p = normalize(pathname);
  if (EXACT_PATHS.has(p)) return true;
  for (const prefix of ONE_SEGMENT_PREFIXES) {
    if (p.startsWith(prefix)) {
      const rest = p.slice(prefix.length);
      if (rest.length > 0 && !rest.includes("/")) return true;
    }
  }
  for (const prefix of DEEP_PREFIXES) {
    if (p.startsWith(prefix) && p.length > prefix.length) return true;
  }
  return false;
}

export function isIndexablePath(pathname: string): boolean {
  const p = normalize(pathname);
  return INDEXABLE_PAGES.some((page) => page.path === p);
}

/**
 * robots.txt TIDAK mem-blok halaman privat: pemblokiran crawl justru menyembunyikan
 * header X-Robots-Tag: noindex (URL bisa tetap terindeks "tanpa konten" dari link).
 * Kontrol indexing = noindex header; robots hanya blok /api/ (bukan halaman).
 */
export function buildRobotsTxt(baseUrl: string, opts: { portalHost?: boolean } = {}): string {
  const lines = ["User-agent: *", "Disallow: /api/"];
  if (!opts.portalHost) {
    lines.push("", `Sitemap: ${baseUrl.replace(/\/$/, "")}/sitemap.xml`);
  }
  return lines.join("\n") + "\n";
}

export function buildSitemapXml(baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, "");
  const urls = INDEXABLE_PAGES.map(
    (p) => `  <url>\n    <loc>${base}${p.path}</loc>\n  </url>`
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
