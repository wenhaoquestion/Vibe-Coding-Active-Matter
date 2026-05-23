import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logDiagnostic } from '../state/diagnostics';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logDiagnostic('error', 'React render crash', {
      error,
      componentStack: info.componentStack
    });
  }

  render() {
    if (this.state.error) {
      return (
        <main className="app-shell">
          <section className="panel crash-panel">
            <div className="panel-title">Simulation UI crashed</div>
            <p>{this.state.error.message}</p>
            <button onClick={() => window.location.reload()}>Reload app</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
