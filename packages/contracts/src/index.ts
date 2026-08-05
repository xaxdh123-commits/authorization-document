import { z } from 'zod';
export const CaseStatusSchema=z.enum(['DRAFT','AWAITING_CUSTOMER','CUSTOMER_EDITING','PENDING_REVIEW','NEEDS_SUPPLEMENT','PENDING_REREVIEW','FINAL_PDF_PENDING','FINAL_PDF_FAILED','COMPLETED','CLOSED']);
export const DataScopeSchema=z.enum(['SELF','DEPT','ALL']);
export const MaterialItemSchema=z.object({name:z.string().min(1),specification:z.string().min(1),quantity:z.number().positive(),material:z.string().min(1),craft:z.string().min(1),optionalPrice:z.number().nonnegative().optional()});
export type CaseStatus=z.infer<typeof CaseStatusSchema>; export type DataScope=z.infer<typeof DataScopeSchema>; export type MaterialItem=z.infer<typeof MaterialItemSchema>;
