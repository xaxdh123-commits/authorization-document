import path from 'node:path';

export type FileKind = 'pdf' | 'png' | 'jpeg';
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_MATERIAL_FILES = 10;
export const MAX_CASE_BYTES = 200 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {'.pdf':'application/pdf','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg'};
const DANGEROUS_EXTENSION = /\.(?:exe|com|bat|cmd|msi|scr|ps1|vbs|js|jar|dll|sh)(?:\.|$)/i;

export type FileLimits = { maxFileBytes: number; maxFiles: number; maxCaseBytes: number };
export const SYSTEM_FILE_LIMITS: FileLimits = { maxFileBytes: MAX_FILE_BYTES, maxFiles: MAX_MATERIAL_FILES, maxCaseBytes: MAX_CASE_BYTES };

export function effectiveFileLimits(catalog: Partial<FileLimits> = {}): FileLimits {
  const positive = (value: number | undefined, fallback: number) => Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : fallback;
  return {
    maxFileBytes: Math.min(MAX_FILE_BYTES, positive(catalog.maxFileBytes, MAX_FILE_BYTES)),
    maxFiles: Math.min(MAX_MATERIAL_FILES, positive(catalog.maxFiles, MAX_MATERIAL_FILES)),
    maxCaseBytes: Math.min(MAX_CASE_BYTES, positive(catalog.maxCaseBytes, MAX_CASE_BYTES)),
  };
}

export function validateFileMetadata(name: string, mimeType: string, size: number): void {
  if (/[\u0000-\u001f\u007f]/.test(name) || /[<>:"|?*]/.test(name) || /[. ]$/.test(name) || /\s/.test(name)) throw new Error('FILE_NAME_INVALID');
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
  if (reserved.test(name)) throw new Error('FILE_NAME_INVALID');
  if (DANGEROUS_EXTENSION.test(name)) throw new Error('FILE_NAME_INVALID');
  const ext = path.extname(name).toLowerCase();
  const expected = MIME_BY_EXT[ext];
  if (!expected || expected !== mimeType) throw new Error('FILE_TYPE_NOT_ALLOWED');
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_FILE_BYTES) throw new Error('FILE_SIZE_EXCEEDED');
  if (name.includes('\\') || name.includes('/') || name === '.' || name === '..' || path.basename(name) !== name) throw new Error('FILE_NAME_INVALID');
}

export function validateFileContent(bytes: Uint8Array, mimeType: string): void {
  const buffer = Buffer.from(bytes);
  const isPdf = buffer.length >= 8 && buffer.subarray(0, 5).equals(Buffer.from('%PDF-')) && buffer.includes(Buffer.from('%%EOF'));
  const pngSignature = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  const isPng = buffer.length >= 16 && buffer.subarray(0, 8).equals(pngSignature) && buffer.includes(Buffer.from('IEND'));
  const isJpeg = buffer.length >= 6 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff && buffer.at(-2) === 0xff && buffer.at(-1) === 0xd9;
  const valid = mimeType === 'application/pdf' ? isPdf : mimeType === 'image/png' ? isPng : mimeType === 'image/jpeg' ? isJpeg : false;
  if (!valid) throw new Error('FILE_CONTENT_INVALID');
  // A valid supported file must start at byte zero; executable/archive/script prefixes are polyglots.
  const prefix = buffer.subarray(0, Math.min(512, buffer.length)).toString('latin1').toLowerCase();
  if (prefix.startsWith('mz') || prefix.startsWith('pk\u0003\u0004') || prefix.startsWith('<script') || prefix.startsWith('#!')) throw new Error('FILE_CONTENT_INVALID');
}

export function validateMaterialCount(count: number): void {
  if (!Number.isInteger(count) || count < 0 || count > MAX_MATERIAL_FILES) throw new Error('MATERIAL_COUNT_EXCEEDED');
}

export function validateCaseBytes(total: number): void {
  if (!Number.isSafeInteger(total) || total < 0 || total > MAX_CASE_BYTES) throw new Error('CASE_SIZE_EXCEEDED');
}

export function storageKeyFor(id: string, originalName: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('STORAGE_KEY_INVALID');
  validateFileMetadata(originalName, MIME_BY_EXT[path.extname(originalName).toLowerCase()] ?? '', 0);
  const ext = path.extname(originalName).toLowerCase();
  if (!MIME_BY_EXT[ext]) throw new Error('FILE_TYPE_NOT_ALLOWED');
  return `${id}/${crypto.randomUUID()}${ext}`;
}
export function contentAddressedStorageKey(sha256:string,extension:string):string{if(!/^[a-f0-9]{64}$/.test(sha256)||!/^\.(?:pdf|png|jpe?g)$/.test(extension))throw new Error('CONTENT_ADDRESS_INVALID');return`sha256/${sha256.slice(0,2)}/${sha256}${extension}`;}
export function isContentAddressedStorageKey(key:string,sha256:string,extension='.pdf'):boolean{try{return key.replaceAll('\\','/')===contentAddressedStorageKey(sha256,extension);}catch{return false;}}
