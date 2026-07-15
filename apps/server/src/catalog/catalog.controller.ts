import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { folderSchema, tagSchema } from '@ai-note/schemas';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthContext } from '../auth/auth.types';
import { parseInput } from '../common/zod';
import { CatalogService } from './catalog.service';

@ApiTags('catalog')
@UseGuards(AuthGuard)
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}
  @Get('folders') folders(@CurrentUser() user: AuthContext) { return this.catalog.folders(user.workspaceId); }
  @Post('folders') createFolder(@CurrentUser() user: AuthContext, @Body() body: unknown) {
    const input = parseInput(folderSchema, body);
    return this.catalog.createFolder(user.workspaceId, input.name, input.parentId);
  }
  @Get('tags') tags(@CurrentUser() user: AuthContext) { return this.catalog.tags(user.workspaceId); }
  @Post('tags') createTag(@CurrentUser() user: AuthContext, @Body() body: unknown) {
    const input = parseInput(tagSchema, body);
    return this.catalog.createTag(user.workspaceId, input.name, input.color);
  }
}
