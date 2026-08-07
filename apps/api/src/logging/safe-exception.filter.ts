import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SafeLogger, toSafeErrorResponse } from './safe-logger';

@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: SafeLogger) {}
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<{ status(code: number): { json(body: unknown): void } }>();
    const request = host.switchToHttp().getRequest<{ headers?: Record<string, string>; method?: string; url?: string }>();
    const requestId = request.headers?.['x-request-id'] ?? randomUUID();
    const safe = toSafeErrorResponse(error, requestId);
    this.logger.error({ event: 'HTTP_REQUEST_FAILED', requestId, method: request.method, url: request.url, error });
    response.status(safe.statusCode).json(safe);
  }
}
