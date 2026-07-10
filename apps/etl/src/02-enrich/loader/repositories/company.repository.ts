import { Injectable, Inject } from "@nestjs/common";

import { and, eq } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import type { Executor } from "./executor";

// Thin DB gateway for company resolution. Keeps Drizzle out of
// CompanyResolverService so the resolve-or-create logic is unit-testable
// against a mocked repository instead of a mocked query-builder chain.
// The abstract class doubles as the Nest DI token (see LoaderModule).
// Every method takes an optional Executor so resolution can run inside the
// vacancy-load transaction (defaults to the root db handle otherwise).
export abstract class CompanyRepository {
  abstract findIdByIdentifier(
    sourceId: string,
    sourceCompanyName: string,
    executor?: Executor,
  ): Promise<string | null>;
  abstract findIdBySlug(slug: string, executor?: Executor): Promise<string | null>;
  // Insert with ON CONFLICT DO NOTHING; returns the new id, or null when a
  // concurrent insert won the race (RETURNING yields no row).
  abstract insertReturningId(
    name: string,
    slug: string,
    executor?: Executor,
  ): Promise<string | null>;
  abstract linkIdentifier(
    sourceId: string,
    sourceCompanyName: string,
    companyId: string,
    executor?: Executor,
  ): Promise<void>;
}

@Injectable()
export class DrizzleCompanyRepository extends CompanyRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {
    super();
  }

  async findIdByIdentifier(
    sourceId: string,
    sourceCompanyName: string,
    executor: Executor = this.db,
  ): Promise<string | null> {
    const hits = await executor
      .select({ companyId: schema.companyIdentifiers.companyId })
      .from(schema.companyIdentifiers)
      .where(
        and(
          eq(schema.companyIdentifiers.sourceId, sourceId),
          eq(schema.companyIdentifiers.sourceCompanyName, sourceCompanyName),
        ),
      );
    return hits[0]?.companyId ?? null;
  }

  async findIdBySlug(slug: string, executor: Executor = this.db): Promise<string | null> {
    const hits = await executor
      .select({ id: schema.companies.id })
      .from(schema.companies)
      .where(eq(schema.companies.slug, slug));
    return hits[0]?.id ?? null;
  }

  async insertReturningId(
    name: string,
    slug: string,
    executor: Executor = this.db,
  ): Promise<string | null> {
    const inserted = await executor
      .insert(schema.companies)
      .values({ name, slug })
      .onConflictDoNothing()
      .returning({ id: schema.companies.id });
    return inserted[0]?.id ?? null;
  }

  async linkIdentifier(
    sourceId: string,
    sourceCompanyName: string,
    companyId: string,
    executor: Executor = this.db,
  ): Promise<void> {
    await executor
      .insert(schema.companyIdentifiers)
      .values({ sourceId, sourceCompanyName, companyId })
      .onConflictDoNothing();
  }
}
