import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('跨应用发布安全契约', () => {
  it('Admin 与 H5 都显示精确的普通签署免责声明', () => {
    const exact = '当前为普通电子签署，不等同于第三方可靠电子签名。';
    expect(read('apps/admin/src/features/cases/CaseDetailPage.tsx')).toContain(exact);
    expect(read('apps/h5/src/features/case-wizard/CaseWizardPage.tsx')).toContain(exact);
  });

  it('普通下载对敏感文件固定返回 403', () => {
    const controller = read('apps/api/src/files/files.controller.ts');
    expect(controller).toContain("throw new ForbiddenException('敏感文件需使用敏感资料权限入口')");
    expect(controller).toContain("@RequireAbility('SENSITIVE_FILE_READ')");
  });

  it('链接令牌使用 32 随机字节且数据库仅保存摘要', () => {
    const tokens = read('apps/api/src/cases/token.service.ts');
    expect(tokens).toContain('randomBytes(32)');
    expect(tokens).toContain("createHash('sha256')");
    expect(tokens).toContain('expiresAt');
    expect(tokens).toContain('consumedAt');
  });

  it('生产反代配置包含 TLS、上传限制和关键安全头', () => {
    const nginx = read('deploy/nginx.example.conf');
    for (const value of ['ssl_protocols TLSv1.2 TLSv1.3', 'client_max_body_size 20m', 'X-Content-Type-Options', 'Content-Security-Policy']) expect(nginx).toContain(value);
  });

  it('Admin 与 H5 静态构建支持同主域独立 base path', () => {
    expect(read('apps/admin/vite.config.ts')).toContain("process.env.VITE_PUBLIC_BASE");
    expect(read('apps/h5/vite.config.ts')).toContain("process.env.VITE_PUBLIC_BASE");
    expect(read('apps/admin/src/main.tsx')).toContain('basename={import.meta.env.BASE_URL}');
    expect(read('apps/h5/src/main.tsx')).toContain('basename={import.meta.env.BASE_URL}');
  });

  it('v1 只按角色能力鉴权，不重新引入 dataScope 行过滤', () => {
    expect(read('apps/api/src/auth/ability.guard.ts')).toContain('REQUIRED_ABILITY');
    expect(read('apps/api/src/cases/case.service.ts')).not.toMatch(/dataScope|SELF|DEPT/);
  });

  it('真实 E2E 测试体覆盖完整补件重签、最终 PDF 自动断链及三层配额攻击', () => {
    const lifecycle = read('tests/e2e/lifecycle-history.e2e.spec.ts');
    for (const marker of ['signatureResourceId', "declaration:true", "api('/public/submit')", 'COMPLETED', "api('/public/case')"]) expect(lifecycle).toContain(marker);
    expect(lifecycle).not.toContain("close-access");
    const attacks = read('tests/e2e/api-attacks.e2e.spec.ts');
    for (const marker of ['/download', '/sensitive-download', '/review/', '/close', '/publish', '/audit', 'ITEM_FILE_COUNT', 'CASE_TOTAL_BYTES']) expect(attacks).toContain(marker);
    expect(attacks).toContain('quotaPdf(index)');
    expect(attacks).toContain("% quota-${variant}");
  });

  it('workflow E2E uses production-valid requirement and case DTOs', () => {
    const workflow = read('tests/e2e/workflow.e2e.spec.ts');
    const fixture = read('tests/e2e/workflow-fixture.ts');
    for (const marker of ['authorization_letter','maxFiles: 10','maxFileSizeBytes: 20 * 1024 * 1024',"allowedMimeTypes: ['application/pdf']",'requirementVersionIds: [authorizationVersionId, optionalVersionId]',"signer: 'PARTY_A'",'required: true','contactName:','specification:','material:','craft:','workflowPdf']) expect(fixture).toContain(marker);
    expect(workflow).toContain("version.status==='PUBLISHED'");expect(workflow).toContain("version.status==='DRAFT'");expect(workflow).toContain('workflowTemplateInput');expect(workflow).toContain('workflowCaseInput');
  });

  it('workflow E2E performs both customer signatures and verifies review states', () => {
    const workflow = read('tests/e2e/workflow.e2e.spec.ts');
    for (const marker of [
      'drawHandwrittenSignature',
      'page.mouse.down()',
      'page.mouse.move(',
      'page.mouse.up()',
      'server-signature-overlay',
      '/public/signing/resources',
      "toBe('PENDING_REVIEW')",
      "toBe('PENDING_REREVIEW')",
    ]) expect(workflow).toContain(marker);
    expect(workflow.match(/drawHandwrittenSignature\(page\)/g)).toHaveLength(2);
    expect(workflow.match(/submitSignedForm\(page,/g)).toHaveLength(2);
    expect(workflow).toContain("getByRole('checkbox').check()");
  });

  it('workflow E2E verifies finalization evidence and automatic link closure', () => {
    const workflow = read('tests/e2e/workflow.e2e.spec.ts');
    for (const marker of [
      'completedPdfStatus',
      'outputSha256',
      "toBe('COMPLETED')",
      'expectPublicTokenClosed(submitted.accessToken)',
      'expectPublicTokenClosed(rejection.supplementToken)',
      '[404, 410]',
    ]) expect(workflow).toContain(marker);
    expect(workflow).not.toContain('finalPdfSha256');
    expect(workflow).not.toContain('close-access');
  });

  it('发布门禁执行自身工具、部署 mock、创建计时和八项具名签字索引', () => {
    const gate = read('scripts/run-acceptance.mjs');
    expect(gate).toContain('test:release-tools');
    expect(gate).toContain('deploy-scripts.test.ps1');
    const timing = read('tests/e2e/create-case-timing.spec.ts');
    expect(timing).toContain('for (let run = 1; run <= 5; run++)');
    expect(timing).toContain('expect(requirementVersionIds).toHaveLength(3)');
    expect(timing).toContain('requirementVersionIds,materials:');
    expect(timing).toContain('.accessToken).toBeTruthy()');
    expect(timing).not.toContain('.publicToken');
    const acceptance = read('docs/acceptance/authorization-mvp.md');
    for (const column of ['执行人', '执行时间', '签字结论']) expect(acceptance).toContain(column);
  });
});
