/**
 * Customer Portal Auth Context — separate dari staff AuthContext.
 * Pakai localStorage key "jabnet_portal_session" — token + customer info dari verify-otp.
 * apiFetch() helper otomatis include Authorization: Bearer <token>.
 */
import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";

interface PortalCustomer {
  id: number;
  customerId: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  package: string | null;
  pppoeUsername: string | null;
  status: string | null;
  isIsolir: number | null;
}

interface OtpRequestResult {
  otpSessionId: number;
  phoneMasked: string;
  ttlSec: number;
  sent: boolean;
  devMode?: boolean;
  debugOtp?: string;
  warning?: string;
}

interface PortalSession {
  token: string;
  customer: PortalCustomer;
  expiresAt: string;
}

interface PortalAuthContextType {
  customer: PortalCustomer | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  requestOtp: (customerId: string) => Promise<OtpRequestResult>;
  verifyOtp: (otpSessionId: number, code: string) => Promise<void>;
  logout: () => Promise<void>;
  apiFetch: <T = any>(path: string, init?: RequestInit) => Promise<T>;
}

const PortalAuthContext = createContext<PortalAuthContextType | null>(null);

const STORAGE_KEY = "jabnet_portal_session";
const SLUG_STORAGE_KEY = "jabnet_portal_mitra_slug";

/** Resolve current mitra slug from URL `/t/:slug/portal/*` or fallback to sessionStorage.
 *  Returns "" for legacy `/portal/*` paths (default JABNET / mitra 1). */
function getCurrentMitraSlug(): string {
  if (typeof window === "undefined") return "";
  const m = window.location.pathname.match(/^\/t\/([a-z0-9-]+)\/portal\b/i);
  if (m && m[1]) {
    try { sessionStorage.setItem(SLUG_STORAGE_KEY, m[1].toLowerCase()); } catch {}
    return m[1].toLowerCase();
  }
  try { return sessionStorage.getItem(SLUG_STORAGE_KEY) ?? ""; } catch { return ""; }
}

/** Add X-Mitra-Slug header to fetch init when a slug is active. */
function withSlugHeader(init?: RequestInit): RequestInit {
  const slug = getCurrentMitraSlug();
  if (!slug) return init ?? {};
  const headers = new Headers((init?.headers as any) ?? undefined);
  headers.set("X-Mitra-Slug", slug);
  return { ...(init ?? {}), headers };
}

export function CustomerPortalAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<PortalSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load session from localStorage on mount + validate expiry
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PortalSession;
        if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() > Date.now()) {
          setSession(parsed);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    setIsLoading(false);
  }, []);

  const requestOtp = useCallback(async (customerId: string): Promise<OtpRequestResult> => {
    const r = await fetch("/api/portal/auth/request-otp", withSlugHeader({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId }),
    }));
    const json = await r.json();
    if (!json.success) throw new Error(json.error ?? "Gagal request OTP");
    return json.data;
  }, []);

  const verifyOtp = useCallback(async (otpSessionId: number, code: string): Promise<void> => {
    const r = await fetch("/api/portal/auth/verify-otp", withSlugHeader({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otpSessionId, code }),
    }));
    const json = await r.json();
    if (!json.success) throw new Error(json.error ?? "Verifikasi OTP gagal");
    const newSession: PortalSession = {
      token: json.data.token,
      customer: json.data.customer,
      expiresAt: json.data.expiresAt,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));
    setSession(newSession);
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    if (session?.token) {
      try {
        await fetch("/api/portal/logout", withSlugHeader({
          method: "POST",
          headers: { "Authorization": `Bearer ${session.token}` },
        }));
      } catch { /* ignore network error */ }
    }
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }, [session]);

  const apiFetch = useCallback(async <T = any>(path: string, init?: RequestInit): Promise<T> => {
    if (!session?.token) throw new Error("Not authenticated");
    const slug = getCurrentMitraSlug();
    const headers: any = {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
      "Authorization": `Bearer ${session.token}`,
    };
    if (slug) headers["X-Mitra-Slug"] = slug;
    const r = await fetch(path, { ...init, headers });
    const json = await r.json();
    if (!r.ok || json.success === false) {
      // Auto-logout on 401
      if (r.status === 401) {
        localStorage.removeItem(STORAGE_KEY);
        setSession(null);
      }
      throw new Error(json.error ?? `HTTP ${r.status}`);
    }
    return json.data ?? json;
  }, [session]);

  return (
    <PortalAuthContext.Provider value={{
      customer: session?.customer ?? null,
      isAuthenticated: !!session,
      isLoading,
      requestOtp, verifyOtp, logout, apiFetch,
    }}>
      {children}
    </PortalAuthContext.Provider>
  );
}

export function usePortalAuth(): PortalAuthContextType {
  const ctx = useContext(PortalAuthContext);
  if (!ctx) throw new Error("usePortalAuth must be used within CustomerPortalAuthProvider");
  return ctx;
}
