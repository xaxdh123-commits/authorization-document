import { z } from 'zod';
import { MaterialItemSchema } from './material';
export const CaseStatusSchema=z.enum(['DRAFT','AWAITING_CUSTOMER','CUSTOMER_EDITING','PENDING_REVIEW','NEEDS_SUPPLEMENT','PENDING_REREVIEW','FINAL_PDF_PENDING','FINAL_PDF_FAILED','COMPLETED','CLOSED']);
export const DataScopeSchema=z.enum(['SELF','DEPT','ALL']);
export { MaterialItemSchema } from './material';
export type CaseStatus=z.infer<typeof CaseStatusSchema>; export type DataScope=z.infer<typeof DataScopeSchema>; export type MaterialItem=z.infer<typeof MaterialItemSchema>;
export * from './case'; export * from './material'; export * from './requirement'; export * from './template'; export * from './auth';
