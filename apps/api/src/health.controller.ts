import { Controller, Get, Inject, Optional, ServiceUnavailableException } from '@nestjs/common';
import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { PrismaService } from './database/prisma.service';

type HealthDeps = { queryDatabase(): Promise<unknown>; accessPath(path: string, mode?: number): Promise<unknown>; statPath(path: string): Promise<{ mtimeMs: number }> };
type HealthEnv = Partial<Record<'STORAGE_LOCAL_ROOT' | 'WORKER_HEARTBEAT_FILE' | 'CHROMIUM_EXECUTABLE_PATH' | 'HEALTH_CACHE_TTL_MS' | 'HEALTH_PROBE_TIMEOUT_MS', string>>;
type CheckStatus = 'ok' | 'down';
type HealthResult = { status: 'ok' | 'degraded'; checks: Record<'database' | 'worker' | 'storage' | 'chromium', CheckStatus>; checkedAt: string };

export const HEALTH_ENV = Symbol('HEALTH_ENV');
@Controller('health')
export class HealthController {
  private readonly deps: HealthDeps;
  private cached?: { expiresAt: number; result: HealthResult };
  private inFlight?: Promise<HealthResult>;
  constructor(@Inject(PrismaService) prisma: PrismaService | HealthDeps, @Optional() @Inject(HEALTH_ENV) private readonly env: HealthEnv = process.env) {
    this.deps = 'queryDatabase' in prisma ? prisma : { queryDatabase: () => prisma.db.$queryRawUnsafe('SELECT 1'), accessPath: access, statPath: stat };
  }
  @Get()
  async getHealth(): Promise<HealthResult> { const result = await this.snapshot(); if (result.status !== 'ok') throw new ServiceUnavailableException(result); return result; }
  private async snapshot(): Promise<HealthResult> {
    const now = Date.now(); if (this.cached && this.cached.expiresAt > now) return this.cached.result; if (this.inFlight) return this.inFlight;
    this.inFlight = this.probe().then((result) => { const configured = Number(this.env.HEALTH_CACHE_TTL_MS ?? 5_000); const ttl = Number.isFinite(configured) ? Math.min(10_000, Math.max(5_000, configured)) : 5_000; this.cached = { expiresAt: Date.now() + ttl, result }; return result; }).finally(() => { this.inFlight = undefined; });
    return this.inFlight;
  }
  private async probe(): Promise<HealthResult> {
    const configured = Number(this.env.HEALTH_PROBE_TIMEOUT_MS ?? 1_500); const timeoutMs = Number.isFinite(configured) ? Math.min(2_000, Math.max(1, configured)) : 1_500;
    const safe = async (operation: () => Promise<unknown>): Promise<CheckStatus> => { let timer: ReturnType<typeof setTimeout> | undefined; try { await Promise.race([operation(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs); })]); return 'ok'; } catch { return 'down'; } finally { if (timer) clearTimeout(timer); } };
    const [database, worker, storage, chromium] = await Promise.all([
      safe(() => this.deps.queryDatabase()),
      safe(async () => { const heartbeat = await this.deps.statPath(this.env.WORKER_HEARTBEAT_FILE ?? './data/worker-heartbeat.json'); if (Date.now() - heartbeat.mtimeMs > 30_000) throw new Error('stale'); }),
      safe(() => this.deps.accessPath(this.env.STORAGE_LOCAL_ROOT ?? './data/private-files', constants.R_OK | constants.W_OK)),
      safe(() => this.env.CHROMIUM_EXECUTABLE_PATH ? this.deps.accessPath(this.env.CHROMIUM_EXECUTABLE_PATH, constants.X_OK) : Promise.reject(new Error('missing'))),
    ]);
    const checks = { database, worker, storage, chromium };
    return { status: Object.values(checks).every((value) => value === 'ok') ? 'ok' : 'degraded', checks, checkedAt: new Date().toISOString() };
  }
}
