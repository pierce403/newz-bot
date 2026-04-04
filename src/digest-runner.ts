import type { Transport } from './types.js';
import { createApp } from './app/bootstrap.js';

class ConsoleTransport implements Transport {
  async sendMessage(userId: string, text: string): Promise<void> {
    console.log(`\n=== Digest for ${userId} ===\n`);
    console.log(text);
  }
}

async function main(): Promise<void> {
  const { digestService } = createApp();
  await digestService.runAll(new ConsoleTransport());
}

void main();

