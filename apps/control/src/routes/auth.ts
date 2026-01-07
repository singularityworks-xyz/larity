import { Elysia } from 'elysia';
import { auth } from '../lib/auth';

export const authRoutes = new Elysia({ prefix: '/auth' }).all('/*', async ({ request }) => {
  return auth.handler(request);
});
