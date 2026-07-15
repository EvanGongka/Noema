import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const requestId = request.header('x-request-id') ?? randomUUID();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof HttpException ? exception.getResponse() : null;
    const rawMessage = typeof body === 'object' && body && 'message' in body
      ? Array.isArray(body.message) ? body.message.join('；') : String(body.message)
      : exception instanceof Error ? exception.message : '服务器内部错误';
    const message = status >= 500 ? '服务器内部错误' : rawMessage;
    const explicitCode = typeof body === 'object' && body && 'code' in body && typeof body.code === 'string' ? body.code : undefined;
    const code = explicitCode ?? (status === 401 ? 'UNAUTHORIZED'
      : status === 403 ? 'FORBIDDEN'
      : status === 404 ? 'NOT_FOUND'
      : status === 409 ? 'CONFLICT'
      : status === 429 ? 'RATE_LIMITED'
      : status >= 500 ? 'INTERNAL_ERROR'
      : 'BAD_REQUEST');
    response.status(status).json({
      code,
      message,
      requestId,
      path: request.url,
      timestamp: new Date().toISOString()
    });
  }
}
