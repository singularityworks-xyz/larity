import { z } from "zod";

/**
 * Base pagination schema - to be merged with query schemas
 */
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

/**
 * Apply pagination to Prisma findMany options
 */
export function applyPagination(pagination?: PaginationInput) {
  return {
    take: pagination?.limit ?? 50,
    skip: pagination?.offset ?? 0,
  };
}
