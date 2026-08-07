import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditRepository } from '../database/repositories/audit.repository';

@Injectable()
export class AuditService {
  constructor(private readonly audit: AuditRepository) {}
  list(input: { targetType?: string; targetId?: string; actorUserId?: string; action?: string; createdFrom?: string; createdTo?: string; page: number; pageSize: number }) {
    if (!Number.isInteger(input.page) || input.page < 1 || !Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100) throw new BadRequestException('分页参数无效');
    const createdFrom = input.createdFrom ? new Date(input.createdFrom) : undefined;
    const createdTo = input.createdTo ? new Date(input.createdTo) : undefined;
    if (createdFrom && Number.isNaN(createdFrom.getTime()) || createdTo && Number.isNaN(createdTo.getTime())) throw new BadRequestException('时间筛选无效');
    if (createdFrom && createdTo && createdFrom > createdTo) throw new BadRequestException('时间范围无效');
    const { createdFrom: _from, createdTo: _to, ...rest } = input;
    return this.audit.listPage({ ...rest, createdFrom, createdTo });
  }
}
