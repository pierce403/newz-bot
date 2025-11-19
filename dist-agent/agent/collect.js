#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_process_1 = __importDefault(require("node:process"));
const rss_parser_1 = __importDefault(require("rss-parser"));
const news_store_1 = require("./news-store");
const LOG_PATH = node_process_1.default.env.NEWZBOT_LOG_PATH || node_path_1.default.resolve(node_process_1.default.cwd(), 'newzbot.log');
const rssParser = new rss_parser_1.default();
function log(message) {
    const line = `[${new Date().toISOString()}] [collector] ${message}\n`;
    node_fs_1.default.appendFileSync(LOG_PATH, line);
    node_process_1.default.stdout.write(line);
}
async function collectFromFeed(url) {
    log(`Collecting from feed: ${url}`);
    const feed = await rssParser.parseURL(url);
    const source = feed.title || url;
    // Keep the feeds table in sync with any human-readable title we discover.
    (0, news_store_1.updateFeedTitle)(url, feed.title || null);
    const items = [];
    for (const item of feed.items || []) {
        const guid = item.guid ||
            item.id ||
            item.link ||
            `${item.pubDate || ''}:${item.title || ''}`;
        const title = item.title || 'Untitled';
        const link = item.link || '';
        const pubDate = item.pubDate;
        const summary = item.contentSnippet || item.content || undefined;
        if (!link) {
            // Skip malformed entries without a link.
            continue;
        }
        const id = `${url}::${guid}`;
        items.push({
            id: String(id),
            title: String(title),
            link: String(link),
            summary: summary ? String(summary) : undefined,
            pubDate: pubDate ? String(pubDate) : undefined,
            source: String(source),
            feedUrl: url,
        });
    }
    if (!items.length) {
        log(`No items found for feed: ${url}`);
        return 0;
    }
    const { inserted } = (0, news_store_1.saveNewsItems)(items);
    log(`Feed ${url}: ${items.length} items seen, ${inserted} new in DB.`);
    return inserted;
}
async function main() {
    const feeds = (0, news_store_1.listFeeds)();
    if (!feeds.length) {
        log('No feeds configured. Use the web interface to add subscriptions.');
        node_process_1.default.exitCode = 1;
        return;
    }
    log(`Starting collection for ${feeds.length} feed(s).`);
    let totalNew = 0;
    for (const feed of feeds) {
        const url = feed.url;
        try {
            // eslint-disable-next-line no-await-in-loop
            totalNew += await collectFromFeed(url);
        }
        catch (err) {
            log(`Error collecting from ${url}: ${err.message}`);
        }
    }
    log(`Collection complete. Total new items: ${totalNew}.`);
}
main().catch((err) => {
    log(`Collector fatal error: ${err.message}`);
    node_process_1.default.exit(1);
});
