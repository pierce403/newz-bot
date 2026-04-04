# XMTP GDELT News Bot POC

Small TypeScript proof of concept for an XMTP bot that turns a topic into a compact news brief backed by GDELT.

Runtime requirement: Node.js 22+.

The bot supports:

- `news <topic>`
- `subscribe <topic>`
- `unsubscribe <topic>`
- `list subscriptions`
- `digest`
- `latest`
- `help`

Core behavior:

- XMTP message in
- topic parsing
- recent article retrieval from GDELT
- lightweight article clustering into situations
- compact chat formatting
- local subscription persistence
- simulated digest runner

## Stack

- Node.js + TypeScript
- `@xmtp/agent-sdk`
- GDELT Doc API
- local JSON persistence in `.data/subscriptions.json`
- built-in HTTP server for local testing
- Node test runner for unit tests

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create your env file:

```bash
cp .env.example .env
```

3. Optional but recommended:

- set `XMTP_WALLET_KEY` if you want to control the bot identity explicitly
- otherwise the runner will generate and persist a local wallet key at `.data/xmtp-wallet-key`
- the runner also persists a local XMTP DB encryption key at `.data/xmtp-db-encryption-key`
- `XMTP_ENV` defaults to `production` and the runner refuses `dev` or `local`

4. Build:

```bash
npm run build
```

## CLI Usage

Use the CLI to exercise the full core pipeline without XMTP:

```bash
node dist/cli.js "news semiconductor supply chain"
node dist/cli.js --user demo-user "subscribe ai safety"
node dist/cli.js --user demo-user "list subscriptions"
node dist/cli.js --user demo-user "digest"
```

Plain topics also work:

```bash
node dist/cli.js "semiconductor supply chain"
```

## HTTP Usage

Run the local HTTP wrapper:

```bash
npm run server
```

Then send commands:

```bash
curl -s http://localhost:8787/command \
  -H 'content-type: application/json' \
  -d '{"userId":"demo-user","text":"news ai safety"}'
```

Health check:

```bash
curl -s http://localhost:8787/health
```

## XMTP Usage

Run the XMTP listener:

```bash
npm run xmtp
```

Notes:

- The project defaults `XMTP_ENV` to `production`.
- If `XMTP_WALLET_KEY` is unset, the runner generates one on first start and reuses it from `.data/xmtp-wallet-key`.
- If `XMTP_DB_ENCRYPTION_KEY` is unset, the runner generates one on first start and reuses it from `.data/xmtp-db-encryption-key`.
- The local XMTP database is stored under `XMTP_DB_DIRECTORY`, which defaults to `.data/xmtp-agent`.
- Keep the same `XMTP_DB_DIRECTORY` across restarts. Changing it creates a new XMTP installation for the same inbox.
- The Agent SDK runner verifies address reachability on startup and fails fast if the agent is not discoverable on XMTP production.
- Before switching to XMTP production, verify the current XMTP funding and gateway requirements in the official docs.

## Digest Simulation

This POC includes a scheduler-compatible digest service and a console runner:

```bash
npm run digest
```

It loads all saved subscriptions and prints each user digest to stdout. That is the stand-in for a cron job or worker trigger.

## Tests

Unit tests:

```bash
npm test
```

Opt-in live GDELT integration test:

```bash
RUN_GDELT_INTEGRATION=1 npm run test:integration
```

## Behavior Notes

- Article retrieval uses the GDELT Doc API and then applies a small topic relevance pass before clustering.
- Clustering is heuristic, not embedding-based.
- Summaries are heuristic and do not require a paid LLM.
- Subscriptions are persisted locally in `.data/subscriptions.json`.
- Structured logs are emitted as JSON on stderr.
- GDELT can rate limit aggressive request bursts; the bot surfaces that as a friendly retry message.

## Project Layout

```text
src/
  app/
  clustering/
  commands/
  formatting/
  gdelt/
  news/
  scheduler/
  subscriptions/
  tests/
  xmtp/
```

## Related Docs

- XMTP Agent SDK: https://docs.xmtp.org/agents/build-agents/agent-sdk
- XMTP agents guide: https://docs.xmtp.org/llms/llms-agents.txt
- XMTP fund agents and apps: https://docs.xmtp.org/fund-agents-apps/get-started
- GDELT project: https://www.gdeltproject.org/
