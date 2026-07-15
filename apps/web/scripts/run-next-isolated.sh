#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "用法：$0 <缓存目录> <Next.js 命令...>" >&2
  exit 1
fi

DIST_DIR="$1"
shift

WEB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TSCONFIG_FILE="$WEB_DIR/tsconfig.json"
NEXT_ENV_FILE="$WEB_DIR/next-env.d.ts"
BACKUP_DIR="$(mktemp -d)"

cp "$TSCONFIG_FILE" "$BACKUP_DIR/tsconfig.json"
cp "$NEXT_ENV_FILE" "$BACKUP_DIR/next-env.d.ts"

restore_typescript_files() {
  cp "$BACKUP_DIR/tsconfig.json" "$TSCONFIG_FILE"
  cp "$BACKUP_DIR/next-env.d.ts" "$NEXT_ENV_FILE"
  rm -rf "$BACKUP_DIR"
}

trap restore_typescript_files EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

cd "$WEB_DIR"
NEXT_DIST_DIR="$DIST_DIR" "$@"
