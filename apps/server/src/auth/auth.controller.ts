import { Body, Controller, Delete, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { deleteAccountSchema, loginSchema, mobileLoginSchema, mobileRefreshSchema, mobileRegisterSchema, registerSchema } from '@ai-note/schemas';
import { parseInput } from '../common/zod';
import { AuthGuard, SESSION_COOKIE } from './auth.guard';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import type { AuthContext } from './auth.types';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const session = await this.auth.register(parseInput(registerSchema, body));
    this.setCookie(response, session.token, session.expiresAt);
    return { ok: true };
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const session = await this.auth.login(parseInput(loginSchema, body));
    this.setCookie(response, session.token, session.expiresAt);
    return { ok: true };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(request.cookies?.[SESSION_COOKIE] as string | undefined);
    response.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: AuthContext) { return user; }

  @Post('mobile/register')
  mobileRegister(@Body() body: unknown) {
    return this.auth.mobileRegister(parseInput(mobileRegisterSchema, body));
  }

  @Post('mobile/login')
  @HttpCode(200)
  mobileLogin(@Body() body: unknown) {
    return this.auth.mobileLogin(parseInput(mobileLoginSchema, body));
  }

  @Post('mobile/refresh')
  @HttpCode(200)
  mobileRefresh(@Body() body: unknown) {
    return this.auth.mobileRefresh(parseInput(mobileRefreshSchema, body));
  }

  @Post('mobile/logout')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  mobileLogout(@CurrentUser() user: AuthContext) { return this.auth.logoutSession(user.sessionId); }

  @Delete('account')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  deleteAccount(@CurrentUser() user: AuthContext, @Body() body: unknown) {
    return this.auth.deleteAccount(user, parseInput(deleteAccountSchema, body).password);
  }

  private setCookie(response: Response, token: string, expires: Date) {
    const secure = process.env.COOKIE_SECURE === 'true'
      || (!process.env.COOKIE_SECURE && process.env.WEB_URL?.startsWith('https://'));
    response.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure, expires, path: '/' });
  }
}
