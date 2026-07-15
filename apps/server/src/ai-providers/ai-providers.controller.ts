import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { providerConfigPatchSchema, providerConfigSchema, providerCredentialSchema } from '@ai-note/schemas';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthContext } from '../auth/auth.types';
import { parseInput } from '../common/zod';
import { AiProvidersService } from './ai-providers.service';

@ApiTags('ai-providers')
@UseGuards(AuthGuard)
@Controller('ai/providers')
export class AiProvidersController {
  constructor(private readonly providers: AiProvidersService) {}

  @Get()
  list(@CurrentUser() user: AuthContext) { return this.providers.list(user.userId); }

  @Post()
  create(@CurrentUser() user: AuthContext, @Body() body: unknown) {
    return this.providers.create(user, parseInput(providerConfigSchema, body));
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthContext, @Param('id') id: string, @Body() body: unknown) {
    return this.providers.update(user, id, parseInput(providerConfigPatchSchema, body));
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthContext, @Param('id') id: string) { return this.providers.remove(user, id); }

  @Post(':id/test')
  test(@CurrentUser() user: AuthContext, @Param('id') id: string, @Body() body: unknown) {
    return this.providers.test(user.userId, id, parseInput(providerCredentialSchema, body).credentials);
  }

  @Post(':id/models')
  models(@CurrentUser() user: AuthContext, @Param('id') id: string, @Body() body: unknown) {
    return this.providers.models(user.userId, id, parseInput(providerCredentialSchema, body).credentials);
  }
}
