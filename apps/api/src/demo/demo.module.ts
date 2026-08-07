import { Module } from '@nestjs/common';
import { CaseStore } from '../cases/case.store';
import { DatabaseModule } from '../database/database.module';
import { TemplateStore } from '../templates/template.store';

@Module({
  imports: [DatabaseModule],
  providers: [TemplateStore, CaseStore],
})
export class DemoModule {}
