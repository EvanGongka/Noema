import { Module } from '@nestjs/common';
import { AiSuggestionsController } from './ai-suggestions.controller';
import { AiSuggestionsService } from './ai-suggestions.service';

@Module({ controllers: [AiSuggestionsController], providers: [AiSuggestionsService] })
export class AiSuggestionsModule {}
