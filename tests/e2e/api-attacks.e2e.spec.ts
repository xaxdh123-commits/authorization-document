import { expect, test } from '@playwright/test';
import { inspectE2EPrerequisites } from './prerequisites';

const prerequisites = inspectE2EPrerequisites(process.env);
const api = (path: string) => new URL(path, prerequisites.apiUrl).toString();
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const token = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must identify a real seeded E2E principal`);
  return value;
};

const quotaPdf = (variant: number) => {
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>\nendobj\n',
  ];
  let body = '%PDF-1.4\n';
  const offsets = objects.map((object) => { const offset = Buffer.byteLength(body); body += object; return offset; });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 4\n0000000000 65535 f \n${offsets.map(offset => String(offset).padStart(10, '0') + ' 00000 n ').join('\n')}\ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n% quota-${variant}`;
  return Buffer.from(body);
};

test.describe('真实 API 越权与输入攻击矩阵', () => {
  test.skip(!prerequisites.ready, prerequisites.reason ?? '专用 _test 数据库/API 未配置');

  test('角色仅按 abilities 授权，不按数据行范围过滤', async ({ request }) => {
    const caseId=token('E2E_ABILITY_CASE_ID');const ordinaryFile=token('E2E_ORDINARY_FILE_VERSION_ID');const sensitiveFile=token('E2E_SENSITIVE_FILE_VERSION_ID');const templateVersion=token('E2E_DRAFT_TEMPLATE_VERSION_ID');
    const operations=[
      {name:'file /download',method:'get',path:`/cases/${caseId}/files/${ordinaryFile}/download`,allowed:'E2E_REVIEWER_TOKEN'},
      {name:'sensitive /sensitive-download',method:'get',path:`/cases/${caseId}/files/${sensitiveFile}/sensitive-download`,allowed:'E2E_REVIEWER_TOKEN'},
      {name:'review /review/',method:'get',path:'/review/queue',allowed:'E2E_REVIEWER_TOKEN'},
      {name:'case /close',method:'post',path:`/cases/${caseId}/close`,allowed:'E2E_CUSTOMER_SERVICE_TOKEN',data:{reason:'能力矩阵专用业务单'}},
      {name:'template /publish',method:'post',path:`/templates/versions/${templateVersion}/publish`,allowed:'E2E_ADMIN_TOKEN'},
      {name:'audit /audit',method:'get',path:'/audit',allowed:'E2E_ADMIN_TOKEN'},
    ] as const;
    for(const operation of operations){const allowed=await (request as any)[operation.method](api(operation.path),{headers:{...bearer(token(operation.allowed)),'content-type':'application/json'},data:'data' in operation?operation.data:undefined});expect(allowed.status(),`${operation.name} allow`).toBeLessThan(400);const denied=await (request as any)[operation.method](api(operation.path),{headers:{...bearer(token('E2E_NO_ABILITY_TOKEN')),'content-type':'application/json'},data:'data' in operation?operation.data:undefined});expect(denied.status(),`${operation.name} deny`).toBe(403);}
  });

  test('伪造、过期和已撤销的公开令牌均不可访问', async ({ request }) => {
    for (const candidate of ['forged-token', token('E2E_EXPIRED_PUBLIC_TOKEN'), token('E2E_REVOKED_PUBLIC_TOKEN')]) {
      const response = await request.get(api('/public/case'), { headers: bearer(candidate) });
      expect([401, 404, 410]).toContain(response.status());
      expect(await response.text()).not.toMatch(/token|cookie|password|private[\\/]|stack/i);
    }
  });

  test('跨业务单 fileId、路径穿越、MIME 伪装和配额攻击被拒绝且响应不泄密', async ({ request }) => {
    const publicToken = token('E2E_ATTACK_PUBLIC_TOKEN');
    const foreignFileId = token('E2E_FOREIGN_FILE_ID');
    const foreign = await request.get(api(`/public/files/${encodeURIComponent(foreignFileId)}`), { headers: bearer(publicToken) });
    expect([403, 404]).toContain(foreign.status());
    const traversal = await request.get(api('/public/files/..%2F..%2Fprivate%2Fsecret'), { headers: bearer(publicToken) });
    expect([400, 403, 404]).toContain(traversal.status());
    const fakePdf = await request.post(api('/public/files'), { headers: bearer(publicToken), multipart: { requirementKey: 'authorization-letter', file: { name: 'fake.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a pdf') } } });
    expect([400, 413, 415, 422]).toContain(fakePdf.status());
    const oversized = await request.post(api('/public/files'), { headers: bearer(publicToken), multipart: { requirementKey: 'authorization-letter', file: { name: 'large.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(20 * 1024 * 1024 + 1) } } });
    expect([400, 413]).toContain(oversized.status());
    for (const response of [foreign, traversal, fakePdf, oversized]) expect(await response.text()).not.toMatch(/authorization|cookie|password|private[\\/]|stack|Prisma/i);
  });

  test('单资料项数量和业务单总容量配额均在真实上传入口拒绝', async ({ request }) => {
    const ITEM_FILE_COUNT='ITEM_FILE_COUNT';const CASE_TOTAL_BYTES='CASE_TOTAL_BYTES';
    const itemHeaders=bearer(token('E2E_ITEM_QUOTA_PUBLIC_TOKEN'));let itemRejected=false;
    for(let index=0;index<11;index++){const response=await request.post(api('/public/files'),{headers:itemHeaders,multipart:{requirementKey:'authorization-letter',file:{name:`item-${index}.pdf`,mimeType:'application/pdf',buffer:quotaPdf(index)}}});if(index<10)expect(response.ok(),`${ITEM_FILE_COUNT} ${index}`).toBe(true);else{expect([400,413]).toContain(response.status());itemRejected=true;}}
    expect(itemRejected).toBe(true);
    const caseHeaders=bearer(token('E2E_CASE_QUOTA_PUBLIC_TOKEN'));const requirementKeys=token('E2E_CASE_QUOTA_REQUIREMENT_KEYS').split(',').map(value=>value.trim()).filter(Boolean);expect(requirementKeys.length).toBeGreaterThanOrEqual(11);let caseRejected=false;
    for(let index=0;index<requirementKeys.length;index++){const response=await request.post(api('/public/files'),{headers:caseHeaders,multipart:{requirementKey:requirementKeys[index],file:{name:`case-${index}.pdf`,mimeType:'application/pdf',buffer:Buffer.concat([quotaPdf(index+100),Buffer.from('\n% capacity-padding\n'),Buffer.alloc(19*1024*1024,0x20)])}}});if(!response.ok()){expect([400,413]).toContain(response.status());caseRejected=true;break;}}
    expect(caseRejected,CASE_TOTAL_BYTES).toBe(true);
  });
});
