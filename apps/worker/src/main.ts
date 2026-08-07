import { workerHealth, writeWorkerHeartbeat } from './health/heartbeat.js';
import path from 'node:path';
import PgBoss from 'pg-boss';
import { PrismaClient, PdfTaskStatus } from '@prisma/client';
import { LocalStorage } from '@auth/storage';
import { ChromiumPdfRenderer, PuppeteerPdfEngine } from '@auth/template-engine';
import { PdfRenderer } from './pdf/pdf.renderer.js';
import { PrismaPdfJobRepository } from './pdf/pdf-job.repository.js';
import { PdfFinalizationPublisher } from './pdf/pdf-finalization.publisher.js';
import { PdfJobHandler } from './pdf/pdf-job.handler.js';
import { createWorkerRuntime } from './worker.module.js';
import { PDF_JOB_POLICY, PDF_QUEUE_NAME } from './config/pg-boss.config.js';
import { workerLog } from './safe-log.js';
export function startWorker(runtime?:{start():Promise<void>;stop():Promise<void>}) { let stopping=false;return { health: () => ({...workerHealth(),stopping}), start:async()=>runtime?.start(), stop: async () => {stopping=true;await runtime?.stop();} }; }
export function installGracefulShutdown(worker:{stop():Promise<void>}){let closing:Promise<void>|undefined;const close=()=>closing??=worker.stop();const signal=()=>void close().catch(error=>workerLog('error','PDF_WORKER_SHUTDOWN_FAILED',{error}));process.once('SIGTERM',signal);process.once('SIGINT',signal);return close;}
export function assertPdfWorkerRuntimeConfig(){if(process.env.NODE_ENV==='production'){if(!process.env.CHROMIUM_EXECUTABLE_PATH?.trim())throw new Error('CHROMIUM_EXECUTABLE_PATH_NOT_CONFIGURED');if(!process.env.CHROMIUM_EXPECTED_MAJOR?.trim())throw new Error('CHROMIUM_EXPECTED_MAJOR_NOT_CONFIGURED');}}
export function scheduleRecurringTask(task:()=>void,intervalMs:number){return setInterval(task,intervalMs);}
export async function bootstrapPdfWorker(){
  assertPdfWorkerRuntimeConfig();const engine=new PuppeteerPdfEngine();await engine.probeChromeMajor();const databaseUrl=process.env.DATABASE_URL?.trim();if(!databaseUrl)throw new Error('DATABASE_URL_NOT_CONFIGURED');
  const prisma=new PrismaClient({datasources:{db:{url:databaseUrl}}});const boss=new PgBoss(databaseUrl);const storage=new LocalStorage(path.resolve(process.env.STORAGE_LOCAL_ROOT?.trim()||'./data/private-files'));const repository=new PrismaPdfJobRepository(prisma);const renderer=new PdfRenderer(new ChromiumPdfRenderer(engine));const outbox={pending:(limit:number)=>prisma.pdfQueueOutbox.findMany({where:{publishedAt:null},orderBy:{createdAt:'asc'},take:limit,select:{id:true,taskId:true,queueName:true,generation:true,payload:true}}),markPublished:async(id:string,bossJobId:string)=>{await prisma.pdfQueueOutbox.updateMany({where:{id,publishedAt:null},data:{publishedAt:new Date(),bossJobId,lastError:null}});},recordFailure:async(id:string,reason:string)=>{await prisma.pdfQueueOutbox.updateMany({where:{id,publishedAt:null},data:{attempts:{increment:1},lastError:reason.slice(0,2000)}});}};const publisher=new PdfFinalizationPublisher(boss as any,outbox);const handler=new PdfJobHandler(repository,renderer,storage,publisher);const runtime=createWorkerRuntime(boss,handler);
  const enqueue=async()=>{await publisher.reconcile();const cutoff=new Date(Date.now()-PDF_JOB_POLICY.expireInSeconds*1000);const tasks=await prisma.pdfTask.findMany({where:{OR:[{status:PdfTaskStatus.QUEUED},{status:PdfTaskStatus.PROCESSING,startedAt:{lt:cutoff}}]}});for(const task of tasks)await boss.send(PDF_QUEUE_NAME,{jobId:task.id,caseId:task.caseId,businessVersion:task.dataSnapshotVersion},{...PDF_JOB_POLICY,singletonKey:`${task.id}:${task.queueGeneration}`});};
  try{await runtime.start();await enqueue();}catch(error){await runtime.stop().catch(()=>undefined);await prisma.$disconnect().catch(()=>undefined);throw error;}
  await writeWorkerHeartbeat();const heartbeatTimer=scheduleRecurringTask(()=>void writeWorkerHeartbeat().catch(error=>workerLog('error','WORKER_HEARTBEAT_FAILED',{error})),10_000);const timer=scheduleRecurringTask(()=>void enqueue().catch(error=>workerLog('error','PDF_ENQUEUE_RECONCILE_FAILED',{error})),5000);const worker=startWorker({start:async()=>undefined,stop:async()=>{clearInterval(timer);clearInterval(heartbeatTimer);try{await runtime.stop();}finally{await prisma.$disconnect();}}});installGracefulShutdown(worker);return worker;
}
if (import.meta.url === `file://${process.argv[1]}`) { bootstrapPdfWorker().catch(error=>{workerLog('error','PDF_WORKER_BOOTSTRAP_FAILED',{error});process.exitCode=1;}); }
