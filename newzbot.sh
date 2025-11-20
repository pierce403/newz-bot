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

# Check Node.js version
REQUIRED_NODE_MAJOR=20
NODE_VERSION=$(node -v 2>/dev/null || echo 'none')

if [[ "$NODE_VERSION" == "none" ]]; then
  echo "Error: Node.js is not installed or not in PATH."
  exit 1
fi

# Extract major version (e.g., v20.11.0 -> 20)
CURRENT_NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1 | sed 's/^v//')

if [[ "$CURRENT_NODE_MAJOR" -lt "$REQUIRED_NODE_MAJOR" ]]; then
  echo "Error: Node.js version is too old. Found $NODE_VERSION, but need Node v$REQUIRED_NODE_MAJOR or newer." | tee -a "$LOG_FILE"
  echo "Please upgrade Node.js to version $REQUIRED_NODE_MAJOR or higher."
  exit 1
fi

# Basic environment info
{
  echo "============================================================"
  echo "newz.bot agent start: $(date -Iseconds)"
  echo "Working directory: $ROOT_DIR"
  echo "Node version: $NODE_VERSION"
} >>"$LOG_FILE"

# Install dependencies if node_modules is missing
if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
  echo "node_modules not found; running pnpm install..." | tee -a "$LOG_FILE"
  (cd "$ROOT_DIR" && pnpm install) >>"$LOG_FILE" 2>&1
fi

export NEWZBOT_LOG_PATH="$LOG_FILE"
export NEWZBOT_KEY_PATH="$KEY_FILE"

echo "Launching XMTP agent (tail -f $LOG_FILE to monitor)..." | tee -a "$LOG_FILE"

cd "$ROOT_DIR"
npx tsx agent/newzbot-agent-runtime.ts
