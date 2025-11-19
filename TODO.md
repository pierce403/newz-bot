## newz.bot Development Plan

This file tracks the high‑level roadmap for newz.bot, adapted from the initial development plan.

### Phase 1: Architecture & Shared Protocol
- [x] Define Content Type Schema
  - [x] Create JSON schema for `NewsCard` (headline, summary, sentiment, tags, url, image, timestamp).
  - [x] Define `contentFallback` strategy (e.g., "📰 {headline} (View: newz.bot)").
- [ ] Repo Setup
  - [ ] Decide on project structure (monorepo vs. separate `backend-dgx` and `frontend-web`).
  - [ ] Install core dependencies: `@xmtp/xmtp-js`, `ethers`, `thirdweb`.

### Phase 2: The Backend (DGX "Power Plant")
#### Python "Brain" (Ingestion & AI)
- [ ] Ingestion Pipeline
  - [ ] Set up RSS/API scrapers for target crypto news sources.
  - [ ] Implement deduplication logic.
- [ ] Intelligence Layer
  - [ ] Set up local LLM (Llama 3 / Mixtral) on DGX for summarization.
  - [ ] Implement "Information Density" scoring to filter clickbait.
  - [ ] Implement vector embedding generation for news items.
- [ ] Database
  - [ ] Set up Postgres/Redis for user preferences and subscription status.
  - [ ] Set up Vector DB (Pinecone/pgvector) for relevance matching.

#### Node.js "Mouth" (XMTP Sender)
- [ ] Custom Codec Implementation
  - [ ] Implement `NewsCardCodec` in TypeScript.
  - [ ] Ensure `contentFallback` is correctly populated during encoding.
- [ ] Sender Service
  - [ ] Create a local API/Script that accepts JSON from Python and sends via XMTP.
  - [ ] Implement `NewsCardCodec` registration in the XMTP client.
- [ ] Command Handler
  - [ ] Listen for incoming text messages.
  - [ ] Parse commands: `/start`, `/stop`, `/toggle {topic}`.
  - [ ] Update Postgres/Redis based on user commands.
  - [ ] Send confirmation replies (standard text messages).

### Phase 3: The Frontend (newz.bot)
#### Core Infrastructure
- [x] Scaffolding
  - [x] Initialize React / Next.js project (Static export configuration).
  - [ ] Configure Thirdweb SDK for wallet connection.
- [ ] XMTP Integration
  - [ ] Register `NewsCardCodec` in the browser XMTP client.
  - [ ] Implement `useNewsFeed` hook:
    - [ ] Load conversation history.
    - [ ] Filter for `ContentTypeNewsCard`.
    - [ ] Stream new messages in real-time.

#### UI/UX
- [x] News Feed Interface
  - [x] Create "Google Reader" style grid/list view.
  - [ ] Render `NewsCard` JSON into visual components (Images, Bold text, Tags).
  - [ ] Handle "Loading" and "Empty" states.
- [ ] Preference Controls
  - [ ] Add UI toggles for topics (e.g., "Solana", "L2s").
  - [ ] Wire toggles to send hidden XMTP commands (e.g., `/toggle solana`).

### Phase 4: Testing & Polish
- [ ] End-to-End Test
  - [ ] Run Python ingestion -> Node Sender -> XMTP Network -> Frontend Render.
- [ ] Client Compatibility Check
  - [ ] Verify fallback text appears correctly on Coinbase Wallet / Converse.
- [ ] Deployment
  - [ ] Deploy frontend to IPFS/Vercel/GitHub Pages.
  - [ ] Set up process monitoring (PM2/Docker) for DGX backend services.
