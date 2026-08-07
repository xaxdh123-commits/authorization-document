import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from './DashboardPage';

test('通过客户端以中文渲染状态和近期业务单', async () => {
  render(<MemoryRouter><DashboardPage client={{ getDashboard: async () => ({ statuses: { draft: 2, pendingReview: 3, needsSupplement: 1 }, recent: [{ id: 'C-1', title: '示例客户' }], overdue: [] }) }} /></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: '工作台' })).toBeInTheDocument();
  expect(screen.getByText('示例客户')).toBeInTheDocument();
});
