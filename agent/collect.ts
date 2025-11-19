#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import Parser from 'rss-parser';
import { saveNewsItems, type NewNewsItem, listFeeds, updateFeedTitle } from './news-store';

const LOG_PATH = process.env.NEWZBOT_LOG_PATH || path.resolve(process.cwd(), 'newzbot.log');

const rssParser = new Parser();

function log(message: string) {
  const line = `[${new Date().toISOString()}] [collector] ${message}\n`;
  fs.appendFileSync(LOG_PATH, line);
  process.stdout.write(line);
}

async function collectFromFeed(url: string): Promise<number> {
  log(`Collecting from feed: ${url}`);
  const feed = await rssParser.parseURL(url);
  const source = feed.title || url;

  // Keep the feeds table in sync with any human-readable title we discover.
  updateFeedTitle(url, feed.title || null);

  const items: NewNewsItem[] = [];
  for (const item of feed.items || []) {
    const guid =
      (item as any).guid ||
      (item as any).id ||
      (item as any).link ||
      `${(item as any).pubDate || ''}:${(item as any).title || ''}`;
    const title = (item as any).title || 'Untitled';
    const link = (item as any).link || '';
    const pubDate = (item as any).pubDate;
    const summary = (item as any).contentSnippet || (item as any).content || undefined;

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

  const { inserted } = saveNewsItems(items);
  log(`Feed ${url}: ${items.length} items seen, ${inserted} new in DB.`);
  return inserted;
}

async function main() {
  const feeds = listFeeds();
  if (!feeds.length) {
    log('No feeds configured. Use the web interface to add subscriptions.');
    process.exitCode = 1;
    return;
  }

  log(`Starting collection for ${feeds.length} feed(s).`);

  let totalNew = 0;
  for (const feed of feeds) {
    const url = feed.url;
    try {
      // eslint-disable-next-line no-await-in-loop
      totalNew += await collectFromFeed(url);
    } catch (err) {
      log(`Error collecting from ${url}: ${(err as Error).message}`);
    }
  }

  log(`Collection complete. Total new items: ${totalNew}.`);
}

main().catch((err) => {
  log(`Collector fatal error: ${(err as Error).message}`);
  process.exit(1);
});
