import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { PuppeteerPdfEngine } from '@auth/template-engine';
import { AppModule } from './app.module';
import { probeProductionPdfRuntime } from './pdf/pdf-runtime.probe';
import { buildCorsOptions, loadRuntimeConfig } from './config/runtime-config';
import { SafeLogger } from './logging/safe-logger';
import { parseEnv } from '@auth/config';

async function bootstrap() {
  if (process.env.NODE_ENV === 'production') {
    const production = parseEnv(process.env);
    process.env.STORAGE_LOCAL_ROOT ??= production.storageRoot;
    process.env.PUBLIC_H5_BASE_URL ??= production.h5PublicBase;
  }
  const config = loadRuntimeConfig();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(SafeLogger));
  if (process.env.USE_IN_MEMORY_STORE !== 'true') await probeProductionPdfRuntime(app.get(PuppeteerPdfEngine));
  app.enableCors(buildCorsOptions(config));
  await app.listen(config.port);
}
void bootstrap();
