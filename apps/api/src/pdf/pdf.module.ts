import { Module } from '@nestjs/common';
import { PdfController } from './pdf.controller';
import { PdfFinalizationConsumer } from './pdf-finalization.consumer';
import { PrismaPdfFinalizationRepository } from './pdf-finalization.repository';
import { PdfFinalizationService } from './pdf-finalization.service';
import { PdfRetryService } from './pdf-retry.service';
import { PdfBossConsumer } from './pdf-boss.consumer';
import { storageProvider } from '../files/storage.provider';
import { AbilityGuard } from '../auth/ability.guard';
import { AbilityService } from '../auth/ability.service';
import { AuthService } from '../auth/auth.service';
@Module({controllers:[PdfController],providers:[AuthService,AbilityService,AbilityGuard,storageProvider,PrismaPdfFinalizationRepository,{provide:'PDF_FINALIZATION_REPOSITORY',useExisting:PrismaPdfFinalizationRepository},PdfFinalizationService,PdfFinalizationConsumer,PdfBossConsumer,PdfRetryService],exports:[PdfFinalizationConsumer,PdfFinalizationService,PdfRetryService]})
export class PdfModule{}
