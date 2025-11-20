#!/usr/bin/env -S npx tsx

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { Wallet } from 'ethers';
import { Agent, validHex, ConversationContext, type XmtpEnv } from '@xmtp/agent-sdk';
import { createUser, createSigner } from '@xmtp/agent-sdk/user';

// Config mirroring newzbot-agent-runtime.js
const KEY_PATH = process.env.NEWZBOT_KEY_PATH || path.resolve(process.cwd(), 'newzbot.key');
const XMTP_ENV = (process.env.NEWZBOT_XMTP_ENV || process.env.XMTP_ENV || 'production').toLowerCase() as XmtpEnv;
// The operator address from agent/newzbot-agent-runtime.js
const OPERATOR_ADDRESS = '0xA2C6D9fd16a78199856aa41Ef8963b1832311605';

async function main() {
  console.log(`Starting connectivity test...`);
  console.log(`Env: ${XMTP_ENV}`);

  if (!fs.existsSync(KEY_PATH)) {
    console.error(`Key file not found at ${KEY_PATH}`);
    process.exit(1);
  }

  const privateKey = fs.readFileSync(KEY_PATH, 'utf8').trim();
  const wallet = new Wallet(privateKey);
  console.log(`Wallet address: ${wallet.address}`);

  const user = createUser(validHex(privateKey));
  const signer = createSigner(user);

  const dbPath = path.resolve(process.cwd(), `newzbot-xmtp-${XMTP_ENV}.db3`);
  console.log(`Using DB: ${dbPath}`);

  console.log('Creating Agent...');
  const agent = await Agent.create(signer, {
    env: XMTP_ENV,
    dbPath,
  });

  console.log(`Agent initialized. Installation ID: ${agent.client.installationId}`);

  const target = validHex(OPERATOR_ADDRESS);
  console.log(`Sending 'hello' to ${target}...`);

  // Create DM and send message
  const dm = await agent.createDmWithAddress(target);
  const ctx = new ConversationContext({ conversation: dm, client: agent.client });

  const result = await ctx.sendText('hello');
  console.log('Message sent!');
  console.log('Return value:', result);
  console.log('Message ID:', result?.id || 'no id');
  console.log('Full result:', JSON.stringify(result, Object.getOwnPropertyNames(result), 2));

  // Exit successfully
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
