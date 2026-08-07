import { BadRequestException, Injectable } from '@nestjs/common';
import { AbilitySchema, DataScopeSchema } from '@auth/contracts';
import { RoleMappingRepository } from '../database/repositories/role-mapping.repository';

export interface RoleMappingUpdate {
  abilities: string[];
  dataScope: string;
  enabled: boolean;
}

@Injectable()
export class RolesService {
  constructor(private readonly mappings: RoleMappingRepository) {}

  list() {
    return this.mappings.list();
  }

  async update(roleKey: string, input: RoleMappingUpdate, actorUserId: string) {
    if (!roleKey.trim() || !Array.isArray(input.abilities) || typeof input.enabled !== 'boolean') {
      throw new BadRequestException('角色映射参数无效');
    }
    const abilities = input.abilities.map((ability) => AbilitySchema.parse(ability));
    const dataScope = DataScopeSchema.parse(input.dataScope);
    return this.mappings.upsertWithAudit({
      roleKey,
      abilities,
      dataScope,
      enabled: input.enabled,
      actorUserId,
    });
  }
}
