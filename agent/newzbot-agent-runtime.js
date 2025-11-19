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
    log(`Using existing key at ${KEY_PATH}`);
    return existing;
  }

  const wallet = Wallet.createRandom();
  fs.writeFileSync(KEY_PATH, wallet.privateKey, { mode: 0o600 });
  log(`Created new wallet and saved private key to ${KEY_PATH}`);
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

async function startAgent(privateKey, state, ownerAddress) {
  const { Agent, AgentError, ConversationContext, validHex } = await import('@xmtp/agent-sdk');
  const { CommandRouter } = await import('@xmtp/agent-sdk/middleware');
  const { createUser, createSigner } = await import('@xmtp/agent-sdk/user');

  log('Starting newzbot XMTP agent (runtime)...');
  log(`XMTP environment: ${XMTP_ENV}`);

  const user = createUser(validHex(privateKey));
  const signer = createSigner(user);

  const agent = await Agent.create(signer, {
    env: XMTP_ENV,
    dbPath: path.resolve(process.cwd(), `newzbot-xmtp-${XMTP_ENV}.db3`),
  });

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

    const dm = await agent.createDmWithAddress(validHex(state.subscriberAddress));
    const ctx = new ConversationContext({ conversation: dm, client: agent.client });

    log(`Sending ${newItems.length} new DB items to subscriber ${state.subscriberAddress}.`);

    for (const item of newItems) {
      const text = formatNewsText(item);
      await ctx.sendText(text);
      log(`Sent item: ${item.title}`);
    }

    markItemsSent(newItems.map((item) => item.id));
  }

  async function runFeedLoop() {
    log(`Starting feed loop. intervalMs=${FEED_INTERVAL_MS}`);
    let isFirstRun = true;

    // Immediately check once on startup, then on interval.
    for (;;) {
      try {
        await sendNewItemsToSubscriber(isFirstRun);
        isFirstRun = false;
      } catch (err) {
        log(`Feed loop error: ${err.message}`);
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
    const feeds = listFeeds();

    if (!feeds.length) {
      await ctx.sendText('No feeds configured. Use /add <url> to add one.');
      return;
    }

    const lines = feeds.map((feed) => {
      const label = feed.title || feed.url;
      return `${feed.id}. ${label}\n${feed.url}`;
    });

    const header = 'Configured RSS feeds:';
    const body = [header, ...lines].join('\n\n');
    await ctx.sendText(body);
  });

  router.command('/add', async (ctx) => {
    const raw = ctx.message && typeof ctx.message.content === 'string' ? ctx.message.content : '';
    const trimmed = raw.trim();
    if (!trimmed) {
      await ctx.sendText('Usage: /add <feed-url>');
      return;
    }

    const [url] = trimmed.split(/\s+/);

    try {
      const feed = addFeed(url, null);
      const label = feed.title || feed.url;
      await ctx.sendText(`Added feed #${feed.id}: ${label}\n${feed.url}\n\nRun the collector to fetch new items.`);
    } catch (err) {
      await ctx.sendText(`Failed to add feed: ${err.message}`);
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
      const source = item.source || (item.link ? new URL(item.link).hostname : 'unknown');
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
      const source = item.source || (item.link ? new URL(item.link).hostname : 'unknown');
      return `${index + 1}. ${item.title} (${source})\n${item.link}`;
    });

    const header = `Top ${matches.length} result(s) for "${query}":`;
    const body = [header, ...lines].join('\n\n');
    await ctx.sendText(body);
  });

  router.command('/start', async (ctx) => {
    const sender = await ctx.getSenderAddress();
    if (!sender) {
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
    }

    await ctx.sendText("Hi, I can't do anything yet.");
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
    const text = ctx.message && typeof ctx.message.content === 'string' ? ctx.message.content : '';
    log(`Received non-command message: "${text}"`);
    await ctx.sendText(
      'Hi, I am newz.bot. Available commands: /help, /start, /stop, /reload, /list, /add, /remove, /search <query>, /recent.',
    );
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
      log(`Unhandled error: ${error.message}`);
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

  // Notify owner address that the bot is online.
  if (ownerAddress) {
    try {
      const dm = await agent.createDmWithAddress(validHex(ownerAddress));
      const ctx = new ConversationContext({ conversation: dm, client: agent.client });
      await ctx.sendText('news bot online');
      log(`Sent startup notification to owner at ${ownerAddress}.`);
    } catch (err) {
      log(`Failed to send startup notification: ${err.message}`);
    }
  } else {
    log(`Owner "${OWNER_NAME}" could not be resolved; skipping startup notification.`);
  }

  await runFeedLoop();
}

async function main() {
  const privateKey = ensureKeypair();
  const state = loadState();
  let ownerAddress = null;

  try {
    const { createNameResolver } = await import('@xmtp/agent-sdk/user');
    const resolveName = createNameResolver(process.env.WEB3BIO_API_KEY);
    ownerAddress = await resolveName(OWNER_NAME);
    if (ownerAddress) {
      log(`Resolved owner "${OWNER_NAME}" to address ${ownerAddress}.`);
    } else {
      log(`Failed to resolve owner "${OWNER_NAME}" to an address; owner-only commands disabled.`);
    }
  } catch (err) {
    log(`Error resolving owner "${OWNER_NAME}": ${err.message}`);
  }

  let attempt = 0;

  // Keep trying to come online, but back off aggressively on failures
  // (especially on XMTP rate limiting) to be respectful of the network.
  // This loop only runs when agent startup or the feed loop throws.
  // Normal operation (no throws) will never iterate.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await startAgent(privateKey, state, ownerAddress);
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

      log(
        `Agent error (attempt ${attempt}): ${message}. ` +
          `Backing off for approximately ${Math.round(delay / 1000)}s before retrying.`,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

main().catch((err) => {
  log(`Fatal error outside retry loop: ${err.message}`);
  process.exit(1);
});
