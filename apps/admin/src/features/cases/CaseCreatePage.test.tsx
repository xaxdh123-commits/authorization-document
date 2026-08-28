import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CaseCreatePage } from './CaseCreatePage';

test('以 tabs 展示授权书和采购合同业务单创建', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><CaseCreatePage /></MemoryRouter>);
  expect(screen.getByRole('tab', { name: /授权书业务单/ })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByText('委托方名称', { exact: false })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /添加物料/ })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '授权书模板' })).toBeInTheDocument();
  expect(screen.getByText('客户所需提交资料')).toBeInTheDocument();
  await user.click(screen.getByRole('tab', { name: /采购合同业务单/ }));
  expect(screen.getByText('采购方名称', { exact: false })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '采购合同模板' })).toBeInTheDocument();
});
