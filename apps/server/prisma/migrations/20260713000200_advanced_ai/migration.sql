ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'WAITING_CONFIGURATION';

CREATE TYPE "AiProvider" AS ENUM ('OPENAI_COMPATIBLE', 'ANTHROPIC', 'GEMINI', 'OLLAMA');
CREATE TYPE "ConversationMode" AS ENUM ('KNOWLEDGE', 'GENERAL');
CREATE TYPE "ConversationScope" AS ENUM ('NOTE', 'FOLDER', 'WORKSPACE');
CREATE TYPE "AiRunKind" AS ENUM ('CHAT', 'ACTION');
CREATE TYPE "AiRunStatus" AS ENUM ('PENDING', 'STREAMING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "AnswerType" AS ENUM ('GROUNDED', 'GENERAL', 'INSUFFICIENT');

CREATE TABLE "AiProviderConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "AiProvider" NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "encryptedApiKey" TEXT,
    "apiKeyMask" TEXT,
    "chatModel" TEXT NOT NULL,
    "embeddingModel" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isDefaultChat" BOOLEAN NOT NULL DEFAULT false,
    "isDefaultEmbedding" BOOLEAN NOT NULL DEFAULT false,
    "capabilities" JSONB,
    "lastValidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiProviderConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerConfigId" TEXT,
    "conversationId" TEXT,
    "messageId" TEXT,
    "kind" "AiRunKind" NOT NULL,
    "status" "AiRunStatus" NOT NULL DEFAULT 'PENDING',
    "action" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "cancelRequestedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiRun_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Conversation"
    ADD COLUMN "createdById" TEXT,
    ADD COLUMN "providerConfigId" TEXT,
    ADD COLUMN "noteId" TEXT,
    ADD COLUMN "folderId" TEXT,
    ADD COLUMN "mode" "ConversationMode" NOT NULL DEFAULT 'KNOWLEDGE',
    ADD COLUMN "scope" "ConversationScope" NOT NULL DEFAULT 'WORKSPACE',
    ADD COLUMN "model" TEXT,
    ADD COLUMN "archivedAt" TIMESTAMP(3);

UPDATE "Conversation" AS c
SET "createdById" = w."ownerId"
FROM "Workspace" AS w
WHERE c."workspaceId" = w."id";

ALTER TABLE "Conversation" ALTER COLUMN "createdById" SET NOT NULL;

ALTER TABLE "Message"
    ADD COLUMN "providerConfigId" TEXT,
    ADD COLUMN "parentMessageId" TEXT,
    ADD COLUMN "status" "AiRunStatus" NOT NULL DEFAULT 'COMPLETED',
    ADD COLUMN "answerType" "AnswerType",
    ADD COLUMN "model" TEXT,
    ADD COLUMN "inputTokens" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "outputTokens" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "error" TEXT,
    ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Citation"
    ADD COLUMN "ordinal" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "sourceUpdatedAt" TIMESTAMP(3);

ALTER TABLE "AiJob"
    ADD COLUMN "requestedByUserId" TEXT,
    ADD COLUMN "providerConfigId" TEXT;

CREATE UNIQUE INDEX "AiProviderConfig_userId_name_key" ON "AiProviderConfig"("userId", "name");
CREATE INDEX "AiProviderConfig_userId_enabled_idx" ON "AiProviderConfig"("userId", "enabled");
CREATE INDEX "Conversation_workspaceId_createdById_updatedAt_idx" ON "Conversation"("workspaceId", "createdById", "updatedAt");
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");
CREATE UNIQUE INDEX "AiRun_messageId_key" ON "AiRun"("messageId");
CREATE INDEX "AiRun_workspaceId_userId_createdAt_idx" ON "AiRun"("workspaceId", "userId", "createdAt");
CREATE INDEX "AiRun_status_createdAt_idx" ON "AiRun"("status", "createdAt");

ALTER TABLE "AiProviderConfig" ADD CONSTRAINT "AiProviderConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_providerConfigId_fkey" FOREIGN KEY ("providerConfigId") REFERENCES "AiProviderConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_providerConfigId_fkey" FOREIGN KEY ("providerConfigId") REFERENCES "AiProviderConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_parentMessageId_fkey" FOREIGN KEY ("parentMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiJob" ADD CONSTRAINT "AiJob_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiJob" ADD CONSTRAINT "AiJob_providerConfigId_fkey" FOREIGN KEY ("providerConfigId") REFERENCES "AiProviderConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_providerConfigId_fkey" FOREIGN KEY ("providerConfigId") REFERENCES "AiProviderConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
