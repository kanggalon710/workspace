import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Link } from "wouter";
import {
  Code2, Copy, Key, BookOpen, Globe, TrendingUp, ExternalLink,
} from "lucide-react";

const T = {
  bg: "#faf9f8", deep: "#350800", secondary: "#755750", accent: "#ff5f2e",
  surface: "#f4f3f2", surfaceHi: "#e9e8e7", outline: "#827472",
  outlineV: "#d3c3c0", textSoft: "#504442", container: "#591300",
};

interface ApiKeyStatus {
  enabled: boolean;
  keyLength: number;
  keyPreview: string | null;
  publicEndpoint: string;
  docsUrl: string;
}

export default function CoverageDocsPage() {
  const { data: apiKeyStatus } = useQuery<ApiKeyStatus>({
    queryKey: ["coverage_api_key_status"],
    queryFn: () => api.get<ApiKeyStatus>("/coverage/api-key/status"),
    retry: false,
    staleTime: 60_000,
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} disalin`);
  };

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://ftth.example.com";
  const apiKey = "YOUR_API_KEY";

  const snippets = useMemo(() => ({
    curl: `curl "${baseUrl}/api/public/coverage?lat=-7.2195&lng=107.9047&radius=500" \\
  -H "X-API-Key: ${apiKey}"`,
    js: `const r = await fetch(
  "${baseUrl}/api/public/coverage?lat=-7.2195&lng=107.9047",
  { headers: { "X-API-Key": "${apiKey}" } }
);
const { data } = await r.json();
if (data.inCoverage) {
  console.log("Terjangkau dari", data.nearest.name);
} else {
  console.log("Di luar jangkauan:", data.recommendation);
}`,
    python: `import requests

r = requests.get(
    "${baseUrl}/api/public/coverage",
    params={"lat": -7.2195, "lng": 107.9047, "radius": 1000},
    headers={"X-API-Key": "${apiKey}"},
)
data = r.json()["data"]
print(data["recommendation"])`,
    whatsapp: `// Bot WhatsApp (whatsapp-web.js)
client.on("message", async (msg) => {
  if (msg.type !== "location") return;
  const { latitude, longitude } = msg.location;
  const r = await fetch(
    \`${baseUrl}/api/public/coverage?lat=\${latitude}&lng=\${longitude}\`,
    { headers: { "X-API-Key": process.env.COVERAGE_API_KEY } }
  );
  const { data } = await r.json();
  msg.reply(
    data.inCoverage
      ? \`✅ Terjangkau!\\nODP: \${data.nearest.name}\\nJarak: \${data.nearest.distanceMeters}m\`
      : \`❌ \${data.recommendation}\`
  );
});`,
    sheets: `function CEK_COVERAGE(lat, lng) {
  const url = "${baseUrl}/api/public/coverage?lat=" + lat + "&lng=" + lng;
  const res = UrlFetchApp.fetch(url, {
    headers: { "X-API-Key": "${apiKey}" }
  });
  return JSON.parse(res.getContentText()).data.recommendation;
}
// Pakai di cell: =CEK_COVERAGE(A2, B2)`,
  }), [baseUrl, apiKey]);

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: T.bg }}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: T.accent + "15" }}>
              <BookOpen className="h-5 w-5" style={{ color: T.accent }} />
            </div>
            <div>
              <h1 className="text-2xl font-bold" style={{ color: T.deep }}>Coverage API Documentation</h1>
              <p className="text-xs" style={{ color: T.secondary }}>
                Dokumentasi & contoh integrasi untuk endpoint publik <code className="font-mono">/api/public/coverage</code>
              </p>
            </div>
          </div>

          {/* Public page link */}
          <div className="mt-4 rounded-xl p-3 flex items-center justify-between gap-3"
            style={{ background: "#22C55E10", border: "1px solid #22C55E30" }}>
            <div className="flex items-center gap-2 min-w-0">
              <Globe className="h-4 w-4 shrink-0" style={{ color: "#15803D" }} />
              <p className="text-xs min-w-0" style={{ color: "#15803D" }}>
                Halaman publik untuk calon pelanggan tersedia di{" "}
                <code className="font-mono font-bold">/cek-coverage</code> (tidak perlu login)
              </p>
            </div>
            <Link href="/cek-coverage" className="text-[10px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 shrink-0"
              style={{ background: "#22C55E", color: "white" }}>
              Buka <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Sidebar info */}
          <div className="space-y-3">
            {/* API Key Status */}
            <div className="rounded-2xl p-4" style={{ background: "white", border: `1px solid ${T.outlineV}` }}>
              <div className="flex items-center gap-2 mb-3">
                <Key className="h-4 w-4" style={{ color: T.accent }} />
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: T.secondary }}>API Key Status</span>
              </div>
              {apiKeyStatus ? (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    {apiKeyStatus.enabled ? (
                      <>
                        <div className="w-2 h-2 rounded-full" style={{ background: "#22C55E" }} />
                        <span className="text-xs font-bold" style={{ color: "#15803D" }}>Aktif</span>
                      </>
                    ) : (
                      <>
                        <div className="w-2 h-2 rounded-full" style={{ background: "#EF4444" }} />
                        <span className="text-xs font-bold" style={{ color: "#991B1B" }}>Tidak Aktif</span>
                      </>
                    )}
                  </div>
                  {apiKeyStatus.enabled ? (
                    <div className="rounded-lg p-2 font-mono text-[10px]" style={{ background: T.surface, color: T.deep }}>
                      {apiKeyStatus.keyPreview} <span className="opacity-50">({apiKeyStatus.keyLength} chars)</span>
                    </div>
                  ) : (
                    <p className="text-[11px]" style={{ color: T.secondary }}>
                      Set <code className="px-1 rounded" style={{ background: T.surface }}>COVERAGE_API_KEY</code> di .env lalu restart server
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[11px] italic" style={{ color: T.outline }}>
                  Status hanya bisa dilihat oleh admin
                </p>
              )}
            </div>

            {/* Endpoint info */}
            <div className="rounded-2xl p-4" style={{ background: "white", border: `1px solid ${T.outlineV}` }}>
              <div className="flex items-center gap-2 mb-3">
                <Globe className="h-4 w-4" style={{ color: T.accent }} />
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: T.secondary }}>Endpoint</span>
              </div>
              <div className="flex items-center gap-1 mb-2">
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "#22C55E", color: "white" }}>GET</span>
                <button onClick={() => copyToClipboard(`${baseUrl}/api/public/coverage`, "URL")}
                  className="text-[10px] font-mono truncate flex-1 text-left hover:underline"
                  style={{ color: T.deep }}>
                  /api/public/coverage
                </button>
                <Copy className="h-3 w-3 cursor-pointer" style={{ color: T.outline }}
                  onClick={() => copyToClipboard(`${baseUrl}/api/public/coverage`, "URL")} />
              </div>
              <div className="text-[10px] space-y-1 mt-3 pt-3" style={{ borderTop: `1px solid ${T.outlineV}` }}>
                <p className="font-bold" style={{ color: T.secondary }}>Query Params:</p>
                {[
                  ["lat", "✓", "-7.2195"],
                  ["lng", "✓", "107.9047"],
                  ["radius", "—", "1000 (50–20000)"],
                  ["limit", "—", "5 (1–20)"],
                  ["threshold", "—", "250 (50–2000)"],
                ].map(([name, req, desc]) => (
                  <div key={name} className="flex gap-1.5">
                    <code className="font-mono font-bold" style={{ color: T.accent }}>{name}</code>
                    <span style={{ color: req === "✓" ? "#EF4444" : T.outline }}>{req}</span>
                    <span style={{ color: T.secondary }}>{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick stats */}
            <div className="rounded-2xl p-4" style={{ background: T.accent + "10", border: `1px solid ${T.accent}30` }}>
              <TrendingUp className="h-4 w-4 mb-2" style={{ color: T.accent }} />
              <p className="text-[11px] font-bold" style={{ color: T.deep }}>Use Case</p>
              <ul className="text-[10px] mt-1 space-y-0.5" style={{ color: T.secondary }}>
                <li>✓ Form pendaftaran calon pelanggan</li>
                <li>✓ Bot WhatsApp validasi lokasi</li>
                <li>✓ CRM/Marketing geo-targeting</li>
                <li>✓ Google Sheets bulk check</li>
                <li>✓ Validasi lapangan tim sales</li>
              </ul>
            </div>
          </div>

          {/* Code samples */}
          <div className="lg:col-span-2 space-y-3">
            {[
              { key: "curl", label: "cURL", icon: "🔧" },
              { key: "js", label: "JavaScript / Node.js", icon: "🟨" },
              { key: "python", label: "Python", icon: "🐍" },
              { key: "whatsapp", label: "Bot WhatsApp", icon: "💬" },
              { key: "sheets", label: "Google Sheets", icon: "📊" },
            ].map((s) => (
              <div key={s.key} className="rounded-2xl overflow-hidden" style={{ background: "#1e293b", border: `1px solid ${T.outlineV}` }}>
                <div className="px-4 py-2 flex items-center justify-between" style={{ background: "#0f172a" }}>
                  <div className="flex items-center gap-2">
                    <span>{s.icon}</span>
                    <span className="text-xs font-bold text-white">{s.label}</span>
                  </div>
                  <button onClick={() => copyToClipboard(snippets[s.key as keyof typeof snippets], s.label)}
                    className="flex items-center gap-1 text-[10px] text-white/70 hover:text-white">
                    <Copy className="h-3 w-3" /> Salin
                  </button>
                </div>
                <pre className="p-4 text-[11px] font-mono leading-relaxed text-white/90 overflow-x-auto">
{snippets[s.key as keyof typeof snippets]}
                </pre>
              </div>
            ))}

            {/* Response example */}
            <div className="rounded-2xl overflow-hidden" style={{ background: "#1e293b", border: `1px solid ${T.outlineV}` }}>
              <div className="px-4 py-2 flex items-center gap-2" style={{ background: "#0f172a" }}>
                <Code2 className="h-3.5 w-3.5 text-white" />
                <span className="text-xs font-bold text-white">Response Example</span>
              </div>
              <pre className="p-4 text-[11px] font-mono leading-relaxed text-white/90 overflow-x-auto">
{`{
  "success": true,
  "data": {
    "inCoverage": true,
    "coverageStatus": "available",
    "nearest": {
      "id": 1,
      "name": "ODP Tarogong 1-A",
      "distanceMeters": 88,
      "capacity": 8,
      "availablePorts": 3,
      "nextPort": 6
    },
    "candidates": [ /* ... */ ],
    "recommendation": "Dapat dilayani dari ODP Tarogong 1-A (88m, 3 port tersisa)",
    "timestamp": "2026-04-07T08:53:41.329Z"
  }
}`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
