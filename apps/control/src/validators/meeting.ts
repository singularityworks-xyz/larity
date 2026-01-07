import { t } from 'elysia';

export const MeetingStatus = t.Union([
  t.Literal('SCHEDULED'),
  t.Literal('LIVE'),
  t.Literal('ENDED'),
]);

export const createMeetingSchema = t.Object({
  title: t.String({ minLength: 1, maxLength: 255 }),
  description: t.Optional(t.String()),
  orgId: t.String({ format: 'uuid' }),
  scheduledAt: t.Optional(t.String({ format: 'date-time' })),
  status: t.Optional(MeetingStatus),
});

export const updateMeetingSchema = t.Object({
  title: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
  description: t.Optional(t.String()),
  status: t.Optional(MeetingStatus),
  scheduledAt: t.Optional(t.String({ format: 'date-time' })),
  startedAt: t.Optional(t.String({ format: 'date-time' })),
  endedAt: t.Optional(t.String({ format: 'date-time' })),
});

export const meetingIdSchema = t.Object({
  id: t.String({ format: 'uuid' }),
});

export const meetingQuerySchema = t.Object({
  orgId: t.Optional(t.String({ format: 'uuid' })),
  status: t.Optional(MeetingStatus),
});
