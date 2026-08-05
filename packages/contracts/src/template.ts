import { z } from 'zod';
import { RequirementDefinitionSchema } from './requirement';

export const SignatureModeSchema=z.enum(['HANDWRITTEN','STAMP_UPLOAD']);
export const SignatureSlotSchema=z.object({usage:z.string().min(1),page:z.number().int().positive(),anchor:z.string().min(1),required:z.boolean()});
export const TemplateVersionSchema=z.object({version:z.number().int().positive(),status:z.enum(['DRAFT','PUBLISHED','DISABLED']),ast:z.record(z.any()),signatureMode:SignatureModeSchema});
export const TemplateCreateSchema=z.object({
  name:z.string().min(1),
  description:z.string().optional(),
  requirements:RequirementDefinitionSchema.array().optional(),
  ast:z.record(z.any()).optional(),
  signatureMode:SignatureModeSchema.optional(),
});
export const TemplateUpdateSchema=TemplateCreateSchema.partial().extend({name:z.string().min(1).optional()});
export type TemplateCreate=z.infer<typeof TemplateCreateSchema>;
export type TemplateUpdate=z.infer<typeof TemplateUpdateSchema>;
