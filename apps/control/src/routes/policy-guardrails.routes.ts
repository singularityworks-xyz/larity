import { Elysia } from 'elysia';
import { z } from 'zod';
import { PolicyGuardrailService } from '../services';
import {
  createPolicyGuardrailSchema,
  policyGuardrailIdSchema,
  policyGuardrailQuerySchema,
  updatePolicyGuardrailSchema,
} from '../validators';

export const policyGuardrailsRoutes = new Elysia({ prefix: '/policy-guardrails' })
  // List all policy guardrails
  .get(
    '/',
    async ({ query }) => {
      const guardrails = await PolicyGuardrailService.findAll(query);
      return { success: true, data: guardrails };
    },
    { query: policyGuardrailQuerySchema }
  )
  // Get active guardrails for a client (includes org-level)
  .get(
    '/active',
    async ({ query, set }) => {
      if (!query?.orgId || !query?.clientId) {
        set.status = 400;
        return { success: false, error: 'Both orgId and clientId are required' };
      }
      const guardrails = await PolicyGuardrailService.findActiveForClient(
        query.orgId,
        query.clientId
      );
      return { success: true, data: guardrails };
    },
    {
      query: z.object({
        orgId: z.string().uuid(),
        clientId: z.string().uuid(),
      }),
    }
  )
  // Get policy guardrail by id
  .get(
    '/:id',
    async ({ params, set }) => {
      const guardrail = await PolicyGuardrailService.findById(params.id);
      if (!guardrail) {
        set.status = 404;
        return { success: false, error: 'Policy guardrail not found' };
      }
      return { success: true, data: guardrail };
    },
    { params: policyGuardrailIdSchema }
  )
  // Create policy guardrail
  .post(
    '/',
    async ({ body, set }) => {
      try {
        const guardrail = await PolicyGuardrailService.create(body);
        return { success: true, data: guardrail };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === 'P2003') {
          set.status = 400;
          return { success: false, error: 'Invalid reference (org, client, or creator)' };
        }
        throw e;
      }
    },
    { body: createPolicyGuardrailSchema }
  )
  // Update policy guardrail
  .patch(
    '/:id',
    async ({ params, body, set }) => {
      try {
        const guardrail = await PolicyGuardrailService.update(params.id, body);
        return { success: true, data: guardrail };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === 'P2025') {
          set.status = 404;
          return { success: false, error: 'Policy guardrail not found' };
        }
        throw e;
      }
    },
    { params: policyGuardrailIdSchema, body: updatePolicyGuardrailSchema }
  )
  // Delete policy guardrail
  .delete(
    '/:id',
    async ({ params, set }) => {
      try {
        await PolicyGuardrailService.delete(params.id);
        return { success: true, message: 'Policy guardrail deleted' };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === 'P2025') {
          set.status = 404;
          return { success: false, error: 'Policy guardrail not found' };
        }
        throw e;
      }
    },
    { params: policyGuardrailIdSchema }
  )
  // Activate guardrail
  .post(
    '/:id/activate',
    async ({ params, set }) => {
      try {
        const guardrail = await PolicyGuardrailService.activate(params.id);
        return { success: true, data: guardrail };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === 'P2025') {
          set.status = 404;
          return { success: false, error: 'Policy guardrail not found' };
        }
        throw e;
      }
    },
    { params: policyGuardrailIdSchema }
  )
  // Deactivate guardrail
  .post(
    '/:id/deactivate',
    async ({ params, set }) => {
      try {
        const guardrail = await PolicyGuardrailService.deactivate(params.id);
        return { success: true, data: guardrail };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === 'P2025') {
          set.status = 404;
          return { success: false, error: 'Policy guardrail not found' };
        }
        throw e;
      }
    },
    { params: policyGuardrailIdSchema }
  );
