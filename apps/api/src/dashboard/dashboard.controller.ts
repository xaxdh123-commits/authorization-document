import { Controller, Get } from '@nestjs/common';
import { CaseStore } from '../cases/case.store';
@Controller('dashboard') export class DashboardController {
  constructor(private readonly store: CaseStore = new CaseStore()) {}
  @Get() summary() {
    const cases = this.store.list();
    return { draft: cases.filter((x) => x.status === 'DRAFT').length, awaitingCustomer: cases.filter((x) => x.status === 'SUBMITTED').length, pendingReview: cases.filter((x) => x.status === 'IN_REVIEW').length, needsSupplement: 0, completed: cases.filter((x) => x.status === 'COMPLETED').length };
  }
}
