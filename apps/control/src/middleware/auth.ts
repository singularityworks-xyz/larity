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

// Require OWNER or ADMIN role for sensitive operations
export const requireOwnerOrAdmin = new Elysia({ name: 'require-owner-admin' })
  .use(requireAuth)
  .onBeforeHandle({ as: 'scoped' }, ({ user, set }) => {
    const role = user?.role as string | undefined;
    if (role !== 'OWNER' && role !== 'ADMIN') {
      set.status = 403;
      return {
        success: false,
        error: 'Forbidden',
        message: 'This action requires OWNER or ADMIN role',
      };
    }
  });

// Helper to check if user has owner/admin role (for inline checks)
export function isOwnerOrAdmin(user: { role?: string } | null): boolean {
  return user?.role === 'OWNER' || user?.role === 'ADMIN';
}

// Temporary stubs for testing without auth
// export const authMiddleware = new Elysia({ name: 'auth-middleware' }).derive(
//   { as: 'global' },
//   async () => {
//     return {
//       session: null,
//       user: null,
//     };
//   }
// );

// export const requireAuth = new Elysia({ name: 'require-auth' }).use(authMiddleware);
