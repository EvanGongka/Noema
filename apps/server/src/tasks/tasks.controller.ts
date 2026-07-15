import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { taskPatchSchema, taskSchema } from '@ai-note/schemas';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthContext } from '../auth/auth.types';
import { parseInput } from '../common/zod';
import { TasksService } from './tasks.service';

@ApiTags('tasks')
@UseGuards(AuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}
  @Get() list(@CurrentUser() user: AuthContext) { return this.tasks.list(user.workspaceId); }
  @Post() create(@CurrentUser() user: AuthContext, @Body() body: unknown) { return this.tasks.create(user.workspaceId, parseInput(taskSchema, body)); }
  @Patch(':id') update(@CurrentUser() user: AuthContext, @Param('id') id: string, @Body() body: unknown) {
    const input = parseInput(taskPatchSchema, body);
    return this.tasks.update(user.workspaceId, id, input.status);
  }
}
