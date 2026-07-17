import { Switch, Route, Redirect, useLocation } from "wouter";
import { useEffect, Suspense, lazy } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Layout } from "@/components/layout/Layout";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { CustomerPortalAuthProvider } from "@/context/CustomerPortalAuthContext";
import { SidebarProvider } from "@/context/SidebarContext";
import { GoogleMapsProvider } from "@/context/GoogleMapsContext";
import { ErrorBoundary } from "@/components/ui/error-boundary";

// ── Lazy-loaded pages ──
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const MapPage = lazy(() => import("@/pages/MapPage"));
const PopsPage = lazy(() => import("@/pages/PopsPage"));
const OdcsPage = lazy(() => import("@/pages/OdcsPage"));
const OdpsPage = lazy(() => import("@/pages/OdpsPage"));
const CustomersPage = lazy(() => import("@/pages/CustomersPage"));
const CommunicationsPage = lazy(() => import("@/pages/CommunicationsPage"));
const PolesPage = lazy(() => import("@/pages/PolesPage"));
const CablesPage = lazy(() => import("@/pages/CablesPage"));
const OtbManagerPage = lazy(() => import("@/pages/OtbManagerPage"));
const BestrayManagerPage = lazy(() => import("@/pages/BestrayManagerPage"));
const SplittersPage = lazy(() => import("@/pages/SplittersPage"));
const CableCoreManagerPage = lazy(() => import("@/pages/CableCoreManagerPage"));
const PowerBudgetPage = lazy(() => import("@/pages/PowerBudgetPage"));
const CoreConnectionPage = lazy(() => import("@/pages/CoreConnectionPage"));
const SplitterChainPage = lazy(() => import("@/pages/SplitterChainPage"));
const ExportImportPage = lazy(() => import("@/pages/ExportImportPage"));
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const AuditLogPage = lazy(() => import("@/pages/AuditLogPage"));
const UsersPage = lazy(() => import("@/pages/UsersPage"));
const RolesPage = lazy(() => import("@/pages/RolesPage"));
const CollectionPipelinePage = lazy(() => import("@/pages/CollectionPipelinePage"));
const LoyaltyAdminPage = lazy(() => import("@/pages/LoyaltyAdminPage"));
const MpwaPage = lazy(() => import("@/pages/MpwaPage"));
const BroadcastPage = lazy(() => import("@/pages/BroadcastPage"));
// v4.2.20 (PRD WA Feature v2): 4 submenu Whatsapp
const NomorWhatsappPage = lazy(() => import("@/pages/whatsapp/NomorWhatsappPage"));
const TemplateWhatsappPage = lazy(() => import("@/pages/whatsapp/TemplateWhatsappPage"));
const BroadcastPelangganPageV2 = lazy(() => import("@/pages/whatsapp/BroadcastPelangganPage"));
const BroadcastResellerPage = lazy(() => import("@/pages/whatsapp/BroadcastResellerPage"));
// v4.2.24: Phonebook
const PhonebookPage = lazy(() => import("@/pages/whatsapp/PhonebookPage"));
const PublicApiPage = lazy(() => import("@/pages/PublicApiPage"));
const AnnouncementsPage = lazy(() => import("@/pages/AnnouncementsPage"));
const BugReportsPage = lazy(() => import("@/pages/BugReportsPage"));
// Portal pelanggan (public routes)
const PortalLoginPage = lazy(() => import("@/pages/portal/PortalLoginPage"));
const PortalVerifyOtpPage = lazy(() => import("@/pages/portal/PortalVerifyOtpPage"));
const PortalDashboardPage = lazy(() => import("@/pages/portal/PortalDashboardPage"));
const PortalTrackerPage = lazy(() => import("@/pages/portal/PortalTrackerPage"));
const PortalCsatPage = lazy(() => import("@/pages/portal/PortalCsatPage"));
const TicketCategoriesPage = lazy(() => import("@/pages/TicketCategoriesPage"));
const ProspectPage = lazy(() => import("@/pages/ProspectPage"));
const CanvassingPage = lazy(() => import("@/pages/CanvassingPage"));
const LeadPipelinePage = lazy(() => import("@/pages/LeadPipelinePage"));
const MarketingDashboardPage = lazy(() => import("@/pages/MarketingDashboardPage"));
const ContactsPage = lazy(() => import("@/pages/ContactsPage"));
const BusinessDecisionPage = lazy(() => import("@/pages/BusinessDecisionPage"));
const CoverageCheckPage = lazy(() => import("@/pages/CoverageCheckPage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const MikrotikRoutersPage = lazy(() => import("@/pages/MikrotikRoutersPage"));
const ActiveSessionsPage = lazy(() => import("@/pages/ActiveSessionsPage"));
const PaketInternetPage = lazy(() => import("@/pages/PaketInternetPage"));
const MonitoringPage = lazy(() => import("@/pages/MonitoringPage"));
const IntegrationPage = lazy(() => import("@/pages/IntegrationPage"));
const MarketingAdsPage = lazy(() => import("@/pages/MarketingAdsPage"));
const CanvassingHistoryPage = lazy(() => import("@/pages/CanvassingHistoryPage"));
const CanvassingReportsPage = lazy(() => import("@/pages/CanvassingReportsPage"));
const TechnicianWorkPage = lazy(() => import("@/pages/TechnicianWorkPage"));
const TicketingPage = lazy(() => import("@/pages/TicketingPage"));
const TicketHeatmapPage = lazy(() => import("@/pages/TicketHeatmapPage"));
const TicketsDashboardPage = lazy(() => import("@/pages/TicketsDashboardPage"));
const SlaCalendarPage = lazy(() => import("@/pages/SlaCalendarPage"));
const GenieAcsDevicesPage = lazy(() => import("@/pages/GenieAcsDevicesPage"));
const ShowcasePage = lazy(() => import("@/pages/ShowcasePage"));
const MitraPage = lazy(() => import("@/pages/MitraPage"));
const PipelinesPage = lazy(() => import("@/pages/PipelinesPage"));
const PipelineBoardPage = lazy(() => import("@/pages/PipelineBoardPage"));
// Teamspace v5.0
const TeamListPage = lazy(() => import("@/pages/TeamListPage"));
const TeamPage = lazy(() => import("@/pages/TeamPage"));
const AllTasksPage = lazy(() => import("@/pages/AllTasksPage"));
const PerformancePage = lazy(() => import("@/pages/PerformancePage"));
const CheersPage = lazy(() => import("@/pages/CheersPage"));
const ChatwootAgentMapPage = lazy(() => import("@/pages/ChatwootAgentMapPage"));

// ── Loading fallback ──
function PageLoader() {
  return (
    <div
      className="flex items-center justify-center min-h-[60vh] p-4"
      role="status"
      aria-live="polite"
      aria-label="Memuat halaman"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-700 flex items-center justify-center shadow-elev-md">
            <span className="text-white font-bold text-lg">J</span>
          </div>
          <div className="absolute -inset-1 rounded-2xl border-2 border-primary/30 border-t-primary animate-spin" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">Memuat halaman</p>
          <p className="text-xs text-muted-foreground mt-0.5">Mohon tunggu sebentar...</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Permission guard untuk per-route access control.
 * Jika user tidak punya read permission untuk feature tertentu, tampilkan
 * halaman Access Denied dengan link kembali ke dashboard.
 * Sidebar sudah hide menu-nya, tapi user bisa tetap type URL langsung — guard ini blokir akses itu.
 */
function WithPerm({ permission, requireSystemAdmin, children }: { permission?: string; requireSystemAdmin?: boolean; children: React.ReactNode }) {
  const { canRead, user } = useAuth();
  const [, setLoc] = useLocation();
  if (requireSystemAdmin && !user?.isSystemAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[70vh] p-6">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-red-500/20 to-red-600/10 ring-1 ring-red-500/20 mb-5">
            <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-xl md:text-2xl font-bold mb-2">Halaman ini Hanya untuk JABNET</h1>
          <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
            Halaman ini hanya bisa diakses oleh System Administrator (JABNET). Mitra admin tidak punya izin.
          </p>
          <button
            onClick={() => setLoc("/")}
            className="h-10 px-5 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors shadow-elev-sm"
          >
            ← Kembali ke Dashboard
          </button>
        </div>
      </div>
    );
  }
  if (!permission) return <>{children}</>;
  if (canRead(permission)) return <>{children}</>;
  return (
    <div className="flex items-center justify-center min-h-[70vh] p-6">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-red-500/20 to-red-600/10 ring-1 ring-red-500/20 mb-5">
          <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h1 className="text-xl md:text-2xl font-bold mb-2">Akses Ditolak</h1>
        <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
          Role kamu tidak memiliki izin untuk membuka halaman ini.
          Hubungi administrator jika butuh akses fitur{" "}
          <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs">{permission}</code>.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
          <button
            onClick={() => setLoc("/")}
            className="w-full sm:w-auto h-10 px-5 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors shadow-elev-sm"
          >
            ← Kembali ke Dashboard
          </button>
          <button
            onClick={() => setLoc("/profile")}
            className="w-full sm:w-auto h-10 px-5 rounded-md border border-input bg-background font-medium text-sm hover:bg-accent transition-colors"
          >
            Lihat Profil Saya
          </button>
        </div>
      </div>
    </div>
  );
}

function ProtectedRouter() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  // ── Global keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't fire if typing in input/textarea
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if ((e.ctrlKey || e.metaKey) && e.key === "m") {
        e.preventDefault();
        setLocation("/map");
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        e.preventDefault();
        setLocation("/");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setLocation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center animate-pulse">
            <span className="text-white font-bold text-lg">J</span>
          </div>
          <div className="flex items-center gap-3 text-muted-foreground">
            <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            Memuat JABNET Workspace...
          </div>
        </div>
      </div>
    );
  }

  if (!isLoading && !user) return <Redirect to="/login" />;

  return (
    <Layout>
      <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          {/* Dashboard & profil — selalu accessible untuk user login */}
          <Route path="/" component={Dashboard} />
          <Route path="/profile" component={ProfilePage} />
          <Route path="/showcase" component={ShowcasePage} />
          {/* Aset jaringan — guarded per feature permission */}
          <Route path="/map">{() => <WithPerm permission="map"><MapPage /></WithPerm>}</Route>
          <Route path="/pops">{() => <WithPerm permission="pops"><PopsPage /></WithPerm>}</Route>
          <Route path="/odcs">{() => <WithPerm permission="odcs"><OdcsPage /></WithPerm>}</Route>
          <Route path="/odps">{() => <WithPerm permission="odps"><OdpsPage /></WithPerm>}</Route>
          <Route path="/poles">{() => <WithPerm permission="poles"><PolesPage /></WithPerm>}</Route>
          <Route path="/cables">{() => <WithPerm permission="cables"><CablesPage /></WithPerm>}</Route>
          <Route path="/otb-manager">{() => <WithPerm permission="otbs"><OtbManagerPage /></WithPerm>}</Route>
          <Route path="/bestray-manager">{() => <WithPerm permission="bestrays"><BestrayManagerPage /></WithPerm>}</Route>
          <Route path="/splitters">{() => <WithPerm permission="splitters"><SplittersPage /></WithPerm>}</Route>
          <Route path="/cable-cores">{() => <WithPerm permission="cable_cores"><CableCoreManagerPage /></WithPerm>}</Route>
          <Route path="/core-connections">{() => <WithPerm permission="core_connections"><CoreConnectionPage /></WithPerm>}</Route>
          <Route path="/splitter-chain">{() => <WithPerm permission="splitter_chain"><SplitterChainPage /></WithPerm>}</Route>
          <Route path="/power-budget">{() => <WithPerm permission="power_budget"><PowerBudgetPage /></WithPerm>}</Route>
          <Route path="/export-import">{() => <WithPerm permission="export_import"><ExportImportPage /></WithPerm>}</Route>
          {/* Billing & MikroTik */}
          <Route path="/customers">{() => <WithPerm permission="customers"><CustomersPage /></WithPerm>}</Route>
          <Route path="/communications">{() => <WithPerm permission="chatwoot"><CommunicationsPage /></WithPerm>}</Route>
          <Route path="/tickets/categories">{() => <WithPerm permission="tickets"><TicketCategoriesPage /></WithPerm>}</Route>
          <Route path="/tickets/heatmap">{() => <WithPerm permission="tickets"><TicketHeatmapPage /></WithPerm>}</Route>
          <Route path="/tickets/dashboard">{() => <WithPerm permission="tickets"><TicketsDashboardPage /></WithPerm>}</Route>
          <Route path="/settings/sla-calendar">{() => <WithPerm permission="tickets"><SlaCalendarPage /></WithPerm>}</Route>
          <Route path="/tickets">{() => <WithPerm permission="tickets"><TicketingPage /></WithPerm>}</Route>
          <Route path="/collections">{() => <WithPerm permission="collections"><CollectionPipelinePage /></WithPerm>}</Route>
          <Route path="/pipelines">{() => <WithPerm permission="pipelines"><PipelinesPage /></WithPerm>}</Route>
          <Route path="/pipelines/:id">{() => <WithPerm permission="pipelines"><PipelineBoardPage /></WithPerm>}</Route>
          {/* Teamspace v5.0 — kolaborasi tim internal */}
          <Route path="/teamspace/tasks">{() => <WithPerm permission="team_tasks"><AllTasksPage /></WithPerm>}</Route>
          <Route path="/teamspace/teams">{() => <WithPerm permission="team_tasks"><TeamListPage /></WithPerm>}</Route>
          <Route path="/teamspace/teams/:id">{() => <WithPerm permission="team_tasks"><TeamPage /></WithPerm>}</Route>
          <Route path="/teamspace/boards/:id">{() => <WithPerm permission="team_tasks"><PipelineBoardPage /></WithPerm>}</Route>
          <Route path="/teamspace/performance">{() => <WithPerm permission="performance_reports"><PerformancePage /></WithPerm>}</Route>
          <Route path="/teamspace/cheers">{() => <WithPerm permission="cheers"><CheersPage /></WithPerm>}</Route>
          <Route path="/loyalty">{() => <WithPerm permission="loyalty_admin"><LoyaltyAdminPage /></WithPerm>}</Route>
          <Route path="/api-keys">{() => <WithPerm permission="api_keys"><PublicApiPage /></WithPerm>}</Route>
          <Route path="/announcements" component={AnnouncementsPage} />
          <Route path="/bugs" component={BugReportsPage} />
          <Route path="/bugs/:id" component={BugReportsPage} />
          <Route path="/work/:id" component={TechnicianWorkPage} />
          <Route path="/devices">{() => <WithPerm permission="devices"><GenieAcsDevicesPage /></WithPerm>}</Route>
          <Route path="/billing/routers">{() => <WithPerm permission="routers"><MikrotikRoutersPage /></WithPerm>}</Route>
          <Route path="/billing/sessions">{() => <WithPerm permission="sessions"><ActiveSessionsPage /></WithPerm>}</Route>
          <Route path="/billing/packages">{() => <WithPerm permission="packages"><PaketInternetPage /></WithPerm>}</Route>
          <Route path="/billing/monitoring">{() => <WithPerm permission="monitoring"><MonitoringPage /></WithPerm>}</Route>
          {/* Marketing */}
          <Route path="/marketing">{() => <WithPerm permission="marketing_dashboard"><MarketingDashboardPage /></WithPerm>}</Route>
          <Route path="/canvassing">{() => <WithPerm permission="canvassing"><CanvassingPage /></WithPerm>}</Route>
          <Route path="/canvassing/history">{() => <WithPerm permission="canvassing"><CanvassingHistoryPage /></WithPerm>}</Route>
          <Route path="/canvassing/reports">{() => <WithPerm permission="canvassing"><CanvassingReportsPage /></WithPerm>}</Route>
          <Route path="/leads">{() => <WithPerm permission="leads"><LeadPipelinePage /></WithPerm>}</Route>
          <Route path="/contacts">{() => <WithPerm permission="contacts"><ContactsPage /></WithPerm>}</Route>
          <Route path="/prospects">{() => <WithPerm permission="prospects"><ProspectPage /></WithPerm>}</Route>
          <Route path="/marketing/ads">{() => <WithPerm permission="marketing_ads"><MarketingAdsPage /></WithPerm>}</Route>
          <Route path="/marketing/bisnis">{() => <WithPerm permission="marketing_dashboard"><BusinessDecisionPage /></WithPerm>}</Route>
          {/* Integrasi & Tools */}
          <Route path="/integrations">{() => <WithPerm permission="integrations"><IntegrationPage /></WithPerm>}</Route>
          <Route path="/integrations/chatwoot/agents">{() => <WithPerm permission="chatwoot_settings"><ChatwootAgentMapPage /></WithPerm>}</Route>
          <Route path="/mpwa">{() => <WithPerm permission="mpwa"><MpwaPage /></WithPerm>}</Route>
          <Route path="/broadcast">{() => <WithPerm permission="broadcast"><BroadcastPage /></WithPerm>}</Route>
          {/* v4.2.20 (PRD WA Feature v2): 4 submenu */}
          <Route path="/whatsapp/devices">{() => <WithPerm permission="whatsapp"><NomorWhatsappPage /></WithPerm>}</Route>
          <Route path="/whatsapp/templates">{() => <WithPerm permission="whatsapp"><TemplateWhatsappPage /></WithPerm>}</Route>
          <Route path="/whatsapp/broadcast/pelanggan">{() => <WithPerm permission="whatsapp"><BroadcastPelangganPageV2 /></WithPerm>}</Route>
          <Route path="/whatsapp/broadcast/reseller">{() => <WithPerm permission="whatsapp"><BroadcastResellerPage /></WithPerm>}</Route>
          <Route path="/whatsapp/phonebook">{() => <WithPerm permission="phonebooks"><PhonebookPage /></WithPerm>}</Route>
          <Route path="/audit-logs">{() => <WithPerm permission="audit_logs"><AuditLogPage /></WithPerm>}</Route>
          <Route path="/mitra">{() => <WithPerm requireSystemAdmin><MitraPage /></WithPerm>}</Route>
          <Route path="/users">{() => <WithPerm permission="user_management"><UsersPage /></WithPerm>}</Route>
          <Route path="/roles">{() => <WithPerm permission="user_management"><RolesPage /></WithPerm>}</Route>
          <Route>
            <div className="flex items-center justify-center min-h-[70vh] p-6">
              <div className="text-center max-w-md">
                <div className="relative inline-block mb-4">
                  <h1 className="text-7xl md:text-8xl font-black bg-gradient-to-br from-sky-500 to-blue-700 bg-clip-text text-transparent select-none">
                    404
                  </h1>
                  <div className="absolute -top-2 -right-2 w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                </div>
                <h2 className="text-xl md:text-2xl font-bold text-foreground mb-2">
                  Halaman Tidak Ditemukan
                </h2>
                <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                  URL yang kamu buka tidak tersedia atau mungkin sudah dipindah.
                  Cek ejaan URL atau kembali ke halaman utama.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                  <button
                    onClick={() => setLocation("/")}
                    className="w-full sm:w-auto h-10 px-5 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors shadow-elev-sm"
                  >
                    ← Kembali ke Dashboard
                  </button>
                  <button
                    onClick={() => window.history.back()}
                    className="w-full sm:w-auto h-10 px-5 rounded-md border border-input bg-background font-medium text-sm hover:bg-accent transition-colors"
                  >
                    Halaman Sebelumnya
                  </button>
                </div>
              </div>
            </div>
          </Route>
        </Switch>
      </Suspense>
    </ErrorBoundary>
  </Layout>
  );
}

// v4.2.13: Detect kalau diakses lewat domain portal khusus pelanggan.
// Saat hostname = portal.jabnet.id (atau env override), routing dibatasi ke /portal/* saja —
// staff workspace ngga ke-load di sini, sidebar/staff dashboard tidak muncul.
const PORTAL_HOSTNAMES = ["portal.jabnet.id", "portal.jabnet.local"];
function isPortalDomain(): boolean {
  if (typeof window === "undefined") return false;
  // Dev override: ?portal=1 supaya bisa test routing portal di localhost
  if (import.meta.env?.DEV && new URLSearchParams(window.location.search).get("portal") === "1") {
    sessionStorage.setItem("__portal_dev_override", "1");
    return true;
  }
  if (import.meta.env?.DEV && sessionStorage.getItem("__portal_dev_override") === "1") return true;
  return PORTAL_HOSTNAMES.includes(window.location.hostname);
}

function Router() {
  const portalOnly = isPortalDomain();
  // v4.2.14: pakai <Switch> terpisah per domain — wouter ngga flatten fragment children,
  // jadi <Route> harus jadi direct child <Switch>, ngga dibungkus <>.
  if (portalOnly) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Switch>
          {/* Domain portal.jabnet.id — HANYA portal pelanggan */}
          <Route path="/portal" component={PortalLoginPage} />
          <Route path="/portal/login" component={PortalLoginPage} />
          <Route path="/portal/verify" component={PortalVerifyOtpPage} />
          <Route path="/portal/dashboard" component={PortalDashboardPage} />
          <Route path="/portal/track/:id" component={PortalTrackerPage} />
          {/* v4.2.17: Public CSAT — accessible tanpa login via WhatsApp link */}
          <Route path="/csat/:token" component={PortalCsatPage} />
          <Route path="/portal/csat/:token" component={PortalCsatPage} />
          <Route path="/coverage-check" component={CoverageCheckPage} />
          {/* Default: redirect semua path ke /portal/login */}
          <Route>{() => <Redirect to="/portal/login" />}</Route>
        </Switch>
      </Suspense>
    );
  }
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route path="/coverage-check" component={CoverageCheckPage} />
        {/* Portal Pelanggan (public) — v4.1.3 — tetap accessible di domain lama */}
        <Route path="/portal" component={PortalLoginPage} />
        <Route path="/portal/login" component={PortalLoginPage} />
        <Route path="/portal/verify" component={PortalVerifyOtpPage} />
        <Route path="/portal/dashboard" component={PortalDashboardPage} />
        <Route path="/portal/track/:id" component={PortalTrackerPage} />
        <Route path="/csat/:token" component={PortalCsatPage} />
        <Route path="/portal/csat/:token" component={PortalCsatPage} />
        <Route path="/portal/:rest*">{() => <Redirect to="/portal/login" />}</Route>
        {/* Phase G — per-mitra portal URL scoping. Slug is stashed by CustomerPortalAuthContext
            and passed via X-Mitra-Slug header on every /api/portal/* call. */}
        <Route path="/t/:slug/portal" component={PortalLoginPage} />
        <Route path="/t/:slug/portal/login" component={PortalLoginPage} />
        <Route path="/t/:slug/portal/verify" component={PortalVerifyOtpPage} />
        <Route path="/t/:slug/portal/dashboard" component={PortalDashboardPage} />
        <Route path="/t/:slug/portal/track/:id" component={PortalTrackerPage} />
        <Route path="/t/:slug/portal/csat/:token" component={PortalCsatPage} />
        <Route path="/t/:slug/portal/:rest*">{(params: any) => <Redirect to={`/t/${params.slug}/portal/login`} />}</Route>
        <Route component={ProtectedRouter} />
      </Switch>
    </Suspense>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CustomerPortalAuthProvider>
          <SidebarProvider>
            <GoogleMapsProvider>
              <Router />
              <Toaster position="top-right" richColors duration={2000} />
            </GoogleMapsProvider>
          </SidebarProvider>
        </CustomerPortalAuthProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
