import type { ParsedCommand, SubscriptionStore } from '../types.js';
import {
  formatGreeting,
  formatHelp,
  formatSubscriptionChange,
  formatSubscriptions,
  formatTopicDigest,
  formatUnsubscribeResult
} from '../formatting/chatFormatter.js';
import { Logger } from '../logger.js';
import { NewsService } from '../news/newsService.js';
import { DigestService } from '../scheduler/digestService.js';
import { parseCommand } from '../commands/parser.js';

export class BotApp {
  constructor(
    private readonly newsService: NewsService,
    private readonly digestService: DigestService,
    private readonly store: SubscriptionStore,
    private readonly defaultTimespan: string,
    private readonly maxArticles: number,
    private readonly logger: Logger
  ) {}

  async handleMessage(userId: string, text: string): Promise<string> {
    const command = parseCommand(text);

    this.logger.info('incoming_command', {
      userId,
      kind: command.kind
    });

    try {
      return await this.dispatch(userId, command);
    } catch (error) {
      this.logger.error('command_failed', {
        userId,
        kind: command.kind,
        error: error instanceof Error ? error.message : String(error)
      });
      return error instanceof Error && error.message
        ? error.message
        : 'Something went wrong while processing that request. Please try again.';
    }
  }

  private async dispatch(userId: string, command: ParsedCommand): Promise<string> {
    switch (command.kind) {
      case 'help':
        return formatHelp();
      case 'greeting':
        return formatGreeting();
      case 'list-subscriptions':
        return formatSubscriptions(await this.store.listSubscriptions(userId));
      case 'subscribe': {
        const result = await this.store.subscribe(userId, command.topic);
        return formatSubscriptionChange(result.subscription.topic, result.created);
      }
      case 'unsubscribe':
        return formatUnsubscribeResult(command.topic, await this.store.unsubscribe(userId, command.topic));
      case 'news': {
        const digest = await this.newsService.getTopicDigest(
          command.topic,
          this.defaultTimespan,
          this.maxArticles
        );
        return formatTopicDigest(digest);
      }
      case 'latest': {
        const { text } = await this.digestService.buildForUser(userId, 'latest');
        return text;
      }
      case 'digest': {
        const deliveredAt = new Date().toISOString();
        const subscriptions = await this.store.listSubscriptions(userId);
        const { text } = await this.digestService.buildForUser(userId, 'digest');
        for (const subscription of subscriptions) {
          await this.store.updateLastDelivered(userId, subscription.topic, deliveredAt);
        }
        return text;
      }
    }
  }
}
