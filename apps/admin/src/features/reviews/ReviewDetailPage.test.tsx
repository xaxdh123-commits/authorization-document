import { render, screen } from '@testing-library/react';
import { ReviewDetailPage } from './ReviewDetailPage';

test('以中文显示逐项通过、驳回补件与审核确认控件', () => {
  render(<ReviewDetailPage />);
  expect(screen.getByRole('button', { name: /资料通过/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /驳回补件/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '确认本次审核' })).toBeInTheDocument();
});
