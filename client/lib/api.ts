const BASE_URL = "/api";

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

  // Handle 401 globally — only trigger logout if user is actually logged in
  if (res.status === 401) {
    // Don't fire the event if localStorage is already empty (already logged out)
    if (localStorage.getItem("ftth_user")) {
      window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    }
    throw new Error("Sesi berakhir. Silakan login kembali.");
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
