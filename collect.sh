#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="${NEWZBOT_LOG_PATH:-"$ROOT_DIR/newzbot.log"}"

echo "Starting newz.bot collector..."
echo "Log file: $LOG_FILE"

touch "$LOG_FILE"

{
  echo "============================================================"
  echo "newz.bot collector run: $(date -Iseconds)"
  echo "Working directory: $ROOT_DIR"
  echo "Node version: $(node -v 2>/dev/null || echo 'node not found')"
} >>"$LOG_FILE"

if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
  echo "node_modules not found; running npm install..." | tee -a "$LOG_FILE"
  (cd "$ROOT_DIR" && npm install) >>"$LOG_FILE" 2>&1
fi

# Build agent/collector TypeScript to JavaScript if needed
if [[ ! -d "$ROOT_DIR/dist-agent" ]]; then
  echo "dist-agent not found; building agent bundle..." | tee -a "$LOG_FILE"
  (cd "$ROOT_DIR" && npx --no-install tsc -p tsconfig.agent.json) >>"$LOG_FILE" 2>&1
fi

export NEWZBOT_LOG_PATH="$LOG_FILE"

cd "$ROOT_DIR"
node dist-agent/agent/collect.js
