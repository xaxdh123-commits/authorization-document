import { beforeEach, expect, test, vi } from 'vitest';
import { createApiClient } from './client';

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/admin/dashboard');
  vi.restoreAllMocks();
});

test('grants the admin frontend wildcard from upstream roles when permissions are omitted', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    code: 200,
    roles: ['admin', 'common'],
    user: {
      userId: 1,
      nickName: '若依',
      roles: [{ roleKey: 'admin', roleName: '超级管理员' }, { roleKey: 'common' }],
    },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

  const session = await createApiClient().getSession();

  expect(session.roleKey).toBe('admin');
  expect(session.abilities).toContain('*:*:*');
});
