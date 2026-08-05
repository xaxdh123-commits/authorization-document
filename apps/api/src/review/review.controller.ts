import { Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { CaseStore } from '../cases/case.store';
@Controller('review') export class ReviewController {
  constructor(private readonly store: CaseStore = new CaseStore()) {}
  @Get('queue') queue() { return { items: this.store.list().filter((x) => x.status === 'SUBMITTED' || x.status === 'IN_REVIEW') }; }
  @Get(':id') detail(@Param('id') id: string) { const item = this.store.get(id); if (!item) throw new NotFoundException('case not found'); return item; }
  @Post(':id/start') start(@Param('id') id: string) { const item = this.store.get(id); if (!item) throw new NotFoundException('case not found'); return this.store.updateStatus(item, 'IN_REVIEW'); }
  @Post(':id/complete') complete(@Param('id') id: string) { const item = this.store.get(id); if (!item) throw new NotFoundException('case not found'); return this.store.updateStatus(item, 'COMPLETED'); }
  @Post(':id/reject') reject(@Param('id') id: string) { const item = this.store.get(id); if (!item) throw new NotFoundException('case not found'); return this.store.updateStatus(item, 'NEEDS_SUPPLEMENT'); }
}
