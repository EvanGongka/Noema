import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  aiActionApplySchema,
  aiActionSchema,
  credentialBundleSchema,
  tagSuggestionSchema,
} from "@ai-note/schemas";
import type { Request, Response } from "express";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthContext } from "../auth/auth.types";
import { parseInput } from "../common/zod";
import { AiActionsService, type ActionStreamEvent } from "./ai-actions.service";

@ApiTags("ai-actions")
@UseGuards(AuthGuard)
@Controller("ai")
export class AiActionsController {
  constructor(private readonly actions: AiActionsService) {}

  @Post("notes/:id/tag-suggestions")
  suggestTags(
    @CurrentUser() user: AuthContext,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.actions.suggestTags(
      user,
      id,
      parseInput(tagSuggestionSchema, body),
    );
  }

  @Post("actions/stream")
  async stream(
    @CurrentUser() user: AuthContext,
    @Body() body: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    response.status(200);
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders();
    let runId: string | undefined;
    let finished = false;
    request.on("close", () => {
      if (!finished && runId)
        void this.actions.cancel(user, runId).catch(() => undefined);
    });
    try {
      for await (const event of this.actions.stream(
        user,
        parseInput(aiActionSchema, body),
      )) {
        if (event.type === "meta") runId = event.runId;
        response.write(
          `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
        );
      }
      finished = true;
    } finally {
      response.end();
    }
  }

  @Post("runs/:id/apply")
  apply(
    @CurrentUser() user: AuthContext,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.actions.apply(user, id, parseInput(aiActionApplySchema, body));
  }

  @Post("runs/:id/cancel")
  cancel(@CurrentUser() user: AuthContext, @Param("id") id: string) {
    return this.actions.cancel(user, id);
  }

  @Get("jobs/waiting")
  waiting(@CurrentUser() user: AuthContext) {
    return this.actions.waiting(user);
  }

  @Post("jobs/:id/process/stream")
  async processWaiting(
    @CurrentUser() user: AuthContext,
    @Param("id") id: string,
    @Body() body: unknown,
    @Res() response: Response,
  ) {
    response.status(200);
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders();
    try {
      const input = parseInput(credentialBundleSchema, body);
      for await (const event of this.actions.processWaiting(
        user,
        id,
        input.credentials,
      )) {
        response.write(
          `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
        );
      }
    } finally {
      response.end();
    }
  }
}
