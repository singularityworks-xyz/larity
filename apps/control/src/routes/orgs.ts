import { Elysia } from 'elysia';
import { OrgService } from '../services';
import { createOrgSchema, orgIdSchema, updateOrgSchema } from '../validators';

export const orgsRoutes = new Elysia({ prefix: '/orgs' })
  // List all orgs
  .get('/', async () => {
    const orgs = await OrgService.findAll();
    return { success: true, data: orgs };
  })
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
    async ({ body }) => {
      const org = await OrgService.create(body);
      return { success: true, data: org };
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
      } catch {
        set.status = 404;
        return { success: false, error: 'Org not found' };
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
      } catch {
        set.status = 404;
        return { success: false, error: 'Org not found' };
      }
    },
    { params: orgIdSchema }
  );
