#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const process = require('node:process');
const { Wallet } = require('ethers');
const {
  getUnsentItems,
  markItemsSent,
  searchNewsItems,
  listRecentItems,
  listFeeds,
  addFeed,
  deleteFeed,
} = require('../dist-agent/agent/news-store.js');

const LOG_PATH = process.env.NEWZBOT_LOG_PATH || path.resolve(process.cwd(), 'newzbot.log');
const KEY_PATH = process.env.NEWZBOT_KEY_PATH || path.resolve(process.cwd(), 'newzbot.key');
const STATE_PATH = process.env.NEWZBOT_STATE_PATH || path.resolve(process.cwd(), 'newzbot.state.json');
const XMTP_ENV = (process.env.NEWZBOT_XMTP_ENV || process.env.XMTP_ENV || 'production').toLowerCase();
const FEED_INTERVAL_MS = Number.parseInt(process.env.NEWZBOT_FEED_INTERVAL_MS || '60000', 10);
const MAX_ITEMS_PER_TICK = Number.parseInt(process.env.NEWZBOT_MAX_ITEMS_PER_TICK || '5', 10);
const OWNER_NAME = 'deanpierce.eth';
const ROOT_DIR = path.resolve(__dirname, '..');

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(LOG_PATH, line);
  process.stdout.write(line);
}

function ensureKeypair() {
  if (fs.existsSync(KEY_PATH)) {
    const existing = fs.readFileSync(KEY_PATH, 'utf8').trim();
    const wallet = new Wallet(existing);
    log(`Using existing key at ${KEY_PATH}`);
    log(`Bot wallet address: ${wallet.address}`);
    return existing;
  }

  const wallet = Wallet.createRandom();
  fs.writeFileSync(KEY_PATH, wallet.privateKey, { mode: 0o600 });
  log(`Created new wallet and saved private key to ${KEY_PATH}`);
  log(`Bot wallet address: ${wallet.address}`);
  return wallet.privateKey;
}

function loadState() {
  try {
    if (!fs.existsSync(STATE_PATH)) {
      return {};
    }
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      subscriberAddress: parsed.subscriberAddress,
      ownerHasContacted: Boolean(parsed.ownerHasContacted),
    };
  } catch (err) {
    log(`Failed to load state, starting fresh: ${err.message}`);
    return {};
  }
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  } catch (err) {
    log(`Failed to save state: ${err.message}`);
  }
}

function formatNewsText(item) {
  const datePart = item.pubDate ? ` – ${item.pubDate}` : '';
  return `📰 ${item.title}${datePart}\n${item.link}`;
}

function formatSource(item) {
  if (item.source) {
    return item.source;
  }
  if (item.link) {
    try {
      // new URL requires an absolute URL; wrap in try/catch to avoid crashes.
      const url = new URL(item.link);
      return url.hostname;
    } catch {
      // fall through
    }
  }
  return 'unknown';
}

async function startAgent(privateKey, state, ownerAddress) {
  const { Agent, AgentError, ConversationContext, validHex } = await import('@xmtp/agent-sdk');
  const { CommandRouter } = await import('@xmtp/agent-sdk/middleware');
  const { createUser, createSigner } = await import('@xmtp/agent-sdk/user');

  log('Starting newzbot XMTP agent (runtime)...');
  log(`XMTP environment: ${XMTP_ENV}`);
  log(`Database path: ${path.resolve(process.cwd(), `newzbot-xmtp-${XMTP_ENV}.db3`)}`);
  log(`Subscriber address from state: ${state.subscriberAddress || 'none'}`);

  const wallet = new Wallet(privateKey);
  log(`Bot wallet address: ${wallet.address}`);

  const user = createUser(validHex(privateKey));
  const signer = createSigner(user);

  log('Creating XMTP agent...');
  let agent;
  try {
    agent = await Agent.create(signer, {
      env: XMTP_ENV,
      dbPath: path.resolve(process.cwd(), `newzbot-xmtp-${XMTP_ENV}.db3`),
    });
    log('XMTP agent created successfully');
  } catch (err) {
    log(`ERROR: Failed to create XMTP agent: ${err.message}`);
    log(`ERROR: Stack trace: ${err.stack}`);
    throw err;
  }

  let isStopped = false;

  async function sendNewItemsToSubscriber(isFirstRun) {
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

    log(`Attempting to send ${newItems.length} items to subscriber ${state.subscriberAddress}...`);

    try {
      log(`Creating DM conversation with address: ${state.subscriberAddress}`);
      const dm = await agent.createDmWithAddress(validHex(state.subscriberAddress));
      log(`DM conversation created successfully. Conversation ID: ${dm.id}`);
      
      const ctx = new ConversationContext({ conversation: dm, client: agent.client });
      log(`Conversation context created. Client address: ${agent.client.address || 'unknown'}`);

      log(
        `Sending ${newItems.length} new DB items to subscriber ${state.subscriberAddress} in conversation ${dm.id}.`,
      );

      let successCount = 0;
      let failCount = 0;

      for (const item of newItems) {
        try {
          const text = formatNewsText(item);
          log(`Attempting to send message for item: ${item.title} (ID: ${item.id})`);
          await ctx.sendText(text);
          log(`✓ Successfully sent item: ${item.title} (ID: ${item.id})`);
          successCount++;
        } catch (err) {
          failCount++;
          log(`✗ ERROR sending item "${item.title}" (ID: ${item.id}): ${err.message}`);
          log(`✗ Error stack: ${err.stack}`);
          log(`✗ Error details: ${JSON.stringify(err, Object.getOwnPropertyNames(err))}`);
          // Continue with other items even if one fails
        }
      }

      if (successCount > 0) {
        log(`Successfully sent ${successCount} out of ${newItems.length} items.`);
        markItemsSent(newItems.map((item) => item.id));
      } else {
        log(`ERROR: Failed to send all ${newItems.length} items. Not marking as sent.`);
      }

      if (failCount > 0) {
        log(`WARNING: ${failCount} items failed to send. Check logs above for details.`);
      }
    } catch (err) {
      log(`ERROR: Failed to create conversation or send messages: ${err.message}`);
      log(`ERROR: Stack trace: ${err.stack}`);
      log(`ERROR: Error details: ${JSON.stringify(err, Object.getOwnPropertyNames(err))}`);
      throw err;
    }
  }

  async function runFeedLoop() {
    log(`Starting feed loop. intervalMs=${FEED_INTERVAL_MS}`);
    let isFirstRun = true;

    // Immediately check once on startup, then on interval.
    for (;;) {
      if (isStopped) {
        log('Feed loop detected agent stop; exiting.');
        throw new Error('Agent stopped');
      }
      try {
        await sendNewItemsToSubscriber(isFirstRun);
        isFirstRun = false;
      } catch (err) {
        log(`Feed loop error: ${err.message}`);
        log(`Feed loop error stack: ${err.stack}`);
        log(`Feed loop error details: ${JSON.stringify(err, Object.getOwnPropertyNames(err))}`);
      }

      await new Promise((resolve) => setTimeout(resolve, FEED_INTERVAL_MS));
    }
  }

  const router = new CommandRouter();

  router.command('/reload', async (ctx) => {
    const sender = await ctx.getSenderAddress();
    if (!ownerAddress) {
      await ctx.sendText('Owner address is not configured; reload is disabled.');
      return;
    }

    if (!sender || sender.toLowerCase() !== ownerAddress.toLowerCase()) {
      await ctx.sendText('Unauthorized: only the owner can reload the bot.');
      return;
    }

    await ctx.sendText('Reloading newz.bot from git and restarting…');
    log(`/reload requested by owner ${sender}; running git pull.`);

    // Lazy-load child_process to avoid paying the cost on normal startup.
    // eslint-disable-next-line global-require
    const { exec } = require('node:child_process');

    exec('git pull --rebase', { cwd: ROOT_DIR }, (err, stdout, stderr) => {
      if (stdout && stdout.trim()) {
        log(`git pull stdout:\n${stdout.trim()}`);
      }
      if (stderr && stderr.trim()) {
        log(`git pull stderr:\n${stderr.trim()}`);
      }
      if (err) {
        log(`git pull failed: ${err.message}`);
        return;
      }

      log('git pull succeeded; restarting via ./newzbot.sh');
      exec('./newzbot.sh', {
        cwd: ROOT_DIR,
        detached: true,
        stdio: 'ignore',
      });

      // Exit current process so the new instance can take over cleanly.
      process.exit(0);
    });
  });

  router.command('/list', async (ctx) => {
    const sender = await ctx.getSenderAddress();
    log(`/list command received from ${sender || 'unknown'}`);
    const feeds = listFeeds();

    try {
      if (!feeds.length) {
        await ctx.sendText('No feeds configured. Use /add <url> to add one.');
        log(`✓ Sent /list response (no feeds) to ${sender || 'unknown'}`);
        return;
      }

      const lines = feeds.map((feed) => {
        const label = feed.title || feed.url;
        return `${feed.id}. ${label}\n${feed.url}`;
      });

      const header = 'Configured RSS feeds:';
      const body = [header, ...lines].join('\n\n');
      await ctx.sendText(body);
      log(`✓ Sent /list response (${feeds.length} feeds) to ${sender || 'unknown'}`);
    } catch (err) {
      log(`✗ ERROR sending /list response: ${err.message}`);
      log(`✗ Error stack: ${err.stack}`);
    }
  });

  router.command('/add', async (ctx) => {
    const sender = await ctx.getSenderAddress();
    const raw = ctx.message && typeof ctx.message.content === 'string' ? ctx.message.content : '';
    const trimmed = raw.trim();
    log(`/add command received from ${sender || 'unknown'}: "${trimmed}"`);
    
    if (!trimmed) {
      try {
        await ctx.sendText('Usage: /add <feed-url>');
        log(`✓ Sent /add usage response to ${sender || 'unknown'}`);
      } catch (err) {
        log(`✗ ERROR sending /add usage response: ${err.message}`);
      }
      return;
    }

    const [url] = trimmed.split(/\s+/);

    try {
      const feed = addFeed(url, null);
      const label = feed.title || feed.url;
      await ctx.sendText(`Added feed #${feed.id}: ${label}\n${feed.url}\n\nRun the collector to fetch new items.`);
      log(`✓ Added feed #${feed.id} and sent confirmation to ${sender || 'unknown'}`);
    } catch (err) {
      log(`✗ ERROR adding feed: ${err.message}`);
      try {
        await ctx.sendText(`Failed to add feed: ${err.message}`);
      } catch (sendErr) {
        log(`✗ ERROR sending /add error response: ${sendErr.message}`);
      }
    }
  });

  router.command('/remove', async (ctx) => {
    const raw = ctx.message && typeof ctx.message.content === 'string' ? ctx.message.content : '';
    const trimmed = raw.trim();
    if (!trimmed) {
      await ctx.sendText('Usage: /remove <feed-id>');
      return;
    }

    const id = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(id) || id <= 0) {
      await ctx.sendText('Feed id must be a positive integer. Use /list to see feed ids.');
      return;
    }

    deleteFeed(id);
    await ctx.sendText(`Removed feed with id ${id} (if it existed).`);
  });

  router.command('/recent', async (ctx) => {
    const items = listRecentItems(5, 0);

    if (!items.length) {
      await ctx.sendText('No recent articles found. Try running the collector first.');
      return;
    }

    const lines = items.map((item, index) => {
      const source = formatSource(item);
      return `${index + 1}. ${item.title} (${source})\n${item.link}`;
    });

    const header = `Most recent ${items.length} article(s):`;
    const body = [header, ...lines].join('\n\n');
    await ctx.sendText(body);
  });

  router.command('/help', async (ctx) => {
    const helpText =
      'newz.bot commands:\n' +
      '  /help               Show this help message\n' +
      '  /start              Subscribe this wallet to the feed\n' +
      '  /stop               Unsubscribe this wallet from the feed\n' +
      '  /reload             git pull + restart (owner only)\n' +
      '  /list               List configured RSS feeds\n' +
      '  /add <url>          Add a new RSS feed\n' +
      '  /remove <id>        Remove a feed by id (see /list)\n' +
      '  /search <keywords>  Search recent collected articles (up to 5 matches)\n' +
      '  /recent             Show the 5 most recent articles';
    await ctx.sendText(helpText);
  });

  router.command('/search', async (ctx) => {
    const query = (ctx.message && typeof ctx.message.content === 'string'
      ? ctx.message.content
      : ''
    ).trim();

    if (!query) {
      await ctx.sendText('Usage: /search <keywords>');
      return;
    }

    const matches = searchNewsItems(query, 5);
    if (!matches.length) {
      await ctx.sendText(`No articles found matching "${query}".`);
      return;
    }

    const lines = matches.map((item, index) => {
      const source = formatSource(item);
      return `${index + 1}. ${item.title} (${source})\n${item.link}`;
    });

    const header = `Top ${matches.length} result(s) for "${query}":`;
    const body = [header, ...lines].join('\n\n');
    await ctx.sendText(body);
  });

  router.command('/start', async (ctx) => {
    const sender = await ctx.getSenderAddress();
    const convoId = ctx.conversation?.id || 'unknown';
    log(`/start command received from ${sender || 'unknown'} in conversation ${convoId}`);
    
    if (!sender) {
      log(`WARNING: /start command but unable to determine sender address`);
      await ctx.sendText("Hi, I can't do anything yet.");
      return;
    }

    const previous = state.subscriberAddress;
    state.subscriberAddress = sender;
    saveState(state);

    if (!previous) {
      log(`Registered new subscriber: ${sender}`);
    } else if (previous !== sender) {
      log(`Switched subscriber from ${previous} to ${sender}`);
    } else {
      log(`Subscriber ${sender} already registered (re-subscribing)`);
    }

    try {
      await ctx.sendText("Hi, I can't do anything yet.");
      log(`✓ Sent /start response to ${sender}`);
    } catch (err) {
      log(`✗ ERROR sending /start response: ${err.message}`);
      log(`✗ Error stack: ${err.stack}`);
    }
  });

  router.command('/stop', async (ctx) => {
    const sender = await ctx.getSenderAddress();
    if (!sender) {
      await ctx.sendText("Hi, I can't do anything yet.");
      return;
    }

    if (state.subscriberAddress === sender) {
      state.subscriberAddress = undefined;
      saveState(state);
      log(`Subscriber ${sender} unsubscribed.`);
    }

    await ctx.sendText("Hi, I can't do anything yet.");
  });

  router.default(async (ctx) => {
    const sender = await ctx.getSenderAddress();
    const text = ctx.message && typeof ctx.message.content === 'string' ? ctx.message.content : '';
    log(`Received non-command message from ${sender || 'unknown'}: "${text}"`);
    try {
      await ctx.sendText(
        'Hi, I am newz.bot. Available commands: /help, /start, /stop, /reload, /list, /add, /remove, /search <query>, /recent.',
      );
      log(`✓ Sent default response to ${sender || 'unknown'}`);
    } catch (err) {
      log(`✗ ERROR sending default response: ${err.message}`);
      log(`✗ Error stack: ${err.stack}`);
    }
  });

  agent.use(router.middleware());

  agent.on('text', async (ctx) => {
    const sender = await ctx.getSenderAddress();
    const convoId = ctx.conversation.id;
    const msgId = ctx.message.id;
    const content = ctx.message.content || '';
    log(
      `Received text from ${sender || 'unknown'} in conversation ${convoId}, msg ${msgId}: ${content}`,
    );
    log(`Message details - conversation topic: ${ctx.conversation.topic || 'none'}, peerAddress: ${ctx.conversation.peerAddress || 'none'}`);

    if (ownerAddress && sender && sender.toLowerCase() === ownerAddress.toLowerCase()) {
      if (!state.ownerHasContacted) {
        state.ownerHasContacted = true;
        saveState(state);
        log('Owner has contacted the bot; startup notifications will be sent on future restarts.');
      }
    }
  });

  agent.on('unhandledError', (error) => {
    if (error instanceof AgentError) {
      log(
        `Unhandled AgentError (${error.code}): ${error.message}${
          error.cause ? `; cause=${String(error.cause)}` : ''
        }`,
      );
      log(`Unhandled AgentError stack: ${error.stack || 'no stack trace'}`);
    } else {
      log(`Unhandled error: ${error.message}`);
      log(`Unhandled error stack: ${error.stack || 'no stack trace'}`);
      log(`Unhandled error details: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`);
    }
  });

  agent.on('start', (ctx) => {
    const addr = ctx.getClientAddress();
    log(`Agent online. Address: ${addr || 'unknown'}`);
    log(
      `Client inboxId=${ctx.client.inboxId}, installationId=${ctx.client.installationId}, isRegistered=${ctx.client.isRegistered}`,
    );
    log(`Agent client state - address: ${agent.client.address || 'unknown'}, env: ${XMTP_ENV}`);

    // Verify consistency: wallet address should match client address
    const wallet = new Wallet(privateKey);
    if (addr && addr.toLowerCase() !== wallet.address.toLowerCase()) {
      log(`WARNING: Address mismatch! Wallet address: ${wallet.address}, Client address: ${addr}`);
    } else {
      log(`✓ Address consistency check passed: ${wallet.address} matches client address`);
    }

    // Notify owner address that the bot is online once the agent is fully started.
    if (ownerAddress) {
      (async () => {
        try {
          log(`Attempting to send startup notification to owner at ${ownerAddress}...`);
          const dm = await agent.createDmWithAddress(validHex(ownerAddress));
          log(`Created DM with owner. Conversation ID: ${dm.id}`);
          const notifyCtx = new ConversationContext({ conversation: dm, client: agent.client });
          await notifyCtx.sendText('news bot online');
          log(`✓ Sent startup notification to owner at ${ownerAddress}.`);
        } catch (err) {
          log(`✗ ERROR: Failed to send startup notification: ${err.message}`);
          log(`✗ Startup notification error stack: ${err.stack}`);
          log(`✗ Startup notification error details: ${JSON.stringify(err, Object.getOwnPropertyNames(err))}`);
        }
      })();
    } else {
      log(`Owner "${OWNER_NAME}" could not be resolved; skipping startup notification.`);
    }
  });

  agent.on('stop', () => {
    isStopped = true;
    log('Agent stopped.');
  });

  log('Starting agent...');
  try {
    await agent.start();
    log('✓ Agent has started successfully; entering feed loop.');
  } catch (err) {
    log(`✗ ERROR: Failed to start agent: ${err.message}`);
    log(`✗ Agent start error stack: ${err.stack}`);
    log(`✗ Agent start error details: ${JSON.stringify(err, Object.getOwnPropertyNames(err))}`);
    throw err;
  }

  await runFeedLoop();
}

async function main() {
  log('=== newzbot agent main() starting ===');
  log(`Environment variables:`);
  log(`  NEWZBOT_XMTP_ENV: ${process.env.NEWZBOT_XMTP_ENV || '(not set)'}`);
  log(`  XMTP_ENV: ${process.env.XMTP_ENV || '(not set)'}`);
  log(`  NEWZBOT_LOG_PATH: ${process.env.NEWZBOT_LOG_PATH || '(not set)'}`);
  log(`  NEWZBOT_KEY_PATH: ${process.env.NEWZBOT_KEY_PATH || '(not set)'}`);
  log(`  NEWZBOT_STATE_PATH: ${process.env.NEWZBOT_STATE_PATH || '(not set)'}`);
  log(`  NEWZBOT_FEED_INTERVAL_MS: ${process.env.NEWZBOT_FEED_INTERVAL_MS || '(not set)'}`);
  log(`  NEWZBOT_MAX_ITEMS_PER_TICK: ${process.env.NEWZBOT_MAX_ITEMS_PER_TICK || '(not set)'}`);
  log(`  WEB3BIO_API_KEY: ${process.env.WEB3BIO_API_KEY ? '(set)' : '(not set)'}`);
  log(`Resolved XMTP_ENV: ${XMTP_ENV}`);
  log(`Working directory: ${process.cwd()}`);

  const privateKey = ensureKeypair();
  const state = loadState();
  log(`Loaded state - subscriberAddress: ${state.subscriberAddress || 'none'}`);
  
  let ownerAddress = null;

  try {
    const { createNameResolver } = await import('@xmtp/agent-sdk/user');
    const resolveName = createNameResolver(process.env.WEB3BIO_API_KEY);
    log(`Attempting to resolve owner name "${OWNER_NAME}"...`);
    ownerAddress = await resolveName(OWNER_NAME);
    if (ownerAddress) {
      log(`✓ Resolved owner "${OWNER_NAME}" to address ${ownerAddress}.`);
    } else {
      log(`✗ Failed to resolve owner "${OWNER_NAME}" to an address; owner-only commands disabled.`);
    }
  } catch (err) {
    log(`✗ Error resolving owner "${OWNER_NAME}": ${err.message}`);
    log(`✗ Owner resolution error stack: ${err.stack}`);
  }

  let attempt = 0;

  // Keep trying to come online, but back off aggressively on failures
  // (especially on XMTP rate limiting) to be respectful of the network.
  // This loop only runs when agent startup or the feed loop throws.
  // Normal operation (no throws) will never iterate.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      log(`Starting agent attempt #${attempt + 1}...`);
      await startAgent(privateKey, state, ownerAddress);
      log(`Agent started successfully on attempt #${attempt + 1}`);
      return;
    } catch (err) {
      attempt += 1;
      const message = err && err.message ? err.message : String(err);
      const lower = message.toLowerCase();
      const isRateLimit =
        lower.includes('rate limit') ||
        lower.includes('resource has been exhausted') ||
        lower.includes('resource_exhausted');

      const baseDelayMs = isRateLimit ? 60000 : 10000;
      const maxDelayMs = 10 * 60 * 1000;
      const expFactor = Math.min(attempt, 6); // cap exponent growth
      const backoff = Math.min(baseDelayMs * 2 ** expFactor, maxDelayMs);
      const jitter = Math.floor(backoff * 0.2 * Math.random());
      const delay = backoff + jitter;

      log(`✗ Agent error on attempt ${attempt}: ${message}`);
      log(`✗ Error stack: ${err.stack || 'no stack trace'}`);
      log(`✗ Error details: ${JSON.stringify(err, Object.getOwnPropertyNames(err))}`);
      log(
        `Backing off for approximately ${Math.round(delay / 1000)}s before retrying (isRateLimit: ${isRateLimit}).`,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

main().catch((err) => {
  log(`✗ FATAL ERROR outside retry loop: ${err.message}`);
  log(`✗ Fatal error stack: ${err.stack || 'no stack trace'}`);
  log(`✗ Fatal error details: ${JSON.stringify(err, Object.getOwnPropertyNames(err))}`);
  process.exit(1);
});
