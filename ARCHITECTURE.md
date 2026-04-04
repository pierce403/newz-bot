# Architecture

## Goal

Keep transport-specific code thin and keep the news pipeline reusable.

## Flow

1. A command arrives from CLI, HTTP, or XMTP.
2. `src/commands/parser.ts` normalizes the input into an internal command shape.
3. `src/app/botApp.ts` routes the command.
4. For news requests:
   - `src/gdelt/gdeltNewsProvider.ts` fetches recent GDELT articles.
   - `src/news/topicRelevance.ts` ranks and filters results for the requested topic.
   - `src/clustering/simpleClusterer.ts` groups related articles into situations.
   - `src/news/heuristicSummarizer.ts` creates a short title and summary for each cluster.
   - `src/formatting/chatFormatter.ts` renders a compact chat response.
5. For subscription commands:
   - `src/subscriptions/fileSubscriptionStore.ts` persists topics per XMTP user inbox ID.
6. For digest commands:
   - `src/scheduler/digestService.ts` re-runs the news pipeline for each stored topic and updates `lastDeliveredAt`.

## Main Components

- `BotApp`
  - transport-agnostic application layer
  - all command handling goes through here

- `NewsService`
  - orchestrates provider -> relevance -> clustering -> summarization

- `GdeltNewsProvider`
  - isolated news backend adapter
  - normalizes raw GDELT data into a stable internal `Article` shape

- `SimpleClusterer`
  - lightweight headline/entity overlap clustering
  - intentionally heuristic for the POC

- `HeuristicSummarizer`
  - no-LLM summary fallback
  - can be replaced later by an LLM-backed summarizer behind the same interface

- `FileSubscriptionStore`
  - local persistence
  - simple and inspectable
  - good enough for a single-process POC

- `XmtpAgentRunner`
  - XMTP Agent SDK-specific listener and reply loop
  - converts incoming XMTP messages into `BotApp.handleMessage(...)`
  - verifies production reachability before advertising the bot address

## Why This Split

- XMTP is a transport concern, not a news concern.
- GDELT is a provider concern, not a formatter concern.
- Summarization is isolated so the bot still works without an LLM.
- Subscription storage is isolated so it can later move from JSON to SQLite or Postgres without changing the command or news pipeline.

## Current Tradeoffs

- JSON storage instead of SQLite for minimum setup.
- heuristic relevance and clustering instead of embeddings.
- no outbound queue, retry worker, or delivery ledger.
- digest runner is cron-compatible but simulated locally through `npm run digest`.

## Extension Points

- swap `GdeltNewsProvider` for additional backends
- add a second-pass LLM summarizer
- replace JSON store with SQLite
- add source diversity scoring and balancing
- add abuse controls and per-user rate limits
- add scheduled delivery over XMTP using a dedicated transport wrapper around the Agent SDK
