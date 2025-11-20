#!/usr/bin/env bash
set -euo pipefail

# Ensure node_modules exist
if [[ ! -d "node_modules" ]]; then
  pnpm install
fi

npx tsx hello.ts
