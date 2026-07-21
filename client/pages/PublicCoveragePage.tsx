import { useState, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { GoogleMap, Marker } from "@react-google-maps/api";
import { useGoogleMaps } from "@/context/GoogleMapsContext";
import { toast } from "sonner";
import { Link } from "wouter";
import {
  MapPin, Search, CheckCircle2, XCircle, AlertTriangle, Navigation2,
  Crosshair, Globe, ArrowRight, Zap, Activity, Phone,
} from "lucide-react";
import { dotIcon } from "@/lib/assetColors";
import { SaungJarkomLogo } from "@/components/SaungJarkomLogo";

const T = {
  bg: "#f0f9ff", // sky-50
  deep: "#0c4a6e", // sky-900
  secondary: "#0369a1", // sky-700
  accent: "#0EA5E9", // sky-500 (same as app primary)
  surface: "#e0f2fe", // sky-100
  surfaceHi: "#bae6fd", // sky-200
  outline: "#38bdf8", // sky-400
  outlineV: "#bae6fd", // sky-200 borders
  textSoft: "#075985", // sky-800
  container: "#0c4a6e",
};

interface LandingOdp {
  distanceMeters: number;
  availablePorts: number;
  capacity: number;
  usedPct: number;
  district?: string | null;
  village?: string | null;
}

interface LandingResult {
  query: { lat: number; lng: number; radius: number; limit: number; coverageThreshold: number };
  inCoverage: boolean;
  coverageStatus: "available" | "out_of_range" | "full" | "no_odp";
  nearest: LandingOdp | null;
  candidatesCount: number;
  recommendation: string;
  timestamp: string;
}

const STATUS_META: Record<LandingResult["coverageStatus"], { color: string; icon: any; label: string; subtext: string }> = {
  available: { color: "#22C55E", icon: CheckCircle2, label: "Lokasi Anda Terjangkau!", subtext: "Layanan Saung Jarkom tersedia di lokasi Anda" },
  out_of_range: { color: "#EF4444", icon: XCircle, label: "Tidak Ada Coverage", subtext: "Lokasi Anda belum terjangkau jaringan Saung Jarkom" },
  full: { color: "#EF4444", icon: XCircle, label: "Tidak Ada Coverage", subtext: "Lokasi Anda belum terjangkau jaringan Saung Jarkom" },
  no_odp: { color: "#EF4444", icon: XCircle, label: "Tidak Ada Coverage", subtext: "Lokasi Anda belum terjangkau jaringan Saung Jarkom" },
};

export default function PublicCoveragePage() {
  const { isLoaded } = useGoogleMaps();
  const mapRef = useRef<google.maps.Map | null>(null);

  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [latInput, setLatInput] = useState("");
  const [lngInput, setLngInput] = useState("");
  const [radius] = useState(3000);
  const [threshold] = useState(500);

  // Public landing endpoint - no auth needed
  const { data: result, isFetching, error } = useQuery<LandingResult>({
    queryKey: ["coverage_landing", point?.lat, point?.lng],
    queryFn: async () => {
      const r = await fetch(
        `/api/coverage/landing?lat=${point!.lat}&lng=${point!.lng}&radius=${radius}&threshold=${threshold}&limit=10`
      );
      const json = await r.json();
      if (!r.ok || !json.success) throw new Error(json.error || "Gagal cek coverage");
      return json.data as LandingResult;
    },
    enabled: !!point,
    staleTime: 30_000,
    retry: false,
  });

  const handleMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return;
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    setPoint({ lat, lng });
    setLatInput(lat.toFixed(6));
    setLngInput(lng.toFixed(6));
  }, []);

  const handleManualSubmit = () => {
    const lat = parseFloat(latInput);
    const lng = parseFloat(lngInput);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return toast.error("Koordinat tidak valid");
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return toast.error("Koordinat di luar rentang");
    setPoint({ lat, lng });
    if (mapRef.current) mapRef.current.panTo({ lat, lng });
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) return toast.error("Geolocation tidak didukung browser ini");
    toast.loading("Mendeteksi lokasi Anda...", { id: "geo" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        toast.dismiss("geo");
        const { latitude, longitude } = pos.coords;
        setPoint({ lat: latitude, lng: longitude });
        setLatInput(latitude.toFixed(6));
        setLngInput(longitude.toFixed(6));
        if (mapRef.current) mapRef.current.panTo({ lat: latitude, lng: longitude });
      },
      (err) => { toast.dismiss("geo"); toast.error(`Gagal: ${err.message}`); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const statusMeta = result ? STATUS_META[result.coverageStatus] : null;
  const StatusIcon = statusMeta?.icon;

  return (
    <div className="min-h-screen" style={{ background: T.bg }}>
      {/* Header */}
      <header className="border-b sticky top-0 z-40 backdrop-blur" style={{ background: T.bg + "EE", borderColor: T.outlineV }}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: T.accent }}>
              <SaungJarkomLogo className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold leading-tight" style={{ color: T.deep }}>Saung Jarkom</h1>
              <p className="text-[10px] leading-tight" style={{ color: T.secondary }}>Cek Ketersediaan Layanan</p>
            </div>
          </div>
          <Link href="/login" className="text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5"
            style={{ background: T.surfaceHi, color: T.secondary }}>
            Login <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Hero */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-3"
            style={{ background: T.accent + "15", color: T.accent }}>
            <Globe className="h-3 w-3" /> Coverage Checker
          </div>
          <h2 className="text-2xl md:text-3xl font-bold mb-2" style={{ color: T.deep }}>
            Cek Lokasi Anda Sekarang
          </h2>
          <p className="text-sm max-w-md mx-auto" style={{ color: T.secondary }}>
            Pastikan lokasi Anda terjangkau layanan Saung Jarkom. Klik di peta atau masukkan koordinat manual.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Map */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl overflow-hidden shadow-sm" style={{ border: `1px solid ${T.outlineV}` }}>
              {/* Big GPS CTA - primary action untuk calon pelanggan */}
              <button onClick={handleUseMyLocation}
                className="w-full p-4 flex items-center justify-center gap-3 text-white font-bold text-sm transition hover:brightness-110"
                style={{ background: `linear-gradient(135deg, ${T.accent}, #0284c7)` }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: "rgba(255,255,255,0.22)" }}>
                  <Crosshair className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <p className="text-[15px] font-bold leading-tight">Cek Lokasi Saya</p>
                  <p className="text-[10px] opacity-90 font-normal">Gunakan GPS untuk deteksi otomatis</p>
                </div>
              </button>

              {/* Input bar - manual coordinate fallback */}
              <div className="p-3 flex flex-wrap items-center gap-2" style={{ background: T.surface, borderTop: `1px solid ${T.outlineV}` }}>
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <input type="number" step="any" placeholder="Latitude"
                    value={latInput} onChange={(e) => setLatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
                    className="flex-1 min-w-0 text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2"
                    style={{ background: T.bg, border: `1px solid ${T.outlineV}`, color: T.deep }} />
                  <input type="number" step="any" placeholder="Longitude"
                    value={lngInput} onChange={(e) => setLngInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
                    className="flex-1 min-w-0 text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2"
                    style={{ background: T.bg, border: `1px solid ${T.outlineV}`, color: T.deep }} />
                </div>
                <button onClick={handleManualSubmit}
                  className="px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5"
                  style={{ background: T.surfaceHi, color: T.deep }}>
                  <Search className="h-3.5 w-3.5" /> Cek Manual
                </button>
              </div>

              {/* Hint bar */}
              <div className="px-3 py-2 text-[10px] flex items-center gap-2"
                style={{ background: T.bg, borderTop: `1px solid ${T.outlineV}`, color: T.outline }}>
                 Atau klik di mana saja di peta untuk pilih titik lokasi
              </div>

              {/* Map */}
              <div className="w-full h-[440px] md:h-[500px]" style={{ background: T.surface }}>
                {isLoaded ? (
                  <GoogleMap
                    mapContainerStyle={{ width: "100%", height: "100%" }}
                    center={point ?? { lat: -7.2195, lng: 107.9047 }}
                    zoom={point ? 16 : 13}
                    onLoad={(m) => { mapRef.current = m; }}
                    onClick={handleMapClick}
                    options={{
                      mapTypeId: "hybrid",
                      streetViewControl: false,
                      fullscreenControl: false,
                      mapTypeControl: true,
                      clickableIcons: false,
                    }}
                  >
                    {point && (
                      <Marker
                        position={point}
                        title="Lokasi Anda"
                        icon={{
                          path: "M-12 -12 C-12 -19, -7 -24, 0 -24 C7 -24, 12 -19, 12 -12 C12 -3, 0 12, 0 12 C0 12, -12 -3, -12 -12 Z M0 -16 C2.5 -16, 4.5 -14, 4.5 -11.5 C4.5 -9, 2.5 -7, 0 -7 C-2.5 -7, -4.5 -9, -4.5 -11.5 C-4.5 -14, -2.5 -16, 0 -16 Z",
                          fillColor: T.accent,
                          fillOpacity: 1,
                          strokeColor: "#ffffff",
                          strokeWeight: 2,
                          scale: 1.5,
                          anchor: new google.maps.Point(0, 12),
                        }}
                        animation={google.maps.Animation.DROP}
                        zIndex={1000}
                      />
                    )}
                  </GoogleMap>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs"
                    style={{ color: T.secondary }}>Memuat peta…</div>
                )}
              </div>
            </div>
          </div>

          {/* Result Panel */}
          <div className="space-y-3">
            {!point && (
              <div className="rounded-2xl p-6 text-center" style={{ background: T.surface, border: `1px dashed ${T.outlineV}` }}>
                <Crosshair className="h-12 w-12 mx-auto mb-3" style={{ color: T.outline }} />
                <p className="text-sm font-bold" style={{ color: T.deep }}>Pilih Lokasi Anda</p>
                <p className="text-xs mt-1" style={{ color: T.secondary }}>
                  Klik peta, ketik koordinat, atau gunakan GPS
                </p>
              </div>
            )}

            {point && isFetching && !result && (
              <div className="rounded-2xl p-8 text-center" style={{ background: T.surface }}>
                <div className="w-8 h-8 mx-auto mb-3 rounded-full border-2 animate-spin"
                  style={{ borderColor: T.surfaceHi, borderTopColor: T.accent }} />
                <p className="text-xs" style={{ color: T.secondary }}>Mengecek coverage…</p>
              </div>
            )}

            {error && (
              <div className="rounded-2xl p-4" style={{ background: "#FEE2E2", border: "1px solid #FCA5A5" }}>
                <p className="text-xs font-bold" style={{ color: "#991B1B" }}>{(error as Error).message}</p>
              </div>
            )}

            {result && statusMeta && StatusIcon && (
              <>
                {/* Big Status Card */}
                <div className="rounded-2xl p-5 text-center shadow-sm"
                  style={{ background: statusMeta.color + "10", border: `2px solid ${statusMeta.color}40` }}>
                  <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center"
                    style={{ background: statusMeta.color }}>
                    <StatusIcon className="h-7 w-7 text-white" />
                  </div>
                  <p className="text-base font-bold mb-1" style={{ color: statusMeta.color }}>
                    {statusMeta.label}
                  </p>
                  <p className="text-xs" style={{ color: T.secondary }}>
                    {statusMeta.subtext}
                  </p>
                </div>

                {/* Nearest summary - HANYA ditampilkan kalau in-coverage (≤500m) */}
                {result.inCoverage && result.nearest && (
                  <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "white", border: `1px solid ${T.outlineV}` }}>
                    <div className="px-4 py-3" style={{ background: T.surface }}>
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: T.secondary }}>
                        Detail Coverage
                      </span>
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="rounded-lg p-3 text-center" style={{ background: T.surface }}>
                        <Navigation2 className="h-4 w-4 mx-auto mb-1" style={{ color: T.accent }} />
                        <p className="text-2xl font-bold" style={{ color: T.deep }}>{result.nearest.distanceMeters}m</p>
                        <p className="text-[9px] uppercase tracking-widest" style={{ color: T.outline }}>Jarak ke jaringan terdekat</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* CTA */}
                {result.inCoverage ? (
                  <a href="https://wa.me/6281234567890?text=Halo%20Saung Jarkom,%20saya%20mau%20daftar%20FTTH"
                    target="_blank" rel="noopener noreferrer"
                    className="block w-full text-center py-3 rounded-2xl text-sm font-bold text-white shadow-sm"
                    style={{ background: T.accent }}>
                    <Phone className="h-4 w-4 inline mr-1.5" />
                    Daftar Sekarang
                  </a>
                ) : (
                  <a href="https://wa.me/6281234567890?text=Halo%20Saung Jarkom,%20saya%20ingin%20info%20pengembangan%20jaringan"
                    target="_blank" rel="noopener noreferrer"
                    className="block w-full text-center py-3 rounded-2xl text-sm font-bold"
                    style={{ background: T.surfaceHi, color: T.secondary }}>
                    <Phone className="h-4 w-4 inline mr-1.5" />
                    Hubungi Kami untuk Info
                  </a>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-8 text-center text-[10px]" style={{ color: T.outline }}>
          <p>Saung Jarkom • Coverage data real-time dari sistem internal</p>
        </div>
      </div>
    </div>
  );
}
