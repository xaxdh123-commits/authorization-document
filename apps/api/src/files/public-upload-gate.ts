import { CallHandler, CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable, NestInterceptor, Optional, UnauthorizedException } from '@nestjs/common';
import { Observable, finalize } from 'rxjs';
import { TokenService } from '../cases/token.service';

type GateState = { windowStartedAt: number; attempts: number; active: number };
type UploadRequest = { headers?: Record<string, string | string[] | undefined>; ip?: string; socket?: { remoteAddress?: string }; releasePublicUploadGate?: () => void; publicUploadToken?: string };

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS_PER_WINDOW = 12;
const MAX_ACTIVE = 2;

export function bearerToken(authorization?: string | string[]): string {
  const raw = Array.isArray(authorization) ? authorization[0] : authorization;
  const token = raw?.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new UnauthorizedException('上传请求缺少有效访问令牌');
  return token;
}

@Injectable()
export class PublicUploadGateGuard implements CanActivate {
  private readonly states = new Map<string, GateState>();
  constructor(
    private readonly tokens: TokenService,
    @Optional() @Inject('PUBLIC_UPLOAD_GATE_CLOCK') private readonly clock: () => number = () => Date.now(),
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<UploadRequest>();
    const token = bearerToken(request.headers?.authorization);
    await this.tokens.resolve(token);
    const now = this.clock();
    const key = `${this.tokens.digest(token)}:${request.ip ?? request.socket?.remoteAddress ?? 'unknown'}`;
    const current = this.states.get(key);
    const state = !current || now - current.windowStartedAt >= WINDOW_MS ? { windowStartedAt: now, attempts: 0, active: 0 } : current;
    if (state.attempts >= MAX_ATTEMPTS_PER_WINDOW || state.active >= MAX_ACTIVE) throw new HttpException('上传过于频繁，请稍后重试',HttpStatus.TOO_MANY_REQUESTS);
    state.attempts += 1;
    state.active += 1;
    this.states.set(key, state);
    let released = false;
    request.publicUploadToken = token;
    request.releasePublicUploadGate = () => {
      if (released) return;
      released = true;
      state.active = Math.max(0, state.active - 1);
    };
    return true;
  }
}

@Injectable()
export class PublicUploadGateInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<UploadRequest>();
    return next.handle().pipe(finalize(() => request.releasePublicUploadGate?.()));
  }
}
