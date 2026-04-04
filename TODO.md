# TODO

## Production Hardening

- Replace the JSON subscription store with SQLite and add file locking or transaction safety.
- Add retry, backoff, and small response caching around GDELT requests.
- Add a delivery ledger so on-demand `latest` and scheduled `digest` can use different watermark semantics.
- Add rate limiting per XMTP inbox.
- Add moderation and abuse controls on inbound topics.
- Add metrics for fetch latency, cluster counts, send failures, and digest volume.
- Add source diversity scoring so clusters do not over-index one outlet family.
- Add scheduler wiring for cron, GitHub Actions, or a small worker process.
- Add better topic aliasing and optional entity/theme enrichment from GDELT metadata endpoints.
- Add a pluggable LLM summarizer behind the existing summarizer interface.
- Add chunking if a digest is too long for a single XMTP message.
- Add end-to-end XMTP integration tests once stable credentials and a test inbox are available.
- Revisit XMTP Agent SDK production enrollment after checking the latest funding and gateway requirements.
