const BASE_URL = "/api";

// Endpoint sekunder: 401 di sini JANGAN memaksa logout seluruh sesi. Kalau token benar-benar
// mati, endpoint kritis (dashboard/auth) akan 401 juga dan logout terpicu di sana. Ini mencegah
// satu endpoint sekunder (mis. /system/update/check yang admin-only) menendang user dari sesi.
const NON_SESSION_CRITICAL_401 = ["/system/"];
function is401SessionCritical(path: string): boolean {
  return !NON_SESSION_CRITICAL_401.some((p) => path.startsWith(p));
}

export function getAuthHeaders(): Record<string, string> {
  const stored = localStorage.getItem("ftth_user");
  if (!stored) return {};
  try {
    const user = JSON.parse(stored);
    return user?.token ? { Authorization: `Bearer ${user.token}` } : {};
  } catch { return {}; }
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...options?.headers,
    },
    ...options,
  });

  // Handle 401 globally - only trigger logout if user is actually logged in AND
  // endpoint-nya kritis untuk sesi (bukan endpoint sekunder yang cuma butuh izin khusus).
  if (res.status === 401) {
    if (is401SessionCritical(path) && localStorage.getItem("ftth_user")) {
      window.dispatchEvent(new CustomEvent("auth:unauthorized"));
      throw new Error("Sesi berakhir. Silakan login kembali.");
    }
    throw new Error("Akses ditolak.");
  }

  let json: any;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Server error: ${res.status} ${res.statusText}`);
  }

  if (!res.ok || !json.success) {
    throw new Error(json.error || `Request failed: ${res.statusText}`);
  }

  return json.data as T;
}

async function apiFetchBlob(path: string): Promise<Blob> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { ...getAuthHeaders() },
  });
  if (res.status === 401) {
    if (localStorage.getItem("ftth_user")) {
      window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    }
    throw new Error("Sesi berakhir. Silakan login kembali.");
  }
  if (!res.ok) {
    throw new Error(`Download gagal: ${res.status} ${res.statusText}`);
  }
  return res.blob();
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, body !== undefined
      ? { method: "DELETE", body: JSON.stringify(body) }
      : { method: "DELETE" }),
  getBlob: (path: string) => apiFetchBlob(path),
};
