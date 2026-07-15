import { Body, Controller, Delete, Get, Param, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { askWithCredentialsSchema, chatMessageSchema, conversationCreateSchema, conversationPatchSchema, saveMessageToNoteSchema } from '@ai-note/schemas';
import type { Request, Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthContext } from '../auth/auth.types';
import { parseInput } from '../common/zod';
import { ChatService, type ChatStreamEvent } from './chat.service';

@ApiTags('chat')
@UseGuards(AuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post('ask')
  ask(@CurrentUser() user: AuthContext, @Body() body: unknown) { return this.chat.ask(user.workspaceId, user.userId, parseInput(askWithCredentialsSchema, body)); }

  @Get('history')
  history(@CurrentUser() user: AuthContext) { return this.chat.listConversations(user); }

  @Get('conversations')
  conversations(@CurrentUser() user: AuthContext) { return this.chat.listConversations(user); }

  @Post('conversations')
  createConversation(@CurrentUser() user: AuthContext, @Body() body: unknown) { return this.chat.createConversation(user, parseInput(conversationCreateSchema, body)); }

  @Get('conversations/:id')
  conversation(@CurrentUser() user: AuthContext, @Param('id') id: string) { return this.chat.getConversation(user, id); }

  @Patch('conversations/:id')
  updateConversation(@CurrentUser() user: AuthContext, @Param('id') id: string, @Body() body: unknown) { return this.chat.updateConversation(user, id, parseInput(conversationPatchSchema, body)); }

  @Delete('conversations/:id')
  deleteConversation(@CurrentUser() user: AuthContext, @Param('id') id: string) { return this.chat.deleteConversation(user, id); }

  @Post('conversations/:id/messages/stream')
  async streamMessage(@CurrentUser() user: AuthContext, @Param('id') id: string, @Body() body: unknown, @Req() request: Request, @Res() response: Response) {
    await this.writeStream(response, request, this.chat.streamMessage(user, id, parseInput(chatMessageSchema, body)), user);
  }

  @Post('messages/:id/regenerate/stream')
  async regenerate(@CurrentUser() user: AuthContext, @Param('id') id: string, @Body() body: unknown, @Req() request: Request, @Res() response: Response) {
    const input = parseInput(chatMessageSchema.omit({ content: true }), body);
    await this.writeStream(response, request, this.chat.regenerate(user, id, input), user);
  }

  @Post('runs/:id/cancel')
  cancel(@CurrentUser() user: AuthContext, @Param('id') id: string) { return this.chat.cancel(user, id); }

  @Post('messages/:id/save-to-note')
  saveToNote(@CurrentUser() user: AuthContext, @Param('id') id: string, @Body() body: unknown) { return this.chat.saveMessageToNote(user, id, parseInput(saveMessageToNoteSchema, body)); }

  private async writeStream(response: Response, request: Request, stream: AsyncGenerator<ChatStreamEvent>, user: AuthContext) {
    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();
    let runId: string | undefined; let finished = false;
    const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 15_000);
    request.on('close', () => { if (!finished && runId) void this.chat.cancel(user, runId).catch(() => undefined); });
    try {
      for await (const event of stream) {
        if (event.type === 'meta') runId = event.runId;
        response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      }
      finished = true;
    } finally {
      clearInterval(heartbeat);
      response.end();
    }
  }
}
