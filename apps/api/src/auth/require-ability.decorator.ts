import { SetMetadata } from '@nestjs/common';
import type { Ability } from '@auth/contracts';

export const REQUIRED_ABILITY = 'required-ability';
export const RequireAbility = (ability: Ability) => SetMetadata(REQUIRED_ABILITY, ability);
