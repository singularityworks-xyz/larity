import { Elysia } from 'elysia';
import { OrgService } from '../services';
import { createOrgSchema, orgIdSchema, orgQuerySchema, updateOrgSchema } from '../validators';

export const orgsRoutes = new Elysia({ prefix: '/orgs' })
  // List all orgs
  .get(
    '/',
    async ({ query }) => {
      const orgs = await OrgService.findAll(query);
      return { success: true, data: orgs };
    },
    { query: orgQuerySchema }
  )
  // Get org by id
  .get(
    '/:id',
    async ({ params, set }) => {
      const org = await OrgService.findById(params.id);
      if (!org) {
        set.status = 404;
        return { success: false, error: 'Org not found' };
      }
      return { success: true, data: org };
    },
    { params: orgIdSchema }
  )
  // Create org
  .post(
    '/',
    async ({ body, set }) => {
      try {
        const org = await OrgService.create(body);
        return { success: true, data: org };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === 'P2002') {
          set.status = 409;
          return { success: false, error: 'Organization with this slug already exists' };
        }
        throw e;
      }
    },
    { body: createOrgSchema }
  )
  // Update org
  .patch(
    '/:id',
    async ({ params, body, set }) => {
      try {
        const org = await OrgService.update(params.id, body);
        return { success: true, data: org };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === 'P2025') {
          set.status = 404;
          return { success: false, error: 'Org not found' };
        }
        if (err.code === 'P2002') {
          set.status = 409;
          return { success: false, error: 'Organization with this slug already exists' };
        }
        throw e;
      }
    },
    { params: orgIdSchema, body: updateOrgSchema }
  )
  // Delete org
  .delete(
    '/:id',
    async ({ params, set }) => {
      try {
        await OrgService.delete(params.id);
        return { success: true, message: 'Org deleted' };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === 'P2025') {
          set.status = 404;
          return { success: false, error: 'Org not found' };
        }
        throw e;
      }
    },
    { params: orgIdSchema }
  );
