import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { notePatchSchema, noteSchema } from '@ai-note/schemas';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthContext } from '../auth/auth.types';
import { parseInput } from '../common/zod';
import { NotesService } from './notes.service';

@ApiTags('notes')
@UseGuards(AuthGuard)
@Controller('notes')
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get()
  list(@CurrentUser() user: AuthContext, @Query('status') status?: 'INBOX' | 'ACTIVE' | 'ARCHIVED') { return this.notes.list(user.workspaceId, status); }

  @Get(':id')
  get(@CurrentUser() user: AuthContext, @Param('id') id: string) { return this.notes.get(user.workspaceId, id); }

  @Post()
  create(@CurrentUser() user: AuthContext, @Body() body: unknown) { return this.notes.create(user.workspaceId, user.userId, parseInput(noteSchema, body)); }

  @Patch(':id')
  update(@CurrentUser() user: AuthContext, @Param('id') id: string, @Body() body: unknown) { return this.notes.update(user.workspaceId, user.userId, id, parseInput(notePatchSchema, body)); }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthContext, @Param('id') id: string) { return this.notes.remove(user.workspaceId, user.userId, id); }

  @Get(':id/related')
  related(@CurrentUser() user: AuthContext, @Param('id') id: string) { return this.notes.related(user.workspaceId, id); }
}
