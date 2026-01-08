import { z } from 'zod';

// Enums
export const GuardrailRuleType = z.enum(['NDA', 'LEGAL', 'TERMINOLOGY', 'INTERNAL', 'CUSTOM']);
export type GuardrailRuleType = z.infer<typeof GuardrailRuleType>;

export const GuardrailSeverity = z.enum(['INFO', 'WARNING', 'BLOCK']);
export type GuardrailSeverity = z.infer<typeof GuardrailSeverity>;

export const GuardrailSourceType = z.enum(['DECISION', 'IMPORTANT_POINT', 'MANUAL']);
export type GuardrailSourceType = z.infer<typeof GuardrailSourceType>;

// ID schemas
export const policyGuardrailIdSchema = z.object({
  id: z.uuid('Invalid policy guardrail ID'),
});

// Create schema
export const createPolicyGuardrailSchema = z.object({
  orgId: z.uuid('Invalid organization ID'),
  clientId: z.uuid('Invalid client ID').optional(),
  createdById: z.uuid('Invalid user ID').optional(),
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().min(1, 'Description is required').max(2000),
  ruleType: GuardrailRuleType,
  pattern: z.string().max(1000).optional(),
  keywords: z.array(z.string().max(100)).default([]),
  severity: GuardrailSeverity.default('WARNING'),
  sourceType: GuardrailSourceType.optional(),
  sourceId: z.uuid().optional(),
});

// Update schema
export const updatePolicyGuardrailSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().min(1).max(2000).optional(),
  ruleType: GuardrailRuleType.optional(),
  pattern: z.string().max(1000).optional().nullable(),
  keywords: z.array(z.string().max(100)).optional(),
  severity: GuardrailSeverity.optional(),
  isActive: z.boolean().optional(),
  sourceType: GuardrailSourceType.optional().nullable(),
  sourceId: z.uuid().optional().nullable(),
});

// Query schema
export const policyGuardrailQuerySchema = z
  .object({
    orgId: z.uuid().optional(),
    clientId: z.uuid().optional(),
    ruleType: GuardrailRuleType.optional(),
    severity: GuardrailSeverity.optional(),
    isActive: z.coerce.boolean().optional(),
  })
  .optional();

// Type exports
export type CreatePolicyGuardrailInput = z.infer<typeof createPolicyGuardrailSchema>;
export type UpdatePolicyGuardrailInput = z.infer<typeof updatePolicyGuardrailSchema>;
