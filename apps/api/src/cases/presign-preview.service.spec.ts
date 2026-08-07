import { PresignPreviewService } from './presign-preview.service';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';

describe('PresignPreviewService', () => {
  it('renders the exact published AST, snapshot, latest draft and file metadata', async () => {
    const item={id:'c1',templateVersion:{id:'tv1',status:'PUBLISHED',ast:{type:'page',children:[]}},snapshots:[{customerName:'甲方',materials:[]}],drafts:[{version:2,content:{answers:{brand:'A'}}}],fileVersions:[{id:'fv1',fileId:'f1',version:1,sha256:'a'.repeat(64),mimeType:'application/pdf',sizeBytes:5,originalName:'证书.pdf',purpose:'MATERIAL',file:{removedAt:null}},{id:'preview',fileId:'p1',version:1,sha256:'c'.repeat(64),mimeType:'application/pdf',sizeBytes:9,originalName:'旧预览.pdf',purpose:'PRESIGN_PDF',file:{removedAt:null}}]};
    const tx:any={businessCase:{findUnique:jest.fn(async()=>item)},$queryRawUnsafe:jest.fn(async()=>[{id:'c1'}])};
    const db:any = {$transaction:jest.fn(async(work:any)=>work(tx))};
    const renderer={render:jest.fn(async(_input:any)=>Buffer.from('%PDF-1.7\n%%EOF'))};
    const service=new PresignPreviewService({db} as any,renderer as any,{read:jest.fn()} as any);
    const result=await service.render({caseId:'c1',draftVersion:2});
    expect(result.contentDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(renderer.render).toHaveBeenCalledWith(expect.objectContaining({templateVersionId:'tv1',draftVersion:2,contentDigest:result.contentDigest,answers:{brand:'A'},files:[expect.objectContaining({id:'fv1'})]}));
    expect(renderer.render.mock.calls[0][0].files).toHaveLength(1);
  });

  it('resolves an active IMAGE source key to validated inline bytes',async()=>{
    const png=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),Buffer.from('0000IEND')]);
    const item:any={id:'c1',templateVersion:{id:'tv1',status:'PUBLISHED',ast:{type:'page',children:[{type:'image',source:'brand_logo',alt:'logo'}]}},snapshots:[{materials:[]}],drafts:[{version:1,content:{answers:{}}}],fileVersions:[{id:'fv-logo',fileId:'f-logo',version:1,sha256:createHash('sha256').update(png).digest('hex'),storageKey:'private/logo.png',mimeType:'image/png',sizeBytes:png.length,originalName:'logo.png',purpose:'MATERIAL',file:{removedAt:null,requirementVersion:{requirement:{key:'brand_logo'}}}}]};
    const tx:any={businessCase:{findUnique:jest.fn(async()=>item)},$queryRawUnsafe:jest.fn()};const db:any={$transaction:jest.fn(async(work:any)=>work(tx))};const renderer={render:jest.fn(async()=>Buffer.from('%PDF-1.7\n%%EOF'))};const storage={read:jest.fn(async()=>Readable.from(png))};
    await new PresignPreviewService({db} as any,renderer as any,storage as any).render({caseId:'c1'});
    const renderInput=(renderer.render as jest.Mock).mock.calls[0][0];
    expect(renderInput.ast.children[0].source).toBe(`data:image/png;base64,${png.toString('base64')}`);
    expect(renderInput.ast.children[0].source).not.toContain('private/');
  });

  it('keeps canonical IMAGE digest independent from derived data URLs and changes it when image sha changes',async()=>{
    const pngA=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),Buffer.from('AAAAIEND')]);
    const pngB=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),Buffer.from('BBBBIEND')]);
    let sha=createHash('sha256').update(pngA).digest('hex');
    const makeItem=()=>({id:'c1',templateVersion:{id:'tv1',status:'PUBLISHED',ast:{type:'page',children:[{type:'image',source:'brand_logo',alt:'logo'}]}},snapshots:[{materials:[]}],drafts:[{version:1,content:{answers:{}}}],fileVersions:[{id:'fv-logo',fileId:'f-logo',version:1,sha256:sha,storageKey:'logo',mimeType:'image/png',sizeBytes:12,originalName:'logo.png',purpose:'MATERIAL',file:{removedAt:null,requirementVersion:{requirement:{key:'brand_logo'}}}}]});
    const tx:any={businessCase:{findUnique:jest.fn(async()=>makeItem())}};const db:any={$transaction:jest.fn(async(work:any)=>work(tx))};let bytes=pngA;
    const renderer={render:jest.fn(async()=>Buffer.from('%PDF-1.7\n%%EOF'))};const service=new PresignPreviewService({db} as any,renderer as any,{read:jest.fn(async()=>Readable.from(bytes))} as any);
    const first=await service.prepare({caseId:'c1'});await service.renderPrepared(first);
    bytes=pngB;const sameMetadata=await service.prepare({caseId:'c1'});await expect(service.renderPrepared(sameMetadata)).rejects.toThrow('摘要校验失败');
    expect(sameMetadata.contentDigest).toBe(first.contentDigest);
    sha=createHash('sha256').update(pngB).digest('hex');
    expect((await service.prepare({caseId:'c1'})).contentDigest).not.toBe(first.contentDigest);
    expect((renderer.render as jest.Mock).mock.calls[0][0].ast.children[0].source).toMatch(/^data:image\/png;base64,/);
  });
});
