import { z } from 'zod';

export const MeetingStatus = z.enum(['SCHEDULED', 'LIVE', 'ENDED']);

export const createMeetingSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255, 'Title must be less than 255 characters'),
  description: z.string().optional(),
  orgId: z.uuid('Invalid organization ID'),
  scheduledAt: z.iso.datetime('Invalid datetime format').optional(),
  status: MeetingStatus.optional(),
});

export const updateMeetingSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(255, 'Title must be less than 255 characters')
    .optional(),
  description: z.string().optional(),
  status: MeetingStatus.optional(),
  scheduledAt: z.iso.datetime('Invalid datetime format').optional(),
  startedAt: z.iso.datetime('Invalid datetime format').optional(),
  endedAt: z.iso.datetime('Invalid datetime format').optional(),
});

export const meetingIdSchema = z.object({
  id: z.uuid('Invalid meeting ID'),
});

export const meetingQuerySchema = z.object({
  orgId: z.uuid('Invalid organization ID').optional(),
  status: MeetingStatus.optional(),
});
