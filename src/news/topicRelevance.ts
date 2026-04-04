import type { Article } from '../types.js';
import { normalizeTopic, normalizeWhitespace, tokenize } from '../utils/text.js';

const GENERIC_TOPIC_TOKENS = new Set([
  'analysis',
  'breaking',
  'chain',
  'current',
  'development',
  'developments',
  'digest',
  'event',
  'events',
  'global',
  'industry',
  'latest',
  'market',
  'markets',
  'new',
  'news',
  'policy',
  'policies',
  'situation',
  'situations',
  'story',
  'stories',
  'supply',
  'topic',
  'update',
  'updates'
]);

const TOPIC_ALIASES: Record<string, string[]> = {
  ai: ['artificial', 'intelligence'],
  chip: ['semiconductor', 'semiconductors', 'foundry', 'wafer', 'dram', 'memory', 'ddr', 'tsmc', 'nvidia', 'intel', 'amd'],
  chips: ['semiconductor', 'semiconductors', 'foundry', 'wafer', 'dram', 'memory', 'ddr', 'tsmc', 'nvidia', 'intel', 'amd'],
  semiconductor: ['chip', 'chips', 'foundry', 'wafer', 'fab', 'dram', 'memory', 'ddr', 'tsmc', 'samsung', 'hynix', 'nvidia', 'intel', 'amd'],
  semiconductors: ['chip', 'chips', 'foundry', 'wafer', 'fab', 'dram', 'memory', 'ddr', 'tsmc', 'samsung', 'hynix', 'nvidia', 'intel', 'amd']
};

interface TopicProfile {
  phrase: string;
  normalizedPhrase: string;
  topicTokens: string[];
  anchors: string[];
  aliases: string[];
}

export function buildGdeltQuery(topic: string): string {
  return topic;
}

export function rankAndFilterArticles(topic: string, articles: Article[]): Article[] {
  const profile = buildTopicProfile(topic);
  const scored = articles
    .map((article) => ({
      article,
      score: scoreArticle(profile, article)
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      return (
        right.score - left.score ||
        new Date(right.article.publishedAt).getTime() - new Date(left.article.publishedAt).getTime()
      );
    });

  const stronglyRelevant = scored.filter((entry) => entry.score >= 1.5);
  const englishStronglyRelevant = stronglyRelevant.filter((entry) => isEnglish(entry.article));

  if (englishStronglyRelevant.length >= 5) {
    return englishStronglyRelevant.map((entry) => entry.article);
  }

  if (stronglyRelevant.length >= 5) {
    return stronglyRelevant.map((entry) => entry.article);
  }

  const englishRelevant = scored.filter((entry) => isEnglish(entry.article));
  if (englishRelevant.length >= 5) {
    return englishRelevant.map((entry) => entry.article);
  }

  return scored.map((entry) => entry.article);
}

function buildTopicProfile(topic: string): TopicProfile {
  const phrase = normalizeWhitespace(topic);
  const topicTokens = tokenize(phrase);
  const anchors = topicTokens.filter((token) => !GENERIC_TOPIC_TOKENS.has(token));
  const aliases = [...new Set(anchors.flatMap((anchor) => TOPIC_ALIASES[anchor] || []))];

  return {
    phrase,
    normalizedPhrase: normalizeTopic(phrase),
    topicTokens,
    anchors,
    aliases
  };
}

function scoreArticle(profile: TopicProfile, article: Article): number {
  const haystack = normalizeTopic(`${article.title} ${article.snippet || ''}`);
  const articleTokens = new Set(tokenize(haystack));

  const phraseMatch = haystack.includes(profile.normalizedPhrase);
  const anchorMatches = countMatches(profile.anchors, articleTokens);
  const aliasMatches = countMatches(profile.aliases, articleTokens);
  const topicTokenMatches = countMatches(profile.topicTokens, articleTokens);

  if (profile.anchors.length > 0 && !phraseMatch && anchorMatches === 0 && aliasMatches === 0) {
    return 0;
  }

  let score = 0;
  if (phraseMatch) {
    score += 4;
  }

  score += anchorMatches * 2;
  score += aliasMatches * 1;
  score += Math.min(topicTokenMatches, 3) * 0.25;

  if (isEnglish(article)) {
    score += 0.5;
  }

  return score;
}

function countMatches(values: string[], articleTokens: Set<string>): number {
  return values.reduce((count, value) => count + (articleTokens.has(value) ? 1 : 0), 0);
}

function isEnglish(article: Article): boolean {
  return article.language.toLowerCase() === 'english';
}
