import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { IdempotencyInterceptor } from './common/idempotency.interceptor';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { NotesModule } from './notes/notes.module';
import { SearchModule } from './search/search.module';
import { ChatModule } from './chat/chat.module';
import { TasksModule } from './tasks/tasks.module';
import { TransferModule } from './transfer/transfer.module';
import { AdminModule } from './admin/admin.module';
import { HealthController } from './health.controller';
import { CatalogModule } from './catalog/catalog.module';
import { AiSuggestionsModule } from './ai-suggestions/ai-suggestions.module';
import { AiProvidersModule } from './ai-providers/ai-providers.module';
import { AiActionsModule } from './ai-actions/ai-actions.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuthModule,
    NotesModule,
    SearchModule,
    ChatModule,
    TasksModule,
    TransferModule,
    AdminModule,
    CatalogModule,
    AiSuggestionsModule,
    AiProvidersModule,
    AiActionsModule
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor }
  ]
})
export class AppModule {}
