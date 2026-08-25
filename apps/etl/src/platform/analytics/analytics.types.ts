// Shared with the product-analytics contract — the lookups that resolve a
// subscriber need these before the capture layer sees them.
export type SubscriptionKind = "feed" | "cv";
export type OutboundSurface = "web_feed" | "telegram_digest";
