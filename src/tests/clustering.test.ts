import assert from 'node:assert/strict';
import test from 'node:test';
import { SimpleClusterer } from '../clustering/simpleClusterer.js';
import type { Article } from '../types.js';

function article(id: string, title: string, domain: string, publishedAt: string): Article {
  return {
    id,
    title,
    url: `https://${domain}/${id}`,
    source: domain,
    domain,
    publishedAt,
    language: 'English',
    locations: [],
    persons: [],
    organizations: [],
    themes: []
  };
}

test('groups related headlines into the same situation', () => {
  const clusterer = new SimpleClusterer();
  const results = clusterer.cluster('semiconductor supply chain', [
    article('1', 'TSMC weighs new Arizona packaging expansion for AI chips', 'reuters.com', '2026-04-03T12:00:00Z'),
    article('2', 'TSMC Arizona packaging push tracks booming AI chip demand', 'ft.com', '2026-04-03T11:00:00Z'),
    article('3', 'Samsung and SK Hynix react to fresh memory pricing moves', 'nikkei.com', '2026-04-03T10:00:00Z')
  ]);

  assert.equal(results.length, 2);
  assert.equal(results[0]?.articleCount, 2);
});

