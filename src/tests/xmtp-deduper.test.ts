import assert from 'node:assert/strict';
import test from 'node:test';
import { RecentMessageDeduper, buildMessageKey } from '../xmtp/messageDeduper.js';

test('builds a stable key from message id when available', () => {
  assert.equal(
    buildMessageKey({
      id: 'msg-123',
      conversationId: 'c1',
      senderInboxId: 'u1',
      sentAtNs: 123n,
      content: 'news fbi'
    }),
    'id:msg-123'
  );
});

test('marks duplicate XMTP message deliveries as duplicates', () => {
  const deduper = new RecentMessageDeduper();
  const message = {
    id: 'msg-123',
    conversationId: 'c1',
    senderInboxId: 'u1',
    sentAtNs: 123n,
    content: 'news fbi'
  };

  assert.equal(deduper.markSeen(message).duplicate, false);
  assert.equal(deduper.markSeen(message).duplicate, true);
});

test('falls back to conversation, sender, timestamp, and content when id is missing', () => {
  const message = {
    conversationId: 'c1',
    senderInboxId: 'u1',
    sentAtNs: 123n,
    content: 'news fbi'
  };

  assert.equal(buildMessageKey(message), 'c1:u1:123:news fbi');
});
