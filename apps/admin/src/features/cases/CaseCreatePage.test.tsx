import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CaseCreatePage } from './CaseCreatePage';

test('以中文展示委托方、多物料、模板和资料选择流程', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><CaseCreatePage /></MemoryRouter>);
  expect(screen.getByText('委托方名称', { exact: false })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '下一步' }));
  expect(screen.getByRole('button', { name: /添加物料/ })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '下一步' }));
  expect(screen.getByRole('heading', { name: '授权书模板' })).toBeInTheDocument();
  expect(screen.getByText('客户所需提交资料')).toBeInTheDocument();
});
