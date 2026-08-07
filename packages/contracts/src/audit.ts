type AuditInput = {
  actorUserId?: string;
  actorType?: string;
  action: string;
  targetType: string;
  targetId: string;
  detail: unknown;
  source?: string;
  requestId?: string;
  createdAt?: Date;
  [key: string]: unknown;
};

type AuditClient = { auditEvent: { create(input: { data: Record<string, unknown> }): unknown } };

export class AuditWriter {
  static append(tx: AuditClient, value: AuditInput | { data: AuditInput }) {
    const candidate = 'data' in value ? value.data : undefined;
    const input: AuditInput = candidate && typeof candidate === 'object' && 'action' in candidate ? candidate as AuditInput : value as AuditInput;
    const actorType = input.actorType ?? 'INTERNAL';
    const actorUserId = input.actorUserId ?? (actorType === 'SYSTEM' ? 'SYSTEM' : actorType === 'CUSTOMER' ? 'CUSTOMER' : 'UNKNOWN');
    const source = input.source ?? (actorType === 'SYSTEM' ? 'SYSTEM' : actorType === 'CUSTOMER' ? 'PUBLIC_H5' : 'INTERNAL_API');
    const requestId = input.requestId ?? `${source}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return tx.auditEvent.create({ data: { ...input, actorType, actorUserId, source, requestId, createdAt: input.createdAt ?? new Date() } }) as Promise<unknown>;
  }
}
