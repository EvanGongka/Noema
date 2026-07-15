FROM node:22-bookworm-slim AS node-base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare pnpm@11.0.8 --activate

FROM node-base AS build
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/ai-worker/package.json apps/ai-worker/package.json
COPY packages/ai-core/package.json packages/ai-core/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/schemas/package.json packages/schemas/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY apps/server apps/server
COPY apps/web apps/web
COPY apps/ai-worker apps/ai-worker
COPY packages packages

ENV NEXT_PUBLIC_API_URL=/api/v1
ENV API_INTERNAL_URL=http://127.0.0.1:4000/api/v1
RUN pnpm db:generate \
    && pnpm build \
    && pnpm --filter @ai-note/server --prod deploy --legacy /opt/ainote/server \
    && pnpm --filter @ai-note/ai-worker --prod deploy --legacy /opt/ainote/worker \
    && cd /opt/ainote/server \
    && node node_modules/prisma/build/index.js generate --schema prisma/schema.prisma \
    && rm -f /opt/ainote/worker/node_modules/@prisma/client \
    && ln -s /opt/ainote/server/node_modules/@prisma/client /opt/ainote/worker/node_modules/@prisma/client \
    && cd /app \
    && mkdir -p /opt/ainote/web/apps/web/.next \
    && cp -a apps/web/.next/standalone/. /opt/ainote/web/ \
    && cp -a apps/web/.next/static /opt/ainote/web/apps/web/.next/static

FROM pgvector/pgvector:pg16-bookworm AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl redis-server supervisor \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --create-home --home-dir /home/ainote --shell /usr/sbin/nologin ainote

COPY --from=node-base /usr/local/bin/node /usr/local/bin/node
COPY --from=build /opt/ainote /opt/ainote
COPY docker/entrypoint.sh /usr/local/bin/ainote-entrypoint
COPY docker/supervisord.conf /etc/supervisor/conf.d/ainote.conf

ENV NODE_ENV=production \
    PORT=4000 \
    HOSTNAME=0.0.0.0 \
    WEB_URL=http://localhost:3000 \
    API_INTERNAL_URL=http://127.0.0.1:4000/api/v1 \
    REDIS_URL=redis://127.0.0.1:6379 \
    PGDATA=/data/postgres \
    ENABLE_AI_WORKER=false

VOLUME ["/data"]
EXPOSE 3000 4000

HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
  CMD curl --fail --silent http://127.0.0.1:3000/ >/dev/null \
      && curl --fail --silent http://127.0.0.1:4000/api/v1/health >/dev/null \
      || exit 1

ENTRYPOINT ["/usr/local/bin/ainote-entrypoint"]
