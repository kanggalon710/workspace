import { useLocation } from "wouter";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { TopBar } from "./TopBar";
import { FloatingMenuButton } from "./FloatingMenuButton";
import { useSidebar } from "@/context/SidebarContext";

interface LayoutProps {
  children: React.ReactNode;
}

// Map fullscreen paths to display labels for the floating pill
const FULLSCREEN_LABELS: Record<string, string> = {
  "/map": "Peta Jaringan",
  "/canvassing": "Canvassing",
};

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { collapsed } = useSidebar();
  const isFullScreen = location === "/map" || location === "/canvassing";
  // v4.2.6: TechnicianWorkPage (/work/:id) dirender FULL chrome-less - tanpa sidebar, topbar, padding, atau bottom-nav.
  // Ini halaman mobile-first untuk teknisi lapangan yang butuh layar maksimal.
  const isChromeless = location.startsWith("/work/");
  const pageLabel = FULLSCREEN_LABELS[location];

  // Chromeless mode: render anak langsung tanpa wrapper apapun
  if (isChromeless) {
    return <div className="min-h-screen bg-background">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main
        className={`transition-[margin] duration-300 ${
          collapsed ? "md:ml-0" : "md:ml-64"
        } ${isFullScreen ? "h-screen overflow-hidden flex flex-col" : "min-h-screen pb-16 md:pb-0"}`}
      >
        {/* Global Top Bar - sticky header (hidden on fullscreen pages) */}
        {!isFullScreen && <TopBar />}

        {/* Content area */}
        <div
          className={
            isFullScreen
              ? "flex-1 h-full md:p-4 flex flex-col relative"
              : "p-4 md:p-6 relative"
          }
        >
          {/* Subtle dot pattern background (non-fullscreen pages only) */}
          {!isFullScreen && (
            <div
              className="absolute inset-0 bg-dot-pattern opacity-[0.35] pointer-events-none"
              aria-hidden="true"
            />
          )}
          <div className={isFullScreen ? "contents" : "relative"}>{children}</div>
        </div>
      </main>

      {/* Floating menu button - mobile full-screen pages (Map/Canvassing) */}
      {isFullScreen && <FloatingMenuButton pageLabel={pageLabel} />}

      {!isFullScreen && <BottomNav />}
    </div>
  );
}
