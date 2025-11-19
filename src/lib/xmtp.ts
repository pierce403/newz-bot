// Placeholder types and helpers for future XMTP integration.
// In later phases, this module should be replaced with real XMTP wiring
// using @xmtp/xmtp-js, ethers, and thirdweb.

export const ContentTypeNewsCard = {
  authorityId: 'newz.bot',
  typeId: 'news-card',
  version: '1.0',
};

export interface EncodedNewsCard {
  type: typeof ContentTypeNewsCard;
  // Raw JSON payload to be validated against NewsCardSchema.
  content: unknown;
  // Precomputed fallback string for non-aware clients.
  contentFallback: string;
}

