import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback UI. If omitted, renders the default error screen. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Called when an error is caught. Useful for logging to Sentry/analytics. */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * ErrorBoundary - catches React errors in the subtree and shows a recovery UI.
 * Prevents the entire app from crashing when a single page throws.
 *
 * @example
 * <ErrorBoundary>
 *   <App />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    const { children, fallback } = this.props;

    if (!error) return children;

    if (fallback) return fallback(error, this.reset);

    return (
      <div className="flex items-center justify-center min-h-[70vh] p-6">
        <div className="text-center max-w-lg">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-destructive/10 ring-1 ring-destructive/20 mb-5">
            <AlertTriangle className="h-10 w-10 text-destructive" strokeWidth={1.5} />
          </div>
          <h1 className="text-xl md:text-2xl font-bold mb-2 text-foreground">
            Ada yang tidak beres
          </h1>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            Halaman mengalami error saat dimuat. Coba refresh, atau kembali ke dashboard.
          </p>
          {import.meta.env.DEV && (
            <details className="text-left text-xs bg-muted rounded-lg p-3 mb-4 max-h-40 overflow-auto">
              <summary className="cursor-pointer font-medium text-muted-foreground mb-2">
                Detail error (dev mode)
              </summary>
              <code className="block font-mono text-destructive break-all whitespace-pre-wrap">
                {error.name}: {error.message}
                {error.stack && `\n\n${error.stack}`}
              </code>
            </details>
          )}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
            <button
              onClick={this.reset}
              className="w-full sm:w-auto h-10 px-5 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors shadow-elev-sm flex items-center justify-center gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Coba Lagi
            </button>
            <button
              onClick={() => (window.location.href = "/")}
              className="w-full sm:w-auto h-10 px-5 rounded-md border border-input bg-background font-medium text-sm hover:bg-accent transition-colors flex items-center justify-center gap-2"
            >
              <Home className="h-4 w-4" />
              Ke Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
}
