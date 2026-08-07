import { render, screen } from '@testing-library/react';
import { CaseDetailPage } from './CaseDetailPage';

test('通过类型化客户端加载中文业务单详情', async () => {
  render(<CaseDetailPage client={{ getCase: async () => ({ title: '示例客户业务单' }) }} />);
  expect(await screen.findByRole('heading', { name: '示例客户业务单' })).toBeInTheDocument();
});
