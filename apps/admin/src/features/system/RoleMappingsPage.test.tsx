import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { RoleMappingsPage } from './RoleMappingsPage';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

test('点击保存映射时提交当前角色能力配置', async () => {
  const user = userEvent.setup();
  localStorage.setItem('access_token', 'admin-token');
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify({ roleKey: 'admin' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetch);

  render(<RoleMappingsPage />);

  await user.click(screen.getByRole('checkbox', { name: /审计日志/ }));
  await user.click(screen.getByRole('button', { name: '保存映射' }));

  await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/roles/mappings/admin'), expect.objectContaining({
    method: 'PUT',
    body: expect.any(String),
  })));
  expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toMatchObject({
    enabled: true,
    dataScope: 'ALL',
  });
  expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).abilities).not.toContain('AUDIT_READ_ALL');
  expect(await screen.findByText('映射已保存')).toBeInTheDocument();
});
