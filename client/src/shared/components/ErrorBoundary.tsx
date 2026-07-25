import React from 'react';
import { AlertTriangle, RotateCcw, LogIn } from 'lucide-react';

type Props = { children: React.ReactNode };
type State = { hasError: boolean; error: Error | null };

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8 shadow-elevation-md">
            <div className="flex flex-col items-center text-center gap-4">
              <span className="flex size-12 items-center justify-center rounded-xl bg-rose text-rose-ink">
                <AlertTriangle className="size-5" />
              </span>
              <div className="flex flex-col gap-1.5">
                <h1 className="text-xl font-semibold tracking-tight text-foreground">
                  Something went wrong
                </h1>
                <p className="text-sm text-foreground-muted leading-relaxed">
                  An unexpected error occurred. Reload the page, or head back to the login
                  screen.
                </p>
              </div>
              {this.state.error && (
                <pre className="w-full rounded-md border border-rose/40 bg-rose/20 px-3 py-2 text-left text-[11px] font-mono text-rose-ink whitespace-pre-wrap break-words max-h-32 overflow-auto">
                  {this.state.error.message || String(this.state.error)}
                </pre>
              )}
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md border border-border bg-surface text-sm font-medium text-foreground hover:bg-surface-muted transition-colors"
                >
                  <RotateCcw className="size-3.5" /> Reload
                </button>
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = '/signin';
                  }}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-accent text-accent-foreground text-sm font-medium hover:bg-accent-hover transition-colors"
                >
                  <LogIn className="size-3.5" /> Go to sign in
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
