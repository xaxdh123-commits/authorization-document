import { render, screen, waitFor } from '@testing-library/react'; import userEvent from '@testing-library/user-event'; import { UploadStep } from './UploadStep';
test('renders dynamic requirements and upload controls', () => { render(<UploadStep requirements={['Identity', 'Address']} />); expect(screen.getByText('Identity')).toBeInTheDocument(); expect(screen.getByLabelText('上传Identity')).toBeInTheDocument(); });

test('rolls an optimistic removal back when the server rejects it', async () => {
  const user = userEvent.setup();
  const onRemove = vi.fn().mockRejectedValue(new Error('offline'));
  render(<UploadStep requirements={[{ key: 'license', label: '营业执照', type: 'file', required: true }]} files={{ license: [{ id: 'fv1', fileVersionId: 'fv1', fileId: 'f1', name: 'license.pdf', size: 12, type: 'application/pdf', progress: 100, status: 'success' }] }} onChange={() => undefined} onRemove={onRemove} />);
  await user.click(screen.getByRole('button', { name: /license\.pdf/ }));
  expect(await screen.findByText('license.pdf')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toBeInTheDocument();
  expect(onRemove).toHaveBeenCalledWith('f1');
});

test('keeps all files when concurrent uploads finish out of order', async () => {
  const user = userEvent.setup();
  const resolvers: Array<(value: { fileId: string }) => void> = [];
  const upload = vi.fn((_key: string, _file: File) => new Promise<{ fileId: string }>((resolve) => resolvers.push(resolve)));
  render(<UploadStep requirements={['Identity']} onUpload={upload} />);

  await user.upload(screen.getByLabelText('上传Identity'), [
    new File(['a'], 'a.pdf', { type: 'application/pdf' }),
    new File(['b'], 'b.pdf', { type: 'application/pdf' }),
  ]);
  expect(await screen.findByText('a.pdf')).toBeInTheDocument();
  expect(screen.getByText('b.pdf')).toBeInTheDocument();
  resolvers[1]({ fileId: 'b-server' });
  resolvers[0]({ fileId: 'a-server' });

  await waitFor(() => expect(screen.getAllByText(/上传成功/)).toHaveLength(2));
  expect(screen.getByText('a.pdf')).toBeInTheDocument();
  expect(screen.getByText('b.pdf')).toBeInTheDocument();
});

test('waits for server removal before retrying an uploaded failed item', async () => {
  const user = userEvent.setup();
  let finishRemove: (() => void) | undefined;
  const onRemove = vi.fn(() => new Promise<void>((resolve) => { finishRemove = resolve; }));
  const onUpload = vi.fn().mockResolvedValue({ fileId: 'replacement' });
  render(<UploadStep
    requirements={['Identity']}
    files={{ 'legacy-0': [{ id: 'failed', fileId: 'server-file', name: 'failed.pdf', size: 10, type: 'application/pdf', progress: 50, status: 'error', error: '中断', source: new File(['x'], 'failed.pdf', { type: 'application/pdf' }) }] }}
    onChange={() => undefined}
    onUpload={onUpload}
    onRemove={onRemove}
  />);

  await user.click(screen.getByRole('button', { name: '重试' }));
  expect(onRemove).toHaveBeenCalledWith('server-file');
  expect(onUpload).not.toHaveBeenCalled();
  finishRemove?.();
  await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
});
