import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { firstValueFrom, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { IdempotencyInterceptor, validIdempotencyKey } from './idempotency.interceptor';

function createContext(statusCode = 201) {
  const request = {
    auth: { userId: 'user-1', workspaceId: 'workspace-1' },
    method: 'POST',
    baseUrl: '/api/v1/notes',
    path: '/',
    route: { path: '/' },
    header: vi.fn().mockReturnValue('ios.note:01JABCDEF')
  };
  const response = { statusCode, status: vi.fn() };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response
    })
  } as unknown as ExecutionContext;
  return { context, request, response };
}

function createPrismaMock() {
  return {
    idempotencyRecord: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({})
    }
  };
}

describe('幂等键校验', () => {
  it('接受 UUID 和客户端命名键', () => {
    expect(validIdempotencyKey('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(validIdempotencyKey('ios.note:01JABCDEF')).toBe(true);
  });

  it('拒绝过短和可能污染日志的字符', () => {
    expect(validIdempotencyKey('short')).toBe(false);
    expect(validIdempotencyKey('unsafe key\nvalue')).toBe(false);
  });
});

describe('幂等拦截器', () => {
  it('记录首次成功请求并返回原响应', async () => {
    const prisma = createPrismaMock();
    const { context } = createContext();
    const next = { handle: vi.fn().mockReturnValue(of({ id: 'note-1' })) } as CallHandler;
    const interceptor = new IdempotencyInterceptor(prisma as unknown as PrismaService);

    await expect(firstValueFrom(await interceptor.intercept(context, next))).resolves.toEqual({ id: 'note-1' });
    expect(prisma.idempotencyRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        workspaceId: 'workspace-1',
        key: 'ios.note:01JABCDEF',
        method: 'POST',
        path: '/api/v1/notes/',
        statusCode: 0
      })
    });
    expect(prisma.idempotencyRecord.update).toHaveBeenCalledWith({
      where: {
        userId_workspaceId_key_method_path: {
          userId: 'user-1',
          workspaceId: 'workspace-1',
          key: 'ios.note:01JABCDEF',
          method: 'POST',
          path: '/api/v1/notes/'
        }
      },
      data: { statusCode: 201, response: { id: 'note-1' } }
    });
  });

  it('重放已完成请求且不再调用处理器', async () => {
    const prisma = createPrismaMock();
    prisma.idempotencyRecord.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('重复幂等键', {
      code: 'P2002',
      clientVersion: 'test'
    }));
    prisma.idempotencyRecord.findUnique.mockResolvedValue({ statusCode: 202, response: { id: 'note-1' } });
    const { context, response } = createContext();
    const next = { handle: vi.fn() } as unknown as CallHandler;
    const interceptor = new IdempotencyInterceptor(prisma as unknown as PrismaService);

    await expect(firstValueFrom(await interceptor.intercept(context, next))).resolves.toEqual({ id: 'note-1' });
    expect(response.status).toHaveBeenCalledWith(202);
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('拒绝仍在处理中的重复请求', async () => {
    const prisma = createPrismaMock();
    prisma.idempotencyRecord.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('重复幂等键', {
      code: 'P2002',
      clientVersion: 'test'
    }));
    prisma.idempotencyRecord.findUnique.mockResolvedValue({ statusCode: 0, response: null });
    const { context } = createContext();
    const interceptor = new IdempotencyInterceptor(prisma as unknown as PrismaService);

    await expect(interceptor.intercept(context, { handle: vi.fn() } as unknown as CallHandler)).rejects.toBeInstanceOf(ConflictException);
  });

  it('业务失败时删除占位记录以允许重试', async () => {
    const prisma = createPrismaMock();
    const { context } = createContext();
    const failure = new Error('创建失败');
    const next = { handle: vi.fn().mockReturnValue(throwError(() => failure)) } as CallHandler;
    const interceptor = new IdempotencyInterceptor(prisma as unknown as PrismaService);

    await expect(firstValueFrom(await interceptor.intercept(context, next))).rejects.toBe(failure);
    expect(prisma.idempotencyRecord.deleteMany).toHaveBeenLastCalledWith({
      where: {
        userId: 'user-1',
        workspaceId: 'workspace-1',
        key: 'ios.note:01JABCDEF',
        method: 'POST',
        path: '/api/v1/notes/'
      }
    });
  });
});
