#!/bin/sh
set -eu

PGDATA="${PGDATA:-/data/postgres}"
REDIS_DATA_DIR="${REDIS_DATA_DIR:-/data/redis}"
DATABASE_NAME="${POSTGRES_DB:-ainote}"
DATABASE_USER="${POSTGRES_USER:-ainote}"

mkdir -p "$PGDATA" "$REDIS_DATA_DIR"
chown -R postgres:postgres "$PGDATA"
chown -R redis:redis "$REDIS_DATA_DIR"

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  echo "[知流] 正在初始化内置 PostgreSQL 数据库……"
  gosu postgres initdb \
    --pgdata="$PGDATA" \
    --username="$DATABASE_USER" \
    --auth-local=trust \
    --auth-host=trust \
    --encoding=UTF8 \
    --locale=C.UTF-8
fi

if [ -z "${DATABASE_URL:-}" ]; then
  export DATABASE_URL="postgresql://${DATABASE_USER}@127.0.0.1:5432/${DATABASE_NAME}?schema=public"
fi
export REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"

temporary_postgres_started=false
stop_temporary_postgres() {
  if [ "$temporary_postgres_started" = true ]; then
    gosu postgres pg_ctl --pgdata="$PGDATA" --mode=fast --wait stop >/dev/null 2>&1 || true
  fi
}
trap stop_temporary_postgres EXIT INT TERM

echo "[知流] 正在检查数据库并应用迁移……"
gosu postgres pg_ctl \
  --pgdata="$PGDATA" \
  --options="-c listen_addresses=127.0.0.1" \
  --wait start >/dev/null
temporary_postgres_started=true

if ! gosu postgres psql --host=127.0.0.1 --username="$DATABASE_USER" --dbname=postgres \
  --tuples-only --no-align --command="SELECT 1 FROM pg_database WHERE datname = '${DATABASE_NAME}'" | grep -q '^1$'; then
  gosu postgres createdb --host=127.0.0.1 --username="$DATABASE_USER" "$DATABASE_NAME"
fi

node /opt/ainote/server/node_modules/prisma/build/index.js \
  migrate deploy \
  --schema /opt/ainote/server/prisma/schema.prisma

stop_temporary_postgres
temporary_postgres_started=false
trap - EXIT INT TERM

echo "[知流] 启动 Web（3000）、API（4000）及内置数据服务……"
exec /usr/bin/supervisord --configuration /etc/supervisor/conf.d/ainote.conf
