/** Banner "versi terbaru tersedia" (v5.7): tampil untuk admin saat ada pembaruan di GitHub.
 *  Poll ringan tiap 30 menit (server cache 5 menit). Klik -> ke Integrasi untuk update.
 *  Bisa ditutup per-sesi (dismiss disimpan per SHA di sessionStorage). */
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { DownloadCloud, X } from "lucide-react";

type CheckResult = {
  updateAvailable: boolean;
  remote: { sourceShaShort: string | null };
};

export function UpdateBanner() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const isAdmin = !!user && (user.isSystemAdmin || user.role === "admin" || user.role === "Administrator");
  const [dismissed, setDismissed] = useState<string | null>(null);

  const { data } = useQuery<CheckResult>({
    queryKey: ["/api/system/update/check", "banner"],
    queryFn: () => api.get<CheckResult>("/system/update/check"),
    enabled: isAdmin,
    staleTime: 30 * 60_000,
    refetchInterval: 30 * 60_000,
    refetchIntervalInBackground: false,
    retry: false,
  });

  if (!isAdmin || !data?.updateAvailable) return null;
  const sha = data.remote.sourceShaShort ?? "baru";
  // Dismiss per SHA (via sessionStorage) supaya tidak muncul lagi sampai versi berganti.
  const key = `jabnet_update_dismissed_${sha}`;
  if (dismissed === sha || (typeof sessionStorage !== "undefined" && sessionStorage.getItem(key))) return null;

  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm dark:border-amber-900 dark:bg-amber-950/30">
      <DownloadCloud className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 flex-1">
        <span className="font-semibold text-amber-800 dark:text-amber-200">Versi terbaru tersedia ({sha}).</span>{" "}
        <span className="text-amber-700/80 dark:text-amber-300/80">Buka Integrasi untuk memperbarui aplikasi.</span>
      </div>
      <button
        onClick={() => navigate("/integrations")}
        className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
      >
        Update
      </button>
      <button
        aria-label="Tutup"
        onClick={() => { try { sessionStorage.setItem(key, "1"); } catch { /* - */ } setDismissed(sha); }}
        className="shrink-0 rounded-md p-1 text-amber-600 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/40"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
