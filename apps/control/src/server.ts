import { cors } from '@elysiajs/cors';
import { Elysia } from 'elysia';
import { env } from './env';
import { requireAuth } from './middleware/auth';
import {
  authRoutes,
  decisionsRoutes,
  meetingsRoutes,
  orgsRoutes,
  tasksRoutes,
  usersRoutes,
} from './routes';

export const app = new Elysia()
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
      .use(orgsRoutes)
      .use(usersRoutes)
      .use(meetingsRoutes)
      .use(tasksRoutes)
      .use(decisionsRoutes)
  );

export type App = typeof app;
