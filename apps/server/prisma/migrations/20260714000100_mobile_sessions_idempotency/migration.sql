CREATE TYPE "SessionKind" AS ENUM ('WEB', 'MOBILE');

ALTER TABLE "Session"
ADD COLUMN "refreshTokenHash" TEXT,
ADD COLUMN "kind" "SessionKind" NOT NULL DEFAULT 'WEB',
ADD COLUMN "deviceId" TEXT,
ADD COLUMN "deviceName" TEXT,
ADD COLUMN "refreshExpiresAt" TIMESTAMP(3),
ADD COLUMN "lastUsedAt" TIMESTAMP(3),
ADD COLUMN "revokedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Session_refreshTokenHash_key" ON "Session"("refreshTokenHash");
CREATE INDEX "Session_userId_deviceId_kind_idx" ON "Session"("userId", "deviceId", "kind");

CREATE TABLE "IdempotencyRecord" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "statusCode" INTEGER NOT NULL,
  "response" JSONB,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IdempotencyRecord_userId_workspaceId_key_method_path_key"
ON "IdempotencyRecord"("userId", "workspaceId", "key", "method", "path");
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

ALTER TABLE "IdempotencyRecord"
ADD CONSTRAINT "IdempotencyRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IdempotencyRecord"
ADD CONSTRAINT "IdempotencyRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
