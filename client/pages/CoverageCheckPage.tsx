import { useState, useCallback, useRef } from "react";
import { Link } from "wouter";
import { GoogleMap, Marker, Circle, Autocomplete } from "@react-google-maps/api";
import { useGoogleMaps } from "@/context/GoogleMapsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  MapPin, Crosshair, Search, Loader2, CheckCircle2, XCircle, AlertTriangle,
  Compass, Target, Activity, Zap, Radio, LogIn, Gift, Shield, MessageCircle,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// Standard "teardrop" pin SVG path - anchored at the bottom tip (0,0).
// Renders as a Google-Maps style location pin.
const PIN_SVG_PATH =
  "M 0,0 C -2,-20 -10,-22 -10,-30 A 10,10 0 1,1 10,-30 C 10,-22 2,-20 0,0 z";

const GARUT_CENTER = { lat: -7.22, lng: 107.90 };
const DEFAULT_ZOOM = 13;
const WA_NUMBER = "6281234567890";

interface NearbyOdp {
  id: number;
  name: string;
  code: string;
  lat: number;
  lng: number;
  address: string | null;
  district: string | null;
  village: string | null;
  splitterType: string | null;
  status: string | null;
  capacity: number;
  usedCapacity: number;
  availablePorts: number;
  distanceMeters: number;
  inCoverage: boolean;
}

interface PowerBudget {
  totalLoss: number;
  rxPower: number;
  status: "ok" | "warning" | "fail";
  assumptions: {
    fiberKm: number;
    splices: number;
    connectors: number;
    splitters: string[];
    gponOutputDbm: number;
    rxSensitivityDbm: number;
    rxMaxTargetDbm: number;
  };
}

interface CoverageResult {
  target: { lat: number; lng: number };
  coverageRadiusMeters: number;
  verdict?: "covered" | "covered_full" | "marginal" | "out_of_coverage";
  nearestOdps: NearbyOdp[];
  recommended: (NearbyOdp & { powerBudget: PowerBudget }) | null;
  message?: string;
}

const VERDICT_CONFIG: Record<NonNullable<CoverageResult["verdict"]>, { label: string; color: string; bg: string; border: string; icon: any }> = {
  covered:         { label: "Tercover ✓",            color: "text-success", bg: "bg-success/10",  border: "border-success/30",  icon: CheckCircle2 },
  covered_full:    { label: "Tercover (Penuh)",      color: "text-warning", bg: "bg-warning/10",  border: "border-warning/30",  icon: AlertTriangle },
  marginal:        { label: "Marginal",              color: "text-orange-700 dark:text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30", icon: AlertTriangle },
  out_of_coverage: { label: "Di Luar Coverage",      color: "text-destructive",     bg: "bg-destructive/10",    border: "border-destructive/30",    icon: XCircle },
};

const POWER_STATUS_CONFIG: Record<PowerBudget["status"], { label: string; color: string }> = {
  ok:      { label: "Aman",     color: "text-success" },
  warning: { label: "Marginal", color: "text-warning" },
  fail:    { label: "Gagal",    color: "text-destructive" },
};

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m} m`;
}

export default function CoverageCheckPage() {
  const { isLoaded, loadError } = useGoogleMaps();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [latInput, setLatInput] = useState("");
  const [lngInput, setLngInput] = useState("");
  const [result, setResult] = useState<CoverageResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  // -- Lead capture form state --
  const [regName, setRegName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regAddress, setRegAddress] = useState("");
  const [regPackage, setRegPackage] = useState("Belum tahu");
  const [regSubmitting, setRegSubmitting] = useState(false);
  const [regSuccess, setRegSuccess] = useState(false);

  // -- Set lokasi target & jalankan cek coverage --
  const checkCoverage = useCallback(async (lat: number, lng: number) => {
    setCoords({ lat, lng });
    setLatInput(lat.toFixed(6));
    setLngInput(lng.toFixed(6));
    setIsChecking(true);
    try {
      const data = await api.post<CoverageResult>("/coverage-check", { lat, lng });
      setResult(data);
      // Reset lead form on new check
      setRegSuccess(false);
      setRegName("");
      setRegPhone("");
      setRegPackage("Belum tahu");
      // Auto-fill address from recommended ODP info if available
      const addrParts = [
        data.recommended?.address,
        data.recommended?.village,
        data.recommended?.district,
      ].filter(Boolean);
      setRegAddress(addrParts.length > 0 ? addrParts.join(", ") : `${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      // Pan map ke lokasi target
      if (mapRef.current) {
        mapRef.current.panTo({ lat, lng });
        if ((mapRef.current.getZoom() ?? 0) < 15) mapRef.current.setZoom(15);
      }
    } catch (err: any) {
      toast.error(err.message || "Gagal cek coverage");
    } finally {
      setIsChecking(false);
    }
  }, []);

  // -- Map click handler --
  const handleMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return;
    checkCoverage(e.latLng.lat(), e.latLng.lng());
  }, [checkCoverage]);

  // -- GPS handler --
  const handleGPS = useCallback(() => {
    if (!("geolocation" in navigator)) {
      toast.error("Browser tidak mendukung GPS");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLoading(false);
        checkCoverage(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        setGpsLoading(false);
        toast.error(
          err.code === err.PERMISSION_DENIED ? "Izin GPS ditolak"
          : err.code === err.POSITION_UNAVAILABLE ? "Lokasi tidak tersedia"
          : err.code === err.TIMEOUT ? "Timeout GPS"
          : "Gagal mendapatkan lokasi"
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }, [checkCoverage]);

  // -- Manual lat/lng submit --
  const handleManualSubmit = useCallback(() => {
    const lat = parseFloat(latInput);
    const lng = parseFloat(lngInput);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      toast.error("Latitude/Longitude tidak valid");
      return;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      toast.error("Koordinat di luar range");
      return;
    }
    checkCoverage(lat, lng);
  }, [latInput, lngInput, checkCoverage]);

  // -- Places autocomplete handler --
  const handlePlaceChanged = useCallback(() => {
    const place = autocompleteRef.current?.getPlace();
    if (!place?.geometry?.location) {
      toast.error("Lokasi tidak ditemukan");
      return;
    }
    checkCoverage(place.geometry.location.lat(), place.geometry.location.lng());
  }, [checkCoverage]);

  // -- Lead capture submit --
  const handleRegister = async () => {
    if (!regName.trim() || !regPhone.trim()) {
      toast.error("Nama dan nomor WhatsApp wajib diisi");
      return;
    }
    setRegSubmitting(true);
    try {
      await fetch("/api/coverage-check/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: regName.trim(),
          phone: regPhone.trim(),
          address: regAddress.trim(),
          lat: result?.target.lat,
          lng: result?.target.lng,
          odpId: result?.recommended?.id,
          packageInterest: regPackage,
        }),
      });
      setRegSuccess(true);
      toast.success("Pendaftaran berhasil!");
    } catch {
      toast.error("Gagal mendaftar, coba lagi");
    }
    setRegSubmitting(false);
  };

  if (loadError) {
    return (
      <PublicShell>
        <Card>
          <CardContent className="p-6 text-center text-destructive">
            Gagal memuat Google Maps. Periksa koneksi atau API key.
          </CardContent>
        </Card>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Compass className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Cek Lokasi Coverage</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Cek apakah suatu lokasi tercover oleh jaringan FTTH JABNET dan ODP terdekat mana yang dapat dipakai. Akses publik - tidak perlu login.
        </p>
      </div>

      {/* Input controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="h-4 w-4" /> Input Lokasi Target
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            {/* Search alamat */}
            <div className="md:col-span-6">
              <Label className="text-xs">Cari alamat / nama tempat</Label>
              {isLoaded ? (
                <Autocomplete
                  onLoad={(ac) => { autocompleteRef.current = ac; }}
                  onPlaceChanged={handlePlaceChanged}
                  options={{
                    componentRestrictions: { country: "id" },
                    fields: ["geometry", "formatted_address", "name"],
                  }}
                >
                  <div className="relative">
                    <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Contoh: Jl. Otista Garut, Tarogong Kaler..."
                      className="pl-9"
                    />
                  </div>
                </Autocomplete>
              ) : (
                <Input disabled placeholder="Memuat Maps API..." />
              )}
            </div>

            {/* GPS button */}
            <div className="md:col-span-3">
              <Label className="text-xs">Atau pakai GPS</Label>
              <Button
                type="button"
                variant="outline"
                onClick={handleGPS}
                disabled={gpsLoading || isChecking}
                className="w-full"
              >
                {gpsLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Crosshair className="h-4 w-4 mr-2" />}
                Lokasi Saya
              </Button>
            </div>

            <div className="md:col-span-3 text-xs text-muted-foreground">
              Atau klik langsung di peta ↓
            </div>
          </div>

          {/* Manual lat/lng */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end pt-2 border-t border-border">
            <div className="md:col-span-4">
              <Label className="text-xs">Latitude</Label>
              <Input
                type="number"
                step="any"
                value={latInput}
                onChange={(e) => setLatInput(e.target.value)}
                placeholder="-7.218750"
              />
            </div>
            <div className="md:col-span-4">
              <Label className="text-xs">Longitude</Label>
              <Input
                type="number"
                step="any"
                value={lngInput}
                onChange={(e) => setLngInput(e.target.value)}
                placeholder="107.908417"
              />
            </div>
            <div className="md:col-span-4">
              <Button
                type="button"
                onClick={handleManualSubmit}
                disabled={isChecking || !latInput || !lngInput}
                className="w-full"
              >
                {isChecking ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MapPin className="h-4 w-4 mr-2" />}
                Cek Coordinate
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Map + Results */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Map */}
        <div className="lg:col-span-7 h-[420px] md:h-[520px] rounded-lg overflow-hidden border border-border">
          {isLoaded ? (
            <GoogleMap
              mapContainerClassName="h-full w-full"
              center={coords ?? GARUT_CENTER}
              zoom={DEFAULT_ZOOM}
              onClick={handleMapClick}
              onLoad={(map) => { mapRef.current = map; }}
              options={{
                fullscreenControl: false,
                streetViewControl: false,
                mapTypeControl: true,
                clickableIcons: false,
                draggableCursor: "crosshair",
                draggingCursor: "crosshair",
              }}
            >
              {coords && (
                <>
                  <Marker
                    position={coords}
                    icon={{
                      path: PIN_SVG_PATH,
                      fillColor: "#EF4444",
                      fillOpacity: 1,
                      strokeColor: "#7F1D1D",
                      strokeWeight: 1.5,
                      scale: 1.3,
                      anchor: new google.maps.Point(0, 0),
                    }}
                    zIndex={10}
                  />
                  <Circle
                    center={coords}
                    radius={result?.coverageRadiusMeters ?? 250}
                    options={{
                      fillColor: "#3B82F6",
                      fillOpacity: 0.08,
                      strokeColor: "#3B82F6",
                      strokeOpacity: 0.6,
                      strokeWeight: 1.5,
                      clickable: false,
                    }}
                  />
                </>
              )}
            </GoogleMap>
          ) : (
            <div className="h-full w-full flex items-center justify-center bg-muted text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Memuat peta...
            </div>
          )}
        </div>

        {/* Results panel */}
        <div className="lg:col-span-5 space-y-4">
          {!coords && !result && (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                <MapPin className="h-12 w-12 mx-auto mb-2 opacity-30" />
                Klik di peta, gunakan search, GPS, atau input lat/lng untuk memulai cek coverage.
              </CardContent>
            </Card>
          )}

          {isChecking && (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin" />
                Menghitung coverage...
              </CardContent>
            </Card>
          )}

          {result && !isChecking && (
            <>
              {/* Empty state - no ODPs in database */}
              {result.nearestOdps.length === 0 && (
                <Card className="bg-muted/30 border-dashed">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-6 w-6 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-semibold text-foreground">Tidak ada data ODP</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {result.message || "Database belum berisi titik ODP. Tambahkan ODP melalui menu Aset Jaringan terlebih dahulu."}
                        </p>
                        <p className="text-[10px] text-muted-foreground font-mono mt-1">
                          {result.target.lat.toFixed(6)}, {result.target.lng.toFixed(6)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Verdict */}
              {result.verdict && result.nearestOdps.length > 0 && (() => {
                const v = VERDICT_CONFIG[result.verdict];
                const Icon = v.icon;
                return (
                  <Card className={`${v.bg} ${v.border} border`}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <Icon className={`h-6 w-6 ${v.color} shrink-0 mt-0.5`} />
                        <div className="flex-1">
                          <p className={`font-semibold ${v.color}`}>{v.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            ODP terdekat: {result.nearestOdps[0].name} ({formatDistance(result.nearestOdps[0].distanceMeters)})
                          </p>
                          <p className="text-[10px] text-muted-foreground font-mono mt-1">
                            {result.target.lat.toFixed(6)}, {result.target.lng.toFixed(6)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}

              {/* Recommended ODP + Power Budget */}
              {result.recommended && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Zap className="h-4 w-4 text-warning" />
                      ODP Terbaik (Rekomendasi)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{result.recommended.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{result.recommended.code}</p>
                      </div>
                      <Badge variant={result.recommended.availablePorts > 0 ? "default" : "destructive"}>
                        {result.recommended.availablePorts}/{result.recommended.capacity} port
                      </Badge>
                    </div>
                    {(result.recommended.address || result.recommended.village) && (
                      <p className="text-xs text-muted-foreground">
                        {[result.recommended.address, result.recommended.village, result.recommended.district].filter(Boolean).join(", ")}
                      </p>
                    )}
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase">Jarak</p>
                        <p className="text-sm font-semibold">{formatDistance(result.recommended.distanceMeters)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase">Splitter</p>
                        <p className="text-sm font-semibold">{result.recommended.splitterType || "-"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase">Status ODP</p>
                        <p className="text-sm font-semibold capitalize">{result.recommended.status || "-"}</p>
                      </div>
                    </div>

                    {/* Power Budget estimation */}
                    <div className="mt-2 p-2.5 rounded-lg bg-muted/50 border border-border space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                        <p className="text-xs font-semibold">Estimasi Power Budget</p>
                        <Badge
                          variant="outline"
                          className={`ml-auto text-[10px] ${POWER_STATUS_CONFIG[result.recommended.powerBudget.status].color}`}
                        >
                          {POWER_STATUS_CONFIG[result.recommended.powerBudget.status].label}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <span className="text-muted-foreground">Total Loss:</span>{" "}
                          <span className="font-semibold">{result.recommended.powerBudget.totalLoss} dB</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">RX Power:</span>{" "}
                          <span className="font-semibold">{result.recommended.powerBudget.rxPower} dBm</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground italic">
                        Asumsi: {result.recommended.powerBudget.assumptions.fiberKm} km feeder + {result.recommended.powerBudget.assumptions.splitters.join(", ")} + 2 splice + 2 connector. RX target ≥ {result.recommended.powerBudget.assumptions.rxMaxTargetDbm} dBm.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Top 5 nearest table */}
              {result.nearestOdps.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Top 5 ODP Terdekat</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-border">
                    {result.nearestOdps.map((odp: NearbyOdp, idx: number) => (
                      <div key={odp.id} className="p-3 hover:bg-accent/50 transition">
                        <div className="flex items-start gap-2">
                          <div className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                            idx === 0 ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                          }`}>
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold truncate">{odp.name}</p>
                              <span className="text-xs font-mono shrink-0">{formatDistance(odp.distanceMeters)}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-muted-foreground font-mono">{odp.code}</span>
                              {odp.splitterType && <span className="text-[10px] text-muted-foreground">· {odp.splitterType}</span>}
                              {odp.inCoverage && (
                                <Badge variant="outline" className="text-[9px] h-4 px-1 border-success/30 text-success">
                                  in-radius
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-1">
                              <div className="flex-1 h-1.5 bg-muted rounded overflow-hidden">
                                <div
                                  className={`h-full transition-all ${
                                    odp.availablePorts === 0 ? "bg-destructive" :
                                    odp.usedCapacity / odp.capacity >= 0.8 ? "bg-warning" :
                                    "bg-success"
                                  }`}
                                  style={{ width: `${Math.min(100, (odp.usedCapacity / odp.capacity) * 100)}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {odp.availablePorts}/{odp.capacity}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              )}

              {/* -- Lead Capture Form -- */}
              {(result.verdict === "covered" || result.verdict === "covered_full" || result.verdict === "marginal") && (
                <Card className="border-success/30 bg-success/5">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      {result.verdict === "marginal" ? (
                        <>
                          <AlertTriangle className="h-5 w-5 text-warning" />
                          <span className="text-warning">Area Anda Dalam Jangkauan</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-5 w-5 text-success" />
                          <span className="text-success">Selamat! Area Anda Tercover Fiber Optic JABNET</span>
                        </>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Trust signals */}
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Zap className="h-3.5 w-3.5 text-warning" />
                        <span>Kecepatan hingga 100 Mbps</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Gift className="h-3.5 w-3.5 text-pink-500" />
                        <span>Instalasi Gratis*</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Shield className="h-3.5 w-3.5 text-blue-500" />
                        <span>Tanpa Kontrak</span>
                      </div>
                    </div>

                    {!regSuccess ? (
                      <div className="space-y-3">
                        <p className="text-sm font-semibold text-foreground">Daftar Sekarang</p>

                        <div>
                          <Label className="text-xs">Nama Lengkap <span className="text-destructive">*</span></Label>
                          <Input
                            value={regName}
                            onChange={(e) => setRegName(e.target.value)}
                            placeholder="Nama lengkap Anda"
                            required
                          />
                        </div>

                        <div>
                          <Label className="text-xs">Nomor WhatsApp <span className="text-destructive">*</span></Label>
                          <Input
                            type="tel"
                            value={regPhone}
                            onChange={(e) => setRegPhone(e.target.value)}
                            placeholder="08xxxxxxxxxx"
                            required
                          />
                        </div>

                        <div>
                          <Label className="text-xs">Alamat Pemasangan</Label>
                          <Input
                            value={regAddress}
                            onChange={(e) => setRegAddress(e.target.value)}
                            placeholder="Alamat lengkap pemasangan"
                          />
                        </div>

                        <div>
                          <Label className="text-xs">Paket yang Diminati</Label>
                          <Select value={regPackage} onValueChange={setRegPackage}>
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih paket" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Belum tahu">Belum tahu</SelectItem>
                              <SelectItem value="10 Mbps">10 Mbps</SelectItem>
                              <SelectItem value="20 Mbps">20 Mbps</SelectItem>
                              <SelectItem value="50 Mbps">50 Mbps</SelectItem>
                              <SelectItem value="100 Mbps">100 Mbps</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <Button
                          className="w-full bg-success hover:brightness-95 text-white"
                          onClick={handleRegister}
                          disabled={regSubmitting}
                        >
                          {regSubmitting ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                          )}
                          Daftar & Hubungi Saya
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3 text-center">
                        <div className="p-4 rounded-lg bg-success/10 border border-success/30">
                          <CheckCircle2 className="h-8 w-8 text-success mx-auto mb-2" />
                          <p className="font-semibold text-success">Pendaftaran Berhasil!</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Tim kami akan menghubungi Anda via WhatsApp dalam 1x24 jam
                          </p>
                        </div>
                        <a
                          href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(
                            `Halo JABNET, saya ${regName} tertarik pasang internet fiber optic di ${regAddress}`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-2 w-full rounded-lg bg-success hover:brightness-95 text-white font-medium py-2.5 px-4 text-sm transition"
                        >
                          <MessageCircle className="h-4 w-4" />
                          Chat WhatsApp Langsung
                        </a>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </PublicShell>
  );
}

// -- Public layout wrapper (used outside the authenticated Layout) --
function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex items-center gap-3">
          <Link href="/login" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <Radio className="h-4 w-4 text-white" />
            </div>
            <div className="hidden sm:block">
              <h1 className="font-bold text-sm text-foreground leading-tight group-hover:text-primary transition">JABNET FTTH</h1>
              <p className="text-[10px] text-muted-foreground leading-tight">Cek Coverage Publik</p>
            </div>
          </Link>
          <div className="flex-1" />
          <Link
            href="/login"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition"
          >
            <LogIn className="h-3.5 w-3.5" />
            Login Staff
          </Link>
        </div>
      </header>
      <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">{children}</main>
    </div>
  );
}
