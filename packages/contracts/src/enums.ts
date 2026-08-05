import { z } from 'zod';

export const CaseStatusSchema = z.enum(['DRAFT', 'SUBMITTED', 'IN_REVIEW', 'NEEDS_SUPPLEMENT', 'COMPLETED']);
export const DataScopeSchema = z.enum(['SELF', 'DEPT', 'ALL']);
export type CaseStatus = z.infer<typeof CaseStatusSchema>;
export type DataScope = z.infer<typeof DataScopeSchema>;
