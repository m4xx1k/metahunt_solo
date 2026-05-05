import { Injectable, Inject } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

@Injectable()
export class CompanyResolverService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async resolve(sourceId: string, rawName: string): Promise<string> {
    const sourceCompanyName = rawName.trim();
    const identifierHits = await this.db
      .select({ companyId: schema.companyIdentifiers.companyId })
      .from(schema.companyIdentifiers)
      .where(
        and(
          eq(schema.companyIdentifiers.sourceId, sourceId),
          eq(
            schema.companyIdentifiers.sourceCompanyName,
            sourceCompanyName,
          ),
        ),
      );
    if (identifierHits.length > 0) return identifierHits[0].companyId;

    const slug = slugify(sourceCompanyName);

    const slugHits = await this.db
      .select({ id: schema.companies.id })
      .from(schema.companies)
      .where(eq(schema.companies.slug, slug));

    let companyId: string;
    if (slugHits.length > 0) {
      companyId = slugHits[0].id;
    } else {
      const inserted = await this.db
        .insert(schema.companies)
        .values({ name: sourceCompanyName, slug })
        .onConflictDoNothing()
        .returning({ id: schema.companies.id });

      if (inserted.length > 0) {
        companyId = inserted[0].id;
      } else {
        const [existing] = await this.db
          .select({ id: schema.companies.id })
          .from(schema.companies)
          .where(eq(schema.companies.slug, slug));
        companyId = existing.id;
      }
    }

    await this.db
      .insert(schema.companyIdentifiers)
      .values({ sourceId, sourceCompanyName, companyId })
      .onConflictDoNothing();

    return companyId;
  }
}

export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
