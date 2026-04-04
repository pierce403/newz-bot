import type { Clusterer, NewsProvider, SituationCluster, Summarizer, TopicDigest } from '../types.js';
import { Logger } from '../logger.js';
import { rankAndFilterArticles } from './topicRelevance.js';

export class NewsService {
  private readonly inFlightDigests = new Map<string, Promise<TopicDigest>>();

  constructor(
    private readonly provider: NewsProvider,
    private readonly clusterer: Clusterer,
    private readonly summarizer: Summarizer,
    private readonly logger: Logger
  ) {}

  async getTopicDigest(topic: string, timespan: string, maxRecords: number): Promise<TopicDigest> {
    const cacheKey = `${topic.toLowerCase()}::${timespan}::${maxRecords}`;
    const existing = this.inFlightDigests.get(cacheKey);
    if (existing) {
      this.logger.info('topic_digest_reused_inflight', {
        topic,
        timespan,
        maxRecords
      });
      return existing;
    }

    const promise = this.buildTopicDigest(topic, timespan, maxRecords);
    this.inFlightDigests.set(cacheKey, promise);

    try {
      return await promise;
    } finally {
      this.inFlightDigests.delete(cacheKey);
    }
  }

  private async buildTopicDigest(
    topic: string,
    timespan: string,
    maxRecords: number
  ): Promise<TopicDigest> {
    const fetchedArticles = await this.provider.fetchArticles({
      topic,
      timespan,
      maxRecords
    });
    const articles = rankAndFilterArticles(topic, fetchedArticles);
    const clustered = this.clusterer.cluster(topic, articles);
    const situations: SituationCluster[] = clustered.map((cluster) =>
      this.summarizer.summarize(topic, cluster)
    );

    this.logger.info('topic_digest_built', {
      topic,
      articleCount: articles.length,
      fetchedArticleCount: fetchedArticles.length,
      situationCount: situations.length
    });

    return {
      topic,
      timespan,
      fetchedAt: new Date().toISOString(),
      articleCount: articles.length,
      situations
    };
  }
}
