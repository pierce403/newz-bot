#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="${NEWZBOT_LOG_PATH:-"$ROOT_DIR/newzbot.log"}"
KEY_FILE="${NEWZBOT_KEY_PATH:-"$ROOT_DIR/newzbot.key"}"

echo "Starting newz.bot agent..."
echo "Log file: $LOG_FILE"
echo "Key file: $KEY_FILE"

# Ensure log file exists
touch "$LOG_FILE"

# Basic environment info
{
  echo "============================================================"
  echo "newz.bot agent start: $(date -Iseconds)"
  echo "Working directory: $ROOT_DIR"
  echo "Node version: $(node -v 2>/dev/null || echo 'node not found')"
} >>"$LOG_FILE"

# Install dependencies if node_modules is missing
if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
  echo "node_modules not found; running npm install..." | tee -a "$LOG_FILE"
  (cd "$ROOT_DIR" && npm install) >>"$LOG_FILE" 2>&1
fi

export NEWZBOT_LOG_PATH="$LOG_FILE"
export NEWZBOT_KEY_PATH="$KEY_FILE"

echo "Launching XMTP agent (tail -f $LOG_FILE to monitor)..." | tee -a "$LOG_FILE"

cd "$ROOT_DIR"
node agent/newzbot-agent-runtime.js
