import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CaseCreatePage } from './CaseCreatePage';

test('通过类型化客户端创建业务单', async () => {
  const createCase = vi.fn(async () => ({ id: 'C1' }));
  const user = userEvent.setup();
  render(<MemoryRouter><CaseCreatePage client={{ createCase }} /></MemoryRouter>);
  await user.type(screen.getByPlaceholderText('请输入营业执照上的企业全称'), '示例品牌有限公司');
  await user.type(screen.getByPlaceholderText('请输入客户联系人'), '张三');
  for (let index = 0; index < 3; index += 1) await user.click(screen.getByRole('button', { name: '下一步' }));
  await user.click(screen.getByRole('button', { name: '确认创建并生成链接' }));
  expect(await screen.findByText('业务单创建成功')).toBeInTheDocument();
  expect(screen.getByText('C1')).toBeInTheDocument();
  expect(createCase).toHaveBeenCalled();
});
