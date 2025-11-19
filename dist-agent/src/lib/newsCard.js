"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NewsCardSchema = void 0;
exports.formatNewsCardFallback = formatNewsCardFallback;
// JSON Schema describing the NewsCard content type.
// This can be shared between backend services and the frontend.
exports.NewsCardSchema = {
    $id: 'https://newz.bot/schemas/news-card.json',
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'NewsCard',
    type: 'object',
    properties: {
        id: { type: 'string' },
        headline: { type: 'string' },
        summary: { type: 'string' },
        sentiment: { enum: ['positive', 'neutral', 'negative'] },
        tags: {
            type: 'array',
            items: { type: 'string' },
            default: [],
        },
        url: { type: 'string', format: 'uri' },
        image: { type: 'string', format: 'uri' },
        timestamp: { type: 'string', format: 'date-time' },
    },
    required: ['id', 'headline', 'summary', 'sentiment', 'tags', 'url', 'timestamp'],
    additionalProperties: false,
};
// Fallback text for clients that do not understand the NewsCard codec.
// Example: "📰 Ethereum ETFs approved (View: newz.bot)"
function formatNewsCardFallback(card) {
    const base = card.headline.trim() || 'News item';
    return `📰 ${base} (View: newz.bot)`;
}
