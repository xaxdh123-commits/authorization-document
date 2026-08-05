import { render, screen } from '@testing-library/react';
import { DashboardPage } from './DashboardPage';
test('renders status cards and recent/overdue cases from client', async () => {
  render(<DashboardPage client={{ getDashboard: async () => ({ statuses: { draft: 2, pending: 3, overdue: 1 }, recent: [{ id: 'C-1', title: 'Acme' }], overdue: [{ id: 'C-2', title: 'Beta' }] }) }} />);
  expect(await screen.findByText('Draft')).toBeInTheDocument();
  expect(screen.getByText('2')).toBeInTheDocument();
  expect(screen.getByText('Acme')).toBeInTheDocument();
  expect(screen.getByText('Beta')).toBeInTheDocument();
});
