import { randomUUID } from 'crypto';
import { Elysia } from 'elysia';

/**
 * Request logging middleware
 * Adds request ID and logs request/response details
 */
export const requestLogger = new Elysia({ name: 'request-logger' })
  .derive(() => {
    return {
      requestId: randomUUID(),
      requestStart: Date.now(),
    };
  })
  .onBeforeHandle(({ request, requestId }) => {
    console.log(`[${requestId}] --> ${request.method} ${new URL(request.url).pathname}`);
  })
  .onAfterResponse(({ request, requestId, requestStart, set }) => {
    const duration = Date.now() - requestStart;
    console.log(
      `[${requestId}] <-- ${request.method} ${new URL(request.url).pathname} ${set.status ?? 200} ${duration}ms`
    );
  })
  .onError(({ request, requestId, requestStart, code, error, set }) => {
    const duration = requestStart ? Date.now() - requestStart : 0;
    console.error(
      `[${requestId}] <-- ${request.method} ${new URL(request.url).pathname} ${set.status ?? 500} ${duration}ms`,
      `[${code}]`,
      (error as Error).message
    );
  });
