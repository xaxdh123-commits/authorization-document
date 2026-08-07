import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Ability, DataScope } from '@auth/contracts';
import { AbilityService } from './ability.service';
import { AuthService, type BackendIdentity } from './auth.service';
import { REQUIRED_ABILITY } from './require-ability.decorator';

export interface RequestAuthContext {
  user: BackendIdentity;
  abilities: Ability[];
  dataScope: DataScope;
  matchedRoles: string[];
  tokenDigest: string;
}

@Injectable()
export class AbilityGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly abilityService: AbilityService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ method: string; headers: Record<string, string | string[] | undefined>; auth?: RequestAuthContext }>();
    const header = request.headers.authorization;
    const token = Array.isArray(header) ? header[0] : header;
    if (!token) throw new UnauthorizedException('未提供登录凭证');
    const write = !['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase());
    const authentication = await this.authService.authenticate(token, { write });
    const authorization = await this.abilityService.resolve(authentication.user.roles);
    request.auth = { ...authentication, ...authorization };
    const required = this.reflector.getAllAndOverride<Ability | undefined>(REQUIRED_ABILITY, [context.getHandler(), context.getClass()]);
    if (required && !authorization.abilities.includes(required)) throw new ForbiddenException('无权执行此操作');
    return true;
  }
}
