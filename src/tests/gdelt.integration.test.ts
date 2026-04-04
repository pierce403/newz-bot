import assert from 'node:assert/strict';
import test from 'node:test';
import { getConfig } from '../config.js';
import { GdeltNewsProvider } from '../gdelt/gdeltNewsProvider.js';
import { rootLogger } from '../logger.js';

const shouldRun = process.env.RUN_GDELT_INTEGRATION === '1';

test('fetches recent GDELT articles for a real topic', { skip: !shouldRun }, async () => {
  const config = getConfig();
  const provider = new GdeltNewsProvider(
    config.gdelt.apiBaseUrl,
    config.gdelt.timeoutMs,
    rootLogger.child('gdelt-integration-test')
  );

  const articles = await provider.fetchArticles({
    topic: 'semiconductor supply chain',
    timespan: '24h',
    maxRecords: 10
  });

  assert.ok(articles.length > 0);
  assert.ok(articles.every((article) => article.title.length > 0));
  assert.ok(articles.every((article) => article.url.startsWith('http')));
});
