import type { SituationCluster, TopicDigest, TopicSubscription } from '../types.js';
import { truncate } from '../utils/text.js';

function formatArticleLine(cluster: SituationCluster, limit = 3): string[] {
  return cluster.articles.slice(0, limit).map((article) => {
    return `- ${article.source}: ${truncate(article.title, 90)} ${article.url}`;
  });
}

export function formatHelp(): string {
  return [
    'Commands:',
    'news <topic>',
    'subscribe <topic>',
    'unsubscribe <topic>',
    'list subscriptions',
    'digest',
    'latest',
    'help',
    '',
    'Tip: sending a plain topic also works and is treated like "news <topic>".'
  ].join('\n');
}

export function formatGreeting(): string {
  return [
    'Hi. Send `news <topic>` for current situations and related articles.',
    'You can also use `subscribe <topic>`, `digest`, `latest`, or `help`.'
  ].join('\n');
}

export function formatTopicDigest(digest: TopicDigest, options?: { titlePrefix?: string }): string {
  const lines: string[] = [];
  const prefix = options?.titlePrefix || 'Topic';

  lines.push(`${prefix}: ${digest.topic}`);
  lines.push('');

  if (digest.situations.length === 0) {
    lines.push(`No recent situations found for "${digest.topic}" in the last ${digest.timespan}.`);
    return lines.join('\n');
  }

  digest.situations.slice(0, 4).forEach((cluster, index) => {
    lines.push(`${index + 1}. ${cluster.title}`);
    lines.push(cluster.summary);
    lines.push(...formatArticleLine(cluster, 3));
    lines.push('');
  });

  lines.push('Commands: subscribe <topic> | list subscriptions | digest');
  return lines.join('\n').trim();
}

export function formatSubscriptions(subscriptions: TopicSubscription[]): string {
  if (subscriptions.length === 0) {
    return 'No saved subscriptions yet. Use "subscribe <topic>" to add one.';
  }

  const lines = ['Subscriptions:'];
  subscriptions.forEach((subscription, index) => {
    lines.push(`${index + 1}. ${subscription.topic}`);
  });
  lines.push('');
  lines.push('Use "digest" for a catch-up or "unsubscribe <topic>" to remove one.');

  return lines.join('\n');
}

export function formatSubscriptionChange(topic: string, created: boolean): string {
  if (created) {
    return `Subscribed to "${topic}". Use "digest" to get a catch-up across saved topics.`;
  }
  return `Already subscribed to "${topic}".`;
}

export function formatUnsubscribeResult(topic: string, removed: boolean): string {
  if (removed) {
    return `Removed "${topic}" from subscriptions.`;
  }
  return `No saved subscription matched "${topic}".`;
}

export function formatDigestCollection(digests: TopicDigest[], mode: 'digest' | 'latest'): string {
  if (digests.length === 0) {
    return 'No recent updates across saved subscriptions.';
  }

  const lines = [mode === 'digest' ? 'Digest' : 'Latest', ''];

  digests.forEach((digest, index) => {
    lines.push(`${index + 1}. ${digest.topic}`);
    if (digest.situations.length === 0) {
      lines.push(`No new situations in the last ${digest.timespan}.`);
      lines.push('');
      return;
    }

    digest.situations.slice(0, 2).forEach((cluster) => {
      lines.push(`${cluster.title}`);
      lines.push(cluster.summary);
      lines.push(...formatArticleLine(cluster, 2));
      lines.push('');
    });
  });

  return lines.join('\n').trim();
}
