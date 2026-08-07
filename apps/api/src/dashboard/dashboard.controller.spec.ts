import { DashboardController } from './dashboard.controller';
import { REQUIRED_ABILITY } from '../auth/require-ability.decorator';

describe('DashboardController', () => {
  it('derives status counts and recent cases from Prisma', async () => {
    const prisma = { db: { businessCase: { groupBy: jest.fn(async () => [{ status: 'PENDING_REVIEW', _count: { _all: 2 } }]), findMany: jest.fn(async () => [{ id: 'c1', customerName: '客户', status: 'PENDING_REVIEW', ownerUserId: 'u1', updatedAt: new Date() }]) } } } as any;
    const result = await new DashboardController(prisma).summary();
    expect(result.statuses.PENDING_REVIEW).toBe(2);
    expect(result.recent[0]).toMatchObject({ id: 'c1', title: '客户' });
  });
  it('requires case read ability', () => { expect(Reflect.getMetadata(REQUIRED_ABILITY, DashboardController.prototype.summary)).toBe('CASE_READ'); });
});
