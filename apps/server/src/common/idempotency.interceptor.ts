import { BadRequestException, CallHandler, ConflictException, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { catchError, from, mergeMap, Observable, of, throwError } from 'rxjs';
import type { AuthRequest } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

const supportedMethods = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const keyPattern = /^[A-Za-z0-9._:-]{8,128}$/;

export function validIdempotencyKey(value: unknown): value is string {
  return typeof value === 'string' && keyPattern.test(value);
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const response = context.switchToHttp().getResponse<{ statusCode: number; status(code: number): unknown }>();
    const rawKey = request.header('idempotency-key');
    if (!request.auth || !rawKey || !supportedMethods.has(request.method)) return next.handle();
    if (!validIdempotencyKey(rawKey)) throw new BadRequestException('Idempotency-Key 必须为 8 到 128 位安全字符');

    const identity = { userId: request.auth.userId, workspaceId: request.auth.workspaceId, key: rawKey, method: request.method, path: request.route?.path ? `${request.baseUrl}${request.route.path}` : request.path };
    await this.prisma.idempotencyRecord.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    try {
      await this.prisma.idempotencyRecord.create({ data: { ...identity, statusCode: 0, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const existing = await this.prisma.idempotencyRecord.findUnique({ where: { userId_workspaceId_key_method_path: identity } });
      if (!existing || existing.statusCode === 0) throw new ConflictException('相同幂等请求正在处理中');
      response.status(existing.statusCode);
      return of(existing.response);
    }

    return next.handle().pipe(
      mergeMap((body) => from(this.prisma.idempotencyRecord.update({
        where: { userId_workspaceId_key_method_path: identity },
        data: { statusCode: response.statusCode || 200, response: body === undefined ? Prisma.JsonNull : body as Prisma.InputJsonValue }
      })).pipe(mergeMap(() => of(body)))),
      catchError((error) => from(this.prisma.idempotencyRecord.deleteMany({ where: identity })).pipe(mergeMap(() => throwError(() => error))))
    );
  }
}
