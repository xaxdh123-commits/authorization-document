import { ForbiddenException, Injectable } from '@nestjs/common';
import { ABILITIES, type Ability, type DataScope } from '@auth/contracts';
import { RoleMappingRepository } from '../database/repositories/role-mapping.repository';

export interface ResolvedAbilities {
  abilities: Ability[];
  dataScope: DataScope;
  matchedRoles: string[];
}

const scopeRank: Record<DataScope, number> = { SELF: 0, DEPT: 1, ALL: 2 };

@Injectable()
export class AbilityService {
  constructor(private readonly roleMappings: RoleMappingRepository) {}

  async resolve(roleKeys: string[]): Promise<ResolvedAbilities> {
    const mappings = await Promise.all([...new Set(roleKeys)].map((roleKey) => this.roleMappings.find(roleKey)));
    const enabled = mappings.filter((mapping): mapping is NonNullable<typeof mapping> => Boolean(mapping?.enabled));
    if (enabled.length === 0) throw new ForbiddenException('当前角色未授权');
    const granted = new Set<Ability>();
    let dataScope: DataScope = 'SELF';
    for (const mapping of enabled) {
      const values = Array.isArray(mapping.capabilities) ? mapping.capabilities : [];
      if (values.includes('*:*:*')) ABILITIES.forEach((ability) => granted.add(ability));
      for (const ability of ABILITIES) if (values.includes(ability)) granted.add(ability);
      if (scopeRank[mapping.dataScope] > scopeRank[dataScope]) dataScope = mapping.dataScope;
    }
    return {
      abilities: ABILITIES.filter((ability) => granted.has(ability)),
      dataScope,
      matchedRoles: enabled.map((mapping) => mapping.roleKey),
    };
  }
}
