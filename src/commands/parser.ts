import type { ParsedCommand } from '../types.js';
import { normalizeWhitespace } from '../utils/text.js';

const GREETINGS = new Set([
  'hi',
  'hi there',
  'hello',
  'hello there',
  'hey',
  'hey there',
  'hey bot',
  'gm',
  'good morning',
  'good afternoon',
  'good evening'
]);

export function parseCommand(input: string): ParsedCommand {
  const raw = input;
  const trimmed = normalizeWhitespace(input);
  const lower = trimmed.toLowerCase();
  const conversational = lower.replace(/[.!?,;:]+/gu, '').trim();

  if (!trimmed || lower === 'help') {
    return { kind: 'help', raw };
  }

  if (GREETINGS.has(conversational)) {
    return { kind: 'greeting', raw };
  }

  if (lower === 'digest') {
    return { kind: 'digest', raw };
  }

  if (lower === 'latest') {
    return { kind: 'latest', raw };
  }

  if (lower === 'list subscriptions' || lower === 'subscriptions') {
    return { kind: 'list-subscriptions', raw };
  }

  if (lower.startsWith('news ')) {
    return { kind: 'news', raw, topic: trimmed.slice(5).trim(), implicit: false };
  }

  if (lower.startsWith('subscribe ')) {
    return { kind: 'subscribe', raw, topic: trimmed.slice(10).trim() };
  }

  if (lower.startsWith('unsubscribe ')) {
    return { kind: 'unsubscribe', raw, topic: trimmed.slice(12).trim() };
  }

  return { kind: 'news', raw, topic: trimmed, implicit: true };
}
