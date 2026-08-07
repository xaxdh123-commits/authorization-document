import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReviewQueuePage } from './ReviewQueuePage';

test('以中文渲染审核队列和操作入口', async () => {
  render(<MemoryRouter><ReviewQueuePage client={{ listReviews: async () => [{ id: 'R1', caseTitle: '示例委托方', status: 'PENDING_REVIEW' }] }} /></MemoryRouter>);
  expect(await screen.findByText('示例委托方')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '开始审核' })).toBeInTheDocument();
});
