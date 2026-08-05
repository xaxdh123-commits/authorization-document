import { workerHealth } from './health/heartbeat.js';
export function startWorker() { return { health: () => workerHealth(), stop: async () => undefined }; }
if (import.meta.url === `file://${process.argv[1]}`) { console.log(JSON.stringify(workerHealth())); }
