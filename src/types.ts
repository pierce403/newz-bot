export interface Article {
  id: string;
  title: string;
  url: string;
  source: string;
  domain: string;
  publishedAt: string;
  language: string;
  snippet?: string;
  tone?: number;
  locations?: string[];
  persons?: string[];
  organizations?: string[];
  themes?: string[];
}

export interface NewsQuery {
  topic: string;
  timespan: string;
  maxRecords: number;
}

export interface SituationClusterDraft {
  id: string;
  topic: string;
  articles: Article[];
  articleCount: number;
  firstSeen: string;
  lastSeen: string;
  keywords: string[];
  namedEntities: string[];
}

export interface SituationCluster extends SituationClusterDraft {
  title: string;
  summary: string;
}

export interface TopicDigest {
  topic: string;
  timespan: string;
  fetchedAt: string;
  articleCount: number;
  situations: SituationCluster[];
}

export interface TopicSubscription {
  topic: string;
  normalizedTopic: string;
  subscribedAt: string;
  lastDeliveredAt?: string;
}

export interface UserSubscriptions {
  userId: string;
  topics: TopicSubscription[];
}

export interface SubscriptionDatabase {
  version: number;
  users: UserSubscriptions[];
}

export interface NewsProvider {
  fetchArticles(query: NewsQuery): Promise<Article[]>;
}

export interface Clusterer {
  cluster(topic: string, articles: Article[]): SituationClusterDraft[];
}

export interface Summarizer {
  summarize(topic: string, draft: SituationClusterDraft): SituationCluster;
}

export interface SubscriptionStore {
  subscribe(userId: string, topic: string): Promise<{ created: boolean; subscription: TopicSubscription }>;
  unsubscribe(userId: string, topic: string): Promise<boolean>;
  listSubscriptions(userId: string): Promise<TopicSubscription[]>;
  listUsers(): Promise<UserSubscriptions[]>;
  updateLastDelivered(userId: string, topic: string, deliveredAt: string): Promise<void>;
}

export interface Transport {
  sendMessage(userId: string, text: string): Promise<void>;
}

export type ParsedCommand =
  | { kind: 'help'; raw: string }
  | { kind: 'greeting'; raw: string }
  | { kind: 'list-subscriptions'; raw: string }
  | { kind: 'digest'; raw: string }
  | { kind: 'latest'; raw: string }
  | { kind: 'news'; raw: string; topic: string; implicit: boolean }
  | { kind: 'subscribe'; raw: string; topic: string }
  | { kind: 'unsubscribe'; raw: string; topic: string };
