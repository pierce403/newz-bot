import { mkdir } from 'node:fs/promises';
import { Agent, Client, getTestUrl } from '@xmtp/agent-sdk';
import type { AppConfig } from '../config.js';
import { BotApp } from '../app/botApp.js';
import { Logger } from '../logger.js';
import { ensureXmtpSecrets } from './localSecrets.js';
import { RecentMessageDeduper } from './messageDeduper.js';

export class XmtpAgentRunner {
  private readonly deduper = new RecentMessageDeduper();

  private constructor(
    private readonly agent: Agent,
    private readonly app: BotApp,
    private readonly logger: Logger
  ) {}

  static async create(config: AppConfig, app: BotApp, logger: Logger): Promise<XmtpAgentRunner> {
    if (config.xmtp.env !== 'production') {
      throw new Error(
        `This bot is configured to run only on XMTP production. Current XMTP_ENV=${config.xmtp.env}.`
      );
    }

    const secrets = await ensureXmtpSecrets(
      {
        configuredWalletKey: config.xmtp.walletKey,
        configuredDbEncryptionKey: config.xmtp.dbEncryptionKey,
        walletKeyPath: config.xmtp.generatedWalletKeyPath,
        dbEncryptionKeyPath: config.xmtp.generatedDbEncryptionKeyPath
      },
      logger
    );

    await mkdir(config.xmtp.dbDirectory, { recursive: true, mode: 0o700 });

    process.env.XMTP_WALLET_KEY = secrets.walletKey;
    process.env.XMTP_DB_ENCRYPTION_KEY = secrets.dbEncryptionKey;
    process.env.XMTP_DB_DIRECTORY = config.xmtp.dbDirectory;
    process.env.XMTP_ENV = config.xmtp.env;

    const agent = await Agent.createFromEnv({
      structuredLogging: true
    });

    logger.info('xmtp_agent_created', {
      env: config.xmtp.env,
      dbDirectory: config.xmtp.dbDirectory,
      walletKeySource: secrets.walletKeySource,
      dbEncryptionKeySource: secrets.dbEncryptionKeySource,
      address: agent.address
    });

    return new XmtpAgentRunner(agent, app, logger);
  }

  async start(): Promise<void> {
    this.installHandlers();
    await this.agent.start();
    await assertReachable(this.agent, this.logger);
  }

  async stop(): Promise<void> {
    await this.agent.stop();
  }

  private installHandlers(): void {
    this.agent.on('text', async (ctx) => {
      const input = ctx.message.content.trim();
      const userId = ctx.message.senderInboxId;
      const messageId = ctx.message.id;

      if (userId === this.agent.client.inboxId) {
        this.logger.warn('xmtp_self_message_skipped', {
          messageId,
          conversationId: ctx.conversation.id
        });
        return;
      }

      const { duplicate, key } = this.deduper.markSeen(ctx.message);
      if (duplicate) {
        this.logger.warn('xmtp_duplicate_message_skipped', {
          messageId,
          dedupeKey: key,
          senderInboxId: userId,
          conversationId: ctx.conversation.id
        });
        return;
      }

      this.logger.info('xmtp_message_received', {
        messageId,
        senderInboxId: userId,
        conversationId: ctx.conversation.id
      });

      const reply = await this.app.handleMessage(userId, input);
      await ctx.conversation.sendText(reply);

      this.logger.info('xmtp_reply_sent', {
        messageId,
        senderInboxId: userId,
        conversationId: ctx.conversation.id
      });
    });

    this.agent.on('start', (ctx) => {
      this.logger.info('xmtp_agent_started', {
        address: this.agent.address,
        inboxId: ctx.client.inboxId,
        env: ctx.client.env,
        testUrl: getTestUrl(ctx.client)
      });
    });

    this.agent.on('unhandledError', (error) => {
      this.logger.error('xmtp_agent_unhandled_error', {
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }
}

async function assertReachable(agent: Agent, logger: Logger): Promise<void> {
  const identifier = agent.client.accountIdentifier;
  if (!identifier) {
    throw new Error('XMTP agent started without an account identifier.');
  }

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const reachability = await Client.canMessage([identifier], agent.client.env);
    const isReachable = reachability.get(identifier.identifier.toLowerCase()) ?? false;
    if (isReachable) {
      logger.info('xmtp_agent_reachable', {
        address: identifier.identifier,
        attempt
      });
      return;
    }

    logger.warn('xmtp_agent_not_reachable_yet', {
      address: identifier.identifier,
      attempt
    });
    await sleep(1500);
  }

  throw new Error(
    `XMTP production still cannot resolve the agent address ${identifier.identifier} after startup.`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
