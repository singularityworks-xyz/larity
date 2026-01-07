import { Elysia } from 'elysia';
import { auth, type Session } from '../lib/auth';

export const authMiddleware = new Elysia({ name: 'auth-middleware' }).derive(
  { as: 'global' },
  async ({ request }) => {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    return {
      session: session as Session | null,
      user: session?.user ?? null,
    };
  }
);

export const requireAuth = new Elysia({ name: 'require-auth' })
  .use(authMiddleware)
  .onBeforeHandle({ as: 'scoped' }, ({ session, set }) => {
    if (!session) {
      set.status = 401;
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required',
      };
    }
  });
