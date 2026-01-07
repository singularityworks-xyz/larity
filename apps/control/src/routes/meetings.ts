import { Elysia } from 'elysia';
import { MeetingService } from '../services';
import {
  createMeetingSchema,
  meetingIdSchema,
  meetingQuerySchema,
  updateMeetingSchema,
} from '../validators';

export const meetingsRoutes = new Elysia({ prefix: '/meetings' })
  // List all meetings (with optional filters)
  .get(
    '/',
    async ({ query }) => {
      const meetings = await MeetingService.findAll(query);
      return { success: true, data: meetings };
    },
    { query: meetingQuerySchema }
  )
  // Get meeting by id (includes tasks and decisions)
  .get(
    '/:id',
    async ({ params, set }) => {
      const meeting = await MeetingService.findById(params.id);
      if (!meeting) {
        set.status = 404;
        return { success: false, error: 'Meeting not found' };
      }
      return { success: true, data: meeting };
    },
    { params: meetingIdSchema }
  )
  // Create meeting
  .post(
    '/',
    async ({ body, set }) => {
      try {
        const meeting = await MeetingService.create(body);
        return { success: true, data: meeting };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === 'P2003') {
          set.status = 400;
          return { success: false, error: 'Invalid org reference' };
        }
        throw e;
      }
    },
    { body: createMeetingSchema }
  )
  // Update meeting
  .patch(
    '/:id',
    async ({ params, body, set }) => {
      try {
        const meeting = await MeetingService.update(params.id, body);
        return { success: true, data: meeting };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === 'P2025') {
          set.status = 404;
          return { success: false, error: 'Meeting not found' };
        }
        throw e;
      }
    },
    { params: meetingIdSchema, body: updateMeetingSchema }
  )
  // Delete meeting
  .delete(
    '/:id',
    async ({ params, set }) => {
      try {
        await MeetingService.delete(params.id);
        return { success: true, message: 'Meeting deleted' };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === 'P2025') {
          set.status = 404;
          return { success: false, error: 'Meeting not found' };
        }
        throw e;
      }
    },
    { params: meetingIdSchema }
  )
  // Start meeting (transition to LIVE)
  .post(
    '/:id/start',
    async ({ params, set }) => {
      try {
        const meeting = await MeetingService.startMeeting(params.id);
        return { success: true, data: meeting };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === 'P2025') {
          set.status = 404;
          return { success: false, error: 'Meeting not found' };
        }
        throw e;
      }
    },
    { params: meetingIdSchema }
  )
  // End meeting (transition to ENDED)
  .post(
    '/:id/end',
    async ({ params, set }) => {
      try {
        const meeting = await MeetingService.endMeeting(params.id);
        return { success: true, data: meeting };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === 'P2025') {
          set.status = 404;
          return { success: false, error: 'Meeting not found' };
        }
        throw e;
      }
    },
    { params: meetingIdSchema }
  );
