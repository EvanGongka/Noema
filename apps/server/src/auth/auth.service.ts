import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { hash, verify } from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import type { LoginInput, MobileLoginInput, MobileRefreshInput, MobileRegisterInput, RegisterInput } from '@ai-note/schemas';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthContext } from './auth.types';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(input: RegisterInput) {
    const exists = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (exists) throw new ConflictException('该邮箱已注册');
    const user = await this.createUser(input);
    return this.createSession(user.id);
  }

  async login(input: LoginInput) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !(await verify(user.passwordHash, input.password))) throw new UnauthorizedException('邮箱或密码错误');
    return this.createSession(user.id);
  }

  async logout(token?: string) {
    if (!token) return;
    await this.prisma.session.deleteMany({ where: { tokenHash: createHash('sha256').update(token).digest('hex') } });
  }

  async mobileRegister(input: MobileRegisterInput) {
    if (await this.prisma.user.findUnique({ where: { email: input.email } })) throw new ConflictException('该邮箱已注册');
    const user = await this.createUser(input);
    return this.createMobileSession(user.id, input.deviceId, input.deviceName);
  }

  async mobileLogin(input: MobileLoginInput) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !(await verify(user.passwordHash, input.password))) throw new UnauthorizedException('邮箱或密码错误');
    return this.createMobileSession(user.id, input.deviceId, input.deviceName);
  }

  async mobileRefresh(input: MobileRefreshInput) {
    const refreshTokenHash = this.hashToken(input.refreshToken);
    const current = await this.prisma.session.findUnique({ where: { refreshTokenHash } });
    if (!current || current.kind !== 'MOBILE' || current.deviceId !== input.deviceId) throw new UnauthorizedException('刷新令牌无效');
    if (current.revokedAt || !current.refreshExpiresAt || current.refreshExpiresAt <= new Date()) {
      await this.prisma.session.updateMany({ where: { userId: current.userId, deviceId: input.deviceId, kind: 'MOBILE' }, data: { revokedAt: new Date() } });
      throw new UnauthorizedException('刷新令牌已失效');
    }
    return this.prisma.$transaction(async (tx) => {
      const revoked = await tx.session.updateMany({ where: { id: current.id, revokedAt: null }, data: { revokedAt: new Date(), lastUsedAt: new Date() } });
      if (!revoked.count) throw new UnauthorizedException('刷新令牌已被使用');
      return this.createMobileSession(current.userId, input.deviceId, current.deviceName ?? 'iOS 设备', tx);
    });
  }

  async logoutSession(sessionId: string) {
    await this.prisma.session.updateMany({ where: { id: sessionId }, data: { revokedAt: new Date() } });
  }

  async deleteAccount(user: AuthContext, password: string) {
    const account = await this.prisma.user.findUnique({ where: { id: user.userId } });
    if (!account || !(await verify(account.passwordHash, password))) throw new UnauthorizedException('密码错误');
    await this.prisma.user.delete({ where: { id: user.userId } });
  }

  private async createSession(userId: string) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.prisma.session.create({ data: { userId, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt } });
    return { token, expiresAt };
  }

  private async createUser(input: RegisterInput) {
    const isAdmin = input.email === process.env.ADMIN_EMAIL?.toLowerCase();
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: { email: input.email, name: input.name, passwordHash: await hash(input.password), isAdmin } });
      const workspace = await tx.workspace.create({ data: { name: `${input.name}的知识库`, ownerId: created.id } });
      await tx.workspaceMember.create({ data: { workspaceId: workspace.id, userId: created.id } });
      return created;
    });
  }

  private async createMobileSession(userId: string, deviceId: string, deviceName: string, database: Pick<PrismaService, 'session' | 'user'> = this.prisma) {
    const accessToken = randomBytes(32).toString('base64url');
    const refreshToken = randomBytes(48).toString('base64url');
    const accessTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const refreshTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await database.session.create({ data: {
      userId, kind: 'MOBILE', deviceId, deviceName,
      tokenHash: this.hashToken(accessToken), refreshTokenHash: this.hashToken(refreshToken),
      expiresAt: accessTokenExpiresAt, refreshExpiresAt: refreshTokenExpiresAt, lastUsedAt: new Date()
    } });
    const user = await database.user.findUniqueOrThrow({ where: { id: userId }, include: { memberships: { orderBy: { id: 'asc' }, take: 1 } } });
    const membership = user.memberships[0];
    if (!membership) throw new UnauthorizedException('用户没有可用工作空间');
    return {
      accessToken, refreshToken,
      accessTokenExpiresAt: accessTokenExpiresAt.toISOString(), refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString(),
      user: { userId: user.id, workspaceId: membership.workspaceId, email: user.email, name: user.name, isAdmin: user.isAdmin }
    };
  }

  private hashToken(token: string) { return createHash('sha256').update(token).digest('hex'); }
}
