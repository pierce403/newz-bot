#!/usr/bin/env bash
set -euo pipefail

# Ensure node_modules exist
if [[ ! -d "node_modules" ]]; then
  pnpm install
fi

if [[ -n "${1:-}" ]]; then
  export NEWZBOT_OPERATOR_ADDRESS="$1"
  echo "Using operator address: $NEWZBOT_OPERATOR_ADDRESS"
fi

npx tsx hello.ts
