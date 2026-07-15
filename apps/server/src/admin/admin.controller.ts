import { Controller, ForbiddenException, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthContext } from '../auth/auth.types';
import { AdminService } from './admin.service';

@ApiTags('admin')
@UseGuards(AuthGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}
  private assertAdmin(user: AuthContext) { if (!user.isAdmin) throw new ForbiddenException('需要管理员权限'); }
  @Get('overview') overview(@CurrentUser() user: AuthContext) { this.assertAdmin(user); return this.admin.overview(); }
  @Get('jobs') jobs(@CurrentUser() user: AuthContext) { this.assertAdmin(user); return this.admin.jobs(); }
}
