import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";

type PermLevel = "none" | "read" | "write";

export interface MitraSummary {
  id: number;
  slug: string | null;
  displayName: string | null;
  name: string;
  logoUrl?: string | null;
  features?: string | null;
  isActive: number | null;
  isPrimary?: boolean;
}

interface AuthUser {
  id: number;
  username: string;
  name: string;
  role: string;
  token: string;
  /** Optional per-key permission matrix (e.g. { customers: "read", map: "write" }). */
  permLevels?: Record<string, PermLevel>;
  /** Legacy array of read-granted permission keys. */
  permissions?: string[];
  /** True jika user role adalah Administrator bawaan sistem. */
  isSystemAdmin?: boolean;
  /** Nama role (e.g. "Administrator", "Operator"). */
  roleName?: string;
  /** True jika user punya foto profil (di-stream via GET /api/users/:id/photo). */
  hasPhoto?: boolean;
  /** Cache-buster untuk URL avatar; di-bump saat user ganti foto. */
  avatarVersion?: number;
  /** DEPRECATED: legacy base64 data URL (dulu inline; sekarang foto di filesystem). */
  photoUrl?: string | null;
  /** Field opsional lain dari /auth/me. */
  canSeeAllData?: boolean;
  roleId?: number | null;
  /** Phase B multi-tenant - current active mitra + memberships. */
  activeMitraId?: number;
  activeMitra?: MitraSummary | null;
  mitraMemberships?: MitraSummary[];
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** True if user has at least "read" for the given permission key. */
  canRead: (key: string) => boolean;
  /** True if user has "write" for the given permission key. */
  canWrite: (key: string) => boolean;
  /** Refresh user state dari server (misal setelah update profile). Pakai ini instead of merging partial manually. */
  refreshUser: () => Promise<void>;
  /** Merge partial update ke cached user - dipakai setelah PATCH profile. */
  updateCachedUser: (patch: Partial<AuthUser> & Record<string, any>) => void;
  /** Phase B multi-tenant - switch active mitra (validates membership server-side). */
  switchMitra: (mitraId: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Tracks whether startup token validation is still in progress.
  // auth:unauthorized events are ignored during this window to prevent
  // React Query background fetches from triggering premature logout.
  const isValidatingRef = useRef(true);

  const clearAuth = useCallback(() => {
    setUser(null);
    localStorage.removeItem("ftth_user");
  }, []);

  // Validate stored token against server on startup
  useEffect(() => {
    const stored = localStorage.getItem("ftth_user");
    if (!stored) {
      setIsLoading(false);
      isValidatingRef.current = false;
      return;
    }
    let parsed: AuthUser | null = null;
    try {
      parsed = JSON.parse(stored);
    } catch {
      localStorage.removeItem("ftth_user");
      setIsLoading(false);
      isValidatingRef.current = false;
      return;
    }
    // Validate token with server
    fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${parsed!.token}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          clearAuth();
        } else {
          const json = await res.json();
          // /api/auth/me returns the user directly in data (not nested under data.user)
          const userData = json.data?.user ?? json.data;
          if (json.success && userData?.id) {
            const validated = { ...userData, token: parsed!.token };
            setUser(validated);
            localStorage.setItem("ftth_user", JSON.stringify(validated));
          } else {
            clearAuth();
          }
        }
      })
      .catch(() => {
        // Network error - keep stored session, server might be temporarily down
        setUser(parsed);
      })
      .finally(() => {
        setIsLoading(false);
        isValidatingRef.current = false;
      });
  }, [clearAuth]);

  // Listen for global 401 events from apiFetch
  useEffect(() => {
    const handle = () => {
      // Ignore 401s that fire during the initial startup validation window -
      // background queries may fire before the token is confirmed valid.
      if (isValidatingRef.current) return;
      clearAuth();
    };
    window.addEventListener("auth:unauthorized", handle);
    return () => window.removeEventListener("auth:unauthorized", handle);
  }, [clearAuth]);

  const login = async (username: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Login gagal");
    const authUser: AuthUser = json.data.user;
    localStorage.setItem("ftth_user", JSON.stringify(authUser));
    setUser(authUser);
  };

  const logout = async () => {
    const stored = localStorage.getItem("ftth_user");
    if (stored) {
      try {
        const u = JSON.parse(stored);
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${u.token}` },
        });
      } catch { /* ignore logout errors */ }
    }
    clearAuth();
  };

  // Permission helpers - check per-key access level.
  // Admin roles always pass. Otherwise consult permLevels map first,
  // then fall back to legacy permissions array for read checks.
  const canRead = useCallback(
    (key: string): boolean => {
      if (!user) return false;
      if (user.isSystemAdmin) return true;
      const level = user.permLevels?.[key];
      if (level === "read" || level === "write") return true;
      if (Array.isArray(user.permissions) && user.permissions.includes(key)) return true;
      return false;
    },
    [user]
  );

  const canWrite = useCallback(
    (key: string): boolean => {
      if (!user) return false;
      if (user.isSystemAdmin) return true;
      return user.permLevels?.[key] === "write";
    },
    [user]
  );

  const refreshUser = useCallback(async () => {
    const stored = localStorage.getItem("ftth_user");
    if (!stored) return;
    const parsed = JSON.parse(stored);
    const res = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${parsed.token}` },
    });
    if (!res.ok) return;
    const json = await res.json();
    const userData = json.data?.user ?? json.data;
    if (json.success && userData?.id) {
      const merged = { ...userData, token: parsed.token };
      setUser(merged);
      localStorage.setItem("ftth_user", JSON.stringify(merged));
    }
  }, []);

  const updateCachedUser = useCallback((patch: Partial<AuthUser> & Record<string, any>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch } as AuthUser;
      try { localStorage.setItem("ftth_user", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const switchMitra = useCallback(async (mitraId: number) => {
    const stored = localStorage.getItem("ftth_user");
    if (!stored) throw new Error("Belum login");
    const parsed = JSON.parse(stored);
    const res = await fetch("/api/auth/switch-tenant", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${parsed.token}`,
      },
      body: JSON.stringify({ mitraId }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Gagal switch mitra");
    // Refresh full /me to ensure permLevels + mitra fields all in sync, then reload page
    // to clear any tenant-scoped TanStack Query caches.
    await refreshUser();
    if (typeof window !== "undefined") {
      // Soft reload - TanStack QueryClient.clear() also works but page reload is more reliable
      window.location.reload();
    }
  }, [refreshUser]);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, canRead, canWrite, refreshUser, updateCachedUser, switchMitra }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
