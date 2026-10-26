import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("JaText caught an unexpected UI error:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="notification-welcome">
          <section className="notification-welcome-card">
            <img className="logo-icon notification-welcome-logo" src="/jatext-logo-icon.png" alt="" />
            <h1>Something went wrong</h1>
            <p className="muted small">{this.state.error.message || "Unexpected application error"}</p>
            <button
              type="button"
              className="primary-btn big"
              onClick={() => {
                this.setState({ error: null });
                window.location.reload();
              }}
            >
              Reload JaText
            </button>
            <button
              type="button"
              className="ghost-btn notification-skip"
              onClick={() => {
                try {
                  localStorage.clear();
                } catch {
                  // Ignore storage access errors.
                }
                window.location.reload();
              }}
            >
              Reset session &amp; reload
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
