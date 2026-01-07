import { z } from 'zod';

export const TaskStatus = z.enum(['OPEN', 'DONE']);

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255, 'Title must be less than 255 characters'),
  description: z.string().optional(),
  orgId: z.uuid('Invalid organization ID'),
  meetingId: z.uuid('Invalid meeting ID').optional(),
  assigneeId: z.uuid('Invalid assignee ID').optional(),
  creatorId: z.uuid('Invalid creator ID').optional(),
  dueAt: z.iso.datetime('Invalid datetime format').optional(),
  status: TaskStatus.optional(),
});

export const updateTaskSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(255, 'Title must be less than 255 characters')
    .optional(),
  description: z.string().optional(),
  status: TaskStatus.optional(),
  dueAt: z.iso.datetime('Invalid datetime format').optional(),
  assigneeId: z.uuid('Invalid assignee ID').optional(),
});

export const taskIdSchema = z.object({
  id: z.uuid('Invalid task ID'),
});

export const taskQuerySchema = z.object({
  orgId: z.uuid('Invalid organization ID').optional(),
  status: TaskStatus.optional(),
  assigneeId: z.uuid('Invalid assignee ID').optional(),
  meetingId: z.uuid('Invalid meeting ID').optional(),
});
