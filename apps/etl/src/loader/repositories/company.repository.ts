import { Injectable, Inject } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

// Thin DB gateway for company resolution. Keeps Drizzle out of
// CompanyResolverService so the resolve-or-create logic is unit-testable
// against a mocked repository instead of a mocked query-builder chain.
// The abstract class doubles as the Nest DI token (see LoaderModule).
export abstract class CompanyRepository {
  abstract findIdByIdentifier(
    sourceId: string,
    sourceCompanyName: string,
  ): Promise<string | null>;
  abstract findIdBySlug(slug: string): Promise<string | null>;
  // Insert with ON CONFLICT DO NOTHING; returns the new id, or null when a
  // concurrent insert won the race (RETURNING yields no row).
  abstract insertReturningId(
    name: string,
    slug: string,
  ): Promise<string | null>;
  abstract linkIdentifier(
    sourceId: string,
    sourceCompanyName: string,
    companyId: string,
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
  ): Promise<string | null> {
    const hits = await this.db
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

  async findIdBySlug(slug: string): Promise<string | null> {
    const hits = await this.db
      .select({ id: schema.companies.id })
      .from(schema.companies)
      .where(eq(schema.companies.slug, slug));
    return hits[0]?.id ?? null;
  }

  async insertReturningId(name: string, slug: string): Promise<string | null> {
    const inserted = await this.db
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
  ): Promise<void> {
    await this.db
      .insert(schema.companyIdentifiers)
      .values({ sourceId, sourceCompanyName, companyId })
      .onConflictDoNothing();
  }
}
