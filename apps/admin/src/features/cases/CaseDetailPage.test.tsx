import { render, screen } from '@testing-library/react';
import { CaseDetailPage } from './CaseDetailPage';

test('以中文渲染业务单详情页签', () => {
  render(<CaseDetailPage />);
  for (const name of ['基本信息', '物料明细', '客户问卷', '资料文件']) expect(screen.getByRole('tab', { name })).toBeInTheDocument();
});
