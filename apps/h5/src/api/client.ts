import type { DraftAnswers, PublicCaseModel } from '../features/case-wizard/model';
import type { PublicCurrentFilesResponse, SigningResourcePurpose } from '@auth/contracts';
import { mapPlacementToSlots, type SignaturePlacement, type SignatureSlot } from '../features/signing/SignaturePlacementEditor';

export type CurrentFileDto = { fileId: string; fileVersionId: string; version: number; name: string; mimeType: string; sizeBytes: number; createdAt?: string; downloadUrl?: string };
export type CurrentFilesResponse = PublicCurrentFilesResponse;
export type SigningResourceRef = { fileId: string; fileVersionId: string; version: number };

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:3000' : '/api')).replace(/\/$/, '');

export class PublicApiError extends Error {
  constructor(public readonly status: number) { super('公开链接暂不可用'); }
}

export function getPublicToken(): string | undefined {
  const query = new URLSearchParams(window.location.search);
  const segments = window.location.pathname.split('/').filter(Boolean);
  const marker = segments.findIndex((part) => ['p', 'public', 'case'].includes(part));
  return (marker >= 0 ? segments[marker + 1] : undefined) ?? query.get('token') ?? query.get('access_token') ?? undefined;
}

export function isDemoRequest(token?: string): boolean {
  return new URLSearchParams(window.location.search).get('demo') === '1' || token?.startsWith('demo') === true;
}

async function request<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  try {
    const response = await fetch(`${apiBase}${path}`, { ...init, headers });
    if (!response.ok) throw new PublicApiError(response.status);
    return await response.json() as T;
  } catch (error) {
    if (error instanceof PublicApiError) throw error;
    throw new PublicApiError(0);
  }
}

export const publicApi = {
  loadCase: (token: string) => request<PublicCaseModel>('/public/case', token),
  saveDraft: (token: string, version: number, answers: DraftAnswers) => request<{ version: number }>('/public/draft', token, { method: 'PUT', body: JSON.stringify({ version, answers }) }),
  forceDraft: (token: string, version: number, answers: DraftAnswers) => request<{ version: number }>('/public/draft/versions', token, { method: 'POST', body: JSON.stringify({ basedOnVersion: version, answers }) }),
  preparePreview: async (token:string) => { const metadata=await request<{fileVersionId:string;contentDigest:string;sha256:string;slots:Array<{slotId:string;page:number;x:number;y:number;width:number;height:number;required:boolean}>}>('/public/signing/preview',token,{method:'POST'});const response=await fetch(`${apiBase}/public/files/${metadata.fileVersionId}`,{headers:{Authorization:`Bearer ${token}`}});if(!response.ok)throw new PublicApiError(response.status);return {...metadata,previewUrl:URL.createObjectURL(await response.blob())}; },
  loadCurrentFiles: (token: string) => request<CurrentFilesResponse>('/public/files', token),
  removeFile: (token: string, fileId: string) => request<{ removed: true }>(`/public/files/${encodeURIComponent(fileId)}`, token, { method: 'DELETE' }),
  uploadSigningResource: async (token: string, file: File, purpose: SigningResourcePurpose, originalFileVersionId?: string) => {
    const form = new FormData(); form.append('file', file); form.append('purpose', purpose);
    if (originalFileVersionId) form.append('originalFileVersionId', originalFileVersionId);
    const result = await request<{ fileId: string; fileVersionId?: string; version: number }>('/public/signing/resources', token, { method: 'POST', body: form });
    return { ...result, fileVersionId: result.fileVersionId ?? result.fileId };
  },
  submit: async (token: string, payload: { signature: SignaturePlacement; preview?: { fileVersionId?: string; slots: SignatureSlot[] }; [key: string]: unknown }) => {
    const preview = payload.preview ?? await request<{ fileVersionId:string; slots:SignatureSlot[] }>('/public/signing/preview', token, { method: 'POST' });
    const signature = payload.signature;
    let resource: SigningResourceRef;
    if (signature.resourceFileVersionId && signature.resourceFileId && signature.resourceVersion) {
      resource = { fileId: signature.resourceFileId, fileVersionId: signature.resourceFileVersionId, version: signature.resourceVersion };
    } else {
      const image = dataUrlFile(signature.resource ?? '', signature.method === 'handwritten' ? '手写签名.png' : '印章图片.png');
      resource = await publicApi.uploadSigningResource(token, image, signature.method === 'handwritten' ? 'HANDWRITTEN' : 'SEAL_ORIGINAL');
    }
    const command: Record<string, unknown> = { mode: signature.method === 'handwritten' ? 'HANDWRITTEN' : 'SEAL', signatureResourceId: resource.fileVersionId, signatureResourceVersion: resource.version, positions: mapPlacementToSlots(signature, preview.slots), declaration: true };
    if (signature.method === 'seal' && signature.originalFileVersionId) command.sealOriginalFileVersionId = signature.originalFileVersionId;
    const prepared = await request<{ signingVersion: number }>('/public/signing/prepare', token, { method: 'POST', body: JSON.stringify(command) });
    const { preview: _preview, signature: _signature, ...submission } = payload;
    return request<{ completed: true }>('/public/submit', token, { method: 'POST', body: JSON.stringify({ ...submission, declaration: true, signingVersion: prepared.signingVersion }) });
  },
  upload: async (token: string, requirementKey: string, file: File, onProgress: (percent: number) => void) => {
    const form = new FormData(); form.append('requirementKey', requirementKey); form.append('file', file);
    onProgress(15);
    const result = await request<{ fileId: string }>('/public/files', token, { method: 'POST', body: form });
    onProgress(100); return result;
  },
};

function dataUrlFile(value:string,name:string):File { const match=/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(value);if(!match)throw new PublicApiError(400);const bytes=Uint8Array.from(atob(match[2]),(character)=>character.charCodeAt(0));return new File([bytes],name,{type:match[1]}); }
