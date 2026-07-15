import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { searchRequestSchema, searchSchema } from '@ai-note/schemas';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthContext } from '../auth/auth.types';
import { parseInput } from '../common/zod';
import { SearchService } from './search.service';

@ApiTags('search')
@UseGuards(AuthGuard)
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}
  @Get()
  search(@CurrentUser() user: AuthContext, @Query() query: unknown) {
    const input = parseInput(searchSchema, query);
    return this.searchService.search(user.workspaceId, user.userId, input.query, input);
  }

  @Post('query')
  query(@CurrentUser() user: AuthContext, @Body() body: unknown) {
    const input = parseInput(searchRequestSchema, body);
    return this.searchService.query(user.workspaceId, user.userId, input.query, input);
  }
}
