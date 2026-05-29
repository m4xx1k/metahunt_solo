import { Injectable } from "@nestjs/common";

import { CompanyRepository } from "../repositories/company.repository";
import type { Executor } from "../repositories/executor";

@Injectable()
export class CompanyResolverService {
  constructor(private readonly repo: CompanyRepository) {}

  // `executor` lets the caller run this inside the vacancy-load transaction;
  // omitted, the repository falls back to the root db handle.
  async resolve(
    sourceId: string,
    rawName: string,
    executor?: Executor,
  ): Promise<string> {
    const sourceCompanyName = rawName.trim();

    const byIdentifier = await this.repo.findIdByIdentifier(
      sourceId,
      sourceCompanyName,
      executor,
    );
    if (byIdentifier) return byIdentifier;

    const slug = slugify(sourceCompanyName);

    // resolve-or-create with race recovery: try existing slug, else insert,
    // else re-read (a concurrent insert won and RETURNING came back empty).
    let companyId = await this.repo.findIdBySlug(slug, executor);
    if (!companyId) {
      companyId =
        (await this.repo.insertReturningId(
          sourceCompanyName,
          slug,
          executor,
        )) ?? (await this.repo.findIdBySlug(slug, executor));
    }
    if (!companyId) {
      throw new Error(`failed to resolve company for slug "${slug}"`);
    }

    await this.repo.linkIdentifier(
      sourceId,
      sourceCompanyName,
      companyId,
      executor,
    );
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
