#!/usr/bin/env bash
set -euo pipefail

# Ensure node_modules exist
if [[ ! -d "node_modules" ]]; then
  npm install
fi

node hello.js
