import { z } from 'zod';

export const REQUIREMENT_TYPES = ['TEXT', 'LONG_TEXT', 'SINGLE_SELECT', 'MULTI_SELECT', 'DATE', 'NUMBER', 'FILE', 'IMAGE'] as const;
export const RequirementTypeSchema = z.enum(REQUIREMENT_TYPES);
export const RequirementStatusSchema = z.enum(['PENDING_INPUT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED']);
export const CatalogVersionStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'DISABLED']);

export const RequirementValidationSchema = z.object({
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().positive().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  pattern: z.string().optional(),
  maxFiles: z.number().int().positive().optional(),
  maxFileSizeBytes: z.number().int().positive().optional(),
  allowedMimeTypes: z.array(z.string().min(1)).optional(),
}).strict();

export const RequirementDefinitionSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().min(1),
  type: RequirementTypeSchema,
  required: z.boolean().default(false),
  sensitive: z.boolean().default(false),
  description: z.string().optional(),
  example: z.string().optional(),
  defaultValue: z.unknown().optional(),
  options: z.array(z.object({ value: z.string().min(1), label: z.string().min(1) }).strict()).optional(),
  validation: RequirementValidationSchema.optional(),
}).strict();

export const PublicRequirementSchema = RequirementDefinitionSchema.pick({
  key: true,
  label: true,
  type: true,
  required: true,
  sensitive: true,
  description: true,
  example: true,
  defaultValue: true,
  options: true,
  validation: true,
}).strict();

export const RequirementVersionSchema = z.object({
  id: z.string().min(1),
  requirementId: z.string().min(1),
  version: z.number().int().positive(),
  status: CatalogVersionStatusSchema,
  definition: RequirementDefinitionSchema,
  createdAt: z.string().datetime(),
  publishedAt: z.string().datetime().optional(),
  disabledAt: z.string().datetime().optional(),
}).strict().readonly();

export type RequirementType = z.infer<typeof RequirementTypeSchema>;
export type RequirementStatus = z.infer<typeof RequirementStatusSchema>;
export type RequirementDefinition = z.infer<typeof RequirementDefinitionSchema>;
export type PublicRequirement = z.infer<typeof PublicRequirementSchema>;
export type RequirementVersion = z.infer<typeof RequirementVersionSchema>;
