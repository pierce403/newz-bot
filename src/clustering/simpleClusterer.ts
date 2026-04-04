import type { Article, Clusterer, SituationClusterDraft } from '../types.js';
import { stableId } from '../utils/hash.js';
import {
  extractNamedEntities,
  jaccardScore,
  takeTopTerms,
  titleTokenSet
} from '../utils/text.js';

interface ArticleFeatures {
  tokens: Set<string>;
  entities: Set<string>;
}

interface MutableCluster {
  articles: Article[];
  tokenCounts: Map<string, number>;
  entityCounts: Map<string, number>;
}

export class SimpleClusterer implements Clusterer {
  cluster(topic: string, articles: Article[]): SituationClusterDraft[] {
    const deduped = dedupeByTitle(articles);
    const clusters: MutableCluster[] = [];

    for (const article of sortByPublishedAt(deduped)) {
      const features = describeArticle(article);
      let bestCluster: MutableCluster | undefined;
      let bestScore = 0;

      for (const cluster of clusters) {
        const score = scoreArticleAgainstCluster(features, cluster);
        if (score > bestScore) {
          bestScore = score;
          bestCluster = cluster;
        }
      }

      if (!bestCluster || bestScore < 0.28) {
        clusters.push(createCluster(article, features));
        continue;
      }

      bestCluster.articles.push(article);
      mergeCounts(bestCluster.tokenCounts, features.tokens);
      mergeCounts(bestCluster.entityCounts, features.entities);
    }

    return clusters
      .map((cluster) => finalizeCluster(topic, cluster))
      .sort((left, right) => {
        return (
          right.articleCount - left.articleCount ||
          new Date(right.lastSeen).getTime() - new Date(left.lastSeen).getTime()
        );
      });
  }
}

function describeArticle(article: Article): ArticleFeatures {
  return {
    tokens: titleTokenSet(article.title),
    entities: new Set(extractNamedEntities(article.title))
  };
}

function createCluster(article: Article, features: ArticleFeatures): MutableCluster {
  return {
    articles: [article],
    tokenCounts: mergeCounts(new Map<string, number>(), features.tokens),
    entityCounts: mergeCounts(new Map<string, number>(), features.entities)
  };
}

function mergeCounts(counts: Map<string, number>, values: Iterable<string>): Map<string, number> {
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return counts;
}

function scoreArticleAgainstCluster(article: ArticleFeatures, cluster: MutableCluster): number {
  const clusterTokens = new Set(cluster.tokenCounts.keys());
  const clusterEntities = new Set(cluster.entityCounts.keys());
  const tokenScore = jaccardScore(article.tokens, clusterTokens);
  const entityScore = jaccardScore(article.entities, clusterEntities);
  const sharedTokenCount = countSharedValues(article.tokens, clusterTokens);

  const representative = cluster.articles[0];
  const representativeTokens = representative ? titleTokenSet(representative.title) : new Set<string>();
  const representativeScore = jaccardScore(article.tokens, representativeTokens);

  const sameDomainOnly =
    cluster.articles.length > 0 &&
    cluster.articles.every((existing) => existing.domain === cluster.articles[0]?.domain);
  const domainPenalty = sameDomainOnly && !tokenScore && !entityScore ? 0.1 : 0;

  return (
    tokenScore * 0.45 +
    entityScore * 0.25 +
    representativeScore * 0.15 +
    Math.min(sharedTokenCount, 4) * 0.04 -
    domainPenalty
  );
}

function finalizeCluster(topic: string, cluster: MutableCluster): SituationClusterDraft {
  const sortedArticles = sortByPublishedAt(cluster.articles);
  const firstSeen = sortedArticles.at(-1)?.publishedAt || new Date().toISOString();
  const lastSeen = sortedArticles[0]?.publishedAt || new Date().toISOString();
  const representative = sortedArticles[0];

  return {
    id: stableId(`${topic}:${representative?.id || firstSeen}`),
    topic,
    articles: sortedArticles.slice(0, 5),
    articleCount: cluster.articles.length,
    firstSeen,
    lastSeen,
    keywords: takeTopTerms(cluster.tokenCounts, 6),
    namedEntities: takeTopTerms(cluster.entityCounts, 5)
  };
}

function sortByPublishedAt(articles: Article[]): Article[] {
  return [...articles].sort(
    (left, right) => new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime()
  );
}

function dedupeByTitle(articles: Article[]): Article[] {
  const deduped: Article[] = [];
  const signatures = new Set<string>();

  for (const article of articles) {
    const signature = [...titleTokenSet(article.title)].sort().slice(0, 6).join(':');
    if (signatures.has(signature)) {
      continue;
    }
    signatures.add(signature);
    deduped.push(article);
  }

  return deduped;
}

function countSharedValues(left: Iterable<string>, right: Set<string>): number {
  let count = 0;
  for (const value of left) {
    if (right.has(value)) {
      count += 1;
    }
  }
  return count;
}
