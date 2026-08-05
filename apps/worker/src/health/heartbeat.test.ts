import { expect, it } from 'vitest'; import { workerHealth } from './heartbeat.js';
it('reports a stable worker health shape without secrets', () => { const h=workerHealth(); expect(h.status).toBe('ok'); expect(h.worker).toContain('worker'); expect(h).not.toHaveProperty('databaseUrl'); });
