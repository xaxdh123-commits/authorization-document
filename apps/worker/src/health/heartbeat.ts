import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
export type WorkerHealth = { status: 'ok'; worker: string; queue: string; checkedAt: string };
export function workerHealth(worker='authorization-pdf-worker', queue='authorization-pdf'): WorkerHealth { return {status:'ok',worker,queue,checkedAt:new Date().toISOString()}; }
export async function writeWorkerHeartbeat(file=process.env.WORKER_HEARTBEAT_FILE ?? './data/worker-heartbeat.json') { const target=path.resolve(file);const temp=`${target}.tmp`;await mkdir(path.dirname(target),{recursive:true});await writeFile(temp,JSON.stringify(workerHealth()),'utf8');await rename(temp,target); }
