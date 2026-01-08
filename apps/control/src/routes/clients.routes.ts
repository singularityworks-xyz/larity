import { Elysia } from 'elysia';
import { ClientMemberService, ClientService } from '../services';
import {
  clientIdSchema,
  clientMemberIdSchema,
  clientQuerySchema,
  createClientMemberSchema,
  createClientSchema,
  updateClientMemberSchema,
  updateClientSchema,
} from '../validators';

export const clientsRoutes = new Elysia({ prefix: '/clients' })
  // List all clients
  .get(
    '/',
    async ({ query }) => {
      const clients = await ClientService.findAll(query);
      return { success: true, data: clients };
    },
    { query: clientQuerySchema }
  )
  // Get client by id
  .get(
    '/:id',
    async ({ params, set }) => {
      const client = await ClientService.findById(params.id);
      if (!client) {
        set.status = 404;
        return { success: false, error: 'Client not found' };
      }
      return { success: true, data: client };
    },
    { params: clientIdSchema }
  )
  // Create client
  .post(
    '/',
    async ({ body, set }) => {
      try {
        const client = await ClientService.create(body);
        return { success: true, data: client };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === 'P2002') {
          set.status = 409;
          return { success: false, error: 'Client with this slug already exists in the org' };
        }
        if (err.code === 'P2003') {
          set.status = 400;
          return { success: false, error: 'Invalid org reference' };
        }
        throw e;
      }
    },
    { body: createClientSchema }
  )
  // Update client
  .patch(
    '/:id',
    async ({ params, body, set }) => {
      try {
        const client = await ClientService.update(params.id, body);
        return { success: true, data: client };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === 'P2025') {
          set.status = 404;
          return { success: false, error: 'Client not found' };
        }
        if (err.code === 'P2002') {
          set.status = 409;
          return { success: false, error: 'Client with this slug already exists in the org' };
        }
        throw e;
      }
    },
    { params: clientIdSchema, body: updateClientSchema }
  )
  // Delete client
  .delete(
    '/:id',
    async ({ params, set }) => {
      try {
        await ClientService.delete(params.id);
        return { success: true, message: 'Client deleted' };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === 'P2025') {
          set.status = 404;
          return { success: false, error: 'Client not found' };
        }
        throw e;
      }
    },
    { params: clientIdSchema }
  )
  // --- Client Members ---
  // List members of a client
  .get(
    '/:id/members',
    async ({ params }) => {
      const members = await ClientMemberService.findByClient(params.id);
      return { success: true, data: members };
    },
    { params: clientIdSchema }
  )
  // Add member to client
  .post(
    '/:id/members',
    async ({ params, body, set }) => {
      try {
        const member = await ClientMemberService.assign({
          clientId: params.id,
          userId: body.userId,
          role: body.role,
        });
        return { success: true, data: member };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === 'P2002') {
          set.status = 409;
          return { success: false, error: 'User is already a member of this client' };
        }
        if (err.code === 'P2003') {
          set.status = 400;
          return { success: false, error: 'Invalid client or user reference' };
        }
        throw e;
      }
    },
    {
      params: clientIdSchema,
      body: createClientMemberSchema.omit({ clientId: true }),
    }
  )
  // Update member role
  .patch(
    '/members/:id',
    async ({ params, body, set }) => {
      try {
        const member = await ClientMemberService.updateRole(params.id, body);
        return { success: true, data: member };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === 'P2025') {
          set.status = 404;
          return { success: false, error: 'Client member not found' };
        }
        throw e;
      }
    },
    { params: clientMemberIdSchema, body: updateClientMemberSchema }
  )
  // Remove member from client
  .delete(
    '/members/:id',
    async ({ params, set }) => {
      try {
        await ClientMemberService.deleteById(params.id);
        return { success: true, message: 'Member removed from client' };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === 'P2025') {
          set.status = 404;
          return { success: false, error: 'Client member not found' };
        }
        throw e;
      }
    },
    { params: clientMemberIdSchema }
  );
