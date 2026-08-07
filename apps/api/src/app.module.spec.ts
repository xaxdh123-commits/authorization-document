import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DatabaseModule } from './database/database.module';
import { PrismaService } from './database/prisma.service';
import { CaseRepository } from './database/repositories/case.repository';
import { RequirementsService } from './requirements/requirements.service';
import { TemplatesService } from './templates/templates.service';
import { AuditService } from './audit/audit.service';
import { SettingsService } from './settings/settings.service';

describe('AppModule production defaults', () => {
  test('imports the database module and resolves repository providers by default', async () => {
    const imports = Reflect.getMetadata('imports', AppModule) as unknown[];
    const exports = Reflect.getMetadata('exports', DatabaseModule) as unknown[];
    expect(imports).toContain(DatabaseModule);
    expect(exports).toContain(CaseRepository);
    jest.spyOn(PrismaService.prototype, 'onModuleInit').mockResolvedValue();
    jest.spyOn(PrismaService.prototype, 'onModuleDestroy').mockResolvedValue();
    const context = await NestFactory.createApplicationContext(AppModule, { logger: false });
    expect(context.get(CaseRepository)).toBeInstanceOf(CaseRepository);
    expect(context.get(RequirementsService)).toBeInstanceOf(RequirementsService);
    expect(context.get(TemplatesService)).toBeInstanceOf(TemplatesService);
    expect(context.get(AuditService)).toBeInstanceOf(AuditService);
    expect(context.get(SettingsService)).toBeInstanceOf(SettingsService);
    await context.close();
  });
});
