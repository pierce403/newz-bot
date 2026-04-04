import { createApp } from './app/bootstrap.js';
import { getConfig } from './config.js';
import { rootLogger } from './logger.js';
import { XmtpAgentRunner } from './xmtp/agentRunner.js';

async function main(): Promise<void> {
  const config = getConfig();
  const { app } = createApp();
  const logger = rootLogger.child('xmtp-runner');
  const runner = await XmtpAgentRunner.create(config, app, logger);

  process.on('SIGINT', async () => {
    logger.info('xmtp_shutdown_requested');
    await runner.stop();
    process.exit(0);
  });

  await runner.start();
}

void main();
