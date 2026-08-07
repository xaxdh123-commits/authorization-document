import { ActorType, Prisma } from '@prisma/client';
export { AuditWriter } from '../../../../../packages/contracts/src/audit.js';

export type AuditWrite = {
  actorUserId?: string;
  actorType?: ActorType;
  action: string;
  targetType: string;
  targetId: string;
  detail: Prisma.InputJsonValue;
  source?: string;
  requestId?: string;
  beforeState?: Prisma.InputJsonValue;
  afterState?: Prisma.InputJsonValue;
  note?: string;
  ipAddress?: string;
  userAgent?: string;
};
