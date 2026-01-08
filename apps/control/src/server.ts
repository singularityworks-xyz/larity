import { cors } from '@elysiajs/cors';
import { Elysia } from 'elysia';
import { env } from './env';
import { requireAuth } from './middleware/auth';
import { requestLogger } from './middleware/logger';
import {
  authRoutes,
  clientsRoutes,
  decisionsRoutes,
  documentsRoutes,
  importantPointsRoutes,
  meetingsRoutes,
  openQuestionsRoutes,
  orgsRoutes,
  policyGuardrailsRoutes,
  remindersRoutes,
  tasksRoutes,
  usersRoutes,
} from './routes';

export const app = new Elysia()
  // Request logging/tracing
  .use(requestLogger)
  // CORS
  .use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
    })
  )
  // Global error handler
  .onError(({ code, error, set }) => {
    console.error(`[${code}]`, (error as Error).message, (error as Error).stack);

    if (code === 'VALIDATION') {
      set.status = 400;
      return {
        success: false,
        error: 'Validation Error',
        message: error.message,
      };
    }

    if (code === 'NOT_FOUND') {
      set.status = 404;
      return {
        success: false,
        error: 'Not Found',
        message: 'Resource not found',
      };
    }

    set.status = 500;
    return {
      success: false,
      error: 'Internal Server Error',
      message: (error as Error).message,
    };
  })
  // Health check
  .get('/health', () => ({ status: 'ok', timestamp: new Date().toISOString() }))
  // Auth routes
  .use(authRoutes)
  // Protected API routes
  .group('/api', (app) =>
    app
      .use(requireAuth)
      // Core identity
      .use(orgsRoutes)
      .use(clientsRoutes)
      .use(usersRoutes)
      // Meeting domain
      .use(meetingsRoutes)
      // Decisions & tasks
      .use(tasksRoutes)
      .use(decisionsRoutes)
      .use(openQuestionsRoutes)
      .use(importantPointsRoutes)
      // Policy & compliance
      .use(policyGuardrailsRoutes)
      // Documents & reminders
      .use(documentsRoutes)
      .use(remindersRoutes)
  );

export type App = typeof app;
