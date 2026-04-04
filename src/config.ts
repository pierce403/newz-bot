import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type XmtpEnv = 'production' | 'dev' | 'local';

export interface AppConfig {
  dataDir: string;
  httpPort: number;
  logLevel: LogLevel;
  gdelt: {
    apiBaseUrl: string;
    defaultTimespan: string;
    maxArticles: number;
    timeoutMs: number;
  };
  xmtp: {
    walletKey?: string;
    dbEncryptionKey?: string;
    generatedWalletKeyPath: string;
    generatedDbEncryptionKeyPath: string;
    env: XmtpEnv;
    dbDirectory: string;
  };
}

let loaded = false;

function loadDotEnv(filePath = path.resolve(process.cwd(), '.env')): void {
  if (loaded || !existsSync(filePath)) {
    loaded = true;
    return;
  }

  const content = readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }

  loaded = true;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeXmtpEnv(value: string | undefined): XmtpEnv {
  if (value === 'dev' || value === 'local' || value === 'production') {
    return value;
  }
  return 'production';
}

export function getConfig(): AppConfig {
  loadDotEnv();

  const dataDir = path.resolve(process.cwd(), process.env.DATA_DIR || '.data');
  const xmtpDbDirectory = path.resolve(
    process.cwd(),
    process.env.XMTP_DB_DIRECTORY || process.env.XMTP_DB_PATH || '.data/xmtp-agent'
  );
  const generatedWalletKeyPath = path.resolve(
    process.cwd(),
    process.env.XMTP_GENERATED_WALLET_KEY_PATH || '.data/xmtp-wallet-key'
  );
  const generatedDbEncryptionKeyPath = path.resolve(
    process.cwd(),
    process.env.XMTP_GENERATED_DB_ENCRYPTION_KEY_PATH || '.data/xmtp-db-encryption-key'
  );
  const walletKey = process.env.XMTP_WALLET_KEY?.trim() || process.env.XMTP_PRIVATE_KEY?.trim();
  const dbEncryptionKey =
    process.env.XMTP_DB_ENCRYPTION_KEY?.trim() ||
    (process.env.XMTP_DB_ENCRYPTION_KEY_HEX?.trim()
      ? `0x${process.env.XMTP_DB_ENCRYPTION_KEY_HEX.trim().replace(/^0x/u, '')}`
      : undefined);

  return {
    dataDir,
    httpPort: parsePositiveInt(process.env.HTTP_PORT, 8787),
    logLevel: (process.env.LOG_LEVEL as LogLevel | undefined) || 'info',
    gdelt: {
      apiBaseUrl: process.env.GDELT_API_BASE_URL || 'https://api.gdeltproject.org/api/v2/doc/doc',
      defaultTimespan: process.env.GDELT_DEFAULT_TIMESPAN || '24h',
      maxArticles: parsePositiveInt(process.env.GDELT_MAX_ARTICLES, 40),
      timeoutMs: parsePositiveInt(process.env.GDELT_FETCH_TIMEOUT_MS, 15000)
    },
    xmtp: {
      walletKey,
      dbEncryptionKey,
      generatedWalletKeyPath,
      generatedDbEncryptionKeyPath,
      env: normalizeXmtpEnv(process.env.XMTP_ENV),
      dbDirectory: xmtpDbDirectory
    }
  };
}
