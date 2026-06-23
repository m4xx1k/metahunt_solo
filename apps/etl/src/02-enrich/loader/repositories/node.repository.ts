import { Injectable, Inject } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB, NodeType } from "@metahunt/database";

import type { Executor } from "./executor";

// Thin DB gateway for taxonomy-node resolution. Mirrors CompanyRepository:
// the resolve-or-create + race-recovery logic lives in NodeResolverService,
// the SQL lives here. Abstract class doubles as the Nest DI token. Methods
// take an optional Executor so resolution can join the vacancy-load tx.
export abstract class NodeRepository {
  abstract findIdByAlias(
    type: NodeType,
    normalizedName: string,
    executor?: Executor,
  ): Promise<string | null>;
  // Insert with ON CONFLICT DO NOTHING; returns the new id, or null when a
  // concurrent insert won the race (RETURNING yields no row).
  abstract insertReturningId(
    type: NodeType,
    canonicalName: string,
    executor?: Executor,
  ): Promise<string | null>;
  abstract findIdByCanonical(
    type: NodeType,
    canonicalName: string,
    executor?: Executor,
  ): Promise<string | null>;
  abstract linkAlias(
    name: string,
    type: NodeType,
    nodeId: string,
    executor?: Executor,
  ): Promise<void>;
}

@Injectable()
export class DrizzleNodeRepository extends NodeRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {
    super();
  }

  async findIdByAlias(
    type: NodeType,
    normalizedName: string,
    executor: Executor = this.db,
  ): Promise<string | null> {
    const hits = await executor
      .select({ nodeId: schema.nodeAliases.nodeId })
      .from(schema.nodeAliases)
      .where(
        and(
          eq(schema.nodeAliases.name, normalizedName),
          eq(schema.nodeAliases.type, type),
        ),
      );
    return hits[0]?.nodeId ?? null;
  }

  async insertReturningId(
    type: NodeType,
    canonicalName: string,
    executor: Executor = this.db,
  ): Promise<string | null> {
    const inserted = await executor
      .insert(schema.nodes)
      .values({ type, canonicalName, status: "NEW" })
      .onConflictDoNothing()
      .returning({ id: schema.nodes.id });
    return inserted[0]?.id ?? null;
  }

  async findIdByCanonical(
    type: NodeType,
    canonicalName: string,
    executor: Executor = this.db,
  ): Promise<string | null> {
    const hits = await executor
      .select({ id: schema.nodes.id })
      .from(schema.nodes)
      .where(
        and(
          eq(schema.nodes.type, type),
          eq(schema.nodes.canonicalName, canonicalName),
        ),
      );
    return hits[0]?.id ?? null;
  }

  async linkAlias(
    name: string,
    type: NodeType,
    nodeId: string,
    executor: Executor = this.db,
  ): Promise<void> {
    await executor
      .insert(schema.nodeAliases)
      .values({ name, type, nodeId })
      .onConflictDoNothing();
  }
}
