import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CaseListPage } from './CaseListPage';

test('按中文搜索框筛选业务单', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><CaseListPage client={{ listCases: async () => [{ id: '1', title: '甲方授权业务', status: 'DRAFT' }, { id: '2', title: '乙方补件业务', status: 'PENDING_REVIEW' }] }} /></MemoryRouter>);
  expect(await screen.findByText('甲方授权业务')).toBeInTheDocument();
  await user.type(screen.getByRole('textbox', { name: '搜索业务单' }), '乙方');
  expect(screen.getByText('乙方补件业务')).toBeInTheDocument();
  expect(screen.queryByText('甲方授权业务')).not.toBeInTheDocument();
});
