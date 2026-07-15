import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthContext } from '../auth/auth.types';
import { parseInput } from '../common/zod';
import { AiSuggestionsService } from './ai-suggestions.service';

const fieldsSchema = z.object({ fields: z.array(z.enum(['title', 'summary', 'tags', 'tasks'])).min(1) });

@ApiTags('ai')
@UseGuards(AuthGuard)
@Controller('ai')
export class AiSuggestionsController {
  constructor(private readonly suggestions: AiSuggestionsService) {}
  @Get('suggestions') list(@CurrentUser() user: AuthContext, @Query('noteId') noteId?: string) { return this.suggestions.list(user.workspaceId, noteId); }
  @Post('suggestions/:id/apply') apply(@CurrentUser() user: AuthContext, @Param('id') id: string, @Body() body: unknown) {
    return this.suggestions.apply(user.workspaceId, user.userId, id, parseInput(fieldsSchema, body).fields);
  }
  @Post('suggestions/:id/dismiss') dismiss(@CurrentUser() user: AuthContext, @Param('id') id: string) { return this.suggestions.dismiss(user.workspaceId, user.userId, id); }
  @Get('usage') usage(@CurrentUser() user: AuthContext) { return this.suggestions.usage(user.workspaceId); }
}
