import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Logger } from '../logger.js';

const HEX_32_BYTE_PATTERN = /^0x[0-9a-fA-F]{64}$/u;

export interface XmtpSecrets {
  walletKey: string;
  dbEncryptionKey: string;
  walletKeySource: 'env' | 'file' | 'generated';
  dbEncryptionKeySource: 'env' | 'file' | 'generated';
}

export async function ensureXmtpSecrets(
  input: {
    configuredWalletKey?: string;
    configuredDbEncryptionKey?: string;
    walletKeyPath: string;
    dbEncryptionKeyPath: string;
  },
  logger: Logger
): Promise<XmtpSecrets> {
  const walletKey = await ensureHexSecret(
    input.configuredWalletKey,
    input.walletKeyPath,
    'xmtp_wallet_key',
    logger
  );
  const dbEncryptionKey = await ensureHexSecret(
    input.configuredDbEncryptionKey,
    input.dbEncryptionKeyPath,
    'xmtp_db_encryption_key',
    logger
  );

  return {
    walletKey: walletKey.value,
    dbEncryptionKey: dbEncryptionKey.value,
    walletKeySource: walletKey.source,
    dbEncryptionKeySource: dbEncryptionKey.source
  };
}

async function ensureHexSecret(
  configuredValue: string | undefined,
  filePath: string,
  label: string,
  logger: Logger
): Promise<{ value: string; source: 'env' | 'file' | 'generated' }> {
  if (isValidHexSecret(configuredValue)) {
    return {
      value: configuredValue,
      source: 'env'
    };
  }

  const fileValue = await readSecretFile(filePath);
  if (isValidHexSecret(fileValue)) {
    logger.info(`${label}_loaded`, {
      source: 'file',
      path: filePath
    });
    return {
      value: fileValue,
      source: 'file'
    };
  }

  const generatedValue = `0x${randomBytes(32).toString('hex')}`;
  await persistSecretFile(filePath, generatedValue);
  logger.warn(`${label}_generated`, {
    path: filePath
  });
  return {
    value: generatedValue,
    source: 'generated'
  };
}

function isValidHexSecret(value: string | undefined): value is `0x${string}` {
  return Boolean(value && HEX_32_BYTE_PATTERN.test(value));
}

async function readSecretFile(filePath: string): Promise<string | undefined> {
  try {
    const value = (await readFile(filePath, 'utf8')).trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

async function persistSecretFile(filePath: string, value: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${value}\n`, { encoding: 'utf8', mode: 0o600 });
  await chmod(filePath, 0o600);
}

