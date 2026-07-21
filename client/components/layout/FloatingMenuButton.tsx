import { useLocation } from "wouter";
import { Menu, ArrowLeft, Home } from "lucide-react";
import { useSidebar } from "@/context/SidebarContext";

interface FloatingMenuButtonProps {
  /** Page label shown as floating pill next to menu button. */
  pageLabel?: string;
  /** Show back-arrow variant instead of hamburger. */
  variant?: "menu" | "back";
}

/**
 * FloatingMenuButton - premium floating control for mobile full-screen pages
 * (Map, Canvassing). Provides escape route to sidebar/menu when TopBar is hidden.
 *
 * Pattern follows Google Maps / Waze / Gojek: glass-morphism circular button
 * with safe-area inset and subtle shadow, top-left position.
 */
export function FloatingMenuButton({ pageLabel, variant = "menu" }: FloatingMenuButtonProps) {
  const [location, setLocation] = useLocation();
  const { setMobileOpen } = useSidebar();

  const handleClick = () => {
    if (variant === "back") {
      // If there's history, go back; otherwise go home
      if (window.history.length > 1) {
        window.history.back();
      } else {
        setLocation("/");
      }
    } else {
      setMobileOpen(true);
    }
  };

  const Icon = variant === "back" ? ArrowLeft : Menu;

  return (
    <div
      className="md:hidden fixed top-0 left-0 z-40 flex items-center gap-2 p-3"
      style={{ paddingTop: "max(12px, env(safe-area-inset-top, 12px))" }}
    >
      {/* Menu / Back button */}
      <button
        onClick={handleClick}
        className="h-11 w-11 rounded-full bg-background/90 backdrop-blur-xl shadow-elev-lg border border-border/50 flex items-center justify-center hover:bg-background transition-all active:scale-95"
        aria-label={variant === "back" ? "Kembali" : "Buka menu"}
      >
        <Icon className="h-5 w-5 text-foreground" strokeWidth={2.25} />
      </button>

      {/* Optional page label pill */}
      {pageLabel && (
        <div className="h-11 px-4 flex items-center rounded-full bg-background/90 backdrop-blur-xl shadow-elev-lg border border-border/50">
          <span className="text-sm font-semibold text-foreground tracking-tight max-w-[180px] truncate">
            {pageLabel}
          </span>
        </div>
      )}

      {/* Home quick shortcut */}
      <button
        onClick={() => setLocation("/")}
        className="h-11 w-11 rounded-full bg-background/90 backdrop-blur-xl shadow-elev-lg border border-border/50 flex items-center justify-center hover:bg-background transition-all active:scale-95"
        aria-label="Ke Dashboard"
        title="Dashboard"
      >
        <Home className="h-5 w-5 text-foreground" strokeWidth={2.25} />
      </button>
    </div>
  );
}
