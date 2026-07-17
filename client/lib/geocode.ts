export interface GeoAddress {
  district: string;
  village: string;
  city: string;
  province: string;
  formatted: string;
}

let cachedKey: string | null = null;
let cachedKeyAt = 0;
const KEY_TTL_MS = 5 * 60_000;

async function getMapsApiKey(): Promise<string> {
  const now = Date.now();
  if (cachedKey && now - cachedKeyAt < KEY_TTL_MS) return cachedKey;
  try {
    const res = await fetch("/api/public-config");
    const json = await res.json();
    const key = json?.data?.googleMapsApiKey ?? "";
    cachedKey = key;
    cachedKeyAt = now;
    return key;
  } catch {
    return "";
  }
}

function getComponent(
  components: Array<{ long_name: string; types: string[] }>,
  type: string,
): string {
  return components.find((c) => c.types.includes(type))?.long_name ?? "";
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeoAddress | null> {
  try {
    const apiKey = await getMapsApiKey();
    if (!apiKey) return null;
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}&language=id`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== "OK" || !data.results?.length) return null;

    const components = data.results[0].address_components as Array<{ long_name: string; types: string[] }>;
    return {
      district: getComponent(components, "administrative_area_level_3"),
      village: getComponent(components, "administrative_area_level_4"),
      city: getComponent(components, "administrative_area_level_2"),
      province: getComponent(components, "administrative_area_level_1"),
      formatted: data.results[0].formatted_address ?? "",
    };
  } catch {
    return null;
  }
}
