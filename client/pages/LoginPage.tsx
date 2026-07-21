import { useState } from "react";
import { Redirect, Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import {
  Radio, AlertCircle, Compass, Shield, Zap, Globe,
  ArrowRight, CheckCircle2, Lock, Eye, EyeOff, Activity, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const { login, user } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  if (user) return <Redirect to="/" />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await login(username, password);
    } catch (err: any) {
      setError(err.message || "Login gagal. Periksa username dan password Anda.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background">
      {/* --- LEFT / TOP: Hero / Branding ------------------------------- */}
      <aside className="relative overflow-hidden text-white lg:w-[55%] lg:min-h-screen bg-mesh">
        {/* Grid overlay */}
        <div className="absolute inset-0 bg-grid-pattern opacity-30 lg:opacity-40" />
        {/* Gradient veil */}
        <div className="absolute inset-0 bg-gradient-to-br from-sidebar/95 via-sidebar/80 to-transparent" />

        <div className="relative z-10 flex flex-col justify-between px-6 pt-8 pb-6 lg:p-12 xl:p-16 min-h-[340px] lg:min-h-screen">
          {/* Top - Brand */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-elev-lg ring-1 ring-white/20">
              <Radio className="h-5 w-5 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="font-black text-lg tracking-tight-display leading-none">JABNET</h1>
              <p className="text-[10px] text-white/50 uppercase tracking-[0.15em] font-semibold mt-0.5">
                Fiber Operations
              </p>
            </div>
          </div>

          {/* Middle - Hero message */}
          <div className="py-8 lg:py-0 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm mb-4 lg:mb-6">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
              </span>
              <span className="text-xs font-medium text-white/90">
                Semua sistem operasional
              </span>
            </div>

            <h2 className="text-3xl lg:text-4xl xl:text-5xl font-black leading-[1.05] tracking-tight-display">
              Kendalikan<br />
              <span className="text-gradient-brand">Infrastruktur FTTH</span>
              <span className="hidden lg:inline"><br />dalam satu platform</span>
              <span className="lg:hidden"> dalam satu platform</span>
            </h2>
            <p className="text-white/60 mt-3 text-sm lg:text-base xl:text-lg leading-relaxed max-w-md">
              Workspace operasional terpadu untuk ISP -
              dari perencanaan jaringan, CRM marketing, hingga
              monitoring pelanggan real-time.
            </p>

            {/* Feature pills - desktop only */}
            <div className="hidden lg:grid grid-cols-2 gap-3 mt-8 max-w-md">
              {[
                { icon: Globe, label: "Network Asset Mgmt" },
                { icon: Activity, label: "Live Monitoring" },
                { icon: Shield, label: "Enterprise Security" },
                { icon: Zap, label: "API-first Integration" },
              ].map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 backdrop-blur-sm"
                >
                  <Icon className="h-3.5 w-3.5 text-sky-300 shrink-0" strokeWidth={2.25} />
                  <span className="text-xs font-medium text-white/80 truncate">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom - Trust & company (desktop only) */}
          <div className="hidden lg:block">
            <div className="grid grid-cols-3 gap-6 pb-6 border-b border-white/10">
              <div>
                <div className="text-2xl xl:text-3xl font-black tabular-nums tracking-tight text-white">
                  45<span className="text-sky-300">+</span>
                </div>
                <div className="text-xs text-white/50 uppercase tracking-wider mt-1">
                  Halaman operasional
                </div>
              </div>
              <div>
                <div className="text-2xl xl:text-3xl font-black tabular-nums tracking-tight text-white">
                  99.9<span className="text-sky-300">%</span>
                </div>
                <div className="text-xs text-white/50 uppercase tracking-wider mt-1">
                  Platform uptime
                </div>
              </div>
              <div>
                <div className="text-2xl xl:text-3xl font-black tabular-nums tracking-tight text-white">
                  24<span className="text-sky-300">/7</span>
                </div>
                <div className="text-xs text-white/50 uppercase tracking-wider mt-1">
                  Billing sync
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 pt-5 text-xs text-white/40">
              <span>PT Arkanova Cipta Inovasi · Garut</span>
              <span className="flex items-center gap-1.5">
                <Lock className="h-3 w-3" /> Secure SSL 256-bit
              </span>
            </div>
          </div>
        </div>

        {/* Mobile bottom gradient fade to form */}
        <div className="lg:hidden absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-b from-transparent to-background pointer-events-none" />
      </aside>

      {/* --- RIGHT / BOTTOM: Login Form ------------------------------- */}
      <main className="relative flex-1 flex items-start lg:items-center justify-center p-6 pt-4 lg:p-12 -mt-10 lg:mt-0">
        {/* Subtle dot pattern on right pane (desktop) */}
        <div className="hidden lg:block absolute inset-0 bg-dot-pattern opacity-30 pointer-events-none" />

        <div className="w-full max-w-sm relative z-10">
          {/* Mobile: elevated form card */}
          <div className="lg:hidden rounded-2xl bg-card border border-border shadow-elev-lg p-6 mb-4">
            <LoginForm
              username={username}
              password={password}
              showPassword={showPassword}
              error={error}
              isLoading={isLoading}
              setUsername={setUsername}
              setPassword={setPassword}
              setShowPassword={setShowPassword}
              onSubmit={handleSubmit}
            />
          </div>

          {/* Desktop: form without wrapper card */}
          <div className="hidden lg:block">
            <LoginForm
              username={username}
              password={password}
              showPassword={showPassword}
              error={error}
              isLoading={isLoading}
              setUsername={setUsername}
              setPassword={setPassword}
              setShowPassword={setShowPassword}
              onSubmit={handleSubmit}
            />
          </div>

          {/* Divider */}
          <div className="relative my-5 lg:my-7">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-background px-3 text-muted-foreground uppercase tracking-wider font-medium">
                atau
              </span>
            </div>
          </div>

          {/* Coverage check - public route */}
          <Link
            href="/coverage-check"
            className="group flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-accent/30 hover:shadow-elev-md transition-all"
          >
            <div className="w-10 h-10 rounded-lg bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center shrink-0 transition-all group-hover:scale-105">
              <Compass className="h-5 w-5 text-primary" strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                Cek Coverage Jaringan
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Periksa ketersediaan FTTH di lokasi Anda
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
          </Link>

          {/* Footer */}
          <div className="mt-8 lg:mt-10 flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-success pulse-ring-success" />
              <span>Platform operasional · v4.2.1</span>
            </div>
            <p className="text-2xs text-muted-foreground/60 tracking-wider">
              © 2026 PT ARKANOVA CIPTA INOVASI · GARUT
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

// --- Subcomponent: shared form -------------------------------------

interface LoginFormProps {
  username: string;
  password: string;
  showPassword: boolean;
  error: string;
  isLoading: boolean;
  setUsername: (v: string) => void;
  setPassword: (v: string) => void;
  setShowPassword: (v: boolean) => void;
  onSubmit: (e: React.FormEvent) => void;
}

function LoginForm({
  username,
  password,
  showPassword,
  error,
  isLoading,
  setUsername,
  setPassword,
  setShowPassword,
  onSubmit,
}: LoginFormProps) {
  return (
    <>
      <div className="mb-6">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-2xs font-semibold uppercase tracking-wider mb-3">
          <CheckCircle2 className="h-3 w-3" />
          Staff Portal
        </div>
        <h2 className="text-2xl lg:text-3xl font-black text-foreground tracking-tight-display leading-tight">
          Selamat datang kembali
        </h2>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          Masuk untuk mengakses workspace operasional JABNET.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm animate-fade-in mb-4"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Login gagal</p>
            <p className="text-destructive/80 text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label
            className="text-xs font-semibold text-foreground uppercase tracking-wider"
            htmlFor="username"
          >
            Username
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Masukkan username"
            required
            autoComplete="username"
            className="w-full h-11 px-4 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all shadow-elev-sm"
          />
        </div>

        <div className="space-y-1.5">
          <label
            className="text-xs font-semibold text-foreground uppercase tracking-wider"
            htmlFor="password"
          >
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Masukkan password"
              required
              autoComplete="current-password"
              className="w-full h-11 px-4 pr-11 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all shadow-elev-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="flex justify-end">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                window.open(
                  "https://wa.me/6281234567890?text=Halo%20admin%2C%20saya%20lupa%20password",
                  "_blank"
                );
              }}
              className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
            >
              Lupa password?
            </a>
          </div>
        </div>

        <Button
          type="submit"
          disabled={isLoading}
          variant="gradient"
          size="lg"
          className="w-full h-12 text-sm font-bold shadow-elev-md hover:shadow-elev-lg"
          loading={isLoading}
          rightIcon={isLoading ? undefined : <ArrowRight />}
        >
          {isLoading ? "Memverifikasi..." : "Masuk ke Workspace"}
        </Button>
      </form>
    </>
  );
}
