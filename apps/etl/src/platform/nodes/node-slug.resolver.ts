import { Inject, Injectable } from "@nestjs/common";

import { and, eq, inArray } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB, NodeType } from "@metahunt/database";

import { isUuid } from "../shared/query-parsing";

// Maps URL-facing node slugs (?roles=backend-engineer) back to node UUIDs at the
// API boundary — so every downstream query, the stored subscription rows, and
// the digest replay keep operating on ids unchanged. Unknown slugs are dropped
// (a value that matches no current slug can't name a node); a value that is
// already a UUID passes through (legacy links / the pre-backfill window).
@Injectable()
export class NodeSlugResolver {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async toIds(type: NodeType, slugs: string[] | undefined): Promise<string[] | undefined> {
    if (!slugs || slugs.length === 0) return slugs;
    const rows = await this.db
      .select({ id: schema.nodes.id, slug: schema.nodes.slug })
      .from(schema.nodes)
      .where(and(eq(schema.nodes.type, type), inArray(schema.nodes.slug, slugs)));
    const bySlug = new Map<string, string>();
    for (const r of rows) if (r.slug) bySlug.set(r.slug, r.id);
    return slugs
      .map((s) => bySlug.get(s) ?? (isUuid(s) ? s : null))
      .filter((v): v is string => v !== null);
  }

  // Single-value convenience for the legacy `?role=` scalar.
  async toId(type: NodeType, slug: string | undefined): Promise<string | undefined> {
    if (!slug) return slug;
    return (await this.toIds(type, [slug]))?.[0];
  }
}
