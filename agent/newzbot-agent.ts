#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { Wallet } from 'ethers';
import { Agent, AgentError, ConversationContext, validHex } from '@xmtp/agent-sdk';
import { CommandRouter } from '@xmtp/agent-sdk/middleware';
import { createUser, createSigner } from '@xmtp/agent-sdk/user';
import { getUnsentItems, markItemsSent, type StoredNewsItem } from './news-store';

const LOG_PATH = process.env.NEWZBOT_LOG_PATH || path.resolve(process.cwd(), 'newzbot.log');
const KEY_PATH = process.env.NEWZBOT_KEY_PATH || path.resolve(process.cwd(), 'newzbot.key');
const STATE_PATH = process.env.NEWZBOT_STATE_PATH || path.resolve(process.cwd(), 'newzbot.state.json');
const XMTP_ENV = (
  (process.env.NEWZBOT_XMTP_ENV || process.env.XMTP_ENV || 'production') as string
).toLowerCase() as 'local' | 'dev' | 'production';

const FEED_INTERVAL_MS = Number.parseInt(process.env.NEWZBOT_FEED_INTERVAL_MS || '60000', 10);
const MAX_ITEMS_PER_TICK = Number.parseInt(process.env.NEWZBOT_MAX_ITEMS_PER_TICK || '5', 10);

type SubscriberState = {
  subscriberAddress?: string;
};

function log(message: string) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(LOG_PATH, line);
  process.stdout.write(line);
}

function ensureKeypair(): string {
  if (fs.existsSync(KEY_PATH)) {
    const existing = fs.readFileSync(KEY_PATH, 'utf8').trim();
    log(`Using existing key at ${KEY_PATH}`);
    return existing;
  }

  const wallet = Wallet.createRandom();
  fs.writeFileSync(KEY_PATH, wallet.privateKey, { mode: 0o600 });
  log(`Created new wallet and saved private key to ${KEY_PATH}`);
  return wallet.privateKey;
}

function loadState(): SubscriberState {
  try {
    if (!fs.existsSync(STATE_PATH)) {
      return {};
    }
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<SubscriberState>;
    return {
      subscriberAddress: parsed.subscriberAddress,
    };
  } catch (err) {
    log(`Failed to load state, starting fresh: ${(err as Error).message}`);
    return {};
  }
}

function saveState(state: SubscriberState) {
  try {
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  } catch (err) {
    log(`Failed to save state: ${(err as Error).message}`);
  }
}

function formatNewsText(item: Pick<StoredNewsItem, 'title' | 'link' | 'pubDate'>): string {
  const datePart = item.pubDate ? ` – ${item.pubDate}` : '';
  return `📰 ${item.title}${datePart}\n${item.link}`;
}

async function sendNewItemsToSubscriber(agent: Agent, state: SubscriberState, isFirstRun: boolean) {
  const newItems = getUnsentItems(MAX_ITEMS_PER_TICK);

  if (!state.subscriberAddress) {
    if (!isFirstRun && newItems.length) {
      log(`Found ${newItems.length} new DB items but no subscriber; skipping send.`);
    }
    return;
  }

  if (!newItems.length) {
    if (!isFirstRun) {
      log('No new DB items to send.');
    }
    return;
  }

  const dm = await agent.createDmWithAddress(validHex(state.subscriberAddress));
  const ctx = new ConversationContext({ conversation: dm, client: agent.client });

  const itemsToSend = newItems;
  log(`Sending ${itemsToSend.length} new DB items to subscriber ${state.subscriberAddress}.`);

  for (const item of itemsToSend) {
    const text = formatNewsText(item);
    await ctx.sendText(text);
    log(`Sent item: ${item.title}`);
  }

  markItemsSent(itemsToSend.map((item) => item.id));
}

async function runFeedLoop(agent: Agent, state: SubscriberState) {
  log(`Starting feed loop. intervalMs=${FEED_INTERVAL_MS}`);
  let isFirstRun = true;

  // Immediately check once on startup, then on interval.
  while (true) {
    try {
      await sendNewItemsToSubscriber(agent, state, isFirstRun);
      isFirstRun = false;
    } catch (err) {
      log(`Feed loop error: ${(err as Error).message}`);
    }

    await new Promise((resolve) => setTimeout(resolve, FEED_INTERVAL_MS));
  }
}

async function main() {
  log('Starting newzbot XMTP agent...');
  log(`XMTP environment: ${XMTP_ENV}`);

  const privateKey = ensureKeypair();
  const state = loadState();

  const user = createUser(validHex(privateKey));
  const signer = createSigner(user);

  const agent = await Agent.create(signer, {
    env: XMTP_ENV,
    dbPath: path.resolve(process.cwd(), `newzbot-xmtp-${XMTP_ENV}.db3`),
  });

  const router = new CommandRouter();

  router.command('/start', async (ctx) => {
    const sender = await ctx.getSenderAddress();
    if (!sender) {
      await ctx.sendTextReply('Unable to determine your address; cannot subscribe.');
      return;
    }

    const previous = state.subscriberAddress;
    state.subscriberAddress = sender;
    saveState(state);

    if (!previous) {
      log(`Registered new subscriber: ${sender}`);
      await ctx.sendTextReply('Subscribed to newz.bot feed. You will receive new items as they appear.');
    } else if (previous !== sender) {
      log(`Switched subscriber from ${previous} to ${sender}`);
      await ctx.sendTextReply('Subscription updated to this wallet. You will receive new items here.');
    } else {
      await ctx.sendTextReply('You are already subscribed to the newz.bot feed.');
    }
  });

  router.command('/stop', async (ctx) => {
    const sender = await ctx.getSenderAddress();
    if (!sender) {
      await ctx.sendTextReply('Unable to determine your address; cannot update subscription.');
      return;
    }

    if (state.subscriberAddress === sender) {
      state.subscriberAddress = undefined;
      saveState(state);
      log(`Subscriber ${sender} unsubscribed.`);
      await ctx.sendTextReply('Unsubscribed from newz.bot feed. You will no longer receive updates.');
    } else if (!state.subscriberAddress) {
      await ctx.sendTextReply('You are not currently subscribed.');
    } else {
      await ctx.sendTextReply('Another wallet is currently subscribed. Use /start from that wallet to manage the subscription.');
    }
  });

  router.default(async (ctx) => {
    await ctx.sendTextReply('Commands: /start to subscribe, /stop to unsubscribe.');
  });

  agent.use(router.middleware());

  agent.on('text', async (ctx) => {
    const sender = await ctx.getSenderAddress();
    log(`Received text from ${sender || 'unknown'}: ${ctx.message.content}`);
  });

  agent.on('unhandledError', (error) => {
    if (error instanceof AgentError) {
      log(`Unhandled AgentError (${error.code}): ${error.message}`);
    } else {
      log(`Unhandled error: ${(error as Error).message}`);
    }
  });

  agent.on('start', (ctx) => {
    const addr = ctx.getClientAddress();
    log(`Agent online. Address: ${addr || 'unknown'}`);
  });

  agent.on('stop', () => {
    log('Agent stopped.');
  });

  await agent.start();
  log('Agent has started; entering feed loop.');

  await runFeedLoop(agent, state);
}

main().catch((err) => {
  log(`Fatal error: ${(err as Error).message}`);
  process.exit(1);
});
