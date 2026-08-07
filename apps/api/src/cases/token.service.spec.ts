import { TokenService } from './token.service';

describe('TokenService', () => {
  const now = new Date('2026-08-06T00:00:00.000Z');
  const clock = () => now;

  it('returns a >=128-bit token once and persists only its SHA-256 digest', async () => {
    const db = { publicCaseLink: { create: jest.fn(async ({ data }) => ({ id: 'link-1', ...data })) } } as any;
    const service = new TokenService({ db } as any, clock);
    const created = await service.create('case-1', new Date('2026-08-07T00:00:00.000Z'));
    expect(Buffer.from(created.token, 'base64url')).toHaveLength(32);
    const persisted = db.publicCaseLink.create.mock.calls[0][0].data;
    expect(persisted.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(persisted)).not.toContain(created.token);
  });

  it.each(['unknown', 'expired', 'disabled', 'consumed', 'completed'])(
    'uses the identical unavailable error for %s tokens', async (kind) => {
      const row: any = { id: 'link', caseId: 'case', expiresAt: new Date('2026-08-07'), disabledAt: null, consumedAt: null, completedAt: null, businessCase: { status: 'AWAITING_CUSTOMER' } };
      if (kind === 'expired') row.expiresAt = new Date('2026-08-05');
      if (kind === 'disabled') row.disabledAt = now;
      if (kind === 'consumed') row.consumedAt = now;
      if (kind === 'completed') row.businessCase.status = 'COMPLETED';
      const db = { publicCaseLink: { findUnique: jest.fn(async () => kind === 'unknown' ? null : row) } } as any;
      const service = new TokenService({ db } as any, clock);
      await expect(service.resolve('secret')).rejects.toMatchObject({
        response: { code: 'LINK_UNAVAILABLE', message: '链接无效或已失效' },
        status: 404,
      });
    },
  );

  it('revalidates a token after acquiring the mutation lock', async () => {
    let disabledAt: Date | null = null;
    const tx: any = {
      $queryRaw: jest.fn(async () => { disabledAt = now; return [{ id: 'link' }]; }),
      publicCaseLink: { findUnique: jest.fn(async () => ({ id: 'link', caseId: 'case', expiresAt: new Date('2026-08-07'), disabledAt, consumedAt: null, completedAt: null, businessCase: { status: 'CUSTOMER_EDITING' } })) },
    };
    const service = new TokenService({ db: {} } as any, clock);
    await expect(service.resolveForMutation(tx, 'secret')).rejects.toMatchObject({ response: { code: 'LINK_UNAVAILABLE' } });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('uses compare-and-swap when consuming a locked token', async () => {
    const tx: any = { publicCaseLink: { updateMany: jest.fn(async () => ({ count: 0 })) } };
    const service = new TokenService({ db: {} } as any, clock);
    await expect(service.consumeForMutation(tx, { id: 'link', expiresAt: new Date('2026-08-07') })).rejects.toMatchObject({ response: { code: 'LINK_UNAVAILABLE' } });
  });
});
