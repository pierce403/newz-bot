import type { Article, NewsProvider, NewsQuery } from '../types.js';
import { Logger } from '../logger.js';
import { buildGdeltQuery } from '../news/topicRelevance.js';
import { stableId } from '../utils/hash.js';
import { parseDate } from '../utils/time.js';
import { normalizeWhitespace, stripHeadlineBoilerplate } from '../utils/text.js';

interface GdeltArticleRaw {
  url?: string;
  urlmobile?: string;
  title?: string;
  seendate?: string;
  socialimage?: string;
  domain?: string;
  language?: string;
  sourcecountry?: string;
  tone?: number | string;
  snippet?: string;
}

interface GdeltResponse {
  articles?: GdeltArticleRaw[];
}

export class GdeltNewsProvider implements NewsProvider {
  constructor(
    private readonly apiBaseUrl: string,
    private readonly timeoutMs: number,
    private readonly logger: Logger
  ) {}

  async fetchArticles(query: NewsQuery): Promise<Article[]> {
    const url = new URL(this.apiBaseUrl);
    const gdeltQuery = buildGdeltQuery(query.topic);
    url.searchParams.set('query', gdeltQuery);
    url.searchParams.set('mode', 'artlist');
    url.searchParams.set('format', 'json');
    url.searchParams.set('sort', 'datedesc');
    url.searchParams.set('timespan', query.timespan);
    url.searchParams.set('maxrecords', String(query.maxRecords));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      this.logger.info('fetching_gdelt_articles', {
        topic: query.topic,
        gdeltQuery,
        timespan: query.timespan,
        maxRecords: query.maxRecords
      });

      const response = await fetch(url, {
        headers: {
          accept: 'application/json'
        },
        signal: controller.signal
      });

      if (response.status === 429) {
        throw new Error('GDELT rate limit hit. Wait a few seconds and try again.');
      }

      if (!response.ok) {
        throw new Error(`GDELT returned ${response.status} ${response.statusText}`);
      }

      const json = (await response.json()) as GdeltResponse;
      const articles = (json.articles || [])
        .map((article) => this.normalizeArticle(article))
        .filter((article): article is Article => article !== undefined);

      this.logger.info('gdelt_articles_fetched', {
        topic: query.topic,
        articleCount: articles.length
      });

      return dedupeArticles(articles);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('gdelt_fetch_failed', {
        topic: query.topic,
        error: message
      });
      if (message.includes('rate limit')) {
        throw new Error(message);
      }
      throw new Error('Unable to reach GDELT right now. Try again in a minute or use a broader topic.');
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizeArticle(article: GdeltArticleRaw): Article | undefined {
    const url = article.url?.trim();
    const title = article.title ? stripHeadlineBoilerplate(article.title) : undefined;

    if (!url || !title) {
      return undefined;
    }

    const publishedAt = parseDate(article.seendate || new Date().toISOString()).toISOString();
    const domain = normalizeWhitespace(article.domain || extractDomain(url) || 'unknown');

    return {
      id: stableId(url),
      title,
      url,
      source: domain,
      domain,
      publishedAt,
      language: normalizeWhitespace(article.language || 'Unknown'),
      snippet: article.snippet ? normalizeWhitespace(article.snippet) : undefined,
      tone: parseTone(article.tone),
      locations: [],
      persons: [],
      organizations: [],
      themes: []
    };
  }
}

function parseTone(tone: number | string | undefined): number | undefined {
  if (tone === undefined) {
    return undefined;
  }
  const parsed = Number(tone);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractDomain(value: string): string | undefined {
  try {
    return new URL(value).hostname.replace(/^www\./u, '');
  } catch {
    return undefined;
  }
}

function dedupeArticles(articles: Article[]): Article[] {
  const seenUrls = new Set<string>();
  const deduped: Article[] = [];

  for (const article of articles) {
    const normalizedUrl = article.url.replace(/\/+$/u, '');
    if (seenUrls.has(normalizedUrl)) {
      continue;
    }

    seenUrls.add(normalizedUrl);
    deduped.push(article);
  }

  return deduped;
}
