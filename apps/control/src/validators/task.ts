import { z } from 'zod';
import { paginationSchema } from '../lib/pagination';

// Enums
export const TaskStatus = z.enum(['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED']);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const TaskPriority = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type TaskPriority = z.infer<typeof TaskPriority>;

// ID schemas
export const taskIdSchema = z.object({
  id: z.uuid('Invalid task ID'),
});

// Create schema - now client-scoped instead of org-scoped
export const createTaskSchema = z.object({
  clientId: z.uuid('Invalid client ID'),
  title: z.string().min(1, 'Title is required').max(255, 'Title must be less than 255 characters'),
  description: z.string().max(5000).optional(),
  meetingId: z.uuid('Invalid meeting ID').optional(),
  decisionId: z.uuid('Invalid decision ID').optional(),
  assigneeId: z.uuid('Invalid assignee ID').optional(),
  creatorId: z.uuid('Invalid creator ID').optional(),
  status: TaskStatus.default('OPEN'),
  priority: TaskPriority.default('MEDIUM'),
  dueAt: z.coerce.date().optional(),
  externalRef: z.string().max(255).optional(),
});

// Update schema
export const updateTaskSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).optional().nullable(),
  status: TaskStatus.optional(),
  priority: TaskPriority.optional(),
  dueAt: z.coerce.date().optional().nullable(),
  completedAt: z.coerce.date().optional().nullable(),
  assigneeId: z.uuid().optional().nullable(),
  decisionId: z.uuid().optional().nullable(),
  externalRef: z.string().max(255).optional().nullable(),
});

// Query schema - now client-scoped with pagination
export const taskQuerySchema = z
  .object({
    clientId: z.uuid().optional(),
    status: TaskStatus.optional(),
    priority: TaskPriority.optional(),
    assigneeId: z.uuid().optional(),
    meetingId: z.uuid().optional(),
    decisionId: z.uuid().optional(),
    dueBefore: z.coerce.date().optional(),
    dueAfter: z.coerce.date().optional(),
  })
  .extend(paginationSchema.shape)
  .optional();

// Type exports
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type TaskQueryInput = z.infer<typeof taskQuerySchema>;
