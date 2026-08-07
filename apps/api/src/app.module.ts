import { Module } from '@nestjs/common';
import { AuthController } from './auth/auth.controller';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { TemplatesController } from './templates/templates.controller';
import { TemplatesService } from './templates/templates.service';
import { AuthService } from './auth/auth.service';
import { AbilityService } from './auth/ability.service';
import { AbilityGuard } from './auth/ability.guard';
import { RolesController } from './roles/roles.controller';
import { RolesService } from './roles/roles.service';
import { RequirementsController } from './requirements/requirements.controller';
import { RequirementsService } from './requirements/requirements.service';
import { AuditController } from './audit/audit.controller';
import { AuditService } from './audit/audit.service';
import { SettingsController } from './settings/settings.controller';
import { SettingsService } from './settings/settings.service';
import { DemoModule } from './demo/demo.module';
import { CasesController, PublicCasesController } from './cases/cases.controller';
import { CaseService } from './cases/case.service';
import { TokenService } from './cases/token.service';
import { DashboardController } from './dashboard/dashboard.controller';
import { ReviewController } from './review/review.controller';
import { ReviewService } from './review/review.service';
import { PRESIGN_PREVIEW_SERVICE, PresignPreviewService } from './cases/presign-preview.service';
import { FilesController, PublicFilesController } from './files/files.controller';
import { FileService } from './files/file.service';
import { PublicUploadGateGuard, PublicUploadGateInterceptor } from './files/public-upload-gate';
import { storageProvider } from './files/storage.provider';
import { ChromiumPdfRenderer, PuppeteerPdfEngine } from '@auth/template-engine';
import { PdfModule } from './pdf/pdf.module';
import { LoggingModule } from './logging/logging.module';

const useInMemoryDemo = process.env.USE_IN_MEMORY_STORE === 'true';

@Module({
  imports: [LoggingModule, DatabaseModule, ...(!useInMemoryDemo ? [PdfModule] : []), ...(useInMemoryDemo ? [DemoModule] : [])],
  controllers: [HealthController, AuthController, RolesController, RequirementsController, TemplatesController, AuditController, SettingsController, ...(useInMemoryDemo ? [] : [CasesController, PublicCasesController, FilesController, PublicFilesController, DashboardController, ReviewController])],
  providers: [AuthService, AbilityService, AbilityGuard, RolesService, RequirementsService, TemplatesService, AuditService, SettingsService, ...(useInMemoryDemo ? [] : [CaseService, TokenService, ReviewService, FileService, PublicUploadGateGuard, PublicUploadGateInterceptor, storageProvider, PuppeteerPdfEngine, {provide:ChromiumPdfRenderer,useFactory:(engine:PuppeteerPdfEngine)=>new ChromiumPdfRenderer(engine),inject:[PuppeteerPdfEngine]}, PresignPreviewService, { provide: PRESIGN_PREVIEW_SERVICE, useExisting: PresignPreviewService }])],
  exports: [DatabaseModule],
})
export class AppModule {}
