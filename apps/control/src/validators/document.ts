import { z } from 'zod';
import { paginationSchema } from '../lib/pagination';

// Enums
export const DocumentType = z.enum([
  'NOTE',
  'CONTRACT',
  'PROPOSAL',
  'SOW',
  'BRIEF',
  'TEMPLATE',
  'OTHER',
]);
export type DocumentType = z.infer<typeof DocumentType>;

export const DocumentStatus = z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']);
export type DocumentStatus = z.infer<typeof DocumentStatus>;

// ID schemas
export const documentIdSchema = z.object({
  id: z.uuid('Invalid document ID'),
});

// Create schema
export const createDocumentSchema = z.object({
  clientId: z.uuid('Invalid client ID'),
  createdById: z.uuid('Invalid user ID').optional(),
  parentId: z.uuid('Invalid parent document ID').optional(),
  type: DocumentType.default('NOTE'),
  title: z.string().min(1, 'Title is required').max(255),
  content: z.string().min(1, 'Content is required'),
  mimeType: z.string().max(100).optional(),
  fileUrl: z.url().optional(),
});

// Update schema
export const updateDocumentSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  content: z.string().min(1).optional(),
  type: DocumentType.optional(),
  status: DocumentStatus.optional(),
  parentId: z.uuid().optional().nullable(),
  mimeType: z.string().max(100).optional().nullable(),
  fileUrl: z.url().optional().nullable(),
});

// Query schema with pagination
export const documentQuerySchema = z
  .object({
    clientId: z.uuid().optional(),
    type: DocumentType.optional(),
    status: DocumentStatus.optional(),
    parentId: z.uuid().optional(),
    createdById: z.uuid().optional(),
  })
  .extend(paginationSchema.shape)
  .optional();

// Type exports
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;
export type DocumentQueryInput = z.infer<typeof documentQuerySchema>;
