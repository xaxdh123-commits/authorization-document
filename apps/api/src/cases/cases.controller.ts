import { Body, Controller, Get, GoneException, NotFoundException, Param, Post } from '@nestjs/common';
import { CaseCreateSchema } from '@auth/contracts';
import { CaseStore, StoredCase } from './case.store';

@Controller('cases')
export class CasesController {
  constructor(private readonly store: CaseStore = new CaseStore()) {}
  @Post() create(@Body() body: unknown): StoredCase { return this.store.create(CaseCreateSchema.parse(body)); }
  @Get() list(): StoredCase[] { return this.store.list(); }
  @Get('access/:token') access(@Param('token') token: string): StoredCase {
    const item = this.store.byToken(token);
    if (!item || item.accessClosed) throw new NotFoundException('access link is unavailable');
    if (Date.parse(item.accessTokenExpiresAt) <= Date.now()) throw new GoneException('access link expired');
    return item;
  }
  @Get(':id') detail(@Param('id') id: string): StoredCase { return this.find(id); }
  @Post(':id/submit') submit(@Param('id') id: string): StoredCase {
    const item = this.find(id);
    if (item.status !== 'DRAFT') throw new NotFoundException('case is not in draft state');
    return this.store.updateStatus(item, 'SUBMITTED');
  }
  @Post(':id/close-access') closeAccess(@Param('id') id: string): StoredCase { return this.store.closeAccess(this.find(id)); }
  private find(id: string): StoredCase { const item = this.store.get(id); if (!item) throw new NotFoundException('case not found'); return item; }
}
