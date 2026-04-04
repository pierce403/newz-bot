import path from 'node:path';
import { SimpleClusterer } from '../clustering/simpleClusterer.js';
import { getConfig } from '../config.js';
import { formatHelp } from '../formatting/chatFormatter.js';
import { GdeltNewsProvider } from '../gdelt/gdeltNewsProvider.js';
import { rootLogger } from '../logger.js';
import { HeuristicSummarizer } from '../news/heuristicSummarizer.js';
import { NewsService } from '../news/newsService.js';
import { DigestService } from '../scheduler/digestService.js';
import { FileSubscriptionStore } from '../subscriptions/fileSubscriptionStore.js';
import { BotApp } from './botApp.js';

export function createApp(): { app: BotApp; digestService: DigestService } {
  const config = getConfig();
  const logger = rootLogger.child('bootstrap');

  const provider = new GdeltNewsProvider(
    config.gdelt.apiBaseUrl,
    config.gdelt.timeoutMs,
    logger.child('gdelt')
  );
  const clusterer = new SimpleClusterer();
  const summarizer = new HeuristicSummarizer();
  const newsService = new NewsService(provider, clusterer, summarizer, logger.child('news'));
  const store = new FileSubscriptionStore(
    path.resolve(config.dataDir, 'subscriptions.json'),
    logger.child('subscriptions')
  );
  const digestService = new DigestService(
    store,
    newsService,
    config.gdelt.defaultTimespan,
    config.gdelt.maxArticles,
    logger.child('digest')
  );
  const app = new BotApp(
    newsService,
    digestService,
    store,
    config.gdelt.defaultTimespan,
    config.gdelt.maxArticles,
    logger.child('bot')
  );

  logger.debug('bootstrap_complete', {
    helpPreview: formatHelp()
  });

  return { app, digestService };
}

