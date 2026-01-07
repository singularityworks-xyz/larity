import { t } from 'elysia';

export const TaskStatus = t.Union([t.Literal('OPEN'), t.Literal('DONE')]);

export const createTaskSchema = t.Object({
  title: t.String({ minLength: 1, maxLength: 255 }),
  description: t.Optional(t.String()),
  orgId: t.String({ format: 'uuid' }),
  meetingId: t.Optional(t.String({ format: 'uuid' })),
  assigneeId: t.Optional(t.String({ format: 'uuid' })),
  creatorId: t.Optional(t.String({ format: 'uuid' })),
  dueAt: t.Optional(t.String({ format: 'date-time' })),
  status: t.Optional(TaskStatus),
});

export const updateTaskSchema = t.Object({
  title: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
  description: t.Optional(t.String()),
  status: t.Optional(TaskStatus),
  dueAt: t.Optional(t.String({ format: 'date-time' })),
  assigneeId: t.Optional(t.String({ format: 'uuid' })),
});

export const taskIdSchema = t.Object({
  id: t.String({ format: 'uuid' }),
});

export const taskQuerySchema = t.Object({
  orgId: t.Optional(t.String({ format: 'uuid' })),
  status: t.Optional(TaskStatus),
  assigneeId: t.Optional(t.String({ format: 'uuid' })),
  meetingId: t.Optional(t.String({ format: 'uuid' })),
});
