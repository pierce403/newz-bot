#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_process_1 = __importDefault(require("node:process"));
const ethers_1 = require("ethers");
const agent_sdk_1 = require("@xmtp/agent-sdk");
const middleware_1 = require("@xmtp/agent-sdk/middleware");
const user_1 = require("@xmtp/agent-sdk/user");
const news_store_1 = require("./news-store");
const LOG_PATH = node_process_1.default.env.NEWZBOT_LOG_PATH || node_path_1.default.resolve(node_process_1.default.cwd(), 'newzbot.log');
const KEY_PATH = node_process_1.default.env.NEWZBOT_KEY_PATH || node_path_1.default.resolve(node_process_1.default.cwd(), 'newzbot.key');
const STATE_PATH = node_process_1.default.env.NEWZBOT_STATE_PATH || node_path_1.default.resolve(node_process_1.default.cwd(), 'newzbot.state.json');
const XMTP_ENV = (node_process_1.default.env.NEWZBOT_XMTP_ENV || node_process_1.default.env.XMTP_ENV || 'production').toLowerCase();
const FEED_INTERVAL_MS = Number.parseInt(node_process_1.default.env.NEWZBOT_FEED_INTERVAL_MS || '60000', 10);
const MAX_ITEMS_PER_TICK = Number.parseInt(node_process_1.default.env.NEWZBOT_MAX_ITEMS_PER_TICK || '5', 10);
function log(message) {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    node_fs_1.default.appendFileSync(LOG_PATH, line);
    node_process_1.default.stdout.write(line);
}
function ensureKeypair() {
    if (node_fs_1.default.existsSync(KEY_PATH)) {
        const existing = node_fs_1.default.readFileSync(KEY_PATH, 'utf8').trim();
        log(`Using existing key at ${KEY_PATH}`);
        return existing;
    }
    const wallet = ethers_1.Wallet.createRandom();
    node_fs_1.default.writeFileSync(KEY_PATH, wallet.privateKey, { mode: 0o600 });
    log(`Created new wallet and saved private key to ${KEY_PATH}`);
    return wallet.privateKey;
}
function loadState() {
    try {
        if (!node_fs_1.default.existsSync(STATE_PATH)) {
            return {};
        }
        const raw = node_fs_1.default.readFileSync(STATE_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        return {
            subscriberAddress: parsed.subscriberAddress,
        };
    }
    catch (err) {
        log(`Failed to load state, starting fresh: ${err.message}`);
        return {};
    }
}
function saveState(state) {
    try {
        node_fs_1.default.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
    }
    catch (err) {
        log(`Failed to save state: ${err.message}`);
    }
}
function formatNewsText(item) {
    const datePart = item.pubDate ? ` – ${item.pubDate}` : '';
    return `📰 ${item.title}${datePart}\n${item.link}`;
}
async function sendNewItemsToSubscriber(agent, state, isFirstRun) {
    const newItems = (0, news_store_1.getUnsentItems)(MAX_ITEMS_PER_TICK);
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
    const dm = await agent.createDmWithAddress((0, agent_sdk_1.validHex)(state.subscriberAddress));
    const ctx = new agent_sdk_1.ConversationContext({ conversation: dm, client: agent.client });
    const itemsToSend = newItems;
    log(`Sending ${itemsToSend.length} new DB items to subscriber ${state.subscriberAddress}.`);
    for (const item of itemsToSend) {
        const text = formatNewsText(item);
        await ctx.sendText(text);
        log(`Sent item: ${item.title}`);
    }
    (0, news_store_1.markItemsSent)(itemsToSend.map((item) => item.id));
}
async function runFeedLoop(agent, state) {
    log(`Starting feed loop. intervalMs=${FEED_INTERVAL_MS}`);
    let isFirstRun = true;
    // Immediately check once on startup, then on interval.
    while (true) {
        try {
            await sendNewItemsToSubscriber(agent, state, isFirstRun);
            isFirstRun = false;
        }
        catch (err) {
            log(`Feed loop error: ${err.message}`);
        }
        await new Promise((resolve) => setTimeout(resolve, FEED_INTERVAL_MS));
    }
}
async function main() {
    log('Starting newzbot XMTP agent...');
    log(`XMTP environment: ${XMTP_ENV}`);
    const privateKey = ensureKeypair();
    const state = loadState();
    const user = (0, user_1.createUser)((0, agent_sdk_1.validHex)(privateKey));
    const signer = (0, user_1.createSigner)(user);
    const agent = await agent_sdk_1.Agent.create(signer, {
        env: XMTP_ENV,
        dbPath: node_path_1.default.resolve(node_process_1.default.cwd(), `newzbot-xmtp-${XMTP_ENV}.db3`),
    });
    const router = new middleware_1.CommandRouter();
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
        }
        else if (previous !== sender) {
            log(`Switched subscriber from ${previous} to ${sender}`);
            await ctx.sendTextReply('Subscription updated to this wallet. You will receive new items here.');
        }
        else {
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
        }
        else if (!state.subscriberAddress) {
            await ctx.sendTextReply('You are not currently subscribed.');
        }
        else {
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
        if (error instanceof agent_sdk_1.AgentError) {
            log(`Unhandled AgentError (${error.code}): ${error.message}`);
        }
        else {
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
    await runFeedLoop(agent, state);
}
main().catch((err) => {
    log(`Fatal error: ${err.message}`);
    node_process_1.default.exit(1);
});
