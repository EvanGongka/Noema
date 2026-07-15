import { Module } from '@nestjs/common';
import { AiProvidersModule } from '../ai-providers/ai-providers.module';
import { AiActionsController } from './ai-actions.controller';
import { AiActionsService } from './ai-actions.service';

@Module({ imports: [AiProvidersModule], controllers: [AiActionsController], providers: [AiActionsService] })
export class AiActionsModule {}
