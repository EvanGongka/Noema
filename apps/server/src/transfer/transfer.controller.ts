import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { importSchema } from '@ai-note/schemas';
import type { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthContext } from '../auth/auth.types';
import { parseInput } from '../common/zod';
import { TransferService } from './transfer.service';

@ApiTags('transfer')
@UseGuards(AuthGuard)
@Controller('transfer')
export class TransferController {
  constructor(private readonly transfer: TransferService) {}
  @Post('import') import(@CurrentUser() user: AuthContext, @Body() body: unknown) {
    const input = parseInput(importSchema, body);
    return this.transfer.import(user.workspaceId, user.userId, input.filename, input.content);
  }
  @Get('notes/:id/export') async exportNote(@CurrentUser() user: AuthContext, @Param('id') id: string, @Query('format') format: 'markdown' | 'json' = 'markdown', @Res() response: Response) {
    const safeFormat = format === 'json' ? 'json' : 'markdown';
    const content = await this.transfer.exportNote(user.workspaceId, id, safeFormat);
    response.type(safeFormat === 'json' ? 'application/json' : 'text/markdown').send(content);
  }
  @Get('workspace/export') async exportWorkspace(@CurrentUser() user: AuthContext, @Res() response: Response) {
    response.type('application/json').send(await this.transfer.exportWorkspace(user.workspaceId));
  }
}
