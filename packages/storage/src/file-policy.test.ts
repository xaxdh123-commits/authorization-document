import { describe, expect, it } from 'vitest';
import { validateFileMetadata, validateMaterialCount, validateCaseBytes } from './file-policy.js';
describe('file policy', () => {
  it('accepts matching safe metadata', () => expect(()=>validateFileMetadata('id.pdf','application/pdf',10)).not.toThrow());
  it('rejects mismatched mime and traversal names', () => { expect(()=>validateFileMetadata('../x.pdf','application/pdf',1)).toThrow('FILE_NAME_INVALID'); expect(()=>validateFileMetadata('x.pdf','image/png',1)).toThrow('FILE_TYPE_NOT_ALLOWED'); });
  it('enforces file, material and case quotas', () => { expect(()=>validateFileMetadata('x.pdf','application/pdf',20*1024*1024+1)).toThrow('FILE_SIZE_EXCEEDED'); expect(()=>validateMaterialCount(11)).toThrow('MATERIAL_COUNT_EXCEEDED'); expect(()=>validateCaseBytes(200*1024*1024+1)).toThrow('CASE_SIZE_EXCEEDED'); });
});
