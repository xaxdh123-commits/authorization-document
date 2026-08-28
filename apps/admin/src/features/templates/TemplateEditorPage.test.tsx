import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TemplateEditorPage } from './TemplateEditorPage';

test('文档模板使用自由拖拽布局并支持右侧样式设置', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><TemplateEditorPage /></MemoryRouter>);

  expect(screen.queryByRole('button', { name: /布局容器/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '↑' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '↓' })).not.toBeInTheDocument();

  await user.click(screen.getAllByRole('button', { name: /正文/ })[0]);
  const selected = document.querySelector('.free-block.selected') as HTMLElement;
  expect(selected).toBeTruthy();

  fireEvent.change(screen.getByLabelText('X'), { target: { value: '120' } });
  fireEvent.change(screen.getByLabelText('宽度'), { target: { value: '300' } });
  fireEvent.change(screen.getByLabelText('字号'), { target: { value: '18' } });
  await user.click(screen.getByRole('button', { name: '右' }));

  expect(selected.style.left).toBe('120px');
  expect(selected.style.width).toBe('300px');
  expect(selected.style.fontSize).toBe('18px');
  expect(selected.style.textAlign).toBe('right');

  const draggable = document.querySelector('.free-block.selected') as HTMLElement;
  fireEvent(draggable, new MouseEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }));
  act(() => {
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 40, clientY: 35, bubbles: true }));
    window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
  });

  await waitFor(() => {
    const moved = document.querySelector('.free-block.selected') as HTMLElement;
    expect(moved.style.left).toBe('150px');
    expect(moved.style.top).toBe('261px');
  });
});

test('可用变量显示中文名并以 tag 渲染，签章支持动态甲乙方印章和签名', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><TemplateEditorPage /></MemoryRouter>);

  await user.click(screen.getAllByRole('button', { name: /正文/ })[0]);
  await user.click(screen.getByRole('button', { name: /甲方名称/ }));

  expect(screen.getByDisplayValue(/{{customer.name}}/)).toBeInTheDocument();
  expect(document.querySelector('.free-block.selected .variable-tag')?.textContent).toBe('甲方名称');

  await user.click(screen.getByRole('button', { name: '签名/印章位置组件' }));
  await user.selectOptions(screen.getByLabelText('动态签署项'), 'partyBSignature');

  expect(screen.getByDisplayValue('{{sign.partyB.signature}}')).toBeInTheDocument();
  expect(document.querySelector('.free-block.selected .signature-region span')?.textContent).toBe('乙方签名');
});

test('文档模板编辑器可新增模板类型', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><TemplateEditorPage /></MemoryRouter>);

  await user.type(screen.getByLabelText('新增模板类型'), '报价单');
  await user.click(screen.getByRole('button', { name: '新增' }));

  expect(screen.getByLabelText('模板类型')).toHaveDisplayValue('报价单');
  expect(localStorage.getItem('document-template-types')).toContain('报价单');
});
