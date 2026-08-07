import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CaseWizardPage } from './CaseWizardPage';
import { createDemoCase } from './model';

test('walks through four wizard steps', async () => {
  const user = userEvent.setup();
  const model = { ...createDemoCase('demo'), requirements: [] };
  render(<CaseWizardPage model={model} initialAnswers={{ contactName: '张三', contactPhone: '13800138000' }} />);
  await user.click(screen.getByRole('button', { name: '开始填写' }));
  expect(screen.getByRole('heading', { name: '基本信息' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '保存并继续' }));
  expect(screen.getByRole('heading', { name: '委托生产物料' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '保存并继续' }));
  expect(screen.getByRole('heading', { name: '资料上传' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '保存并继续' }));
  expect(screen.getByRole('heading', { name: '签署确认' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '确认并提交审核' })).toBeInTheDocument();
});

test('restores persisted uploads when the wizard starts', async () => {
  const model = { ...createDemoCase('demo'), requirements: [{ key: 'license', label: '营业执照', type: 'file' as const, required: true }] };
  const loadCurrentFiles = vi.fn().mockResolvedValue({ totalBytes: 24, groups: [{ requirementKey: 'license', requirementVersionId: 'rv1', label: '营业执照', files: [{ fileVersionId: 'fv1', fileId: 'f1', version: 1, name: 'saved.pdf', mimeType: 'application/pdf', sizeBytes: 24 }] }] });
  render(<CaseWizardPage model={model} initialStep={2} initialAnswers={{ contactName: '张三', contactPhone: '13800138000' }} onLoadCurrentFiles={loadCurrentFiles} />);
  expect(await screen.findByText('saved.pdf')).toBeInTheDocument();
  expect(loadCurrentFiles).toHaveBeenCalledTimes(1);
});

test('shows the approved ordinary signing disclaimer verbatim', () => {
  const model = { ...createDemoCase('demo'), requirements: [] };
  render(<CaseWizardPage model={model} initialStep={3} initialAnswers={{ contactName: '张三', contactPhone: '13800138000' }} />);
  expect(screen.getByText(/^当前为普通电子签署，不等同于第三方可靠电子签名。$/)).toBeInTheDocument();
});

test('revokes replaced and unmounted preview blob URLs', async () => {
  const user = userEvent.setup();
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  const model = { ...createDemoCase('demo'), requirements: [] };
  const prepare = vi.fn()
    .mockResolvedValueOnce({ previewUrl: 'blob:first', contentDigest: 'one', sha256: 'one', slots: [] })
    .mockResolvedValueOnce({ previewUrl: 'blob:second', contentDigest: 'two', sha256: 'two', slots: [] });
  const { unmount } = render(<CaseWizardPage model={model} initialStep={2} initialAnswers={{ contactName: '张三', contactPhone: '13800138000' }} onPreparePreview={prepare} />);

  await user.click(screen.getByRole('button', { name: '保存并继续' }));
  await screen.findByText('one');
  await user.click(screen.getByRole('button', { name: '上一步' }));
  await user.click(screen.getByRole('button', { name: '保存并继续' }));
  await screen.findByText('two');
  expect(revoke).toHaveBeenCalledWith('blob:first');
  unmount();
  expect(revoke).toHaveBeenCalledWith('blob:second');
  revoke.mockRestore();
});

test('revokes a preview that arrives after the wizard unmounts', async () => {
  const user = userEvent.setup();
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  let resolvePreview: ((value: { previewUrl: string; contentDigest: string; sha256: string; slots: [] }) => void) | undefined;
  const prepare = vi.fn(() => new Promise<{ previewUrl: string; contentDigest: string; sha256: string; slots: [] }>((resolve) => { resolvePreview = resolve; }));
  const model = { ...createDemoCase('demo'), requirements: [] };
  const { unmount } = render(<CaseWizardPage model={model} initialStep={2} initialAnswers={{ contactName: '张三', contactPhone: '13800138000' }} onPreparePreview={prepare} />);
  await user.click(screen.getByRole('button', { name: '保存并继续' }));
  await vi.waitFor(() => expect(prepare).toHaveBeenCalled());
  unmount();
  resolvePreview?.({ previewUrl: 'blob:late', contentDigest: 'late', sha256: 'late', slots: [] });
  await vi.waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:late'));
});
