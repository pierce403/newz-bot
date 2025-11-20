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
  const dbPath = path.resolve(process.cwd(), `newzbot-xmtp-${XMTP_ENV}.db3`);

  try {
    agent = await Agent.create(signer, {
      env: XMTP_ENV,
      dbPath,
    });
    log('XMTP agent created successfully');

    // Check for multiple installations and revoke old ones
    // A bot should only have one active installation at a time to prevent HPKE decryption errors
    try {
      const currentInstallationIdBytes = agent.client.installationIdBytes;
      log(`Current installation ID: ${agent.client.installationId}`);
      
      // Get all installations for this inbox
      const inboxState = await agent.client.inboxState();
      const installations = inboxState.installations;
      log(`Total installations found: ${installations.length}`);
      
      // Revoke all installations except the current one
      // IMPORTANT: revokeInstallations() expects Uint8Array[] (installation.bytes), NOT string[] (installation.id)
      const installationsToRevoke = installations
        .filter(installation => {
          // Compare bytes arrays
          if (installation.bytes.length !== currentInstallationIdBytes.length) return true;
          for (let i = 0; i < installation.bytes.length; i++) {
            if (installation.bytes[i] !== currentInstallationIdBytes[i]) return true;
          }
          return false;
        })
        .map(installation => installation.bytes);
      
      if (installationsToRevoke.length > 0) {
        log(`Found ${installationsToRevoke.length} old installation(s) to revoke.`);
        
        await agent.client.revokeInstallations(installationsToRevoke);
        log(`✓ Successfully revoked ${installationsToRevoke.length} old installation(s).`);
        log(`✓ Only installation ${agent.client.installationId} should remain active.`);
      } else {
        log(`✓ No old installations to revoke. This is the only installation.`);
      }
    } catch (installErr) {
      log(`WARNING: Error checking/revoking installations: ${installErr.message}`);
      log(`WARNING: Stack: ${installErr.stack}`);
      log(`WARNING: Multiple installations may cause HPKE decryption errors.`);
    }

  } catch (err) {
    const msg = err.message ? err.message.toLowerCase() : '';
    // Check for common database corruption errors or generic database failures
    if (msg.includes('database disk image is malformed') || msg.includes('corrupt') || msg.includes('sqlite')) {
      log(`ERROR: Detected potential database corruption: ${err.message}`);
      if (fs.existsSync(dbPath)) {
        const corruptedPath = `${dbPath}.corrupted.${Date.now()}`;
        log(`Renaming corrupted DB to ${corruptedPath} and retrying creation...`);
        fs.renameSync(dbPath, corruptedPath);
        // Also try to move WAL/SHM files if they exist
        if (fs.existsSync(`${dbPath}-wal`)) {
          try {
            fs.renameSync(`${dbPath}-wal`, `${corruptedPath}-wal`);
          } catch { /* ignore */ }
        }
        if (fs.existsSync(`${dbPath}-shm`)) {
          try {
            fs.renameSync(`${dbPath}-shm`, `${corruptedPath}-shm`);
          } catch { /* ignore */ }
        }

        // Retry creation once
        try {
          agent = await Agent.create(signer, {
            env: XMTP_ENV,
            dbPath,
          });
          log('XMTP agent created successfully after clearing corrupted DB');
        } catch (retryErr) {
          log(`ERROR: Failed to create XMTP agent even after fresh DB: ${retryErr.message}`);
          throw retryErr;
        }
      } else {
        throw err;
      }
    } else {
      log(`ERROR: Failed to create XMTP agent: ${err.message}`);
      log(`ERROR: Stack trace: ${err.stack}`);
      throw err;
    }
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

      // Note: canMessage check removed - it's not critical and was causing API errors.
      // Messages will be sent regardless, and any delivery issues will surface as send errors.

      const normalizedSubscriberAddress = validHex(state.subscriberAddress);
      log(`Creating DM with subscriber - address: ${state.subscriberAddress}`);
      log(`Normalized subscriber address (validHex): ${normalizedSubscriberAddress}`);

      // Try to get existing conversation first, or create if needed
      // Note: createDmWithAddress will create a conversation, but it may not be fully initialized
      // until the first message is exchanged. We'll handle errors gracefully.
      let dm;
      try {
        // First, try to find existing conversation
        const conversations = await agent.client.conversations.list();
        const existingConvo = conversations.find(c =>
          (c.peerAddress && c.peerAddress.toLowerCase() === normalizedSubscriberAddress.toLowerCase()) ||
          (c.peerAccountAddress && c.peerAccountAddress.toLowerCase() === normalizedSubscriberAddress.toLowerCase())
        );

        if (existingConvo && existingConvo.topic) {
          log(`Found existing conversation for subscriber: ${existingConvo.id}`);
          dm = existingConvo;
        } else {
          log(`No existing conversation found, creating new DM with address: ${normalizedSubscriberAddress}`);
          dm = await agent.createDmWithAddress(normalizedSubscriberAddress);
          log(`DM conversation created. Conversation ID: ${dm.id}`);
        }
      } catch (createErr) {
        log(`ERROR creating conversation: ${createErr.message}`);
        log(`ERROR: This may happen if the conversation isn't ready yet. Will retry on next feed loop.`);
        throw createErr;
      }

      log(`Conversation details - topic: ${dm.topic || 'none'}, peerAddress: ${dm.peerAddress || 'none'}`);
      log(`DM peerAddress comparison - expected: ${normalizedSubscriberAddress.toLowerCase()}, got: ${dm.peerAddress ? dm.peerAddress.toLowerCase() : 'none'}, match: ${dm.peerAddress && dm.peerAddress.toLowerCase() === normalizedSubscriberAddress.toLowerCase()}`);
      log(`Conversation properties: ${JSON.stringify(Object.keys(dm))}`);

      // Check if conversation needs initialization
      if (!dm.topic || !dm.peerAddress) {
        log(`WARNING: Conversation appears uninitialized (topic: ${dm.topic || 'none'}, peerAddress: ${dm.peerAddress || 'none'})`);
        log(`Attempting to sync conversations...`);
        try {
          // Try to sync the conversation
          await agent.client.conversations.sync();
          log(`Conversation sync completed`);

          // Re-fetch the conversation to see if it's now initialized
          const conversations = await agent.client.conversations.list();
          log(`Found ${conversations.length} total conversations after sync`);

          // Log details of all conversations for debugging
          conversations.forEach((c, idx) => {
            log(`Conversation ${idx}: id=${c.id || 'none'}, topic=${c.topic || 'none'}, peerAddress=${c.peerAddress || 'none'}, peerAccountAddress=${c.peerAccountAddress || 'none'}`);
            log(`  Conversation ${idx} keys: ${JSON.stringify(Object.keys(c))}`);
            // Try to serialize the whole object to see its structure
            try {
              const serialized = JSON.stringify(c, (key, value) => {
                if (typeof value === 'object' && value !== null) {
                  return Object.getOwnPropertyNames(value).reduce((acc, prop) => {
                    try {
                      acc[prop] = value[prop];
                    } catch (e) {
                      acc[prop] = '[unable to access]';
                    }
                    return acc;
                  }, {});
                }
                return value;
              }, 2);
              log(`  Conversation ${idx} full structure: ${serialized}`);
            } catch (serializeErr) {
              log(`  Conversation ${idx} serialization failed: ${serializeErr.message}`);
            }
            // Try accessing properties directly
            log(`  Conversation ${idx} direct access - id: ${c.id}, topic: ${c.topic}, peerAddress: ${c.peerAddress}, peerAccountAddress: ${c.peerAccountAddress}`);
          });

          // Try multiple ways to match the conversation
          const targetAddrLower = state.subscriberAddress.toLowerCase();
          let foundConvo = conversations.find(c =>
            c.peerAddress && c.peerAddress.toLowerCase() === targetAddrLower
          );

          // If not found by peerAddress, try by peerAccountAddress
          if (!foundConvo) {
            foundConvo = conversations.find(c =>
              c.peerAccountAddress && c.peerAccountAddress.toLowerCase() === targetAddrLower
            );
          }

          // If still not found, try matching by conversation ID (if we created one)
          if (!foundConvo && dm.id) {
            foundConvo = conversations.find(c => c.id === dm.id);
          }

          if (foundConvo) {
            log(`Found conversation after sync - topic: ${foundConvo.topic || 'none'}, peerAddress: ${foundConvo.peerAddress || 'none'}, peerAccountAddress: ${foundConvo.peerAccountAddress || 'none'}, id: ${foundConvo.id || 'none'}`);
            // Use the found conversation if it's better initialized
            if (foundConvo.topic && (foundConvo.peerAddress || foundConvo.peerAccountAddress)) {
              log(`Using synced conversation instead (better initialized)`);
              dm = foundConvo;
            } else {
              log(`Synced conversation also uninitialized, keeping created conversation`);
            }
          } else {
            log(`No existing conversation found after sync for ${state.subscriberAddress}, using created conversation`);
            log(`Available conversations: ${conversations.map(c => `${c.peerAddress || c.peerAccountAddress || 'unknown'}:${c.topic || 'no-topic'}`).join(', ')}`);
          }
        } catch (syncErr) {
          log(`WARNING: Error syncing conversations: ${syncErr.message}`);
          log(`Will proceed with created conversation despite sync error`);
        }
      }

      const ctx = new ConversationContext({ conversation: dm, client: agent.client });
      log(`Conversation context created. Client address: ${agent.client.address || 'unknown'}`);
      log(`Bot sending from address: ${wallet.address}, Client address: ${agent.client.address || 'unknown'}`);

      log(
        `Sending ${newItems.length} new DB items to subscriber ${state.subscriberAddress} in conversation ${dm.id}.`,
      );

      let successCount = 0;
      let failCount = 0;

      for (const item of newItems) {
        try {
          const text = formatNewsText(item);
          log(`Attempting to send message for item: ${item.title} (ID: ${item.id})`);
          log(`Message text preview: ${text.substring(0, 100)}...`);
          log(`Conversation details - topic: ${dm.topic || 'none'}, peerAddress: ${dm.peerAddress || 'none'}, id: ${dm.id}`);
          const messageResult = await ctx.sendText(text);
          log(`✓ Successfully sent item: ${item.title} (ID: ${item.id})`);
          log(`✓ Message result: ${messageResult ? JSON.stringify(messageResult, Object.getOwnPropertyNames(messageResult)) : 'no result object'}`);
          if (messageResult && messageResult.id) {
            log(`✓ Message ID: ${messageResult.id}`);
          }
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
    let consecutiveStops = 0;
    const MAX_CONSECUTIVE_STOPS = 3;

    // Immediately check once on startup, then on interval.
    for (; ;) {
      if (isStopped) {
        consecutiveStops++;
        log(`Feed loop detected agent stop (consecutive: ${consecutiveStops}). Attempting to restart agent...`);

        // If we've been stopped multiple times in a row rapidly, wait a bit longer
        if (consecutiveStops >= MAX_CONSECUTIVE_STOPS) {
          log(`WARNING: Agent has been stopped ${consecutiveStops} times consecutively.`);
          log(`WARNING: Waiting 10 seconds before next restart attempt...`);
          await new Promise((resolve) => setTimeout(resolve, 10000));
        }

        try {
          await agent.start();
          isStopped = false;
          log('✓ Agent restarted successfully.');

          // If we successfully restarted, we can reset the counter after a successful run period
          // But for now, let's just continue. The counter will be reset if we hit the else block below.
        } catch (restartErr) {
          log(`✗ Failed to restart agent: ${restartErr.message}`);
          // Wait a bit before retrying
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }

        // Skip the rest of the loop and check isStopped again
        continue;
      }

      // If we are running normally (not stopped), reset consecutive stops
      if (consecutiveStops > 0) {
        consecutiveStops = 0;
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
    log(`/reload command received from ${sender || 'unknown'}`);

    await ctx.sendText('Reloading newz.bot from git and restarting…');
    log(`/reload requested by ${sender || 'unknown'}; running git pull.`);

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

  router.command('/test', async (ctx) => {
    const sender = await ctx.getSenderAddress();
    const convoId = ctx.conversation?.id || 'unknown';
    log(`/test command received from ${sender || 'unknown'} in conversation ${convoId}`);
    log(`Conversation details - topic: ${ctx.conversation.topic || 'none'}, peerAddress: ${ctx.conversation.peerAddress || 'none'}, id: ${ctx.conversation.id || 'none'}`);

    try {
      // First, try to create a new conversation to test initialization
      log(`Testing conversation creation with ${sender}...`);
      let testDm;
      try {
        testDm = await agent.createDmWithAddress(validHex(sender));
        log(`Created test DM - topic: ${testDm.topic || 'none'}, peerAddress: ${testDm.peerAddress || 'none'}, id: ${testDm.id}`);

        // Check if conversation is initialized
        if (!testDm.topic || !testDm.peerAddress) {
          log(`WARNING: Test conversation appears uninitialized`);
          await agent.client.conversations.sync();
          const conversations = await agent.client.conversations.list();
          const foundConvo = conversations.find(c =>
            c.peerAddress && c.peerAddress.toLowerCase() === sender.toLowerCase()
          );
          if (foundConvo) {
            log(`Found conversation after sync - topic: ${foundConvo.topic || 'none'}, peerAddress: ${foundConvo.peerAddress || 'none'}`);
            testDm = foundConvo;
          }
        }
      } catch (createErr) {
        log(`Error creating test DM: ${createErr.message}`);
        testDm = ctx.conversation; // Fall back to existing conversation
      }

      const testMessage = `Test message from bot ${agent.client.address || 'unknown'} at ${new Date().toISOString()}`;
      log(`Sending test message: "${testMessage}"`);

      // Use the test conversation if we created one, otherwise use the existing context
      let result;
      if (testDm && testDm !== ctx.conversation) {
        const testCtx = new ConversationContext({ conversation: testDm, client: agent.client });
        result = await testCtx.sendText(testMessage);
        log(`✓ Test message sent via new conversation`);
      } else {
        result = await ctx.sendText(testMessage);
        log(`✓ Test message sent via existing conversation`);
      }

      log(`✓ Message result: ${result ? JSON.stringify(result, Object.getOwnPropertyNames(result)) : 'no result object'}`);
      if (result && result.id) {
        log(`✓ Test message ID: ${result.id}`);
      }

      await ctx.sendText(`Test message sent! Check your client to see if you received it. Bot address: ${agent.client.address || 'unknown'}`);
    } catch (err) {
      log(`✗ ERROR sending test message: ${err.message}`);
      log(`✗ Error stack: ${err.stack}`);
      log(`✗ Error details: ${JSON.stringify(err, Object.getOwnPropertyNames(err))}`);
      try {
        await ctx.sendText(`Error sending test message: ${err.message}`);
      } catch (sendErr) {
        log(`✗ ERROR sending error response: ${sendErr.message}`);
      }
    }
  });

  router.command('/help', async (ctx) => {
    const helpText =
      'newz.bot commands:\n' +
      '  /help               Show this help message\n' +
      '  /start              Subscribe this wallet to the feed\n' +
      '  /stop               Unsubscribe this wallet from the feed\n' +
      '  /test               Send a test message to verify connectivity\n' +
      '  /reload             git pull + restart\n' +
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
    log(`Sender address details - raw: ${sender || 'none'}, normalized: ${sender ? validHex(sender) : 'none'}`);

    if (ownerAddress) {
      const normalizedSender = sender ? validHex(sender) : null;
      const normalizedOwner = validHex(ownerAddress);
      log(`Address comparison - sender normalized: ${normalizedSender || 'none'}, owner normalized: ${normalizedOwner}, match: ${normalizedSender && normalizedSender.toLowerCase() === normalizedOwner.toLowerCase()}`);
    }

    if (ownerAddress && sender && sender.toLowerCase() === ownerAddress.toLowerCase()) {
      if (!state.ownerHasContacted) {
        state.ownerHasContacted = true;
        saveState(state);
        log('Owner has contacted the bot; startup notifications will be sent on future restarts.');
      }
    }
  });

  // Handle conversation events - this is fired when a new conversation is created
  // This helps us track when conversations are properly initialized
  agent.on('conversation', async (conversation) => {
    log(`New conversation event received - id: ${conversation.id || 'none'}, topic: ${conversation.topic || 'none'}, peerAddress: ${conversation.peerAddress || 'none'}`);
    log(`Conversation properties: ${JSON.stringify(Object.keys(conversation))}`);
  });

  agent.on('unhandledError', (error) => {
    if (error instanceof AgentError) {
      const errorCode = error.code;
      const errorMessage = error.message;
      const errorCause = error.cause ? String(error.cause) : '';

      log(
        `Unhandled AgentError (${errorCode}): ${errorMessage}${errorCause ? `; cause=${errorCause}` : ''
        }`,
      );
      log(`Unhandled AgentError stack: ${error.stack || 'no stack trace'}`);

      // Handle specific error codes that shouldn't crash the agent
      if (errorCode === 1002 || (errorCause && errorCause.includes('Decryption failed'))) {
        // Error 1002: Conversation streaming error (often HPKE decryption failures)
        log(`WARNING: Conversation streaming error - HPKE decryption failure.`);
        log(`WARNING: This should not happen if installations are properly managed.`);
        log(`WARNING: Current Installation ID: ${agent.client.installationId}`);
        log(`WARNING: The agent will continue running. The sender may need to send another message.`);
        // Don't crash the agent - let it continue
        return;
      }
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

    // Startup notification:
    // We send a message on startup to ensure the subscriber's client updates its contact bundle
    // for this installation. This helps prevent HPKE decryption errors on subsequent messages.
    if (state.subscriberAddress) {
      const normalizedSubscriber = validHex(state.subscriberAddress);
      log(`Sending startup notification to ${normalizedSubscriber}...`);

      // Use an async IIFE to not block the event handler
      (async () => {
        try {
          const dm = await agent.createDmWithAddress(normalizedSubscriber);
          const ctx = new ConversationContext({ conversation: dm, client: agent.client });
          await ctx.sendText("Bot online. Connection established.");
          log("✓ Startup notification sent.");
        } catch (err) {
          log(`WARNING: Failed to send startup notification: ${err.message}`);
          // Ignore errors - this is a best-effort attempt to sync
        }
      })();
    } else {
      log(`No subscriber registered; skipping startup notification.`);
    }
  });

  agent.on('stop', () => {
    isStopped = true;
    log('Agent stopped event received.');
    log('WARNING: Agent stop may have been triggered by an error. Check logs above for details.');
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
