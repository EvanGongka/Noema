import { Module } from '@nestjs/common';
import { SearchModule } from '../search/search.module';
import { AiProvidersModule } from '../ai-providers/ai-providers.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({ imports: [SearchModule, AiProvidersModule], controllers: [ChatController], providers: [ChatService], exports: [ChatService] })
export class ChatModule {}
