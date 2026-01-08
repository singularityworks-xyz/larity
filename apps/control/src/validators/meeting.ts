import { z } from 'zod';
import { paginationSchema } from '../lib/pagination';

// Enums
export const MeetingStatus = z.enum(['SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED']);
export type MeetingStatus = z.infer<typeof MeetingStatus>;

// ID schemas
export const meetingIdSchema = z.object({
  id: z.uuid('Invalid meeting ID'),
});

// Create schema - now client-scoped instead of org-scoped
export const createMeetingSchema = z.object({
  clientId: z.uuid('Invalid client ID'),
  title: z.string().min(1, 'Title is required').max(255, 'Title must be less than 255 characters'),
  description: z.string().max(2000).optional(),
  agenda: z.string().max(5000).optional(),
  scheduledAt: z.coerce.date().optional(),
  calendarEventId: z.string().max(255).optional(),
});

// Update schema
export const updateMeetingSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional().nullable(),
  agenda: z.string().max(5000).optional().nullable(),
  status: MeetingStatus.optional(),
  scheduledAt: z.coerce.date().optional().nullable(),
  startedAt: z.coerce.date().optional().nullable(),
  endedAt: z.coerce.date().optional().nullable(),
  calendarEventId: z.string().max(255).optional().nullable(),
  summary: z.string().max(10000).optional().nullable(),
});

// Query schema - now client-scoped with pagination
export const meetingQuerySchema = z
  .object({
    clientId: z.uuid().optional(),
    status: MeetingStatus.optional(),
    scheduledAfter: z.coerce.date().optional(),
    scheduledBefore: z.coerce.date().optional(),
  })
  .extend(paginationSchema.shape)
  .optional();

// Extraction schema for bulk post-meeting processing
export const meetingExtractionSchema = z.object({
  decisions: z
    .array(
      z.object({
        title: z.string().min(1).max(255),
        content: z.string().min(1),
        rationale: z.string().optional(),
        evidence: z.string().optional(),
        // TODO v2: Add authorId field to track decision authorship
        tags: z.array(z.string()).default([]),
      })
    )
    .default([]),
  tasks: z
    .array(
      z.object({
        title: z.string().min(1).max(255),
        description: z.string().optional(),
        assigneeId: z.uuid().optional(),
        dueAt: z.coerce.date().optional(),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
      })
    )
    .default([]),
  openQuestions: z
    .array(
      z.object({
        question: z.string().min(1).max(2000),
        context: z.string().optional(),
        assigneeId: z.uuid().optional(),
        dueAt: z.coerce.date().optional(),
      })
    )
    .default([]),
  importantPoints: z
    .array(
      z.object({
        content: z.string().min(1).max(5000),
        category: z
          .enum(['COMMITMENT', 'CONSTRAINT', 'INSIGHT', 'WARNING', 'RISK', 'OPPORTUNITY'])
          .default('INSIGHT'),
        speakerId: z.uuid().optional(),
        transcriptEvidence: z.string().optional(),
      })
    )
    .default([]),
  summary: z.string().max(10000).optional(),
});

// Type exports
export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;
export type UpdateMeetingInput = z.infer<typeof updateMeetingSchema>;
export type MeetingExtractionInput = z.infer<typeof meetingExtractionSchema>;
export type MeetingQueryInput = z.infer<typeof meetingQuerySchema>;
