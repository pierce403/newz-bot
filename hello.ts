#!/usr/bin/env -S npx tsx

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { Wallet } from 'ethers';
import { Agent, validHex, ConversationContext, type XmtpEnv } from '@xmtp/agent-sdk';
import { createUser, createSigner, createNameResolver } from '@xmtp/agent-sdk/user';

// Config mirroring newzbot-agent-runtime.js
const KEY_PATH = process.env.NEWZBOT_KEY_PATH || path.resolve(process.cwd(), 'newzbot.key');
const XMTP_ENV = (process.env.NEWZBOT_XMTP_ENV || process.env.XMTP_ENV || 'production').toLowerCase() as XmtpEnv;
// The operator address from agent/newzbot-agent-runtime.js
const OPERATOR_ADDRESS = process.env.NEWZBOT_OPERATOR_ADDRESS || '0xA2C6D9fd16a78199856aa41Ef8963b1832311605';
const DEBUG_EVENTS_ENABLED = true;

function logSection(title: string) {
  console.log(`\n=== ${title} ===`);
}

function logValue(label: string, value: unknown) {
  try {
    const seen = new WeakSet();
    const json = JSON.stringify(
      value,
      (_key, val) => {
        if (typeof val === 'bigint') return val.toString();
        if (val && typeof val === 'object') {
          if (seen.has(val)) return '[Circular]';
          seen.add(val);
          const props = Object.getOwnPropertyNames(val);
          const out: Record<string, unknown> | unknown[] = Array.isArray(val) ? [] : {};
          for (const prop of props) {
            try {
              (out as Record<string, unknown>)[prop] = (val as Record<string, unknown>)[prop];
            } catch (err: any) {
              (out as Record<string, unknown>)[prop] = `[unavailable: ${err?.message || err}]`;
            }
          }
          return out;
        }
        return val;
      },
      2,
    );
    console.log(`${label}: ${json}`);
  } catch {
    console.log(`${label}:`);
    console.dir(value, { depth: 6, colors: false });
  }
}

async function tryLog<T>(label: string, fn: () => Promise<T> | T) {
  try {
    const value = await fn();
    logValue(label, value);
    return value;
  } catch (err: any) {
    console.log(`${label}: <error> ${err?.message || err}`);
    return undefined;
  }
}

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
    debugEventsEnabled: DEBUG_EVENTS_ENABLED,
  });

  console.log(`Agent initialized. Installation ID: ${agent.client.installationId}`);

  logSection('Client info');
  console.log(`Client inboxId: ${agent.client.inboxId}`);
  console.log(`Client installationId: ${agent.client.installationId}`);
  console.log(`Client isRegistered: ${agent.client.isRegistered}`);
  console.log(`Agent address: ${agent.address || 'unknown'}`);
  logValue('Client options', agent.client.options);
  await tryLog('Client debug apiStatistics', () => agent.client.debugInformation.apiStatistics());
  await tryLog('Client debug identityStatistics', () => agent.client.debugInformation.apiIdentityStatistics());
  await tryLog('Client debug aggregateStatistics', () => agent.client.debugInformation.apiAggregateStatistics());

  let target: string;
  try {
    target = validHex(OPERATOR_ADDRESS);
  } catch {
    const resolveName = createNameResolver(process.env.WEB3BIO_API_KEY);
    console.log(`Attempting to resolve operator name "${OPERATOR_ADDRESS}"...`);
    const resolved = await resolveName(OPERATOR_ADDRESS);
    if (!resolved) {
      throw new Error(
        `Could not resolve operator "${OPERATOR_ADDRESS}" to a hex address. ` +
          `Set NEWZBOT_OPERATOR_ADDRESS to a 0x address or configure WEB3BIO_API_KEY.`,
      );
    }
    console.log(`Resolved operator "${OPERATOR_ADDRESS}" to address ${resolved}.`);
    target = validHex(resolved);
  }
  logSection('Conversation');
  const dm = await agent.createDmWithAddress(target);
  const ctx = new ConversationContext({ conversation: dm, client: agent.client });
  console.log(`Conversation ID: ${dm.id}`);
  console.log(`Peer inbox ID: ${dm.peerInboxId}`);
  console.log(`Consent state: ${dm.consentState}`);
  console.log(`Context state: allowed=${ctx.isAllowed} denied=${ctx.isDenied} unknown=${ctx.isUnknown}`);
  await tryLog('Conversation debugInfo', () => dm.debugInfo());

  logSection('Send');
  console.log(`Sending 'hello' to ${target}...`);
  const messageId = await dm.send('hello');
  console.log(`Message sent. Message ID: ${messageId}`);

  logSection('Post-send checks');
  await tryLog('Sync result', () => dm.sync());
  await tryLog('Last message', () => dm.lastMessage());
  await tryLog('Recent messages (limit 5)', () => dm.messages({ limit: 5 }));
  await tryLog('Client debug apiStatistics (after send)', () => agent.client.debugInformation.apiStatistics());
  await tryLog('Client debug identityStatistics (after send)', () => agent.client.debugInformation.apiIdentityStatistics());
  await tryLog('Client debug aggregateStatistics (after send)', () => agent.client.debugInformation.apiAggregateStatistics());

  console.log('\nConversation details:');
  console.log('  Conversation ID:', dm.id);
  // dm.topic and dm.peerAddress may not be available in all SDK versions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dmAny = dm as any;
  console.log('  Topic:', dmAny.topic || 'none');
  console.log('  Peer address:', dmAny.peerAddress || 'none');

  // Exit successfully
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
