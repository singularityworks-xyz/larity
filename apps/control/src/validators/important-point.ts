import { z } from 'zod';

// Enums
export const ImportantPointCategory = z.enum([
  'COMMITMENT',
  'CONSTRAINT',
  'INSIGHT',
  'WARNING',
  'RISK',
  'OPPORTUNITY',
]);
export type ImportantPointCategory = z.infer<typeof ImportantPointCategory>;

// ID schemas
export const importantPointIdSchema = z.object({
  id: z.string().uuid('Invalid important point ID'),
});

// Create schema
export const createImportantPointSchema = z.object({
  clientId: z.uuid('Invalid client ID'),
  content: z.string().min(1, 'Content is required').max(5000),
  meetingId: z.uuid('Invalid meeting ID').optional(),
  speakerId: z.uuid('Invalid user ID').optional(),
  category: ImportantPointCategory.default('INSIGHT'),
  transcriptEvidence: z.string().max(10000).optional(),
});

// Query schema
export const importantPointQuerySchema = z
  .object({
    clientId: z.uuid().optional(),
    meetingId: z.uuid().optional(),
    speakerId: z.uuid().optional(),
    category: ImportantPointCategory.optional(),
  })
  .optional();

// Type exports
export type CreateImportantPointInput = z.infer<typeof createImportantPointSchema>;
