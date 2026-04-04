import assert from 'node:assert/strict';
import test from 'node:test';
import { formatTopicDigest } from '../formatting/chatFormatter.js';
import type { TopicDigest } from '../types.js';

test('formats a compact topic digest', () => {
  const digest: TopicDigest = {
    topic: 'ai safety',
    timespan: '24h',
    fetchedAt: '2026-04-03T12:00:00Z',
    articleCount: 2,
    situations: [
      {
        id: '1',
        topic: 'ai safety',
        title: 'Regulators weigh frontier model reporting rules',
        summary: '2 related articles center on frontier model reporting rules.',
        articleCount: 2,
        firstSeen: '2026-04-03T10:00:00Z',
        lastSeen: '2026-04-03T11:00:00Z',
        keywords: ['regulators', 'models'],
        namedEntities: ['EU'],
        articles: [
          {
            id: 'a',
            title: 'Regulators weigh frontier model reporting rules',
            url: 'https://example.com/a',
            source: 'example.com',
            domain: 'example.com',
            publishedAt: '2026-04-03T11:00:00Z',
            language: 'English'
          }
        ]
      }
    ]
  };

  const rendered = formatTopicDigest(digest);

  assert.match(rendered, /Topic: ai safety/u);
  assert.match(rendered, /1\. Regulators weigh frontier model reporting rules/u);
  assert.match(rendered, /Commands: subscribe <topic>/u);
});

