import { expect, test, type Page } from '@playwright/test';
import { inspectE2EPrerequisites } from './prerequisites';
import { optionalRequirementDefinition, workflowCaseInput, workflowPdf, workflowTemplateInput } from './workflow-fixture';

const prerequisites = inspectE2EPrerequisites(process.env);

const upstreamToken = () => {
  const value = process.env.E2E_ADMIN_TOKEN?.trim();
  if (!value) throw new Error('缺少 E2E_ADMIN_TOKEN');
  return value;
};

async function requestJson(path: string, init: RequestInit = {}) {
  const response = await fetch(new URL(path, prerequisites.apiUrl), {
    ...init,
    headers: { Authorization: `Bearer ${upstreamToken()}`, 'content-type': 'application/json', ...init.headers },
  });
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} 返回 ${response.status}`);
  return response.json();
}

async function drawHandwrittenSignature(page: Page) {
  const canvas = page.locator('canvas.signature-canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('手写签名 canvas 没有可绘制区域');
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.62);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.38, box.y + box.height * 0.34, { steps: 4 });
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.68, { steps: 4 });
  await page.mouse.move(box.x + box.width * 0.76, box.y + box.height * 0.3, { steps: 4 });
  await page.mouse.up();
  const overlay = page.locator('img.server-signature-overlay').first();
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute('src', /^data:image\/png;base64,/);
}

async function submitSignedForm(page: Page, buttonName: RegExp) {
  await page.getByRole('checkbox').check();
  const resourceUploaded = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/public/signing/resources'));
  const submitted = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/public/submit'));
  await page.getByRole('button', { name: buttonName }).click();
  const [resourceResponse, submitResponse] = await Promise.all([resourceUploaded, submitted]);
  expect(resourceResponse.ok()).toBe(true);
  expect(submitResponse.ok()).toBe(true);
}

async function startAndReachUploadStep(page: Page) {
  await page.getByRole('button', { name: '开始填写' }).click();
  await page.getByRole('textbox').first().fill('E2E 品牌联系人');
  await page.getByRole('button', { name: /保存并继续/ }).click();
  await page.getByRole('button', { name: /保存并继续/ }).click();
}

async function continueToSigningStep(page: Page) {
  await page.getByRole('button', { name: /保存并继续/ }).click();
  await expect(page.getByText('当前为普通电子签署，不等同于第三方可靠电子签名。')).toBeVisible();
}

async function expectPublicTokenClosed(token: string) {
  const response = await fetch(new URL('/public/case', prerequisites.apiUrl), {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect([404, 410]).toContain(response.status);
}

test.describe('委托生产授权全链路', () => {
test.skip(!prerequisites.ready || !process.env.E2E_H5_URL, !process.env.E2E_H5_URL ? 'E2E_H5_URL 未配置：真实浏览器流程 NOT_RUN' : prerequisites.reason ?? 'E2E 前置条件不满足');
test('模板—业务单—客户填写签署—驳回补件—最终 PDF—关闭访问全链路', async ({ page }) => {
  const suffix=Date.now();
  const requirements=await requestJson('/requirements');
  const authorization=requirements.find((item:any)=>item.key==='authorization_letter');
  const authorizationVersion=authorization?.versions?.find((version:any)=>version.status==='PUBLISHED'&&!version.disabledAt);
  if(!authorizationVersion)throw new Error('E2E requires a published authorization_letter requirement version');
  const requirement = await requestJson('/requirements', { method: 'POST', body: JSON.stringify(optionalRequirementDefinition(suffix)) });
  const requirementDraft=requirement.versions?.find((version:any)=>version.status==='DRAFT')??requirement.versions?.[0];if(!requirementDraft)throw new Error('Requirement create response did not contain a draft version');
  const requirementVersion = await requestJson(`/requirements/versions/${requirementDraft.id}/publish`, { method: 'POST' });
  const templateInput=workflowTemplateInput(authorizationVersion.id,requirementVersion.id,suffix);
  const template = await requestJson('/templates', { method: 'POST', body: JSON.stringify(templateInput) });
  const templateDraft=template.versions?.find((version:any)=>version.status==='DRAFT')??template.versions?.[0];if(!templateDraft)throw new Error('Template create response did not contain a draft version');
  const templateVersion = await requestJson(`/templates/versions/${templateDraft.id}/publish`, { method: 'POST' });
  const businessCase = await requestJson('/cases', { method: 'POST', body: JSON.stringify(workflowCaseInput(templateVersion.id,templateInput.requirementVersionIds)) });
  const submitted = await requestJson(`/cases/${businessCase.id}/submit`, { method: 'POST', body: JSON.stringify({ expiresAt: new Date(Date.now() + 3_600_000).toISOString() }) });
  expect(submitted.accessToken).toBeTruthy();

  const h5Base = process.env.E2E_H5_URL!;
  await page.goto(`${h5Base.replace(/\/$/, '')}/p/${submitted.accessToken}`);
  await startAndReachUploadStep(page);
  const upload = page.locator('input[type=file]').first();
  await upload.setInputFiles({ name: 'license.pdf', mimeType: 'application/pdf', buffer: workflowPdf(1) });
  await expect(page.locator('.file-row').filter({ hasText: 'license.pdf' })).toContainText('上传成功');
  await continueToSigningStep(page);
  await page.getByRole('button', { name: /手写签名/ }).click();
  await drawHandwrittenSignature(page);
  await submitSignedForm(page, /确认并提交审核/);
  await expect.poll(async () => (await requestJson(`/cases/${businessCase.id}`)).status).toBe('PENDING_REVIEW');

  await requestJson(`/review/${businessCase.id}/claim`, { method: 'POST' });
  await requestJson(`/review/${businessCase.id}/items/${authorizationVersion.id}`, { method: 'POST', body: JSON.stringify({ decision: 'APPROVE' }) });
  await requestJson(`/review/${businessCase.id}/items/${requirementVersion.id}`, { method: 'POST', body: JSON.stringify({ decision: 'REJECT', reason: 'E2E 补件验证' }) });
  const rejection = await requestJson(`/review/${businessCase.id}/confirm`, { method: 'POST' });
  expect(rejection.supplementToken).toBeTruthy();
  await page.goto(`${h5Base.replace(/\/$/, '')}/p/${rejection.supplementToken}`);
  await startAndReachUploadStep(page);
  await expect(page.getByText(/需要补充资料/)).toBeVisible();
  const supplementUpload = page.locator('input[type=file]').nth(1);
  await supplementUpload.setInputFiles({ name: 'license-fixed.pdf', mimeType: 'application/pdf', buffer: workflowPdf(2) });
  await expect(page.locator('.file-row').filter({ hasText: 'license-fixed.pdf' })).toContainText('上传成功');
  await continueToSigningStep(page);
  await page.getByRole('button', { name: /手写签名/ }).click();
  await drawHandwrittenSignature(page);
  await submitSignedForm(page, /重新提交审核/);
  await expect.poll(async () => (await requestJson(`/cases/${businessCase.id}`)).status).toBe('PENDING_REREVIEW');
  await requestJson(`/review/${businessCase.id}/items/${requirementVersion.id}`, { method: 'POST', body: JSON.stringify({ decision: 'APPROVE' }) });
  await requestJson(`/review/${businessCase.id}/confirm`, { method: 'POST' });

  let completedPdfStatus: { status: string; outputSha256?: string } | undefined;
  await expect.poll(async () => {
    const response = await requestJson(`/cases/${businessCase.id}/pdf/status`);
    completedPdfStatus = response;
    return response.status;
  }, { timeout: 60_000 }).toBe('SUCCEEDED');
  expect(completedPdfStatus?.outputSha256).toMatch(/^[a-f0-9]{64}$/);
  await expect.poll(async () => (await requestJson(`/cases/${businessCase.id}`)).status, { timeout: 60_000 }).toBe('COMPLETED');
  await expectPublicTokenClosed(submitted.accessToken);
  await expectPublicTokenClosed(rejection.supplementToken);
});
});
