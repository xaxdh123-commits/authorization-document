import { z } from 'zod';

export const CASE_STATUSES = [
  'DRAFT',
  'AWAITING_CUSTOMER',
  'CUSTOMER_EDITING',
  'PENDING_REVIEW',
  'NEEDS_SUPPLEMENT',
  'PENDING_REREVIEW',
  'FINALIZING',
  'PDF_FAILED',
  'COMPLETED',
  'CLOSED',
] as const;

export const CaseStatusSchema = z.enum(CASE_STATUSES);
export const DATA_SCOPES = ['SELF', 'DEPT', 'ALL'] as const;
export const DataScopeSchema = z.enum(DATA_SCOPES);

export type CaseStatus = z.infer<typeof CaseStatusSchema>;
export type DataScope = z.infer<typeof DataScopeSchema>;

export const caseStatusZh: Readonly<Record<CaseStatus, string>> = Object.freeze({
  DRAFT: '草稿',
  AWAITING_CUSTOMER: '待客户填写',
  CUSTOMER_EDITING: '客户填写中',
  PENDING_REVIEW: '待审核',
  NEEDS_SUPPLEMENT: '需补件',
  PENDING_REREVIEW: '待复审',
  FINALIZING: '待生成最终文件',
  PDF_FAILED: '最终文件生成失败',
  COMPLETED: '已完成',
  CLOSED: '已关闭',
});
