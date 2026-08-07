import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AuditRepository } from './repositories/audit.repository';
import { CaseRepository } from './repositories/case.repository';
import { CatalogRepository } from './repositories/catalog.repository';
import { PdfTaskRepository } from './repositories/pdf-task.repository';
import { RoleMappingRepository } from './repositories/role-mapping.repository';
import { SettingsRepository } from './repositories/settings.repository';
import { CatalogVersionRepository } from './repositories/catalog-version.repository';

const repositories = [AuditRepository, CaseRepository, CatalogRepository, CatalogVersionRepository, PdfTaskRepository, RoleMappingRepository, SettingsRepository];

@Global()
@Module({ providers: [PrismaService, ...repositories], exports: [PrismaService, ...repositories] })
export class DatabaseModule {}
