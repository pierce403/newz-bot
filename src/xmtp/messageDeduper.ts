const DEFAULT_TTL_MS = 30 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 2048;

export interface XmtpMessageLike {
  id?: string;
  conversationId?: string;
  senderInboxId?: string;
  sentAtNs?: bigint;
  content?: unknown;
}

export class RecentMessageDeduper {
  private readonly seenAtByKey = new Map<string, number>();

  constructor(
    private readonly ttlMs = DEFAULT_TTL_MS,
    private readonly maxEntries = DEFAULT_MAX_ENTRIES
  ) {}

  markSeen(message: XmtpMessageLike): { duplicate: boolean; key: string } {
    const key = buildMessageKey(message);
    const now = Date.now();

    this.evictExpired(now);

    const seenAt = this.seenAtByKey.get(key);
    if (seenAt !== undefined && now - seenAt <= this.ttlMs) {
      return { duplicate: true, key };
    }

    this.seenAtByKey.set(key, now);
    this.trimToSize();

    return { duplicate: false, key };
  }

  private evictExpired(now: number): void {
    for (const [key, seenAt] of this.seenAtByKey) {
      if (now - seenAt > this.ttlMs) {
        this.seenAtByKey.delete(key);
      }
    }
  }

  private trimToSize(): void {
    while (this.seenAtByKey.size > this.maxEntries) {
      const oldestKey = this.seenAtByKey.keys().next().value;
      if (!oldestKey) {
        return;
      }
      this.seenAtByKey.delete(oldestKey);
    }
  }
}

export function buildMessageKey(message: XmtpMessageLike): string {
  if (typeof message.id === 'string' && message.id.trim()) {
    return `id:${message.id}`;
  }

  const sentAtNs =
    typeof message.sentAtNs === 'bigint'
      ? message.sentAtNs.toString()
      : String(message.sentAtNs || 'unknown');
  const content = typeof message.content === 'string' ? message.content.trim() : '';

  return [
    message.conversationId || 'unknown-conversation',
    message.senderInboxId || 'unknown-sender',
    sentAtNs,
    content
  ].join(':');
}
