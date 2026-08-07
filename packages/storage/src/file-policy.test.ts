import { describe, expect, it } from 'vitest';
import { validateFileContent, validateFileMetadata, validateMaterialCount, validateCaseBytes, effectiveFileLimits } from './file-policy.js';
describe('file policy', () => {
  it('accepts matching safe metadata', () => expect(()=>validateFileMetadata('id.pdf','application/pdf',10)).not.toThrow());
  it('rejects mismatched mime and traversal names', () => { expect(()=>validateFileMetadata('../x.pdf','application/pdf',1)).toThrow('FILE_NAME_INVALID'); expect(()=>validateFileMetadata('x.pdf','image/png',1)).toThrow('FILE_TYPE_NOT_ALLOWED'); });
  it('rejects control, reserved and device-like names', () => { for (const name of ['bad\u0000.pdf','CON.pdf','name.','name .pdf']) expect(()=>validateFileMetadata(name,'application/pdf',1)).toThrow('FILE_NAME_INVALID'); });
  it('enforces file, material and case quotas', () => { expect(()=>validateFileMetadata('x.pdf','application/pdf',20*1024*1024+1)).toThrow('FILE_SIZE_EXCEEDED'); expect(()=>validateMaterialCount(11)).toThrow('MATERIAL_COUNT_EXCEEDED'); expect(()=>validateCaseBytes(200*1024*1024+1)).toThrow('CASE_SIZE_EXCEEDED'); });
  it('accepts files only when their bytes match the declared format', () => {
    expect(() => validateFileContent(Buffer.from('%PDF-1.7\n1 0 obj\n%%EOF'), 'application/pdf')).not.toThrow();
    expect(() => validateFileContent(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0,0x49,0x45,0x4e,0x44]), 'image/png')).not.toThrow();
    expect(() => validateFileContent(Buffer.from([0xff,0xd8,0xff,0xe0,0,0,0xff,0xd9]), 'image/jpeg')).not.toThrow();
    expect(() => validateFileContent(Buffer.from('MZ%PDF-1.7'), 'application/pdf')).toThrow('FILE_CONTENT_INVALID');
    expect(() => validateFileContent(Buffer.from('<script>%PDF-1.7'), 'application/pdf')).toThrow('FILE_CONTENT_INVALID');
  });
  it('rejects dangerous double extensions', () => {
    expect(() => validateFileMetadata('invoice.exe.pdf','application/pdf',10)).toThrow('FILE_NAME_INVALID');
    expect(() => validateFileMetadata('scan.pdf.exe','application/pdf',10)).toThrow();
  });
  it('uses the stricter system and catalog limit', () => {
    expect(effectiveFileLimits({ maxFileBytes: 5, maxFiles: 2, maxCaseBytes: 50 })).toEqual({ maxFileBytes: 5, maxFiles: 2, maxCaseBytes: 50 });
    expect(effectiveFileLimits({ maxFileBytes: 30*1024*1024, maxFiles: 20, maxCaseBytes: 300*1024*1024 }).maxFileBytes).toBe(20*1024*1024);
  });
});
