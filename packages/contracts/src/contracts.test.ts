import { describe, expect, expectTypeOf, it } from 'vitest';
import type { Ability, DataScope, PublicCaseView, PublicRequirement, RoleMapping } from './index';
import {
  AbilitySchema,
  CaseAssignSchema,
  CaseClaimSchema,
  CaseCreateSchema,
  CaseDraftConflictSchema,
  CaseDraftCreateNewVersionSchema,
  CaseDraftSaveSchema,
  CaseFilterSchema,
  CaseItemReviewSchema,
  CaseLinkDisableSchema,
  CaseLinkRegenerateSchema,
  CaseLinkRenewSchema,
  CaseReassignSchema,
  CaseSnapshotSchema,
  CaseStatusSchema,
  CaseSupplementSubmitSchema,
  DataScopeSchema,
  PdfTaskCreateSchema,
  PdfTaskSchema,
  PublicCaseViewSchema,
  PublicSigningCommandSchema,
  RequirementDefinitionSchema,
  RequirementTypeSchema,
  RequirementVersionSchema,
  RoleMappingSchema,
  SigningPayloadSchema,
  TemplateAstSchema,
  TemplateVersionSchema,
  caseStatusZh,
  createPdfTaskIdempotencyKey,
} from './index';

const statuses = [
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

const materials = [{ name: '纸盒', specification: 'A4', quantity: 1, material: '纸', craft: '覆膜' }];

describe('workflow enums', () => {
  it('accepts exactly the ten case statuses and exposes their Chinese boundary', () => {
    expect(CaseStatusSchema.options).toEqual(statuses);
    expect(statuses.map((status) => CaseStatusSchema.parse(status))).toEqual(statuses);
    expect(caseStatusZh).toEqual({
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
    expect(() => CaseStatusSchema.parse('SUBMITTED')).toThrow();
    expect(() => CaseStatusSchema.parse('IN_REVIEW')).toThrow();
  });

  it('keeps abilities and data scopes closed to known machine keys', () => {
    expect(DataScopeSchema.options).toEqual(['SELF', 'DEPT', 'ALL']);
    expect(AbilitySchema.parse('CASE_READ')).toBe('CASE_READ');
    expect(() => AbilitySchema.parse('CASE_DO_ANYTHING')).toThrow();
  });

  it('normalizes exactly one role ability representation to canonical output', () => {
    const base = { roleKey: 'reviewer', dataScope: 'DEPT', enabled: true } as const;
    const canonical = { ...base, abilities: ['CASE_READ', 'REVIEW_ITEM'] as const };
    expect(RoleMappingSchema.parse(canonical)).toEqual(canonical);
    expect(RoleMappingSchema.parse({ ...base, capabilities: ['CASE_READ'] })).toEqual({ ...base, abilities: ['CASE_READ'] });
    expect(() => RoleMappingSchema.parse(base)).toThrow();
    expect(() => RoleMappingSchema.parse({ ...base, abilities: ['CASE_READ'], capabilities: ['REVIEW_ITEM'] })).toThrow();
    expectTypeOf<RoleMapping>().toEqualTypeOf<{ roleKey: string; abilities: Ability[]; dataScope: DataScope; enabled: boolean }>();
  });
});

describe('case commands and views', () => {
  it('validates create, immutable snapshot, and filters', () => {
    expect(CaseCreateSchema.parse({ customerName: '甲方', contactName: '张三', factoryDepartment: '生产部', materials, templateVersionId: 'tv1', requirementVersionIds: ['rv1'] })).toBeTruthy();
    const snapshot = CaseSnapshotSchema.parse({ id: 'snapshot-1', caseId: 'case-1', version: 1, templateVersionId: 'tv1', requirementVersionIds: ['rv1'], customerName: '甲方', contactName: '张三', factoryDepartment: '生产部', materials, createdAt: '2026-08-05T00:00:00.000Z' });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(CaseFilterSchema.parse({ statuses: ['PENDING_REVIEW'], scope: 'DEPT', ownerUserId: 'u1', reviewerUserId: 'u2', search: '甲方' })).toBeTruthy();
  });

  it('requires exactly one requirement version representation when creating a case', () => {
    const base = { customerName: '甲方', contactName: '张三', factoryDepartment: '生产部', materials, templateVersionId: 'tv1' };
    expect(CaseCreateSchema.parse({ ...base, requirementVersionIds: ['rv1'] })).toBeTruthy();
    expect(CaseCreateSchema.parse({ ...base, requirements: ['rv1'] })).toBeTruthy();
    expect(() => CaseCreateSchema.parse(base)).toThrow();
    expect(() => CaseCreateSchema.parse({ ...base, requirementVersionIds: ['rv1'], requirements: ['rv2'] })).toThrow();
  });

  it('validates link lifecycle commands and a safe public view', () => {
    expect(CaseLinkRenewSchema.parse({ expiresAt: '2026-08-06T00:00:00.000Z' })).toBeTruthy();
    expect(CaseLinkDisableSchema.parse({ reason: '客户要求停用' })).toBeTruthy();
    expect(CaseLinkRegenerateSchema.parse({ expiresAt: '2026-08-06T00:00:00.000Z', reason: '链接泄露' })).toBeTruthy();
    expect(PublicCaseViewSchema.parse({ id: 'case-1', status: 'CUSTOMER_EDITING', customerName: '甲方', contactName: '张三', materials, requirements: [], draftVersion: 2, linkExpiresAt: '2026-08-06T00:00:00.000Z' })).toBeTruthy();
    expect(() => PublicCaseViewSchema.parse({ id: 'case-1', status: 'DRAFT', customerName: '甲方', contactName: '张三', materials, requirements: [], draftVersion: 1, linkExpiresAt: '2026-08-06T00:00:00.000Z', tokenHash: 'secret' })).toThrow();
  });

  it('rejects private metadata nested in public requirement definitions', () => {
    expectTypeOf<PublicCaseView['requirements']>().toEqualTypeOf<PublicRequirement[]>();
    const view = { id: 'case-1', status: 'CUSTOMER_EDITING', customerName: '甲方', contactName: '张三', materials, draftVersion: 2, linkExpiresAt: '2026-08-06T00:00:00.000Z' };
    const requirement = { key: 'business_license', label: '营业执照', type: 'FILE', required: true };
    expect(PublicCaseViewSchema.parse({ ...view, requirements: [requirement] })).toBeTruthy();
    expect(() => PublicCaseViewSchema.parse({ ...view, requirements: [{ ...requirement, internalStoragePath: 'C:/secret' }] })).toThrow();
  });

  it('models optimistic draft save, 409 conflict, and explicit new version', () => {
    expect(CaseDraftSaveSchema.parse({ version: 3, answers: { brand: 'Acme' }, fileVersionIds: ['fv1'] })).toBeTruthy();
    expect(CaseDraftConflictSchema.parse({ status: 409, code: 'DRAFT_VERSION_CONFLICT', serverVersion: 4 })).toBeTruthy();
    expect(CaseDraftCreateNewVersionSchema.parse({ baseVersion: 3, answers: { brand: 'Acme local' }, fileVersionIds: [], confirmCreateNewVersion: true })).toBeTruthy();
    expect(() => CaseDraftCreateNewVersionSchema.parse({ baseVersion: 3, answers: {}, fileVersionIds: [], confirmCreateNewVersion: false })).toThrow();
  });

  it('validates supplement and assignment/review commands', () => {
    expect(CaseSupplementSubmitSchema.parse({ version: 5, requirementIds: ['req-rejected'] })).toBeTruthy();
    expect(CaseClaimSchema.parse({ caseId: 'case-1' })).toBeTruthy();
    expect(CaseAssignSchema.parse({ caseId: 'case-1', reviewerUserId: 'reviewer-1' })).toBeTruthy();
    expect(CaseReassignSchema.parse({ caseId: 'case-1', reviewerUserId: 'reviewer-2', reason: '工作调整' })).toBeTruthy();
    expect(CaseItemReviewSchema.parse({ caseId: 'case-1', requirementId: 'req-1', decision: 'APPROVE' })).toBeTruthy();
    expect(() => CaseItemReviewSchema.parse({ caseId: 'case-1', requirementId: 'req-1', decision: 'REJECT' })).toThrow();
    expect(CaseItemReviewSchema.parse({ caseId: 'case-1', requirementId: 'req-1', decision: 'REJECT', reason: '证件已过期' })).toBeTruthy();
  });
});

describe('catalog versions and template AST', () => {
  it('accepts all eight requirement types and immutable requirement versions', () => {
    expect(RequirementTypeSchema.options).toEqual(['TEXT', 'LONG_TEXT', 'SINGLE_SELECT', 'MULTI_SELECT', 'DATE', 'NUMBER', 'FILE', 'IMAGE']);
    const definition = RequirementDefinitionSchema.parse({ key: 'business_license', label: '营业执照', type: 'FILE', required: true, description: '请上传扫描件', example: 'PDF', validation: { maxFiles: 2 } });
    expect(definition.sensitive).toBe(false);
    expect(RequirementDefinitionSchema.parse({ key: 'legal_representative_id', label: '法人身份证', type: 'FILE', sensitive: true }).sensitive).toBe(true);
    const version = RequirementVersionSchema.parse({ id: 'rv1', requirementId: 'r1', version: 1, status: 'PUBLISHED', definition, createdAt: '2026-08-05T00:00:00.000Z' });
    expect(Object.isFrozen(version)).toBe(true);
  });

  it('validates closed template components and styles', () => {
    const ast = TemplateAstSchema.parse({
      type: 'page',
      styles: { marginTop: 20, marginRight: 20, marginBottom: 20, marginLeft: 20 },
      header: [{ type: 'text', text: '委托生产授权书', styles: { fontSize: 10, textAlign: 'center' } }],
      footer: [],
      children: [
        { type: 'heading', level: 1, children: [{ type: 'text', text: '授权书', styles: { fontFamily: 'Noto Sans SC', fontSize: 18, fontWeight: 700 } }], styles: { textAlign: 'center', lineHeight: 1.5, paragraphSpacing: 8 } },
        { type: 'paragraph', children: [{ type: 'variable', key: 'customer.name' }] },
        { type: 'image', source: 'asset:logo', alt: '标志', styles: { width: 100, height: 40 } },
        { type: 'table', rows: [[{ children: [{ type: 'text', text: '物料' }] }]] },
        { type: 'loopTable', source: 'materials', columns: [{ header: '名称', variable: 'material.name' }] },
        { type: 'signatureSlot', slotId: 'party-a', signer: 'PARTY_A', page: 1, x: 20, y: 200, width: 60, height: 40, required: true },
        { type: 'pageBreak' },
      ],
    });
    expect(ast.type).toBe('page');
    expect(() => TemplateAstSchema.parse({ type: 'page', children: [{ type: 'script', code: 'alert(1)' }] })).toThrow();
  });

  it('parses immutable template versions', () => {
    const version = TemplateVersionSchema.parse({ id: 'tv1', templateId: 't1', version: 1, status: 'PUBLISHED', ast: { type: 'page', children: [] }, signatureMode: 'HANDWRITTEN', createdAt: '2026-08-05T00:00:00.000Z' });
    expect(Object.isFrozen(version)).toBe(true);
  });
});

describe('signing and PDF contracts', () => {
  it('accepts exactly one signer resource and rejects client evidence fields', () => {
    const payload = { mode: 'HANDWRITTEN', signatureResourceId: 'sr1', signatureResourceVersion: 2, positions: [{ slotId: 'party-a', page: 1, x: 20, y: 200, width: 60, height: 40 }], declaration: { version: 'v1', accepted: true } };
    expect(SigningPayloadSchema.parse(payload)).toEqual(payload);
    expect(() => SigningPayloadSchema.parse({ ...payload, signatureResourceIds: ['sr1', 'sr2'] })).toThrow();
    expect(() => SigningPayloadSchema.parse({ ...payload, signedAt: '2026-08-05T00:00:00.000Z', pdfSha256: 'fake' })).toThrow();
  });

  it('validates idempotent PDF creation and persisted task state', () => {
    const create = { caseId: 'case-1', templateVersionId: 'tv1', dataSnapshotVersion: 3, signatureVersion: 2 };
    expect(PdfTaskCreateSchema.parse(create)).toEqual(create);
    expect(PdfTaskSchema.parse({ id: 'pdf-1', ...create, idempotencyKey: createPdfTaskIdempotencyKey(create), status: 'QUEUED', attempts: 0, maxAttempts: 3, createdAt: '2026-08-05T00:00:00.000Z', updatedAt: '2026-08-05T00:00:00.000Z' })).toBeTruthy();
    expect(() => PdfTaskSchema.parse({ id: 'pdf-1', ...create, idempotencyKey: '', status: 'UNKNOWN', attempts: 0, maxAttempts: 3, createdAt: 'bad', updatedAt: 'bad' })).toThrow();
  });

  it('enforces PDF task identity and status-specific state', () => {
    const identity = {
      id: 'pdf-1',
      caseId: 'case-1',
      templateVersionId: 'tv1',
      dataSnapshotVersion: 3,
      signatureVersion: 2,
      idempotencyKey: createPdfTaskIdempotencyKey({ caseId: 'case-1', templateVersionId: 'tv1', dataSnapshotVersion: 3, signatureVersion: 2 }),
      attempts: 1,
      maxAttempts: 3,
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T00:01:00.000Z',
    };
    expect(() => PdfTaskSchema.parse({ ...identity, idempotencyKey: 'arbitrary', status: 'QUEUED' })).toThrow();
    expect(() => PdfTaskSchema.parse({ ...identity, status: 'SUCCEEDED' })).toThrow();
    expect(PdfTaskSchema.parse({ ...identity, status: 'SUCCEEDED', outputFileId: 'file-1', outputSha256: 'a'.repeat(64) })).toBeTruthy();
    expect(() => PdfTaskSchema.parse({ ...identity, status: 'FAILED' })).toThrow();
    expect(PdfTaskSchema.parse({ ...identity, status: 'FAILED', failureCode: 'RENDER_FAILED', failureMessage: 'Chromium exited' })).toBeTruthy();
    expect(() => PdfTaskSchema.parse({ ...identity, status: 'QUEUED', outputFileId: 'file-1', outputSha256: 'a'.repeat(64) })).toThrow();
  });

  it('uses an injective PDF task identity encoding when IDs contain delimiters', () => {
    const first = { caseId: 'case:a', templateVersionId: 'template', dataSnapshotVersion: 3, signatureVersion: 2 };
    const second = { caseId: 'case', templateVersionId: 'a:template', dataSnapshotVersion: 3, signatureVersion: 2 };
    expect(createPdfTaskIdempotencyKey(first)).not.toBe(createPdfTaskIdempotencyKey(second));
  });

  it('shares the exact public ordinary-signing command contract',()=>{
    expect(PublicSigningCommandSchema.parse({mode:'HANDWRITTEN',signatureResourceId:'fv1',signatureResourceVersion:1,positions:[],declaration:true})).toBeTruthy();
    expect(()=>PublicSigningCommandSchema.parse({mode:'SEAL',signatureResourceId:'fv1',signatureResourceVersion:1,positions:[],declaration:true})).toThrow();
    expect(()=>PublicSigningCommandSchema.parse({mode:'HANDWRITTEN',signatureResourceId:'fv1',signatureResourceVersion:1,positions:[],declaration:{accepted:true}})).toThrow();
  });
});
