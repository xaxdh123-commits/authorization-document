import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from '../auth/AuthProvider';
import type { AuthClient } from '../api/client';

const client: AuthClient = { getSession: async () => ({ userId: 'u1', roleKey: 'admin', abilities: ['dashboard:read'] }) };

test('renders loading then capability-driven admin navigation', async () => {
  render(<AuthProvider client={client}><MemoryRouter><App /></MemoryRouter></AuthProvider>);
  expect(screen.getByText('Loading authorization…')).toBeInTheDocument();
  expect(await screen.findByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Role mappings' })).not.toBeInTheDocument();
});
