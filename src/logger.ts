import { getConfig, type LogLevel } from './config.js';

const weights: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

export class Logger {
  constructor(private readonly name: string, private readonly minLevel: LogLevel = getConfig().logLevel) {}

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log('error', message, meta);
  }

  child(name: string): Logger {
    return new Logger(`${this.name}:${name}`, this.minLevel);
  }

  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (weights[level] < weights[this.minLevel]) {
      return;
    }

    const payload = {
      timestamp: new Date().toISOString(),
      level,
      logger: this.name,
      message,
      ...meta
    };

    const serialized = JSON.stringify(payload);
    console.error(serialized);
  }
}

export const rootLogger = new Logger('gdelt-xmtp-news-bot');
