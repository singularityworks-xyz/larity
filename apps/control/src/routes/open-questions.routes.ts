import { Elysia } from 'elysia';
import { z } from 'zod';
import { OpenQuestionService } from '../services';
import {
  createOpenQuestionSchema,
  openQuestionIdSchema,
  openQuestionQuerySchema,
  updateOpenQuestionSchema,
} from '../validators';

export const openQuestionsRoutes = new Elysia({ prefix: '/open-questions' })
  // List all open questions
  .get(
    '/',
    async ({ query }) => {
      const questions = await OpenQuestionService.findAll(query);
      return { success: true, data: questions };
    },
    { query: openQuestionQuerySchema }
  )
  // Get open question by id
  .get(
    '/:id',
    async ({ params, set }) => {
      const question = await OpenQuestionService.findById(params.id);
      if (!question) {
        set.status = 404;
        return { success: false, error: 'Open question not found' };
      }
      return { success: true, data: question };
    },
    { params: openQuestionIdSchema }
  )
  // Create open question
  .post(
    '/',
    async ({ body, set }) => {
      try {
        const question = await OpenQuestionService.create(body);
        return { success: true, data: question };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === 'P2003') {
          set.status = 400;
          return { success: false, error: 'Invalid reference (client, meeting, or assignee)' };
        }
        throw e;
      }
    },
    { body: createOpenQuestionSchema }
  )
  // Update open question
  .patch(
    '/:id',
    async ({ params, body, set }) => {
      try {
        const question = await OpenQuestionService.update(params.id, body);
        return { success: true, data: question };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === 'P2025') {
          set.status = 404;
          return { success: false, error: 'Open question not found' };
        }
        throw e;
      }
    },
    { params: openQuestionIdSchema, body: updateOpenQuestionSchema }
  )
  // Delete open question
  .delete(
    '/:id',
    async ({ params, set }) => {
      try {
        await OpenQuestionService.delete(params.id);
        return { success: true, message: 'Open question deleted' };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === 'P2025') {
          set.status = 404;
          return { success: false, error: 'Open question not found' };
        }
        throw e;
      }
    },
    { params: openQuestionIdSchema }
  )
  // Resolve open question
  .post(
    '/:id/resolve',
    async ({ params, body, set }) => {
      try {
        const question = await OpenQuestionService.resolve(params.id, body?.decisionId);
        return { success: true, data: question };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === 'P2025') {
          set.status = 404;
          return { success: false, error: 'Open question not found' };
        }
        throw e;
      }
    },
    {
      params: openQuestionIdSchema,
      body: z.object({ decisionId: z.string().uuid().optional() }).optional(),
    }
  )
  // Defer open question
  .post(
    '/:id/defer',
    async ({ params, set }) => {
      try {
        const question = await OpenQuestionService.defer(params.id);
        return { success: true, data: question };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === 'P2025') {
          set.status = 404;
          return { success: false, error: 'Open question not found' };
        }
        throw e;
      }
    },
    { params: openQuestionIdSchema }
  )
  // Reopen question
  .post(
    '/:id/reopen',
    async ({ params, set }) => {
      try {
        const question = await OpenQuestionService.reopen(params.id);
        return { success: true, data: question };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === 'P2025') {
          set.status = 404;
          return { success: false, error: 'Open question not found' };
        }
        throw e;
      }
    },
    { params: openQuestionIdSchema }
  );
