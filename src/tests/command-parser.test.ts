import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCommand } from '../commands/parser.js';

test('parses explicit news command', () => {
  assert.deepEqual(parseCommand('news semiconductor supply chain'), {
    kind: 'news',
    raw: 'news semiconductor supply chain',
    topic: 'semiconductor supply chain',
    implicit: false
  });
});

test('parses subscribe command', () => {
  assert.deepEqual(parseCommand('subscribe ai safety'), {
    kind: 'subscribe',
    raw: 'subscribe ai safety',
    topic: 'ai safety'
  });
});

test('parses greeting without falling through to news', () => {
  assert.deepEqual(parseCommand('hi'), {
    kind: 'greeting',
    raw: 'hi'
  });
});

test('parses conversational greeting with punctuation', () => {
  assert.deepEqual(parseCommand('Hello there.'), {
    kind: 'greeting',
    raw: 'Hello there.'
  });
});

test('falls back to implicit news query', () => {
  assert.deepEqual(parseCommand('chip exports'), {
    kind: 'news',
    raw: 'chip exports',
    topic: 'chip exports',
    implicit: true
  });
});
