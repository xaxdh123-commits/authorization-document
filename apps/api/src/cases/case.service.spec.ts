import { BadRequestException } from '@nestjs/common';
import { CaseService } from './case.service';
import { CASE_STATUSES } from '@auth/contracts';
import {createHash} from 'node:crypto';import {Readable} from 'node:stream';
import { computePdfContentDigest } from '@auth/template-engine';

describe('CaseService formal submission', () => {
  it('uses server declaration and verifies persisted preview bytes before recording signing',async()=>{const pdf=Buffer.from('%PDF-1.4\n%%EOF');const pdfSha=createHash('sha256').update(pdf).digest('hex');const resourceBytes=Buffer.from('signature');const resourceSha=createHash('sha256').update(resourceBytes).digest('hex');const ast={type:'page',children:[{type:'signatureSlot',slotId:'party-a',signer:'PARTY_A',page:1,x:0,y:0,width:200,height:100,required:true}]};const item={id:'c1',status:'CUSTOMER_EDITING',templateVersion:{id:'tv1',ast}};const resource={id:'resource-v1',fileId:'resource',caseId:'c1',version:1,purpose:'HANDWRITTEN',originalFileVersionId:null,sha256:resourceSha,storageKey:'private-resource'};const preview={id:'preview-v1',caseId:'c1',sha256:pdfSha,storageKey:'private-preview',mimeType:'application/pdf'};const signing={id:'s1',version:1,mode:'HANDWRITTEN'};const tx:any={businessCase:{findUnique:jest.fn(async()=>item)},caseDraft:{findFirst:jest.fn(async()=>({version:3,content:{answers:{brand:'A'}}}))},caseSnapshot:{findFirst:jest.fn(async()=>({id:'snap',version:1,materials:[],customerName:'甲方'}))},fileVersion:{findMany:jest.fn(async()=>[]),findFirst:jest.fn(async({where}:any)=>where.purpose?.in||where.id==='resource-v1'?resource:preview)},signingRecord:{updateMany:jest.fn(),aggregate:jest.fn(async()=>({_max:{version:0}})),create:jest.fn(async({data}:any)=>({...signing,...data}))},auditEvent:{create:jest.fn()}};const service=new CaseService({db:{$transaction:jest.fn(async(work:any)=>work(tx))}} as any,{} as any,{resolveForMutation:jest.fn(async()=>({caseId:'c1'}))} as any,{} as any,undefined,{read:jest.fn(async(key:string)=>Readable.from(key==='private-resource'?resourceBytes:pdf))} as any);await service.prepareOrdinarySigning('token',{mode:'HANDWRITTEN',signatureResourceId:'resource-v1',signatureResourceVersion:1,positions:[{slotId:'party-a',page:1,x:10,y:10,width:80,height:40}],declaration:true},{ip:'127.0.0.1',userAgent:'test'});expect(tx.signingRecord.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({payload:expect.objectContaining({declarationVersion:'ORDINARY_SIGNING_DECLARATION_V1',disclaimer:'当前为普通电子签署，不等同于第三方可靠电子签名。'})})}));});
  it('rejects signing when persisted signature bytes no longer match their sha256',async()=>{const pdf=Buffer.from('%PDF-1.4\n%%EOF');const pdfSha=createHash('sha256').update(pdf).digest('hex');const ast={type:'page',children:[]};const resource={id:'resource-v1',fileId:'resource',caseId:'c1',version:1,purpose:'HANDWRITTEN',sha256:createHash('sha256').update('expected').digest('hex'),storageKey:'resource-key'};const preview={id:'preview-v1',sha256:pdfSha,storageKey:'preview-key',mimeType:'application/pdf'};const tx:any={businessCase:{findUnique:jest.fn(async()=>({id:'c1',status:'CUSTOMER_EDITING',templateVersion:{id:'tv1',ast}}))},caseDraft:{findFirst:jest.fn(async()=>({version:1,content:{answers:{}}}))},caseSnapshot:{findFirst:jest.fn(async()=>({id:'snap',materials:[]}))},fileVersion:{findMany:jest.fn(async()=>[]),findFirst:jest.fn(async({where}:any)=>where.purpose?.in?resource:preview)},signingRecord:{create:jest.fn()},auditEvent:{create:jest.fn()}};const storage={read:jest.fn(async(key:string)=>Readable.from(key==='resource-key'?'tampered':pdf))};const service=new CaseService({db:{$transaction:jest.fn(async(work:any)=>work(tx))}} as any,{} as any,{resolveForMutation:jest.fn(async()=>({caseId:'c1'}))} as any,{} as any,undefined,storage as any);await expect(service.prepareOrdinarySigning('token',{mode:'HANDWRITTEN',signatureResourceId:'resource-v1',signatureResourceVersion:1,positions:[],declaration:true},{})).rejects.toThrow('签名或印章文件校验失败');expect(tx.signingRecord.create).not.toHaveBeenCalled();});
  it('rejects a processed seal when its original image bytes have been tampered with',async()=>{
    const pdf=Buffer.from('%PDF-1.4\n%%EOF');const processedBytes=Buffer.from('processed');const originalBytes=Buffer.from('original');const ast={type:'page',children:[]};
    const processed:any={id:'processed-v1',fileId:'processed',caseId:'c1',version:1,purpose:'SEAL_PROCESSED',originalFileVersionId:'original-v1',sha256:createHash('sha256').update(processedBytes).digest('hex'),storageKey:'processed-key'};const original:any={id:'original-v1',fileId:'original',caseId:'c1',version:1,purpose:'SEAL_ORIGINAL',sha256:createHash('sha256').update(originalBytes).digest('hex'),storageKey:'original-key'};const preview:any={id:'preview-v1',sha256:createHash('sha256').update(pdf).digest('hex'),storageKey:'preview-key',mimeType:'application/pdf'};
    const item:any={id:'c1',status:'CUSTOMER_EDITING',templateVersion:{id:'tv1',status:'PUBLISHED',ast},snapshots:[{materials:[]}],drafts:[{version:1,content:{answers:{}}}],fileVersions:[]};const tx:any={businessCase:{findUnique:jest.fn(async()=>item)},caseDraft:{findFirst:jest.fn(async()=>item.drafts[0])},fileVersion:{findFirst:jest.fn(async({where}:any)=>where.purpose?.in?processed:where.purpose==='SEAL_ORIGINAL'?original:preview)},signingRecord:{create:jest.fn()},auditEvent:{create:jest.fn()}};const storage:any={read:jest.fn(async(key:string)=>Readable.from(key==='processed-key'?processedBytes:key==='original-key'?'tampered-original':pdf))};const service=new CaseService({db:{$transaction:jest.fn(async(work:any)=>work(tx))}} as any,{} as any,{resolveForMutation:jest.fn(async()=>({caseId:'c1'}))} as any,{} as any,undefined,storage);
    await expect(service.prepareOrdinarySigning('token',{mode:'SEAL',signatureResourceId:'processed-v1',signatureResourceVersion:1,sealOriginalFileVersionId:'original-v1',positions:[],declaration:true},{})).rejects.toThrow('印章原图文件校验失败');expect(tx.signingRecord.create).not.toHaveBeenCalled();
  });

  it('requires both the truth declaration and consent before submission', async () => {
    const token = { resolve: jest.fn(async () => ({ caseId: 'c1', businessCase: { status: 'AWAITING_CUSTOMER' } })) } as any;
    const service = new CaseService({ db: {} } as any, {} as any, token, {} as any);
    await expect(service.submitPublic('token', { consent: true }, {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns exact 409 data for a stale draft and permits explicit force versioning', async () => {
    const tx: any = {
      businessCase: { findUnique: jest.fn(async () => ({ id: 'c1', status: 'CUSTOMER_EDITING', templateVersion:{id:'tv1',ast:{type:'page',children:[]}} })) },
      caseDraft: { findFirst: jest.fn(async () => ({ version: 2, content: { answers: {} } })), create: jest.fn(async () => undefined) },
      caseSnapshot:{findFirst:jest.fn(async()=>({id:'snap',version:1,materials:[]}))},fileVersion:{findMany:jest.fn(async()=>[])},
      answerHistory: { create: jest.fn(async () => undefined) }, signingRecord: { updateMany: jest.fn(async () => undefined) }, auditEvent: { create: jest.fn(async () => undefined) },
    };
    const prisma = { db: { $transaction: jest.fn(async (work: any) => work(tx)) } } as any;
    const token = { resolveForMutation: jest.fn(async () => ({ caseId: 'c1' })) } as any;
    const service = new CaseService(prisma, {} as any, token, {} as any);
    await expect(service.savePublicDraft('token', { version: 1, answers: {} })).rejects.toMatchObject({ response: { status: 409, code: 'DRAFT_VERSION_CONFLICT', serverVersion: 2 } });
    await expect(service.savePublicDraft('token', { basedOnVersion: 1, answers: {} }, true)).resolves.toEqual({ version: 3 });
    expect(tx.signingRecord.updateMany).not.toHaveBeenCalled();
  });

  it('does not mutate a draft when the token becomes unavailable at the transaction lock', async () => {
    const tx: any = { caseDraft: { create: jest.fn() }, answerHistory: { create: jest.fn() } };
    const token = { resolveForMutation: jest.fn(async () => { throw new Error('LINK_UNAVAILABLE'); }) } as any;
    const service = new CaseService({ db: { $transaction: jest.fn(async (work: any) => work(tx)) } } as any, {} as any, token, {} as any);
    await expect(service.savePublicDraft('revoked', { version: 0, answers: {} })).rejects.toThrow('LINK_UNAVAILABLE');
    expect(tx.caseDraft.create).not.toHaveBeenCalled();
    expect(tx.answerHistory.create).not.toHaveBeenCalled();
  });

  it.each(['disabled', 'consumed'])('does not persist a presign PDF when the link is concurrently %s', async (state) => {
    const pdf = Buffer.from('%PDF-1.4\n%%EOF');
    const tx: any = {
      fileRecord: { create: jest.fn() },
      fileVersion: { create: jest.fn() },
    };
    const tokens = {
      resolve: jest.fn(async () => ({ caseId: 'c1' })),
      resolveForMutation: jest.fn(async () => { throw new Error(`LINK_${state.toUpperCase()}`); }),
    } as any;
    const storage = {
      write: jest.fn(async () => ({ storageKey: `preview/${state}.pdf`, sha256: createHash('sha256').update(pdf).digest('hex') })),
      remove: jest.fn(async () => undefined),
    } as any;
    const preview = { render: jest.fn(async () => ({ bytes: pdf, contentDigest: 'a'.repeat(64), draftVersion: 3 })) } as any;
    const prisma = { db: {
      businessCase: { findUnique: jest.fn(async () => ({ id: 'c1', templateVersion: { ast: { type: 'page', children: [] } } })) },
      $transaction: jest.fn(async (work: any) => work(tx)),
    } } as any;
    const service = new CaseService(prisma, {} as any, tokens, {} as any, preview, storage);

    await expect(service.createPresignPreview('token')).rejects.toThrow(`LINK_${state.toUpperCase()}`);

    expect(tokens.resolveForMutation).toHaveBeenCalledWith(tx, 'token');
    expect(tx.fileRecord.create).not.toHaveBeenCalled();
    expect(tx.fileVersion.create).not.toHaveBeenCalled();
    expect(storage.remove).toHaveBeenCalledWith(`preview/${state}.pdf`);
  });

  it('reuses the canonical case+digest presign preview and cleans the losing storage object',async()=>{
    const pdf=Buffer.from('%PDF-1.4\n%%EOF');const storedSha=createHash('sha256').update(pdf).digest('hex');
    const existing={id:'preview-existing',fileId:'record-existing',caseId:'c1',sha256:'existing-sha',storageKey:'preview/existing.pdf',contentDigest:'a'.repeat(64)};
    const tx:any={businessCase:{findUnique:jest.fn(async()=>({id:'c1',templateVersion:{ast:{type:'page',children:[]}}}))},fileVersion:{findFirst:jest.fn(async()=>existing),findMany:jest.fn(),aggregate:jest.fn(),create:jest.fn()},fileRecord:{create:jest.fn(),updateMany:jest.fn()}};
    const storage={write:jest.fn(async()=>({storageKey:'preview/loser.pdf',sha256:storedSha})),remove:jest.fn(async()=>undefined)} as any;
    const tokens={resolve:jest.fn(async()=>({caseId:'c1'})),resolveForMutation:jest.fn(async()=>({caseId:'c1'}))} as any;
    const preview={render:jest.fn(async()=>({bytes:pdf,contentDigest:'a'.repeat(64),draftVersion:3}))} as any;
    const service=new CaseService({db:{$transaction:jest.fn(async(work:any)=>work(tx))}} as any,{} as any,tokens,{} as any,preview,storage);
    await expect(service.createPresignPreview('token')).resolves.toMatchObject({fileVersionId:'preview-existing',sha256:'existing-sha'});
    expect(tx.fileRecord.create).not.toHaveBeenCalled();expect(tx.fileVersion.create).not.toHaveBeenCalled();expect(storage.remove).toHaveBeenCalledWith('preview/loser.pdf');
  });

  it('concurrently creates only one canonical presign preview record',async()=>{
    const pdf=Buffer.from('%PDF-1.4\n%%EOF');const digest='b'.repeat(64);let existing:any;let sequence=0;let tail=Promise.resolve();
    const tx:any={businessCase:{findUnique:jest.fn(async()=>({id:'c1',templateVersion:{ast:{type:'page',children:[]}}}))},fileVersion:{findFirst:jest.fn(async()=>existing??null),findMany:jest.fn(async()=>[]),aggregate:jest.fn(async()=>({_sum:{sizeBytes:0}})),create:jest.fn(async({data}:any)=>(existing={id:'preview-one',...data}))},fileRecord:{create:jest.fn(async({data}:any)=>data),updateMany:jest.fn()}};
    const db:any={$transaction:jest.fn(async(work:any)=>{let release!:()=>void;const previous=tail;tail=new Promise<void>((resolve)=>{release=resolve;});await previous;try{return await work(tx);}finally{release();}})};
    const storage:any={write:jest.fn(async()=>{sequence+=1;return{storageKey:`preview/${sequence}.pdf`,sha256:createHash('sha256').update(pdf).digest('hex')};}),remove:jest.fn(async()=>undefined)};
    const tokens:any={resolve:jest.fn(async()=>({caseId:'c1'})),resolveForMutation:jest.fn(async()=>({caseId:'c1'}))};const preview:any={render:jest.fn(async()=>({bytes:pdf,contentDigest:digest,draftVersion:1}))};const service=new CaseService({db} as any,{} as any,tokens,{} as any,preview,storage);
    const results=await Promise.all([service.createPresignPreview('token'),service.createPresignPreview('token')]);
    expect(results.map((result)=>result.fileVersionId)).toEqual(['preview-one','preview-one']);expect(tx.fileVersion.create).toHaveBeenCalledTimes(1);expect(tx.fileRecord.create).toHaveBeenCalledTimes(1);expect(storage.remove).not.toHaveBeenCalled();
  });

  it('returns a verified cache before rendering or writing',async()=>{
    const pdf=Buffer.from('%PDF-1.4\n%%EOF');const digest='d'.repeat(64);const sha=createHash('sha256').update(pdf).digest('hex');
    const prepared:any={caseId:'c1',draftVersion:1,contentDigest:digest,renderInput:{templateVersionId:'tv1',ast:{type:'page',children:[]},snapshot:{},draftVersion:1},imageResources:[]};
    const cached:any={id:'cached',fileId:'cached-file',draftVersion:1,sha256:sha,storageKey:'cached.pdf'};
    const db:any={fileVersion:{findFirst:jest.fn(async()=>cached)},$transaction:jest.fn()};const preview:any={prepare:jest.fn(async()=>prepared),renderPrepared:jest.fn()};const storage:any={read:jest.fn(async()=>Readable.from(pdf)),write:jest.fn()};const tokens:any={resolve:jest.fn(async()=>({caseId:'c1'}))};
    await expect(new CaseService({db} as any,{} as any,tokens,{} as any,preview,storage).createPresignPreview('token')).resolves.toMatchObject({fileVersionId:'cached',contentDigest:digest});
    expect(preview.renderPrepared).not.toHaveBeenCalled();expect(storage.write).not.toHaveBeenCalled();
  });

  it('single-flights concurrent canonical renders and enforces the render frequency gate',async()=>{
    const pdf=Buffer.from('%PDF-1.4\n%%EOF');const sha=createHash('sha256').update(pdf).digest('hex');const renderInput:any={templateVersionId:'tv1',ast:{type:'page',children:[]},snapshot:{},draftVersion:1,answers:{},files:[]};const digest=computePdfContentDigest(renderInput);
    const prepared:any={caseId:'c1',draftVersion:1,contentDigest:digest,renderInput,imageResources:[]};
    const item:any={id:'c1',templateVersion:{id:'tv1',status:'PUBLISHED',ast:prepared.renderInput.ast},snapshots:[{}],drafts:[{version:1,content:{}}],fileVersions:[]};let created:any;
    const tx:any={businessCase:{findUnique:jest.fn(async()=>item)},fileVersion:{findFirst:jest.fn(async()=>created??null),findMany:jest.fn(async()=>[]),aggregate:jest.fn(async()=>({_sum:{sizeBytes:0}})),create:jest.fn(async({data}:any)=>(created={id:'one',...data}))},fileRecord:{create:jest.fn(async({data}:any)=>data),updateMany:jest.fn()}};
    const db:any={fileVersion:{findFirst:jest.fn(async()=>null)},$transaction:jest.fn(async(work:any)=>work(tx))};const preview:any={prepare:jest.fn(async()=>prepared),renderPrepared:jest.fn(async()=>({bytes:pdf,contentDigest:digest,draftVersion:1,renderInput:prepared.renderInput}))};const storage:any={write:jest.fn(async()=>({storageKey:'one.pdf',sha256:sha})),remove:jest.fn(async()=>undefined)};const tokens:any={resolve:jest.fn(async()=>({caseId:'c1'})),resolveForMutation:jest.fn(async()=>({caseId:'c1'})),digest:jest.fn(()=> 'token-digest')};const service=new CaseService({db} as any,{} as any,tokens,{} as any,preview,storage);
    const results=await Promise.all([service.createPresignPreview('token'),service.createPresignPreview('token')]);expect(results[0].fileVersionId).toBe('one');expect(results[1].fileVersionId).toBe('one');expect(preview.renderPrepared).toHaveBeenCalledTimes(1);expect(storage.write).toHaveBeenCalledTimes(1);
    for(let i=0;i<5;i++){const release=(service as any).acquirePreviewRender('rate-key');release();}const sixth=(service as any).acquirePreviewRender('rate-key');sixth();expect(()=> (service as any).acquirePreviewRender('rate-key')).toThrow('过于频繁');
  });

  it('invalidates a corrupt cache and counts removed signing evidence toward the 200MB presign limit',async()=>{
    const pdf=Buffer.from('%PDF-1.4\n%%EOF');const renderInput:any={templateVersionId:'tv1',ast:{type:'page',children:[]},snapshot:{},draftVersion:1,answers:{},files:[]};const digest=computePdfContentDigest(renderInput);const prepared:any={caseId:'c1',draftVersion:1,contentDigest:digest,renderInput,imageResources:[]};
    const cached:any={id:'broken',fileId:'broken-file',sha256:'0'.repeat(64),storageKey:'broken.pdf'};const item:any={id:'c1',templateVersion:{id:'tv1',status:'PUBLISHED',ast:prepared.renderInput.ast},snapshots:[{}],drafts:[{version:1,content:{}}],fileVersions:[]};
    const tx:any={businessCase:{findUnique:jest.fn(async()=>item)},fileVersion:{updateMany:jest.fn(async()=>({count:1})),findFirst:jest.fn(async()=>null),findMany:jest.fn(async()=>[]),aggregate:jest.fn(async({where}:any)=>{const filters=where.OR??[];const signingResource=filters.some((filter:any)=>filter.signingResources?.some);const sealOriginal=filters.some((filter:any)=>filter.derivedFileVersions?.some?.signingResources?.some);return{_sum:{sizeBytes:signingResource&&sealOriginal?200*1024*1024:0}};})},fileRecord:{updateMany:jest.fn(),create:jest.fn()},auditEvent:{create:jest.fn()}};
    const db:any={fileVersion:{findFirst:jest.fn(async()=>cached)},$transaction:jest.fn(async(work:any)=>work(tx))};const preview:any={prepare:jest.fn(async()=>prepared),renderPrepared:jest.fn(async()=>({bytes:pdf,contentDigest:digest,draftVersion:1,renderInput:prepared.renderInput}))};const storage:any={read:jest.fn(async()=>Readable.from('tampered')),write:jest.fn(async()=>({storageKey:'new.pdf',sha256:createHash('sha256').update(pdf).digest('hex')})),remove:jest.fn(async()=>undefined)};const tokens:any={resolve:jest.fn(async()=>({caseId:'c1'})),resolveForMutation:jest.fn(async()=>({caseId:'c1'})),digest:jest.fn(()=> 'token')};
    await expect(new CaseService({db} as any,{} as any,tokens,{} as any,preview,storage).createPresignPreview('token')).rejects.toThrow('容量超过限制');
    expect(tx.fileVersion.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:{id:'broken',cacheActive:true}}));expect(tx.fileVersion.aggregate).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({OR:expect.arrayContaining([{purpose:'FINAL_PDF'}])})}));expect(storage.remove).toHaveBeenCalledWith('new.pdf');
  });

  it('keeps at most three active previews and removes retired transient bytes',async()=>{
    const pdf=Buffer.from('%PDF-1.4\n%%EOF');const old=[1,2,3].map((number)=>({id:`old-v${number}`,fileId:`old-f${number}`,storageKey:`old/${number}.pdf`,file:{removedAt:null},createdAt:new Date(number)}));
    const tx:any={businessCase:{findUnique:jest.fn(async()=>({id:'c1',templateVersion:{ast:{type:'page',children:[]}}}))},fileVersion:{findFirst:jest.fn(async()=>null),findMany:jest.fn(async()=>old),aggregate:jest.fn(async()=>({_sum:{sizeBytes:100}})),updateMany:jest.fn(async()=>({count:1})),create:jest.fn(async({data}:any)=>({id:'new-preview',...data}))},fileRecord:{updateMany:jest.fn(async()=>({count:1})),create:jest.fn(async({data}:any)=>data)}};
    const storage:any={write:jest.fn(async()=>({storageKey:'new/preview.pdf',sha256:createHash('sha256').update(pdf).digest('hex')})),remove:jest.fn(async()=>undefined)};const tokens:any={resolve:jest.fn(async()=>({caseId:'c1'})),resolveForMutation:jest.fn(async()=>({caseId:'c1'}))};const preview:any={render:jest.fn(async()=>({bytes:pdf,contentDigest:'c'.repeat(64),draftVersion:1}))};const service=new CaseService({db:{$transaction:jest.fn(async(work:any)=>work(tx))}} as any,{} as any,tokens,{} as any,preview,storage);
    await service.createPresignPreview('token');
    expect(tx.fileRecord.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({id:{in:['old-f3']}})}));expect(storage.remove).toHaveBeenCalledWith('old/3.pdf');
  });

  it('returns a whitelisted case detail without token hashes or signing payloads', async () => {
    const db: any = { businessCase: { findUnique: jest.fn(async () => ({
      id: 'c1', caseNumber: 'WT-1', customerName: '客户', contactName: '张三', factoryDepartment: '一厂', status: 'PENDING_REVIEW', templateVersionId: 'tv1', ownerUserId: 'u1', reviewerUserId: 'r1', departmentId: 'd1', createdBy: 'u1', createdAt: new Date(), updatedAt: new Date(), closedAt: null,
      templateVersion: { id: 'tv1', version: 1, signatureMode: 'HANDWRITTEN', ast: { secret: true }, template: { id: 't1', key: 'auth', name: '授权书' } },
      snapshots: [], reviews: [], statusHistory: [],
      publicLinks: [{ id: 'l1', tokenHash: 'secret-digest', expiresAt: new Date(), disabledAt: null, consumedAt: null, completedAt: null, createdAt: new Date() }],
      signings: [{ id: 's1', version: 1, draftVersion: 1, contentDigest: 'a'.repeat(64), signer: 'PARTY_A', mode: 'HANDWRITTEN', evidenceMode: 'ORDINARY', signedAt: new Date(), valid: true, invalidatedAt: null, invalidationReason: null, payload: { ordinarySignatureDataUrl: 'data:image/png;base64,secret', ordinaryPreviewBase64: 'secret' }, resourceFileVersion: { storageKey: 'nas/private' } }],
    })) } };
    const detail = await new CaseService({ db } as any, {} as any, {} as any, {} as any).detail('c1');
    const serialized = JSON.stringify(detail);
    expect(serialized).not.toMatch(/tokenHash|secret-digest|ordinarySignatureDataUrl|ordinaryPreviewBase64|storageKey|nas\/private/);
    expect(detail.signings).toEqual([expect.objectContaining({ id: 's1', contentDigest: 'a'.repeat(64), valid: true })]);
  });

  it('requires a close reason and rolls back status when audit persistence fails', async () => {
    let persistedStatus = 'DRAFT';
    const prisma = { db: { $transaction: jest.fn(async (work: any) => {
      let pendingStatus = persistedStatus;
      const tx: any = { businessCase: { findUnique: async () => ({ id: 'c1', status: pendingStatus }), update: async ({ data }: any) => { pendingStatus = data.status; return { id: 'c1', status: pendingStatus }; } }, publicCaseLink: { updateMany: async () => undefined }, caseStatusHistory: { create: async () => undefined }, auditEvent: { create: async () => { throw new Error('audit unavailable'); } } };
      const result = await work(tx); persistedStatus = pendingStatus; return result;
    }) } } as any;
    const service = new CaseService(prisma, {} as any, {} as any, {} as any);
    await expect(service.close('c1', '', { userId: 'u1' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.close('c1', '结束业务', { userId: 'u1' })).rejects.toThrow('audit unavailable');
    expect(persistedStatus).toBe('DRAFT');
  });

  it.each(CASE_STATUSES)('enforces the close status matrix for %s', async (status) => {
    const tx: any = {
      businessCase: { findUnique: jest.fn(async () => ({ id: 'c1', status })), update: jest.fn(async ({ data }: any) => ({ id: 'c1', ...data })) },
      publicCaseLink: { updateMany: jest.fn(async () => undefined) }, caseStatusHistory: { create: jest.fn(async () => undefined) }, auditEvent: { create: jest.fn(async () => undefined) },
    };
    const service = new CaseService({ db: { $transaction: jest.fn(async (work: any) => work(tx)) } } as any, {} as any, {} as any, {} as any);
    if (status === 'COMPLETED' || status === 'CLOSED') {
      await expect(service.close('c1', '业务终止', { userId: 'u1' })).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.businessCase.update).not.toHaveBeenCalled();
    } else {
      await expect(service.close('c1', '业务终止', { userId: 'u1' })).resolves.toMatchObject({ status: 'CLOSED' });
      expect(tx.caseStatusHistory.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ fromStatus: status, toStatus: 'CLOSED', reason: '业务终止' }) }));
    }
  });

  it('redacts internal file paths and signing payloads from guarded histories', async () => {
    const db: any = {
      businessCase: { findUnique: jest.fn(async () => ({ id: 'c1' })) },
      answerHistory: { findMany: jest.fn(async () => [{ id: 'a1', draftVersion: 1, answers: { secret: 'x' }, actorType: 'CUSTOMER', createdAt: new Date() }]) },
      signingRecord: { findMany: jest.fn(async () => [{ id: 's1', version: 1, draftVersion: 1, contentDigest: 'a'.repeat(64), mode: 'HANDWRITTEN', evidenceMode: 'ORDINARY', signedAt: new Date(), valid: true, invalidatedAt: null, invalidationReason: null, payload: { ordinarySignatureDataUrl: 'secret' } }]) },
      reviewHistory: { findMany: jest.fn(async () => []) }, caseStatusHistory: { findMany: jest.fn(async () => []) },
      fileVersion: { findMany: jest.fn(async () => [
        { id: 'v1', fileId: 'f1', version: 1, originalName: '说明.pdf', mimeType: 'application/pdf', sizeBytes: 4, sha256: 'b'.repeat(64), storageKey: 'nas/public-internal/path', actorType: 'CUSTOMER', createdAt: new Date(), file: { requirementVersionId: 'r1', requirementVersion: { definition: { key: 'note', sensitive: false } } } },
        { id: 'v2', fileId: 'f2', version: 1, originalName: '法人身份证.png', mimeType: 'image/png', sizeBytes: 8, sha256: 'c'.repeat(64), storageKey: 'nas/sensitive/path', actorType: 'CUSTOMER', createdAt: new Date(), file: { requirementVersionId: 'r2', requirementVersion: { definition: { key: 'legal_representative_id', sensitive: true } } } },
      ]) },
    };
    const service = new CaseService({ db } as any, {} as any, {} as any, {} as any);
    const summary = await service.answerReviewSigningHistory('c1');
    const files = await service.fileHistory('c1');
    const sensitiveFiles = await service.sensitiveFileHistory('c1');
    expect(files.map((item: any) => item.id)).toEqual(['v1']);
    expect(sensitiveFiles.map((item: any) => item.id)).toEqual(['v2']);
    expect(JSON.stringify({ summary, files, sensitiveFiles })).not.toContain('nas/');
    expect(JSON.stringify(summary)).not.toContain('ordinarySignatureDataUrl');
    expect(JSON.stringify(summary)).not.toContain('"secret":"x"');
  });
});
