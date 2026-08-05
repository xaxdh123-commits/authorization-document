import path from 'node:path';

export type FileKind = 'pdf' | 'png' | 'jpeg';
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_MATERIAL_FILES = 10;
export const MAX_CASE_BYTES = 200 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {'.pdf':'application/pdf','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg'};

export function validateFileMetadata(name: string, mimeType: string, size: number): void {
  const ext = path.extname(name).toLowerCase();
  const expected = MIME_BY_EXT[ext];
  if (!expected || expected !== mimeType) throw new Error('FILE_TYPE_NOT_ALLOWED');
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_FILE_BYTES) throw new Error('FILE_SIZE_EXCEEDED');
  if (name.includes('\\') || name.includes('/') || name === '.' || name === '..' || path.basename(name) !== name) throw new Error('FILE_NAME_INVALID');
}

export function validateMaterialCount(count: number): void {
  if (!Number.isInteger(count) || count < 0 || count > MAX_MATERIAL_FILES) throw new Error('MATERIAL_COUNT_EXCEEDED');
}

export function validateCaseBytes(total: number): void {
  if (!Number.isSafeInteger(total) || total < 0 || total > MAX_CASE_BYTES) throw new Error('CASE_SIZE_EXCEEDED');
}

export function storageKeyFor(id: string, originalName: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('STORAGE_KEY_INVALID');
  const ext = path.extname(originalName).toLowerCase();
  if (!MIME_BY_EXT[ext]) throw new Error('FILE_TYPE_NOT_ALLOWED');
  return `${id}/${crypto.randomUUID()}${ext}`;
}
