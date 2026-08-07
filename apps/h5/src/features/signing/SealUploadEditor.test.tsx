import { act, render,screen } from '@testing-library/react';import userEvent from '@testing-library/user-event';import { SignaturePlacementEditor } from './SignaturePlacementEditor';

test('retains original seal when cutout fails and allows retry or switching to handwriting',async()=>{const user=userEvent.setup();const cutout=vi.fn().mockRejectedValueOnce(new Error('failed')).mockResolvedValueOnce('data:image/png;base64,CUT');render(<SignaturePlacementEditor cutoutSeal={cutout}/>);await user.click(screen.getByRole('button',{name:/上传印章/}));await user.upload(screen.getByLabelText('选择印章图片'),new File(['image'],'seal.png',{type:'image/png'}));expect(await screen.findByAltText('印章原图预览')).toBeInTheDocument();expect(screen.getByText('自动抠图失败，已保留原图')).toBeInTheDocument();await user.click(screen.getByRole('button',{name:'重试抠图'}));expect(await screen.findByAltText('印章透明背景预览')).toBeInTheDocument();await user.click(screen.getByRole('button',{name:/手写签名/}));expect(screen.queryByAltText('印章透明背景预览')).not.toBeInTheDocument();});

test('uploads the original immediately and the derived seal only after explicit confirmation', async () => {
  const user = userEvent.setup();
  const upload = vi.fn().mockResolvedValueOnce({ fileId: 'original', fileVersionId: 'original-v1', version: 1 }).mockResolvedValueOnce({ fileId: 'processed', fileVersionId: 'processed-v1', version: 1 });
  const onChange = vi.fn();
  render(<SignaturePlacementEditor cutoutSeal={vi.fn().mockResolvedValue('data:image/png;base64,Q1VU')} onUploadResource={upload} onChange={onChange} />);
  await user.click(screen.getByRole('button', { name: /上传印章/ }));
  await user.upload(screen.getByLabelText('选择印章图片'), new File(['seal'], 'seal.png', { type: 'image/png' }));
  expect(upload).toHaveBeenCalledTimes(1);
  expect(upload.mock.calls[0][1]).toBe('SEAL_ORIGINAL');
  await user.click(await screen.findByRole('button', { name: '确认使用抠图结果' }));
  expect(upload).toHaveBeenCalledTimes(2);
  expect(upload.mock.calls[1].slice(1)).toEqual(['SEAL_PROCESSED', 'original-v1']);
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ resourceFileVersionId: 'processed-v1', originalFileVersionId: 'original-v1', confirmed: true }));
});

test('does not reuse the previous seal reference when a replacement upload fails', async () => {
  const user = userEvent.setup();
  const upload = vi.fn()
    .mockResolvedValueOnce({ fileId: 'first', fileVersionId: 'first-v1', version: 1 })
    .mockRejectedValueOnce(new Error('replacement failed'));
  const cutout = vi.fn().mockResolvedValue('data:image/png;base64,Q1VU');
  const onChange = vi.fn();
  render(<SignaturePlacementEditor cutoutSeal={cutout} onUploadResource={upload} onChange={onChange} />);

  await user.click(screen.getByRole('button', { name: /上传印章/ }));
  const input = screen.getByLabelText('选择印章图片');
  await user.upload(input, new File(['first'], 'first.png', { type: 'image/png' }));
  await screen.findByRole('button', { name: '确认使用抠图结果' });

  await user.upload(input, new File(['second'], 'second.png', { type: 'image/png' }));
  expect(await screen.findByText('自动抠图失败，已保留原图')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '确认使用抠图结果' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '确认使用原图' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: '重试抠图' }));
  expect(await screen.findByAltText('印章透明背景预览')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '确认使用抠图结果' })).toBeDisabled();
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
    confirmed: false,
    resourceFileVersionId: undefined,
    originalFileVersionId: undefined,
  }));
});

test('ignores a stale cutout result after a newer seal is selected', async () => {
  const user = userEvent.setup();
  let finishFirstCutout: ((value: string) => void) | undefined;
  const cutout = vi.fn(() => new Promise<string>((resolve) => { finishFirstCutout = resolve; }));
  const upload = vi.fn()
    .mockResolvedValueOnce({ fileId: 'first', fileVersionId: 'first-v1', version: 1 })
    .mockRejectedValueOnce(new Error('replacement failed'));
  render(<SignaturePlacementEditor cutoutSeal={cutout} onUploadResource={upload} />);
  await user.click(screen.getByRole('button', { name: /上传印章/ }));
  const input = screen.getByLabelText('选择印章图片');
  await user.upload(input, new File(['first'], 'first.png', { type: 'image/png' }));
  await vi.waitFor(() => expect(cutout).toHaveBeenCalledTimes(1));
  await user.upload(input, new File(['second'], 'second.png', { type: 'image/png' }));
  await screen.findByText('自动抠图失败，已保留原图');

  await act(async () => { finishFirstCutout?.('data:image/png;base64,T0xE'); });

  expect(screen.queryByAltText('印章透明背景预览')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '确认使用抠图结果' })).not.toBeInTheDocument();
});
