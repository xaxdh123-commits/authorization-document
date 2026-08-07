import { expect, test } from '@playwright/test';

const configured = Boolean(process.env.E2E_H5_URL && process.env.TEST_DATABASE_URL?.includes('_test'));
test.describe('真实浏览器持久化矩阵', () => {
  test.skip(!configured, '真实 H5、专用 _test 数据库或浏览器端点未提供：NOT_RUN');
  test('十个中文字段和三个文件在刷新及重新进入后完整恢复', async ({ page }) => {
    await page.goto(process.env.E2E_H5_URL!);
    const fields = page.locator('input:not([type=file]), textarea');
    await expect(fields).toHaveCount(10, { timeout: 15_000 });
    for (let index = 0; index < 10; index += 1) await fields.nth(index).fill(`矩阵字段-${index + 1}`);
    const uploads = page.locator('input[type=file]');
    expect(await uploads.count()).toBeGreaterThanOrEqual(3);
    for (let index = 0; index < 3; index += 1) await uploads.nth(index).setInputFiles({ name: `matrix-${index + 1}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') });
    const url = page.url();
    await page.reload();
    await page.goto('about:blank');
    await page.goto(url);
    for (let index = 0; index < 10; index += 1) await expect(fields.nth(index)).toHaveValue(`矩阵字段-${index + 1}`);
    for (let index = 0; index < 3; index += 1) await expect(page.getByText(`matrix-${index + 1}.pdf`)).toBeVisible();
  });
});
