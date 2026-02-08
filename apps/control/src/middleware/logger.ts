import { randomUUID } from "node:crypto";
import { Elysia } from "elysia";
import { createControlLogger } from "../logger";

const log = createControlLogger("request-logger");

/**
 * Request logging middleware
 * Adds request ID and logs request/response details
 */
export const requestLogger = new Elysia({ name: "request-logger" })
  .derive(() => {
    return {
      requestId: randomUUID(),
      requestStart: Date.now(),
    };
  })
  .onBeforeHandle(({ request, requestId }) => {
    log.info(
      {
        requestId,
        method: request.method,
        path: new URL(request.url).pathname,
      },
      "Request started"
    );
  })
  .onAfterResponse(({ request, requestId, requestStart, set }) => {
    const duration = Date.now() - requestStart;
    log.info(
      {
        requestId,
        method: request.method,
        path: new URL(request.url).pathname,
        status: set.status ?? 200,
        duration,
      },
      "Request completed"
    );
  })
  .onError(({ request, requestId, requestStart, code, error, set }) => {
    const duration = requestStart ? Date.now() - requestStart : 0;
    log.error(
      {
        requestId,
        method: request.method,
        path: new URL(request.url).pathname,
        status: set.status ?? 500,
        duration,
        code,
        err: error,
      },
      "Request failed"
    );
  });
