import { type ErrorResponse, useRouteError } from "react-router-dom";
import { CONTROL_URL } from "../lib/env";
import { createLogger } from "../lib/logger";

const logger = createLogger("route-error");

const NETWORK_ERROR_INDICATORS = [
  "Load failed",
  "Failed to fetch",
  "NetworkError",
  "Network request failed",
  "Connection refused",
];

function isNetworkError(message: string): boolean {
  return NETWORK_ERROR_INDICATORS.some((indicator) =>
    message.includes(indicator)
  );
}

function isErrorResponse(error: unknown): error is ErrorResponse {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    "statusText" in error
  );
}

export function RouteErrorBoundary() {
  const error = useRouteError();

  let message = "An unexpected error occurred";
  let status: number | undefined;
  let isNetwork = false;

  if (isErrorResponse(error)) {
    status = error.status;
    message = error.statusText || message;
  } else if (error instanceof Error) {
    message = error.message;
    isNetwork = isNetworkError(message);
  } else if (typeof error === "string") {
    message = error;
    isNetwork = isNetworkError(message);
  }

  logger.error("Route error caught", {
    status,
    message,
    stack: error instanceof Error ? error.stack : undefined,
  });
  console.error("Route error (full):", error);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg p-6 text-fg">
      <h1 className="mb-2 font-semibold text-xl">Something went wrong</h1>
      <p className="max-w-md text-center text-fg-muted text-sm">{message}</p>
      {status !== undefined && (
        <p className="mt-1 text-fg-muted text-xs">Status: {status}</p>
      )}
      {isNetwork && (
        <div className="mt-4 max-w-sm rounded-lg border border-border-subtle bg-bg-subtle p-3">
          <p className="text-fg-muted text-xs">
            The application cannot reach the backend server. Please ensure the
            control server is running on{" "}
            <code className="rounded bg-bg px-1 py-px text-fg">
              {CONTROL_URL}
            </code>
            .
          </p>
        </div>
      )}
      <button
        className="mt-4 rounded-md bg-fg px-4 py-2 text-bg text-sm hover:opacity-90"
        onClick={() => window.location.reload()}
        type="button"
      >
        Reload
      </button>
    </div>
  );
}
