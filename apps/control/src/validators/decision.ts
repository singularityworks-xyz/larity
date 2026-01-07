import { t } from 'elysia';

export const createDecisionSchema = t.Object({
  title: t.String({ minLength: 1, maxLength: 255 }),
  content: t.String({ minLength: 1 }),
  rationale: t.Optional(t.String()),
  evidence: t.Optional(t.String()),
  orgId: t.String({ format: 'uuid' }),
  meetingId: t.Optional(t.String({ format: 'uuid' })),
  authorId: t.Optional(t.String({ format: 'uuid' })),
});

export const updateDecisionSchema = t.Object({
  title: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
  content: t.Optional(t.String({ minLength: 1 })),
  rationale: t.Optional(t.String()),
  evidence: t.Optional(t.String()),
});

export const decisionIdSchema = t.Object({
  id: t.String({ format: 'uuid' }),
});

export const decisionRefSchema = t.Object({
  decisionRef: t.String({ format: 'uuid' }),
});

export const decisionQuerySchema = t.Object({
  orgId: t.Optional(t.String({ format: 'uuid' })),
  meetingId: t.Optional(t.String({ format: 'uuid' })),
  authorId: t.Optional(t.String({ format: 'uuid' })),
  decisionRef: t.Optional(t.String({ format: 'uuid' })),
});
