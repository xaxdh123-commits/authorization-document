import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './AuthProvider';
import { RouteGuard } from './RouteGuard';
import type { AuthClient } from '../api/client';

const denied: AuthClient = { getSession: async () => ({ userId: 'u1', roleKey: 'staff', abilities: [] }) };

test('shows forbidden page when required capability is absent', async () => {
  render(<AuthProvider client={denied}><MemoryRouter initialEntries={['/secret']}><Routes><Route path="/secret" element={<RouteGuard ability="secret:read"><div>secret</div></RouteGuard>} /></Routes></MemoryRouter></AuthProvider>);
  expect(await screen.findByRole('heading', { name: 'Forbidden' })).toBeInTheDocument();
  expect(screen.queryByText('secret')).not.toBeInTheDocument();
});
