import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PassThrough, Readable } from 'node:stream';
import { REQUIRED_ABILITY } from '../auth/require-ability.decorator';
import { GUARDS_METADATA, INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { FilesController, PublicFilesController } from './files.controller';
import { PublicUploadGateGuard, PublicUploadGateInterceptor } from './public-upload-gate';

function response() {
  const target = new PassThrough() as PassThrough & { setHeader: jest.Mock };
  target.setHeader = jest.fn();
  target.resume();
  return target as any;
}

describe('FilesController downloads', () => {
  it('returns 403 from the ordinary endpoint for sensitive files', async () => {
    const files = { get: jest.fn().mockResolvedValue({ sensitive: true }) };
    await expect(new FilesController(files as any).ordinary('case-1', 'version-1', response())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('sets safe attachment and anti-sniff headers for downloads', async () => {
    const stream = Readable.from('content');
    const files = { get: jest.fn().mockResolvedValue({ sensitive: false, version: { id: 'v1', mimeType: 'application/pdf', originalName: '授权书.pdf' }, stream, audit: { caseId: 'case-1', actorType: 'INTERNAL' } }), authorizeDownload: jest.fn(), recordDownload: jest.fn() };
    const target = response();
    await new FilesController(files as any).ordinary('case-1', 'version-1', target);
    expect(target.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(target.setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining("filename*=UTF-8''"));
    expect(target.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(files.authorizeDownload).toHaveBeenCalledWith(expect.objectContaining({ fileVersionId: 'v1' }));
    expect(files.authorizeDownload.mock.invocationCallOrder[0]).toBeLessThan(files.recordDownload.mock.invocationCallOrder[0]);
    expect(files.recordDownload).toHaveBeenCalledWith(expect.objectContaining({ fileVersionId: 'v1', result: 'SUCCESS' }));
  });

  it('keeps separate abilities on ordinary and sensitive routes', () => {
    expect(Reflect.getMetadata(REQUIRED_ABILITY, FilesController.prototype.ordinary)).toBe('FILE_READ');
    expect(Reflect.getMetadata(REQUIRED_ABILITY, FilesController.prototype.sensitive)).toBe('SENSITIVE_FILE_READ');
  });

  it('maps a missing storage object stream error to a handled 404',async()=>{
    const missing=new Readable({read(){this.destroy(Object.assign(new Error('missing'),{code:'ENOENT'}));}});
    const files={get:jest.fn(async()=>({sensitive:false,version:{id:'v1',mimeType:'application/pdf',originalName:'proof.pdf'},stream:missing,audit:{caseId:'case-1',actorType:'INTERNAL'}})),authorizeDownload:jest.fn(),recordDownload:jest.fn()};
    await expect(new FilesController(files as any).ordinary('case-1','version-1',response())).rejects.toBeInstanceOf(NotFoundException);
    expect(files.recordDownload).toHaveBeenCalledWith(expect.objectContaining({ fileVersionId:'v1',result:'FAILURE' }));
    expect(files.authorizeDownload).toHaveBeenCalledWith(expect.objectContaining({ fileVersionId:'v1' }));
  });

  it('does not send headers or bytes when durable download authorization audit fails',async()=>{
    const stream=Readable.from('secret');const target=response();
    const files={get:jest.fn(async()=>({sensitive:false,version:{id:'v1',mimeType:'application/pdf',originalName:'proof.pdf'},stream,audit:{caseId:'case-1',actorType:'INTERNAL'}})),authorizeDownload:jest.fn().mockRejectedValue(new Error('audit unavailable')),recordDownload:jest.fn()};
    await expect(new FilesController(files as any).ordinary('case-1','v1',target)).rejects.toThrow('audit unavailable');
    expect(target.setHeader).not.toHaveBeenCalled();expect(files.recordDownload).not.toHaveBeenCalled();
  });

  it('keeps the authorized evidence and emits a structured error if failure outcome persistence is unavailable',async()=>{
    const missing=new Readable({read(){this.destroy(Object.assign(new Error('missing'),{code:'ENOENT'}));}});const write=jest.spyOn(process.stderr,'write').mockImplementation(()=>true);
    const files={get:jest.fn(async()=>({sensitive:false,version:{id:'v1',mimeType:'application/pdf',originalName:'proof.pdf'},stream:missing,audit:{caseId:'case-1',actorType:'INTERNAL'}})),authorizeDownload:jest.fn(),recordDownload:jest.fn().mockRejectedValue(new Error('audit unavailable'))};
    try{await expect(new FilesController(files as any).ordinary('case-1','v1',response())).rejects.toBeInstanceOf(NotFoundException);expect(files.authorizeDownload).toHaveBeenCalledTimes(1);expect(write).toHaveBeenCalledWith(expect.stringContaining('DOWNLOAD_RESULT_AUDIT_FAILED'));}finally{write.mockRestore();}
  });
});

describe('PublicFilesController token routes', () => {
  it('runs the token gate guard before the upload interceptor can buffer multipart bytes',()=>{
    expect(Reflect.getMetadata(GUARDS_METADATA,PublicFilesController.prototype.upload)).toContain(PublicUploadGateGuard);
    expect(Reflect.getMetadata(INTERCEPTORS_METADATA,PublicFilesController.prototype.upload)?.[0]).toBe(PublicUploadGateInterceptor);
    expect(Reflect.getMetadata(GUARDS_METADATA,PublicFilesController.prototype.uploadSigning)).toContain(PublicUploadGateGuard);
  });
  it('delegates list, remove and download with the bearer token', async () => {
    const stream = Readable.from('x');
    const files = {
      listPublic: jest.fn().mockResolvedValue({ groups: [], totalBytes: 0 }),
      removePublic: jest.fn().mockResolvedValue({ removed: true }),
      getPublic: jest.fn().mockResolvedValue({ version: { mimeType: 'application/pdf', originalName: 'proof.pdf' }, stream }),
    };
    const controller = new PublicFilesController(files as any);
    await expect(controller.list('Bearer token-a')).resolves.toEqual({ groups: [], totalBytes: 0 });
    await expect(controller.remove('Bearer token-a', 'file-1')).resolves.toEqual({ removed: true });
    expect(files.listPublic).toHaveBeenCalledWith('token-a');
    expect(files.removePublic).toHaveBeenCalledWith('token-a', 'file-1');
  });
});
