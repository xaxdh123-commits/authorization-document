import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CaseListPage } from './CaseListPage';
test('filters case list by search text', async () => {
  const user = userEvent.setup();
  render(<CaseListPage client={{ listCases: async () => [{ id: '1', title: 'Acme permit', status: 'DRAFT' }, { id: '2', title: 'Beta renewal', status: 'PENDING_REVIEW' }] }} />);
  expect(await screen.findByText('Acme permit')).toBeInTheDocument();
  await user.type(screen.getByRole('searchbox'), 'Beta');
  expect(screen.getByText('Beta renewal')).toBeInTheDocument();
  expect(screen.queryByText('Acme permit')).not.toBeInTheDocument();
});
