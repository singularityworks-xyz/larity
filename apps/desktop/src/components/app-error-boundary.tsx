import React, { type ReactNode } from "react";
import { createLogger } from "../lib/logger";

const logger = createLogger("app-error-boundary");

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  hasError: boolean;
}

export class AppErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("App Error Boundary:", error, errorInfo);
    logger.error("App Error Boundary caught an error", {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-bg p-6 text-fg">
          <h1 className="mb-2 font-semibold text-xl">Application Error</h1>
          <p className="text-fg-muted text-sm">
            {this.state.error?.message ?? "An unexpected error occurred."}
          </p>
          <button
            className="mt-4 rounded-md bg-fg px-4 py-2 text-bg text-sm hover:opacity-90"
            onClick={() => window.location.reload()}
            type="button"
          >
            Reload Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
