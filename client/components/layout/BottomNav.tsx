import { useMemo } from "react";
import { useLocation } from "wouter";
import { Menu as MenuIcon, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSidebar } from "@/context/SidebarContext";
import { DIVISIONS, ROLE_HOME_DIVISION, getDivision, type Division, type DivisionModule } from "@/lib/divisions";

/** Leaf modul (path + icon + permission) - termasuk anak nested. */
type Leaf = { label: string; path: string; icon: any; permission?: string };

function flattenLeaves(mods: DivisionModule[]): Leaf[] {
  const out: Leaf[] = [];
  for (const m of mods) {
    if (m.children) out.push(...flattenLeaves(m.children));
    else if (m.path) out.push({ label: m.label, path: m.path, icon: m.icon, permission: m.permission });
  }
  return out;
}

/** Bottom nav mobile - v5.8: DIVISI-AWARE. Menu cepat mengikuti divisi aktif
 *  (dari lokasi saat ini, fallback ke divisi home role). Tombol "Menu" membuka
 *  drawer sidebar penuh (semua divisi + modul). Sumber: client/lib/divisions.ts. */
export function BottomNav() {
  const [location, setLocation] = useLocation();
  const { user, canRead } = useAuth();
  const { setMobileOpen } = useSidebar();

  const canSee = (p?: string) => !p || canRead(p);

  // Divisi aktif: yang salah satu modulnya cocok dengan lokasi; fallback divisi home role;
  // fallback divisi pertama yang punya modul terlihat.
  const activeDivision: Division | undefined = useMemo(() => {
    for (const d of DIVISIONS) {
      const leaves = flattenLeaves(d.modules).filter((l) => canSee(l.permission));
      if (leaves.some((l) => location === l.path || location.startsWith(l.path + "/"))) return d;
    }
    const home = getDivision(ROLE_HOME_DIVISION[user?.role ?? ""]);
    if (home && flattenLeaves(home.modules).some((l) => canSee(l.permission))) return home;
    return DIVISIONS.find((d) => flattenLeaves(d.modules).some((l) => canSee(l.permission)));
  }, [location, user?.role, canRead]);

  // Maks 3 modul cepat dari divisi aktif (permission-filtered) + Beranda + Menu = 5 item.
  const quick: Leaf[] = useMemo(() => {
    if (!activeDivision) return [];
    return flattenLeaves(activeDivision.modules).filter((l) => canSee(l.permission)).slice(0, 3);
  }, [activeDivision, canRead]);

  const isActive = (path: string) => location === path || location.startsWith(path + "/");

  return (
    <nav className="bottom-nav md:hidden" aria-label="Navigasi bawah">
      <div className="flex items-stretch">
        {/* Beranda global */}
        <button
          onClick={() => setLocation("/")}
          className={`bottom-nav-item flex-1 ${location === "/" ? "active" : ""}`}
          aria-label="Beranda"
          aria-current={location === "/" ? "page" : undefined}
        >
          <span className="icon-wrap"><LayoutDashboard className="icon" strokeWidth={location === "/" ? 2.5 : 2} /></span>
          <span className="label">Beranda</span>
        </button>

        {/* Modul cepat divisi aktif */}
        {quick.map((item) => {
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => setLocation(item.path)}
              className={`bottom-nav-item flex-1 ${active ? "active" : ""}`}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
            >
              <span className="icon-wrap"><item.icon className="icon" strokeWidth={active ? 2.5 : 2} /></span>
              <span className="label">{shortLabel(item.label)}</span>
            </button>
          );
        })}

        {/* Menu penuh (drawer sidebar semua divisi) */}
        <button
          onClick={() => setMobileOpen(true)}
          className="bottom-nav-item flex-1"
          aria-label="Buka menu lengkap"
        >
          <span className="icon-wrap"><MenuIcon className="icon" strokeWidth={2} /></span>
          <span className="label">Menu</span>
        </button>
      </div>
    </nav>
  );
}

/** Perpendek label panjang agar muat di tab bottom-nav (mis. buang keterangan dalam kurung). */
function shortLabel(label: string): string {
  const noParen = label.replace(/\s*\(.*?\)\s*/g, " ").trim();
  const first = noParen.split(/\s+/)[0];
  // Kalau kata pertama masih panjang, potong; kalau pendek pakai apa adanya (maks ~10 char).
  return (first.length <= 10 ? first : first.slice(0, 9) + "…");
}
