export type WorkerHealth = { status: 'ok'; worker: string; queue: string; checkedAt: string };
export function workerHealth(worker='authorization-pdf-worker', queue='authorization-pdf'): WorkerHealth { return {status:'ok',worker,queue,checkedAt:new Date().toISOString()}; }
