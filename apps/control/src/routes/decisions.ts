import { Elysia, t } from 'elysia';
import { DecisionService } from '../services';
import {
  createDecisionSchema,
  decisionIdSchema,
  decisionQuerySchema,
  decisionRefSchema,
} from '../validators';

export const decisionsRoutes = new Elysia({ prefix: '/decisions' })
  // List all decisions (latest versions only, with optional filters)
  .get(
    '/',
    async ({ query }) => {
      const decisions = await DecisionService.findAll(query);
      return { success: true, data: decisions };
    },
    { query: decisionQuerySchema }
  )
  // Get decision by id (specific record)
  .get(
    '/:id',
    async ({ params, set }) => {
      const decision = await DecisionService.findById(params.id);
      if (!decision) {
        set.status = 404;
        return { success: false, error: 'Decision not found' };
      }
      return { success: true, data: decision };
    },
    { params: decisionIdSchema }
  )
  // Get latest version of a decision by ref
  .get(
    '/ref/:decisionRef',
    async ({ params, set }) => {
      const decision = await DecisionService.findLatestByRef(params.decisionRef);
      if (!decision) {
        set.status = 404;
        return { success: false, error: 'Decision not found' };
      }
      return { success: true, data: decision };
    },
    { params: decisionRefSchema }
  )
  // Get all versions of a decision (full history)
  .get(
    '/ref/:decisionRef/history',
    async ({ params, set }) => {
      const versions = await DecisionService.findAllVersions(params.decisionRef);
      if (versions.length === 0) {
        set.status = 404;
        return { success: false, error: 'Decision not found' };
      }
      return { success: true, data: versions };
    },
    { params: decisionRefSchema }
  )
  // Get specific version of a decision
  .get(
    '/ref/:decisionRef/version/:version',
    async ({ params, set }) => {
      const decision = await DecisionService.findByRefAndVersion(
        params.decisionRef,
        params.version
      );
      if (!decision) {
        set.status = 404;
        return { success: false, error: 'Decision version not found' };
      }
      return { success: true, data: decision };
    },
    {
      params: t.Object({
        decisionRef: t.String({ format: 'uuid' }),
        version: t.Number({ minimum: 1 }),
      }),
    }
  )
  // Create new decision (version 1)
  .post(
    '/',
    async ({ body, set }) => {
      try {
        const decision = await DecisionService.create(body);
        return { success: true, data: decision };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === 'P2003') {
          set.status = 400;
          return { success: false, error: 'Invalid reference (org, meeting, or author)' };
        }
        throw e;
      }
    },
    { body: createDecisionSchema }
  )
  // Create new revision of an existing decision
  .post(
    '/ref/:decisionRef/revise',
    async ({ params, body, set }) => {
      try {
        const decision = await DecisionService.createRevision(
          params.decisionRef,
          body,
          body.authorId
        );
        return { success: true, data: decision };
      } catch (e: unknown) {
        const err = e as Error;
        if (err.message === 'Decision not found') {
          set.status = 404;
          return { success: false, error: 'Decision not found' };
        }
        throw e;
      }
    },
    {
      params: decisionRefSchema,
      body: t.Object({
        title: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
        content: t.Optional(t.String({ minLength: 1 })),
        rationale: t.Optional(t.String()),
        evidence: t.Optional(t.String()),
        authorId: t.Optional(t.String({ format: 'uuid' })),
      }),
    }
  )
  // Delete all versions of a decision
  .delete(
    '/ref/:decisionRef',
    async ({ params, set }) => {
      const result = await DecisionService.deleteByRef(params.decisionRef);
      if (result.count === 0) {
        set.status = 404;
        return { success: false, error: 'Decision not found' };
      }
      return { success: true, message: `Deleted ${result.count} version(s)` };
    },
    { params: decisionRefSchema }
  )
  // Delete specific decision record by id
  .delete(
    '/:id',
    async ({ params, set }) => {
      try {
        await DecisionService.deleteById(params.id);
        return { success: true, message: 'Decision deleted' };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === 'P2025') {
          set.status = 404;
          return { success: false, error: 'Decision not found' };
        }
        throw e;
      }
    },
    { params: decisionIdSchema }
  );
