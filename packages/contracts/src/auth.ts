import { z } from 'zod';
import { DataScopeSchema, type DataScope } from './enums';

export const ABILITIES = [
  'CASE_READ',
  'CASE_CREATE',
  'CASE_EDIT_DRAFT',
  'CASE_MANAGE_LINK',
  'CASE_ASSIGN_OWNER',
  'CASE_ASSIGN_REVIEWER',
  'FILE_READ',
  'SENSITIVE_FILE_READ',
  'REVIEW_ITEM',
  'REVIEW_CONFIRM',
  'CASE_CLOSE',
  'PDF_RETRY',
  'REQUIREMENT_MANAGE',
  'TEMPLATE_MANAGE',
  'TEMPLATE_PUBLISH',
  'ROLE_MAPPING_MANAGE',
  'AUDIT_READ_ALL',
] as const;

export const AbilitySchema = z.enum(ABILITIES);
/** @deprecated Use AbilitySchema. */
export const CapabilitySchema = AbilitySchema;
export type Ability = z.infer<typeof AbilitySchema>;
type CanonicalRoleMapping = {
  roleKey: string;
  abilities: Ability[];
  dataScope: DataScope;
  enabled: boolean;
};

const RoleMappingBaseSchema = z.object({
  roleKey: z.string().min(1),
  dataScope: DataScopeSchema,
  enabled: z.boolean(),
}).strict();

export const RoleMappingSchema = z.union([
  RoleMappingBaseSchema.extend({ abilities: z.array(AbilitySchema) }).strict(),
  RoleMappingBaseSchema.extend({ capabilities: z.array(AbilitySchema) }).strict(),
]).transform((mapping): CanonicalRoleMapping => {
  if ('abilities' in mapping) return mapping;
  const { capabilities, ...base } = mapping;
  return { ...base, abilities: capabilities };
});
export const BackendUserSchema = z.object({
  userId: z.string().min(1),
  name: z.string(),
  departmentId: z.string().nullable(),
  roles: z.array(z.string()),
});

/** @deprecated Use Ability. */
export type Capability = Ability;
export type RoleMapping = z.infer<typeof RoleMappingSchema>;
export type BackendUser = z.infer<typeof BackendUserSchema>;
