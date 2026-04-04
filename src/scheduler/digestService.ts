import type { SubscriptionStore, TopicDigest, Transport } from '../types.js';
import { Logger } from '../logger.js';
import { formatDigestCollection } from '../formatting/chatFormatter.js';
import { NewsService } from '../news/newsService.js';
import { deriveTimespanFromHours, hoursBetween } from '../utils/time.js';

export class DigestService {
  constructor(
    private readonly store: SubscriptionStore,
    private readonly newsService: NewsService,
    private readonly defaultTimespan: string,
    private readonly maxArticles: number,
    private readonly logger: Logger
  ) {}

  async buildForUser(userId: string, mode: 'digest' | 'latest'): Promise<{ digests: TopicDigest[]; text: string }> {
    const subscriptions = await this.store.listSubscriptions(userId);
    const digests: TopicDigest[] = [];

    for (const subscription of subscriptions) {
      const timespan =
        mode === 'latest'
          ? this.defaultTimespan
          : deriveTimespanFromHours(hoursBetween(subscription.lastDeliveredAt));

      const digest = await this.newsService.getTopicDigest(
        subscription.topic,
        timespan,
        this.maxArticles
      );

      digests.push(digest);
    }

    return {
      digests,
      text: formatDigestCollection(digests, mode)
    };
  }

  async runAll(transport: Transport): Promise<void> {
    const users = await this.store.listUsers();
    const deliveredAt = new Date().toISOString();

    for (const user of users) {
      if (user.topics.length === 0) {
        continue;
      }

      const { text } = await this.buildForUser(user.userId, 'digest');
      await transport.sendMessage(user.userId, text);

      for (const topic of user.topics) {
        await this.store.updateLastDelivered(user.userId, topic.topic, deliveredAt);
      }

      this.logger.info('digest_sent', {
        userId: user.userId,
        topicCount: user.topics.length
      });
    }
  }
}

