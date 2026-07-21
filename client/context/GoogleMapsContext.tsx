import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useJsApiLoader } from "@react-google-maps/api";

// Load Google Maps ONCE at the app level with ALL libraries needed
// (places = untuk CanvassingPage & ProspectPage, geometry = untuk jarak)
const LIBRARIES: ("places" | "geometry")[] = ["places", "geometry"];

// Key resolved at runtime from /api/public-config (reads google_maps_api_key per active mitra
// from mitra_integrations). No source-code fallback - owner must set via /integrations.

interface GoogleMapsContextType {
  isLoaded: boolean;
  loadError: Error | undefined;
}

const GoogleMapsContext = createContext<GoogleMapsContextType>({
  isLoaded: false,
  loadError: undefined,
});

export function GoogleMapsProvider({ children }: { children: ReactNode }) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/public-config")
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const fetched = json?.data?.googleMapsApiKey?.trim();
        setApiKey(fetched || null);
        setResolved(true);
      })
      .catch(() => {
        if (!cancelled) { setApiKey(null); setResolved(true); }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!resolved || !apiKey) {
    return (
      <GoogleMapsContext.Provider value={{ isLoaded: false, loadError: undefined }}>
        {children}
      </GoogleMapsContext.Provider>
    );
  }

  return <GoogleMapsLoader apiKey={apiKey}>{children}</GoogleMapsLoader>;
}

function GoogleMapsLoader({ apiKey, children }: { apiKey: string; children: ReactNode }) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: apiKey,
    libraries: LIBRARIES,
  });

  return (
    <GoogleMapsContext.Provider value={{ isLoaded, loadError }}>
      {children}
    </GoogleMapsContext.Provider>
  );
}

export function useGoogleMaps() {
  return useContext(GoogleMapsContext);
}
