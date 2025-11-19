"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveNewsItems = saveNewsItems;
exports.getUnsentItems = getUnsentItems;
exports.markItemsSent = markItemsSent;
exports.searchNewsItems = searchNewsItems;
exports.listRecentItems = listRecentItems;
exports.getArticle = getArticle;
exports.listFeeds = listFeeds;
exports.addFeed = addFeed;
exports.deleteFeed = deleteFeed;
exports.updateFeedTitle = updateFeedTitle;
const node_path_1 = __importDefault(require("node:path"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const DB_PATH = process.env.NEWZBOT_DB_PATH || node_path_1.default.resolve(process.cwd(), 'newzbot.db');
const DEFAULT_FEEDS = [
    'https://rss.apnews.com/apf-topnews',
    'https://feeds.reuters.com/reuters/worldNews',
    'http://feeds.bbci.co.uk/news/world/rss.xml',
    'https://feeds.npr.org/1001/rss.xml',
    'https://www.aljazeera.com/xml/rss/all.xml',
    'https://www.theguardian.com/world/rss',
    'https://feeds.skynews.com/feeds/rss/world.xml',
    'https://rss.dw.com/rdf/rss-en-world',
    'https://www.cbc.ca/cmlink/rss-topstories',
    'https://hnrss.org/frontpage',
];
let db = null;
function getDb() {
    if (!db) {
        db = new better_sqlite3_1.default(DB_PATH);
        db.pragma('journal_mode = WAL');
        initSchema(db);
    }
    return db;
}
function initSchema(database) {
    database.exec(`
    CREATE TABLE IF NOT EXISTS news_items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      link TEXT NOT NULL,
      summary TEXT,
      pub_date TEXT,
      source TEXT,
      feed_url TEXT,
      created_at INTEGER NOT NULL,
      sent_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_news_items_sent_at
      ON news_items (sent_at, created_at);

    CREATE TABLE IF NOT EXISTS feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT UNIQUE NOT NULL,
      title TEXT,
      created_at INTEGER NOT NULL
    );
  `);
    // Ensure the summary column exists on existing databases.
    const columns = database.prepare('PRAGMA table_info(news_items)').all();
    const hasSummary = columns.some((col) => col.name === 'summary');
    if (!hasSummary) {
        database.exec('ALTER TABLE news_items ADD COLUMN summary TEXT');
    }
    // Seed default feeds if none have been configured yet.
    const countRow = database.prepare('SELECT COUNT(*) as count FROM feeds').get();
    if (countRow.count === 0) {
        const now = Date.now();
        const stmt = database.prepare(`
      INSERT OR IGNORE INTO feeds (url, title, created_at)
      VALUES (@url, @title, @createdAt)
    `);
        const tx = database.transaction((urls) => {
            for (const url of urls) {
                stmt.run({ url, title: null, createdAt: now });
            }
        });
        tx(DEFAULT_FEEDS);
    }
}
function saveNewsItems(items) {
    if (!items.length) {
        return { inserted: 0 };
    }
    const database = getDb();
    const now = Date.now();
    const stmt = database.prepare(`
    INSERT OR IGNORE INTO news_items
      (id, title, link, summary, pub_date, source, feed_url, created_at)
    VALUES
      (@id, @title, @link, @summary, @pubDate, @source, @feedUrl, @createdAt)
  `);
    const tx = database.transaction((records) => {
        let count = 0;
        for (const item of records) {
            const result = stmt.run({
                id: item.id,
                title: item.title,
                link: item.link,
                summary: item.summary ?? null,
                pubDate: item.pubDate ?? null,
                source: item.source ?? null,
                feedUrl: item.feedUrl ?? null,
                createdAt: now,
            });
            if (result.changes > 0) {
                count += 1;
            }
        }
        return count;
    });
    const inserted = tx(items);
    return { inserted };
}
function getUnsentItems(limit) {
    const database = getDb();
    const rows = database
        .prepare(`
      SELECT
        id,
        title,
        link,
        summary,
        pub_date as pubDate,
        source,
        feed_url as feedUrl,
        created_at as createdAt,
        sent_at as sentAt
      FROM news_items
      WHERE sent_at IS NULL
      ORDER BY created_at ASC
      LIMIT ?
    `)
        .all(limit);
    return rows;
}
function markItemsSent(ids) {
    if (!ids.length) {
        return;
    }
    const database = getDb();
    const stmt = database.prepare(`
    UPDATE news_items
    SET sent_at = @sentAt
    WHERE id = @id
  `);
    const sentAt = Date.now();
    const tx = database.transaction((allIds) => {
        for (const id of allIds) {
            stmt.run({ id, sentAt });
        }
    });
    tx(ids);
}
function searchNewsItems(query, limit) {
    const trimmed = query.trim();
    if (!trimmed) {
        return [];
    }
    const database = getDb();
    const pattern = `%${trimmed.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
    const rows = database
        .prepare(`
      SELECT
        id,
        title,
        link,
        summary,
        pub_date as pubDate,
        source,
        feed_url as feedUrl,
        created_at as createdAt,
        sent_at as sentAt
      FROM news_items
      WHERE
        (title LIKE @pattern ESCAPE '\\'
         OR summary LIKE @pattern ESCAPE '\\'
         OR source LIKE @pattern ESCAPE '\\')
      ORDER BY created_at DESC
      LIMIT @limit
    `)
        .all({ pattern, limit });
    return rows;
}
function listRecentItems(limit, offset = 0) {
    const database = getDb();
    const rows = database
        .prepare(`
      SELECT
        id,
        title,
        link,
        summary,
        pub_date as pubDate,
        source,
        feed_url as feedUrl,
        created_at as createdAt,
        sent_at as sentAt
      FROM news_items
      ORDER BY created_at DESC
      LIMIT ?
      OFFSET ?
    `)
        .all(limit, offset);
    return rows;
}
function getArticle(id) {
    const database = getDb();
    const row = database
        .prepare(`
      SELECT
        id,
        title,
        link,
        summary,
        pub_date as pubDate,
        source,
        feed_url as feedUrl,
        created_at as createdAt,
        sent_at as sentAt
      FROM news_items
      WHERE id = ?
    `)
        .get(id);
    return row;
}
function listFeeds() {
    const database = getDb();
    const rows = database
        .prepare(`
      SELECT
        id,
        url,
        title,
        created_at as createdAt
      FROM feeds
      ORDER BY url ASC
    `)
        .all();
    return rows;
}
function addFeed(url, title) {
    const trimmed = url.trim();
    if (!trimmed) {
        throw new Error('Feed URL is required');
    }
    const database = getDb();
    const now = Date.now();
    database
        .prepare(`
    INSERT OR IGNORE INTO feeds (url, title, created_at)
    VALUES (@url, @title, @createdAt)
  `)
        .run({
        url: trimmed,
        title: title ?? null,
        createdAt: now,
    });
    const row = database
        .prepare(`
      SELECT
        id,
        url,
        title,
        created_at as createdAt
      FROM feeds
      WHERE url = ?
    `)
        .get(trimmed);
    if (!row) {
        throw new Error('Failed to insert or retrieve feed');
    }
    return row;
}
function deleteFeed(id) {
    const database = getDb();
    database.prepare('DELETE FROM feeds WHERE id = ?').run(id);
}
function updateFeedTitle(url, title) {
    const database = getDb();
    database
        .prepare(`
      UPDATE feeds
      SET title = @title
      WHERE url = @url
    `)
        .run({ url, title });
}
