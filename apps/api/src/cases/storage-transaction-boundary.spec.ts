import { ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { CaseService } from './case.service';
import { computePdfContentDigest } from '@auth/template-engine';

const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');

function signingFixture(changeStatusOnFinal=false){
  const resourceBytes=Buffer.from('signature');const previewBytes=Buffer.from('%PDF-1.4\n%%EOF');let inTransaction=false;let transactionNumber=0;
  const ast={type:'page',children:[]};
  const resource:any={id:'resource-v1',fileId:'resource-f1',caseId:'c1',version:1,purpose:'HANDWRITTEN',originalFileVersionId:null,sha256:digest(resourceBytes),storageKey:'resource'};
  const preview:any={id:'preview-v1',fileId:'preview-f1',caseId:'c1',version:1,purpose:'PRESIGN_PDF',sha256:digest(previewBytes),storageKey:'preview',mimeType:'application/pdf'};
  const tx:any={
    businessCase:{findUnique:jest.fn(async()=>({id:'c1',status:changeStatusOnFinal&&transactionNumber===2?'PENDING_REVIEW':'CUSTOMER_EDITING',templateVersion:{id:'tv1',ast}}))},
    caseDraft:{findFirst:jest.fn(async()=>({version:1,content:{answers:{}}}))},caseSnapshot:{findFirst:jest.fn(async()=>({id:'snap',materials:[]}))},
    fileVersion:{findMany:jest.fn(async()=>[]),findFirst:jest.fn(async({where}:any)=>where.purpose?.in||where.id==='resource-v1'?resource:preview)},
    signingRecord:{updateMany:jest.fn(),aggregate:jest.fn(async()=>({_max:{version:0}})),create:jest.fn(async({data}:any)=>({id:'s1',version:1,...data}))},auditEvent:{create:jest.fn()},
  };
  const db:any={$transaction:jest.fn(async(work:any)=>{transactionNumber+=1;inTransaction=true;try{return await work(tx);}finally{inTransaction=false;}})};
  const storage:any={read:jest.fn(async(key:string)=>{expect(inTransaction).toBe(false);return Readable.from(key==='resource'?resourceBytes:previewBytes);})};
  const tokens:any={resolveForMutation:jest.fn(async()=>({caseId:'c1'}))};
  return{service:new CaseService({db} as any,{} as any,tokens,{} as any,undefined,storage),tx,storage};
}

describe('storage verification transaction boundaries',()=>{
  it('reads signing resources outside transactions and rejects a concurrent state change in final CAS',async()=>{
    const {service,tx,storage}=signingFixture(true);
    await expect(service.prepareOrdinarySigning('token',{mode:'HANDWRITTEN',signatureResourceId:'resource-v1',signatureResourceVersion:1,positions:[],declaration:true},{})).rejects.toBeInstanceOf(ConflictException);
    expect(storage.read).toHaveBeenCalledTimes(2);expect(tx.signingRecord.create).not.toHaveBeenCalled();
  });

  it('reads the formal-submit evidence PDF outside both serializable transactions',async()=>{
    const previewBytes=Buffer.from('%PDF-1.4\n%%EOF');const previewSha=digest(previewBytes);let inTransaction=false;
    const preview:any={id:'preview-v1',sha256:previewSha,storageKey:'preview',mimeType:'application/pdf'};const signing:any={id:'signing-v1',version:1,contentDigest:'',preSignPdfSha256:previewSha,preSignPdfFileVersion:preview};
    const tx:any={businessCase:{findUnique:jest.fn(async()=>({id:'c1',status:'CUSTOMER_EDITING',templateVersion:{id:'tv1',ast:{type:'page',children:[]}}})),update:jest.fn(async({data}:any)=>({status:data.status}))},caseDraft:{findFirst:jest.fn(async()=>({version:1,content:{answers:{}}}))},caseSnapshot:{findFirst:jest.fn(async()=>({id:'snap',materials:[]}))},fileVersion:{findMany:jest.fn(async()=>[])},signingRecord:{findFirst:jest.fn(async()=>signing)},caseStatusHistory:{create:jest.fn()},auditEvent:{create:jest.fn()}};
    const db:any={$transaction:jest.fn(async(work:any)=>{inTransaction=true;try{return await work(tx);}finally{inTransaction=false;}})};const storage:any={read:jest.fn(async()=>{expect(inTransaction).toBe(false);return Readable.from(previewBytes);})};const tokens:any={resolveForMutation:jest.fn(async()=>({caseId:'c1'})),consumeForMutation:jest.fn()};const service=new CaseService({db} as any,{} as any,tokens,{} as any,undefined,storage);
    const canonical=await (service as any).contentDigestTx(tx,'c1',{version:1,content:{answers:{}}});signing.contentDigest=canonical;
    await expect(service.submitPublic('token',{consent:true,declaration:true,signingVersion:1},{})).resolves.toMatchObject({completed:true});expect(storage.read).toHaveBeenCalledTimes(1);
  });

  it('rejects formal submission when case state changes during external evidence verification',async()=>{
    const bytes=Buffer.from('%PDF-1.4\n%%EOF');const sha=digest(bytes);let transactionNumber=0;let inTransaction=false;const ast:any={type:'page',children:[]};const snapshot:any={id:'snap',materials:[]};const draft:any={version:1,content:{answers:{}}};const contentDigest=computePdfContentDigest({templateVersionId:'tv1',ast,snapshot,draftVersion:1,answers:{},files:[]});const preview:any={id:'preview',sha256:sha,storageKey:'preview',mimeType:'application/pdf'};const signing:any={id:'signing',version:1,contentDigest,preSignPdfSha256:sha,preSignPdfFileVersion:preview};
    const tx:any={businessCase:{findUnique:jest.fn(async()=>({id:'c1',status:transactionNumber===1?'CUSTOMER_EDITING':'PENDING_REVIEW',templateVersion:{id:'tv1',ast}})),update:jest.fn()},caseDraft:{findFirst:jest.fn(async()=>draft)},caseSnapshot:{findFirst:jest.fn(async()=>snapshot)},fileVersion:{findMany:jest.fn(async()=>[])},signingRecord:{findFirst:jest.fn(async()=>signing)},caseStatusHistory:{create:jest.fn()},auditEvent:{create:jest.fn()}};const db:any={$transaction:jest.fn(async(work:any)=>{transactionNumber+=1;inTransaction=true;try{return await work(tx);}finally{inTransaction=false;}})};const storage:any={read:jest.fn(async()=>{expect(inTransaction).toBe(false);return Readable.from(bytes);})};const tokens:any={resolveForMutation:jest.fn(async()=>({caseId:'c1'})),consumeForMutation:jest.fn()};const service=new CaseService({db} as any,{} as any,tokens,{} as any,undefined,storage);
    await expect(service.submitPublic('token',{consent:true,declaration:true,signingVersion:1},{})).rejects.toBeInstanceOf(ConflictException);expect(storage.read).toHaveBeenCalledTimes(1);expect(tx.businessCase.update).not.toHaveBeenCalled();
  });
});
