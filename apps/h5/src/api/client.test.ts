import { beforeEach, expect, test, vi } from 'vitest';
import { publicApi } from './client';

beforeEach(() => { vi.restoreAllMocks(); });

test('prepares ordinary signing then submits an explicit declaration', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({ fileVersionId:'pdf1', slots:[{slotId:'party-a',page:1,x:10,y:10,width:100,height:50,required:true}] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ fileId:'resource1', version:1 }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ signingVersion: 2 }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ completed: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  await publicApi.submit('token', { version: 3, consent: true, signature: { method: 'handwritten', resource: 'data:image/png;base64,AA==', x: 62, y: 72, scale: 1 } });
  expect(fetchMock).toHaveBeenCalledTimes(4);
  expect(fetchMock.mock.calls[0][0]).toContain('/public/signing/preview');
  expect(fetchMock.mock.calls[1][0]).toContain('/public/signing/resources');
  expect(fetchMock.mock.calls[2][0]).toContain('/public/signing/prepare');
  expect(JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body))).toMatchObject({ mode:'HANDWRITTEN',signatureResourceId:'resource1',signatureResourceVersion:1,declaration:true,positions:[{slotId:'party-a',page:1,x:34.8,y:24.4,width:60,height:30}] });
  expect(JSON.parse(String((fetchMock.mock.calls[3][1] as RequestInit).body))).toMatchObject({ declaration: true, consent: true, signingVersion: 2 });
});

test('loads current uploads and removes a persisted file version', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({ totalBytes: 12, groups: [{ requirementKey: 'license', requirementVersionId: 'rv1', label: '营业执照', files: [{ fileVersionId: 'fv1', fileId: 'f1', version: 1, name: 'license.pdf', mimeType: 'application/pdf', sizeBytes: 12 }] }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ deleted: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  const current = await publicApi.loadCurrentFiles('token');
  await publicApi.removeFile('token', 'f1');
  expect(current.groups[0].files[0]).toMatchObject({ fileVersionId: 'fv1', name: 'license.pdf' });
  expect(fetchMock.mock.calls[0][0]).toMatch(/\/public\/files$/);
  expect(fetchMock.mock.calls[1][0]).toContain('/public/files/f1');
  expect((fetchMock.mock.calls[1][1] as RequestInit).method).toBe('DELETE');
});

test('uploads signing resources with purpose and original binding', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ fileId: 'f1', fileVersionId: 'fv1', version: 2 }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  await publicApi.uploadSigningResource('token', new File(['seal'], 'seal.png', { type: 'image/png' }), 'SEAL_PROCESSED', 'original-v1');
  const form = (fetchMock.mock.calls[0][1] as RequestInit).body as FormData;
  expect(form.get('purpose')).toBe('SEAL_PROCESSED');
  expect(form.get('originalFileVersionId')).toBe('original-v1');
});
