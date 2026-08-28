import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from '../auth/AuthProvider';
import type { AuthClient } from '../api/client';

const client: AuthClient = { getSession: async () => ({ userId: 'u1', roleKey: 'admin', abilities: ['CASE_READ'] }) };

test('以中文显示鉴权状态，并按能力渲染后台导航', async () => {
  render(<AuthProvider client={client}><MemoryRouter><App /></MemoryRouter></AuthProvider>);
  expect(screen.getByText('正在验证访问权限')).toBeInTheDocument();
  expect(await screen.findByRole('link', { name: /工作台/ })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /角色权限/ })).not.toBeInTheDocument();
});
