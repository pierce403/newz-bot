import { createApp } from './app/bootstrap.js';

function parseArgs(argv: string[]): { userId: string; text: string } {
  let userId = 'cli-user';
  const pieces: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]!;
    if (value === '--user' && argv[index + 1]) {
      userId = argv[index + 1]!;
      index += 1;
      continue;
    }

    if (value.startsWith('--user=')) {
      userId = value.slice('--user='.length);
      continue;
    }

    pieces.push(value);
  }

  return {
    userId,
    text: pieces.join(' ').trim()
  };
}

async function main(): Promise<void> {
  const { userId, text } = parseArgs(process.argv.slice(2));
  const { app } = createApp();
  const reply = await app.handleMessage(userId, text || 'help');
  console.log(reply);
}

void main();

