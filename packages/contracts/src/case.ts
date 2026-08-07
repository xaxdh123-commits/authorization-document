import { z } from 'zod';
import { CaseStatusSchema, DataScopeSchema } from './enums';
import { MaterialItemSchema, MaterialListSchema } from './material';
import { PublicRequirementSchema } from './requirement';

const IdSchema = z.string().min(1);
const VersionSchema = z.number().int().positive();
const DraftContentShape = {
  answers: z.record(z.unknown()),
  fileVersionIds: z.array(IdSchema),
};

const CaseCreateBaseSchema = z.object({
  customerName: z.string().min(1),
  contactName: z.string().min(1),
  factoryDepartment: z.string().min(1),
  materials: MaterialListSchema,
  templateVersionId: IdSchema,
}).strict();

export const CaseCreateSchema = z.union([
  CaseCreateBaseSchema.extend({ requirementVersionIds: z.array(IdSchema).min(1) }).strict(),
  CaseCreateBaseSchema.extend({
    /** @deprecated Send immutable requirementVersionIds. */
    requirements: z.array(IdSchema).min(1),
  }).strict(),
]);

export const CaseSnapshotSchema = z.object({
  id: IdSchema,
  caseId: IdSchema,
  version: VersionSchema,
  templateVersionId: IdSchema,
  requirementVersionIds: z.array(IdSchema).min(1),
  customerName: z.string().min(1),
  contactName: z.string().min(1),
  factoryDepartment: z.string().min(1),
  materials: MaterialListSchema,
  createdAt: z.string().datetime(),
}).strict().readonly();

export const CaseFilterSchema = z.object({
  statuses: z.array(CaseStatusSchema).min(1).optional(),
  scope: DataScopeSchema.optional(),
  ownerUserId: IdSchema.optional(),
  reviewerUserId: IdSchema.optional(),
  departmentId: IdSchema.optional(),
  search: z.string().min(1).optional(),
  createdFrom: z.string().datetime().optional(),
  createdTo: z.string().datetime().optional(),
}).strict();

/** @deprecated Prefer CaseFilterSchema. */
export const CaseQuerySchema = z.object({
  status: CaseStatusSchema.optional(),
  scope: DataScopeSchema.optional(),
}).strict();

export const CaseLinkRenewSchema = z.object({ expiresAt: z.string().datetime() }).strict();
export const CaseLinkDisableSchema = z.object({ reason: z.string().trim().min(1) }).strict();
export const CaseLinkRegenerateSchema = z.object({
  expiresAt: z.string().datetime(),
  reason: z.string().trim().min(1),
}).strict();

export const PublicCaseViewSchema = z.object({
  id: IdSchema,
  status: CaseStatusSchema,
  customerName: z.string().min(1),
  contactName: z.string().min(1),
  factoryDepartment: z.string().min(1).optional(),
  materials: z.array(MaterialItemSchema).min(1),
  requirements: z.array(PublicRequirementSchema),
  draftVersion: VersionSchema,
  linkExpiresAt: z.string().datetime(),
}).strict();

export const CaseDraftSaveSchema = z.object({
  version: VersionSchema,
  ...DraftContentShape,
}).strict();

export const CaseDraftConflictSchema = z.object({
  status: z.literal(409),
  code: z.literal('DRAFT_VERSION_CONFLICT'),
  serverVersion: VersionSchema,
}).strict();

export const CaseDraftCreateNewVersionSchema = z.object({
  baseVersion: VersionSchema,
  ...DraftContentShape,
  confirmCreateNewVersion: z.literal(true),
}).strict();

export const CaseSupplementSubmitSchema = z.object({
  version: VersionSchema,
  requirementIds: z.array(IdSchema).min(1),
}).strict();

export const CaseClaimSchema = z.object({ caseId: IdSchema }).strict();
export const CaseAssignSchema = z.object({ caseId: IdSchema, reviewerUserId: IdSchema }).strict();
export const CaseReassignSchema = z.object({
  caseId: IdSchema,
  reviewerUserId: IdSchema,
  reason: z.string().trim().min(1),
}).strict();

export const ReviewDecisionSchema = z.enum(['APPROVE', 'REJECT']);
export const CaseItemReviewSchema = z.object({
  caseId: IdSchema,
  requirementId: IdSchema,
  decision: ReviewDecisionSchema,
  reason: z.string().trim().min(1).optional(),
}).strict().superRefine((command, context) => {
  if (command.decision === 'REJECT' && !command.reason) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: '驳回原因不能为空' });
  }
});

export type CaseCreate = z.infer<typeof CaseCreateSchema>;
export type CaseSnapshot = z.infer<typeof CaseSnapshotSchema>;
export type CaseFilter = z.infer<typeof CaseFilterSchema>;
export type PublicCaseView = z.infer<typeof PublicCaseViewSchema>;
export type CaseDraftSave = z.infer<typeof CaseDraftSaveSchema>;
export type CaseDraftConflict = z.infer<typeof CaseDraftConflictSchema>;
export type CaseDraftCreateNewVersion = z.infer<typeof CaseDraftCreateNewVersionSchema>;
export type CaseSupplementSubmit = z.infer<typeof CaseSupplementSubmitSchema>;
export type CaseClaim = z.infer<typeof CaseClaimSchema>;
export type CaseAssign = z.infer<typeof CaseAssignSchema>;
export type CaseReassign = z.infer<typeof CaseReassignSchema>;
export type CaseItemReview = z.infer<typeof CaseItemReviewSchema>;
