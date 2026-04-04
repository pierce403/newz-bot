import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  SubscriptionDatabase,
  SubscriptionStore,
  TopicSubscription,
  UserSubscriptions
} from '../types.js';
import { Logger } from '../logger.js';
import { normalizeTopic } from '../utils/text.js';

const EMPTY_DATABASE: SubscriptionDatabase = {
  version: 1,
  users: []
};

export class FileSubscriptionStore implements SubscriptionStore {
  constructor(private readonly filePath: string, private readonly logger: Logger) {}

  async subscribe(userId: string, topic: string): Promise<{ created: boolean; subscription: TopicSubscription }> {
    const db = await this.load();
    const user = findOrCreateUser(db, userId);
    const normalized = normalizeTopic(topic);
    const existing = user.topics.find((subscription) => subscription.normalizedTopic === normalized);

    if (existing) {
      return { created: false, subscription: existing };
    }

    const subscription: TopicSubscription = {
      topic: topic.trim(),
      normalizedTopic: normalized,
      subscribedAt: new Date().toISOString()
    };

    user.topics.push(subscription);
    user.topics.sort((left, right) => left.topic.localeCompare(right.topic));
    await this.save(db);

    this.logger.info('subscription_saved', { userId, topic: subscription.topic });
    return { created: true, subscription };
  }

  async unsubscribe(userId: string, topic: string): Promise<boolean> {
    const db = await this.load();
    const user = db.users.find((entry) => entry.userId === userId);
    if (!user) {
      return false;
    }

    const normalized = normalizeTopic(topic);
    const initialLength = user.topics.length;
    user.topics = user.topics.filter((subscription) => subscription.normalizedTopic !== normalized);

    if (user.topics.length === initialLength) {
      return false;
    }

    await this.save(db);
    this.logger.info('subscription_removed', { userId, topic: normalized });
    return true;
  }

  async listSubscriptions(userId: string): Promise<TopicSubscription[]> {
    const db = await this.load();
    return db.users.find((entry) => entry.userId === userId)?.topics || [];
  }

  async listUsers(): Promise<UserSubscriptions[]> {
    const db = await this.load();
    return db.users;
  }

  async updateLastDelivered(userId: string, topic: string, deliveredAt: string): Promise<void> {
    const db = await this.load();
    const user = db.users.find((entry) => entry.userId === userId);
    if (!user) {
      return;
    }

    const normalized = normalizeTopic(topic);
    const subscription = user.topics.find((entry) => entry.normalizedTopic === normalized);
    if (!subscription) {
      return;
    }

    subscription.lastDeliveredAt = deliveredAt;
    await this.save(db);
  }

  private async load(): Promise<SubscriptionDatabase> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return JSON.parse(raw) as SubscriptionDatabase;
    } catch {
      return structuredClone(EMPTY_DATABASE);
    }
  }

  private async save(db: SubscriptionDatabase): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    await writeFile(tempPath, JSON.stringify(db, null, 2), 'utf8');
    await rename(tempPath, this.filePath);
  }
}

function findOrCreateUser(db: SubscriptionDatabase, userId: string): UserSubscriptions {
  let user = db.users.find((entry) => entry.userId === userId);
  if (user) {
    return user;
  }

  user = {
    userId,
    topics: []
  };
  db.users.push(user);
  return user;
}

