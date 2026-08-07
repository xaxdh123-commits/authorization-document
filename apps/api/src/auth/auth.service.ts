import { createHash } from 'node:crypto';
import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { RoleMappingRepository } from '../database/repositories/role-mapping.repository';

export interface BackendIdentity {
  userId: string;
  name: string;
  departmentId?: string;
  departmentName?: string;
  roles: string[];
}

export interface AuthenticationResult {
  user: BackendIdentity;
  tokenDigest: string;
  upstreamAvailable: boolean;
}

interface CacheEntry {
  user: BackendIdentity;
  expiresAt: number;
}

@Injectable()
export class AuthService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly roleMappings: RoleMappingRepository) {}

  async authenticate(token: string, context: { write: boolean }): Promise<AuthenticationResult> {
    if (!token?.trim()) throw new UnauthorizedException('未提供登录凭证');
    const tokenDigest = createHash('sha256').update(token).digest('hex');
    const cached = this.cache.get(tokenDigest);
    if (!context.write && cached && cached.expiresAt > Date.now()) {
      return { user: cached.user, tokenDigest, upstreamAvailable: true };
    }

    let user: BackendIdentity;
    try {
      user = await this.fetchIdentity(token);
    } catch (error) {
      if (error instanceof UnauthorizedException) this.cache.delete(tokenDigest);
      throw error;
    }
    await this.roleMappings.upsertUpstreamUser(user);
    const ttlSeconds = Math.min(this.positiveInteger(process.env.AUTH_CACHE_TTL_SECONDS, 60), 60);
    this.cache.set(tokenDigest, { user, expiresAt: Date.now() + ttlSeconds * 1000 });
    return { user, tokenDigest, upstreamAvailable: true };
  }

  private async fetchIdentity(token: string): Promise<BackendIdentity> {
    const url = process.env.UPSTREAM_GETINFO_URL ?? process.env.AUTH_GET_INFO_URL;
    if (!url) throw new ServiceUnavailableException('上游鉴权服务未配置');
    const timeoutMs = this.positiveInteger(process.env.AUTH_TIMEOUT_MS, 3000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headerName = process.env.AUTH_TOKEN_HEADER?.trim() || 'Authorization';
      const response = await fetch(url, { headers: { [headerName]: token }, signal: controller.signal });
      if (response.status === 401 || response.status === 403) throw new UnauthorizedException('登录已失效');
      if (!response.ok) throw new ServiceUnavailableException('上游鉴权服务暂时不可用');
      return this.parseIdentity(await response.json());
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('上游鉴权服务暂时不可用');
    } finally {
      clearTimeout(timer);
    }
  }

  private parseIdentity(payload: unknown): BackendIdentity {
    if (!payload || typeof payload !== 'object') throw new UnauthorizedException('上游用户信息无效');
    const envelope = payload as Record<string, unknown>;
    const user = envelope.user;
    if (envelope.code !== 200 || !user || typeof user !== 'object') throw new UnauthorizedException('上游用户信息无效');
    const source = user as Record<string, unknown>;
    if (source.userId === undefined || source.userId === null || String(source.userId).trim() === '') {
      throw new UnauthorizedException('上游用户信息无效');
    }
    const sourceRoles = Array.isArray(source.roles) ? source.roles : [];
    const roles = [...new Set(sourceRoles.flatMap((role) => {
      if (!role || typeof role !== 'object') return [];
      const roleKey = (role as Record<string, unknown>).roleKey;
      return typeof roleKey === 'string' && roleKey.trim() ? [roleKey.trim()] : [];
    }))];
    if (roles.length === 0) throw new UnauthorizedException('未配置有效角色');
    const dept = source.dept && typeof source.dept === 'object' ? source.dept as Record<string, unknown> : undefined;
    return {
      userId: String(source.userId),
      name: typeof source.nickName === 'string' ? source.nickName : String(source.userName ?? ''),
      departmentId: source.deptId === undefined || source.deptId === null ? undefined : String(source.deptId),
      departmentName: typeof dept?.deptName === 'string' ? dept.deptName : undefined,
      roles,
    };
  }

  private positiveInteger(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
}
