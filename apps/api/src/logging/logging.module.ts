import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { SafeExceptionFilter } from './safe-exception.filter';
import { SafeLogger } from './safe-logger';

@Global()
@Module({ providers: [SafeLogger, { provide: APP_FILTER, useClass: SafeExceptionFilter }], exports: [SafeLogger] })
export class LoggingModule {}
