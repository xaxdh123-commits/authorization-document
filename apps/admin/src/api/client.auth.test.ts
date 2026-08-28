import { beforeEach, expect, test, vi } from 'vitest';
import { createApiClient } from './client';

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/admin/dashboard');
  vi.restoreAllMocks();
});

test('uses mapped permissions returned by getInfo', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    code: 200,
    permissions: ['CASE_READ', 'ROLE_MAPPING_MANAGE'],
    user: {
      userId: 1,
      nickName: '若依',
      roles: [{ roleKey: 'admin', roleName: '超级管理员' }, { roleKey: 'common' }],
    },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

  const session = await createApiClient().getSession();

  expect(session.roleKey).toBe('admin');
  expect(session.roleName).toBe('超级管理员');
  expect(session.abilities).toEqual(['CASE_READ', 'ROLE_MAPPING_MANAGE']);
});

test('falls back to known role name when getInfo only returns roleKey', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    code: 200,
    permissions: ['CASE_READ'],
    user: { userId: 1, nickName: '若依', roles: [{ roleKey: 'admin' }] },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

  const session = await createApiClient().getSession();

  expect(session.roleKey).toBe('admin');
  expect(session.roleName).toBe('超级管理员');
});

test('does not show pages for third-party roles without mapped permissions', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    code: 200,
    roles: ['market'],
    user: {
      userId: 2,
      nickName: '业务用户',
      roles: [{ roleKey: 'market', roleName: '分销管理' }],
    },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

  const session = await createApiClient().getSession();

  expect(session.roleKey).toBe('market');
  expect(session.abilities).toEqual([]);
});
