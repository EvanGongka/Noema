import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthRequest } from './auth.types';

export const SESSION_COOKIE = 'ai_note_session';

export function bearerToken(authorization?: string) {
  if (!authorization) return undefined;
  const [scheme, token, extra] = authorization.trim().split(/\s+/);
  return scheme?.toLowerCase() === 'bearer' && token && !extra ? token : undefined;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = bearerToken(request.header('authorization')) ?? request.cookies?.[SESSION_COOKIE] as string | undefined;
    if (!token) throw new UnauthorizedException('请先登录');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { user: { include: { memberships: { orderBy: { id: 'asc' }, take: 1 } } } }
    });
    const membership = session?.user.memberships[0];
    if (!session || session.expiresAt <= new Date() || session.revokedAt || !membership) throw new UnauthorizedException('登录已过期');
    request.auth = {
      sessionId: session.id,
      userId: session.user.id,
      workspaceId: membership.workspaceId,
      email: session.user.email,
      name: session.user.name,
      isAdmin: session.user.isAdmin
    };
    return true;
  }
}
