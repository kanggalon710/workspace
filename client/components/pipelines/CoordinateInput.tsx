import { useEffect, useState } from "react";
import { GoogleMap, Marker } from "@react-google-maps/api";
import { useGoogleMaps } from "@/context/GoogleMapsContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField, FormRow } from "@/components/ui/form-field";
import { parseCoordinate } from "@shared/pipelineFieldTypes";
import { Crosshair } from "lucide-react";
import { toast } from "sonner";

const GARUT_CENTER = { lat: -7.22, lng: 107.9 };

export function CoordinateInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const { isLoaded } = useGoogleMaps();
  const coord = parseCoordinate(value);
  const [latStr, setLatStr] = useState(coord ? String(coord.lat) : "");
  const [lngStr, setLngStr] = useState(coord ? String(coord.lng) : "");
  const [gps, setGps] = useState(false);

  // Keep the manual inputs in sync when value changes from the map / GPS / external edits.
  // Skip when the value already matches what's typed, so an in-progress decimal (e.g. "-7.")
  // isn't snapped back while the user is still editing.
  useEffect(() => {
    const c = parseCoordinate(value);
    if (c && parseFloat(latStr) === c.lat && parseFloat(lngStr) === c.lng) return;
    if (!c && latStr === "" && lngStr === "") return;
    setLatStr(c ? String(c.lat) : "");
    setLngStr(c ? String(c.lng) : "");
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const setLatLng = (lat: number, lng: number) => onChange(JSON.stringify({ lat, lng }));

  const emitFromInputs = (latS: string, lngS: string) => {
    if (latS.trim() === "" && lngS.trim() === "") { onChange(""); return; }
    const lat = parseFloat(latS);
    const lng = parseFloat(lngS);
    if (Number.isFinite(lat) && Number.isFinite(lng)) onChange(JSON.stringify({ lat, lng }));
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) { toast.error("Browser tidak mendukung GPS"); return; }
    setGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGps(false); setLatLng(pos.coords.latitude, pos.coords.longitude); },
      () => { setGps(false); toast.error("Gagal mendapatkan lokasi"); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <div className="space-y-2">
      <FormRow cols={2}>
        <FormField label="Latitude" htmlFor="coord-lat">
          <Input
            id="coord-lat"
            type="number"
            step="any"
            value={latStr}
            disabled={disabled}
            placeholder="-7.22"
            onChange={(e) => { setLatStr(e.target.value); emitFromInputs(e.target.value, lngStr); }}
          />
        </FormField>
        <FormField label="Longitude" htmlFor="coord-lng">
          <Input
            id="coord-lng"
            type="number"
            step="any"
            value={lngStr}
            disabled={disabled}
            placeholder="107.90"
            onChange={(e) => { setLngStr(e.target.value); emitFromInputs(latStr, e.target.value); }}
          />
        </FormField>
      </FormRow>

      {!disabled && (
        <Button type="button" variant="outline" size="sm" loading={gps} leftIcon={<Crosshair className="size-3.5" />} onClick={useMyLocation}>
          Gunakan lokasi saya
        </Button>
      )}

      {isLoaded && (
        <div className="h-56 w-full overflow-hidden rounded-md border border-border/60">
          <GoogleMap
            mapContainerClassName="h-full w-full"
            center={coord ?? GARUT_CENTER}
            zoom={coord ? 16 : 12}
            onClick={disabled ? undefined : (e) => { if (e.latLng) setLatLng(e.latLng.lat(), e.latLng.lng()); }}
            options={{
              fullscreenControl: false,
              streetViewControl: false,
              mapTypeControl: false,
              clickableIcons: false,
              draggableCursor: disabled ? undefined : "crosshair",
            }}
          >
            {coord && (
              <Marker
                position={coord}
                draggable={!disabled}
                onDragEnd={disabled ? undefined : (e) => { if (e.latLng) setLatLng(e.latLng.lat(), e.latLng.lng()); }}
              />
            )}
          </GoogleMap>
        </div>
      )}
    </div>
  );
}
