import { Module } from "@nestjs/common";

import { NodeSlugResolver } from "./node-slug.resolver";

// Shared provider: the slug->id boundary resolver, consumed by the feed,
// ranking, cv, and subscription entry points. DRIZZLE is global, so this module
// only wires the resolver itself.
@Module({
  providers: [NodeSlugResolver],
  exports: [NodeSlugResolver],
})
export class NodeSlugModule {}
