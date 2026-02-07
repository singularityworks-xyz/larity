/**
 * Prisma error handling utilities
 */

export interface PrismaError {
  code: string;
  meta?: Record<string, unknown>;
  message?: string;
}

/**
 * Type guard to check if an error is a Prisma error
 */
export function isPrismaError(e: unknown): e is PrismaError {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    typeof (e as PrismaError).code === "string"
  );
}

/**
 * Prisma error codes reference:
 * - P2002: Unique constraint violation
 * - P2003: Foreign key constraint violation
 * - P2025: Record not found
 */
export const PrismaErrorCode = {
  UNIQUE_CONSTRAINT: "P2002",
  FOREIGN_KEY_CONSTRAINT: "P2003",
  RECORD_NOT_FOUND: "P2025",
} as const;

/**
 * Standard API error response structure
 */
export interface ApiErrorResponse {
  success: false;
  error: string;
  message?: string;
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  error: string,
  message?: string
): ApiErrorResponse {
  return {
    success: false,
    error,
    ...(message && { message }),
  };
}

/**
 * Handle common Prisma errors and return appropriate response
 */
export function handlePrismaError(
  e: unknown,
  options: {
    uniqueMessage?: string;
    foreignKeyMessage?: string;
    notFoundMessage?: string;
  } = {}
): { status: number; response: ApiErrorResponse } | null {
  if (!isPrismaError(e)) {
    return null;
  }

  const {
    uniqueMessage = "Resource already exists",
    foreignKeyMessage = "Invalid reference",
    notFoundMessage = "Resource not found",
  } = options;

  switch (e.code) {
    case PrismaErrorCode.UNIQUE_CONSTRAINT:
      return { status: 409, response: createErrorResponse(uniqueMessage) };
    case PrismaErrorCode.FOREIGN_KEY_CONSTRAINT:
      return { status: 400, response: createErrorResponse(foreignKeyMessage) };
    case PrismaErrorCode.RECORD_NOT_FOUND:
      return { status: 404, response: createErrorResponse(notFoundMessage) };
    default:
      return null;
  }
}
