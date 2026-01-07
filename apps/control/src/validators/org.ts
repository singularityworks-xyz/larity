import { t } from 'elysia';

export const createOrgSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 255 }),
});

export const updateOrgSchema = t.Object({
  name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
});

export const orgIdSchema = t.Object({
  id: t.String({ format: 'uuid' }),
});

export const orgResponseSchema = t.Object({
  id: t.String(),
  name: t.String(),
  createdAt: t.Date(),
  updatedAt: t.Date(),
});
