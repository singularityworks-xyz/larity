import { t } from 'elysia';

export const UserRole = t.Union([t.Literal('OWNER'), t.Literal('MEMBER')]);

export const createUserSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 255 }),
  email: t.String({ format: 'email' }),
  orgId: t.String({ format: 'uuid' }),
  role: t.Optional(UserRole),
  image: t.Optional(t.String()),
});

export const updateUserSchema = t.Object({
  name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
  email: t.Optional(t.String({ format: 'email' })),
  role: t.Optional(UserRole),
  image: t.Optional(t.String()),
});

export const userIdSchema = t.Object({
  id: t.String({ format: 'uuid' }),
});

export const userQuerySchema = t.Object({
  orgId: t.Optional(t.String({ format: 'uuid' })),
  role: t.Optional(UserRole),
});
