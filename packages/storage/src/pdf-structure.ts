import { Worker } from 'node:worker_threads';
import { MAX_FILE_BYTES } from './file-policy';

export type PdfStructure={pageCount:number;firstPage:{width:number;height:number};lastPage:{width:number;height:number}};
export type PdfParserWorker={postMessage(value:unknown):void;on(event:string,listener:(value:any)=>void):PdfParserWorker;once(event:string,listener:(value:any)=>void):PdfParserWorker;terminate():Promise<number>};
export type PdfParserWorkerFactory=()=>PdfParserWorker;

const pdfLibEntry=require.resolve('pdf-lib');
const parserSource=`
const { parentPort } = require('node:worker_threads');
const { PDFDocument } = require(${JSON.stringify(pdfLibEntry)});
parentPort.once('message', async ({ bytes, minimumPages, maximumPages }) => {
  try {
    const document = await PDFDocument.load(bytes, { ignoreEncryption:false, throwOnInvalidObject:true, updateMetadata:false });
    const pages=document.getPages();
    if(pages.length<minimumPages||pages.length>maximumPages)throw new Error('page-count');
    const first=pages[0]&&pages[0].getSize();const last=pages[pages.length-1]&&pages[pages.length-1].getSize();
    if(!first||!last||![first.width,first.height,last.width,last.height].every(Number.isFinite))throw new Error('page-tree');
    parentPort.postMessage({ok:true,value:{pageCount:pages.length,firstPage:first,lastPage:last}});
  } catch(error) { parentPort.postMessage({ok:false,error:error instanceof Error?error.message:String(error)}); }
});`;
const defaultFactory:PdfParserWorkerFactory=()=>new Worker(parserSource,{eval:true}) as unknown as PdfParserWorker;
const invalid=(cause:unknown)=>Object.assign(new Error('PDF_STRUCTURE_INVALID'),{cause});

export async function validateReadablePdfWithWorker(bytes:Uint8Array,options:{minimumPages?:number;maximumPages?:number;timeoutMs?:number}={},factory:PdfParserWorkerFactory=defaultFactory):Promise<PdfStructure>{
  if(bytes.byteLength>MAX_FILE_BYTES)throw invalid(new Error('file-size'));
  const timeoutMs=options.timeoutMs??5000;const worker=factory();
  return new Promise<PdfStructure>((resolve,reject)=>{
    let settled=false;
    const finish=(result:{ok:true;value:PdfStructure}|{ok:false;error:unknown})=>{if(settled)return;settled=true;clearTimeout(timer);void worker.terminate().catch(()=>undefined);result.ok?resolve(result.value):reject(invalid(new Error(String(result.error))));};
    const timer=setTimeout(()=>{if(settled)return;settled=true;void worker.terminate().catch(()=>undefined);reject(invalid(new Error('parse-timeout')));},timeoutMs);
    worker.once('message',finish);worker.once('error',error=>finish({ok:false,error}));worker.once('exit',code=>{if(!settled&&code!==0)finish({ok:false,error:new Error(`parser-exit:${code}`)});});
    worker.postMessage({bytes:Buffer.from(bytes),minimumPages:options.minimumPages??1,maximumPages:options.maximumPages??100});
  });
}

export const validateReadablePdf=(bytes:Uint8Array,options:{minimumPages?:number;maximumPages?:number;timeoutMs?:number}={})=>validateReadablePdfWithWorker(bytes,options);
