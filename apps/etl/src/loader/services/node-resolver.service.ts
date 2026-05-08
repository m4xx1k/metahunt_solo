import { Injectable, Inject } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

export type NodeTypeValue = "ROLE" | "SKILL" | "DOMAIN";

@Injectable()
export class NodeResolverService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async resolve(type: NodeTypeValue, name: string): Promise<string> {
    const trimmed = name.trim();
    const normalized = trimmed.toLowerCase();

    const aliasHits = await this.db
      .select({ nodeId: schema.nodeAliases.nodeId })
      .from(schema.nodeAliases)
      .where(
        and(
          eq(schema.nodeAliases.name, normalized),
          eq(schema.nodeAliases.type, type),
        ),
      );
    if (aliasHits.length > 0) return aliasHits[0].nodeId;

    const inserted = await this.db
      .insert(schema.nodes)
      .values({ type, canonicalName: trimmed, status: "NEW" })
      .onConflictDoNothing()
      .returning({ id: schema.nodes.id });

    let nodeId: string;
    if (inserted.length > 0) {
      nodeId = inserted[0].id;
    } else {
      const [existing] = await this.db
        .select({ id: schema.nodes.id })
        .from(schema.nodes)
        .where(
          and(
            eq(schema.nodes.type, type),
            eq(schema.nodes.canonicalName, trimmed),
          ),
        );
      nodeId = existing.id;
    }

    await this.db
      .insert(schema.nodeAliases)
      .values({ name: normalized, type, nodeId })
      .onConflictDoNothing();

    return nodeId;
  }
}
