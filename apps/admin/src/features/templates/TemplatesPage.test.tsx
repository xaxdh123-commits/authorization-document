import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, test } from 'vitest';
import { TemplatesPage } from './TemplatesPage';

beforeEach(() => {
  localStorage.clear();
});

test('文档模板列表可新增模板类型', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><TemplatesPage /></MemoryRouter>);

  await user.type(screen.getByPlaceholderText('例如：报价单'), '报价单');
  await user.click(screen.getByRole('button', { name: '新增' }));

  expect(screen.getByLabelText('模板类型')).toHaveDisplayValue('报价单');
  expect(localStorage.getItem('document-template-types')).toContain('报价单');
});
