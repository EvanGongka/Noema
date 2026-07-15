import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { AiProvidersModule } from '../ai-providers/ai-providers.module';

@Module({ imports: [AiProvidersModule], controllers: [SearchController], providers: [SearchService], exports: [SearchService] })
export class SearchModule {}
